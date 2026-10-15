import { FriendsPanel } from '@/components/FriendsPanel';
import { useEffect, useState, useRef, useDeferredValue, useMemo, lazy, Suspense, type FormEvent } from 'react';
import { ActionConfirmation, type ConfirmationAction } from '@/components/ActionConfirmation';
import { channelName, serverItemName } from '@/lib/server-names';
import { StyledSelect } from '@/components/StyledSelect';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Search,
  Hash,
  Volume2,
  Plus,
  Copy,
  Check,
  UserPlus,
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  PencilLine,
  Globe,
  Lock,
  Shield,
  LoaderCircle,
  Megaphone,
  Settings,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  GripVertical,
  User,
  Ban,
  MessageSquare,
  FolderPlus,
  VolumeX,
  UserX,
  UserMinus,
  X,
} from 'lucide-react';
import type { PublicUser, MyProfile, Message, Community } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ProfileModal } from '@/components/ProfileModal';
import { UserProfileModal } from '@/components/UserProfileModal';
import { api } from '@/lib/api';
const ServerSettingsDialog = lazy(() => import('@/components/ServerSettingsDialog').then((module) => ({ default: module.ServerSettingsDialog })));
import { DirectGroups } from '@/components/DirectGroups';
import { canInviteToCommunity } from '@/lib/community-invites';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { toast } from 'sonner';

interface SidebarProps {
  // DM Mode
  users: PublicUser[];
  groups: Community[];
  conversations: Map<string, Message[]>;
  profile: MyProfile;
  blockedUsers: PublicUser[];
  friendsState?: {
    friends: PublicUser[];
    incoming: PublicUser[];
    outgoing: PublicUser[];
  };
  activeUserId: string | null;
  onSelectUser: (id: string) => void;
  onUpdateProfile: (patch: Partial<MyProfile>) => void;
  onLogout: () => void;

  // Community Mode
  activeCommunity: Community | null;
  activeGroupId?: string | null;
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  voiceState: Record<string, string[]>;
  activeVoiceChannelId: string | null;
  onLeaveVoice: () => void;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  voiceError: string | null;
  pendingVoiceChannelId: string | null;
  onOpenSettings?: (section?: import('@/sections/SettingsPage').SettingsSection) => void;
  onSelectCommunity?: (commId: string) => void;
}

function formatTimestamp(at: number): string {
  const d = new Date(at);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Ontem ${format(d, 'HH:mm')}`;
  return format(d, 'dd/MM HH:mm');
}

function statusColor(status: string, online: boolean): string {
  if (!online) return '#71717a';
  if (status === 'online') return '#10b981';
  if (status === 'away') return '#f59e0b';
  if (status === 'busy') return '#ef4444';
  return '#71717a';
}

export function Sidebar({
  users,
  conversations,
  profile,
  groups,
  blockedUsers,
  friendsState,
  activeUserId,
  onSelectUser,
  onUpdateProfile,
  onLogout,
  activeCommunity,
  activeGroupId,
  activeChannelId,
  onSelectChannel,
  voiceState,
  activeVoiceChannelId,
  onLeaveVoice,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  voiceError,
  pendingVoiceChannelId,
  onOpenSettings,
  onSelectCommunity,
}: SidebarProps) {
  // DM Search & Filter
  const [search, setSearch] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'online'>('all');

  const deferredSearch = useDeferredValue(search);
  const deferredPeopleSearch = useDeferredValue(peopleSearch);

  const [serverPeople, setServerPeople] = useState<PublicUser[]>([]);
  const [isSearchingServer, setIsSearchingServer] = useState(false);

  useEffect(() => {
    const q = deferredPeopleSearch.trim().toLowerCase().replace(/^@/, '');
    if (!q) {
      setServerPeople([]);
      setIsSearchingServer(false);
      return;
    }

    let cancelled = false;
    setIsSearchingServer(true);

    const timer = setTimeout(() => {
      api.searchUsers(q)
        .then((results) => {
          if (!cancelled) {
            setServerPeople(results);
            setIsSearchingServer(false);
          }
        })
        .catch(() => {
          if (!cancelled) setIsSearchingServer(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredPeopleSearch]);

  const combinedPeople = useMemo(() => {
    const q = deferredPeopleSearch.trim().toLowerCase().replace(/^@/, '');
    if (!q) return [];
    const map = new Map<string, PublicUser>();
    for (const u of users) {
      if (u.id === profile.id) continue;
      if (u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)) {
        map.set(u.id, u);
      }
    }
    for (const u of serverPeople) {
      if (u.id === profile.id) continue;
      if (!map.has(u.id)) {
        map.set(u.id, u);
      }
    }
    return Array.from(map.values()).slice(0, 10);
  }, [users, profile.id, deferredPeopleSearch, serverPeople]);

  const filteredDmUsers = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (u.id === profile.id) return false;
      if (filter === 'online' && !u.online) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      );
    });
  }, [users, profile.id, filter, deferredSearch]);

  // Permissions check
  const isOwner = activeCommunity ? (activeCommunity.ownerId === profile.id || profile.globalRole === 'owner') : false;
  const isAdmin = activeCommunity ? (isOwner || (activeCommunity.admins?.includes(profile.id) ?? false) || profile.globalRole === 'admin') : false;
  const userRoleIds = activeCommunity?.memberRoles?.[profile.id] || [];
  const userRoles = (activeCommunity?.roles || []).filter((r) => userRoleIds.includes(r.id));
  const hasAdminPermission = isAdmin || userRoles.some((r) => r.permissions?.administrator || r.permissions?.manageServer);
  const canManageChannels = hasAdminPermission || userRoles.some((r) => r.permissions?.manageChannels);
  const isServerCreator = activeCommunity?.ownerId === profile.id;
  const canInviteMembers = !!activeCommunity && canInviteToCommunity(activeCommunity, profile);
  const canKickVoice = isAdmin || userRoles.some((r) => r.permissions?.administrator || r.permissions?.kickVoiceMembers || r.permissions?.kickMembers);
  const canMuteVoice = isAdmin || userRoles.some((r) => r.permissions?.administrator || r.permissions?.muteVoiceMembers || r.permissions?.kickVoiceMembers);

  // Server administration dialog
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const structureBusy = useRef(false);
  async function confirmStructure(type: string, patch: Record<string, unknown>, accept: (value: Community) => boolean, success: string) {
    if (!activeCommunity || structureBusy.current) return false;
    structureBusy.current = true;
    try { await api.confirmCommunityChange(type, activeCommunity.id, patch, accept); toast.success(success); return true; }
    catch { toast.error('O servidor não confirmou a alteração. Verifica as permissões e tenta novamente.'); return false; }
    finally { structureBusy.current = false; }
  }
  function saveChannelOrder(channels: { id: string; categoryId?: string }[], success: string) {
    void confirmStructure('community:structure:reorder', { channels }, (community) => channels.every((channel, index) => community.channels[index]?.id === channel.id && (community.channels[index]?.categoryId || '') === (channel.categoryId || '')), success);
  }

  // Channel creation state
  const [newChanName, setNewChanName] = useState('');
  const [newChanType, setNewChanType] = useState<'text' | 'voice' | 'announcement'>('text');
  const [newChanCategoryId, setNewChanCategoryId] = useState<string | undefined>(undefined);
  const [createChanOpen, setCreateChanOpen] = useState(false);

  // Category creation & editing state
  const [createCatOpen, setCreateCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<{ id: string; name: string } | null>(null);

  // Channel editing state
  const [editingChan, setEditingChan] = useState<{
    id: string;
    name: string;
    type: 'text' | 'voice' | 'announcement';
    categoryId?: string;
  } | null>(null);

  // Collapsed categories state
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Drag and drop state
  const [draggedChanId, setDraggedChanId] = useState<string | null>(null);
  const [dragOverChanId, setDragOverChanId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberPending, setMemberPending] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  // Profile modal state
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [inspectedUser, setInspectedUser] = useState<PublicUser | null>(null);

  // Protected route check: Ensure active community is only accessible if user is a member
  useEffect(() => {
    if (profile.globalRole !== 'owner' && profile.globalRole !== 'admin' && activeCommunity && (!activeCommunity.members || !activeCommunity.members.includes(profile.id))) {
      onSelectCommunity?.('');
    }
  }, [activeCommunity, profile.id, profile.globalRole, onSelectCommunity]);

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!activeCommunity || !memberUsername.trim() || memberPending) return;
    setMemberError(null);
    setMemberPending(true);
    try { const result = await api.addCommunityMemberConfirmed(activeCommunity.id, memberUsername.trim()); setMemberUsername(''); toast.success(`${result.displayName} foi adicionado.`); }
    catch (error) { setMemberError(error instanceof Error ? error.message : 'Não foi possível adicionar a pessoa.'); }
    finally { setMemberPending(false); }
  }

  async function handleCreateChannel(e: FormEvent) {
    e.preventDefault();
    if (!activeCommunity || !newChanName.trim()) return;
    const name = channelName(newChanName); const count = activeCommunity.channels.length;
    if (await confirmStructure('community:channel:create', { name, type: newChanType, categoryId: newChanCategoryId }, (value) => value.channels.length > count && value.channels.some((channel) => channel.name === name), 'Canal criado.')) { setNewChanName(''); setNewChanCategoryId(undefined); setCreateChanOpen(false); }
  }

  async function handleCreateCategory(e: FormEvent) {
    e.preventDefault();
    if (!activeCommunity || !newCatName.trim()) return;
    const name = serverItemName(newCatName); const count = activeCommunity.categories?.length || 0;
    if (await confirmStructure('community:category:create', { name }, (value) => (value.categories?.length || 0) > count && !!value.categories?.some((category) => category.name === name), 'Separador criado.')) { setNewCatName(''); setCreateCatOpen(false); }
  }

  async function handleUpdateCategory(e: FormEvent) {
    e.preventDefault();
    if (!activeCommunity || !editingCat || !editingCat.name.trim()) return;
    const name = serverItemName(editingCat.name); const categoryId = editingCat.id;
    if (await confirmStructure('community:category:update', { categoryId, name }, (value) => !!value.categories?.some((category) => category.id === categoryId && category.name === name), 'Separador atualizado.')) setEditingCat(null);
  }

  function handleDeleteCategory(catId: string, catName: string) {
    if (!activeCommunity) return;
    setConfirmation({ title: 'Eliminar separador?', description: `O separador ${catName} será removido. Os canais serão mantidos.`, execute: () => confirmStructure('community:category:delete', { categoryId: catId }, (value) => !value.categories?.some((category) => category.id === catId), 'Separador eliminado.') });
  }

  async function handleUpdateChannel(e: FormEvent) {
    e.preventDefault();
    if (!activeCommunity || !editingChan || !editingChan.name.trim()) return;
    const channelId = editingChan.id;
    const patch = {
      name: channelName(editingChan.name),
      type: editingChan.type,
      categoryId: editingChan.categoryId || null,
    };
    if (await confirmStructure('community:channel:update', { channelId, ...patch }, (value) => value.channels.some((channel) => channel.id === channelId && channel.name === patch.name && channel.type === patch.type && (channel.categoryId || null) === patch.categoryId), 'Canal atualizado.')) setEditingChan(null);
  }

  function handleDeleteChannel(chanId: string, chanName: string) {
    if (!activeCommunity) return;
    setConfirmation({ title: 'Eliminar canal?', description: `O canal #${chanName} será removido.`, execute: () => confirmStructure('community:channel:delete', { channelId: chanId }, (value) => !value.channels.some((channel) => channel.id === chanId), 'Canal eliminado.') });
  }

  function handleDropOnChannel(targetChanId: string, targetCategoryId?: string) {
    if (!draggedChanId || !activeCommunity || draggedChanId === targetChanId) {
      setDraggedChanId(null);
      setDragOverChanId(null);
      return;
    }
    const channels = activeCommunity.channels.map((channel) => ({ ...channel }));
    const sourceIdx = channels.findIndex((c) => c.id === draggedChanId);
    const targetIdx = channels.findIndex((c) => c.id === targetChanId);
    if (sourceIdx === -1 || targetIdx === -1) {
      setDraggedChanId(null);
      setDragOverChanId(null);
      return;
    }

    const [moved] = channels.splice(sourceIdx, 1);
    moved.categoryId = targetCategoryId;
    channels.splice(targetIdx, 0, moved);

    const payload = channels.map((c, idx) => ({
      id: c.id,
      categoryId: c.categoryId,
      position: idx,
    }));
    saveChannelOrder(payload, 'Canais reordenados.');
    setDraggedChanId(null);
    setDragOverChanId(null);
  }

  function handleDropOnCategory(targetCatId?: string) {
    if (!draggedChanId || !activeCommunity) {
      setDraggedChanId(null);
      setDragOverCatId(null);
      return;
    }
    const channels = activeCommunity.channels.map((channel) => ({ ...channel }));
    const sourceIdx = channels.findIndex((c) => c.id === draggedChanId);
    if (sourceIdx === -1) {
      setDraggedChanId(null);
      setDragOverCatId(null);
      return;
    }

    const [moved] = channels.splice(sourceIdx, 1);
    moved.categoryId = targetCatId;
    channels.push(moved);

    const payload = channels.map((c, idx) => ({
      id: c.id,
      categoryId: c.categoryId,
      position: idx,
    }));
    saveChannelOrder(payload, 'Canal movido para o separador.');
    setDraggedChanId(null);
    setDragOverCatId(null);
  }

  async function copyInvite() {
    if (!activeCommunity || !canInviteMembers) return;
    try { await navigator.clipboard.writeText(activeCommunity.inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error('Não foi possível copiar o código.'); }
  }

  const activeVoiceChannel = activeCommunity?.channels.find(
    (c) => c.id === activeVoiceChannelId
  );

  return (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-2xl border-r border-border select-none transition-colors duration-200">
      {/* Top Header */}
      {activeCommunity ? (
        <>
          {(activeCommunity.bannerUrl || activeCommunity.bannerColor) && (
            <div
              className="h-24 w-full bg-cover relative border-b border-border/80 shrink-0"
              style={{
                backgroundImage: activeCommunity.bannerUrl ? `url(${activeCommunity.bannerUrl})` : undefined,
                backgroundColor: !activeCommunity.bannerUrl && activeCommunity.bannerColor ? activeCommunity.bannerColor : undefined,
                backgroundPosition: `50% ${activeCommunity.bannerPosition ?? 50}%`,
              }}
            />
          )}
          <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/40">
            <div className="flex items-center gap-2.5 min-w-0">
              {activeCommunity.icon && (activeCommunity.icon.startsWith('http') || activeCommunity.icon.startsWith('data:') || activeCommunity.icon.startsWith('blob:')) ? (
                <img
                  src={activeCommunity.icon}
                  alt={activeCommunity.name}
                  className="size-7 rounded-xl object-cover shrink-0 border border-border/80 shadow-xs"
                />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-xl bg-secondary text-xs font-semibold shrink-0">
                  {activeCommunity.icon && activeCommunity.icon.length <= 4 ? activeCommunity.icon : activeCommunity.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold text-foreground tracking-tight truncate">
                {activeCommunity.name}
              </span>
              {activeCommunity.isPublic ? (
                <span title="Pública"><Globe className="size-3.5 text-emerald-500 shrink-0" /></span>
              ) : (
                <span title="Fechada"><Lock className="size-3.5 text-amber-500 shrink-0" /></span>
              )}
            </div>

          <div className="flex items-center gap-1">
            {/* Quick Create Category Button */}
            {isServerCreator && canManageChannels && (
              <button
                aria-label="Criar Separador"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Criar Separador"
                onClick={() => setCreateCatOpen(true)}
              >
                <FolderPlus className="size-4" />
              </button>
            )}

            {/* Quick Invite Button if allowed */}
            {canInviteMembers && (
              <button
                aria-label="Convidar amigos"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Convidar Pessoas"
                onClick={() => setAddMemberOpen(true)}
              >
                <UserPlus className="size-4" />
              </button>
            )}

            {canInviteMembers && <button type="button" aria-label="Partilhar código de convite" title="Partilhar código de convite" onClick={() => setInviteOpen(true)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><Copy className="size-4" /></button>}

            {/* Server Administration & Structure Dialog Trigger */}
            {isServerCreator && <button
              aria-label="Definições e Administração do Servidor"
              title="Definições, Canais, Separadores e Membros"
              onClick={() => setServerSettingsOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Settings className="size-4" />
            </button>}
          </div>
        </div>
      </>
      ) : (
        <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-foreground tracking-tight">
            Conversas
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{users.filter((u) => u.id !== profile.id && u.online).length} online</span>
            {profile.globalRole === 'owner' && <Dialog>
              <DialogTrigger asChild><button title="Gestão global de administradores" className="grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><Shield className="size-4" /></button></DialogTrigger>
              <DialogContent className="sm:max-w-[460px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
                <DialogHeader><DialogTitle className="text-base font-semibold tracking-tight">Administradores globais</DialogTitle><DialogDescription className="sr-only">Gestão de administradores globais da plataforma.</DialogDescription><p className="text-xs text-muted-foreground">Só o proprietário principal pode atribuir este cargo. Administradores globais podem ver os servidores privados e todas as contas.</p></DialogHeader>
                <div className="mt-3 max-h-[55vh] space-y-1 overflow-y-auto">{users.map((user) => <label key={user.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs hover:bg-secondary/60"><span className="min-w-0"><span className="block truncate font-medium">{user.displayName}</span><span className="text-muted-foreground">@{user.username} {user.globalRole === 'admin' ? '· Administrador' : ''}</span></span><input type="checkbox" checked={user.globalRole === 'admin'} onChange={(event) => api.setGlobalAdmin(user.id, event.target.checked)} aria-label={`Administrador global para ${user.displayName}`} /></label>)}</div>
              </DialogContent>
            </Dialog>}
            <Dialog open={addPersonOpen} onOpenChange={(open) => {
              setAddPersonOpen(open);
              if (!open) {
                setPeopleSearch('');
                setServerPeople([]);
              }
            }}>
              <DialogTrigger asChild>
                <button aria-label="Adicionar pessoa por nome de utilizador" title="Adicionar pessoa" className="grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><UserPlus className="size-4" /></button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold tracking-tight">Encontrar pessoas</DialogTitle>
                  <DialogDescription className="sr-only">Procura pelo nome de utilizador ou nome visível para abrir uma conversa.</DialogDescription>
                  <p className="text-xs text-muted-foreground">Procura pelo nome de utilizador ou nome visível para abrir uma conversa.</p>
                </DialogHeader>
                <div className="mt-2 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={peopleSearch}
                      onChange={(event) => setPeopleSearch(event.target.value.replace(/^@/, ''))}
                      placeholder="Nome de utilizador ou nome"
                      className="h-10 rounded-xl pl-9 pr-8"
                    />
                    {peopleSearch && (
                      <button
                        type="button"
                        onClick={() => setPeopleSearch('')}
                        aria-label="Limpar campo"
                        className="absolute right-3 top-3 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {combinedPeople.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => {
                          api.addKnownUsers([user]);
                          onSelectUser(user.id);
                          setAddPersonOpen(false);
                          setPeopleSearch('');
                        }}
                        className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-secondary group"
                      >
                        <div className="relative shrink-0">
                          <div
                            className="grid size-9 place-items-center rounded-xl text-sm font-semibold text-white bg-cover bg-center overflow-hidden"
                            style={{
                              backgroundColor: `hsl(${user.hue}, 55%, 42%)`,
                              backgroundImage: user.avatarUrl ? `url(${user.avatarUrl})` : undefined,
                            }}
                          >
                            {!user.avatarUrl && user.displayName.trim().slice(0, 1).toUpperCase()}
                          </div>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card"
                            style={{ backgroundColor: statusColor(user.status, user.online) }}
                          />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{user.displayName}</span>
                          <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
                        </span>
                        <span className="text-xs text-muted-foreground group-hover:text-foreground font-medium">Abrir</span>
                      </button>
                    ))}
                    {isSearchingServer && combinedPeople.length === 0 && (
                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin text-primary" />
                        <span>A procurar utilizadores...</span>
                      </div>
                    )}
                    {!isSearchingServer && deferredPeopleSearch.trim() && combinedPeople.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                        Não encontrámos nenhum utilizador com esse nome.
                      </p>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      )}

      {/* Main Content Area in Sidebar */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 scrollbar-none">
        {activeCommunity ? (
          // ==============================
          // COMMUNITY CHANNELS LIST (DRAG & DROP + SEPARATORS)
          // ==============================
          <div className="space-y-4">
            {voiceError && (
              <p role="alert" className="mx-2 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-xs leading-5 text-destructive">
                {voiceError}
              </p>
            )}

            {/* Helper to render individual channel */}
            {(() => {
              const categories = (activeCommunity.categories || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
              const uncategorizedChannels = activeCommunity.channels
                .filter((c) => !c.deniedUsers?.includes(profile.id))
                .filter((c) => !c.categoryId || !categories.some((cat) => cat.id === c.categoryId));

              const renderChannelItem = (chan: typeof activeCommunity.channels[0], categoryId?: string) => {
                const isActive = activeChannelId === chan.id;
                const isConnectedVoice = chan.type === 'voice' && activeVoiceChannelId === chan.id;
                const connectedUserIds = chan.type === 'voice' ? (voiceState[chan.id] || []) : [];
                const isPendingVoice = chan.type === 'voice' && pendingVoiceChannelId === chan.id;
                const isDraggingThis = draggedChanId === chan.id;
                const isDragTarget = dragOverChanId === chan.id;

                return (
                  <ContextMenu key={chan.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        draggable={canManageChannels}
                        onDragStart={(e) => {
                          if (!canManageChannels) return;
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', chan.id);
                          setDraggedChanId(chan.id);
                        }}
                        onDragEnd={() => {
                          setDraggedChanId(null);
                          setDragOverChanId(null);
                          setDragOverCatId(null);
                        }}
                        onDragOver={(e) => {
                          if (canManageChannels && draggedChanId && draggedChanId !== chan.id) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            setDragOverChanId(chan.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverChanId === chan.id) setDragOverChanId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDropOnChannel(chan.id, categoryId);
                        }}
                        className={`group/chan relative flex flex-col rounded-xl transition-all ${
                          isDraggingThis ? 'opacity-30 scale-95 border-dashed border border-primary/50' : ''
                        } ${isDragTarget ? 'ring-2 ring-primary ring-offset-1 bg-primary/10' : ''}`}
                      >
                        <button
                          type="button"
                          data-tuga-channel={chan.id}
                          onClick={() => {
                            onSelectChannel(chan.id);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                            chan.type === 'voice' && isConnectedVoice
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20'
                              : isActive
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {canManageChannels && (
                              <GripVertical
                                className="size-3 text-muted-foreground/60 opacity-0 group-hover/chan:opacity-100 cursor-grab active:cursor-grabbing shrink-0 transition-opacity"
                              />
                            )}
                            {chan.type === 'voice' ? (
                              isPendingVoice ? (
                                <LoaderCircle className="size-4 shrink-0 animate-spin" />
                              ) : (
                                <Volume2 className={`size-4 shrink-0 ${isConnectedVoice ? 'text-emerald-500 animate-pulse' : 'opacity-70'}`} />
                              )
                            ) : chan.type === 'announcement' ? (
                              <Megaphone className="size-4 shrink-0 opacity-70" />
                            ) : (
                              <Hash className="size-4 shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{chan.name}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {chan.type === 'voice' && connectedUserIds.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-foreground">
                                {connectedUserIds.length}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Connected peers avatars in this voice channel */}
                        {chan.type === 'voice' && connectedUserIds.length > 0 && (
                          <div className="pl-6 pr-2 py-0.5 space-y-1">
                            {connectedUserIds.map((uid) => {
                              const userObj = uid === profile.id ? profile : users.find((u) => u.id === uid);
                              if (!userObj) return null;
                              return (
                                <div key={uid} data-voice-user={uid} className="group/voiceuser flex items-center gap-2 py-0.5 text-[11px] text-foreground">
                                  <div
                                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0"
                                    style={{ backgroundColor: `hsl(${userObj.hue}, 60%, 45%)`, backgroundImage: userObj.avatarUrl ? `url(${userObj.avatarUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}
                                  >
                                    {!userObj.avatarUrl && userObj.displayName.trim().slice(0, 1).toUpperCase()}
                                  </div>
                                  <span className="truncate text-muted-foreground flex-1">{userObj.displayName}</span>
                                  {uid === profile.id && isMuted && (
                                    <MicOff className="size-3 text-destructive shrink-0" />
                                  )}
                                  {uid !== profile.id && (canMuteVoice || canKickVoice) && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover/voiceuser:opacity-100 transition-opacity">
                                      {canMuteVoice && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void api.muteVoiceUserConfirmed(chan.id, uid, true).then(() => toast.success('Participante silenciado.')).catch(() => toast.error('Não foi possível silenciar esta pessoa.'));
                                            
                                          }}
                                          className="p-0.5 rounded text-muted-foreground hover:text-amber-500 hover:bg-secondary transition-colors"
                                          title={`Silenciar @${userObj.username}`}
                                        >
                                          <VolumeX className="size-3" />
                                        </button>
                                      )}
                                      {canKickVoice && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmation({ title: 'Remover participante da chamada?', description: `@${userObj.username} será desligado deste canal.`, execute: async () => { await api.kickVoiceUserConfirmed(chan.id, uid); toast.success('Participante desligado.'); } });
                                          }}
                                          className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                                          title={`Expulsar @${userObj.username} da chamada`}
                                        >
                                          <UserX className="size-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56 rounded-2xl bg-card/95 backdrop-blur-xl border-border/80 p-1.5 shadow-2xl">
                      <ContextMenuItem
                        onSelect={() => onSelectChannel(chan.id)}
                        className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                      >
                        {chan.type === 'voice' ? (
                          <Volume2 className="mr-2.5 size-4 text-emerald-500" />
                        ) : chan.type === 'announcement' ? (
                          <Megaphone className="mr-2.5 size-4 text-amber-500" />
                        ) : (
                          <Hash className="mr-2.5 size-4 text-primary" />
                        )}
                        Abrir canal
                      </ContextMenuItem>
                      {chan.type === 'voice' && isConnectedVoice && (
                        <ContextMenuItem
                          onSelect={onLeaveVoice}
                          className="rounded-xl px-2.5 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 cursor-pointer"
                        >
                          <MicOff className="mr-2.5 size-4" />
                          Sair da chamada de voz
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem
                        onSelect={() => {
                          void navigator.clipboard.writeText(`#${chan.name}`);
                          toast.success('Nome do canal copiado');
                        }}
                        className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                      >
                        <Copy className="mr-2.5 size-4 text-muted-foreground" />
                        Copiar nome do canal
                      </ContextMenuItem>
                      {canManageChannels && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => setEditingChan({ id: chan.id, name: chan.name, type: chan.type, categoryId: chan.categoryId })}
                            className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                          >
                            <Pencil className="mr-2.5 size-4 text-muted-foreground" />
                            Editar canal
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => handleDeleteChannel(chan.id, chan.name)}
                            className="rounded-xl px-2.5 py-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                          >
                            <Trash2 className="mr-2.5 size-4" />
                            Eliminar canal
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              };

              return (
                <div className="space-y-4">
                  {/* Categorized Channels */}
                  {categories.map((cat) => {
                    const isCollapsed = collapsedCategories[cat.id] === true;
                    const catChannels = activeCommunity.channels
                      .filter((c) => !c.deniedUsers?.includes(profile.id))
                      .filter((c) => c.categoryId === cat.id);
                    const isCatDragOver = dragOverCatId === cat.id;

                    return (
                      <div key={cat.id} className="space-y-1">
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div
                              onDragOver={(e) => {
                                if (canManageChannels && draggedChanId) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = 'move';
                                  setDragOverCatId(cat.id);
                                }
                              }}
                              onDragLeave={() => {
                                if (dragOverCatId === cat.id) setDragOverCatId(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDropOnCategory(cat.id);
                              }}
                              className={`group/cat px-2 py-1 flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider rounded-lg transition-all ${
                                isCatDragOver ? 'bg-primary/20 ring-1 ring-primary text-foreground' : 'hover:text-foreground'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setCollapsedCategories((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                                className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                              >
                                {isCollapsed ? <ChevronRight className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
                                <span className="truncate">{cat.name}</span>
                                <span className="text-[10px] font-normal text-muted-foreground/70 lowercase">({catChannels.length})</span>
                              </button>
                              {canManageChannels && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNewChanCategoryId(cat.id);
                                    setCreateChanOpen(true);
                                  }}
                                  className="p-1 rounded opacity-0 group-hover/cat:opacity-100 hover:bg-secondary text-muted-foreground hover:text-foreground transition-opacity"
                                  title="Criar canal neste separador"
                                >
                                  <Plus className="size-3" />
                                </button>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          {canManageChannels && (
                            <ContextMenuContent className="w-56 rounded-2xl bg-card/95 backdrop-blur-xl border-border/80 p-1.5 shadow-2xl">
                              <ContextMenuItem
                                onSelect={() => { setNewChanCategoryId(cat.id); setCreateChanOpen(true); }}
                                className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                              >
                                <Plus className="mr-2.5 size-4 text-primary" />
                                Criar canal neste separador
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => setEditingCat({ id: cat.id, name: cat.name })}
                                className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                              >
                                <Pencil className="mr-2.5 size-4 text-muted-foreground" />
                                Renomear separador
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onSelect={() => handleDeleteCategory(cat.id, cat.name)}
                                className="rounded-xl px-2.5 py-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                              >
                                <Trash2 className="mr-2.5 size-4" />
                                Eliminar separador
                              </ContextMenuItem>
                            </ContextMenuContent>
                          )}
                        </ContextMenu>

                        {!isCollapsed && (
                          <div className="space-y-0.5">
                            {catChannels.length === 0 ? (
                              <div
                                onDragOver={(e) => {
                                  if (canManageChannels && draggedChanId) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'move';
                                    setDragOverCatId(cat.id);
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDropOnCategory(cat.id);
                                }}
                                className={`px-3 py-2 border border-dashed rounded-xl text-[11px] text-muted-foreground/60 text-center transition-all ${
                                  isCatDragOver ? 'border-primary bg-primary/10 text-primary' : 'border-border/60'
                                }`}
                              >
                                Arrasta canais para aqui ou clica em +
                              </div>
                            ) : (
                              catChannels.map((c) => renderChannelItem(c, cat.id))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uncategorized channels */}
                  {(uncategorizedChannels.length > 0 || categories.length === 0) && (
                    <div className="space-y-1">
                      {categories.length > 0 && (
                        <div
                          onDragOver={(e) => {
                            if (canManageChannels && draggedChanId) {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              setDragOverCatId('__uncategorized__');
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverCatId === '__uncategorized__') setDragOverCatId(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDropOnCategory(undefined);
                          }}
                          className={`px-2 py-1 flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider rounded-lg transition-all ${
                            dragOverCatId === '__uncategorized__' ? 'bg-primary/20 ring-1 ring-primary text-foreground' : ''
                          }`}
                        >
                          <span>Canais Gerais</span>
                          {canManageChannels && (
                            <button
                              type="button"
                              title="Criar canal"
                              onClick={() => {
                                setNewChanCategoryId(undefined);
                                setCreateChanOpen(true);
                              }}
                              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Plus className="size-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* If no categories exist yet, show clean separation by text and voice */}
                      {categories.length === 0 ? (
                        <div className="space-y-4">
                          {/* Text Channels */}
                          <div className="space-y-1">
                            <div className="px-2 pb-1 flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              <span>Canais de Texto</span>
                              {canManageChannels && (
                                <button
                                  type="button"
                                  title="Criar canal de texto"
                                  onClick={() => {
                                    setNewChanType('text');
                                    setNewChanCategoryId(undefined);
                                    setCreateChanOpen(true);
                                  }}
                                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                                >
                                  <Plus className="size-3" />
                                </button>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              {uncategorizedChannels
                                .filter((c) => c.type === 'text' || c.type === 'announcement')
                                .map((c) => renderChannelItem(c, undefined))}
                            </div>
                          </div>

                          {/* Voice Channels */}
                          <div className="space-y-1">
                            <div className="px-2 pb-1 flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              <span>Canais de Voz</span>
                              {canManageChannels && (
                                <button
                                  type="button"
                                  title="Criar canal de voz"
                                  onClick={() => {
                                    setNewChanType('voice');
                                    setNewChanCategoryId(undefined);
                                    setCreateChanOpen(true);
                                  }}
                                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                                >
                                  <Plus className="size-3" />
                                </button>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              {uncategorizedChannels
                                .filter((c) => c.type === 'voice')
                                .map((c) => renderChannelItem(c, undefined))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {uncategorizedChannels.map((c) => renderChannelItem(c, undefined))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          // ==============================
          // DIRECT MESSAGES (CONTACTS LIST)
          // ==============================
          <div className="space-y-2">
            <FriendsPanel groups={groups} currentUserId={profile.id} onMessage={onSelectUser} friendsState={friendsState} />
            <DirectGroups activeGroupId={activeGroupId} voiceState={voiceState} currentUserId={profile.id} groups={groups} users={users.filter((user) => user.id !== profile.id && !blockedUsers.some((blocked) => blocked.id === user.id))} onSelect={(id) => onSelectCommunity?.(id)} />
            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar conversas..."
                data-tuga-search
                className="pl-8 pr-7 h-8 rounded-xl bg-secondary/50 border-border text-xs text-foreground placeholder:text-muted-foreground focus:bg-card focus:border-primary"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Limpar pesquisa"
                  className="absolute right-2 top-2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Filter Toggle */}
            <div className="flex gap-1 p-0.5 bg-secondary rounded-lg">
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-all ${
                  filter === 'all' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilter('online')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-all ${
                  filter === 'online' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Online
              </button>
            </div>

            {/* Users list */}
            <div className="space-y-0.5 pt-1">
              {filteredDmUsers.map((u) => {
                const isActive = activeUserId === u.id;
                const msgs = conversations.get(u.id) ?? [];
                const lastMsg = msgs.at(-1);

                  return (
                    <ContextMenu key={u.id}>
                    <ContextMenuTrigger asChild>
                    <button
                      onClick={() => onSelectUser(u.id)}
                      data-tuga-user={u.id}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-secondary/60 text-foreground'
                    }`}
                  >
                      <div
                        className="relative shrink-0 cursor-pointer group"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedUser(u);
                        }}
                        title={`Ver perfil de ${u.displayName}`}
                      >
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold shadow-inner group-hover:opacity-80 transition-opacity overflow-hidden bg-cover bg-center"
                          style={{
                            backgroundColor: `hsl(${u.hue}, 60%, 45%)`,
                            backgroundImage: u.avatarUrl ? `url(${u.avatarUrl})` : undefined,
                          }}
                        >
                          {!u.avatarUrl && u.displayName.trim().slice(0, 1).toUpperCase()}
                        </div>
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card"
                          style={{ backgroundColor: statusColor(u.status, u.online) }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold truncate text-foreground">
                            {u.displayName}
                          </span>
                          {u.globalRole && <span title={u.globalRole === 'owner' ? 'Criador da plataforma' : 'Administrador da plataforma'} className="ml-1 shrink-0"><Shield className="size-3 text-primary" /></span>}
                          {lastMsg && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatTimestamp(lastMsg.at)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {lastMsg ? lastMsg.text : `@${u.username}`}
                        </p>
                      </div>
                      </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-56 rounded-2xl bg-card/95 backdrop-blur-xl border-border/80 p-1.5 shadow-2xl">
                        <ContextMenuItem
                          onSelect={() => onSelectUser(u.id)}
                          className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                        >
                          <MessageSquare className="mr-2.5 size-4 text-primary" />
                          Abrir conversa
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => setInspectedUser(u)}
                          className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                        >
                          <User className="mr-2.5 size-4 text-muted-foreground" />
                          Ver perfil de utilizador
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        {friendsState?.friends.some((f) => f.id === u.id) ? (
                          <ContextMenuItem
                            onSelect={async () => {
                              try {
                                await api.friendAction('remove', { userId: u.id });
                                toast.success(`Amizade com ${u.displayName} removida.`);
                              } catch {
                                toast.error('Não foi possível remover amigo.');
                              }
                            }}
                            className="rounded-xl px-2.5 py-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                          >
                            <UserMinus className="mr-2.5 size-4" />
                            Remover amigo
                          </ContextMenuItem>
                        ) : friendsState?.incoming.some((f) => f.id === u.id) ? (
                          <ContextMenuItem
                            onSelect={async () => {
                              try {
                                await api.friendAction('respond', { userId: u.id, accept: true });
                                toast.success(`Pedido de ${u.displayName} aceite!`);
                              } catch {
                                toast.error('Não foi possível aceitar pedido.');
                              }
                            }}
                            className="rounded-xl px-2.5 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 focus:bg-emerald-500/10 cursor-pointer"
                          >
                            <Check className="mr-2.5 size-4" />
                            Aceitar pedido de amizade
                          </ContextMenuItem>
                        ) : friendsState?.outgoing.some((f) => f.id === u.id) ? (
                          <ContextMenuItem
                            onSelect={async () => {
                              try {
                                await api.friendAction('remove', { userId: u.id });
                                toast.info(`Pedido para ${u.displayName} cancelado.`);
                              } catch {
                                toast.error('Não foi possível cancelar pedido.');
                              }
                            }}
                            className="rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground cursor-pointer"
                          >
                            <X className="mr-2.5 size-4" />
                            Cancelar pedido enviado
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem
                            onSelect={async () => {
                              try {
                                await api.friendAction('request', { userId: u.id });
                                toast.success(`Pedido de amizade enviado para ${u.displayName}!`);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Não foi possível enviar pedido.');
                              }
                            }}
                            className="rounded-xl px-2.5 py-2 text-xs font-medium text-primary focus:bg-primary/10 focus:text-primary cursor-pointer"
                          >
                            <UserPlus className="mr-2.5 size-4" />
                            Adicionar amigo
                          </ContextMenuItem>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onSelect={() => {
                            api.blockUser(u.id, true);
                            toast.success(`@${u.username} foi bloqueado`);
                          }}
                          className="rounded-xl px-2.5 py-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                        >
                          <Ban className="mr-2.5 size-4" />
                          Bloquear @{u.username}
                        </ContextMenuItem>
                      </ContextMenuContent>
                      </ContextMenu>
                    );
                })}
              {deferredSearch.trim() && filteredDmUsers.length === 0 && (
                <div className="px-3 py-6 text-center space-y-2.5">
                  <p className="text-xs text-muted-foreground">
                    Nenhuma conversa encontrada com &ldquo;{search}&rdquo;.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPeopleSearch(search);
                      setAddPersonOpen(true);
                    }}
                    className="text-xs rounded-xl h-8 gap-1.5 border-border hover:bg-secondary"
                  >
                    <UserPlus className="size-3.5" />
                    Procurar utilizadores
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Voice Status Bar (When in a Voice Channel) */}
      {activeVoiceChannelId && (
        <div className="px-3 py-2 bg-emerald-500/10 border-t border-emerald-500/20 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Voz Conectada</span>
              {localStorage.getItem('tuga.pttEnabled') === 'true' && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isMuted ? 'bg-destructive/20 text-destructive' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}>
                  PTT {isMuted ? 'MUDO' : 'A TRANSMITIR'}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {activeVoiceChannel?.name ?? 'Canal de Voz'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={onToggleDeafen} className={`p-1.5 rounded-lg transition-colors ${isDeafened ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`} title={isDeafened ? 'Ativar áudio recebido' : 'Ensurdecer'}>
              {isDeafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
            </button>
            <button
              onClick={onToggleMute}
              disabled={isMuted && isDeafened}
              className={`p-1.5 rounded-lg transition-colors ${
                isMuted ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              title={isMuted && isDeafened ? 'Desativa o ensurdecimento para ativar o microfone' : isMuted ? 'Desativar Mudo' : 'Silenciar Microfone'}
            >
              {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
            <button
              onClick={onLeaveVoice}
              className="px-2 py-1 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 text-[11px] font-semibold transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      )}

      {/* User Dock & Profile Settings (Apple Frosted Glass) */}
      <div className="h-14 px-3 bg-card border-t border-border flex items-center justify-between shrink-0">
        <button
          onClick={() => {
            if (onOpenSettings) onOpenSettings('profile');
            else setProfileModalOpen(true);
          }}
          className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity flex-1"
          title="Editar Perfil Completo"
        >
          <div className="relative shrink-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold shadow-inner overflow-hidden bg-cover bg-center"
              style={{
                backgroundColor: `hsl(${profile.hue}, 60%, 45%)`,
                backgroundImage: profile.avatarUrl ? `url(${profile.avatarUrl})` : undefined,
              }}
            >
              {!profile.avatarUrl && profile.displayName.trim().slice(0, 1).toUpperCase()}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card"
              style={{ backgroundColor: statusColor(profile.status, true) }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground truncate">
              {profile.displayName}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {profile.customStatus ? profile.customStatus : `@${profile.username}`}
            </p>
          </div>
        </button>

        {/* Profile Settings Trigger */}
        <button
          onClick={() => {
            if (onOpenSettings) onOpenSettings('profile');
            else setProfileModalOpen(true);
          }}
          aria-label="Editar perfil"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          title="Editar perfil"
        >
          <PencilLine className="size-4" />
        </button>

        {/* Dedicated Settings Trigger */}
        <button
          onClick={() => {
            if (onOpenSettings) onOpenSettings('appearance');
          }}
          aria-label="Definições da aplicação"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          title="Definições"
        >
          <Settings className="size-4" />
        </button>
      </div>

      {/* Advanced Profile Customization Modal */}
      <ProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        profile={profile}
        onUpdateProfile={onUpdateProfile}
        onLogout={onLogout}
      />

      <UserProfileModal
        user={inspectedUser}
        open={inspectedUser !== null}
        onOpenChange={(open) => !open && setInspectedUser(null)}
        isBlocked={inspectedUser ? blockedUsers.some((b) => b.id === inspectedUser.id) : false}
        onToggleBlock={(userId, blocked) => api.blockUser(userId, blocked)}
        onStartMessage={(userId) => onSelectUser(userId)}
        isFriend={inspectedUser ? friendsState?.friends.some((f) => f.id === inspectedUser.id) : false}
        isPendingIncoming={inspectedUser ? friendsState?.incoming.some((f) => f.id === inspectedUser.id) : false}
        isPendingOutgoing={inspectedUser ? friendsState?.outgoing.some((f) => f.id === inspectedUser.id) : false}
        onFriendAction={inspectedUser && inspectedUser.id !== profile.id ? async (action) => {
          try {
            if (action === 'request') {
              await api.friendAction('request', { userId: inspectedUser.id });
              toast.success(`Pedido de amizade enviado para ${inspectedUser.displayName}!`);
            } else if (action === 'accept') {
              await api.friendAction('respond', { userId: inspectedUser.id, accept: true });
              toast.success(`Pedido de ${inspectedUser.displayName} aceite!`);
            } else {
              await api.friendAction('remove', { userId: inspectedUser.id });
              toast.info(`Amizade com ${inspectedUser.displayName} removida.`);
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
          }
        } : undefined}
      />
      {/* Server Administration Dialog */}
      {activeCommunity && isServerCreator && serverSettingsOpen && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-[200] grid place-items-center bg-background/80 text-sm">A abrir definições…</div>}><ServerSettingsDialog
          community={activeCommunity}
          allUsers={users}
          profile={profile}
          open={serverSettingsOpen}
          onOpenChange={setServerSettingsOpen}
        /></Suspense>
      )}

      {/* Create Category Modal */}
      <Dialog open={createCatOpen} onOpenChange={setCreateCatOpen}>
        <DialogContent className="sm:max-w-[380px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-center text-foreground">
              Criar Novo Separador
            </DialogTitle>
            <DialogDescription className="sr-only">Organiza os canais do teu servidor por categorias temáticas.</DialogDescription>
            <p className="text-xs text-muted-foreground text-center">
              Organiza os canais do teu servidor por categorias temáticas.
            </p>
          </DialogHeader>
          <form onSubmit={handleCreateCategory} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nome do Separador</Label>
              <Input
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="ex: Bate-papo, Jogos, Informações"
                className="h-10 rounded-xl bg-secondary/50 border-border text-xs"
                required
              />
            </div>
            <Button type="submit" className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90">
              Criar Separador
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Category Modal */}
      <Dialog open={editingCat !== null} onOpenChange={(open) => !open && setEditingCat(null)}>
        <DialogContent className="sm:max-w-[380px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-center text-foreground">
              Renomear Separador
            </DialogTitle>
            <DialogDescription className="sr-only">Altera o nome deste separador de canais.</DialogDescription>
          </DialogHeader>
          {editingCat && (
            <form onSubmit={handleUpdateCategory} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nome do Separador</Label>
                <Input
                  autoFocus
                  value={editingCat.name}
                  onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                  className="h-10 rounded-xl bg-secondary/50 border-border text-xs"
                  required
                />
              </div>
              <Button type="submit" className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90">
                Guardar Alterações
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Channel Modal */}
      <Dialog open={createChanOpen} onOpenChange={setCreateChanOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-center text-foreground">
              Criar Canal
            </DialogTitle>
            <DialogDescription className="sr-only">Adiciona um novo canal de texto, voz ou avisos ao servidor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChannel} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground font-medium">Tipo de Canal</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setNewChanType('text')}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    newChanType === 'text'
                      ? 'bg-primary/10 border-primary text-primary font-semibold'
                      : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Hash className="size-4" />
                  Texto
                </button>
                <button
                  type="button"
                  onClick={() => setNewChanType('voice')}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    newChanType === 'voice'
                      ? 'bg-primary/10 border-primary text-primary font-semibold'
                      : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Volume2 className="size-4" />
                  Voz
                </button>
                <button
                  type="button"
                  onClick={() => setNewChanType('announcement')}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-[11px] font-medium transition-all ${
                    newChanType === 'announcement'
                      ? 'bg-primary/10 border-primary text-primary font-semibold'
                      : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Megaphone className="size-3.5" />
                  Avisos
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-foreground font-medium">Nome do Canal</Label>
              <Input
                value={newChanName}
                onChange={(e) => setNewChanName(e.target.value)}
                placeholder="ex: geral, avisos, lounge"
                className="h-10 rounded-xl bg-secondary/50 border-border text-xs text-foreground focus:border-primary"
                required
              />
            </div>

            {activeCommunity?.categories && activeCommunity.categories.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-medium">Separador / Categoria</Label>
                <StyledSelect
                  value={newChanCategoryId || ''}
                  onChange={(e) => setNewChanCategoryId(e.target.value || undefined)}
                  aria-label="Categoria"
                  className="w-full h-10 px-3 rounded-xl bg-secondary/50 border border-border text-xs text-foreground"
                >
                  <option value="">(Sem separador)</option>
                  {activeCommunity.categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </StyledSelect>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90"
            >
              Criar Canal
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Channel Modal */}
      <Dialog open={editingChan !== null} onOpenChange={(open) => !open && setEditingChan(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-center text-foreground">
              Editar Canal
            </DialogTitle>
            <DialogDescription className="sr-only">Modifica as definições deste canal.</DialogDescription>
          </DialogHeader>
          {editingChan && (
            <form onSubmit={handleUpdateChannel} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-medium">Nome do Canal</Label>
                <Input
                  value={editingChan.name}
                  onChange={(e) => setEditingChan({ ...editingChan, name: e.target.value })}
                  className="h-10 rounded-xl bg-secondary/50 border-border text-xs text-foreground focus:border-primary"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-medium">Tipo de Canal</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingChan({ ...editingChan, type: 'text' })}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all ${
                      editingChan.type === 'text'
                        ? 'bg-primary/10 border-primary text-primary font-semibold'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Hash className="size-3.5" /> Texto
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingChan({ ...editingChan, type: 'voice' })}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all ${
                      editingChan.type === 'voice'
                        ? 'bg-primary/10 border-primary text-primary font-semibold'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Volume2 className="size-3.5" /> Voz
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingChan({ ...editingChan, type: 'announcement' })}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all ${
                      editingChan.type === 'announcement'
                        ? 'bg-primary/10 border-primary text-primary font-semibold'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Megaphone className="size-3.5" /> Avisos
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-medium">Separador / Categoria</Label>
                <StyledSelect
                  value={editingChan.categoryId || ''}
                  onChange={(e) => setEditingChan({ ...editingChan, categoryId: e.target.value || undefined })}
                  aria-label="Categoria"
                  className="w-full h-10 px-3 rounded-xl bg-secondary/50 border border-border text-xs text-foreground"
                >
                  <option value="">(Sem separador)</option>
                  {(activeCommunity?.categories || []).map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </StyledSelect>
              </div>

              <Button
                type="submit"
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90"
              >
                Guardar Alterações
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite Friends Modal */}
      <Dialog open={inviteOpen && canInviteMembers} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[380px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-center text-foreground">
              Convidar amigos para {activeCommunity?.name}
            </DialogTitle>
            <DialogDescription className="sr-only">Partilha o código de convite do servidor.</DialogDescription>
            <p className="text-xs text-muted-foreground text-center">
              Partilha este código de convite para que outros possam entrar:
            </p>
          </DialogHeader>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary border border-border mt-3">
            <span className="font-mono text-xs font-semibold text-foreground flex-1 pl-2 tracking-wider">
              {activeCommunity?.inviteCode}
            </span>
            <Button
              size="sm"
              onClick={copyInvite}
              className="h-8 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90"
            >
              {copied ? <Check className="size-3.5 mr-1 text-emerald-400" /> : <Copy className="size-3.5 mr-1" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Member By Username Modal */}
      <Dialog open={addMemberOpen && canInviteMembers} onOpenChange={(open) => { setAddMemberOpen(open); setMemberError(null); }}>
        <DialogContent className="sm:max-w-[390px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Adicionar ao servidor</DialogTitle>
            <DialogDescription className="sr-only">Encontra uma pessoa pelo nome de utilizador para adicionares ao servidor.</DialogDescription>
            <p className="text-xs text-muted-foreground">Encontra uma pessoa pelo nome de utilizador para adicionares ao servidor.</p>
          </DialogHeader>
          <form onSubmit={handleAddMember} className="mt-2 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nome de utilizador</Label>
              <Input
                autoFocus
                value={memberUsername}
                onChange={(event) => setMemberUsername(event.target.value.replace(/^@/, ''))}
                placeholder="ex: pedro_123"
                disabled={memberPending}
                required
              />
            </div>
            {memberError && (
              <p role="status" className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                {memberError}
              </p>
            )}
            <Button
              type="submit"
              disabled={memberPending}
              className="w-full h-10 rounded-xl bg-foreground text-background font-semibold text-xs"
            >
              {memberPending ? 'A procurar…' : 'Adicionar membro'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <ActionConfirmation action={confirmation} onClose={() => setConfirmation(null)} />
    </div>
  );
}


