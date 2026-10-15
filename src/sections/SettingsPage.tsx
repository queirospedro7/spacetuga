import { ProfileCard } from '@/components/ProfileCard';
import { CallBackgroundEditor } from '@/components/CallBackgroundEditor';
import { GradientEditor } from '@/components/GradientEditor';
import { readProfileImage as readCompressedImage } from '@/lib/profile-images';
import { requestNotificationPermission, notificationsEnabled, setNotificationsEnabled } from '@/lib/notifications';
import { createMicrophoneStream, stopTrack, getAudioSettings, setAudioSettings, subscribeAudioSettings } from '@/lib/audio-settings';
import { useState, useRef, useEffect, useMemo, useCallback, type FormEvent } from 'react';
import { SettingsNavigation } from '@/components/SettingsNavigation';
import { settingsSections } from '@/lib/settings-sections';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import '@/styles/settings.css';
import { readNumberPreference } from '@/lib/preferences';
import { lightweightMode, setLightweightMode } from '@/lib/performance-settings';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Palette,
  Mic,
  Volume2,
  Bell,
  Lock,
  Keyboard,
  X,
  Camera,
  Check,
  Upload,
  Trash2,
  Moon,
  Sun,
  Monitor,
  Download,
  Play,
  Square,
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  Laptop,
  Apple,
  Terminal,
  Pipette,
  RotateCcw,
  Menu,
  Radio,
} from 'lucide-react';
import type { MyProfile, PublicUser, Community } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { BrandMark } from '@/components/BrandMark';
import { useTheme, applyAppWallpaper } from '@/context/ThemeContext';
import { applyAccentColor } from '@/lib/theme-accent';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { getScreenShareVolume, setScreenShareVolume } from '@/lib/call-volume';

export type SettingsSection =
  | 'profile'
  | 'account'
  | 'appearance'
  | 'voice'
  | 'notifications'
  | 'privacy'
  | 'shortcuts'
  | 'admin'
  | 'downloads'
  | 'about';

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface SettingsPageProps {
  profile: MyProfile;
  users: PublicUser[];
  communities: Community[];
  blockedUsers: PublicUser[];
  onClose: () => void;
  onUpdateProfile: (patch: Partial<MyProfile>) => void;
  onLogout: () => void;
  initialSection?: SettingsSection;
  onOpenAdmin?: () => void;
  installPrompt?: InstallPromptEvent | null;
  onInstall?: () => void;
}

const PRESET_BANNERS = [
  { name: 'Tuga Azul', value: 'linear-gradient(135deg, #0071e3 0%, #1982fc 100%)' },
  { name: 'Aurora Esmeralda', value: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  { name: 'Cosmos Roxo', value: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' },
  { name: 'Cyberpunk Carmim', value: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' },
  { name: 'Sunset Dourado', value: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
  { name: 'Meia-Noite', value: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)' },
  { name: 'Oceano Índigo', value: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' },
  { name: 'Neon Sakura', value: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' },
];

const ACCENT_COLORS = [
  { label: 'Azul Apple', value: '#0A84FF' },
  { label: 'Esmeralda', value: '#10B981' },
  { label: 'Violeta', value: '#8B5CF6' },
  { label: 'Rosa Choque', value: '#EC4899' },
  { label: 'Laranja Solar', value: '#F97316' },
  { label: 'Vermelho Fogo', value: '#EF4444' },
  { label: 'Ciano Neón', value: '#06B6D4' },
  { label: 'Âmbar Dourado', value: '#F59E0B' },
];

const APP_WALLPAPERS = [
  { label: 'Padrão Escuro', value: '' },
  { label: 'Aurora Boreal', value: 'radial-gradient(ellipse at top, rgba(16, 185, 129, 0.12), transparent 50%), radial-gradient(ellipse at bottom, rgba(59, 130, 246, 0.12), transparent 50%)' },
  { label: 'Tuga Roxo', value: 'radial-gradient(ellipse at top left, rgba(147, 51, 234, 0.15), transparent 50%), radial-gradient(ellipse at bottom right, rgba(236, 72, 153, 0.12), transparent 50%)' },
  { label: 'Cyberpunk Carmim', value: 'radial-gradient(ellipse at top, rgba(239, 68, 68, 0.15), transparent 55%), radial-gradient(ellipse at bottom, rgba(249, 115, 22, 0.12), transparent 55%)' },
  { label: 'Oceano Profundo', value: 'linear-gradient(180deg, rgba(14, 165, 233, 0.08) 0%, rgba(3, 105, 161, 0.15) 100%)' },
  { label: 'Minimalista Neutro', value: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.03) 0%, transparent 80%)' },
];

const STATUS_OPTIONS = [
  { id: 'online', label: 'Online', desc: 'Disponível e ativo', color: '#10b981' },
  { id: 'away', label: 'Ausente', desc: 'Temporariamente afastado', color: '#f59e0b' },
  { id: 'busy', label: 'Ocupado', desc: 'Apenas notificações urgentes', color: '#ef4444' },
  { id: 'offline', label: 'Invisível', desc: 'Apareces como desconectado', color: '#71717a' },
];

export function SettingsPage({
  profile,
  blockedUsers,
  onClose,
  onLogout,
  initialSection = 'profile',
  onOpenAdmin,
  installPrompt,
  onInstall,
}: SettingsPageProps) {
  const { theme, setTheme } = useTheme();
  const downloadUrl = import.meta.env.VITE_TUGA_WINDOWS_DOWNLOAD_URL || '';
  const browserUrl = '__TAURI_INTERNALS__' in window ? import.meta.env.VITE_TUGA_WEB_URL || '' : window.location.origin;
  const [activeTab, setActiveTab] = useState<SettingsSection>(initialSection);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const sectionDetails = settingsSections.find((section) => section.id === activeTab) || settingsSections[0];

  // Profile Studio State
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [about, setAbout] = useState(profile.about || '');
  const [customStatus, setCustomStatus] = useState(profile.customStatus || '');
  const [presenceStatus, setPresenceStatus] = useState(profile.status || 'online');
  const [hue, setHue] = useState(Number.isFinite(profile.hue) ? profile.hue : 210);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl || '');
  const [bannerPosition, setBannerPosition] = useState<number>(profile.bannerPosition ?? 50);
  const [savingProfile, setSavingProfile] = useState(false);

  // Account State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Appearance State
  const [accent, setAccent] = useState(() => localStorage.getItem('tuga.accent') || '#0A84FF');
  const [customHexInput, setCustomHexInput] = useState(accent);

  useEffect(() => {
    setCustomHexInput(accent);
  }, [accent]);

  function handleHexChange(val: string) {
    let raw = val.trim();
    if (raw && !raw.startsWith('#')) raw = `#${raw}`;
    setCustomHexInput(raw);
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      setAccent(raw.toUpperCase());
    }
  }

  const [appBg, setAppBg] = useState(() => localStorage.getItem('melo.appBg') || '');
  const [compact, setCompact] = useState(() => localStorage.getItem('melo.compact') === 'true');
  const [lightweight, setLightweight] = useState(lightweightMode);
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('melo.reduceMotion') === 'true');
  const [fontSize, setFontSize] = useState(() => readNumberPreference('melo.fontSize', 16, 14, 18));

  const [corner, setCorner] = useState(() => readNumberPreference('melo.corner', 14, 8, 22));

  // Voice & Audio State
  const [inputVolume, setInputVolume] = useState(() => getAudioSettings().inputVolume);
  const [outputVolume, setOutputVolume] = useState(() => getAudioSettings().outputVolume);
  const [screenShareVolumeSetting, setScreenShareVolumeSetting] = useState(() => getScreenShareVolume());
  const [noiseSuppression, setNoiseSuppression] = useState(() => getAudioSettings().noiseSuppression);
  const [echoCancellation, setEchoCancellation] = useState(() => getAudioSettings().echoCancellation);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  // Push-to-Talk state (local to settings UI, persisted in localStorage)
  const [pttEnabled, setPttEnabled] = useState(() => localStorage.getItem('tuga.pttEnabled') === 'true');
  const [pttKey, setPttKey] = useState(() => localStorage.getItem('tuga.pttKey') || 'Space');
  const [recordingPttKey, setRecordingPttKey] = useState(false);

  function handlePttKeyRecord(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const code = e.code;
    if (code === 'Escape') { setRecordingPttKey(false); return; }
    setPttKey(code);
    setRecordingPttKey(false);
    try { localStorage.setItem('tuga.pttKey', code); } catch { /* ignore */ }
  }

  useEffect(() => subscribeAudioSettings((settings) => {
    setInputVolume(settings.inputVolume); setOutputVolume(settings.outputVolume); setNoiseSuppression(settings.noiseSuppression); setEchoCancellation(settings.echoCancellation);
  }), []);

  const [desktopNotifications, setDesktopNotifications] = useState(notificationsEnabled);

  // Notifications State
  const [messageSounds, setMessageSounds] = useState(() => localStorage.getItem('melo.sounds') !== 'false');
  const [callSounds, setCallSounds] = useState(() => localStorage.getItem('tuga.callSounds') !== 'false');
  const [soundVolume, setSoundVolume] = useState(() => readNumberPreference('melo.soundVolume', 28, 0, 100));
  const [connected, setConnected] = useState(api.isSocketOpen);
  useEffect(() => { const on = api.on('connected', () => setConnected(true)); const off = api.on('disconnected', () => setConnected(false)); return () => { on(); off(); }; }, []);

  // Privacy State
  const readReceipts = profile.readReceiptsEnabled === true;
  const allowDMs = profile.allowMemberDMs !== false;

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micGenerationRef = useRef(0);
  function changeTab(section: SettingsSection) {
    setMobileNavigation(false);
    requestAnimationFrame(() => { contentRef.current?.scrollTo({ top: 0 }); if (window.matchMedia('(max-width: 767px)').matches) document.querySelector<HTMLButtonElement>('[data-settings-mobile-menu]')?.focus(); });
    micGenerationRef.current++;
    micTestStreamRef.current?.getTracks().forEach(stopTrack);
    micTestStreamRef.current = null;
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    micAnimRef.current = null;
    void micContextRef.current?.close();
    micContextRef.current = null;
    setIsMicTesting(false);
    setMicLevel(0);
    setActiveTab(section);
  }
  const micAnimRef = useRef<number | null>(null);

  // Check if profile has unsaved changes
  const hasProfileChanges = useMemo(() => {
    return (
      displayName !== (profile.displayName || '') ||
      about !== (profile.about || '') ||
      customStatus !== (profile.customStatus || '') ||
      presenceStatus !== (profile.status || 'online') ||
      hue !== (Number.isFinite(profile.hue) ? profile.hue : 210) ||
      avatarUrl !== (profile.avatarUrl || '') ||
      bannerUrl !== (profile.bannerUrl || '') ||
      bannerPosition !== (profile.bannerPosition ?? 50)
    );
  }, [displayName, about, customStatus, presenceStatus, hue, avatarUrl, bannerUrl, bannerPosition, profile]);

  const requestClose = useCallback(() => {
    if (savingProfile) return;
    if (hasProfileChanges) setConfirmDiscard(true); else onClose();
  }, [savingProfile, hasProfileChanges, onClose]);
  // Handle ESC key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"]')) {
        requestClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose]);

  // Stop mic test on unmount
  useEffect(() => {
    const generationCounter = micGenerationRef;
    return () => {
      generationCounter.current++;
      if (micTestStreamRef.current) {
        micTestStreamRef.current.getTracks().forEach(stopTrack);
      }
      if (micAnimRef.current) {
        cancelAnimationFrame(micAnimRef.current);
      }
      void micContextRef.current?.close();
    };
  }, []);

  // Sync Appearance Preferences
  useEffect(() => {
    document.documentElement.classList.toggle('melo-compact', compact);
    document.documentElement.classList.toggle('melo-reduced-motion', reduceMotion);
    try {
      localStorage.setItem('melo.compact', String(compact));
      localStorage.setItem('melo.reduceMotion', String(reduceMotion));
    } catch { /* Ignore private storage issues */ }
  }, [compact, reduceMotion]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
    document.documentElement.style.setProperty('--radius', `${corner}px`);
    try {
      localStorage.setItem('melo.fontSize', String(fontSize));
      localStorage.setItem('melo.corner', String(corner));
    } catch { /* Ignore */ }
  }, [fontSize, corner]);

  useEffect(() => {
    applyAccentColor(accent);
    try {
      localStorage.setItem('tuga.accent', accent);
    } catch { /* Ignore */ }
  }, [accent]);

  useEffect(() => {
    applyAppWallpaper(appBg);
  }, [appBg]);

  // Handle Image compression & upload
  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await readCompressedImage(file, 400);
      setAvatarUrl(b64);
      toast.success('Foto carregada com sucesso');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : '') || 'Erro ao carregar avatar');
    } finally {
      e.target.value = '';
    }
  }

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await readCompressedImage(file, 900);
      setBannerUrl(b64);
      toast.success('Banner carregado com sucesso');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : '') || 'Erro ao carregar banner');
    } finally {
      e.target.value = '';
    }
  }

  async function handleWallpaperFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await readCompressedImage(file, 1600);
      setAppBg(b64);
      try { localStorage.setItem('melo.appBg', b64); } catch { /* A preferência local pode estar indisponível. */ }
      toast.success('Papel de parede da aplicação atualizado');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : '') || 'Erro ao carregar fundo');
    } finally {
      e.target.value = '';
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
    const { profile: saved } = await api.saveProfile({
      displayName: displayName.trim() || profile.displayName,
      about: about.trim(),
      customStatus: customStatus.trim(),
      status: presenceStatus,
      hue,
      avatarUrl: avatarUrl.trim(),
      bannerUrl: bannerUrl.trim(),
      bannerPosition,
    });
    setDisplayName(saved.displayName); setAbout(saved.about || ''); setCustomStatus(saved.customStatus || ''); setPresenceStatus(saved.status); setHue(saved.hue); setAvatarUrl(saved.avatarUrl || ''); setBannerUrl(saved.bannerUrl || ''); setBannerPosition(saved.bannerPosition ?? 50);

      toast.success('Perfil atualizado com sucesso!');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível guardar o perfil.'); }
    finally { setSavingProfile(false); }
  }

  function handleRevertProfile() {
    setDisplayName(profile.displayName || '');
    setAbout(profile.about || '');
    setCustomStatus(profile.customStatus || '');
    setPresenceStatus(profile.status || 'online');
    setHue(Number.isFinite(profile.hue) ? profile.hue : 210);
    setAvatarUrl(profile.avatarUrl || '');
    setBannerUrl(profile.bannerUrl || '');
    setBannerPosition(profile.bannerPosition ?? 50);
    toast.info('Alterações revertidas');
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    if (!currentPassword) {
      toast.error('Insere a tua palavra-passe atual.');
      return;
    }
    if (newPassword.length < 10 || newPassword.length > 128) {
      toast.error('A nova palavra-passe deve ter entre 10 e 128 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('A confirmação não coincide com a nova palavra-passe.');
      return;
    }

    setSavingPassword(true);
    try {
    await api.changePassword(currentPassword, newPassword);
    toast.success('Palavra-passe alterada. As sessões anteriores foram invalidadas.');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      toast.error(code === 'current_password' ? 'A palavra-passe atual está incorreta.' : code === 'rate_limit' ? 'Demasiadas tentativas. Aguarda um minuto.' : code || 'Não foi possível alterar a palavra-passe.');
    } finally { setSavingPassword(false); }
  }

  function playSampleSound() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime((soundVolume / 100) * 0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } catch {
      // AudioContext fallback
    }
  }

  async function toggleMicTest() {
    const generation = ++micGenerationRef.current;
    if (isMicTesting) {
      if (micTestStreamRef.current) {
        micTestStreamRef.current.getTracks().forEach(stopTrack);
        micTestStreamRef.current = null;
      }
      if (micAnimRef.current) {
        cancelAnimationFrame(micAnimRef.current);
        micAnimRef.current = null;
      }
      void micContextRef.current?.close();
      micContextRef.current = null;
      setIsMicTesting(false);
      setMicLevel(0);
      return;
    }

    try {
      const stream = await createMicrophoneStream();
      if (generation !== micGenerationRef.current) { stream.getTracks().forEach(stopTrack); return; }
      micTestStreamRef.current = stream;
      setIsMicTesting(true);

      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      micContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        micAnimRef.current = requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (err) {
      toast.error('Não foi possível aceder ao microfone: ' + ((err instanceof Error ? err.message : '') || 'Permissão negada'));
      setIsMicTesting(false);
    }
  }


  return (
    <div className="tuga-settings fixed inset-0 z-[80] flex text-foreground overflow-hidden animate-in fade-in duration-200" data-settings-page>
      {mobileNavigation && <button className="settings-backdrop" aria-label="Fechar menu das definições" onClick={() => setMobileNavigation(false)} />}
      <aside className="settings-sidebar" data-open={mobileNavigation}>
        <SettingsNavigation profile={profile} active={activeTab} onSelect={changeTab} onLogout={onLogout} onAdmin={onOpenAdmin} />
      </aside>
      <main ref={contentRef} className="settings-main">
        <header className="settings-header">
          <div className="min-w-0">
            <button data-settings-mobile-menu className="settings-mobile-menu" aria-label="Abrir menu das definições" aria-expanded={mobileNavigation} onClick={() => setMobileNavigation(true)}><Menu className="size-4" /></button>
            <p className="settings-breadcrumb">Tuga / Definições</p>
            <h1>{sectionDetails.title}</h1>
            <p className="settings-header-description">{sectionDetails.description}</p>
          </div>
          <button className="settings-close" onClick={requestClose} aria-label="Fechar definições"><X className="size-4" /><span>Fechar</span><kbd>Esc</kbd></button>
        </header>
        {/* Tab Body */}
        <div className="settings-body">
          {/* ======================================================== */}
          {/* TAB 1: MEU PERFIL (ESTÚDIO DE PERFIL REDESENHADO)       */}
          {/* ======================================================== */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Profile Controls */}
              <div className="lg:col-span-7 space-y-6">
                {/* Display Name & Username */}
                <div className="space-y-4 rounded-3xl border border-border bg-card/60 p-5 shadow-xs">
                  <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                    <User className="size-4 text-primary" />
                    Identidade
                  </h3>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Nome de Exibição</Label>
                    <Input
                      value={displayName}
                      aria-label="Nome de exibição"
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="O teu nome ou alcunha"
                      maxLength={32}
                      className="h-10 rounded-xl bg-secondary/50 border-border text-xs focus:border-primary"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Este é o nome visível para todos os outros utilizadores.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Nome de Utilizador</Label>
                    <div className="flex items-center h-10 px-3 rounded-xl bg-secondary/30 border border-border/80 text-xs text-muted-foreground font-mono">
                      @{profile.username}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      O teu identificador único para amigos e convites.
                    </p>
                  </div>
                </div>

                {/* Status & Presence */}
                <div className="space-y-4 rounded-3xl border border-border bg-card/60 p-5 shadow-xs">
                  <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    Estado & Presença
                  </h3>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Estado de Presença</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setPresenceStatus(opt.id)}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs transition-all ${
                            presenceStatus === opt.id
                              ? 'bg-primary/10 border-primary text-foreground font-semibold shadow-xs'
                              : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                          <div className="truncate">
                            <span className="block truncate">{opt.label}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs font-semibold text-foreground">Estado Personalizado</Label>
                    <Input
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value)}
                      placeholder="ex: A jogar, Em pausa, Focado..."
                      maxLength={60}
                      className="h-10 rounded-xl bg-secondary/50 border-border text-xs focus:border-primary"
                    />
                    {/* Quick status chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['A jogar', 'Em pausa', 'A ouvir música', 'A programar', 'Ausente'].map(
                        (preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCustomStatus(preset)}
                            className="px-2 py-1 rounded-lg bg-secondary text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {preset}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Avatar & Banner Customization */}
                <div className="space-y-4 rounded-3xl border border-border bg-card/60 p-5 shadow-xs">
                  <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                    <Camera className="size-4 text-primary" />
                    Imagem de Perfil & Banner
                  </h3>

                  {/* Avatar upload / url */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground">Foto de Perfil</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => avatarInputRef.current?.click()}
                        className="rounded-xl text-xs h-9 gap-1.5"
                      >
                        <Upload className="size-3.5" />
                        Carregar Imagem
                      </Button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFile}
                      />
                      {avatarUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAvatarUrl('')}
                          className="rounded-xl text-xs h-9 text-destructive hover:bg-destructive/15 gap-1.5"
                        >
                          <Trash2 className="size-3.5" />
                          Remover
                        </Button>
                      )}
                    </div>
                    <Input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="Ou cola aqui o link direto da imagem (URL)..."
                      className="h-9 rounded-xl bg-secondary/50 border-border text-xs focus:border-primary"
                    />
                  </div>

                  {/* Banner Presets */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <Label className="text-xs font-semibold text-foreground">Banner de Fundo</Label>
                    <label className="flex items-center gap-3 text-xs text-muted-foreground">Cor personalizada<input aria-label="Cor personalizada do banner de perfil" type="color" value={/^#[0-9a-f]{6}$/i.test(bannerUrl) ? bannerUrl : '#6366f1'} onChange={(event) => setBannerUrl(event.target.value)} className="h-9 w-12 cursor-pointer rounded-lg" /></label>
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_BANNERS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setBannerUrl(preset.value)}
                          className={`h-11 rounded-xl transition-all relative overflow-hidden ring-offset-2 ring-offset-card ${
                            bannerUrl === preset.value ? 'ring-2 ring-primary scale-102' : 'hover:opacity-90'
                          }`}
                          style={{ background: preset.value }}
                          title={preset.name}
                        >
                          {bannerUrl === preset.value && (
                            <span className="absolute inset-0 grid place-items-center bg-black/20 text-white">
                              <Check className="size-3.5 drop-shadow" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => bannerInputRef.current?.click()}
                        className="rounded-xl text-xs h-9 gap-1.5"
                      >
                        <Upload className="size-3.5" />
                        Imagem Personalizada
                      </Button>
                      <input
                        ref={bannerInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleBannerFile}
                      />
                      {bannerUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setBannerUrl('');
                            setBannerPosition(50);
                          }}
                          className="rounded-xl text-xs h-9 text-muted-foreground hover:bg-secondary gap-1.5"
                        >
                          Limpar Banner
                        </Button>
                      )}
                    </div>

                    {/* Controlo de Reposicionamento Vertical do Banner */}
                    {bannerUrl && (bannerUrl.startsWith('data:') || bannerUrl.startsWith('http') || bannerUrl.startsWith('blob:')) && (
                      <div className="p-3 rounded-2xl bg-secondary/40 border border-border space-y-2 mt-2">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span className="text-foreground">Posição Vertical do Banner (Ajustar Enquadramento)</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{bannerPosition}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={bannerPosition}
                          onChange={(e) => setBannerPosition(Number(e.target.value))}
                          className="w-full h-2 rounded-lg accent-primary cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Topo (0%)</span>
                          <span>Centro (50%)</span>
                          <span>Fundo (100%)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profile Color Hue Slider */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">Tom de Cor do Perfil</Label>
                      <span className="text-[11px] font-mono text-muted-foreground">{hue}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={hue}
                      onChange={(e) => setHue(Number(e.target.value))}
                      className="w-full h-2.5 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background:
                          'linear-gradient(to right, #ef4444, #f59e0b, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
                      }}
                    />
                  </div>
                </div>

                {/* About Me / Bio */}
                <div className="space-y-3 rounded-3xl border border-border bg-card/60 p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground">Sobre Mim (Biografia)</Label>
                    <span className="text-[11px] text-muted-foreground">{about.length}/300</span>
                  </div>
                  <Textarea
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    placeholder="Conta um pouco sobre ti, jogos favoritos, projetos ou redes sociais..."
                    maxLength={300}
                    rows={4}
                    className="rounded-xl bg-secondary/50 border-border text-xs focus:border-primary resize-none"
                  />
                </div>
              </div>

              {/* Right Column: Live Discord-Style Preview Card */}
              <div className="lg:col-span-5 sticky top-24 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Pré-visualização ao Vivo
                  </span>
                  <span className="text-[11px] text-primary flex items-center gap-1 font-semibold">
                    <Sparkles className="size-3" />
                    Tempo Real
                  </span>
                </div>

                <div data-profile-preview className="profile-preview-card rounded-3xl border border-border bg-card overflow-hidden text-card-foreground"><ProfileCard user={{...profile,online:presenceStatus !== 'invisible',displayName:displayName || profile.displayName,avatarUrl,bannerUrl,hue,about,customStatus,status:presenceStatus,bannerPosition}} onBannerMouseDown={(e)=>{
if(!/^(data:|https?:|blob:)/.test(bannerUrl))return;e.preventDefault();const start=e.clientY;const initial=bannerPosition;
const move=(event:MouseEvent)=>setBannerPosition(Math.max(0,Math.min(100,initial+Math.round((event.clientY-start)/1.1))));
const stop=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',stop);};window.addEventListener('mousemove',move);window.addEventListener('mouseup',stop);
}}/></div>              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: CONTA & SEGURANÇA                                */}
          {/* ======================================================== */}
          {activeTab === 'account' && (
            <div className="max-w-2xl space-y-6">
              {/* Account summary */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground">Informações da Conta</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-2xl bg-secondary/40 border border-border/70 space-y-1">
                    <span className="text-muted-foreground block text-[11px]">Nome de Utilizador</span>
                    <span className="font-semibold text-foreground font-mono">@{profile.username}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/40 border border-border/70 space-y-1">
                    <span className="text-muted-foreground block text-[11px]">Identificador (ID)</span>
                    <span className="font-semibold text-foreground font-mono truncate block">
                      {profile.id.slice(0, 16)}...
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/40 border border-border/70 space-y-1">
                    <span className="text-muted-foreground block text-[11px]">Estado da Conta</span>
                    <span className="font-semibold text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" /> Ativa & Verificada
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/40 border border-border/70 space-y-1">
                    <span className="text-muted-foreground block text-[11px]">Cargo Global</span>
                    <span className="font-semibold text-foreground">
                      {profile.globalRole === 'owner'
                        ? 'Proprietário'
                        : profile.globalRole === 'admin'
                        ? 'Administrador'
                        : 'Membro Padrão'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Password change form */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Lock className="size-4 text-primary" />
                  Palavra-passe & Acesso
                </h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Palavra-passe Atual</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="h-10 rounded-xl bg-secondary/50 border-border text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Nova Palavra-passe</Label>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Entre 10 e 128 caracteres"
                        className="h-10 rounded-xl bg-secondary/50 border-border text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Confirmar Nova</Label>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repete a palavra-passe"
                        className="h-10 rounded-xl bg-secondary/50 border-border text-xs"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={savingPassword}
                    className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary text-primary-foreground"
                  >
                    {savingPassword ? 'A atualizar…' : 'Atualizar Palavra-passe'}
                  </Button>
                </form>
              </div>

              {/* Sessions list */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-foreground">Sessão atual</h4>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-2xl bg-secondary/40 border border-border/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Laptop className="size-5 text-primary" />
                      <div>
                        <span className="font-semibold text-foreground block">
                          Este dispositivo
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Ligação da aplicação ao servidor
                        </span>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${connected ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
                      {connected ? 'Ligada' : 'Sem ligação'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: APARÊNCIA & TEMAS                                */}
          {/* ======================================================== */}
          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6">
              {/* Theme Mode Selector */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Palette className="size-4 text-primary" />
                  Tema do Sistema
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 ${
                      theme === 'dark'
                        ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Moon className="size-5" />
                    <span className="text-xs">Escuro (Dark)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 ${
                      theme === 'light'
                        ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sun className="size-5" />
                    <span className="text-xs">Claro (Light)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 ${
                      theme === 'system'
                        ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Monitor className="size-5" />
                    <span className="text-xs">Automático</span>
                  </button>
                </div>
              </div>

              {/* Accent Color Picker Livre & Presets */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Cor de Destaque da Aplicação</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Escolhe uma cor sugerida ou define qualquer cor personalizada com o seletor visual e código HEX.
                    </p>
                  </div>
                  {accent.toUpperCase() !== '#0A84FF' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAccent('#0A84FF')}
                      className="rounded-xl text-xs h-8 text-muted-foreground hover:text-foreground gap-1.5"
                      title="Repor cor padrão"
                    >
                      <RotateCcw className="size-3" />
                      Repor Padrão
                    </Button>
                  )}
                </div>

                {/* Swatches e Seletor Livre */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-foreground">Cores Sugeridas & Seletor Livre</Label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Botão de Seletor Livre (Color Picker Nativo com Gradiente Cónico) */}
                    <label
                      className="relative size-10 rounded-2xl cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center border-2 border-border/80 group overflow-hidden shrink-0"
                      style={{
                        background: 'conic-gradient(from 180deg at 50% 50%, #EF4444 0deg, #F59E0B 45deg, #10B981 120deg, #06B6D4 180deg, #3B82F6 240deg, #8B5CF6 290deg, #EC4899 330deg, #EF4444 360deg)',
                      }}
                      title="Abrir seletor de qualquer cor (Color Picker)"
                    >
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                      <Pipette className="size-4.5 text-white drop-shadow relative z-10 stroke-[2.5]" />
                      <input
                        type="color"
                        value={accent.startsWith('#') && accent.length === 7 ? accent : '#0A84FF'}
                        onChange={(e) => {
                          const c = e.target.value.toUpperCase();
                          setAccent(c);
                          setCustomHexInput(c);
                        }}
                        className="sr-only"
                      />
                    </label>

                    {/* Presets */}
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setAccent(c.value)}
                        className={`size-10 rounded-2xl transition-all flex items-center justify-center shadow-xs shrink-0 ${
                          accent.toLowerCase() === c.value.toLowerCase()
                            ? 'scale-105 ring-2 ring-foreground ring-offset-2 ring-offset-card shadow-sm'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                      >
                        {accent.toLowerCase() === c.value.toLowerCase() && (
                          <Check className="size-4 text-white drop-shadow stroke-[2.5]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Entrada HEX e Amostra da Cor */}
                <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Amostra clicável */}
                    <label
                      className="size-10 rounded-xl border border-border shadow-inner cursor-pointer shrink-0 relative overflow-hidden group transition-transform hover:scale-105"
                      style={{ backgroundColor: accent }}
                      title="Clica para abrir o seletor de cor"
                    >
                      <input
                        type="color"
                        value={accent.startsWith('#') && accent.length === 7 ? accent : '#0A84FF'}
                        onChange={(e) => {
                          const c = e.target.value.toUpperCase();
                          setAccent(c);
                          setCustomHexInput(c);
                        }}
                        className="sr-only"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Pipette className="size-3.5 text-white" />
                      </span>
                    </label>

                    <div>
                      <span className="text-xs font-semibold text-foreground block">
                        Código Hexadecimal (HEX)
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Escreve qualquer cor ou clica na amostra
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={customHexInput}
                      onChange={(e) => handleHexChange(e.target.value)}
                      placeholder="#0A84FF"
                      maxLength={7}
                      className="h-9 w-32 font-mono uppercase text-xs rounded-xl bg-background border-border text-center"
                    />
                  </div>
                </div>

                {/* Pré-visualização em tempo real da cor aplicada */}
                <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border space-y-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Pré-visualização dos Elementos
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm" className="h-8 rounded-xl text-xs font-semibold shadow-xs">
                      Botão Primário
                    </Button>
                    <span className="px-2.5 py-1 rounded-xl bg-primary/15 text-primary text-xs font-semibold border border-primary/30">
                      Badge Ativo
                    </span>
                    <span className="text-xs font-bold text-primary">
                      Texto com Destaque
                    </span>
                  </div>
                </div>
              </div>

              {/* Application Wallpaper */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground">Papel de Parede da Aplicação</h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {APP_WALLPAPERS.map((wp) => (
                    <button
                      key={wp.label}
                      type="button"
                      onClick={() => {
                        setAppBg(wp.value);
                        try { localStorage.setItem('melo.appBg', wp.value); } catch { /* A preferência local pode estar indisponível. */ }
                      }}
                      className={`h-16 rounded-2xl border text-xs p-2 text-center transition-all relative overflow-hidden flex items-end justify-center ${
                        appBg === wp.value
                          ? 'border-primary ring-2 ring-primary/40 font-semibold'
                          : 'border-border/80 hover:border-foreground/40'
                      }`}
                      style={{ background: wp.value || 'var(--card)' }}
                    >
                      <span className="relative z-10 text-[10px] truncate">{wp.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => wallpaperInputRef.current?.click()}
                    className="rounded-xl text-xs h-9 gap-1.5"
                  >
                    <Upload className="size-3.5" />
                    Carregar Fundo Personalizado
                  </Button>
                  <input
                    ref={wallpaperInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleWallpaperFile}
                  />
                  {appBg && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAppBg('');
                        try { localStorage.removeItem('melo.appBg'); } catch { /* A preferência local pode estar indisponível. */ }
                      }}
                      className="rounded-xl text-xs h-9 text-muted-foreground hover:bg-secondary"
                    >
                      Restaurar Padrão
                    </Button>
                  )}
                </div>
              </div>

              <GradientEditor onApply={(background) => { setAppBg(background); try { localStorage.setItem('melo.appBg', background); } catch { /* Optional preference. */ } }} />
              {/* Density & Layout Controls */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-5">
                <h3 className="text-sm font-bold text-foreground">Densidade & Interface</h3>
                <div className="flex items-center justify-between gap-4"><div className="space-y-0.5"><span className="text-xs font-semibold block">Poupar recursos</span><p className="text-[11px] text-muted-foreground">Reduz os efeitos de vidro. Ativo por predefinição na aplicação.</p></div><Switch aria-label="Poupar recursos" checked={lightweight} onCheckedChange={(value) => { setLightweight(value); setLightweightMode(value); }} /></div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">Modo Compacto</span>
                    <span className="text-[11px] text-muted-foreground">
                      Menos espaçamento entre mensagens para ver mais conteúdo
                    </span>
                  </div>
                  <Switch checked={compact} onCheckedChange={setCompact} />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">Reduzir Animações</span>
                    <span className="text-[11px] text-muted-foreground">
                      Minimiza efeitos de movimento e transições na interface
                    </span>
                  </div>
                  <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />
                </div>

                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Raio dos Cantos</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{corner}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={22}
                    value={corner}
                    onChange={(e) => setCorner(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Tamanho da Fonte</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={14}
                    max={18}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: VOZ & ÁUDIO                                      */}
          {/* ======================================================== */}
          {activeTab === 'voice' && (
            <div className="max-w-2xl space-y-6">
              <CallBackgroundEditor banner={profile.bannerUrl} />
              {/* Mic & Audio Test */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Mic className="size-4 text-primary" />
                  Teste de Microfone em Tempo Real
                </h3>

                <p className="text-xs text-muted-foreground">
                  Testa o teu microfone para garantir que os teus amigos te ouvem com clareza.
                </p>

                <div className="space-y-2">
                  <div className="h-3 rounded-full bg-secondary/80 overflow-hidden relative">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-75 rounded-full"
                      style={{ width: `${isMicTesting ? micLevel : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Nível de Entrada</span>
                    <span className="font-mono">{isMicTesting ? `${micLevel}%` : 'Inativo'}</span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={toggleMicTest}
                  className={`rounded-xl h-10 px-5 text-xs font-semibold gap-2 ${
                    isMicTesting
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {isMicTesting ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
                  {isMicTesting ? 'Parar Teste de Microfone' : 'Começar Teste de Microfone'}
                </Button>
              </div>

              {/* Volume Controls */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-5">
                <h3 className="text-sm font-bold text-foreground">Definições de Volume</h3>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <Mic className="size-3.5 text-muted-foreground" /> Volume do Microfone
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">{inputVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={inputVolume}
                    aria-label="Volume do microfone"
                    onChange={(e) => setAudioSettings({ inputVolume: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <Volume2 className="size-3.5 text-muted-foreground" /> Volume de Saída de Áudio
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">{outputVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={outputVolume}
                    aria-label="Volume de saída"
                    onChange={(e) => setAudioSettings({ outputVolume: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <Monitor className="size-3.5 text-primary" /> Volume da Partilha de Ecrã
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">{screenShareVolumeSetting}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={screenShareVolumeSetting}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setScreenShareVolumeSetting(v);
                      setScreenShareVolume(v);
                    }}
                    className="w-full accent-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Ajusta o nível de som das partilhas de ecrã transmitidas por outros utilizadores.
                  </p>
                </div>
              </div>

              {/* Audio Processing Toggles */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground">Processamento de Voz Avançado</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      Supressão de Ruído
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Remove ruídos de fundo como teclado e vento
                    </span>
                  </div>
                  <Switch checked={noiseSuppression} onCheckedChange={(value) => setAudioSettings({ noiseSuppression: value })} />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      Cancelamento de Eco
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Evita que o som dos altifalantes retorne ao microfone
                    </span>
                  </div>
                  <Switch checked={echoCancellation} onCheckedChange={(value) => setAudioSettings({ echoCancellation: value })} />
                </div>
              </div>

              {/* Push-to-Talk */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Radio className="size-4 text-primary" />
                  Push-to-Talk (PTT)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, o microfone fica sempre silenciado. Só transmites enquanto manténs a tecla PTT pressionada.
                </p>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">Ativar Push-to-Talk</span>
                    <span className="text-[11px] text-muted-foreground">O mic silencia automaticamente quando soltas a tecla</span>
                  </div>
                  <Switch
                    checked={pttEnabled}
                    onCheckedChange={(val) => {
                      setPttEnabled(val);
                      try { localStorage.setItem('tuga.pttEnabled', String(val)); } catch { /* ignore */ }
                    }}
                  />
                </div>

                {pttEnabled && (
                  <div className="pt-2 border-t border-border/60 space-y-2">
                    <span className="text-xs font-semibold text-foreground block">Tecla PTT</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onKeyDown={recordingPttKey ? handlePttKeyRecord : undefined}
                        onClick={() => setRecordingPttKey(true)}
                        onBlur={() => setRecordingPttKey(false)}
                        className={`px-4 py-2 rounded-xl border text-xs font-mono font-semibold transition-all min-w-[100px] text-center ${
                          recordingPttKey
                            ? 'border-primary bg-primary/10 text-primary animate-pulse'
                            : 'border-border bg-secondary/50 text-foreground hover:border-primary/60'
                        }`}
                      >
                        {recordingPttKey ? 'Pressiona a tecla…' : (pttKey || 'Espaço')}
                      </button>
                      {pttKey && (
                        <button
                          type="button"
                          onClick={() => { setPttKey('Space'); try { localStorage.setItem('tuga.pttKey', 'Space'); } catch { /* ignore */ } }}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Repor
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Clica no botão e pressiona a tecla que queres usar para o PTT. A tecla Espaço é usada por padrão.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: NOTIFICAÇÕES & SONS                              */}
          {/* ======================================================== */}
          {activeTab === 'notifications' && (
            <div className="max-w-2xl space-y-6">
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  Efeitos Sonoros
                </h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      Sons de Novas Mensagens
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Toca um sinal sonoro ao receber mensagens diretas e em canais
                    </span>
                  </div>
                  <Switch
                    checked={messageSounds}
                    onCheckedChange={(val) => {
                      setMessageSounds(val);
                      try { localStorage.setItem('melo.sounds', String(val)); } catch { /* A preferência local pode estar indisponível. */ }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      Toque de Chamada Recebida
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Toca campainha quando alguém te liga
                    </span>
                  </div>
                  <Switch checked={callSounds} onCheckedChange={(value) => { setCallSounds(value); localStorage.setItem('tuga.callSounds', String(value)); }} />
                </div>

                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Volume dos Efeitos Sonoros
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">{soundVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={soundVolume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSoundVolume(v);
                      try { localStorage.setItem('melo.soundVolume', String(v)); } catch { /* A preferência local pode estar indisponível. */ }
                    }}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="pt-2 border-t border-border/60">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={playSampleSound}
                    className="rounded-xl text-xs h-9 gap-1.5"
                  >
                    <Play className="size-3.5" />
                    Ouvir Som de Demonstração
                  </Button>
                </div>
              </div>

              {/* Browser notification permission */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs flex items-center justify-between">
                <div className="space-y-0.5 max-w-md">
                  <h4 className="text-xs font-bold text-foreground">Notificações no Ambiente de Trabalho</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Recebe notificações mesmo quando a janela do navegador estiver em segundo plano.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const granted = await requestNotificationPermission().catch(() => false);
                    setDesktopNotifications(granted);
                    toast[granted ? 'success' : 'error'](granted ? 'Notificações ativadas.' : 'Notificações não autorizadas pelo sistema.');
                  }}
                  className="rounded-xl text-xs"
                >
                  Autorizar notificações
                </Button>
                <label className="flex items-center gap-2 text-xs"><span>Ativadas</span><Switch checked={desktopNotifications} onCheckedChange={async (value) => {
                  if (value && !await requestNotificationPermission().catch(() => false)) { toast.error('Autoriza as notificações no sistema.'); return; }
                  setNotificationsEnabled(value); setDesktopNotifications(value);
                }} /></label>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 6: PRIVACIDADE & BLOQUEADOS                         */}
          {/* ======================================================== */}
          {activeTab === 'privacy' && (
            <div className="max-w-2xl space-y-6">
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Lock className="size-4 text-primary" />
                  Privacidade de Mensagens
                </h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      Recibos de Leitura ("Visto")
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Permite que os outros vejam quando leste as mensagens deles
                    </span>
                  </div>
                  <Switch
                    checked={readReceipts}
                    onCheckedChange={async (val) => {
                      try { await api.saveProfile({ readReceiptsEnabled: val }); toast.success(val ? 'Recibos de leitura ativados' : 'Recibos de leitura desativados'); }
                      catch { toast.error('Não foi possível guardar esta preferência.'); }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      Mensagens Diretas de Membros
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Permite que novos contactos te enviem mensagens e chamadas. As conversas existentes continuam disponíveis.
                    </span>
                  </div>
                  <Switch checked={allowDMs} onCheckedChange={async (value) => { try { await api.saveProfile({ allowMemberDMs: value }); } catch { toast.error('Não foi possível guardar esta preferência.'); } }} />
                </div>
              </div>

              {/* Blocked Users */}
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground">
                  Utilizadores Bloqueados ({blockedUsers.length})
                </h3>

                {blockedUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Não tens nenhum utilizador bloqueado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {blockedUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-secondary/40 border border-border/70"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-xs"
                            style={{ backgroundColor: `hsl(${u.hue}, 60%, 45%)` }}
                          >
                            {u.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-foreground block">
                              {u.displayName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">@{u.username}</span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try { await api.blockUserConfirmed(u.id, false); toast.success(`Desbloqueaste @${u.username}`); }
                            catch { toast.error('Não foi possível confirmar o desbloqueio.'); }
                          }}
                          className="h-8 rounded-xl text-xs"
                        >
                          Desbloquear
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 7: ATALHOS DE TECLADO                               */}
          {/* ======================================================== */}
          {activeTab === 'shortcuts' && (
            <div className="max-w-2xl space-y-6">
              <div className="rounded-3xl border border-border bg-card/60 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Keyboard className="size-4 text-primary" />
                  Atalhos de Teclado
                </h3>

                <div className="space-y-2 text-xs">
                  {[
                    { action: 'Enviar Mensagem', keys: ['Enter'] },
                    { action: 'Nova Linha na Mensagem', keys: ['Shift', 'Enter'] },
                    { action: 'Fechar Janela / Definições', keys: ['Esc'] },
                    { action: 'Pesquisar Conversas', keys: ['Ctrl', 'K'] },
                    { action: 'Silenciar Microfone', keys: ['Ctrl', 'Shift', 'M'] },
                    { action: 'Ensurdecer Áudio', keys: ['Ctrl', 'Shift', 'D'] },
                    { action: 'Abrir Definições', keys: ['Ctrl', ','] },
                    { action: 'Push-to-Talk', keys: [pttEnabled ? (pttKey || 'Espaço') : '(desativado)'] },
                  ].map((s) => (
                    <div
                      key={s.action}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/30 border border-border/60"
                    >
                      <span className="text-foreground font-medium">{s.action}</span>
                      <div className="flex items-center gap-1">
                        {s.keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-2 py-1 rounded-md bg-card border border-border text-[11px] font-mono text-muted-foreground shadow-2xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 8: DOWNLOADS DA APLICAÇÃO                             */}
          {/* ======================================================== */}
          {activeTab === 'downloads' && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h3 className="text-base font-bold text-foreground">Downloads da Aplicação</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Transfere o Tuga para o teu computador ou dispositivo para obteres o máximo desempenho e notificações nativas.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Desktop Native / PWA */}
                <div className="rounded-3xl border border-border bg-card/60 p-6 flex flex-col justify-between shadow-xs space-y-4">
                  <div className="space-y-3">
                    <div className="inline-flex p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                      <Laptop className="size-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Aplicação Desktop</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Aplicação nativa para Windows. O instalador será disponibilizado aqui quando estiver publicado.
                      </p>
                    </div>
                  </div>
                  <div>
                    {installPrompt ? (
                      <Button
                        onClick={onInstall}
                        className="w-full rounded-2xl h-11 font-semibold text-xs gap-2 bg-primary text-primary-foreground shadow-md"
                      >
                        <Download className="size-4" />
                        Instalar Aplicação Web
                      </Button>
                    ) : (
                      <Button
                        disabled={!downloadUrl}
                        onClick={() => {
                          if (downloadUrl) window.open(downloadUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="w-full rounded-2xl h-11 font-semibold text-xs gap-2 bg-primary text-primary-foreground shadow-md"
                      >
                        <Download className="size-4" />
                        {downloadUrl ? 'Descarregar para Windows' : 'Instalador indisponível'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* macOS card */}
                <div className="rounded-3xl border border-border bg-card/60 p-6 flex flex-col justify-between shadow-xs space-y-4">
                  <div className="space-y-3">
                    <div className="inline-flex p-3 rounded-2xl bg-secondary text-foreground border border-border">
                      <Apple className="size-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-foreground">macOS</h4>
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-400 border border-amber-400/30 text-[10px] font-semibold">Em breve</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Versão nativa para Mac. Disponível brevemente.
                      </p>
                    </div>
                  </div>
                  <div>
                    <Button disabled className="w-full rounded-2xl h-11 font-semibold text-xs gap-2 bg-primary text-primary-foreground shadow-md opacity-50">
                      <Download className="size-4" />
                      Indisponível
                    </Button>
                  </div>
                </div>

                {/* Linux card */}
                <div className="rounded-3xl border border-border bg-card/60 p-6 flex flex-col justify-between shadow-xs space-y-4">
                  <div className="space-y-3">
                    <div className="inline-flex p-3 rounded-2xl bg-secondary text-foreground border border-border">
                      <Terminal className="size-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-foreground">Linux</h4>
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-400 border border-amber-400/30 text-[10px] font-semibold">Em breve</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Pacote .deb / .AppImage em preparação.
                      </p>
                    </div>
                  </div>
                  <div>
                    <Button disabled className="w-full rounded-2xl h-11 font-semibold text-xs gap-2 bg-primary text-primary-foreground shadow-md opacity-50">
                      <Download className="size-4" />
                      Indisponível
                    </Button>
                  </div>
                </div>

                {/* Mobile / Web PWA */}
                <div className="rounded-3xl border border-border bg-card/60 p-6 flex flex-col justify-between shadow-xs space-y-4">
                  <div className="space-y-3">
                    <div className="inline-flex p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                      <Monitor className="size-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Acesso Web & Telemóvel</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Utiliza o Tuga sem instalações adicionais no teu navegador habitual ou adiciona ao ecrã inicial do teu telemóvel (PWA).
                      </p>
                    </div>
                  </div>
                  <div>
                    <Button
                      variant="secondary"
                      disabled={!browserUrl}
                      onClick={() => {
                        if (browserUrl) window.open(browserUrl, '_blank', 'noopener,noreferrer');
                      }}
                      className="w-full rounded-2xl h-11 font-semibold text-xs gap-2 border border-border"
                    >
                      {browserUrl ? 'Abrir no navegador' : 'Versão web indisponível'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Status Box */}
              <div className="rounded-2xl border border-border/80 bg-secondary/30 p-4 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <span>Canais de áudio cristalinos com WebRTC de baixa latência e consumo mínimo de memória.</span>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 9: SOBRE O TUGA                                     */}
          {/* ======================================================== */}
          {activeTab === 'about' && (
            <div className="max-w-2xl space-y-6">
              <div className="rounded-3xl border border-border bg-card/60 p-8 shadow-xs text-center space-y-4">
                <div className="inline-flex p-3 rounded-3xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                  <BrandMark className="size-16 rounded-2xl" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold tracking-tight text-foreground">
                    Tuga
                  </h3>
                  <p className="text-xs text-muted-foreground">Versão {__APP_VERSION__}</p>
                  <p className="text-xs text-muted-foreground">
                    Um espaço para conversar, partilhar e reunir a tua comunidade.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
                  <span>Conversas</span>
                  <span aria-hidden="true">/</span>
                  <span>Comunidades</span>
                  <span aria-hidden="true">/</span>
                  <span>Chamadas</span>
                </div>

                {installPrompt && (
                  <div className="pt-4">
                    <Button
                      onClick={onInstall}
                      className="rounded-2xl h-11 px-6 font-semibold text-xs gap-2 bg-primary text-primary-foreground shadow-md"
                    >
                      <Download className="size-4" />
                      Instalar Aplicação no Computador (PWA)
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* FLOATING SAVE BAR FOR PROFILE CHANGES                    */}
        {/* ======================================================== */}
        <AnimatePresence>
          {activeTab === 'profile' && hasProfileChanges && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="settings-save-bar z-20 max-w-xl p-3.5 rounded-2xl bg-card/95 backdrop-blur-xl border border-primary/40 shadow-2xl flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">
                  Atenção — Tens alterações não guardadas!
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRevertProfile}
                  className="rounded-xl text-xs h-8 text-muted-foreground hover:text-foreground"
                >
                  Reverter
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="rounded-xl text-xs h-8 px-4 font-semibold bg-primary text-primary-foreground shadow-xs"
                >
                  {savingProfile ? 'A guardar…' : 'Guardar Alterações'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Descartar as alterações do perfil?</AlertDialogTitle><AlertDialogDescription>As alterações que ainda não guardaste serão perdidas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar a editar</AlertDialogCancel><AlertDialogAction onClick={onClose}>Descartar alterações</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}





