import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Star, Bookmark, Trash2, Plus, Copy, Check, Sparkles, ClipboardPaste } from 'lucide-react';
import {
  getFavoriteGifs,
  saveGifToFavorites,
  removeFavoriteGif,
  safeGifUrl,
  FAVORITE_GIFS_EVENT,
} from '@/lib/gif-utils';

interface GifPickerProps {
  onSelectGif: (gifUrl: string) => void;
}

export function GifPicker({ onSelectGif }: GifPickerProps) {
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const [open, setOpen] = useState(false);
  const [gifLink, setGifLink] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => getFavoriteGifs());

  const reloadFavorites = () => {
    setFavorites(getFavoriteGifs());
  };

  function handleOpenChange(value: boolean) {
    if (value) { reloadFavorites(); setPreviewError(false); }
    setOpen(value);
  }

  // Synchronize across components in real-time
  useEffect(() => {
    const handleSync = () => reloadFavorites();
    window.addEventListener(FAVORITE_GIFS_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(FAVORITE_GIFS_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  function handleAddFavorite(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const raw = gifLink.trim();
    if (!raw) return;

    const resolved = safeGifUrl(raw);
    if (!resolved) { toast.error('Usa uma ligação direta HTTPS para uma imagem GIF.'); return; }
    saveGifToFavorites(resolved);
    setGifLink('');
    setPreviewError(false);
    reloadFavorites();
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const resolved = safeGifUrl(text.trim()) || text.trim();
        setGifLink(resolved);
        setPreviewError(false);
      }
    } catch {
      // Clipboard read not permitted
    }
  }

  function handleSendDirect(url: string) {
    const trimmed = safeGifUrl(url);
    if (!trimmed) return;
    saveGifToFavorites(trimmed);
    onSelectGif(trimmed);
    setOpen(false);
    setGifLink('');
  }

  function handleRemove(url: string) {
    const updated = removeFavoriteGif(url);
    setFavorites(updated);
  }

  async function handleCopy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopiedUrl(url); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopiedUrl(null), 2000); }
    catch { toast.error('Não foi possível copiar. Verifica a permissão da área de transferência.'); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="GIFs Favoritos"
          title="GIFs Favoritos"
          className="mx-1 rounded-xl p-2 text-muted-foreground hover:bg-background hover:text-foreground hover:scale-105 active:scale-95 transition-all"
        >
          <Sparkles className="size-4 text-primary" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] rounded-3xl bg-card border-border text-card-foreground p-5 shadow-2xl flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle className="text-base font-semibold tracking-tight flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Star className="size-4 fill-primary" />
              </span>
              <span>GIFs Favoritos</span>
            </div>
            {favorites.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                {favorites.length} {favorites.length === 1 ? 'guardado' : 'guardados'}
              </span>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Cola o link de qualquer GIF para adicionares aos teus favoritos e enviares com um clique.
          </p>
        </DialogHeader>

        {/* Link Input Section */}
        <form onSubmit={handleAddFavorite} className="space-y-2 pt-1 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={gifLink}
                onChange={(e) => {
                  setGifLink(e.target.value);
                  setPreviewError(false);
                }}
                placeholder="Cola aqui o link do GIF (ex: https://.../animacao.gif)"
                className="h-10 rounded-2xl bg-secondary/60 border-border text-xs focus-visible:ring-primary pr-9"
                autoFocus
              />
              <button
                type="button"
                onClick={handlePaste}
                title="Colar da área de transferência"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg"
              >
                <ClipboardPaste className="size-3.5" />
              </button>
            </div>

            <Button
              type="submit"
              disabled={!gifLink.trim()}
              className="h-10 rounded-2xl text-xs font-semibold gap-1.5 px-3 shrink-0"
              title="Guardar nos Favoritos"
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>

            {gifLink.trim() && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleSendDirect(gifLink)}
                className="h-10 rounded-2xl text-xs font-semibold px-3 shrink-0"
                title="Enviar diretamente este GIF"
              >
                Enviar
              </Button>
            )}
          </div>

          {/* Instant link preview if typed */}
          {gifLink.trim() && (
            <div className="rounded-2xl border border-border bg-secondary/30 p-2 flex flex-col items-center justify-center max-h-40 overflow-hidden relative">
              <img
                src={safeGifUrl(gifLink.trim()) || gifLink.trim()}
                alt="Pré-visualização do GIF"
                onError={() => setPreviewError(true)}
                className="max-h-32 rounded-xl object-contain"
                referrerPolicy="no-referrer"
              />
              {previewError && (
                <p className="mt-1 text-[11px] text-muted-foreground font-medium text-center">
                  A pré-visualização não carregou, mas podes guardar e enviar o link na mesma.
                </p>
              )}
            </div>
          )}
        </form>

        {/* Favorites Grid */}
        <div className="flex-1 overflow-y-auto pr-1 min-h-[220px] max-h-[380px] pt-3">
          {favorites.length === 0 ? (
            <div className="py-14 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
              <Bookmark className="size-10 mb-2 opacity-30 text-primary" />
              <p className="font-semibold text-foreground text-sm">Ainda não tens GIFs favoritos</p>
              <p className="mt-1 text-[11px] max-w-xs leading-relaxed">
                Cola o link de um GIF no campo acima ou clica com o botão direito nas animações enviadas no chat para guardares na tua lista.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pb-2">
              {favorites.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="group relative rounded-2xl overflow-hidden border border-border bg-secondary/40 aspect-[4/3] cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                  onClick={() => handleSendDirect(url)}
                  title="Clica para enviar este GIF"
                >
                  <img
                    src={url}
                    alt="GIF Favorito"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Hover action bar */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(url);
                      }}
                      title="Copiar link"
                      className="p-1.5 rounded-xl bg-black/70 text-white hover:bg-black/90 transition-all hover:scale-110 shadow-xs"
                    >
                      {copiedUrl === url ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(url);
                      }}
                      title="Remover dos favoritos"
                      className="p-1.5 rounded-xl bg-black/70 text-destructive hover:bg-destructive hover:text-white transition-all hover:scale-110 shadow-xs"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white text-center font-medium">Enviar</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
