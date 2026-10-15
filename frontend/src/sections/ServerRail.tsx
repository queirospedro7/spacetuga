import { useEffect, useState, useMemo, useRef } from 'react';
import { readProfileImage } from '@/lib/profile-images';
import { canInviteToCommunity } from '@/lib/community-invites';
import { ActionConfirmation, type ConfirmationAction } from '@/components/ActionConfirmation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Compass, Globe, Lock, Shield, Settings, ExternalLink, Copy, Upload, FolderPlus, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import type { Community, MyProfile } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { BrandMark } from '@/components/BrandMark';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from 'sonner';

interface ServerRailProps {
  communities: Community[];
  activeCommunityId: string | null;
  profile: MyProfile;
  isExploreActive?: boolean;
  onSelectDM: () => void;
  onSelectCommunity: (id: string) => void;
  onOpenExplore?: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
}

const SERVER_ORDER_KEY = 'tuga.server_order';
const SERVER_FOLDERS_KEY = 'tuga.server_folders';

type ServerFolder = { id: string; name: string; serverIds: string[]; collapsed: boolean; color?: string };

export function ServerRail({
  communities,
  activeCommunityId,
  profile,
  isExploreActive = false,
  onSelectDM,
  onSelectCommunity,
  onOpenExplore,
  onOpenSettings,
  onOpenAdmin,
}: ServerRailProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [newCommIcon, setNewCommIcon] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Drag and Drop Server Order State
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SERVER_ORDER_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? [...new Set(parsed.filter((value) => typeof value === 'string'))].slice(0, 200) : [];
    } catch {
      return [];
    }
  });
  const [draggedServerId, setDraggedServerId] = useState<string | null>(null);
  const [dragOverServerId, setDragOverServerId] = useState<string | null>(null);

  // Server Folders state
  const [folders, setFolders] = useState<ServerFolder[]>(() => {
    try {
      const saved = localStorage.getItem(`${SERVER_FOLDERS_KEY}.${profile.id}`);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      const assigned = new Set<string>();
      return parsed.filter((folder) => folder && typeof folder.id === 'string' && typeof folder.name === 'string' && Array.isArray(folder.serverIds)).slice(0, 100).map((folder) => ({ id: folder.id, name: folder.name.slice(0, 30), collapsed: !!folder.collapsed, color: /^#[0-9a-f]{6}$/i.test(folder.color || '') ? folder.color : '#6366f1', serverIds: folder.serverIds.filter((id: unknown) => { if (typeof id !== 'string' || assigned.has(id)) return false; assigned.add(id); return true; }).slice(0, 200) }));
    } catch {
      return [];
    }
  });
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderTargetServerId, setNewFolderTargetServerId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#6366f1');
  const [addToFolderDialogId, setAddToFolderDialogId] = useState<string | null>(null);
  function saveFolders(next: ServerFolder[]) {
    setFolders(next);
    try { localStorage.setItem(`${SERVER_FOLDERS_KEY}.${profile.id}`, JSON.stringify(next)); } catch { toast.error('Não foi possível guardar as pastas neste dispositivo.'); }
  }

  function toggleFolderCollapsed(folderId: string) {
    saveFolders(folders.map((f) => f.id === folderId ? { ...f, collapsed: !f.collapsed } : f));
  }

  function createFolder(name: string, serverIds: string[], color?: string) {
    const folder: ServerFolder = { id: `folder-${Date.now()}`, name: name || 'Pasta', serverIds, collapsed: false, color: color || '#6366f1' };
    saveFolders([...folders, folder]);
  }

  function addServerToFolder(folderId: string, serverId: string) {
    // Remove from any other folder first, then add to the target folder
    saveFolders(
      folders.map((f) => {
        if (f.id === folderId) {
          // Add if not already in this folder
          if (f.serverIds.includes(serverId)) return f;
          return { ...f, serverIds: [...f.serverIds, serverId] };
        }
        // Remove from other folders
        return { ...f, serverIds: f.serverIds.filter((id) => id !== serverId) };
      }).filter((f) => f.serverIds.length > 0)
    );
  }

  function removeFolder(folderId: string) {
    saveFolders(folders.filter((f) => f.id !== folderId));
  }

  function renameFolder(folderId: string, name: string) {
    saveFolders(folders.map((f) => f.id === folderId ? { ...f, name } : f));
  }

  function removeServerFromFolder(folderId: string, serverId: string) {
    saveFolders(
      folders
        .map((f) => f.id === folderId ? { ...f, serverIds: f.serverIds.filter((id) => id !== serverId) } : f)
        .filter((f) => f.serverIds.length > 0)
    );
  }

  function getServerFolderId(serverId: string): string | null {
    return folders.find((f) => f.serverIds.includes(serverId))?.id ?? null;
  }

  // Sorted communities according to customOrder (ONLY communities where user is actually a member!)
  const orderedCommunities = useMemo(() => {
    const list = communities.filter((c) => !c.directGroup && c.members && c.members.includes(profile.id));
    if (customOrder.length === 0) return list;
    return list.sort((a, b) => {
      const indexA = customOrder.indexOf(a.id);
      const indexB = customOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [communities, customOrder, profile.id]);

  function handleDropServer(targetId: string) {
    if (!draggedServerId || draggedServerId === targetId) {
      setDraggedServerId(null);
      setDragOverServerId(null);
      return;
    }

    const currentIds = orderedCommunities.map((c) => c.id);
    const sourceIndex = currentIds.indexOf(draggedServerId);
    const targetIndex = currentIds.indexOf(targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggedServerId(null);
      setDragOverServerId(null);
      return;
    }

    // Check folder relationships
    const sourceFolderId = getServerFolderId(draggedServerId);
    const targetFolderId = getServerFolderId(targetId);

    if (!sourceFolderId && !targetFolderId) {
      // Both top-level: create a new folder with both
      setNewFolderName('');
      setNewFolderDialogOpen(true);
      setNewFolderTargetServerId(draggedServerId + '|' + targetId);
      setDraggedServerId(null);
      setDragOverServerId(null);
      return;
    }

    if (!sourceFolderId && targetFolderId) {
      // Source is top-level, target is in a folder: add source to that folder
      addServerToFolder(targetFolderId, draggedServerId);
      setDraggedServerId(null);
      setDragOverServerId(null);
      return;
    }

    if (sourceFolderId && !targetFolderId) {
      // Source is in a folder, target is top-level: remove source from its folder
      removeServerFromFolder(sourceFolderId, draggedServerId);
      setDraggedServerId(null);
      setDragOverServerId(null);
      return;
    }

    if (sourceFolderId && targetFolderId && sourceFolderId !== targetFolderId) {
      // Both in different folders: move source to target's folder
      addServerToFolder(targetFolderId, draggedServerId);
      setDraggedServerId(null);
      setDragOverServerId(null);
      return;
    }

    // Otherwise just reorder
    const nextOrder = [...currentIds];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, draggedServerId);

    setCustomOrder(nextOrder);
    try {
      localStorage.setItem(SERVER_ORDER_KEY, JSON.stringify(nextOrder));
    } catch {
      // ignore
    }
    setDraggedServerId(null);
    setDragOverServerId(null);
  }

  useEffect(() => {
    const stopCreated = api.on('community:created', () => {
      setPendingAction(null); setCreateOpen(false); setActionError(null);
      setNewCommName(''); setNewCommDesc(''); setNewCommIcon('');
    });
    const stopJoined = api.on('community:joined', () => {
      setPendingAction(null); setJoinOpen(false); setJoinCode(''); setActionError(null);
    });
    const stopError = api.on('err', ({ code }) => {
      if (pendingAction === 'create' || pendingAction === 'join') {
        setPendingAction(null);
        setActionError(code === 'invite_invalid' ? 'O convite não é válido ou já não está disponível.' : code === 'invalid_image' ? 'Escolhe uma imagem válida ou uma ligação HTTPS.' : code === 'rate_limit' ? 'Aguarda um momento antes de tentar novamente.' : 'Não foi possível concluir. Verifica a ligação e tenta novamente.');
      }
    });
    return () => { stopCreated(); stopJoined(); stopError(); };
  }, [pendingAction]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCommName.trim()) return;
    setActionError(null);
    setPendingAction('create');
    api.createCommunity(
      newCommName.trim(),
      isPublic,
      newCommIcon.trim() || newCommName.trim().charAt(0).toUpperCase(),
      newCommDesc.trim()
    );
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setActionError(null);
    setPendingAction('join');
    api.joinCommunity(joinCode.trim());
  }

  return (
    <>
    <div className="w-[68px] sm:w-[72px] h-full flex flex-col items-center py-3.5 bg-sidebar text-sidebar-foreground border-r border-border select-none shrink-0 z-30 transition-colors duration-200">
      {/* Direct Messages Icon Button */}
      <div className="relative group mb-2.5">
        <button
          onClick={onSelectDM}
          aria-label="Mensagens Diretas"
          className={`relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center transition-all duration-200 active:scale-95 ${
            activeCommunityId === null && !isExploreActive
              ? 'rounded-2xl bg-primary text-primary-foreground shadow-sm'
              : 'rounded-3xl bg-secondary/80 text-foreground hover:rounded-2xl hover:bg-secondary'
          }`}
          title="Mensagens Diretas"
        >
          <BrandMark className="size-9 rounded-[14px]" />
        </button>

        {/* Apple active indicator pill */}
        <AnimatePresence>
          {activeCommunityId === null && !isExploreActive && (
            <motion.div
              layoutId="rail-pill"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              exit={{ scaleY: 0 }}
              className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary rounded-r-full shadow-xs"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Subtle Divider */}
      <div className="w-8 h-[1px] bg-border my-1 rounded-full" />

      {/* Communities list with HTML5 Drag & Drop */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2.5 py-1.5 scrollbar-none">
        {(() => {
          // Build display list: top-level servers + folders
          const folderIds = new Set(folders.flatMap((f) => f.serverIds));
          const topLevel = orderedCommunities.filter((c) => !folderIds.has(c.id));

          // Render a single server button
          function renderServer(comm: Community, inFolderId?: string) {
            const isActive = activeCommunityId === comm.id;
            const isDragging = draggedServerId === comm.id;
            const isDragTarget = dragOverServerId === comm.id;

            return (
              <ContextMenu key={comm.id}>
                <ContextMenuTrigger asChild>
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', comm.id);
                      setDraggedServerId(comm.id);
                    }}
                    onDragEnd={() => {
                      setDraggedServerId(null);
                      setDragOverServerId(null);
                    }}
                    onDragOver={(e) => {
                      if (draggedServerId && draggedServerId !== comm.id) {
                        e.preventDefault();
                        setDragOverServerId(comm.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverServerId === comm.id) {
                        setDragOverServerId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropServer(comm.id);
                    }}
                    className={`relative group transition-all duration-200 ${inFolderId ? 'ml-1' : ''} ${
                      isDragging ? 'opacity-30 scale-90' : ''
                    } ${isDragTarget ? 'scale-105 ring-2 ring-primary ring-offset-2 rounded-2xl' : ''}`}
                  >
                    <button
                      onClick={() => onSelectCommunity(comm.id)}
                      data-tuga-community={comm.id}
                      aria-label={comm.name}
                      className={`relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center text-sm font-semibold transition-all duration-200 active:scale-95 cursor-grab active:cursor-grabbing overflow-hidden ${
                        isActive
                          ? 'rounded-2xl bg-primary/15 text-primary border border-primary/30 shadow-xs'
                          : 'rounded-3xl bg-secondary/70 text-foreground hover:rounded-2xl hover:bg-secondary border border-transparent'
                      }`}
                      title={`${comm.name} (Arrasta para reordenar)`}
                    >
                      {comm.icon && (comm.icon.startsWith('http') || comm.icon.startsWith('data:') || comm.icon.startsWith('blob:')) ? (
                        <img src={comm.icon} alt={comm.name} className="w-full h-full object-cover rounded-[inherit]" />
                      ) : comm.icon && comm.icon.length <= 4 ? (
                        comm.icon
                      ) : (
                        comm.name.trim().slice(0, 1).toUpperCase()
                      )}
                    </button>
                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          layoutId="rail-pill"
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          exit={{ scaleY: 0 }}
                          className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary rounded-r-full shadow-xs"
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52 rounded-2xl bg-card/95 backdrop-blur-xl border-border/80 p-1.5 shadow-2xl">
                  <ContextMenuItem
                    onSelect={() => onSelectCommunity(comm.id)}
                    className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                  >
                    <ExternalLink className="mr-2.5 size-4 text-primary" />
                    Abrir servidor
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  {canInviteToCommunity(comm, profile) && <ContextMenuItem
                    onSelect={async () => {
                      try { await navigator.clipboard.writeText(comm.inviteCode); toast.success('Código de convite copiado'); }
                      catch { toast.error('Não foi possível copiar o código.'); }
                    }}
                    className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                  >
                    <Copy className="mr-2.5 size-4 text-muted-foreground" />
                    Copiar convite ({comm.inviteCode})
                  </ContextMenuItem>}
                  {comm.ownerId !== profile.id && <ContextMenuItem className="rounded-xl text-destructive text-xs" onSelect={() => setConfirmation({ title: `Sair de ${comm.name}?`, description: 'Deixas de ter acesso às conversas e chamadas deste servidor. Podes voltar com um convite válido.', execute: async () => { await api.leaveCommunityConfirmed(comm.id); toast.success('Saíste do servidor.'); } })}>Sair do servidor</ContextMenuItem>}
                  <ContextMenuSeparator />
                  {inFolderId ? (
                    <ContextMenuItem
                      onSelect={() => removeServerFromFolder(inFolderId, comm.id)}
                      className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                    >
                      <FolderPlus className="mr-2.5 size-4 text-muted-foreground" />
                      Remover da pasta
                    </ContextMenuItem>
                  ) : (
                    <ContextMenuItem
                      onSelect={() => {
                        setNewFolderTargetServerId(comm.id);
                        setNewFolderName('');
                        setNewFolderDialogOpen(true);
                      }}
                      className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                    >
                      <FolderPlus className="mr-2.5 size-4 text-muted-foreground" />
                      Criar pasta
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          }

          return (
            <>
              {/* Folders */}
              {folders.map((folder) => {
                const folderServers = folder.serverIds
                  .map((id) => orderedCommunities.find((c) => c.id === id))
                  .filter(Boolean) as Community[];
                if (folderServers.length === 0) return null;
                const isFolderActive = folderServers.some((c) => c.id === activeCommunityId);
                const previewServers = folderServers.slice(0, 4);

                return (
                  <div key={folder.id} className="flex flex-col items-center gap-1 w-full">
                    {/* Folder button */}
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button
                          onClick={() => toggleFolderCollapsed(folder.id)}
                          aria-label={`Pasta: ${folder.name}`}
                          title={folder.name}
                          aria-expanded={!folder.collapsed}
                          className={`server-folder-button ${isFolderActive ? 'is-active' : ''}`}
                          style={{ '--folder-color': folder.color || '#808080' } as React.CSSProperties}
                        >
                          <Folder className="server-folder-outline" strokeWidth={1.35} aria-hidden="true" />
                          <div className="server-folder-preview" aria-hidden="true">
                            {previewServers.map((c) => <span key={c.id}>{c.icon && /^(http|data:|blob:)/.test(c.icon) ? <img src={c.icon} alt="" loading="lazy" decoding="async" /> : c.name.trim().slice(0, 1).toUpperCase()}</span>)}
                          </div>
                          <span className="server-folder-chevron" aria-hidden="true">{folder.collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}</span>                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-52 rounded-2xl bg-card/95 backdrop-blur-xl border-border/80 p-1.5 shadow-2xl">
                        <div className="px-2.5 py-1.5 mb-1">
                          <p className="text-xs font-semibold text-foreground truncate">{folder.name}</p>
                          <p className="text-[10px] text-muted-foreground">{folderServers.length} servidor{folderServers.length !== 1 ? 'es' : ''}</p>
                        </div>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onSelect={() => {
                            setRenamingFolderId(folder.id);
                            setRenamingFolderName(folder.name);
                          }}
                          className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                        >
                          <Folder className="mr-2.5 size-4 text-muted-foreground" />
                          Renomear pasta
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => setAddToFolderDialogId(folder.id)}
                          className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                        >
                          <FolderPlus className="mr-2.5 size-4 text-muted-foreground" />
                          Adicionar servidor
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onSelect={() => removeFolder(folder.id)}
                          className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer text-destructive"
                        >
                          <FolderPlus className="mr-2.5 size-4" />
                          Remover pasta
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    {/* Expanded folder servers */}
                    {!folder.collapsed && (
                      <div className="server-folder-contents" style={{ borderColor: folder.color ? `${folder.color}60` : 'hsl(var(--primary) / 0.2)' }}>
                        {folderServers.map((c) => renderServer(c, folder.id))}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Top-level servers */}
              {topLevel.map((comm) => renderServer(comm))}
            </>
          );
        })()}

        {/* Add Community Dialog Button */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <button
              aria-label="Criar servidor"
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-3xl bg-secondary/50 text-muted-foreground hover:rounded-2xl hover:bg-primary/10 hover:text-primary border border-dashed border-border/80 flex items-center justify-center transition-all duration-200 group active:scale-95"
              title="Criar servidor"
            >
              <Plus className="size-5 transition-transform group-hover:rotate-90 duration-200" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold tracking-tight text-center text-foreground">
                Criar um servidor
              </DialogTitle>
              <p className="text-xs text-muted-foreground text-center">
                O teu próprio espaço para amigos, conversas em direto e partilhas.
              </p>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              {actionError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{actionError}</p>}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Nome do servidor</Label>
                <Input
                  value={newCommName}
                  onChange={(e) => setNewCommName(e.target.value)}
                  placeholder="ex: Clube de leitura, Equipa de design..."
                  className="h-10 rounded-xl bg-secondary/50 border-border text-xs text-foreground placeholder:text-muted-foreground focus:bg-card focus:border-primary"
                  required maxLength={40} disabled={pendingAction !== null}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Foto ou Sigla do Servidor</Label>
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => iconInputRef.current?.click()}
                    className="w-12 h-12 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center cursor-pointer overflow-hidden hover:border-primary transition-all shrink-0"
                    title="Carregar foto do servidor"
                  >
                    {newCommIcon && (newCommIcon.startsWith('data:') || newCommIcon.startsWith('http')) ? (
                      <img src={newCommIcon} alt="Foto do Servidor" className="w-full h-full object-cover" />
                    ) : newCommIcon ? (
                      <span className="text-xs font-bold">{newCommIcon.slice(0, 4)}</span>
                    ) : (
                      <Upload className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => iconInputRef.current?.click()}
                        className="rounded-xl text-xs h-8 gap-1.5"
                      >
                        <Upload className="size-3" />
                        Carregar Foto
                      </Button>
                      {newCommIcon && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setNewCommIcon('')}
                          className="rounded-xl text-xs h-8 text-muted-foreground"
                        >
                          Limpar
                        </Button>
                      )}
                    </div>
                    <input
                      ref={iconInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try { setNewCommIcon(await readProfileImage(file, 400)); setActionError(null); }
                          catch (error) { setActionError(error instanceof Error ? error.message : 'Não foi possível carregar a imagem.'); }
                        }
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Descrição (opcional)</Label>
                <Input
                  value={newCommDesc}
                  onChange={(e) => setNewCommDesc(e.target.value)}
                  placeholder="Sobre o que é este grupo?" maxLength={150} disabled={pendingAction !== null}
                  className="h-10 rounded-xl bg-secondary/50 border-border text-xs text-foreground placeholder:text-muted-foreground focus:bg-card focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-secondary/40 border border-border/80">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {isPublic ? <Globe className="size-3.5 text-emerald-500" /> : <Lock className="size-3.5 text-amber-500" />}
                    <span>{isPublic ? 'Servidor público' : 'Servidor privado'}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {isPublic ? 'Qualquer utilizador pode ver e entrar' : 'Apenas convidados com código de convite'}
                  </p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={pendingAction !== null} />
              </div>

              <Button
                type="submit" disabled={pendingAction !== null}
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 shadow-xs"
              >
                {pendingAction === 'create' ? 'A criar servidor…' : 'Criar servidor'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Explore Public Servers Button */}
        {onOpenExplore && (
          <div className="relative group">
            <button
              onClick={onOpenExplore}
              aria-label="Explorar servidores públicos"
              className={`relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center transition-all duration-200 active:scale-95 ${
                isExploreActive
                  ? 'rounded-2xl bg-primary text-primary-foreground shadow-sm'
                  : 'rounded-3xl bg-secondary/60 text-muted-foreground hover:rounded-2xl hover:bg-secondary hover:text-foreground border border-border/60'
              }`}
              title="Explorar Servidores Públicos"
            >
              <Compass className="size-5" />
            </button>
            <AnimatePresence>
              {isExploreActive && (
                <motion.div
                  layoutId="rail-pill"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  exit={{ scaleY: 0 }}
                  className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary rounded-r-full shadow-xs"
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Join Community Dialog Button */}
        <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
          <DialogTrigger asChild>
            <button
              aria-label="Entrar com convite"
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-3xl bg-secondary/50 text-muted-foreground hover:rounded-2xl hover:bg-secondary hover:text-foreground border border-border/60 flex items-center justify-center transition-all duration-200 active:scale-95"
              title="Entrar com convite"
            >
              <ExternalLink className="size-5" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[390px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold tracking-tight text-center text-foreground">
                Entrar num servidor
              </DialogTitle>
              <p className="text-xs text-muted-foreground text-center">
                Insere o código de convite partilhado por um amigo
              </p>
            </DialogHeader>

            <form onSubmit={handleJoin} className="space-y-4 mt-2">
              {actionError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{actionError}</p>}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Código de Convite</Label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="A3F8B2C91D4E7F06"
                  className="h-10 rounded-xl bg-secondary/50 border-border text-xs font-mono tracking-wider text-foreground placeholder:text-muted-foreground focus:bg-card focus:border-primary"
                  required disabled={pendingAction !== null}
                />
              </div>

              <Button
                type="submit" disabled={pendingAction !== null}
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 shadow-xs"
              >
                {pendingAction === 'join' ? 'A verificar convite…' : 'Entrar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bottom Dock: Settings and Admin */}
      <div className="mt-auto flex flex-col items-center gap-2 border-t border-border pt-2 w-full">
        {/* Settings button - Available to everyone, placed above admin */}
        <button
          onClick={onOpenSettings}
          aria-label="Definições da conta e aplicação"
          title="Definições"
          className="grid size-11 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-xs transition-all hover:bg-secondary hover:text-foreground active:scale-95 sm:size-12"
        >
          <Settings className="size-5" />
        </button>

        {/* Admin button - only for owners and admins */}
        {(profile.globalRole === 'owner' || profile.globalRole === 'admin') && (
          <button
            onClick={onOpenAdmin}
            aria-label="Painel de administração da plataforma"
            title="Administração da plataforma"
            className="grid size-11 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-xs transition-all hover:bg-secondary hover:text-foreground active:scale-95 sm:size-12"
          >
            <Shield className="size-4" />
          </button>
        )}
      </div>
    </div>

    {/* New Folder Name Dialog */}
    <ActionConfirmation action={confirmation} onClose={() => setConfirmation(null)} />
    <Dialog open={newFolderDialogOpen} onOpenChange={(open) => { if (!open) { setNewFolderDialogOpen(false); setNewFolderTargetServerId(null); } }}>
      <DialogContent className="sm:max-w-[340px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-center">
            Criar pasta
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-center">Dá um nome e escolhe uma cor para a pasta.</p>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newFolderTargetServerId) return;
            const ids = newFolderTargetServerId.includes('|')
              ? newFolderTargetServerId.split('|')
              : [newFolderTargetServerId];
            createFolder(newFolderName || 'Pasta', ids, newFolderColor);
            setNewFolderDialogOpen(false);
            setNewFolderTargetServerId(null);
            setNewFolderName('');
          }}
          className="space-y-4 mt-2"
        >
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nome da pasta"
            className="h-10 rounded-xl bg-secondary/50 border-border text-xs"
            maxLength={30}
          />
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Cor da pasta</p>
            <div className="flex items-center gap-2 flex-wrap">
              {['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewFolderColor(c)}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${newFolderColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={newFolderColor}
                onChange={(e) => setNewFolderColor(e.target.value)}
                className="w-7 h-7 rounded-lg border border-border cursor-pointer"
                title="Cor personalizada"
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90">
            Criar pasta
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    {/* Rename Folder Dialog */}
    <Dialog open={renamingFolderId !== null} onOpenChange={(open) => { if (!open) setRenamingFolderId(null); }}>
      <DialogContent className="sm:max-w-[340px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-center">
            Renomear pasta
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renamingFolderId) renameFolder(renamingFolderId, renamingFolderName || 'Pasta');
            setRenamingFolderId(null);
          }}
          className="space-y-4 mt-2"
        >
          <Input
            autoFocus
            value={renamingFolderName}
            onChange={(e) => setRenamingFolderName(e.target.value)}
            className="h-10 rounded-xl bg-secondary/50 border-border text-xs"
            maxLength={30}
            required
          />
          <Button type="submit" className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90">
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    {/* Add Server to Folder Dialog */}
    <Dialog open={addToFolderDialogId !== null} onOpenChange={(open) => { if (!open) setAddToFolderDialogId(null); }}>
      <DialogContent className="sm:max-w-[360px] rounded-3xl bg-card border-border text-card-foreground p-6 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-center">
            Adicionar servidor à pasta
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-center">Escolhe um servidor para adicionar a esta pasta.</p>
        </DialogHeader>
        <div className="mt-3 space-y-1 max-h-[50vh] overflow-y-auto">
          {(() => {
            if (!addToFolderDialogId) return null;
            const folder = folders.find((f) => f.id === addToFolderDialogId);
            if (!folder) return null;
            const availableServers = orderedCommunities.filter((c) => !folder.serverIds.includes(c.id));
            if (!availableServers.length) return <p className="text-xs text-muted-foreground text-center py-4">Todos os servidores já estão nesta pasta.</p>;
            return availableServers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { addServerToFolder(addToFolderDialogId, c.id); setAddToFolderDialogId(null); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-secondary/80 border border-border flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                  {c.icon && (c.icon.startsWith('http') || c.icon.startsWith('data:') || c.icon.startsWith('blob:')) ? (
                    <img src={c.icon} alt={c.name} className="w-full h-full object-cover" />
                  ) : c.icon && c.icon.length <= 4 ? c.icon : c.name.trim().slice(0, 1).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-foreground truncate">{c.name}</span>
              </button>
            ));
          })()}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

