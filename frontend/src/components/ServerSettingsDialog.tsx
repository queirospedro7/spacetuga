import { readProfileImage as readCompressedImage } from '@/lib/profile-images';
import { ActionConfirmation, type ConfirmationAction } from '@/components/ActionConfirmation';
import { StyledSelect } from '@/components/StyledSelect';
import { channelName, serverItemName } from '@/lib/server-names';
import { useState, useMemo, useEffect, useRef, useDeferredValue, type FormEvent } from 'react';
import '@/styles/settings.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Shield,
  Settings,
  FolderTree,
  Users,
  Plus,
  Trash2,
  Check,
  Copy,
  Hash,
  Volume2,
  Megaphone,
  Pencil,
  AlertTriangle,
  UserMinus,
  UserPlus,
  Crown,
  GripVertical,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import type { Community, PublicUser, MyProfile, CommunityRole, CommunityRolePermissions } from '@/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface ServerSettingsDialogProps {
  community: Community;
  allUsers: PublicUser[];
  profile: MyProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_COLORS = [
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Dourado', value: '#f59e0b' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Ciano', value: '#06b6d4' },
  { label: 'Cinzento', value: '#64748b' },
];

export function ServerSettingsDialog({
  community,
  allUsers,
  profile,
  open,
  onOpenChange,
}: ServerSettingsDialogProps) {
  const isOwner = community.ownerId === profile.id || profile.globalRole === 'owner';
  const isAdmin = community.admins?.includes(profile.id) || profile.globalRole === 'admin';
  const myRoles = community.memberRoles?.[profile.id] || [];
  const hasManageServer = isOwner || isAdmin || (community.roles || []).some(
    (r) => myRoles.includes(r.id) && (r.permissions?.administrator || r.permissions?.manageServer)
  );
  const canManageChannels = hasManageServer || (community.roles || []).some(
    (r) => myRoles.includes(r.id) && (r.permissions?.administrator || r.permissions?.manageChannels)
  );
  const canManageRoles = hasManageServer || (community.roles || []).some((role) => myRoles.includes(role.id) && role.permissions?.manageRoles);
  const canKickMembers = hasManageServer || (community.roles || []).some((role) => myRoles.includes(role.id) && role.permissions?.kickMembers);
  const canInviteMembers = hasManageServer || community.allowMemberInvites || (community.roles || []).some(
    (r) => myRoles.includes(r.id) && (r.permissions?.administrator || r.permissions?.inviteMembers)
  );

  const [activeTab, setActiveTab] = useState<'overview' | 'channels' | 'roles' | 'members' | 'invites'>('overview');
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);

  // Overview form state
  const [serverName, setServerName] = useState(community.name);
  const [serverIcon, setServerIcon] = useState(community.icon);
  const [serverBannerUrl, setServerBannerUrl] = useState(community.bannerUrl || '');
  const [serverBannerPosition, setServerBannerPosition] = useState<number>(community.bannerPosition ?? 50);
  const [serverBannerColor, setServerBannerColor] = useState(community.bannerColor || '');
  const [serverDescription, setServerDescription] = useState(community.description || '');
  const [serverIsPublic, setServerIsPublic] = useState(community.isPublic);
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(community.defaultRoleId || null);
  const [allowMemberInvites, setAllowMemberInvites] = useState<boolean>(community.allowMemberInvites ?? false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [confirmDeleteServer, setConfirmDeleteServer] = useState(false);
  const [savingStructure, setSavingStructure] = useState(false);
  const structurePending = useRef(false);
  async function confirmChange(type: string, patch: Record<string, unknown>, accept: (value: Community) => boolean, success: string) {
    if (structurePending.current) return false;
    structurePending.current = true; setSavingStructure(true);
    try { const result = await api.confirmCommunityChange(type, community.id, patch, accept); toast.success(success); return result.community; }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível confirmar a alteração. Tenta novamente.'); return false; }
    finally { structurePending.current = false; setSavingStructure(false); }
  }
  function saveChannelOrder(channels: { id: string; categoryId?: string }[], success: string) {
    void confirmChange('community:structure:reorder', { channels }, (value) => channels.every((channel, index) => value.channels[index]?.id === channel.id && (value.channels[index]?.categoryId || '') === (channel.categoryId || '')), success);
  }
  const [savingOverview, setSavingOverview] = useState(false);
  const pendingOverview = useRef<string | null>(null);
  const initializedOverview = useRef<string | null>(null);
  useEffect(() => {
    const complete = () => { pendingOverview.current = null; setSavingOverview(false); };
    const saved = api.on('community:saved', ({ requestId }) => { if (requestId !== pendingOverview.current) return; complete(); toast.success('Alterações do servidor guardadas.'); });
    const failed = api.on('err', ({ requestId, code }) => { if (!requestId || requestId !== pendingOverview.current) return; complete(); toast.error(code === 'member_permission' ? 'Não tens permissão para guardar estas alterações.' : 'Não foi possível guardar. Verifica as imagens e tenta novamente.'); });
    const disconnected = api.on('disconnected', () => { if (!pendingOverview.current) return; complete(); toast.error('A ligação foi interrompida. As alterações não foram confirmadas.'); });
    return () => { saved(); failed(); disconnected(); };
  }, []);
  useEffect(() => {
    if (!savingOverview) return;
    const timer = window.setTimeout(() => { pendingOverview.current = null; setSavingOverview(false); toast.error('O servidor não confirmou a gravação. Tenta novamente.'); }, 10000);
    return () => window.clearTimeout(timer);
  }, [savingOverview]);

  // Channels / Categories state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice' | 'announcement'>('text');
  const [newChannelCategory, setNewChannelCategory] = useState<string>('');

  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [editingChannelType, setEditingChannelType] = useState<'text' | 'voice' | 'announcement'>('text');
  const [editingChannelCategory, setEditingChannelCategory] = useState<string>('');

  // Drag and drop channels state within the settings modal
  const [draggedChanId, setDraggedChanId] = useState<string | null>(null);
  const [dragOverChanId, setDragOverChanId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);

  // Roles state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#3b82f6');
  const [rolePerms, setRolePerms] = useState<CommunityRolePermissions>({
    sendMessages: true,
    connectVoice: true,
    speakVoice: true,
    inviteMembers: true,
  });

  // Members search & add member state
  const [memberSearch, setMemberSearch] = useState('');
  const [addUsernameInput, setAddUsernameInput] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const serverIconInputRef = useRef<HTMLInputElement>(null);
  const serverBannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { initializedOverview.current = null; return; }
    if (initializedOverview.current === community.id) return;
    initializedOverview.current = community.id;
    setServerName(community.name);
    setServerIcon(community.icon);
    setServerBannerUrl(community.bannerUrl || '');
    setServerBannerPosition(community.bannerPosition ?? 50);
    setServerBannerColor(community.bannerColor || '');
    setServerDescription(community.description || '');
    setServerIsPublic(community.isPublic);
    setDefaultRoleId(community.defaultRoleId || null);
    setAllowMemberInvites(community.allowMemberInvites ?? false);
  }, [community, open]);

  async function handleServerIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await readCompressedImage(file, 400);
      setServerIcon(b64);
      toast.success('Foto do servidor carregada');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : '') || 'Erro ao carregar foto do servidor');
    } finally {
      e.target.value = '';
    }
  }

  async function handleServerBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await readCompressedImage(file, 1000);
      setServerBannerUrl(b64);
      toast.success('Banner do servidor carregado');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : '') || 'Erro ao carregar banner');
    } finally {
      e.target.value = '';
    }
  }

  // Handle Save Overview
  function handleSaveOverview(e: React.FormEvent) {
    e.preventDefault();
    if (!hasManageServer || pendingOverview.current) return;
    setSavingOverview(true);
    pendingOverview.current = api.updateCommunity(community.id, {
      name: serverName.trim() || community.name,
      ...(serverIcon !== community.icon ? { icon: serverIcon.trim() } : {}),
      ...(serverBannerUrl !== (community.bannerUrl || '') ? { bannerUrl: serverBannerUrl.trim() } : {}),
      bannerPosition: serverBannerPosition,
      bannerColor: serverBannerColor,
      description: serverDescription.trim(),
      isPublic: serverIsPublic,
      ...(defaultRoleId !== (community.defaultRoleId || null) ? { defaultRoleId: defaultRoleId || null } : {}),
      allowMemberInvites,
    });
  }

  // Handle Delete Server
  async function handleDeleteServer() {
    if (!isOwner) return;
    try { await api.deleteCommunityConfirmed(community.id); onOpenChange(false); toast.success('Servidor eliminado.'); }
    catch { toast.error('Não foi possível confirmar a eliminação do servidor.'); }
  }

  // Handle Copy Invite Code
  async function handleCopyInvite() {
    try { await navigator.clipboard.writeText(community.inviteCode); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); toast.success('Código de convite copiado'); }
    catch { toast.error('Não foi possível copiar o código.'); }
  }

  // Handle Add Member by Username
  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    const cleanUser = addUsernameInput.trim().replace(/^@/, '');
    if (!cleanUser || addingMember) return;
    setAddingMember(true);
    try { const result = await api.addCommunityMemberConfirmed(community.id, cleanUser); setAddUsernameInput(''); toast.success(`${result.displayName} foi adicionado.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível adicionar a pessoa.'); }
    finally { setAddingMember(false); }
  }

  // Handle Category Creation
  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const name = serverItemName(newCategoryName); const count = community.categories?.length || 0;
    if (await confirmChange('community:category:create', { name }, (value) => (value.categories?.length || 0) > count && !!value.categories?.some((category) => category.name === name), 'Separador criado.')) setNewCategoryName('');
  }

  async function handleSaveCategoryName(categoryId: string) {
    if (!editingCategoryName.trim()) return;
    const name = serverItemName(editingCategoryName);
    if (await confirmChange('community:category:update', { categoryId, name }, (value) => !!value.categories?.some((category) => category.id === categoryId && category.name === name), 'Separador atualizado.')) setEditingCategoryId(null);
  }

  // Handle Channel Creation
  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    const name = channelName(newChannelName); const count = community.channels.length;
    if (await confirmChange('community:channel:create', { name, type: newChannelType, categoryId: newChannelCategory || undefined }, (value) => value.channels.length > count && value.channels.some((channel) => channel.name === name && channel.type === newChannelType), 'Canal criado.')) setNewChannelName('');
  }

  async function handleSaveChannel() {
    if (!editingChannelId || !editingChannelName.trim()) return;
    const patch = {
      name: channelName(editingChannelName),
      type: editingChannelType,
      categoryId: editingChannelCategory || null,
    };
    if (await confirmChange('community:channel:update', { channelId: editingChannelId, ...patch }, (value) => value.channels.some((channel) => channel.id === editingChannelId && channel.name === patch.name && channel.type === patch.type && (channel.categoryId || null) === patch.categoryId), 'Canal atualizado.')) setEditingChannelId(null);
  }

  // Move channel up or down via button or drag
  function moveChannel(channelId: string, direction: 'up' | 'down') {
    const channels = community.channels.map((channel) => ({ ...channel }));
    const idx = channels.findIndex((c) => c.id === channelId);
    if (idx === -1) return;
    const chan = channels[idx];

    // Find siblings in the same category
    const siblingIndices = channels
      .map((c, i) => (c.categoryId === chan.categoryId ? i : -1))
      .filter((i) => i !== -1);
    const posInSiblings = siblingIndices.indexOf(idx);
    if (posInSiblings === -1) return;

    const targetPosInSiblings = direction === 'up' ? posInSiblings - 1 : posInSiblings + 1;
    if (targetPosInSiblings < 0 || targetPosInSiblings >= siblingIndices.length) return;

    const swapTargetIndex = siblingIndices[targetPosInSiblings];
    const [moved] = channels.splice(idx, 1);
    channels.splice(swapTargetIndex, 0, moved);

    const reorderedList = channels.map((c) => ({ id: c.id, categoryId: c.categoryId }));
    saveChannelOrder(reorderedList, 'Posição do canal atualizada.');
  }

  // Drag and drop reordering inside modal
  function handleDropOnChannel(targetChanId: string, targetCategoryId?: string) {
    if (!draggedChanId || draggedChanId === targetChanId) {
      setDraggedChanId(null);
      setDragOverChanId(null);
      setDragOverCatId(null);
      return;
    }
    const channels = community.channels.map((channel) => ({ ...channel }));
    const sourceIdx = channels.findIndex((c) => c.id === draggedChanId);
    const targetIdx = channels.findIndex((c) => c.id === targetChanId);
    if (sourceIdx === -1 || targetIdx === -1) {
      setDraggedChanId(null);
      setDragOverChanId(null);
      setDragOverCatId(null);
      return;
    }

    const [moved] = channels.splice(sourceIdx, 1);
    moved.categoryId = targetCategoryId;
    channels.splice(targetIdx, 0, moved);

    const reorderedList = channels.map((c) => ({ id: c.id, categoryId: c.categoryId }));
    saveChannelOrder(reorderedList, 'Canais reordenados.');
    setDraggedChanId(null);
    setDragOverChanId(null);
    setDragOverCatId(null);
  }

  function handleDropOnCategory(targetCatId?: string) {
    if (!draggedChanId) {
      setDragOverCatId(null);
      return;
    }
    const channels = community.channels.map((channel) => ({ ...channel }));
    const targetChan = channels.find((c) => c.id === draggedChanId);
    if (targetChan) {
      targetChan.categoryId = targetCatId;
      const reorderedList = channels.map((c) => ({ id: c.id, categoryId: c.categoryId }));
      saveChannelOrder(reorderedList, 'Canal movido para o separador.');
    }
    setDraggedChanId(null);
    setDragOverChanId(null);
    setDragOverCatId(null);
  }

  // Handle Roles
  function handleStartCreateRole() {
    const newRole: CommunityRole = {
      id: '',
      name: 'Novo Cargo',
      color: '#3b82f6',
      permissions: {},
    };
    setSelectedRoleId('new');
    setRoleName(newRole.name);
    setRoleColor(newRole.color || '#3b82f6');
    setRolePerms(newRole.permissions);
  }

  function handleSelectRole(r: CommunityRole) {
    setSelectedRoleId(r.id);
    setRoleName(r.name);
    setRoleColor(r.color || '#3b82f6');
    setRolePerms(r.permissions || {});
  }

  async function handleSaveRole() {
    if (!roleName.trim()) return;
    if (selectedRoleId === 'new') {
      const existingIds = new Set((community.roles || []).map((role) => role.id));
      const name = serverItemName(roleName);
      const created = await confirmChange('community:role:create', { name, color: roleColor, permissions: rolePerms }, (value) => !!value.roles?.some((role) => !existingIds.has(role.id) && role.name === name), 'Cargo criado.');
      if (created) { const role = created.roles?.find((entry) => !existingIds.has(entry.id) && entry.name === name); if (role) handleSelectRole(role); }
    } else if (selectedRoleId) {
      const patch = {
        name: serverItemName(roleName),
        color: roleColor,
        permissions: rolePerms,
      };
      await confirmChange('community:role:update', { roleId: selectedRoleId, ...patch }, (value) => !!value.roles?.some((role) => role.id === selectedRoleId && role.name === patch.name && role.color === patch.color && Object.entries(patch.permissions).every(([key, enabled]) => role.permissions?.[key as keyof CommunityRolePermissions] === enabled)), 'Cargo atualizado.');
    }
  }

  function handleDeleteRole(roleId: string) {
    confirmRemoval('role', roleId);
  }
  function confirmRemoval(kind: 'channel' | 'category' | 'role', id: string) {
    const label = kind === 'channel' ? 'canal' : kind === 'category' ? 'separador' : 'cargo';
    setConfirmation({ title: `Eliminar ${label}?`, description: kind === 'channel' ? 'As mensagens deste canal serão eliminadas. Esta ação não pode ser desfeita.' : kind === 'category' ? 'Os canais passam para a lista geral.' : 'Este cargo será retirado dos membros a quem está atribuído.', execute: async () => {
      const result = await confirmChange(`community:${kind}:delete`, { [`${kind}Id`]: id }, (value) => kind === 'channel' ? !value.channels.some((entry) => entry.id === id) : kind === 'category' ? !value.categories?.some((entry) => entry.id === id) : !value.roles?.some((entry) => entry.id === id), `${label.charAt(0).toUpperCase() + label.slice(1)} eliminado.`);
      if (!result) return false;
      if (kind === 'role') { if (selectedRoleId === id) setSelectedRoleId(null); if (defaultRoleId === id) setDefaultRoleId(null); }
      return true;
    } });
  }

  const deferredMemberSearch = useDeferredValue(memberSearch);

  // Filtered members
  const memberList = useMemo(() => {
    const userMap = new Map<string, PublicUser>(allUsers.map((u) => [u.id, u]));
    userMap.set(profile.id, { ...profile, online: true });
    const q = deferredMemberSearch.trim().toLowerCase();

    return community.members.map((userId) => {
      const user = userMap.get(userId) || {
        id: userId,
        username: userId,
        displayName: userId === profile.id ? profile.displayName : 'Membro Offline',
        hue: 200,
        emoji: '',
        avatarUrl: '',
        online: false,
        about: '',
        status: 'offline',
        createdAt: 0,
      };
      return user;
    }).filter((u) => {
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
  }, [community.members, allUsers, profile, deferredMemberSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-busy={savingOverview || savingStructure} className="tuga-server-settings max-w-[96vw] sm:max-w-5xl h-[88vh] p-0 rounded-3xl bg-card border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Modern Header */}
        <div className="h-16 px-6 border-b border-border flex items-center justify-between bg-card/70 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 items-center justify-center rounded-2xl font-bold text-white shadow-inner overflow-hidden bg-cover bg-center shrink-0 border border-border"
              style={{
                backgroundColor: 'hsl(220, 60%, 45%)',
                backgroundImage:
                  community.icon && (community.icon.startsWith('http') || community.icon.startsWith('data:') || community.icon.startsWith('blob:'))
                    ? `url(${community.icon})`
                    : undefined,
              }}
            >
              {!(
                community.icon && (community.icon.startsWith('http') || community.icon.startsWith('data:') || community.icon.startsWith('blob:'))
              ) && community.icon.slice(0, 2)}
            </span>
            <div>
              <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                <span>{community.name}</span>
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase bg-secondary px-2 py-0.5 rounded-full border border-border">
                  Administração
                </span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                Painel unificado de gestão do servidor {community.name}.
              </DialogDescription>
              <p className="text-xs text-muted-foreground">
                Painel unificado de gestão, separadores, canais, permissões e convites
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body: Left Tab Rail + Right Tab Content */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
          {/* Navigation Sidebar */}
          <div className="server-settings-nav w-full sm:w-60 border-b sm:border-b-0 sm:border-r border-border bg-secondary/30 p-3 gap-1.5 sm:space-y-1.5 shrink-0 overflow-auto flex sm:block">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Settings className="size-4 shrink-0" />
              <span>Visão Geral</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channels')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'channels'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <FolderTree className="size-4 shrink-0" />
              <span>Separadores & Canais</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('roles');
                if (!selectedRoleId && (community.roles || []).length > 0) {
                  handleSelectRole(community.roles![0]);
                }
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'roles'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Shield className="size-4 shrink-0" />
              <span>Cargos & Permissões</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'members'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Users className="size-4 shrink-0" />
              <span>Membros ({community.members.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('invites')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'invites'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <UserPlus className="size-4 shrink-0" />
              <span>Convites & Adicionar</span>
            </button>
          </div>

          {/* Right Main Content Pane */}
          <div className="flex-1 p-6 sm:p-8 overflow-y-auto">
            {/* 1. VISÃO GERAL */}
            {activeTab === 'overview' && (
              <form onSubmit={handleSaveOverview} className="space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground">
                      Perfil e Configurações do Servidor
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Define a identidade visual, visibilidade e comportamento de novos membros.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Nome do Servidor</Label>
                    <Input
                      value={serverName}
                      aria-label="Nome do servidor"
                      onChange={(e) => setServerName(e.target.value)}
                      required
                      disabled={!hasManageServer}
                      className="rounded-xl h-10 bg-secondary/40 border-border text-xs"
                    />
                  </div>

                  {/* Foto / Ícone do Servidor */}
                  <div className="p-4 rounded-2xl border border-border bg-secondary/20 space-y-3">
                    <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Foto / Ícone do Servidor</span>
                      <span className="text-[11px] text-muted-foreground font-normal">Recomendado 512x512 ou superior</span>
                    </Label>
                    
                    <div className="flex items-center gap-4">
                      <span
                        className="flex size-16 items-center justify-center rounded-2xl font-bold text-lg text-white shadow-md bg-cover bg-center border-2 border-border shrink-0"
                        style={{
                          backgroundColor: 'hsl(220, 60%, 45%)',
                          backgroundImage:
                            serverIcon && (serverIcon.startsWith('http') || serverIcon.startsWith('data:') || serverIcon.startsWith('blob:'))
                              ? `url(${serverIcon})`
                              : undefined,
                        }}
                      >
                        {!(
                          serverIcon && (serverIcon.startsWith('http') || serverIcon.startsWith('data:') || serverIcon.startsWith('blob:'))
                        ) && (serverIcon ? serverIcon.slice(0, 2).toUpperCase() : serverName.slice(0, 2).toUpperCase())}
                      </span>

                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={!hasManageServer}
                            onClick={() => serverIconInputRef.current?.click()}
                            className="rounded-xl text-xs h-8 gap-1.5 font-medium"
                          >
                            <Upload className="size-3.5" />
                            Carregar Foto
                          </Button>
                          <input
                            ref={serverIconInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleServerIconFile}
                          />

                          {serverIcon && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!hasManageServer}
                              onClick={() => setServerIcon('')}
                              className="rounded-xl text-xs h-8 text-destructive hover:bg-destructive/10 gap-1.5"
                            >
                              <Trash2 className="size-3.5" />
                              Remover Foto
                            </Button>
                          )}
                        </div>

                        <Input
                          value={serverIcon}
                          onChange={(e) => setServerIcon(e.target.value)}
                          placeholder="Ou cola aqui um link direto (URL) ou sigla..."
                          disabled={!hasManageServer}
                          className="rounded-xl h-8.5 bg-background border-border text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Banner do Servidor com Enquadramento Reposicionável */}
                  <div className="p-4 rounded-2xl border border-border bg-secondary/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">
                        Banner do Servidor
                      </Label>
                      <span className="text-[11px] text-muted-foreground">
                        Ajusta o enquadramento se a imagem for maior
                      </span>
                    </div>

                    {/* Banner Preview & Drag Area */}
                    <div
                      className={`h-36 w-full rounded-2xl border border-border relative overflow-hidden select-none transition-all ${
                        serverBannerUrl ? 'cursor-ns-resize shadow-inner' : 'bg-secondary/40'
                      }`}
                      style={{
                        backgroundColor: serverBannerColor && !serverBannerUrl ? serverBannerColor : 'hsl(220, 20%, 18%)',
                        backgroundImage: serverBannerUrl ? `url(${serverBannerUrl})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: `50% ${serverBannerPosition}%`,
                        backgroundRepeat: 'no-repeat',
                      }}
                      onMouseDown={(e) => {
                        if (!serverBannerUrl || !hasManageServer) return;
                        e.preventDefault();
                        const startY = e.clientY;
                        const initialPos = serverBannerPosition;
                        function handleMouseMove(moveEvent: MouseEvent) {
                          const deltaY = moveEvent.clientY - startY;
                          const deltaPercent = Math.round(deltaY / 1.3);
                          const newPos = Math.max(0, Math.min(100, initialPos + deltaPercent));
                          setServerBannerPosition(newPos);
                        }
                        function handleMouseUp() {
                          window.removeEventListener('mousemove', handleMouseMove);
                          window.removeEventListener('mouseup', handleMouseUp);
                        }
                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      {serverBannerUrl ? (
                        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white text-[10px] font-medium pointer-events-none">
                          <ImageIcon className="size-3" />
                          <span>Arrasta verticalmente para posicionar ({serverBannerPosition}%)</span>
                        </div>
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground text-xs gap-1.5">
                          <ImageIcon className="size-6 stroke-[1.5]" />
                          <span>Sem banner definido</span>
                        </div>
                      )}
                    </div>

                    {/* Banner Controls & Slider */}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!hasManageServer}
                          onClick={() => serverBannerInputRef.current?.click()}
                          className="rounded-xl text-xs h-8 gap-1.5 font-medium"
                        >
                          <Upload className="size-3.5" />
                          Carregar Imagem de Banner
                        </Button>
                        <input
                          ref={serverBannerInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleServerBannerFile}
                        />

                        {serverBannerUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!hasManageServer}
                            onClick={() => {
                              setServerBannerUrl('');
                              setServerBannerPosition(50);
                            }}
                            className="rounded-xl text-xs h-8 text-destructive hover:bg-destructive/10 gap-1.5"
                          >
                            <Trash2 className="size-3.5" />
                            Remover Banner
                          </Button>
                        )}
                      </div>

                      <Input
                        value={serverBannerUrl}
                        onChange={(e) => setServerBannerUrl(e.target.value)}
                        placeholder="Ou cola aqui o link direto da imagem de banner..."
                        disabled={!hasManageServer}
                        className="rounded-xl h-8.5 bg-background border-border text-xs"
                      />

                      {serverBannerUrl && (
                        <div className="p-3 rounded-xl bg-background border border-border space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span className="text-foreground">Posição Vertical do Banner (Enquadramento)</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{serverBannerPosition}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={serverBannerPosition}
                            onChange={(e) => setServerBannerPosition(Number(e.target.value))}
                            disabled={!hasManageServer}
                            className="w-full h-2 rounded-lg accent-primary cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Topo (0%)</span>
                            <span>Centro (50%)</span>
                            <span>Fundo (100%)</span>
                          </div>
                        </div>
                      )}

                      {/* Banner Color Picker */}
                      <div className="p-3 rounded-xl bg-background border border-border space-y-2">
                        <Label className="text-xs font-medium text-foreground">Cor sólida do banner</Label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {ROLE_COLORS.map((swatch) => (
                            <button
                              key={swatch.value}
                              type="button"
                              title={swatch.label}
                              disabled={!hasManageServer}
                              onClick={() => {
                                setServerBannerColor(swatch.value);
                                setServerBannerUrl('');
                              }}
                              className={`w-7 h-7 rounded-lg border-2 transition-all ${serverBannerColor === swatch.value && !serverBannerUrl ? 'border-primary ring-2 ring-primary/40 scale-110' : 'border-transparent hover:scale-105'}`}
                              style={{ backgroundColor: swatch.value }}
                              aria-label={`Cor ${swatch.label}`}
                            />
                          ))}
                          <input
                            type="color"
                            value={serverBannerColor || '#3b82f6'}
                            disabled={!hasManageServer}
                            onChange={(e) => {
                              setServerBannerColor(e.target.value);
                              setServerBannerUrl('');
                            }}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-border bg-transparent"
                            title="Cor personalizada"
                            aria-label="Cor personalizada do banner"
                          />
                          {serverBannerColor && !serverBannerUrl && (
                            <button
                              type="button"
                              disabled={!hasManageServer}
                              onClick={() => setServerBannerColor('')}
                              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
                            >
                              Remover cor
                            </button>
                          )}
                        </div>
                        {serverBannerColor && !serverBannerUrl && (
                          <div
                            className="h-6 w-full rounded-lg border border-border/60"
                            style={{ backgroundColor: serverBannerColor }}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Descrição</Label>
                    <Input
                      value={serverDescription}
                      onChange={(e) => setServerDescription(e.target.value)}
                      placeholder="Um espaço para conversar, colaborar e partilhar."
                      disabled={!hasManageServer}
                      className="rounded-xl h-10 bg-secondary/40 border-border text-xs"
                    />
                  </div>

                  {/* Cargo Predefinido para novos membros (Default Role) */}
                  <div className="p-3.5 rounded-2xl border border-border bg-secondary/30 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Crown className="size-4 text-primary" />
                      <Label className="text-xs font-semibold text-foreground">
                        Cargo Predefinido para Novos Membros
                      </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Os novos membros que entrarem através de código de convite receberão este cargo automaticamente.
                    </p>
                    <StyledSelect
                      value={defaultRoleId || ''}
                      onChange={(e) => setDefaultRoleId(e.target.value || null)}
                      disabled={!hasManageServer}
                      className="w-full rounded-xl h-9.5 bg-background border border-border text-xs px-3 text-foreground mt-1"
                    >
                      <option value="">Nenhum cargo (Membro comum sem cargo especial)</option>
                      {(community.roles || []).map((r) => (
                        <option key={r.id} value={r.id}>
                          Cargo: {r.name}
                        </option>
                      ))}
                    </StyledSelect>
                  </div>

                  {/* Permitir que qualquer membro convide pessoas */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-secondary/30">
                    <div>
                      <span className="text-xs font-semibold text-foreground block">
                        Permitir que Todos os Membros Convidem
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Permite que qualquer pessoa no servidor partilhe o código e convide amigos, mesmo sem cargo de admin.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={allowMemberInvites}
                      onChange={(e) => setAllowMemberInvites(e.target.checked)}
                      disabled={!hasManageServer}
                      className="size-4 accent-primary rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-secondary/30">
                    <div>
                      <span className="text-xs font-semibold text-foreground block">Servidor Público</span>
                      <span className="text-[11px] text-muted-foreground">
                        Qualquer utilizador pode encontrar e entrar com o código ou nome
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={serverIsPublic}
                      onChange={(e) => setServerIsPublic(e.target.checked)}
                      disabled={!hasManageServer || community.directGroup}
                      className="size-4 accent-primary rounded"
                    />
                  </div>
                </div>

                {hasManageServer && (
                  <Button type="submit" disabled={savingOverview} className="h-10 rounded-2xl px-6 font-semibold text-xs shadow-md">
                    {savingOverview ? 'A guardar…' : 'Guardar Alterações'}
                  </Button>
                )}

                {/* Danger Zone: Delete Server */}
                {isOwner && (
                  <div className="pt-6 border-t border-destructive/20 mt-8 space-y-3">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="size-4" />
                      <h4 className="text-xs font-semibold uppercase tracking-wider">Zona de Perigo</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Eliminar este servidor apagará permanentemente todos os canais, mensagens e configurações para todos os membros.
                    </p>
                    {confirmDeleteServer ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleDeleteServer}
                          className="h-9 rounded-xl text-xs font-semibold"
                        >
                          Sim, eliminar definitivamente
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setConfirmDeleteServer(false)}
                          className="h-9 rounded-xl text-xs"
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setConfirmDeleteServer(true)}
                        className="h-9 rounded-xl text-xs font-semibold"
                      >
                        Eliminar Servidor
                      </Button>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* 2. SEPARADORES & CANAIS (COM CRIAÇÃO + DRAG & DROP) */}
            {activeTab === 'channels' && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    Gestão Completa de Separadores e Canais
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cria novos canais e separadores e arrasta-os para organizar a ordem perfeita.
                  </p>
                </div>

                {/* Create New Category / Separator */}
                <div className="p-4 rounded-2xl border border-border bg-secondary/20 space-y-3">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Plus className="size-3.5 text-primary" /> Criar Novo Separador
                  </h4>
                  <form onSubmit={handleCreateCategory} className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Nome do separador (ex: INFORMACIONAL, GERAL, JOGOS)"
                      className="rounded-xl h-9 bg-background border-border text-xs flex-1"
                      disabled={!canManageChannels}
                    />
                    <Button
                      type="submit"
                      disabled={!newCategoryName.trim() || !canManageChannels}
                      className="h-9 rounded-xl text-xs font-semibold"
                    >
                      Adicionar Separador
                    </Button>
                  </form>
                </div>

                {/* Create New Channel */}
                <div className="p-4 rounded-2xl border border-border bg-secondary/20 space-y-3">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Plus className="size-3.5 text-primary" /> Criar Novo Canal
                  </h4>
                  <form onSubmit={handleCreateChannel} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        placeholder="Nome do canal (ex: conversas, novidades)"
                        required
                        disabled={!canManageChannels}
                        className="rounded-xl h-9 bg-background border-border text-xs"
                      />

                      <StyledSelect
                        value={newChannelType}
                        onChange={(e) => setNewChannelType(e.target.value as 'text' | 'voice' | 'announcement')}
                        disabled={!canManageChannels}
                        className="rounded-xl h-9 bg-background border border-border text-xs px-2.5 text-foreground"
                      >
                        <option value="text">Texto</option>
                        <option value="voice">Voz</option>
                        <option value="announcement">Avisos</option>
                      </StyledSelect>

                      <StyledSelect
                        value={newChannelCategory}
                        onChange={(e) => setNewChannelCategory(e.target.value)}
                        disabled={!canManageChannels}
                        className="rounded-xl h-9 bg-background border border-border text-xs px-2.5 text-foreground"
                      >
                        <option value="">Sem separador</option>
                        {(community.categories || []).map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            Separador: {cat.name}
                          </option>
                        ))}
                      </StyledSelect>
                    </div>

                    <Button
                      type="submit"
                      disabled={!newChannelName.trim() || !canManageChannels}
                      className="h-9 rounded-xl text-xs font-semibold"
                    >
                      Criar Canal
                    </Button>
                  </form>
                </div>

                {/* Structure Tree with Drag & Drop */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      Organização & Reordenação (Arrasta para reordenar)
                    </h3>
                  </div>

                  {/* Render Categories */}
                  {(community.categories || []).map((category) => {
                    const categoryChannels = community.channels.filter((c) => c.categoryId === category.id);
                    const isEditing = editingCategoryId === category.id;
                    const isCatDragOver = dragOverCatId === category.id;

                    return (
                      <div
                        key={category.id}
                        onDragOver={(e) => {
                          if (draggedChanId) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            setDragOverCatId(category.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverCatId === category.id) setDragOverCatId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDropOnCategory(category.id);
                        }}
                        className={`rounded-2xl border p-3 space-y-2 bg-card/60 transition-all ${
                          isCatDragOver ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border'
                        }`}
                      >
                        {/* Category Header */}
                        <div className="flex items-center justify-between pb-1 border-b border-border/50">
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1 mr-2">
                              <Input
                                value={editingCategoryName}
                                onChange={(e) => setEditingCategoryName(e.target.value)}
                                className="h-7 text-xs rounded-lg bg-background"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => handleSaveCategoryName(category.id)}
                                className="h-7 text-xs rounded-lg"
                              >
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingCategoryId(null)}
                                className="h-7 text-xs rounded-lg"
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                {category.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground/70">
                                ({categoryChannels.length} canais)
                              </span>
                            </div>
                          )}

                          {canManageChannels && !isEditing && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCategoryId(category.id);
                                  setEditingCategoryName(category.name);
                                }}
                                className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                title="Mudar nome do separador"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => confirmRemoval('category', category.id)}
                                className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Eliminar separador"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Category Channels with Drag & Drop */}
                        <div className="space-y-1.5 pl-1">
                          {categoryChannels.map((channel) => {
                            const isDragging = draggedChanId === channel.id;
                            const isTarget = dragOverChanId === channel.id;

                            return (
                              <div
                                key={channel.id}
                                draggable={canManageChannels}
                                onDragStart={(e) => {
                                  if (!canManageChannels) return;
                                  e.stopPropagation();
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', channel.id);
                                  setDraggedChanId(channel.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedChanId(null);
                                  setDragOverChanId(null);
                                  setDragOverCatId(null);
                                }}
                                onDragOver={(e) => {
                                  if (draggedChanId && draggedChanId !== channel.id) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'move';
                                    setDragOverChanId(channel.id);
                                  }
                                }}
                                onDragLeave={() => {
                                  if (dragOverChanId === channel.id) setDragOverChanId(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDropOnChannel(channel.id, category.id);
                                }}
                                className={`flex items-center justify-between p-2 rounded-xl border border-transparent transition-all text-xs ${
                                  isDragging ? 'opacity-30 scale-95 border-dashed border-primary' : 'bg-secondary/40 hover:bg-secondary/70'
                                } ${isTarget ? 'ring-2 ring-primary ring-offset-1 bg-primary/10' : ''}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {canManageChannels && (
                                    <GripVertical className="size-3.5 text-muted-foreground/50 cursor-grab shrink-0" />
                                  )}
                                  {channel.type === 'voice' ? (
                                    <Volume2 className="size-3.5 text-emerald-500 shrink-0" />
                                  ) : channel.type === 'announcement' ? (
                                    <Megaphone className="size-3.5 text-amber-500 shrink-0" />
                                  ) : (
                                    <Hash className="size-3.5 text-primary shrink-0" />
                                  )}
                                  <span className="font-medium text-foreground truncate">{channel.name}</span>
                                </div>

                                {canManageChannels && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => moveChannel(channel.id, 'up')}
                                      className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                      title="Mover para cima"
                                    >
                                      <ArrowUp className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveChannel(channel.id, 'down')}
                                      className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                      title="Mover para baixo"
                                    >
                                      <ArrowDown className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingChannelId(channel.id);
                                        setEditingChannelName(channel.name);
                                        setEditingChannelType(channel.type);
                                        setEditingChannelCategory(channel.categoryId || '');
                                      }}
                                      className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                      title="Editar canal"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => confirmRemoval('channel', channel.id)}
                                      className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      title="Eliminar canal"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {categoryChannels.length === 0 && (
                            <p className="text-[11px] text-muted-foreground/60 py-2 text-center border border-dashed rounded-xl border-border">
                              Arrasta canais para este separador
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Channels without category */}
                  <div
                    onDragOver={(e) => {
                      if (draggedChanId) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverCatId('__uncat__');
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverCatId === '__uncat__') setDragOverCatId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDropOnCategory(undefined);
                    }}
                    className={`rounded-2xl border p-3 space-y-2 bg-card/60 transition-all ${
                      dragOverCatId === '__uncat__' ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block border-b border-border/50 pb-1">
                      Canais Gerais (Sem Separador)
                    </span>
                    <div className="space-y-1.5 pl-1">
                      {community.channels
                        .filter((c) => !c.categoryId)
                        .map((channel) => {
                          const isDragging = draggedChanId === channel.id;
                          const isTarget = dragOverChanId === channel.id;

                          return (
                            <div
                              key={channel.id}
                              draggable={canManageChannels}
                              onDragStart={(e) => {
                                if (!canManageChannels) return;
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', channel.id);
                                setDraggedChanId(channel.id);
                              }}
                              onDragEnd={() => {
                                setDraggedChanId(null);
                                setDragOverChanId(null);
                                setDragOverCatId(null);
                              }}
                              onDragOver={(e) => {
                                if (draggedChanId && draggedChanId !== channel.id) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = 'move';
                                  setDragOverChanId(channel.id);
                                }
                              }}
                              onDragLeave={() => {
                                if (dragOverChanId === channel.id) setDragOverChanId(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDropOnChannel(channel.id, undefined);
                              }}
                              className={`flex items-center justify-between p-2 rounded-xl border border-transparent transition-all text-xs ${
                                isDragging ? 'opacity-30 scale-95 border-dashed border-primary' : 'bg-secondary/40 hover:bg-secondary/70'
                              } ${isTarget ? 'ring-2 ring-primary ring-offset-1 bg-primary/10' : ''}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {canManageChannels && (
                                  <GripVertical className="size-3.5 text-muted-foreground/60 cursor-grab shrink-0" />
                                )}
                                {channel.type === 'voice' ? (
                                  <Volume2 className="size-3.5 text-emerald-500 shrink-0" />
                                ) : channel.type === 'announcement' ? (
                                  <Megaphone className="size-3.5 text-amber-500 shrink-0" />
                                ) : (
                                  <Hash className="size-3.5 text-primary shrink-0" />
                                )}
                                <span className="font-medium text-foreground truncate">{channel.name}</span>
                              </div>

                              {canManageChannels && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => moveChannel(channel.id, 'up')}
                                    className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    title="Mover para cima"
                                  >
                                    <ArrowUp className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveChannel(channel.id, 'down')}
                                    className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    title="Mover para baixo"
                                  >
                                    <ArrowDown className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingChannelId(channel.id);
                                      setEditingChannelName(channel.name);
                                      setEditingChannelType(channel.type);
                                      setEditingChannelCategory(channel.categoryId || '');
                                    }}
                                    className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    title="Editar canal"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => confirmRemoval('channel', channel.id)}
                                    className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    title="Eliminar canal"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}

                      {community.channels.filter((c) => !c.categoryId).length === 0 && (
                        <p className="text-[11px] text-muted-foreground/60 py-2 text-center border border-dashed rounded-xl border-border">
                          Nenhum canal sem separador
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Edit Channel Modal */}
                {editingChannelId && (
                  <Dialog open={true} onOpenChange={() => setEditingChannelId(null)}>
                    <DialogContent className="sm:max-w-md rounded-3xl p-5">
                      <DialogHeader>
                        <DialogTitle className="text-sm font-semibold">Editar Canal</DialogTitle>
                        <DialogDescription className="sr-only">Modifica as definições deste canal.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 pt-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Nome do Canal</Label>
                          <Input
                            value={editingChannelName}
                            onChange={(e) => setEditingChannelName(e.target.value)}
                            className="rounded-xl h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tipo</Label>
                          <StyledSelect
                            value={editingChannelType}
                            onChange={(e) => setEditingChannelType(e.target.value as 'text' | 'voice' | 'announcement')}
                            className="w-full rounded-xl h-9 bg-background border border-border text-xs px-2.5"
                          >
                            <option value="text">Texto</option>
                            <option value="voice">Voz</option>
                            <option value="announcement">Avisos</option>
                          </StyledSelect>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Separador</Label>
                          <StyledSelect
                            value={editingChannelCategory}
                            onChange={(e) => setEditingChannelCategory(e.target.value)}
                            className="w-full rounded-xl h-9 bg-background border border-border text-xs px-2.5"
                          >
                            <option value="">Nenhum</option>
                            {(community.categories || []).map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </StyledSelect>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingChannelId(null)}>
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={handleSaveChannel}>
                            Guardar
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}

            {/* 3. CARGOS & PERMISSÕES */}
            {activeTab === 'roles' && (
              <div className="h-full flex flex-col sm:flex-row gap-6">
                {/* Roles List */}
                <div className="w-full sm:w-56 border-r border-border pr-4 space-y-2 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Cargos do Servidor</span>
                    {canManageRoles && (
                      <button
                        type="button"
                        onClick={handleStartCreateRole}
                        className="p-1 rounded-lg text-primary hover:bg-primary/10 transition"
                        title="Criar novo cargo"
                      >
                        <Plus className="size-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1 max-h-[55vh] overflow-y-auto">
                    {(community.roles || []).map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleSelectRole(role)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          selectedRoleId === role.id
                            ? 'bg-primary/15 border border-primary/30 text-primary font-semibold'
                            : 'hover:bg-secondary/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: role.color || '#3b82f6' }}
                          />
                          <span className="truncate">{role.name}</span>
                        </div>
                        {community.defaultRoleId === role.id && (
                          <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.2 rounded font-semibold shrink-0">
                            Predefinido
                          </span>
                        )}
                      </button>
                    ))}

                    {(!community.roles || community.roles.length === 0) && (
                      <p className="text-[11px] text-muted-foreground py-4 text-center">
                        Nenhum cargo criado. Clica em + para criar o teu primeiro cargo.
                      </p>
                    )}
                  </div>
                </div>

                {/* Role Edit View */}
                <div className="flex-1 space-y-4 pl-1 overflow-y-auto">
                  {selectedRoleId ? (
                    <div className="space-y-4 max-w-xl">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                          {selectedRoleId === 'new' ? 'Novo Cargo' : `Editar Cargo: ${roleName}`}
                        </h4>
                        {selectedRoleId !== 'new' && canManageRoles && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteRole(selectedRoleId)}
                            className="h-7 text-xs rounded-lg px-2"
                          >
                            <Trash2 className="size-3 mr-1" />
                            Eliminar Cargo
                          </Button>
                        )}
                      </div>

                      {/* Name & Color */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Nome do Cargo</Label>
                          <Input
                            value={roleName}
                            aria-label="Nome do cargo"
                            onChange={(e) => setRoleName(e.target.value)}
                            disabled={!canManageRoles}
                            className="rounded-xl h-9 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Cor do Cargo</Label>
                          <div className="flex items-center gap-1.5 pt-1">
                            {ROLE_COLORS.map((c) => (
                              <button
                                key={c.value}
                                type="button"
                                onClick={() => setRoleColor(c.value)}
                                style={{ backgroundColor: c.value }}
                                className={`size-6 rounded-full transition-transform ${
                                  roleColor === c.value ? 'scale-120 ring-2 ring-primary ring-offset-2' : ''
                                }`}
                                title={c.label}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Permissions Toggles */}
                      <div className="space-y-2 pt-2">
                        <Label className="text-xs font-semibold text-foreground">Permissões do Cargo</Label>
                        <div className="space-y-2">
                          {[
                            {
                              key: 'administrator',
                              label: 'Administrador',
                              desc: 'Concede todas as permissões e ignora todas as restrições.',
                            },
                            {
                              key: 'manageServer',
                              label: 'Gerir Servidor',
                              desc: 'Pode alterar o nome, ícone, descrição e configurações.',
                            },
                            {
                              key: 'manageChannels',
                              label: 'Gerir Canais e Separadores',
                              desc: 'Pode criar, editar e apagar canais e separadores.',
                            },
                            {
                              key: 'manageRoles',
                              label: 'Gerir Cargos e Permissões',
                              desc: 'Pode criar novos cargos e alterar permissões.',
                            },
                            {
                              key: 'inviteMembers',
                              label: 'Convidar Pessoas',
                              desc: 'Permite convidar novos utilizadores diretamente para o servidor.',
                            },
                            {
                              key: 'sendMessages',
                              label: 'Enviar Mensagens',
                              desc: 'Pode enviar mensagens de texto e fotos nos canais.',
                            },
                            {
                              key: 'manageMessages',
                              label: 'Gerir Mensagens',
                              desc: 'Pode eliminar mensagens de outros membros.',
                            },
                            {
                              key: 'connectVoice',
                              label: 'Conectar à Voz',
                              desc: 'Pode entrar nos canais de voz.',
                            },
                            {
                              key: 'speakVoice',
                              label: 'Falar na Voz',
                              desc: 'Pode falar nos canais de voz.',
                            },
                            {
                              key: 'muteVoiceMembers',
                              label: 'Silenciar Membros na Chamada',
                              desc: 'Pode mutar o microfone de outros utilizadores na chamada de voz.',
                            },
                            {
                              key: 'kickVoiceMembers',
                              label: 'Expulsar da Chamada de Voz',
                              desc: 'Pode desconectar/expulsar participantes da chamada de voz.',
                            },
                            {
                              key: 'kickMembers',
                              label: 'Expulsar Membros do Servidor',
                              desc: 'Pode remover membros do servidor.',
                            },
                          ].map((perm) => (
                            <label
                              key={perm.key}
                              className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer"
                            >
                              <div className="pr-2">
                                <span className="text-xs font-medium text-foreground block">{perm.label}</span>
                                <span className="text-[10px] text-muted-foreground">{perm.desc}</span>
                              </div>
                              {['sendMessages', 'connectVoice', 'speakVoice'].includes(perm.key) ? <StyledSelect
                                aria-label={perm.label}
                                className="h-9 w-36 shrink-0 rounded-xl text-xs"
                                disabled={!canManageRoles}
                                value={rolePerms[perm.key as keyof CommunityRolePermissions] === undefined ? 'inherit' : rolePerms[perm.key as keyof CommunityRolePermissions] ? 'allow' : 'deny'}
                                onChange={(event) => setRolePerms((previous) => { const next = { ...previous }; if (event.target.value === 'inherit') delete next[perm.key as keyof CommunityRolePermissions]; else next[perm.key as keyof CommunityRolePermissions] = event.target.value === 'allow'; return next; })}
                              ><option value="inherit">Herdar</option><option value="allow">Permitir</option><option value="deny">Bloquear</option></StyledSelect> : <input
                                type="checkbox"
                                checked={!!rolePerms[perm.key as keyof CommunityRolePermissions]}
                                disabled={!canManageRoles}
                                onChange={(e) =>
                                  setRolePerms((prev) => ({ ...prev, [perm.key]: e.target.checked }))
                                }
                                className="size-4 accent-primary rounded"
                              />}
                            </label>
                          ))}
                        </div>
                      </div>

                      {canManageRoles && (
                        <Button onClick={handleSaveRole} className="h-9 rounded-xl text-xs font-semibold">
                          Guardar Cargo
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                      Seleciona um cargo à esquerda ou clica em + para criar um novo.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. MEMBROS & MODERAÇÃO */}
            {activeTab === 'members' && (
              <div className="space-y-4 max-w-3xl">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    Membros do Servidor ({memberList.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Gere os membros, atribui cargos imediatos ou expulsa utilizadores indesejados.
                  </p>
                </div>

                {/* Search */}
                <div className="flex items-center justify-between gap-3">
                  <Input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Pesquisar membros por nome ou @username..."
                    className="rounded-xl h-9.5 text-xs bg-secondary/40 border-border flex-1"
                  />
                  <span className="text-xs text-muted-foreground shrink-0 font-medium">
                    {memberList.length} {memberList.length === 1 ? 'membro' : 'membros'}
                  </span>
                </div>

                {/* Members List */}
                <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-1">
                  {memberList.map((user) => {
                    const isServerOwner = community.ownerId === user.id;
                    const isServerAdmin = community.admins?.includes(user.id);
                    const userRoleIds = community.memberRoles?.[user.id] || [];
                    const userRoles = (community.roles || []).filter((r) => userRoleIds.includes(r.id));

                    return (
                      <div
                        key={user.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl border border-border bg-card/70 hover:bg-card transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="size-8.5 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-inner bg-cover bg-center shrink-0"
                            style={{
                              backgroundColor: `hsl(${user.hue}, 60%, 45%)`,
                              backgroundImage: user.avatarUrl ? `url(${user.avatarUrl})` : undefined,
                            }}
                          >
                            {!user.avatarUrl && user.displayName.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {user.displayName}
                              </span>
                              {isServerOwner && (
                                <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold text-foreground">
                                  CRIADOR
                                </span>
                              )}
                              {isServerAdmin && !isServerOwner && (
                                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                  ADMIN
                                </span>
                              )}
                              {userRoles.map((r) => (
                                <span
                                  key={r.id}
                                  style={{ backgroundColor: `${r.color}20`, color: r.color }}
                                  className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold border border-current"
                                >
                                  {r.name}
                                </span>
                              ))}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">@{user.username}</span>
                          </div>
                        </div>

                        {/* Actions for member */}
                        {(canManageRoles || canKickMembers) && !isServerOwner && (
                          <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                            {/* Toggle Admin */}
                            {(isOwner || profile.globalRole === 'admin') && (
                              <button
                                type="button"
                                onClick={() => { void confirmChange('community:admin:set', { userId: user.id, enabled: !isServerAdmin }, (value) => !!value.admins?.includes(user.id) === !isServerAdmin, 'Cargo de administrador atualizado.'); }}
                                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
                                  isServerAdmin
                                    ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                                }`}
                                title="Promover ou remover Administrador"
                              >
                                {isServerAdmin ? 'Remover Admin' : 'Tornar Admin'}
                              </button>
                            )}

                            {/* Roles Dropdown / Checkboxes Selector */}
                            {canManageRoles && (community.roles || []).length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {(community.roles || []).map((r) => {
                                  const hasThisRole = userRoleIds.includes(r.id);
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={async () => {
                                        const next = hasThisRole
                                          ? userRoleIds.filter((id) => id !== r.id)
                                          : [...userRoleIds, r.id];
                                        await confirmChange('community:member:roles:set', { userId: user.id, roleIds: next }, (value) => JSON.stringify(value.memberRoles?.[user.id] || []) === JSON.stringify(next), 'Cargos atualizados.');
                                      }}
                                      style={{
                                        borderColor: r.color,
                                        backgroundColor: hasThisRole ? r.color : 'transparent',
                                        color: hasThisRole ? '#fff' : r.color,
                                      }}
                                      className="px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition hover:opacity-90"
                                      title={`Atribuir cargo ${r.name}`}
                                    >
                                      {hasThisRole ? `✓ ${r.name}` : `+ ${r.name}`}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Kick Member */}
                            {canKickMembers && <button
                              type="button"
                              onClick={() => setConfirmation({ title: `Remover ${user.displayName}?`, description: 'Esta pessoa deixa de ter acesso às conversas e chamadas do servidor.', execute: async () => !!(await confirmChange('community:member:kick', { userId: user.id }, (value) => !value.members.includes(user.id), 'Pessoa removida.')) })}
                              className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                              title="Expulsar membro do servidor"
                            >
                              <UserMinus className="size-4" />
                            </button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. CONVITES & ADICIONAR PESSOAS */}
            {activeTab === 'invites' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    Convidar & Adicionar Pessoas
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Adiciona membros diretamente pelo nome de utilizador ou partilha o código de convite do servidor.
                  </p>
                </div>

                {/* Direct Add Form */}
                <div className="p-4 rounded-2xl border border-border bg-secondary/20 space-y-3">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <UserPlus className="size-3.5 text-primary" /> Adicionar Utilizador Direto
                  </h4>
                  {canInviteMembers ? (
                    <form onSubmit={handleAddMember} className="flex gap-2">
                      <Input
                        value={addUsernameInput}
                        onChange={(e) => setAddUsernameInput(e.target.value)}
                        placeholder="Nome de utilizador (ex: @pedro ou joao)"
                        className="rounded-xl h-9.5 bg-background border-border text-xs flex-1"
                      />
                      <Button
                        type="submit"
                        disabled={!addUsernameInput.trim() || addingMember}
                        className="h-9.5 rounded-xl text-xs font-semibold"
                      >
                        {addingMember ? 'A adicionar…' : 'Adicionar ao Servidor'}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Apenas administradores ou cargos com permissão de convite podem adicionar membros diretamente.
                    </p>
                  )}
                </div>

                {/* Invite Code Box */}
                <div className="p-4 rounded-2xl border border-border bg-secondary/20 space-y-3">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" /> Código de Convite do Servidor
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Partilha este código com os teus amigos para que eles possam juntar-se ao servidor imediatamente.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={community.inviteCode}
                      readOnly
                      className="font-mono text-xs font-semibold rounded-xl h-10 bg-background border-border tracking-wider"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCopyInvite}
                      className="h-10 rounded-xl gap-1.5 text-xs font-semibold px-4"
                    >
                      {copiedCode ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                      {copiedCode ? 'Copiado!' : 'Copiar Convite'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      <ActionConfirmation action={confirmation} onClose={() => setConfirmation(null)} />
    </Dialog>
  );
}
