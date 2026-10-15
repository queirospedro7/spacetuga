import { readProfileImage } from '@/lib/profile-images';
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Camera, Image, LogOut } from 'lucide-react';
import type { MyProfile } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { bannerStyle } from '@/lib/banner-style';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: MyProfile;
  onUpdateProfile: (patch: Partial<MyProfile>) => void;
  onLogout: () => void;
}

const PRESET_BANNERS = [
  'linear-gradient(135deg, #0071e3 0%, #1982fc 100%)',
  'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
  'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
];

export function ProfileModal({
  open,
  onOpenChange,
  profile,
  onLogout,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [customStatus, setCustomStatus] = useState(profile.customStatus || '');
  const [about, setAbout] = useState(profile.about || '');
  const [status, setStatus] = useState(profile.status || 'online');
  const [hue, setHue] = useState(Number.isFinite(profile.hue) ? profile.hue : 210);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl || '');
  const [bannerPosition, setBannerPosition] = useState<number>(profile.bannerPosition ?? 50);
  const [imageError, setImageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const initialized = useRef<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { initialized.current = null; return; }
    if (initialized.current === profile.id) return;
    initialized.current = profile.id;
    setDisplayName(profile.displayName);
    setCustomStatus(profile.customStatus || '');
    setAbout(profile.about || '');
    setStatus(profile.status || 'online');
    setHue(Number.isFinite(profile.hue) ? profile.hue : 210);
    setAvatarUrl(profile.avatarUrl || '');
    setBannerUrl(profile.bannerUrl || '');
    setBannerPosition(profile.bannerPosition ?? 50);
    setImageError('');
  }, [open, profile]);

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError('');
    try { setAvatarUrl(await readProfileImage(file, 512)); }
    catch (error) { setImageError(error instanceof Error ? error.message : 'Não foi possível carregar o avatar.'); }
    e.target.value = '';
  }

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError('');
    try { setBannerUrl(await readProfileImage(file, 1400)); }
    catch (error) { setImageError(error instanceof Error ? error.message : 'Não foi possível carregar o banner.'); }
    e.target.value = '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try { await api.saveProfile({
      displayName: displayName.trim() || profile.displayName,
      customStatus: customStatus.trim(),
      about: about.trim(),
      status,
      emoji: profile.emoji,
      hue,
      avatarUrl,
      bannerUrl,
      bannerPosition,
    });
    onOpenChange(false);
    toast.success('Perfil guardado.');
    } catch (error) { setImageError(error instanceof Error ? error.message : 'Não foi possível guardar.'); }
    finally { setSaving(false); }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden rounded-[28px] bg-card border-border text-card-foreground shadow-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-border flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
              Personalização de Perfil
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configura o teu avatar, banner, estado e aparência no Tuga
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Real-time Preview Banner & Avatar */}
          <div className="relative rounded-2xl overflow-hidden border border-border shadow-xs">
            {/* Banner */}
            <div
              className="h-28 w-full bg-cover relative transition-all"
              style={bannerStyle(bannerUrl, PRESET_BANNERS[0], bannerPosition)}
            >
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="absolute top-2 right-2 px-2.5 py-1 rounded-xl bg-black/50 hover:bg-black/70 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Image className="size-3.5" />
                Alterar Banner
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerFile}
                className="hidden"
              />
            </div>

            {/* Profile Avatar overlapping */}
            <div className="p-4 pt-0 bg-secondary/40 flex items-end justify-between relative">
              <div className="flex items-end gap-3 -mt-9">
                <div className="relative group">
                  <div
                    className="w-16 h-16 rounded-2xl border-2 border-card shadow-md flex items-center justify-center text-2xl font-bold overflow-hidden bg-cover bg-center"
                    style={{
                      backgroundColor: `hsl(${hue}, 60%, 45%)`,
                      backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined,
                    }}
                  >
                    {!avatarUrl && displayName.trim().slice(0, 1).toUpperCase()}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                    title="Carregar Imagem de Avatar"
                  >
                    <Camera className="size-5" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFile}
                    className="hidden"
                  />
                </div>

                <div className="pb-1">
                  <h4 className="text-sm font-semibold text-foreground leading-tight">
                    {displayName || profile.displayName}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    @{profile.username}
                  </p>
                </div>
              </div>

              {customStatus && (
                <div className="pb-1">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-card border border-border text-[11px] font-medium text-foreground shadow-xs">
                    {customStatus}
                  </span>
                </div>
              )}
            </div>
          </div>

          {imageError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{imageError}</p>}

          {/* Banner Preset Palette */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Cores Pré-definidas do Banner</Label>
            <label className="flex items-center gap-3 text-xs text-muted-foreground">Cor personalizada<input aria-label="Cor personalizada do banner de perfil" type="color" value={/^#[0-9a-f]{6}$/i.test(bannerUrl) ? bannerUrl : '#6366f1'} onChange={(event) => setBannerUrl(event.target.value)} className="h-9 w-12 cursor-pointer rounded-lg" /></label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_BANNERS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setBannerUrl(preset)}
                  className={`w-8 h-8 rounded-xl border transition-all ${
                    bannerUrl === preset ? 'ring-2 ring-primary scale-105' : 'hover:scale-105'
                  }`}
                  style={{ background: preset }}
                  title="Aplicar Gradiente"
                />
              ))}
            </div>

            {bannerUrl && (bannerUrl.startsWith('data:') || bannerUrl.startsWith('http') || bannerUrl.startsWith('blob:')) && (
              <div className="space-y-1.5 p-3 rounded-2xl bg-secondary/40 border border-border mt-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Posição Vertical do Banner (Ajustar Enquadramento)</span>
                  <span className="font-mono">{bannerPosition}%</span>
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

          {/* Display Name & Custom Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">Nome de Exibição</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-9 rounded-xl bg-secondary/50 border-border text-xs text-foreground focus:border-primary"
                maxLength={32}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">Estado Personalizado</Label>
              <Input
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
                placeholder="ex: Em chamada, A programar..."
                className="h-9 rounded-xl bg-secondary/50 border-border text-xs text-foreground focus:border-primary"
                maxLength={60}
              />
            </div>
          </div>

          {/* Online presence */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-foreground">Presença</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 rounded-xl bg-secondary/50 border-border text-xs text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground">
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="away">Ausente</SelectItem>
                <SelectItem value="busy">Ocupado</SelectItem>
                <SelectItem value="invisible">Invisível</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color Hue Slider */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-secondary/40 border border-border">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Tom do Avatar ({hue}°)</span>
              <div
                className="w-4 h-4 rounded-full shadow-inner"
                style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
              />
            </div>
            <Slider
              min={0}
              max={360}
              step={1}
              value={[hue]}
              onValueChange={([val]) => setHue(val)}
              className="py-1"
            />
          </div>

          {/* Bio / About */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-foreground">Sobre Mim (Biografia)</Label>
            <Textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Conta um pouco sobre ti, os teus jogos favoritos ou projetos..."
              rows={2}
              maxLength={250}
              className="rounded-xl bg-secondary/50 border-border text-xs text-foreground placeholder:text-muted-foreground focus:border-primary resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLogoutOpen(true)}
              className="mr-auto h-9 rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="mr-2 size-4" />
              Terminar sessão
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 shadow-xs"
            >
              {saving ? 'A guardar…' : 'Guardar Perfil'}
            </Button>
          </div>
        </form>
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
            onClick={() => { onOpenChange(false); onLogout(); }}
          >
            Terminar sessão
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
