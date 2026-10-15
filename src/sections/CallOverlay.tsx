import { useCallBackground, callTileBackground } from '@/lib/call-background';
import { getShareSettings, setShareSettings, applyShareSettings } from '@/lib/share-settings';
import { useRef, useEffect, useState, useMemo } from 'react';
import { useSpeakingUsers } from '@/hooks/use-speaking-users';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Signal,
  Settings2,
  Headphones,
  HeadphoneOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CallSettingsDialog } from '@/components/CallSettingsDialog';

import type { PublicUser, RemoteMedia } from '@/types';

interface IncomingCall {
  from: string;
  kind: 'voice' | 'video';
}

interface ActiveCall {
  peerId: string;
  kind: 'voice' | 'video';
  pc: RTCPeerConnection;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteMedia?: RemoteMedia;
  isOfferer: boolean;
  connected: boolean;
}

interface CallOverlayProps {
  incomingCall: IncomingCall | null;
  activeCall: ActiveCall | null;
  callerName: string | null;
  remoteUser?: PublicUser | null;
  currentUserId?: string;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onLocalVideoStreamChange: (kind: 'camera' | 'screen', stream: MediaStream | null) => void;
  onAudioDeviceChange: (id: string) => void;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}

function useDurationTimer(active: boolean): string {
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      startTimeRef.current = null;
      return;
    }
    startTimeRef.current = Date.now();
    const id = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => {
      clearInterval(id);
      startTimeRef.current = null;
    };
  }, [active]);

  const displayElapsed = active ? elapsed : 0;
  const h = Math.floor(displayElapsed / 3600);
  const m = Math.floor((displayElapsed % 3600) / 60);
  const s = displayElapsed % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function CallOverlay({
  incomingCall,
  activeCall,
  callerName,
  remoteUser,
  currentUserId,
  onAccept,
  onReject,
  onHangup,
  onLocalVideoStreamChange,
  onAudioDeviceChange,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
}: CallOverlayProps) {
  const speechStreams = useMemo(() => ({ [activeCall?.peerId || 'remote']: activeCall?.remoteMedia?.microphoneActive ? activeCall.remoteMedia.microphone : null, local: isMuted ? null : activeCall?.localStream }), [activeCall?.peerId, activeCall?.remoteMedia, activeCall?.localStream, isMuted]);
  const speaking = useSpeakingUsers(speechStreams);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const mainStageContainerRef = useRef<HTMLDivElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const callBackground = useCallBackground();
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    const minimize = () => setMinimized(true);
    window.addEventListener('tuga:call-minimize', minimize);
  return () => window.removeEventListener('tuga:call-minimize', minimize);
  }, []);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareQuality, setShareQuality] = useState<'720' | '1080' | '1440'>(() => getShareSettings().quality);
  const [shareFps, setShareFps] = useState<15 | 30 | 60>(() => getShareSettings().fps);
  useEffect(() => {
    setShareSettings({ quality: shareQuality, fps: shareFps });
    const track = screenStreamRef.current?.getVideoTracks()[0];
    if (track) void applyShareSettings(track).catch(() => undefined);
  }, [shareQuality, shareFps]);

  const [videoDeviceId, setVideoDeviceId] = useState(() => localStorage.getItem('melo.videoDevice') || '');
  const [audioDeviceId, setAudioDeviceId] = useState(() => localStorage.getItem('melo.audioDevice') || '');

  const duration = useDurationTimer(!!activeCall?.connected);

  async function changeCameraDevice(deviceId: string) {
    if (!cameraOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const previous = cameraStreamRef.current;
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      onLocalVideoStreamChange('camera', stream);
      previous?.getTracks().forEach((track) => track.stop());
    } catch {
      /* Conserva a câmara ativa se o dispositivo selecionado falhar */
    }
  }

  const remoteHasVideo = !!activeCall?.remoteStream?.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted);
  const activeLocalCamera = activeCall?.localStream?.getVideoTracks().some((track) => track.readyState === 'live')
    ? activeCall.localStream
    : null;
  const localCameraStream = cameraStream?.getVideoTracks().some((track) => track.readyState === 'live')
    ? cameraStream
    : activeLocalCamera;
  const cameraOn = !!localCameraStream;

  const remoteScreenActive = !!activeCall?.remoteMedia?.screenActive;
  const remoteScreenStream = activeCall?.remoteMedia?.screen;
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = activeCall?.remoteMedia?.camera ?? activeCall?.remoteStream ?? null;
    if (remoteScreenRef.current) remoteScreenRef.current.srcObject = remoteScreenStream ?? null;
  }, [activeCall?.remoteMedia, activeCall?.remoteStream, remoteScreenStream, screenSharing, remoteScreenActive, minimized]);

  useEffect(() => {
    const stream = cameraStream ?? activeCall?.localStream;
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [activeCall?.localStream, cameraOn, cameraStream, minimized, remoteHasVideo, remoteScreenActive, screenSharing]);

  useEffect(() => {
    const stream = screenStreamRef.current;
    if (screenVideoRef.current && stream) screenVideoRef.current.srcObject = stream;
  }, [screenSharing, minimized]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
    mountedRef.current = false;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    onLocalVideoStreamChange('camera', null);
    onLocalVideoStreamChange('screen', null);
    };
  }, [onLocalVideoStreamChange]);

  // Listener para eventos de fullscreen nativos
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const target = mainStageContainerRef.current || document.documentElement;
      target.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }

  async function toggleCamera() {
    if (!activeCall?.connected) return;
    setMediaError(null);
    if (cameraOn) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
      activeCall?.localStream?.getVideoTracks().forEach((track) => track.stop());
      onLocalVideoStreamChange('camera', null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      onLocalVideoStreamChange('camera', stream);
    } catch {
      setMediaError('Não foi possível aceder à câmara. Verifica as permissões do navegador.');
    }
  }

  async function toggleScreenShare() {
    if (!activeCall?.connected) return;
    setMediaError(null);
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      onLocalVideoStreamChange('screen', null);
      setScreenSharing(false);
      return;
    }
    try {
      const [width, height] =
        shareQuality === '720' ? [1280, 720] : shareQuality === '1440' ? [2560, 1440] : [1920, 1080];
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: shareFps, max: shareFps },
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
        },
        audio: true,
      });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      screenStreamRef.current = stream;
      onLocalVideoStreamChange('screen', stream);
      setScreenSharing(true);
      stream.getVideoTracks()[0].onended = () => {
        stream.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        onLocalVideoStreamChange('screen', null);
        setScreenSharing(false);
      };
    } catch {
      setMediaError('A partilha de ecrã foi cancelada ou não está disponível neste navegador.');
    }
  }

  const callUsersList: PublicUser[] = remoteUser
    ? [remoteUser]
    : activeCall?.peerId
    ? [{
        id: activeCall.peerId,
        username: callerName ?? 'utilizador',
        displayName: callerName ?? 'Utilizador',
        hue: 210,
        emoji: '🎙️',
        about: '',
        status: 'online',
        createdAt: 0,
        online: true,
      }]
    : [];

  if (activeCall && minimized) return <div className="fixed bottom-5 right-5 z-[70] flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-foreground shadow-2xl">
    <span className="size-2 rounded-full bg-emerald-500" /><span className="text-xs">{callerName} — {duration}</span>
    <Button size="icon" variant="ghost" aria-label="Reabrir chamada" onClick={() => setMinimized(false)}><Maximize2 className="size-4" /></Button>
    <Button size="icon" variant="destructive" aria-label="Terminar chamada" onClick={onHangup}><PhoneOff className="size-4" /></Button>
  </div>;
  return (
    <>
      {/* Diálogo de Chamada Recebida */}
      <Dialog open={!!incomingCall}>
        <DialogContent
          showCloseButton={false}
          className="max-w-xs p-6 rounded-3xl border-border bg-card text-card-foreground shadow-2xl"
        >
          <DialogHeader className="space-y-1.5 text-center">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
              {activeCall
                ? 'Mudar de chamada?'
                : incomingCall?.kind === 'video'
                ? 'Chamada de Vídeo Recebida'
                : 'Chamada de Voz Recebida'}
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground font-semibold">
              {activeCall
                ? `A chamada atual será terminada para atender ${callerName ?? 'esta pessoa'}.`
                : callerName ?? 'Utilizador Tuga'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex gap-2.5 sm:flex-row justify-center pt-3">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 rounded-xl font-medium text-xs h-9 shadow-xs"
              onClick={onReject}
            >
              <PhoneOff className="size-3.5 mr-1.5" />
              Recusar
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-xs h-9 shadow-xs"
              onClick={onAccept}
            >
              <Phone className="size-3.5 mr-1.5" />
              {activeCall ? 'Mudar e atender' : 'Atender'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Janela de Chamada Ativa */}
      {activeCall && (
        <div
          ref={mainStageContainerRef}
          className="fixed inset-0 z-50 flex select-none flex-col overflow-hidden bg-[#080809] text-white"
        >

          {/* Cabeçalho Superior da Chamada */}
          <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#101012]/80 px-5 backdrop-blur-2xl">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{callerName ?? 'Chamada direta'}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/50">
                <Signal className="size-3" />
                {activeCall.connected ? (
                  <>
                    Ligação direta <span className="px-1">·</span>
                    {duration}
                  </>
                ) : (
                  'A chamar…'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/60">
                {activeCall.kind === 'video' ? 'Vídeo' : 'Voz'}
              </span>

              {/* Botão de Ecrã Completo (Tela Cheia) */}
              <Button size="icon" variant="ghost" title="Minimizar chamada" aria-label="Minimizar chamada" onClick={() => setMinimized(true)} className="size-9 rounded-xl bg-white/5 text-white"><Minimize2 className="size-4" /></Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Sair de ecrã completo' : 'Ver em ecrã completo'}
                className="size-9 rounded-xl bg-white/[0.06] text-white/70 hover:bg-white/15"
              >
                {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
            </div>
          </header>

          {/* Área Principal de Vídeo / Partilha de Ecrã */}
          <main style={callTileBackground(callBackground, remoteUser?.bannerUrl, remoteUser?.bannerPosition ?? 50)} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.07),transparent_60%)]" />

            {screenSharing ? (
              <div className="relative size-full flex items-center justify-center">
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="relative max-h-full w-full rounded-2xl object-contain shadow-2xl"
                />
                <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center gap-2 text-xs font-semibold text-white shadow-lg">
                  <Monitor className="size-4 text-white/80" />
                  <span>A partilhar o teu ecrã</span>
                </div>
              </div>
            ) : remoteScreenActive ? (
              <div className="relative size-full flex items-center justify-center">
                <video ref={remoteScreenRef} autoPlay playsInline muted className="max-h-full w-full rounded-2xl object-contain" />
                <span className="absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1.5 text-xs">Ecrã de {callerName ?? 'Contacto'}</span>
              </div>
            ) : remoteHasVideo ? (
              <div data-speaking={speaking.has(activeCall.peerId)} className={`relative size-full flex items-center justify-center rounded-2xl transition-all ${speaking.has(activeCall.peerId) ? 'ring-2 ring-emerald-400/70' : ''}`}>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="relative max-h-full w-full rounded-2xl object-contain shadow-2xl"
                />
                <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center gap-2 text-xs font-semibold text-white shadow-lg">
                  <Monitor className="size-4 text-white/80" />
                  <span>Transmissão de {callerName ?? 'Contacto'}</span>
                </div>
              </div>
            ) : localCameraStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="relative max-h-full w-full rounded-2xl object-contain shadow-2xl"
              />
            ) : (
              <div className="relative flex flex-col items-center gap-5 text-center">
                <div data-speaking={speaking.has(activeCall.peerId)} className={`grid size-28 place-items-center overflow-hidden rounded-[34px] border bg-white/[0.06] text-4xl font-semibold shadow-2xl transition-all ${speaking.has(activeCall.peerId) ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-white/10'}`}>
                  {remoteUser?.avatarUrl ? <img src={remoteUser.avatarUrl} alt={callerName || 'Participante'} className="size-full object-cover" /> : (callerName ?? 'C').trim().slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{callerName ?? 'Chamada direta'}</h2>
                  <p className="mt-1 text-sm text-white/50">
                    {activeCall.connected
                      ? activeCall.kind === 'video'
                        ? 'A aguardar ligação de vídeo'
                        : 'Chamada de voz ligada'
                      : 'A aguardar resposta'}
                  </p>
                </div>
              </div>
            )}

            <div className="absolute bottom-5 right-5 flex gap-3">
              {(screenSharing || remoteScreenActive) && remoteHasVideo && <div data-speaking={speaking.has(activeCall.peerId)} className={`h-28 w-40 overflow-hidden rounded-2xl border bg-black transition-all ${speaking.has(activeCall.peerId) ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-white/15'}`}><video ref={remoteVideoRef} autoPlay playsInline muted className="size-full object-cover" /></div>}
              {localCameraStream && (remoteHasVideo || screenSharing || remoteScreenActive) && <div data-speaking={speaking.has('local')} className={`h-28 w-40 overflow-hidden rounded-2xl border bg-black transition-all ${speaking.has('local') ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-white/15'}`}><video ref={localVideoRef} autoPlay playsInline muted className="size-full object-cover" /></div>}
            </div>

            {mediaError && (
              <p
                role="alert"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-white/10 bg-black/80 px-4 py-2 text-xs text-white/80 shadow-xl"
              >
                {mediaError}
              </p>
            )}
          </main>

          {/* Barra Flutuante de Controlos Inferiores */}
          <div className="z-10 flex shrink-0 items-center justify-center px-4 pb-7 pt-3">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1a1e]/90 px-3 py-2.5 shadow-2xl backdrop-blur-2xl sm:gap-3 sm:px-4">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSettingsOpen(true)}
                title="Configurações da chamada e partilha de ecrã"
                className="size-10 rounded-full bg-white/[0.06] text-white/70 hover:bg-white/15"
              >
                <Settings2 className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className={`w-9 h-9 rounded-full ${
                  isMuted
                    ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
                onClick={onToggleMute}
                disabled={!activeCall.connected || (isMuted && isDeafened)}
                title={
                  isMuted && isDeafened
                    ? 'Desativa o ensurdecimento para ativar o microfone'
                    : isMuted
                    ? 'Ativar microfone'
                    : 'Silenciar microfone'
                }
              >
                {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={onToggleDeafen}
                aria-label={isDeafened ? 'Reativar som recebido' : 'Silenciar som recebido e microfone'}
                title={isDeafened ? 'Reativar som recebido' : 'Silenciar som recebido e microfone'}
                className={`size-10 rounded-full ${
                  isDeafened
                    ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                    : 'bg-white/[0.06] text-white/70 hover:bg-white/15'
                }`}
              >
                {isDeafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={toggleCamera}
                disabled={!activeCall.connected}
                aria-label={cameraOn ? 'Desligar câmara' : 'Ligar câmara'}
                title={cameraOn ? 'Desligar câmara' : 'Ligar câmara'}
                className={`size-10 rounded-full ${
                  cameraOn ? 'bg-white/15 text-white hover:bg-white/20' : 'bg-white/[0.06] text-white/70 hover:bg-white/15'
                }`}
              >
                {cameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={toggleScreenShare}
                disabled={!activeCall.connected}
                aria-label={screenSharing ? 'Parar partilha de ecrã' : 'Partilhar ecrã'}
                title={screenSharing ? 'Parar partilha de ecrã' : 'Partilhar ecrã'}
                className={`size-10 rounded-full ${
                  screenSharing ? 'bg-white text-black hover:bg-white/85' : 'bg-white/[0.06] text-white/70 hover:bg-white/15'
                }`}
              >
                {screenSharing ? <MonitorOff className="size-4" /> : <Monitor className="size-4" />}
              </Button>

              <Button
                size="icon"
                variant="destructive"
                className="w-9 h-9 rounded-full shadow-xs"
                onClick={onHangup}
                title="Terminar chamada"
              >
                <PhoneOff className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configurações da Chamada */}
      <CallSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        quality={shareQuality}
        setQuality={setShareQuality}
        fps={shareFps}
        setFps={setShareFps}
        videoDeviceId={videoDeviceId}
        setVideoDeviceId={setVideoDeviceId}
        audioDeviceId={audioDeviceId}
        setAudioDeviceId={setAudioDeviceId}
        onAudioDeviceChange={onAudioDeviceChange}
        onVideoDeviceChange={changeCameraDevice}
        callUsers={callUsersList}
        currentUserId={currentUserId}
      />
    </>
  );
}


