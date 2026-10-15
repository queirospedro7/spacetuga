import { GroupConversationHeader } from '@/components/GroupConversationHeader';
import { useRef, useEffect, useState, lazy, Suspense, type KeyboardEvent } from 'react';
import { getDraft, setDraft } from '@/lib/conversation-drafts';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Phone,
  ChevronLeft,
  Hash,
  Volume2,
  Send,
  ShieldBan,
  BarChart2,
  BarChart3,
  Paperclip,
  Download,
  Megaphone,
  Trash2,
  Maximize2,
  Check,
  X,
  Image as ImageIcon,
  Users,
  Crown,
  Shield,
} from 'lucide-react';
import type { PublicUser, MyProfile, Message, Community, Channel, ChannelMessage, RemoteMedia } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { BrandMark } from '@/components/BrandMark';

const CallStage = lazy(() => import('./CallStage').then((module) => ({ default: module.CallStage })));
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { api } from '@/lib/api';
import { playUiSound } from '@/lib/ui-sound';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GifPicker } from '@/components/GifPicker';
import { UserProfileModal } from '@/components/UserProfileModal';
import { toast } from 'sonner';
import {
  Bookmark,
  Copy,
  CornerUpLeft,
} from 'lucide-react';
import {
  safeGifUrl,
  getGifUrlFromMessage,
  saveGifToFavorites,
  isGifFavorited,
  FAVORITE_GIFS_EVENT,
} from '@/lib/gif-utils';

function isImageAttachment(attachment: NonNullable<Message['attachment']>): boolean {
  if (attachment.type?.startsWith('image/')) return true;
  const name = attachment.name?.toLowerCase() || '';
  return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(name);
}

// -----------------------------------------------------------------------------
// Votação Mais Bonita (Modern Beautiful Poll Card)
// -----------------------------------------------------------------------------
function PollCard({
  poll,
  scope,
  messageId,
  profileId,
}: {
  poll: NonNullable<Message['poll']>;
  scope: 'dm' | 'channel';
  messageId: string;
  profileId: string;
}) {
  const totalVotes = Object.keys(poll.votes || {}).length;
  const myVote = poll.votes?.[profileId];

  const optionCounts = poll.options.map((_, index) => {
    return Object.values(poll.votes || {}).filter((vote) => vote === index).length;
  });

  const maxVotes = Math.max(0, ...optionCounts);

  return (
    <div className="mt-2 w-full max-w-md rounded-2xl border border-primary/20 bg-card/90 p-4 shadow-sm backdrop-blur-md">
      {/* Poll Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
          <BarChart2 className="size-3" />
          Votação
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}
        </span>
      </div>

      <p className="mb-3.5 text-sm font-semibold tracking-tight text-foreground leading-snug">
        {poll.question}
      </p>

      {/* Options List */}
      <div className="space-y-2">
        {poll.options.map((option, index) => {
          const count = optionCounts[index];
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isSelected = myVote === index;
          const isWinner = totalVotes > 0 && count === maxVotes && count > 0;

          return (
            <button
              key={index}
              type="button"
              onClick={() => api.votePoll(scope, messageId, index)}
              className={`group relative flex min-h-[42px] w-full items-center justify-between overflow-hidden rounded-xl border px-3 py-2 text-left text-xs transition-all active:scale-[0.99] ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-xs'
                  : 'border-border/80 bg-background/70 hover:border-primary/40 hover:bg-background/95'
              }`}
            >
              {/* Animated Progress Bar fill */}
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out ${
                  isSelected ? 'bg-primary/25' : 'bg-secondary/80 group-hover:bg-secondary'
                }`}
                style={{ width: `${percent}%` }}
              />

              {/* Option label & check indicator */}
              <div className="relative flex items-center gap-2.5 min-w-0 pr-2">
                <span
                  className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground scale-105'
                      : 'border-muted-foreground/30 bg-background/80 text-transparent group-hover:border-primary/50'
                  }`}
                >
                  <Check className="size-3" />
                </span>
                <span
                  className={`font-medium truncate ${
                    isSelected ? 'text-primary font-semibold' : 'text-foreground'
                  }`}
                >
                  {option}
                </span>
                {isWinner && (
                  <span className="shrink-0 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                    Mais votada
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="relative flex items-baseline gap-1.5 shrink-0 text-right">
                <span className={`font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {percent}%
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({count})
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-2">
        <span>{myVote !== undefined ? '✓ Voto registado' : 'Ainda não votaste'}</span>
        <span>Clica para votar ou mudar de opção</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Message Content (Supports Text, GIFs with Click to Preview Lightbox & Bookmark)
// -----------------------------------------------------------------------------
function MessageContent({
  text,
  onOpenLightbox,
}: {
  text: string;
  onOpenLightbox: (imageUrl: string, title: string) => void;
}) {
  const gif = safeGifUrl(text);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [favorited, setFavorited] = useState<boolean>(() => (gif ? isGifFavorited(gif) : false));
  const failed = failedUrl === gif;

  useEffect(() => {
    if (!gif) return;
    const handleSync = () => setFavorited(isGifFavorited(gif));
    window.addEventListener(FAVORITE_GIFS_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(FAVORITE_GIFS_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [gif]);

  if (gif && !failed) {
    return (
      <div
        className="group relative mt-1 max-w-sm sm:max-w-md inline-block overflow-hidden rounded-2xl border border-border bg-secondary/30 shadow-xs hover:border-primary/40 hover:shadow-md transition-all"
      >
        <img
          src={gif}
          alt="GIF"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(gif)}
          onClick={() => onOpenLightbox(gif, 'GIF')}
          className="max-h-72 w-auto max-w-full rounded-2xl object-contain transition-transform duration-300 group-hover:scale-[1.01] cursor-pointer"
          title="Clica para ver o GIF em grande"
        />
        {/* Floating actions on GIF hover */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              saveGifToFavorites(gif);
            }}
            className="rounded-lg bg-black/70 p-1.5 text-white hover:bg-primary hover:text-primary-foreground backdrop-blur-md transition-all shadow-xs"
            title={favorited ? 'GIF nos Favoritos' : 'Guardar GIF nos Favoritos'}
          >
            <Bookmark className={`size-3.5 ${favorited ? 'fill-primary text-primary' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLightbox(gif, 'GIF');
            }}
            className="rounded-lg bg-black/70 p-1.5 text-white hover:bg-black/90 backdrop-blur-md transition-all shadow-xs"
            title="Ver em tamanho grande"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (gif) {
    return (
      <div className="flex items-center gap-2">
        <a href={gif} target="_blank" rel="noreferrer" className="text-primary underline">
          Abrir GIF
        </a>
        <button
          type="button"
          onClick={() => saveGifToFavorites(gif)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
        >
          <Bookmark className={`size-3 ${favorited ? 'fill-primary text-primary' : ''}`} />
          {favorited ? 'Nos Favoritos' : 'Guardar GIF'}
        </button>
      </div>
    );
  }

  return <span>{text}</span>;
}

// -----------------------------------------------------------------------------
// Large Photo Attachment Card (Large High-Res Preview & Lightbox)
// -----------------------------------------------------------------------------
function ImageAttachmentCard({
  attachment,
  onOpenLightbox,
}: {
  attachment: NonNullable<Message['attachment']>;
  onOpenLightbox: (imageUrl: string, title: string, size?: number, attachmentId?: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [url, setUrl] = useState('');
  const previewHost = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (!previewHost.current || attachment.size > 12 * 1024 * 1024) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setNearViewport(true); observer.disconnect(); } }, { rootMargin: '300px' });
    observer.observe(previewHost.current);
    return () => observer.disconnect();
  }, [attachment.id, attachment.size]);
  useEffect(() => {
    if (!nearViewport) return;
    let active = true;
    let objectUrl = '';
    const request = new AbortController();
    void api.downloadFile(attachment.id, request.signal).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setHasError(true); });
    return () => { active = false; request.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id, nearViewport]);
  const isGif =
    attachment.type?.toLowerCase() === 'image/gif' ||
    attachment.name?.toLowerCase().endsWith('.gif');
  const size =
    attachment.size < 1024 * 1024
      ? `${Math.max(1, Math.round(attachment.size / 1024))} KB`
      : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`;

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(true);
    try {
      const blob = await api.downloadFile(attachment.id);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = attachment.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch {
      toast.error('Não foi possível transferir a imagem.');
    } finally {
      setDownloading(false);
    }
  }

  if (hasError || attachment.size > 12 * 1024 * 1024) {
    return <AttachmentCard attachment={attachment} />;
  }

  return (
    <div
      ref={previewHost}
      onClick={() => { if (url) onOpenLightbox(url, attachment.name, attachment.size, attachment.id); }}
      className="group relative mt-2 max-w-sm sm:max-w-md md:max-w-lg cursor-pointer overflow-hidden rounded-2xl border border-border/80 bg-secondary/30 shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
      title="Clica para abrir a foto em ecrã inteiro"
    >
      <div className="relative max-h-96 min-h-[140px] w-full overflow-hidden flex items-center justify-center bg-black/5 dark:bg-black/20">
        {!url && <span className="text-xs text-muted-foreground p-4" role="status">A preparar a imagem…</span>}
        <img
          src={url || undefined}
          alt={attachment.name}
          loading="lazy"
          onError={() => setHasError(true)}
          className="max-h-96 w-auto max-w-full rounded-2xl object-contain transition-transform duration-300 group-hover:scale-[1.01]"
        />
        {/* Hover overlay bar */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2.5">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md">
              {size}
            </span>
            <div className="flex items-center gap-1.5">
              {isGif && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveGifToFavorites(url);
                  }}
                  className="rounded-lg bg-black/60 p-1.5 text-white/90 backdrop-blur-md hover:bg-primary hover:text-white transition"
                  title="Guardar GIF nos Favoritos"
                >
                  <Bookmark className="size-3.5" />
                </button>
              )}
              <span
                className="rounded-lg bg-black/60 p-1.5 text-white/90 backdrop-blur-md hover:bg-black/80 hover:text-white"
                title="Ver em tamanho grande"
              >
                <Maximize2 className="size-3.5" />
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-white">
            <p className="truncate text-xs font-medium max-w-[80%]">{attachment.name}</p>
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownload}
              title="Transferir foto"
              className="rounded-lg bg-black/60 p-1.5 hover:bg-black/80 text-white backdrop-blur-md transition"
            >
              <Download className={`size-3.5 ${downloading ? 'animate-bounce' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Generic File Attachment Card (for non-image files like zip, pdf, docx, etc.)
// -----------------------------------------------------------------------------
function AttachmentCard({ attachment }: { attachment: NonNullable<Message['attachment']> }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const size =
    attachment.size < 1024 * 1024
      ? `${Math.max(1, Math.round(attachment.size / 1024))} KB`
      : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`;

  async function download() {
    setDownloading(true);
    setError('');
    try {
      const blob = await api.downloadFile(attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao transferir.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-2 flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-background/80 p-3 shadow-xs">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary">
        <Paperclip className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.name}</span>
        <span className="text-[10px] text-muted-foreground">{size}</span>
        {error && <span className="block text-[10px] text-destructive">{error}</span>}
      </span>
      <button
        type="button"
        disabled={downloading}
        onClick={() => void download()}
        aria-label={`Transferir ${attachment.name}`}
        className="grid size-8 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        <Download className={`size-4 ${downloading ? 'animate-bounce' : ''}`} />
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ChatPanel Component
// -----------------------------------------------------------------------------
interface ChatPanelProps {
  // Mode info
  activeCommunity: Community | null;
  activeChannel: Channel | null;
  activeUser: PublicUser | null;

  // Messages
  messages: Message[];
  channelMessages: ChannelMessage[];
  allUsers: PublicUser[];
  profile: MyProfile;
  typingFrom: string | null;

  // Actions
  onSendMessage: (text: string) => Promise<boolean>;
  onSendTyping: () => void;
  onCall: (kind: 'voice' | 'video') => void;
  activeCallExists: boolean;
  onBlockUser: (userId: string, blocked: boolean) => void;
  isBlocked: boolean;
  onBack?: () => void;

  // Voice stage
  voiceState: Record<string, string[]>;
  activeVoiceChannelId: string | null;
  onJoinVoice: (channelId: string) => void;
  onOpenChannel?: (channelId: string) => void;
  onLeaveVoice: () => void;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleDeafen: () => void;
  onToggleMute?: () => void;
  remoteVideoStreams: Record<string, RemoteMedia>;
  voiceLocalStream: MediaStream | null;
  onLocalVideoStreamChange: (kind: 'camera' | 'screen', stream: MediaStream | null) => void;
  onAudioDeviceChange: (id: string) => void;
  pendingVoiceChannelId: string | null;
}

function formatMsgTime(at: number): string {
  const d = new Date(at);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Ontem ${format(d, 'HH:mm')}`;
  return format(d, 'dd/MM HH:mm');
}

export function ChatPanel({
  activeCommunity,
  activeChannel,
  activeUser,
  messages,
  channelMessages,
  allUsers,
  profile,
  typingFrom,
  onSendMessage,
  onSendTyping,
  onCall,
  activeCallExists,
  onBlockUser,
  isBlocked,
  onBack,
  voiceState,
  activeVoiceChannelId,
  onJoinVoice,
  onOpenChannel,
  onLeaveVoice,
  isMuted,
  isDeafened,
  onToggleDeafen,
  onToggleMute,
  remoteVideoStreams,
  voiceLocalStream,
  onLocalVideoStreamChange,
  onAudioDeviceChange,
  pendingVoiceChannelId,
}: ChatPanelProps) {
  const draftKey = `${profile.id}:${activeCommunity && activeChannel ? activeChannel.id : activeUser?.id || 'home'}`;
  const [text, setText] = useState(() => getDraft(draftKey));
  useEffect(() => { setDraft(draftKey, text); }, [draftKey, text]);
  const [confirmCall, setConfirmCall] = useState<'voice' | 'video' | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmVoiceJoin, setConfirmVoiceJoin] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [publishingPoll, setPublishingPoll] = useState(false);
  const pollInFlight = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [sendingText, setSendingText] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [inspectedUser, setInspectedUser] = useState<PublicUser | null>(null);

  // File preview before sending (Large photos with preview)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilePreview, setPendingFilePreview] = useState<string | null>(null);
  const uploadInFlight = useRef(false);
  useEffect(() => () => { if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview); }, [pendingFilePreview]);

  // Delete message confirmation
  const [messageToDelete, setMessageToDelete] = useState<{
    scope: 'dm' | 'channel';
    messageId: string;
  } | null>(null);

  // Lightbox for photos & GIFs
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    size?: number;
    attachmentId?: string;
  } | null>(null);

  // Members list sidebar toggle for community channels
  const [showMembersList, setShowMembersList] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canPostAnnouncement =
    !!activeCommunity &&
    !!activeChannel &&
    (activeCommunity.ownerId === profile.id ||
      activeCommunity.admins?.includes(profile.id) ||
      (activeCommunity.roles || []).some((role) => activeCommunity.memberRoles?.[profile.id]?.includes(role.id) && role.permissions?.administrator) ||
      profile.globalRole === 'owner' ||
      profile.globalRole === 'admin');

  function selectFileForPreview(file?: File) {
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setPendingFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPendingFilePreview(objectUrl);
    } else {
      setPendingFile(file);
      setPendingFilePreview(null);
    }
  }

  function clearPendingFile() {
    if (pendingFilePreview) {
      URL.revokeObjectURL(pendingFilePreview);
    }
    setPendingFile(null);
    setPendingFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadSelectedFile(file?: File, captionText?: string) {
    if (!file) return false;
    const target =
      activeCommunity && activeChannel
        ? { type: 'channel' as const, id: activeCommunity.id, channelId: activeChannel.id }
        : activeUser
        ? { type: 'dm' as const, id: activeUser.id }
        : null;
    if (!target) return false;
    setUploading(true);
    setUploadError('');
    try {
      const attachment = await api.uploadFile(file, target);
      await api.shareFileConfirmed(attachment.id, target.type, captionText);
      playUiSound('send');
      return true;
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'Não foi possível enviar o ficheiro.');
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function handleSendGif(gifUrl: string) {
    if (await onSendMessage(`GIF:${gifUrl}`)) playUiSound('send');
  }

  function handleOpenLightbox(
    url: string,
    title: string,
    size?: number,
    attachmentId?: string
  ) {
    setLightboxImage({ url, title, size, attachmentId });
  }

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, channelMessages, typingFrom]);

  useEffect(() => {
    const markVisibleMessages = () => {
      if (!activeUser || profile.readReceiptsEnabled !== true || document.visibilityState !== 'visible')
        return;
      const latestUnread = [...messages]
        .reverse()
        .find((message) => message.from === activeUser.id && !message.readAt);
      if (latestUnread) api.markConversationRead(activeUser.id, latestUnread.at);
    };
    markVisibleMessages();
    document.addEventListener('visibilitychange', markVisibleMessages);
    return () => document.removeEventListener('visibilitychange', markVisibleMessages);
  }, [activeUser, messages, profile.readReceiptsEnabled]);

  async function send() {
    if (uploadInFlight.current) return;
    const trimmed = text.trim();
    if (pendingFile) {
      const fileToUpload = pendingFile;
      const caption = trimmed;
      uploadInFlight.current = true;
      try { if (await uploadSelectedFile(fileToUpload, caption)) { clearPendingFile(); setDraft(draftKey, ''); setText(''); } }
      finally { uploadInFlight.current = false; }
      return;
    }
    if (!trimmed) return;
    uploadInFlight.current = true; setSendingText(true);
    try { if (await onSendMessage(trimmed)) { playUiSound('send'); setDraft(draftKey, ''); setText(''); } }
    finally { uploadInFlight.current = false; setSendingText(false); }
  }

  async function createPoll(event: React.FormEvent) {
    event.preventDefault();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!pollQuestion.trim() || options.length < 2) return;
    if (pollInFlight.current) return;
    pollInFlight.current = true; setPublishingPoll(true);
    try {
    if (activeCommunity && activeChannel) await api.createPollConfirmed('channel', activeCommunity.id, pollQuestion.trim(), options, activeChannel.id);
    else if (activeUser) await api.createPollConfirmed('dm', activeUser.id, pollQuestion.trim(), options);
    else return;
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollOpen(false);
    } catch { toast.error('Não foi possível publicar a votação. As opções foram mantidas.'); }
    finally { pollInFlight.current = false; setPublishingPoll(false); }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          selectFileForPreview(file);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Modal: Delete Message Confirmation (Shared)
  // ---------------------------------------------------------------------------
  const deleteConfirmationModal = (
    <Dialog
      open={messageToDelete !== null}
      onOpenChange={(open) => !open && setMessageToDelete(null)}
    >
      <DialogContent className="rounded-3xl sm:max-w-sm bg-card border-border shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-destructive flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-4" />
            </span>
            <span>Eliminar mensagem?</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Tens a certeza de que queres eliminar esta mensagem? Esta ação não pode ser desfeita.
          </p>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button disabled={deletingMessage} variant="secondary" onClick={() => setMessageToDelete(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={deletingMessage}
            onClick={async () => {
              if (messageToDelete) {
                setDeletingMessage(true);
                try { await api.deleteMessageConfirmed(messageToDelete.scope, messageToDelete.messageId); setMessageToDelete(null); }
                catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível eliminar a mensagem.'); }
                finally { setDeletingMessage(false); }
              }
            }}
          >
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ---------------------------------------------------------------------------
  // Modal: Image Lightbox Preview (Large Photos & Fullscreen View)
  // ---------------------------------------------------------------------------
  const lightboxModal = (
    <Dialog open={lightboxImage !== null} onOpenChange={(open) => !open && setLightboxImage(null)}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[92vh] p-4 bg-background/95 backdrop-blur-2xl border-border rounded-3xl flex flex-col items-center shadow-2xl">
        <DialogHeader className="w-full flex flex-row items-center justify-between pb-2">
          <div className="min-w-0 pr-4">
            <DialogTitle className="text-sm font-semibold truncate text-foreground">
              {lightboxImage?.title || 'Visualização da Foto'}
            </DialogTitle>
            {lightboxImage?.size && (
              <p className="text-[11px] text-muted-foreground">
                {lightboxImage.size < 1024 * 1024
                  ? `${Math.max(1, Math.round(lightboxImage.size / 1024))} KB`
                  : `${(lightboxImage.size / (1024 * 1024)).toFixed(2)} MB`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lightboxImage?.url && (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 rounded-xl text-xs gap-1.5"
                onClick={() => {
                  saveGifToFavorites(lightboxImage.url);
                }}
              >
                <Bookmark className="size-3.5 text-primary" />
                Guardar nos Favoritos
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="h-8 rounded-xl text-xs gap-1.5"
              onClick={() => {
                if (lightboxImage?.attachmentId) {
                  void (async () => {
                    const blob = await api.downloadFile(lightboxImage.attachmentId!);
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = lightboxImage.title;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
                  })().catch(() => toast.error('Não foi possível transferir a imagem.'));
                } else if (lightboxImage?.url) {
                  window.open(lightboxImage.url, '_blank');
                }
              }}
            >
              <Download className="size-3.5" />
              Transferir
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 w-full flex items-center justify-center overflow-hidden rounded-2xl bg-black/10 dark:bg-black/40 p-2">
          <img
            src={lightboxImage?.url}
            alt={lightboxImage?.title || 'Foto em alta resolução'}
            className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
        </div>
      </DialogContent>
    </Dialog>
  );

  // 1. VOID / EMPTY STATE (Nothing selected)
  if (!activeCommunity && !activeUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background text-foreground select-none text-center transition-colors duration-200">
        <BrandMark className="mb-1 size-16 rounded-[22px] shadow-xs" />
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-1.5">
          Bem-vindo ao Tuga
        </h2>
        <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-6">
          Seleciona uma conversa ou um servidor no menu lateral para começar a comunicar em tempo real.
        </p>
      </div>
    );
  }

  // 2. ADVANCED CALL & VOICE STAGE (Screen Share, Video Feeds, Participants)
  if (activeCommunity && activeChannel?.type === 'voice') {
    const channelPeers = voiceState[activeChannel.id] || [];
    const isConnected = activeVoiceChannelId === activeChannel.id;

    if (isConnected) {
      return (
        <Suspense fallback={<div role="status" className="flex-1 grid place-items-center">A preparar a chamada…</div>}><CallStage
          channel={activeChannel}
          communityName={activeCommunity.name}
          community={activeCommunity}
          members={channelPeers}
          allUsers={allUsers}
          profile={profile}
          isMuted={isMuted}
          isDeafened={isDeafened}
          onToggleDeafen={onToggleDeafen}
          onToggleMute={onToggleMute || (() => {})}
          onLeave={onLeaveVoice}
          remoteVideoStreams={remoteVideoStreams}
          voiceLocalStream={voiceLocalStream}
          onLocalVideoStreamChange={onLocalVideoStreamChange}
          onAudioDeviceChange={onAudioDeviceChange}
        /></Suspense>
      );
    }

    // When channel selected but user not connected yet
    return (
      <div className="flex-1 flex flex-col bg-background text-foreground select-none transition-colors duration-200">
        {/* Header */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between bg-card/60 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Voltar"
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground md:hidden"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <Volume2 className="size-5 text-emerald-500" />
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              {activeChannel.name}
            </h3>
            <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">
              Canal de Voz
            </span>
          </div>

          {pendingVoiceChannelId === activeChannel.id ? (
            <Button
              size="sm"
              disabled
              className="h-8 rounded-xl bg-secondary text-muted-foreground font-medium text-xs"
            >
              <span className="mr-2 size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
              A ligar…
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setConfirmVoiceJoin(true)}
              className="h-8 rounded-xl bg-foreground text-background font-semibold text-xs shadow-xs"
            >
              {activeVoiceChannelId && activeVoiceChannelId !== activeChannel.id
                ? 'Mudar de chamada'
                : 'Entrar na chamada'}
            </Button>
          )}
        </div>

        {/* Preview Lounge Grid */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <div className="w-full max-w-4xl text-center">
            <div className="w-16 h-16 rounded-3xl bg-secondary border border-border flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Volume2 className="size-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {activeChannel.name}
            </h3>
            <p className="text-xs text-muted-foreground mb-6">
              {channelPeers.length} {channelPeers.length === 1 ? 'pessoa presente' : 'pessoas presentes'} neste canal
            </p>

            <div className="flex justify-center gap-3 flex-wrap mb-8">
              {channelPeers.map((uid) => {
                const userObj = uid === profile.id ? profile : allUsers.find((u) => u.id === uid);
                if (!userObj) return null;
                return (
                  <div
                    key={uid}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border shadow-xs w-28"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-inner overflow-hidden bg-cover bg-center"
                      style={{
                        backgroundColor: `hsl(${userObj.hue}, 60%, 45%)`,
                        backgroundImage: userObj.avatarUrl ? `url(${userObj.avatarUrl})` : undefined,
                      }}
                    >
                      {!userObj.avatarUrl && userObj.displayName.trim().slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-foreground truncate w-full">
                      {userObj.displayName}
                    </span>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={() => setConfirmVoiceJoin(true)}
              className="h-10 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md active:scale-95 transition-transform"
            >
              {activeVoiceChannelId && activeVoiceChannelId !== activeChannel.id
                ? 'Mudar de chamada'
                : 'Conectar e Entrar na Sala'}
            </Button>
          </div>
        </div>
        <Dialog open={confirmVoiceJoin} onOpenChange={setConfirmVoiceJoin}>
          <DialogContent className="rounded-3xl sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {activeVoiceChannelId && activeVoiceChannelId !== activeChannel.id
                  ? 'Mudar de chamada?'
                  : 'Entrar na chamada?'}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {activeVoiceChannelId && activeVoiceChannelId !== activeChannel.id
                  ? 'A chamada atual será terminada antes de ligares a esta sala.'
                  : `Vais ligar-te ao canal ${activeChannel.name}.`}
              </p>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmVoiceJoin(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setConfirmVoiceJoin(false);
                  if (activeVoiceChannelId && activeVoiceChannelId !== activeChannel.id) onLeaveVoice();
                  onJoinVoice(activeChannel.id);
                }}
              >
                {activeVoiceChannelId && activeVoiceChannelId !== activeChannel.id ? 'Mudar' : 'Entrar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. TEXT CHANNEL (Community)
  // ---------------------------------------------------------------------------
  if (activeCommunity && (activeChannel?.type === 'text' || activeChannel?.type === 'announcement')) {
    const announcement = activeChannel.type === 'announcement';
    // Resolve community members
    const memberUsers: PublicUser[] = (activeCommunity.members || []).map((mid) => {
      if (mid === profile.id) return { ...profile, online: true };
      const found = allUsers.find((u) => u.id === mid);
      if (found) return found;
      return {
        id: mid,
        username: mid,
        displayName: mid,
        hue: 200,
        emoji: '',
        about: '',
        status: 'offline',
        createdAt: Date.now(),
        online: false,
      };
    });

    const onlineMembers = memberUsers.filter((u) => u.online);
    const offlineMembers = memberUsers.filter((u) => !u.online);

    return (
      <>
        <div className="flex-1 flex flex-col h-full bg-background text-foreground transition-colors duration-200">
        {activeCommunity.directGroup ? <GroupConversationHeader group={activeCommunity} users={allUsers} profile={profile} voiceMembers={voiceState[activeCommunity.channels.find((c) => c.type === 'voice')?.id || ''] || []} connected={activeCommunity.channels.some((c) => c.type === 'voice' && c.id === activeVoiceChannelId)} onBack={onBack} onCall={() => { const channel = activeCommunity.channels.find((c) => c.type === 'voice'); if (!channel) return; if (activeVoiceChannelId !== channel.id) onJoinVoice(channel.id); onOpenChannel?.(channel.id); }} /> : <>        {/* Channel Header */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between bg-card/60 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Voltar"
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground md:hidden"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            {announcement ? (
              <Megaphone className="size-5 text-muted-foreground" />
            ) : (
              <Hash className="size-5 text-muted-foreground" />
            )}
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              {activeChannel.name}
            </h3>
            <span className="text-[11px] text-muted-foreground ml-2 hidden sm:inline">
              {announcement ? 'Canal informativo' : `Canal em ${activeCommunity.name}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMembersList((prev) => !prev)}
              aria-label="Mostrar ou ocultar lista de membros"
              title={showMembersList ? 'Ocultar lista de membros' : 'Mostrar lista de membros'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                showMembersList
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              <Users className="size-4" />
              <span className="hidden sm:inline text-xs font-semibold">
                {activeCommunity.members.length}
              </span>
            </button>
          </div>
        </div>

        </>}
        {/* Content Area with Messages Stream and Right Members Sidebar */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Welcome message in channel */}
          <div className="py-6 border-b border-border/60">
            <div className="w-12 h-12 rounded-2xl bg-secondary border border-border flex items-center justify-center text-foreground mb-2">
              {activeCommunity.directGroup ? <Users className="size-6" /> : announcement ? <Megaphone className="size-6" /> : <Hash className="size-6" />}
            </div>
            <h2 className="text-lg font-semibold text-foreground">{activeCommunity.directGroup ? activeCommunity.name : `Bem-vindo a #${activeChannel.name}!`}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeCommunity.directGroup ? 'Este é o início da vossa conversa. Envia uma mensagem ou junta-te à chamada.' : `Este é o início do canal #${activeChannel.name}.`}
            </p>
          </div>

          {channelMessages.map((msg) => {
            const author: PublicUser | undefined =
              msg.from === profile.id
                ? { ...profile, online: true }
                : allUsers.find((u) => u.id === msg.from);

            const isMe = msg.from === profile.id;
            const userRoleIds = activeCommunity.memberRoles?.[profile.id] || [];
            const hasManageMessages = (activeCommunity.roles || []).some(
              (r) => userRoleIds.includes(r.id) && (r.permissions?.administrator || r.permissions?.manageMessages)
            );
            const canDelete =
              isMe ||
              activeCommunity.ownerId === profile.id ||
              activeCommunity.admins?.includes(profile.id) ||
              hasManageMessages ||
              profile.globalRole === 'owner' ||
              profile.globalRole === 'admin';
            const msgGifUrl = getGifUrlFromMessage(msg);

            return (
              <ContextMenu key={msg.id}>
                <ContextMenuTrigger asChild>
                  <div className="message-enter relative flex items-start gap-3 group rounded-xl p-1 -m-1 hover:bg-secondary/40 transition-colors">
                    <button
                      type="button"
                      onClick={() => author && setInspectedUser(author)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold shrink-0 shadow-inner mt-0.5 overflow-hidden bg-cover bg-center cursor-pointer hover:opacity-85 transition-opacity"
                      style={{
                        backgroundColor: author
                          ? `hsl(${author.hue}, 60%, 45%)`
                          : '#3f3f46',
                        backgroundImage: author?.avatarUrl ? `url(${author.avatarUrl})` : undefined,
                      }}
                      title={author ? `Ver perfil de ${author.displayName}` : undefined}
                    >
                      {!author?.avatarUrl && (author?.displayName.trim().slice(0, 1).toUpperCase() ?? '?')}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <button
                          type="button"
                          onClick={() => author && setInspectedUser(author)}
                          className="text-xs font-semibold text-foreground hover:underline text-left cursor-pointer"
                        >
                          {author ? author.displayName : 'Utilizador'}
                        </button>
                        {author && activeCommunity.ownerId === author.id && (
                          <span className="rounded-md bg-foreground/10 px-1 py-0.5 text-[9px] font-semibold text-foreground">
                            CRIADOR
                          </span>
                        )}
                        {author && activeCommunity.admins?.includes(author.id) && (
                          <span className="rounded-md bg-foreground/10 px-1 py-0.5 text-[9px] font-semibold text-foreground">
                            ADMIN
                          </span>
                        )}
                        {author?.customStatus && (
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">
                            — {author.customStatus}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatMsgTime(msg.at)}
                        </span>
                      </div>

                      {/* Content: Poll, Text, or Photo/Attachment */}
                      {msg.poll ? (
                        <PollCard
                          poll={msg.poll}
                          scope="channel"
                          messageId={msg.id}
                          profileId={profile.id}
                        />
                      ) : (
                        msg.text && (
                          <p className="text-xs text-foreground/90 mt-0.5 leading-relaxed break-words whitespace-pre-wrap">
                            <MessageContent text={msg.text} onOpenLightbox={handleOpenLightbox} />
                          </p>
                        )
                      )}

                      {msg.attachment &&
                        (isImageAttachment(msg.attachment) ? (
                          <ImageAttachmentCard
                            attachment={msg.attachment}
                            onOpenLightbox={handleOpenLightbox}
                          />
                        ) : (
                          <AttachmentCard attachment={msg.attachment} />
                        ))}

                    </div>

                    {/* Quick message hover actions toolbar */}
                    {(canDelete || msgGifUrl) && (
                      <div className="absolute top-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card/90 border border-border/80 shadow-xs rounded-xl p-1 backdrop-blur-md z-10">
                        {msgGifUrl && (
                          <button
                            type="button"
                            onClick={() => saveGifToFavorites(msgGifUrl)}
                            className="p-1 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                            title="Guardar GIF nos Favoritos"
                          >
                            <Bookmark className="size-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setMessageToDelete({ scope: 'channel', messageId: msg.id })}
                            className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Eliminar mensagem"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56 rounded-2xl bg-card/95 backdrop-blur-xl border-border/80 p-1.5 shadow-2xl">
                  {msgGifUrl && (
                    <>
                      <ContextMenuItem
                        onSelect={() => saveGifToFavorites(msgGifUrl)}
                        className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                      >
                        <Bookmark className="mr-2.5 size-4 text-primary" />
                        Guardar GIF nos Favoritos
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                    </>
                  )}
                  {msg.text && (
                    <ContextMenuItem
                      onSelect={() => {
                        void navigator.clipboard.writeText(msg.text);
                        toast.success('Mensagem copiada para a área de transferência');
                      }}
                      className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                    >
                      <Copy className="mr-2.5 size-4 text-muted-foreground" />
                      Copiar mensagem
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    onSelect={() => setText(`@${author?.username ?? 'utilizador'} `)}
                    className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                  >
                    <CornerUpLeft className="mr-2.5 size-4 text-muted-foreground" />
                    Responder a @{author?.username ?? 'utilizador'}
                  </ContextMenuItem>
                  {canDelete && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="rounded-xl px-2.5 py-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                        onSelect={() => setMessageToDelete({ scope: 'channel', messageId: msg.id })}
                      >
                        <Trash2 className="mr-2.5 size-4" />
                        Eliminar mensagem
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Floating Bottom Input Bar with Pre-send Image Preview */}
        {announcement && !canPostAnnouncement ? (
          <div className="mx-4 mb-4 rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
            Este canal é apenas informativo. Só a administração pode publicar mensagens.
          </div>
        ) : (
          <div className="p-4 pt-1 bg-background">
            {/* Pre-send File Preview Banner */}
            {pendingFile && (
              <div className="mb-2 flex items-center gap-3 rounded-2xl border border-primary/30 bg-card p-2.5 shadow-sm">
                {pendingFilePreview ? (
                  <img
                    src={pendingFilePreview}
                    alt="Pré-visualização da foto"
                    className="size-16 rounded-xl object-cover border border-border shrink-0 shadow-inner"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-xl bg-secondary border border-border shrink-0">
                    <Paperclip className="size-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {pendingFilePreview ? 'Foto pronta para enviar' : 'Ficheiro pronto para enviar'}
                  </span>
                  <p className="truncate text-xs font-semibold text-foreground mt-0.5">{pendingFile.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(pendingFile.size / (1024 * 1024)).toFixed(2)} MB — Adiciona legenda abaixo se quiseres
                  </p>
                </div>
                <button
                  type="button"
                  disabled={uploading || sendingText} onClick={clearPendingFile}
                  className="p-1.5 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                  title="Cancelar envio"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div className="relative flex items-center rounded-2xl bg-secondary/60 border border-border p-1.5 focus-within:border-primary focus-within:bg-card transition-all shadow-xs">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => selectFileForPreview(event.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploading || sendingText}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Anexar foto ou ficheiro"
                title="Anexar foto ou ficheiro"
                className="mx-1 rounded-xl p-2 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50 transition-colors"
              >
                <ImageIcon className="size-4 text-emerald-500" />
              </button>
              <GifPicker onSelectGif={handleSendGif} />
              {!announcement && (
                <button
                  type="button"
                  onClick={() => setPollOpen(true)}
                  aria-label="Criar votação"
                  title="Criar votação"
                  className="mx-1 rounded-xl p-2 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                >
                  <BarChart3 className="size-4 text-primary" />
                </button>
              )}
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  pendingFile
                    ? `Adiciona uma legenda à foto e prime Enter para enviar...`
                    : activeCommunity.directGroup ? `Mensagem para ${activeCommunity.name}...` : `Enviar mensagem em #${activeChannel.name}...`
                }
                rows={1}
                className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-0 px-3 py-2"
              />
              <Button
                size="icon"
                disabled={uploading || sendingText || (!text.trim() && !pendingFile)}
                onClick={() => void send()}
                className="h-8 w-8 rounded-xl bg-primary text-primary-foreground hover:opacity-90 shrink-0 transition-transform active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Send className="size-3.5" />
              </Button>
            </div>
            {uploading && (
              <p className="px-2 pt-1 text-[11px] text-muted-foreground animate-pulse">
                A enviar foto/ficheiro…
              </p>
            )}
            {uploadError && (
              <p role="alert" className="px-2 pt-1 text-[11px] text-destructive">
                {uploadError}
              </p>
            )}

            {/* Poll Creation Dialog (More Beautiful) */}
            <Dialog open={pollOpen} onOpenChange={setPollOpen}>
              <DialogContent className="rounded-3xl sm:max-w-md bg-card border-border shadow-2xl p-6">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                    <span className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <BarChart3 className="size-4" />
                    </span>
                    <span>Criar Nova Votação</span>
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Publica uma votação interativa no canal #{activeChannel.name}.
                  </p>
                </DialogHeader>
                <form onSubmit={createPoll} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Pergunta da votação</label>
                    <Input
                      autoFocus
                      maxLength={180}
                      value={pollQuestion}
                      onChange={(event) => setPollQuestion(event.target.value)}
                      placeholder="Ex: Que jogo vamos jogar hoje?"
                      required
                      className="rounded-xl bg-secondary/50 border-border text-xs focus-visible:ring-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Opções de resposta</label>
                    {pollOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <Input
                          maxLength={100}
                          value={option}
                          onChange={(event) =>
                            setPollOptions((previous) =>
                              previous.map((value, item) => (item === index ? event.target.value : value))
                            )
                          }
                          placeholder={`Opção ${index + 1}`}
                          required={index < 2}
                          className="rounded-xl bg-secondary/50 border-border text-xs focus-visible:ring-primary"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPollOptions((previous) => previous.filter((_, i) => i !== index))
                            }
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                            title="Remover opção"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollOptions.length < 8 && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8.5 rounded-xl text-xs w-full font-medium"
                      onClick={() => setPollOptions((previous) => [...previous, ''])}
                    >
                      + Adicionar opção
                    </Button>
                  )}
                  <DialogFooter className="pt-2">
                    <Button type="button" variant="ghost" onClick={() => setPollOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={publishingPoll || !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                      className="shadow-sm font-semibold text-xs"
                    >
                      Publicar Votação
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Right-side Community Members Sidebar */}
      {showMembersList && !activeCommunity.directGroup && (
        <aside className="w-60 border-l border-border bg-card/40 backdrop-blur-md flex flex-col h-full shrink-0 select-none overflow-hidden transition-all duration-200">
          <div className="h-12 px-3.5 border-b border-border/60 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" />
              <span>Membros</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                ({memberUsers.length})
              </span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
            {/* Online Members Section */}
            {onlineMembers.length > 0 && (
              <div className="space-y-1">
                <span className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Online — {onlineMembers.length}
                </span>
                {onlineMembers.map((user) => {
                  const userRoleIds = activeCommunity.memberRoles?.[user.id] || [];
                  const userRoles = (activeCommunity.roles || []).filter((r) => userRoleIds.includes(r.id));
                  const isOwner = activeCommunity.ownerId === user.id;
                  const isAdmin = (activeCommunity.admins || []).includes(user.id) || user.globalRole === 'admin' || userRoles.some((role) => role.permissions.administrator);
                  const topRole = userRoles[0];

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setInspectedUser(user as PublicUser)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-secondary/70 transition-colors text-left group"
                    >
                      <div className="relative shrink-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold text-white shadow-inner overflow-hidden bg-cover bg-center"
                          style={{
                            backgroundColor: `hsl(${user.hue}, 60%, 45%)`,
                            backgroundImage: user.avatarUrl ? `url(${user.avatarUrl})` : undefined,
                          }}
                        >
                          {!user.avatarUrl && user.displayName.trim().slice(0, 1).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-semibold truncate"
                            style={{ color: topRole?.color || undefined }}
                          >
                            {user.displayName}
                          </span>
                          {isOwner && (
                            <span title="Dono do servidor">
                              <Crown className="size-3 text-amber-500 shrink-0" />
                            </span>
                          )}
                          {!isOwner && isAdmin && (
                            <span title="Administrador">
                              <Shield className="size-3 text-primary shrink-0" />
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          {topRole?.name || `@${user.username}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Offline Members Section */}
            {offlineMembers.length > 0 && (
              <div className="space-y-1">
                <span className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Offline — {offlineMembers.length}
                </span>
                {offlineMembers.map((user) => {
                  const userRoleIds = activeCommunity.memberRoles?.[user.id] || [];
                  const userRoles = (activeCommunity.roles || []).filter((r) => userRoleIds.includes(r.id));
                  const isOwner = activeCommunity.ownerId === user.id;
                  const isAdmin = (activeCommunity.admins || []).includes(user.id) || user.globalRole === 'admin' || userRoles.some((role) => role.permissions.administrator);
                  const topRole = userRoles[0];

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setInspectedUser(user as PublicUser)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-secondary/70 transition-colors text-left group opacity-65 hover:opacity-100"
                    >
                      <div className="relative shrink-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold text-white shadow-inner overflow-hidden bg-cover bg-center grayscale-30"
                          style={{
                            backgroundColor: `hsl(${user.hue}, 40%, 40%)`,
                            backgroundImage: user.avatarUrl ? `url(${user.avatarUrl})` : undefined,
                          }}
                        >
                          {!user.avatarUrl && user.displayName.trim().slice(0, 1).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-muted-foreground/50 ring-2 ring-card" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-semibold truncate text-muted-foreground group-hover:text-foreground"
                            style={{ color: topRole?.color || undefined }}
                          >
                            {user.displayName}
                          </span>
                          {isOwner && (
                            <span title="Dono do servidor">
                              <Crown className="size-3 text-amber-500 shrink-0" />
                            </span>
                          )}
                          {!isOwner && isAdmin && (
                            <span title="Administrador">
                              <Shield className="size-3 text-primary shrink-0" />
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          {topRole?.name || `@${user.username}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}
          </div>
        </div>
        <UserProfileModal
          user={inspectedUser}
          open={inspectedUser !== null}
          onOpenChange={(open) => !open && setInspectedUser(null)}
          onToggleBlock={(userId, blocked) => onBlockUser(userId, blocked)}
        />
        {deleteConfirmationModal}
        {lightboxModal}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. DIRECT MESSAGES PANEL (1-on-1 with activeUser)
  // ---------------------------------------------------------------------------
  if (activeUser) {
    return (
      <>
        <div className="flex-1 flex flex-col h-full bg-background text-foreground transition-colors duration-200">
        {/* DM Header */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between bg-card/60 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Voltar"
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground md:hidden"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setInspectedUser(activeUser)}
              className="flex items-center gap-2.5 text-left cursor-pointer hover:opacity-85 transition-opacity"
              title={`Ver perfil de ${activeUser.displayName}`}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold shadow-inner shrink-0 overflow-hidden bg-cover bg-center"
                style={{
                  backgroundColor: `hsl(${activeUser.hue}, 60%, 45%)`,
                  backgroundImage: activeUser.avatarUrl ? `url(${activeUser.avatarUrl})` : undefined,
                }}
              >
                {!activeUser.avatarUrl && activeUser.displayName.trim().slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-foreground tracking-tight leading-none hover:underline">
                    {activeUser.displayName}
                  </h3>
                  {activeUser.customStatus && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      — {activeUser.customStatus}
                    </span>
                  )}
                  {activeUser.globalRole && (
                    <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 text-[9px] font-semibold text-foreground">
                      {activeUser.globalRole === 'owner' ? 'CRIADOR' : 'ADMIN'}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">@{activeUser.username}</span>
              </div>
            </button>
          </div>

          {/* Call action buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setConfirmCall('voice')}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary"
              title="Chamada de Voz"
            >
              <Phone className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setConfirmCall('video')}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary"
              title="Vídeo Chamada"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>

        {/* Direct Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => {
            const isMe = m.from === profile.id;
            const canDelete = isMe || profile.globalRole === 'owner' || profile.globalRole === 'admin';
            const mGifUrl = getGifUrlFromMessage(m);

            return (
              <ContextMenu key={m.id}>
                <ContextMenuTrigger asChild>
                  <div className={`message-enter relative flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Hover quick delete/actions toolbar */}
                    {(canDelete || mGifUrl) && (
                      <div
                        className={`absolute -top-3 ${
                          isMe ? 'right-2' : 'left-2'
                        } opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-1 bg-card/95 border border-border/80 shadow-md rounded-xl p-1 backdrop-blur-md`}
                      >
                        {mGifUrl && (
                          <button
                            type="button"
                            onClick={() => saveGifToFavorites(mGifUrl)}
                            className="p-1 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                            title="Guardar GIF nos Favoritos"
                          >
                            <Bookmark className="size-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setMessageToDelete({ scope: 'dm', messageId: m.id })}
                            className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Eliminar a minha mensagem"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words whitespace-pre-wrap ${
                        isMe
                          ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                          : 'bg-card text-foreground border border-border shadow-xs'
                      }`}
                    >
                      <span className="mb-1 block text-[10px] font-medium opacity-80">
                        {isMe ? profile.displayName : activeUser.displayName}
                      </span>
                      {m.poll ? (
                        <PollCard
                          poll={m.poll}
                          scope="dm"
                          messageId={m.id}
                          profileId={profile.id}
                        />
                      ) : (
                        m.text && <MessageContent text={m.text} onOpenLightbox={handleOpenLightbox} />
                      )}
                    </div>

                    {m.attachment &&
                      (isImageAttachment(m.attachment) ? (
                        <ImageAttachmentCard
                          attachment={m.attachment}
                          onOpenLightbox={handleOpenLightbox}
                        />
                      ) : (
                        <AttachmentCard attachment={m.attachment} />
                      ))}

                    <span className="text-[9px] text-muted-foreground mt-1 px-1 font-mono">
                      {isMe ? profile.displayName : activeUser.displayName} — {formatMsgTime(m.at)}
                      {isMe && <span className="ml-1.5">{m.readAt ? 'Visto' : 'Enviada'}</span>}
                    </span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56 rounded-2xl bg-card/95 backdrop-blur-xl border-border/80 p-1.5 shadow-2xl">
                  {mGifUrl && (
                    <>
                      <ContextMenuItem
                        onSelect={() => saveGifToFavorites(mGifUrl)}
                        className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                      >
                        <Bookmark className="mr-2.5 size-4 text-primary" />
                        Guardar GIF nos Favoritos
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                    </>
                  )}
                  {m.text && (
                    <ContextMenuItem
                      onSelect={() => {
                        void navigator.clipboard.writeText(m.text);
                        toast.success('Mensagem copiada para a área de transferência');
                      }}
                      className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                    >
                      <Copy className="mr-2.5 size-4 text-muted-foreground" />
                      Copiar mensagem
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    onSelect={() => setText(`@${activeUser.username} `)}
                    className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                  >
                    <CornerUpLeft className="mr-2.5 size-4 text-muted-foreground" />
                    Responder a @{activeUser.username}
                  </ContextMenuItem>
                  {canDelete && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="rounded-xl px-2.5 py-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                        onSelect={() => setMessageToDelete({ scope: 'dm', messageId: m.id })}
                      >
                        <Trash2 className="mr-2.5 size-4" />
                        Eliminar mensagem
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {typingFrom === activeUser.id && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              <span>{activeUser.displayName} está a escrever</span>
              <span className="typing-dots inline-flex gap-0.5" aria-hidden="true">
                <span>·</span>
                <span>·</span>
                <span>·</span>
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* DM Input Bar with Pre-send Image Preview */}
        <div className="p-4 pt-1 bg-background">
          {/* Pre-send File Preview Banner */}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-3 rounded-2xl border border-primary/30 bg-card p-2.5 shadow-sm">
              {pendingFilePreview ? (
                <img
                  src={pendingFilePreview}
                  alt="Pré-visualização da foto"
                  className="size-16 rounded-xl object-cover border border-border shrink-0 shadow-inner"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-xl bg-secondary border border-border shrink-0">
                  <Paperclip className="size-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {pendingFilePreview ? 'Foto pronta para enviar' : 'Ficheiro pronto para enviar'}
                </span>
                <p className="truncate text-xs font-semibold text-foreground mt-0.5">{pendingFile.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(pendingFile.size / (1024 * 1024)).toFixed(2)} MB — Adiciona legenda abaixo se quiseres
                </p>
              </div>
              <button
                type="button"
                disabled={uploading || sendingText} onClick={clearPendingFile}
                className="p-1.5 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                title="Cancelar envio"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="relative flex items-center rounded-2xl bg-secondary/60 border border-border p-1.5 focus-within:border-primary focus-within:bg-card transition-all shadow-xs">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => selectFileForPreview(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading || sendingText}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Anexar foto ou ficheiro"
              title="Anexar foto ou ficheiro"
              className="mx-1 rounded-xl p-2 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <ImageIcon className="size-4 text-emerald-500" />
            </button>
            <GifPicker onSelectGif={handleSendGif} />
            <button
              type="button"
              onClick={() => setPollOpen(true)}
              aria-label="Criar votação"
              title="Criar votação"
              className="mx-1 rounded-xl p-2 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
            >
              <BarChart3 className="size-4 text-primary" />
            </button>
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onSendTyping();
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                pendingFile
                  ? `Adiciona uma legenda à foto e prime Enter para enviar...`
                  : `Mensagem para @${activeUser.username}...`
              }
              rows={1}
              className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-0 px-3 py-2"
            />
            <Button
              size="icon"
              disabled={uploading || sendingText || (!text.trim() && !pendingFile)}
              onClick={() => void send()}
              className="h-8 w-8 rounded-xl bg-primary text-primary-foreground hover:opacity-90 shrink-0 transition-transform active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Send className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setConfirmBlock(true)}
              aria-label="Bloquear utilizador"
              title="Bloquear utilizador"
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive"
            >
              <ShieldBan className="size-4" />
            </Button>
          </div>
          {uploading && (
            <p className="px-2 pt-1 text-[11px] text-muted-foreground animate-pulse">
              A enviar foto/ficheiro…
            </p>
          )}
          {uploadError && (
            <p role="alert" className="px-2 pt-1 text-[11px] text-destructive">
              {uploadError}
            </p>
          )}

          {/* Poll Creation Dialog (More Beautiful) */}
          <Dialog open={pollOpen} onOpenChange={setPollOpen}>
            <DialogContent className="rounded-3xl sm:max-w-md bg-card border-border shadow-2xl p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                  <span className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <BarChart3 className="size-4" />
                  </span>
                  <span>Criar Nova Votação</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  A votação ficará guardada na conversa direta com @{activeUser.username}.
                </p>
              </DialogHeader>
              <form onSubmit={createPoll} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Pergunta da votação</label>
                  <Input
                    autoFocus
                    maxLength={180}
                    value={pollQuestion}
                    onChange={(event) => setPollQuestion(event.target.value)}
                    placeholder="Ex: O que achas disto?"
                    required
                    className="rounded-xl bg-secondary/50 border-border text-xs focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Opções de resposta</label>
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <Input
                        maxLength={100}
                        value={option}
                        onChange={(event) =>
                          setPollOptions((previous) =>
                            previous.map((value, item) => (item === index ? event.target.value : value))
                          )
                        }
                        placeholder={`Opção ${index + 1}`}
                        required={index < 2}
                        className="rounded-xl bg-secondary/50 border-border text-xs focus-visible:ring-primary"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPollOptions((previous) => previous.filter((_, i) => i !== index))
                          }
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                          title="Remover opção"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 8 && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8.5 rounded-xl text-xs w-full font-medium"
                    onClick={() => setPollOptions((previous) => [...previous, ''])}
                  >
                    + Adicionar opção
                  </Button>
                )}
                <DialogFooter className="pt-2">
                  <Button type="button" variant="ghost" onClick={() => setPollOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={publishingPoll || !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                    className="shadow-sm font-semibold text-xs"
                  >
                    Publicar Votação
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Confirmation Dialog for Call */}
        <Dialog open={confirmCall !== null} onOpenChange={(open) => !open && setConfirmCall(null)}>
          <DialogContent className="rounded-3xl sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{activeCallExists ? 'Mudar de chamada?' : 'Confirmar chamada'}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {activeCallExists
                  ? 'A chamada atual será terminada e vais iniciar uma nova chamada com '
                  : 'Vais iniciar uma chamada com '}
                {activeUser.displayName}.
              </p>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmCall(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (confirmCall) onCall(confirmCall);
                  setConfirmCall(null);
                }}
              >
                {activeCallExists ? 'Mudar e ligar' : 'Ligar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog for Block */}
        <Dialog open={confirmBlock} onOpenChange={setConfirmBlock}>
          <DialogContent className="rounded-3xl sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Bloquear @{activeUser.username}?</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Esta pessoa deixará de poder enviar-te mensagens ou iniciar chamadas diretas. Podes
                desbloqueá-la nas definições.
              </p>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmBlock(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onBlockUser(activeUser.id, !isBlocked);
                  setConfirmBlock(false);
                }}
              >
                {isBlocked ? 'Desbloquear' : 'Bloquear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <UserProfileModal
          user={inspectedUser}
          open={inspectedUser !== null}
          onOpenChange={(open) => !open && setInspectedUser(null)}
          isBlocked={inspectedUser ? isBlocked && inspectedUser.id === activeUser.id : false}
          onToggleBlock={(userId, blocked) => onBlockUser(userId, blocked)}
        />
        {deleteConfirmationModal}
        {lightboxModal}
      </>
    );
  }

  return (
    <>
      <UserProfileModal
        user={inspectedUser}
        open={inspectedUser !== null}
        onOpenChange={(open) => !open && setInspectedUser(null)}
        onToggleBlock={(userId, blocked) => onBlockUser(userId, blocked)}
      />
      {deleteConfirmationModal}
      {lightboxModal}
    </>
  );
}



