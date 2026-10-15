import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Settings2, Image, Sparkles, LogOut, Download, Moon, Sun, Monitor, ShieldBan, Volume2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { applyAccentColor } from '@/lib/theme-accent';
import type { PublicUser } from '@/types';
import { api } from '@/lib/api';
import { readNumberPreference } from '@/lib/preferences';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const PRESET_APP_BACKGROUNDS = [
  { label: 'Padrão Escuro', value: '' },
  { label: 'Aurora Boreal', value: 'radial-gradient(ellipse at top, rgba(16, 185, 129, 0.12), transparent 50%), radial-gradient(ellipse at bottom, rgba(59, 130, 246, 0.12), transparent 50%)' },
  { label: 'Tuga Roxo', value: 'radial-gradient(ellipse at top left, rgba(147, 51, 234, 0.15), transparent 50%), radial-gradient(ellipse at bottom right, rgba(236, 72, 153, 0.12), transparent 50%)' },
  { label: 'Cyberpunk Carmim', value: 'radial-gradient(ellipse at top, rgba(239, 68, 68, 0.15), transparent 55%), radial-gradient(ellipse at bottom, rgba(249, 115, 22, 0.12), transparent 55%)' },
  { label: 'Oceano Profundo', value: 'linear-gradient(180deg, rgba(14, 165, 233, 0.08) 0%, rgba(3, 105, 161, 0.15) 100%)' },
  { label: 'Minimalista Neutro', value: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.03) 0%, transparent 80%)' },
];

interface SystemSettingsDialogProps {
  blockedUsers?: PublicUser[];
  readReceiptsEnabled?: boolean;
  onReadReceiptsChange?: (enabled: boolean) => void;
  onLogout?: () => void;
  installPrompt?: InstallPromptEvent | null;
  onInstall?: () => void;
}

export function SystemSettingsDialog({
  blockedUsers = [],
  readReceiptsEnabled = false,
  onReadReceiptsChange,
  onLogout,
  installPrompt,
  onInstall,
}: SystemSettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sounds, setSounds] = useState(() => localStorage.getItem('melo.sounds') !== 'false');
  const [compact, setCompact] = useState(() => localStorage.getItem('melo.compact') === 'true');
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('melo.reduceMotion') === 'true');
  const [volume, setVolume] = useState(() => readNumberPreference('melo.soundVolume', 28, 0, 100));
  const [fontSize, setFontSize] = useState(() => readNumberPreference('melo.fontSize', 16, 14, 18));
  const [corner, setCorner] = useState(() => readNumberPreference('melo.corner', 14, 8, 22));
  const [appBg, setAppBg] = useState(() => localStorage.getItem('melo.appBg') || '');
  const [accent, setAccent] = useState(() => localStorage.getItem('tuga.accent') || '#0A84FF');
  const [backgroundError, setBackgroundError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('melo-compact', compact);
    document.documentElement.classList.toggle('melo-reduced-motion', reduceMotion);
  }, [compact, reduceMotion]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
    document.documentElement.style.setProperty('--radius', `${corner}px`);
  }, [fontSize, corner]);

  useEffect(() => {
    applyAccentColor(accent);
    try { localStorage.setItem('tuga.accent', accent); } catch { /* Storage may be unavailable in private browsing. */ }
  }, [accent]);

  // Apply custom background to body/app
  useEffect(() => {
    const root = document.getElementById('root') || document.body;
    if (appBg) {
      root.style.backgroundImage = appBg.startsWith('data:') || appBg.startsWith('http') ? `url(${appBg})` : appBg;
      root.style.backgroundSize = 'cover';
      root.style.backgroundAttachment = 'fixed';
      root.style.backgroundPosition = 'center';
    } else {
      root.style.backgroundImage = '';
    }
  }, [appBg]);

  function handleCustomBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 1_500_000) {
      setBackgroundError('Escolhe uma imagem com menos de 1,5 MB.');
      e.target.value = '';
      return;
    }
    setBackgroundError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const res = event.target?.result as string;
      if (res) {
        setAppBg(res);
        localStorage.setItem('melo.appBg', res);
      }
    };
    reader.readAsDataURL(file);
  }

  function selectBg(value: string) {
    setAppBg(value);
    localStorage.setItem('melo.appBg', value);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Definições" aria-label="Definições" className="size-8 shrink-0 rounded-lg">
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[28px] sm:max-w-2xl p-0 bg-card border-border shadow-2xl">
        <DialogHeader className="p-6 pb-5 border-b border-border bg-secondary/20">
          <DialogTitle className="text-xl font-semibold tracking-tight">Definições</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Personaliza a aparência, privacidade e comportamento do Tuga.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* 1. Theme / Appearance */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tema & Aparência</h3>
            
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-medium transition-all ${
                  theme === 'light' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-secondary/50 text-foreground hover:bg-secondary'
                }`}
              >
                <Sun className="size-4" /> Claro
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-medium transition-all ${
                  theme === 'dark' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-secondary/50 text-foreground hover:bg-secondary'
                }`}
              >
                <Moon className="size-4" /> Escuro
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-medium transition-all ${
                  theme === 'system' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-secondary/50 text-foreground hover:bg-secondary'
                }`}
              >
                <Monitor className="size-4" /> Sistema
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="sm:col-span-2 flex items-center justify-between gap-4 rounded-2xl border border-border bg-secondary/40 p-3.5">
                <div><p className="text-xs font-medium">Cor de destaque</p><p className="mt-1 text-[11px] text-muted-foreground">O texto ajusta-se automaticamente para manter o contraste.</p></div>
                <input aria-label="Escolher cor de destaque" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} className="size-10 cursor-pointer rounded-xl border border-border bg-transparent p-1" />
              </div>
              <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
                <span className="flex justify-between text-xs font-medium mb-2">
                  <span>Tamanho do texto</span>
                  <span className="text-muted-foreground">{fontSize}px</span>
                </span>
                <input
                  className="w-full accent-foreground"
                  type="range"
                  min="14"
                  max="19"
                  value={fontSize}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setFontSize(value);
                    localStorage.setItem('melo.fontSize', String(value));
                  }}
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
                <span className="flex justify-between text-xs font-medium mb-2">
                  <span>Arredondamento</span>
                  <span className="text-muted-foreground">{corner}px</span>
                </span>
                <input
                  className="w-full accent-foreground"
                  type="range"
                  min="8"
                  max="24"
                  value={corner}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setCorner(value);
                    localStorage.setItem('melo.corner', String(value));
                  }}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={(event) => {
                    setCompact(event.target.checked);
                    localStorage.setItem('melo.compact', String(event.target.checked));
                  }}
                  className="rounded accent-foreground"
                />
                <span>Interface compacta</span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(event) => {
                    setReduceMotion(event.target.checked);
                    localStorage.setItem('melo.reduceMotion', String(event.target.checked));
                  }}
                  className="rounded accent-foreground"
                />
                <span>Reduzir animações</span>
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><ShieldBan className="size-3.5" /> Privacidade</h3>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-secondary/40 p-3.5">
              <span><span className="block text-xs font-medium">Recibos de leitura</span><span className="mt-1 block text-[11px] text-muted-foreground">Permite que outras pessoas saibam quando leste as mensagens delas.</span></span>
              <input type="checkbox" checked={readReceiptsEnabled} onChange={(event) => onReadReceiptsChange?.(event.target.checked)} className="size-4 shrink-0 accent-foreground" />
            </label>
            <p className="text-[11px] text-muted-foreground">Desativado por predefinição. Quando está desligado, as tuas leituras não são partilhadas.</p>
          </section>

          {/* 2. Custom Backgrounds */}
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> Fundo da Aplicação
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_APP_BACKGROUNDS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectBg(preset.value)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                    appBg === preset.value ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-secondary/40 text-foreground hover:bg-secondary'
                  }`}
                >
                  <div
                    className="size-4 rounded-md border border-border shrink-0"
                    style={{ background: preset.value || 'var(--background)' }}
                  />
                  <span className="truncate text-[11px]">{preset.label}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-9 rounded-xl text-xs gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Image className="size-3.5" /> Imagem do computador...
              </Button>
              {appBg && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-xl text-xs text-muted-foreground"
                  onClick={() => selectBg('')}
                >
                  Repor padrão
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCustomBgFile} className="hidden" />
            </div>
          </section>
          {backgroundError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{backgroundError}</p>}

          {/* 3. Sound settings */}
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Volume2 className="size-3.5" /> Sons & Notificações
            </h3>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/40 border border-border">
              <span className="text-xs">Sons de interface</span>
              <input
                type="checkbox"
                checked={sounds}
                onChange={(event) => {
                  setSounds(event.target.checked);
                  localStorage.setItem('melo.sounds', String(event.target.checked));
                }}
                className="accent-foreground"
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
              <span className="flex justify-between text-xs font-medium mb-2">
                <span>Volume dos efeitos</span>
                <span className="text-muted-foreground">{volume}%</span>
              </span>
              <input
                className="w-full accent-foreground"
                type="range"
                min="0"
                max="60"
                value={volume}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setVolume(value);
                  localStorage.setItem('melo.soundVolume', String(value));
                }}
              />
            </div>
          </section>

          {/* 4. Blocked Users */}
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldBan className="size-3.5" /> Pessoas Bloqueadas
            </h3>

            {blockedUsers.length ? (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {blockedUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2 text-xs">
                    <span className="truncate">{user.displayName} <span className="text-muted-foreground">@{user.username}</span></span>
                    <Button variant="secondary" className="h-7 rounded-lg text-[11px]" onClick={() => api.blockUser(user.id, false)}>
                      Desbloquear
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Não tens nenhuma pessoa bloqueada de momento.</p>
            )}
          </section>

          {/* 5. Footer Actions (Instalar & Terminar Sessão) */}
          <section className="border-t border-border pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            {installPrompt && (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto h-9 rounded-xl text-xs gap-1.5"
                onClick={() => {
                  if (onInstall) onInstall();
                  else installPrompt.prompt();
                }}
              >
                <Download className="size-3.5" /> Instalar Aplicação
              </Button>
            )}

            {onLogout && (
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto ml-auto h-9 rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                onClick={() => setLogoutOpen(true)}
              >
                <LogOut className="size-3.5" /> Terminar sessão
              </Button>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Tens a certeza que queres terminar sessão?</AlertDialogTitle>
          <AlertDialogDescription>
            Vais perder a sessão atual e terás de iniciar sessão novamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { setOpen(false); onLogout?.(); }}
          >
            Terminar sessão
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
