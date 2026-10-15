import { useCallBackground, callTileBackground } from '@/lib/call-background';
import { getShareSettings, setShareSettings, applyShareSettings } from '@/lib/share-settings';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useSpeakingUsers } from '@/hooks/use-speaking-users';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Users,
  Maximize2,
  Minimize2,
  Settings2,
  VolumeX,
  UserX,
  Headphones,
  HeadphoneOff,
} from 'lucide-react';
import type { PublicUser, MyProfile, Channel, Community, RemoteMedia } from '@/types';
import { Button } from '@/components/ui/button';
import { CallSettingsDialog } from '@/components/CallSettingsDialog';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ActionConfirmation, type ConfirmationAction } from '@/components/ActionConfirmation';
import { MediaVideo } from '@/components/MediaVideo';


interface CallStageProps {
  visible?: boolean;
  channel: Channel;
  communityName: string;
  community?: Community | null;
  members: string[]; // user IDs in voice channel
  allUsers: PublicUser[];
  profile: MyProfile;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleDeafen: () => void;
  onToggleMute: () => void;
  onLeave: () => void;
  remoteVideoStreams: Record<string, RemoteMedia>;
  voiceLocalStream: MediaStream | null;
  onLocalVideoStreamChange: (kind: 'camera' | 'screen', stream: MediaStream | null) => void;
  onAudioDeviceChange: (id: string) => void;
}

export function CallStage({
  visible = true,
  channel,
  communityName,
  community,
  members,
  allUsers,
  profile,
  isMuted,
  isDeafened,
  onToggleDeafen,
  onToggleMute,
  onLeave,
  remoteVideoStreams,
  voiceLocalStream,
  onLocalVideoStreamChange,
  onAudioDeviceChange,
}: CallStageProps) {
  const speechStreams = useMemo(() => ({ ...Object.fromEntries(Object.entries(remoteVideoStreams).map(([id, media]) => [id, media.microphoneActive ? media.microphone : null])), [profile.id]: isMuted ? null : voiceLocalStream }), [remoteVideoStreams, profile.id, isMuted, voiceLocalStream]);
  const speaking = useSpeakingUsers(speechStreams, visible);
  const callBackground = useCallBackground();
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null);
  const [screenPanelSize, setScreenPanelSize] = useState<'normal' | 'large' | 'hidden'>('normal');
  const [shareQuality, setShareQuality] = useState<'720' | '1080' | '1440'>(() => getShareSettings().quality);
  const [shareFps, setShareFps] = useState<15 | 30 | 60>(() => getShareSettings().fps);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const [videoDeviceId, setVideoDeviceId] = useState(() => localStorage.getItem('melo.videoDevice') || '');
  const [audioDeviceId, setAudioDeviceId] = useState(() => localStorage.getItem('melo.audioDevice') || '');

  // Permissões de moderação de voz
  const isGlobalAdmin = profile.globalRole === 'owner' || profile.globalRole === 'admin';
  const isServerOwner = community ? community.ownerId === profile.id : false;
  const isServerAdmin = community ? (isServerOwner || (community.admins || []).includes(profile.id)) : false;
  const userRoleIds = community?.memberRoles?.[profile.id] || [];
  const userRoles = (community?.roles || []).filter((r) => userRoleIds.includes(r.id));
  const canKickVoice =
    isGlobalAdmin ||
    isServerAdmin ||
    userRoles.some((r) => r.permissions?.administrator || r.permissions?.kickVoiceMembers || r.permissions?.kickMembers);
  const canMuteVoice =
    isGlobalAdmin ||
    isServerAdmin ||
    userRoles.some((r) => r.permissions?.administrator || r.permissions?.muteVoiceMembers || r.permissions?.kickVoiceMembers);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    setShareSettings({ quality: shareQuality, fps: shareFps });
    const track = screenStreamRef.current?.getVideoTracks()[0];
    if (track) void applyShareSettings(track).catch(() => undefined);
  }, [shareQuality, shareFps]);

  async function changeCameraDevice(deviceId: string) {
    if (!isCameraOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const previous = cameraStreamRef.current;
      cameraStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      onLocalVideoStreamChange('camera', stream);
      previous?.getTracks().forEach((track) => track.stop());
    } catch { toast.error('Não foi possível trocar a câmara. A câmara anterior continua ligada.'); }
  }

  // Toggle Camera
  async function toggleCamera() {
    if (isCameraOn) {
      if (cameraStreamRef.current) {
        onLocalVideoStreamChange('camera', null);
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      setIsCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true, audio: false });
        if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
        cameraStreamRef.current = stream;
        onLocalVideoStreamChange('camera', stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setIsCameraOn(true);
      } catch (err) {
        const code = err instanceof DOMException ? err.name : '';
        toast.error(code === 'NotAllowedError' ? 'A câmara não foi autorizada. Permite o acesso no navegador e tenta novamente.' : code === 'NotFoundError' ? 'Não foi encontrada uma câmara.' : 'Não foi possível ligar a câmara. Verifica o dispositivo selecionado.');
      }
    }
  }

  // Toggle Screen Sharing
  async function toggleScreenShare() {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        onLocalVideoStreamChange('screen', null);
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      if (spotlightUserId === profile.id) {
        setSpotlightUserId(null);
      }
    } else {
      try {
        const dimensions = shareQuality === '720' ? [1280, 720] : shareQuality === '1440' ? [2560, 1440] : [1920, 1080];
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: shareFps, max: shareFps }, width: { ideal: dimensions[0], max: dimensions[0] }, height: { ideal: dimensions[1], max: dimensions[1] } },
          audio: true,
        });
        if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
        screenStreamRef.current = stream;
        onLocalVideoStreamChange('screen', stream);
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }
        setIsScreenSharing(true);
        setSpotlightUserId(profile.id);

        stream.getVideoTracks()[0].onended = () => {
          stream.getTracks().forEach((track) => track.stop());
          onLocalVideoStreamChange('screen', null);
          setIsScreenSharing(false);
          screenStreamRef.current = null;
        };
      } catch (err) {
        if (!(err instanceof DOMException) || !['NotAllowedError', 'AbortError'].includes(err.name)) toast.error('Não foi possível iniciar a partilha de ecrã neste dispositivo.');
      }
    }
  }

  // Attach camera stream whenever component updates
  useEffect(() => {
    if (isCameraOn && localVideoRef.current && cameraStreamRef.current) {
      localVideoRef.current.srcObject = cameraStreamRef.current;
      if (visible) void localVideoRef.current.play().catch(() => undefined);
      else localVideoRef.current.pause();
    }
  }, [isCameraOn, visible]);

  // Attach screen stream whenever component updates
  useEffect(() => {
    if (isScreenSharing && screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
    }
    if (screenPanelSize === 'hidden' || !visible) screenVideoRef.current?.pause();
    else if (isScreenSharing) void screenVideoRef.current?.play().catch(() => undefined);
  }, [isScreenSharing, spotlightUserId, screenPanelSize, visible]);

  const presenters = Object.entries(remoteVideoStreams).filter(([, media]) => media.screenActive);
  const remotePresenter = presenters.find(([id]) => id === spotlightUserId) ?? presenters[0] ?? null;
  const remotePresenterStream = remotePresenter?.[1].screen ?? null;
  const showLocalScreen = isScreenSharing && (spotlightUserId === profile.id || !remotePresenter);
  const screenVisible = !!(showLocalScreen || remotePresenter) && screenPanelSize !== 'hidden';
  useEffect(() => {
    if (remoteScreenRef.current && remotePresenterStream) {
      remoteScreenRef.current.srcObject = remotePresenterStream;
      if (screenVisible && visible) void remoteScreenRef.current.play().catch(() => undefined);
      else remoteScreenRef.current.pause();
    }
  }, [remotePresenterStream, showLocalScreen, screenVisible, visible]);

  // Cleanup media streams on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onLocalVideoStreamChange('camera', null);
      onLocalVideoStreamChange('screen', null);
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onLocalVideoStreamChange]);

  // Fullscreen toggle
  useEffect(() => {
    const changed = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <div
      ref={containerRef}
      data-call-stage
      data-screen-visible={screenVisible}
      className="dark flex-1 flex flex-col h-full bg-neutral-950 text-foreground select-none relative overflow-hidden transition-colors duration-200"
    >
      {/* Top Bar / Header of Call */}
      <div className="h-14 px-5 border-b border-white/[0.08] bg-[#101014]/85 backdrop-blur-2xl flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white/70" />
            <h3 className="text-sm font-semibold text-white tracking-tight truncate">
              {channel.name}
            </h3>
          </div>
          <span className="text-[11px] font-medium text-neutral-400 hidden sm:inline px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10">
            {communityName}
          </span>
        </div>

        {/* Right Info: Participant count & fullscreen */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.05] border border-white/10 text-xs font-medium text-neutral-300">
            <Users className="size-3.5 text-neutral-400" />
            <span>{members.length} {members.length === 1 ? 'participante' : 'participantes'}</span>
          </div>

          <button
            onClick={toggleFullscreen}
            aria-label="Ecrã Completo"
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      {/* Main Video / Screen Share Stage */}
      <div className="flex-1 p-4 md:p-6 flex flex-col items-center justify-center overflow-y-auto">
        {/* If someone is sharing screen or spotlighted */}
        {(showLocalScreen || remotePresenter) && (
          <div className={`w-full mb-4 rounded-3xl bg-black border border-white/10 shadow-2xl relative overflow-hidden flex items-center justify-center transition-all duration-300 ${
            screenPanelSize === 'hidden'
              ? 'hidden'
              : screenPanelSize === 'large'
              ? 'max-w-full h-[65vh]'
              : 'max-w-3xl h-[38vh]'
          } shrink-0`}>
            <video
              ref={showLocalScreen ? screenVideoRef : remoteScreenRef}
              muted
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              {/* Shrink/Hide toggle */}
              <button
                type="button"
                onClick={() => setScreenPanelSize((s) => s === 'large' ? 'normal' : 'hidden')}
                className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-semibold text-white hover:bg-black/80 transition-colors flex items-center gap-1.5 shadow-lg"
                title={screenPanelSize === 'large' ? 'Reduzir' : 'Ocultar partilha'}
              >
                <Minimize2 className="size-3.5" />
                <span>{screenPanelSize === 'large' ? 'Reduzir' : 'Ocultar'}</span>
              </button>
              {/* Expand */}
              <button
                type="button"
                onClick={() => setScreenPanelSize('large')}
                disabled={screenPanelSize === 'large'}
                className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-semibold text-white hover:bg-black/80 transition-colors flex items-center gap-1.5 shadow-lg disabled:opacity-40"
                title="Expandir"
              >
                <Maximize2 className="size-3.5" />
                <span>Expandir</span>
              </button>
              {/* Fullscreen */}
              <button
                type="button"
                onClick={() => {
                  const el = showLocalScreen ? screenVideoRef.current : remoteScreenRef.current;
                  if (!document.fullscreenElement) {
                    el?.requestFullscreen?.().catch(() => {});
                  } else {
                    document.exitFullscreen?.().catch(() => {});
                  }
                }}
                className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-semibold text-white hover:bg-black/80 transition-colors flex items-center gap-1.5 shadow-lg"
                title="Ver partilha em ecrã completo"
              >
                <Maximize2 className="size-3.5" />
                <span>Ecrã completo</span>
              </button>
            </div>
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center gap-2 text-xs font-semibold text-white shadow-lg">
              <Monitor className="size-4 text-white/80" />
              <span>Em direto — {showLocalScreen ? profile.displayName : allUsers.find((user) => user.id === remotePresenter?.[0])?.displayName ?? 'Participante'}</span>
            </div>
          </div>
        )}

        {/* Floating pill to restore hidden screen share */}
        {(showLocalScreen || remotePresenter) && screenPanelSize === 'hidden' && (
          <div className="absolute top-16 right-4 z-10">
            <button
              type="button"
              onClick={() => setScreenPanelSize('normal')}
              className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-xs font-semibold text-white hover:bg-black/90 transition-colors flex items-center gap-1.5 shadow-lg"
            >
              <Monitor className="size-3.5" />
              <span>Mostrar partilha de ecrã</span>
            </button>
          </div>
        )}

        {/* Participants Video & Avatar Grid */}
        <div
          className={`w-full max-w-6xl grid gap-4 transition-all duration-300 ${
            screenVisible
              ? 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 h-36 shrink-0'
              : members.length <= 1
              ? 'grid-cols-1 max-w-md'
              : members.length === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : members.length <= 4
              ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
          }`}
        >
          {members.map((uid) => {
            const userObj = uid === profile.id ? profile : allUsers.find((u) => u.id === uid);
            if (!userObj) return null;
            const isMe = uid === profile.id;

            return (
              <div
                key={uid}
                data-speaking={speaking.has(uid) && !!speechStreams[uid]}
                data-participant={uid}
                style={callTileBackground(callBackground, userObj.bannerUrl, userObj.bannerPosition ?? 50)}
                className={`relative aspect-video rounded-3xl bg-[#141418] border flex flex-col items-center justify-center shadow-lg p-3 group overflow-hidden transition-all duration-200 ${speaking.has(uid) && speechStreams[uid] ? 'border-emerald-400 ring-2 ring-emerald-400/70 shadow-[0_0_18px_rgba(52,211,153,0.15)]' : 'border-white/[0.08] hover:border-white/20'}`}

              >
                {(isMe ? isScreenSharing : remoteVideoStreams[uid]?.screenActive) && <button type="button" onClick={() => { setSpotlightUserId(uid); setScreenPanelSize('normal'); }} className="absolute top-2 left-2 z-20 rounded-lg bg-black/70 px-2 py-1 text-xs text-white">Ver ecrã</button>}
                {/* Camera stays visible independently of the screen. */}
                {isMe && isCameraOn ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover rounded-3xl"
                  />
                ) : !isMe && remoteVideoStreams[uid]?.cameraActive ? (
                  <MediaVideo stream={remoteVideoStreams[uid].camera} visible={visible} className="absolute inset-0 h-full w-full rounded-3xl object-cover" />
                ) : (
                  <div className="flex flex-col items-center">
                    {/* Participant Avatar with custom image support */}
                    <div
                      className={`${screenVisible ? 'size-9 rounded-xl text-base mb-3' : 'w-16 h-16 sm:w-20 sm:h-20 rounded-2xl text-3xl mb-2.5'} flex items-center justify-center font-bold shadow-md overflow-hidden bg-cover bg-center border border-white/10`}
                      style={{
                        backgroundColor: `hsl(${userObj.hue}, 60%, 45%)`,
                        backgroundImage: userObj.avatarUrl ? `url(${userObj.avatarUrl})` : undefined,
                      }}
                    >
                      {!userObj.avatarUrl && userObj.displayName.trim().slice(0, 1).toUpperCase()}
                    </div>

                    <div className={`text-center ${screenVisible ? 'hidden' : ''}`}>
                      <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[150px] inline-block">
                        {userObj.displayName} {isMe && '(Tu)'}
                      </span>
                      {userObj.customStatus && (
                        <p className="text-[10px] text-neutral-400 truncate max-w-[140px]">
                          {userObj.customStatus}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Status Pills */}
                <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1.5 text-[10px] font-medium text-neutral-300">
                  <span className="truncate max-w-[120px]">{userObj.displayName}</span>
                </div>

                {/* Right Top Status & Moderation Controls */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {!isMe && (canMuteVoice || canKickVoice) && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur-md p-1 rounded-full border border-white/15 shadow-md">
                      {canMuteVoice && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void api.muteVoiceUserConfirmed(channel.id, uid, true).then(() => toast.success('Participante silenciado.')).catch(() => toast.error('Não foi possível silenciar esta pessoa.'));
                            
                          }}
                          className="p-1 rounded-full text-neutral-300 hover:text-amber-400 hover:bg-white/10 transition-colors"
                          title={`Silenciar @${userObj.username}`}
                        >
                          <VolumeX className="size-3.5" />
                        </button>
                      )}
                      {canKickVoice && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmation({ title: 'Remover participante da chamada?', description: `@${userObj.username} será desligado deste canal.`, execute: async () => { await api.kickVoiceUserConfirmed(channel.id, uid); toast.success('Participante desligado.'); } });
                          }}
                          className="p-1 rounded-full text-neutral-300 hover:text-red-400 hover:bg-white/10 transition-colors"
                          title={`Expulsar @${userObj.username} da chamada`}
                        >
                          <UserX className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1 text-[10px] text-neutral-300">
                    {isMe && isMuted ? (
                      <MicOff className="size-3 text-red-400" />
                    ) : (
                      <Mic className="size-3 text-white/80" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Call Action Bar (Apple Frosted Glass) */}
      <div className="p-4 flex items-center justify-center z-20">
        <div className="flex items-center gap-2 sm:gap-3 px-4 py-2.5 rounded-full bg-[#18181e]/90 border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          {/* Mute Button */}
          <Button
            size="icon"
            onClick={onToggleMute}
            className={`w-11 h-11 rounded-full transition-all ${
              isMuted
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isMuted ? 'Ativar Microfone' : 'Silenciar Microfone'}
          >
            {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </Button>

          {/* Camera Button */}
          <Button size="icon" onClick={onToggleDeafen} title={isDeafened ? 'Reativar som recebido' : 'Silenciar som e microfone'} className={`size-11 rounded-full ${isDeafened ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white'}`}>{isDeafened ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}</Button>
          <Button
            size="icon"
            onClick={toggleCamera}
            className={`w-11 h-11 rounded-full transition-all ${
              isCameraOn
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
          >
            {isCameraOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          </Button>

          {/* Screen Share Button */}
          <Button size="icon" variant="ghost" onClick={() => setSettingsOpen(true)} title="Configurações da chamada" className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20"><Settings2 className="size-4" /></Button>
          <Button
            size="icon"
            onClick={toggleScreenShare}
            className={`w-11 h-11 rounded-full transition-all ${
              isScreenSharing
                ? 'bg-primary text-white border border-primary/40 shadow-sm'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isScreenSharing ? 'Parar Partilha de Ecrã' : 'Partilhar Ecrã (Screen Share)'}
          >
            {isScreenSharing ? <MonitorOff className="size-5" /> : <Monitor className="size-5" />}
          </Button>

          {/* Disconnect Button */}
          <Button
            size="icon"
            variant="destructive"
            onClick={onLeave}
            className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md active:scale-95 transition-transform"
            title="Desconectar da Chamada"
          >
            <PhoneOff className="size-5" />
          </Button>
        </div>
      </div>
      <ActionConfirmation action={confirmation} onClose={() => setConfirmation(null)} />
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
        callUsers={allUsers.filter((u) => members.includes(u.id))}
        currentUserId={profile.id}
      />
    </div>
  );
}



