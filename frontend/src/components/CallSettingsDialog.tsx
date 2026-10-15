import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Monitor, Volume2, Mic, Video, Users } from 'lucide-react';
import { getScreenShareVolume, setScreenShareVolume, getUserVolume, setUserVolume, subscribeVolumeChange } from '@/lib/call-volume';
import type { PublicUser } from '@/types';
import { AudioControls } from '@/components/AudioControls';
import { createMicrophoneStream, stopTrack } from '@/lib/audio-settings';

type Quality = '720' | '1080' | '1440';
type Fps = 15 | 30 | 60;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quality: Quality;
  setQuality: (quality: Quality) => void;
  fps: Fps;
  setFps: (fps: Fps) => void;
  videoDeviceId: string;
  setVideoDeviceId: (id: string) => void;
  audioDeviceId: string;
  setAudioDeviceId: (id: string) => void;
  onAudioDeviceChange: (id: string) => void;
  onVideoDeviceChange: (id: string) => void;
  // Utilizadores presentes na chamada (opcional) para ajuste de volume individual
  callUsers?: PublicUser[];
  currentUserId?: string;
}

const dimensions: Record<Quality, [number, number]> = {
  '720': [1280, 720],
  '1080': [1920, 1080],
  '1440': [2560, 1440],
};

export function CallSettingsDialog(props: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const [meter, setMeter] = useState(0);
  const [screenTesting, setScreenTesting] = useState(false);
  const [screenVolume, setLocalScreenVolume] = useState(() => getScreenShareVolume());
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});

  const cameraRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const streams = useRef<MediaStream[]>([]);
  const animation = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const testGeneration = useRef(0);
  const timeout = useRef<number | null>(null);

  function stopTests() {
    testGeneration.current++;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = null;
    if (audioContext.current) {
      void audioContext.current.close();
      audioContext.current = null;
    }
    streams.current.forEach((stream) => stream.getTracks().forEach(stopTrack));
    streams.current = [];
    setMeter(0);
    setScreenTesting(false);
  }

  // Carrega volumes iniciais dos utilizadores quando a lista muda ou o modal abre
  useEffect(() => {
    return subscribeVolumeChange((id, volume) => {
      if (id === '__screenshare__') setLocalScreenVolume(volume);
      else setUserVolumes((previous) => ({ ...previous, [id]: volume }));
    });
  }, [props.open, props.callUsers, props.currentUserId]);

  useEffect(() => {
    if (!props.open) return;
    let current = true;
    const generationCounter = testGeneration;
    const cameraElement = cameraRef.current;
    const screenElement = screenRef.current;
    // Report the external browser capability when the dialog is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!navigator.mediaDevices?.enumerateDevices) { setError('O acesso aos dispositivos não está disponível. Abre o Tuga num endereço seguro e verifica as permissões.'); return; }
    void navigator.mediaDevices
      .enumerateDevices()
      .then((available) => {
        if (current) setDevices(available);
      })
      .catch(() => {
        if (current) setError('Não foi possível obter a lista de dispositivos.');
      });

    return () => {
      generationCounter.current++;
      current = false;
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      if (timeout.current !== null) window.clearTimeout(timeout.current);
      animation.current = null;
      timeout.current = null;
      if (audioContext.current) {
        void audioContext.current.close();
        audioContext.current = null;
      }
      streams.current.forEach((stream) => stream.getTracks().forEach(stopTrack));
      streams.current = [];
      if (cameraElement) cameraElement.srcObject = null;
      if (screenElement) screenElement.srcObject = null;
    };
  }, [props.open]);

  async function testMicrophone() {
    setError('');
    stopTests();
    const request = testGeneration.current;
    try {
      const stream = await createMicrophoneStream(props.audioDeviceId);
      if (request !== testGeneration.current) { stream.getTracks().forEach(stopTrack); return; }
      streams.current.push(stream);
      setDevices(await navigator.mediaDevices.enumerateDevices());
      if (request !== testGeneration.current) return;
      const context = new AudioContext();
      audioContext.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const read = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const delta = (sample - 128) / 128;
          sum += delta * delta;
        }
        setMeter(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 260)));
        animation.current = requestAnimationFrame(read);
      };
      read();
      timeout.current = window.setTimeout(() => stopTests(), 30_000);
    } catch {
      setError('O microfone não está disponível. Confirma a permissão do sistema.');
    }
  }

  async function testCamera() {
    setError('');
    stopTests();
    const request = testGeneration.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: props.videoDeviceId ? { deviceId: { exact: props.videoDeviceId } } : true,
        audio: false,
      });
      if (request !== testGeneration.current) { stream.getTracks().forEach(stopTrack); return; }
      streams.current.push(stream);
      setDevices(await navigator.mediaDevices.enumerateDevices());
      if (cameraRef.current) cameraRef.current.srcObject = stream;
    } catch {
      setError('A câmara não está disponível. Confirma a permissão do sistema.');
    }
  }

  async function testScreen() {
    setError('');
    stopTests();
    const request = testGeneration.current;
    try {
      const [width, height] = dimensions[props.quality];
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: props.fps, max: props.fps },
        },
        audio: true,
      });
      if (request !== testGeneration.current) { stream.getTracks().forEach(stopTrack); return; }
      streams.current.push(stream);
      setScreenTesting(true);
      if (screenRef.current) screenRef.current.srcObject = stream;
      stream.getVideoTracks()[0].onended = stopTests;
    } catch {
      setError('A partilha foi cancelada ou não está disponível neste sistema.');
    }
  }

  const handleScreenVolumeChange = (val: number[]) => {
    const v = val[0] ?? 100;
    setLocalScreenVolume(v);
    setScreenShareVolume(v);
  };

  const handleUserVolumeChange = (userId: string, val: number[]) => {
    const v = val[0] ?? 100;
    setUserVolumes((prev) => ({ ...prev, [userId]: v }));
    setUserVolume(userId, v);
  };

  const videoDevices = devices.filter((device) => device.kind === 'videoinput' && device.deviceId);
  const audioDevices = devices.filter((device) => device.kind === 'audioinput' && device.deviceId);
  const otherUsers = (props.callUsers || []).filter((u) => u.id !== props.currentUserId);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) stopTests();
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl border-border bg-card p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">
            Definições da chamada e partilha de ecrã
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configura a qualidade e fluidez da transmissão, ajusta o volume do ecrã e personaliza o som da voz de cada utilizador.
          </DialogDescription>
        </DialogHeader>
        <AudioControls />

        <div className="grid gap-5">
          {/* SECÇÃO 1: PARTILHA DE ECRÃ */}
          <section className="space-y-4 rounded-2xl border border-border bg-secondary/20 p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Monitor className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Partilha de ecrã</h3>
                <p className="text-[11px] text-muted-foreground">
                  Escolhe a resolução e os fotogramas por segundo que queres transmitir.
                  {' '}Em grupos maiores, o envio adapta-se para reduzir o consumo de recursos.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-xs font-medium">Resolução máxima</Label>
                <Select
                  value={props.quality}
                  onValueChange={(value) => props.setQuality(value as Quality)}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-border bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border">
                    <SelectItem value="720" className="rounded-lg text-xs">
                      720p — Menor consumo e alta estabilidade
                    </SelectItem>
                    <SelectItem value="1080" className="rounded-lg text-xs">
                      1080p Full HD — Qualidade equilibrada
                    </SelectItem>
                    <SelectItem value="1440" className="rounded-lg text-xs">
                      1440p 2K — Máximo detalhe e nitidez
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs font-medium">Taxa de fotogramas</Label>
                <Select
                  value={String(props.fps)}
                  onValueChange={(value) => props.setFps(Number(value) as Fps)}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-border bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border">
                    <SelectItem value="15" className="rounded-lg text-xs">
                      15 FPS — Poupança de rede e processador
                    </SelectItem>
                    <SelectItem value="30" className="rounded-lg text-xs">
                      30 FPS — Padrão suave
                    </SelectItem>
                    <SelectItem value="60" className="rounded-lg text-xs">
                      60 FPS — Movimento ultra fluido para jogos e vídeo
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Volume da partilha de ecrã */}
            <div className="space-y-2 rounded-xl border border-border/80 bg-background/80 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Volume2 className="size-3.5 text-primary" />
                  Volume do som da partilha de ecrã para ti
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{screenVolume}%</span>
              </div>
              <Slider
                value={[screenVolume]}
                min={0}
                max={200}
                step={1}
                onValueChange={handleScreenVolumeChange}
                className="py-1"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Silêncio (0%)</span>
                <span>Normal (100%)</span>
                <span>Amplificado (200%)</span>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-xl text-xs h-9"
              onClick={() => (screenTesting ? stopTests() : void testScreen())}
            >
              {screenTesting ? 'Parar teste de ecrã' : 'Testar partilha de ecrã'}
            </Button>
            {screenTesting && (
              <video
                ref={screenRef}
                autoPlay
                playsInline
                muted
                className="aspect-video max-h-56 w-full rounded-xl bg-black object-contain border border-border"
              />
            )}
          </section>

          {/* SECÇÃO 2: VOLUME INDIVIDUAL DOS OUTROS PARTICIPANTES */}
          {otherUsers.length > 0 && (
            <section className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Users className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Volume dos participantes na chamada
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Ajusta o nível de som da voz de cada pessoa apenas para ti.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                {otherUsers.map((user) => {
                  const vol = userVolumes[user.id] ?? getUserVolume(user.id);
                  return (
                    <div
                      key={user.id}
                      className="rounded-xl border border-border/80 bg-background/80 p-2.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="size-6 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold text-white bg-cover bg-center"
                            style={{
                              backgroundColor: `hsl(${user.hue}, 60%, 45%)`,
                              backgroundImage: user.avatarUrl ? `url(${user.avatarUrl})` : undefined,
                            }}
                          >
                            {!user.avatarUrl && user.displayName.slice(0, 1).toUpperCase()}
                          </div>
                          <span className="font-medium truncate text-foreground">
                            {user.displayName}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground truncate">
                            @{user.username}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0 ml-2">
                          {vol}%
                        </span>
                      </div>
                      <Slider
                        value={[vol]}
                        min={0}
                        max={200}
                        step={1}
                        onValueChange={(val) => handleUserVolumeChange(user.id, val)}
                        className="py-1"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* SECÇÃO 3: DISPOSITIVOS (MICROFONE & CÂMARA) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-4">
              <div className="flex items-center gap-1.5 text-foreground">
                <Mic className="size-3.5 text-primary" />
                <h3 className="text-xs font-semibold">Microfone</h3>
              </div>
              <Select
                value={props.audioDeviceId || 'default'}
                onValueChange={(value) => {
                  props.setAudioDeviceId(value);
                  localStorage.setItem('melo.audioDevice', value);
                  props.onAudioDeviceChange(value);
                }}
              >
                <SelectTrigger className="h-9 w-full rounded-xl border-border bg-background text-xs">
                  <SelectValue placeholder="Selecionar microfone" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border">
                  <SelectItem value="default" className="rounded-lg text-xs">Microfone predefinido</SelectItem>
                  {audioDevices.filter((device) => device.deviceId && device.deviceId !== 'default').map((device, index) => (
                    <SelectItem
                      key={device.deviceId}
                      value={device.deviceId}
                      className="rounded-lg text-xs"
                    >
                      {device.label || `Microfone ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full rounded-xl text-xs h-8"
                onClick={() => void testMicrophone()}
              >
                Testar microfone
              </Button>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width]"
                  style={{ width: `${meter}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">A barra reage ao som captado.</p>
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-4">
              <div className="flex items-center gap-1.5 text-foreground">
                <Video className="size-3.5 text-primary" />
                <h3 className="text-xs font-semibold">Câmara</h3>
              </div>
              <Select
                value={props.videoDeviceId || '__default_camera__'}
                onValueChange={(value) => {
                  const deviceId = value === '__default_camera__' ? '' : value;
                  props.setVideoDeviceId(deviceId);
                  localStorage.setItem('melo.videoDevice', deviceId);
                  props.onVideoDeviceChange(deviceId);
                }}
              >
                <SelectTrigger className="h-9 w-full rounded-xl border-border bg-background text-xs">
                  <SelectValue placeholder="Selecionar câmara" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border">
                  <SelectItem value="__default_camera__" className="rounded-lg text-xs">Câmara predefinida</SelectItem>
                  {videoDevices.filter((device) => device.deviceId).map((device, index) => (
                    <SelectItem
                      key={device.deviceId}
                      value={device.deviceId}
                      className="rounded-lg text-xs"
                    >
                      {device.label || `Câmara ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full rounded-xl text-xs h-8"
                onClick={() => void testCamera()}
              >
                Testar câmara
              </Button>
              <video
                ref={cameraRef}
                autoPlay
                playsInline
                muted
                className="aspect-video w-full rounded-xl bg-black object-cover max-h-28"
              />
            </section>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive mt-2"
          >
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

