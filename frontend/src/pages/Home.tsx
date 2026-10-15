import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { useChat } from '@/hooks/use-chat';
import { useIsMobile } from '@/hooks/use-mobile';
import { api } from '@/lib/api';
import { listenNotificationActions, type NotificationTarget } from '@/lib/notifications';
import { AuthForm } from '@/sections/AuthForm';
import { ServerRail } from '@/sections/ServerRail';
import { Sidebar } from '@/sections/Sidebar';
import { ChatPanel } from '@/sections/ChatPanel';
import type { SettingsSection, InstallPromptEvent } from '@/sections/SettingsPage';
import { Button } from '@/components/ui/button';

const SettingsPage = lazy(() =>
  import('@/sections/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const CallStage = lazy(() => import('@/sections/CallStage').then((module) => ({ default: module.CallStage })));
const CallOverlay = lazy(() => import('@/sections/CallOverlay').then((module) => ({ default: module.CallOverlay })));
const AdminPanel = lazy(() =>
  import('@/sections/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
const PublicServersView = lazy(() =>
  import('@/sections/PublicServersView').then((m) => ({ default: m.PublicServersView }))
);

export default function Home() {
  const {
    profile,
    users,
    blockedUsers,
    friendsState,
    conversations,
    activeUserId,
    setActiveUserId,
    communities,
    publicCommunities,
    activeCommunityId,
    setActiveCommunityId,
    activeChannelId,
    setActiveChannelId,
    channelMessages,
    voiceState,
    activeVoiceChannelId,
    pendingVoiceChannelId,
    isMuted,
    isDeafened,
    voiceError,
    voiceVideoStreams,
    voiceLocalStream,
    setVoiceVideoStream,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    changeAudioDevice,
    incomingCall,
    activeCall,
    setCallVideoStream,
    isConnected,
    typingFrom,
    sendMessage,
    sendTyping,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    logout,
  } = useChat();

  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isMobile || !sheetOpen) return;
    const frame = requestAnimationFrame(() => { if (!navigationRef.current?.contains(document.activeElement)) navigationRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [isMobile, sheetOpen]);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [settingsPageOpen, setSettingsPageOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('profile');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const available = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installed = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', installed); };
  }, []);

  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  function clearPanels() { setSettingsPageOpen(false); setAdminPanelOpen(false); setExploreOpen(false); setSheetOpen(false); }
  function handleLogout() { clearPanels(); setSessionTimedOut(false); logout(); }
  useEffect(() => { return api.on('err', ({ code }) => { if (code === 'session' || code === 'account_suspended') { setSettingsPageOpen(false); setAdminPanelOpen(false); setExploreOpen(false); setSheetOpen(false); } }); }, []);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (!profile || event.repeat || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'm' && event.shiftKey) { event.preventDefault(); toggleMute(); }
      else if (key === 'd' && event.shiftKey) { event.preventDefault(); toggleDeafen(); }
      else if (key === ',' && !event.shiftKey) { event.preventDefault(); setSettingsInitialSection('profile'); setSettingsPageOpen(true); }
      else if (key === 'k' && !event.shiftKey) {
        event.preventDefault();
        window.dispatchEvent(new Event('tuga:call-minimize'));
        setSettingsPageOpen(false); setAdminPanelOpen(false); setExploreOpen(false); setActiveCommunityId(null);
        if (isMobile) setSheetOpen(true);
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-tuga-search]')?.focus());
      }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [profile, toggleMute, toggleDeafen, isMobile, setActiveCommunityId]);
  useEffect(() => {
    const open = (event: Event) => {
      const target = (event as CustomEvent<NotificationTarget>).detail;
      if (target.peerId && users.some((user) => user.id === target.peerId)) { setActiveCommunityId(null); setActiveUserId(target.peerId); }
      else if (target.communityId && communities.some((community) => community.id === target.communityId && community.channels.some((channel) => channel.id === target.channelId))) { setActiveCommunityId(target.communityId); setActiveChannelId(target.channelId!); }
      setSettingsPageOpen(false); setAdminPanelOpen(false); setExploreOpen(false);
    };
    window.addEventListener('tuga:notification-open', open);
    return () => window.removeEventListener('tuga:notification-open', open);
  }, [users, communities, setActiveCommunityId, setActiveUserId, setActiveChannelId]);
  useEffect(() => {
    let alive = true;
    let stop = () => {};
    void listenNotificationActions().then((off) => { if (alive) stop = off; else off(); }).catch(() => undefined);
    return () => { alive = false; stop(); };
  }, []);

  // Safety timeout: se a sessão não responder após 10 segundos de tentativas de conexão, limpa e mostra formulário de login
  useEffect(() => {
    if (!profile && api.token && !isConnected) {
      const timer = setTimeout(() => {
        setSessionTimedOut(true);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [profile, isConnected]);

  // Otimização de RAM e CPU em segundo plano (Page Visibility API)
  useEffect(() => {
    function handleVisibilityChange() {
      const isHidden = document.visibilityState === 'hidden';
      document.documentElement.classList.toggle('app-background-idle', isHidden);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Show loading spinner if reconnecting existing session
  if (!profile && api.token && !isConnected && !sessionTimedOut) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground select-none p-4">
        <motion.div aria-hidden="true" className="absolute size-80 rounded-full bg-foreground/[0.035] blur-3xl" animate={{ scale: [0.94, 1.05, 0.94], opacity: [0.45, 0.8, 0.45] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div initial={{ opacity: 0, y: 12, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }} className="relative flex w-full max-w-sm flex-col items-center gap-5 rounded-[28px] border border-border/80 bg-card/80 p-9 text-center shadow-2xl backdrop-blur-2xl">
          <div className="relative grid size-14 place-items-center rounded-[18px] border border-border bg-background shadow-sm">
            <span className="size-2 rounded-full bg-foreground" />
            <motion.span className="absolute inset-1 rounded-[14px] border border-foreground/25" animate={{ scale: [0.82, 1.12], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold tracking-tight">A retomar a sessão</p>
            <p className="text-sm text-muted-foreground">A confirmar a tua ligação com segurança.</p>
          </div>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-secondary">
            <motion.div className="h-full w-1/3 rounded-full bg-foreground/75" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
          </div>
          <button
            onClick={() => {
              api.logout();
              setSessionTimedOut(true);
            }}
            className="mt-1 rounded-full px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Entrar com outra conta
          </button>
        </motion.div>
      </div>
    );
  }

  // Auth screen (no profile)
  if (!profile) {
    return <AuthForm />;
  }

  // Keep the communication stage mounted while settings or administration is open.
  let settingsView = null;
  let adminView = null;
  if (settingsPageOpen) {
    settingsView = (
      <Suspense
        fallback={
          <div className="h-screen w-screen bg-background flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground select-none">
            <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>A carregar definições...</span>
          </div>
        }
      >
        <SettingsPage
          installPrompt={installPrompt}
          onInstall={async () => { if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } }}
          profile={profile}
          users={users}
          communities={communities}
          blockedUsers={blockedUsers}
          onClose={() => setSettingsPageOpen(false)}
          onUpdateProfile={(patch) => api.updateProfile(patch)}
          onLogout={handleLogout}
          initialSection={settingsInitialSection}
          onOpenAdmin={() => {
            setSettingsPageOpen(false);
            setAdminPanelOpen(true);
          }}
        />
      </Suspense>
    );
  }

  if (adminPanelOpen && (profile.globalRole === 'owner' || profile.globalRole === 'admin')) {
    adminView = (
      <Suspense
        fallback={
          <div className="h-screen w-screen bg-background flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground select-none">
            <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>A carregar administração...</span>
          </div>
        }
      >
        <AdminPanel
          profile={profile}
          users={users}
          communities={communities}
          onClose={() => setAdminPanelOpen(false)}
          onEnterCommunity={(commId) => {
            setActiveCommunityId(commId);
            setActiveUserId(null);
            const comm = communities.find((c) => c.id === commId);
            if (comm && comm.channels.length > 0) {
              const firstText = comm.channels.find((c) => c.type === 'text') || comm.channels[0];
              setActiveChannelId(firstText.id);
            }
          }}
        />
      </Suspense>
    );
  }

  // Active items resolution
  const activeCommunity =
    communities.find((c) => c.id === activeCommunityId) ?? null;
  const activeChannel =
    activeCommunity?.channels.find((c) => c.id === activeChannelId) ?? null;
  const activeUser =
    users.find((u) => u.id === activeUserId) ?? null;
  const voiceCommunity = communities.find((community) => community.channels.some((channel) => channel.id === activeVoiceChannelId));
  const voiceChannel = voiceCommunity?.channels.find((channel) => channel.id === activeVoiceChannelId);
  const showVoiceStage = !!voiceChannel && activeChannelId === voiceChannel.id && activeCommunityId === voiceCommunity?.id && !exploreOpen;
  const currentDMMessages =
    conversations.get(activeUserId ?? '') ?? [];
  const currentChannelMessages =
    channelMessages.get(activeChannelId ?? '') ?? [];

  const callerName =
    incomingCall
      ? users.find((u) => u.id === incomingCall.from)?.displayName ?? incomingCall.from
      : activeCall
      ? users.find((u) => u.id === activeCall.peerId)?.displayName ?? activeCall.peerId
      : null;

  const sidebarContent = (
    <Sidebar
      groups={communities.filter((community) => community.directGroup && community.members.includes(profile.id))}
      users={users}
      friendsState={friendsState}
      blockedUsers={blockedUsers}
      conversations={conversations}
      profile={profile}
      activeUserId={activeUserId}
      onSelectUser={(id) => {
        setActiveCommunityId(null);
        setActiveUserId(id);
        setSheetOpen(false);
      }}
      onUpdateProfile={(patch) => api.updateProfile(patch)}
      onLogout={handleLogout}
      activeCommunity={activeCommunity?.directGroup ? null : activeCommunity}
      activeGroupId={activeCommunity?.directGroup ? activeCommunity.id : null}
      onSelectCommunity={(commId) => { setActiveCommunityId(commId || null); setActiveUserId(null); const community = communities.find((entry) => entry.id === commId); if (community) setActiveChannelId((community.channels.find((channel) => channel.type === 'text') || community.channels[0])?.id || null); setSheetOpen(false); }}
      activeChannelId={activeChannelId}
      onSelectChannel={(chanId) => {
        setActiveChannelId(chanId);
        setSheetOpen(false);
      }}
      voiceState={voiceState}
      activeVoiceChannelId={activeVoiceChannelId}
      pendingVoiceChannelId={pendingVoiceChannelId}
      onLeaveVoice={leaveVoiceChannel}
      isMuted={isMuted}
      isDeafened={isDeafened}
      onToggleMute={toggleMute}
      onToggleDeafen={toggleDeafen}
      voiceError={voiceError}
      onOpenSettings={(sec) => {
        setSettingsInitialSection(sec || 'profile');
        setSettingsPageOpen(true);
      }}
    />
  );

  return (
    <>
      <div className="app-main-layout flex h-screen w-screen bg-background text-foreground overflow-hidden select-none antialiased selection:bg-primary/15 transition-colors duration-200">
      {/* 1. Leftmost Server Rail (Discord server icons / DMs toggle) */}
      <ServerRail
        communities={communities}
        activeCommunityId={activeCommunityId}
        profile={profile}
        isExploreActive={exploreOpen}
        onOpenSettings={() => {
          setSettingsInitialSection('profile');
          setSettingsPageOpen(true);
        }}
        onOpenAdmin={() => setAdminPanelOpen(true)}
        onOpenExplore={() => {
          setExploreOpen(true);
          setActiveCommunityId(null);
          setActiveUserId(null);
          api.requestPublicCommunities();
        }}
        onSelectDM={() => {
          setExploreOpen(false);
          setActiveCommunityId(null);
          if (!activeUserId && users.length > 0) {
            const firstOther = users.find((u) => u.id !== profile.id);
            if (firstOther) setActiveUserId(firstOther.id);
          }
        }}
        onSelectCommunity={(commId) => {
          setExploreOpen(false);
          setActiveCommunityId(commId);
          setActiveUserId(null);
          const comm = communities.find((c) => c.id === commId);
          if (comm && comm.channels.length > 0) {
            const firstText = comm.channels.find((c) => c.type === 'text') || comm.channels[0];
            setActiveChannelId(firstText.id);
          }
        }}
      />

      {/* 2. Channel & DM Sidebar */}
      <aside
        ref={navigationRef}
        aria-label="Canais e mensagens"
        inert={isMobile && !sheetOpen}
        onKeyDown={(event) => {
          if (!isMobile || !sheetOpen || event.defaultPrevented) return;
          if (event.key === 'Escape') { event.preventDefault(); setSheetOpen(false); mobileMenuRef.current?.focus(); }
          if (event.key === 'Tab') {
            const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')].filter((node) => node.offsetParent !== null);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}
        className={`w-[250px] shrink-0 h-full bg-card border-r border-border flex flex-col overflow-hidden ${isMobile ? `fixed inset-y-0 left-0 z-[60] w-[270px] shadow-xl transition-transform duration-200 ${sheetOpen ? 'translate-x-0' : '-translate-x-full'}` : ''}`}
      >{sidebarContent}</aside>
      {isMobile && sheetOpen && <button aria-label="Fechar menu de canais e mensagens" onClick={() => { setSheetOpen(false); mobileMenuRef.current?.focus(); }} className="fixed inset-0 z-[55] bg-black/40" />}
      {isMobile && <Button ref={mobileMenuRef} variant="ghost" size="icon" aria-label="Abrir menu de canais e mensagens" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)} className="fixed top-3 left-20 z-50 h-9 w-9 rounded-xl bg-card border border-border shadow-xs text-foreground hover:bg-secondary"><Menu className="size-4" /></Button>}
      {/* 3. Main Stage (Public Servers Explorer, Channel Text Chat, Voice Lounge, or DMs) */}
      <main inert={isMobile && sheetOpen} className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
        {!isConnected && <div role="status" className="shrink-0 flex items-center justify-between gap-3 border-b border-border bg-secondary px-4 py-2 text-xs"><span>A ligação foi interrompida. Estamos a tentar voltar a ligar.</span><button type="button" onClick={() => api.connect()} className="shrink-0 font-semibold underline underline-offset-2">Tentar agora</button></div>}
        {exploreOpen ? (
          <Suspense
            fallback={
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground select-none">
                <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>A carregar servidores públicos...</span>
              </div>
            }
          >
            <PublicServersView
              profile={profile}
              publicCommunities={publicCommunities}
              myCommunities={communities}
              onSelectCommunity={(commId) => {
                setExploreOpen(false);
                setActiveCommunityId(commId);
                setActiveUserId(null);
                const comm = communities.find((c) => c.id === commId);
                if (comm && comm.channels.length > 0) {
                  const firstText = comm.channels.find((c) => c.type === 'text') || comm.channels[0];
                  setActiveChannelId(firstText.id);
                }
              }}
            />
          </Suspense>
        ) : showVoiceStage ? null : (
          <ChatPanel
            key={`${profile.id}:${activeCommunityId ? activeChannelId : activeUserId || 'home'}`}
            activeCommunity={activeCommunity}
            activeChannel={activeChannel}
            activeUser={activeUser}
            messages={currentDMMessages}
            channelMessages={currentChannelMessages}
            allUsers={users}
            profile={profile}
            typingFrom={typingFrom}
            onSendMessage={sendMessage}
            onSendTyping={sendTyping}
            onCall={(kind) => {
              if (activeUserId) startCall(activeUserId, kind);
            }}
            activeCallExists={!!activeCall}
            onBlockUser={(userId, blocked) => api.blockUser(userId, blocked)}
            isBlocked={blockedUsers.some((user) => user.id === activeUser?.id)}
            onAudioDeviceChange={changeAudioDevice}
            onBack={isMobile ? () => setSheetOpen(true) : undefined}
            voiceState={voiceState}
            activeVoiceChannelId={activeVoiceChannelId}
            onJoinVoice={joinVoiceChannel}
            onOpenChannel={setActiveChannelId}
            onLeaveVoice={leaveVoiceChannel}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onToggleDeafen={toggleDeafen}
            onToggleMute={toggleMute}
            remoteVideoStreams={voiceVideoStreams}
            voiceLocalStream={voiceLocalStream}
            onLocalVideoStreamChange={setVoiceVideoStream}
            pendingVoiceChannelId={pendingVoiceChannelId}
          />
        )}
        {voiceChannel && voiceCommunity && <div className={showVoiceStage ? 'flex flex-1 min-h-0 min-w-0' : 'hidden'} aria-hidden={!showVoiceStage}>
          <Suspense fallback={<div role="status" className="flex-1 grid place-items-center text-sm text-muted-foreground">A preparar a chamada…</div>}><CallStage visible={showVoiceStage} key={voiceChannel.id} channel={voiceChannel} communityName={voiceCommunity.name} community={voiceCommunity} members={voiceState[voiceChannel.id] || []} allUsers={users} profile={profile} isMuted={isMuted} isDeafened={isDeafened} onToggleMute={toggleMute} onToggleDeafen={toggleDeafen} onLeave={leaveVoiceChannel} remoteVideoStreams={voiceVideoStreams} voiceLocalStream={voiceLocalStream} onLocalVideoStreamChange={setVoiceVideoStream} onAudioDeviceChange={changeAudioDevice} /></Suspense>
        </div>}
      </main>

      {/* 1-on-1 Call Overlay (apenas montado quando há chamada ativa ou a entrar para poupar RAM) */}
      {(incomingCall || activeCall) && (
        <Suspense fallback={null}><CallOverlay
          incomingCall={incomingCall}
          activeCall={activeCall}
          callerName={callerName}
          remoteUser={users.find((u) => u.id === (activeCall?.peerId || incomingCall?.from)) ?? null}
          currentUserId={profile.id}
          onAccept={acceptCall}
          onReject={rejectCall}
          onHangup={hangup}
          onLocalVideoStreamChange={setCallVideoStream}
          onAudioDeviceChange={changeAudioDevice}
          isMuted={isMuted}
          isDeafened={isDeafened}
          onToggleMute={toggleMute}
          onToggleDeafen={toggleDeafen}
        /></Suspense>
      )}
    </div>
      {settingsView ? createPortal(settingsView, document.body) : null}
      {adminView ? createPortal(adminView, document.body) : null}
    </>
  );
}



