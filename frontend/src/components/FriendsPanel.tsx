import { useEffect, useState, useMemo, useDeferredValue } from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  MessageSquare,
  Check,
  X,
  Search,
  FolderPlus,
  Clock,
  Sparkles,
  LoaderCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Community, PublicUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ActionConfirmation, type ConfirmationAction } from '@/components/ActionConfirmation';

function statusColor(status?: string, online?: boolean): string {
  if (!online) return '#71717a';
  if (status === 'online') return '#10b981';
  if (status === 'away') return '#f59e0b';
  if (status === 'busy') return '#ef4444';
  return '#71717a';
}

function statusText(status?: string, online?: boolean): string {
  if (!online) return 'Offline';
  if (status === 'away') return 'Ausente';
  if (status === 'busy') return 'Ocupado';
  return 'Online';
}

export function FriendsPanel({
  groups,
  currentUserId,
  onMessage,
  friendsState: externalState,
}: {
  groups: Community[];
  currentUserId: string;
  onMessage: (id: string) => void;
  friendsState?: {
    friends: PublicUser[];
    incoming: PublicUser[];
    outgoing: PublicUser[];
  };
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'online' | 'all' | 'pending' | 'add'>('online');
  const [search, setSearch] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmationAction | null>(null);

  const [internalState, setInternalState] = useState<{
    friends: PublicUser[];
    incoming: PublicUser[];
    outgoing: PublicUser[];
  }>({ friends: [], incoming: [], outgoing: [] });

  useEffect(() => {
    const off = api.on('friends:update', setInternalState);
    const ready = api.on('ready', () => api.loadFriends());
    const online = api.on('users', ({ users }) =>
      setInternalState((s) => ({
        ...s,
        friends: s.friends.map((friend) => users.find((u) => u.id === friend.id) || friend),
      }))
    );
    api.loadFriends();
    return () => {
      off();
      ready();
      online();
    };
  }, []);

  const state = externalState ?? internalState;
  const ownedGroups = groups.filter((g) => g.ownerId === currentUserId && g.members.length < 50);

  const onlineFriends = useMemo(
    () => state.friends.filter((f) => f.online),
    [state.friends]
  );

  const deferredSearch = useDeferredValue(search);
  const deferredAddUsername = useDeferredValue(addUsername);
  const [addSuggestions, setAddSuggestions] = useState<PublicUser[]>([]);

  useEffect(() => {
    const clean = deferredAddUsername.trim().toLowerCase().replace(/^@/, '');
    if (!clean || clean.length < 2) {
      setAddSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.searchUsers(clean).then((results) => {
        if (!cancelled) {
          const filtered = results.filter((u) => u.id !== currentUserId && !state.friends.some((f) => f.id === u.id));
          setAddSuggestions(filtered.slice(0, 5));
        }
      }).catch(() => {
        if (!cancelled) setAddSuggestions([]);
      });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredAddUsername, currentUserId, state.friends]);

  const filteredFriends = useMemo(() => {
    const list = activeTab === 'online' ? onlineFriends : state.friends;
    const q = deferredSearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q)
    );
  }, [activeTab, onlineFriends, state.friends, deferredSearch]);

  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault();
    const clean = addUsername.trim().replace(/^@/, '');
    if (!clean || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.friendAction('request', { username: clean });
      toast.success(`Pedido de amizade enviado para @${clean}!`);
      setAddUsername('');
      setActiveTab('pending');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(u: PublicUser) {
    if (busy) return;
    setBusy(true);
    try {
      await api.friendAction('respond', { userId: u.id, accept: true });
      toast.success(`Pedido de ${u.displayName} aceite!`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível aceitar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline(u: PublicUser) {
    if (busy) return;
    setBusy(true);
    try {
      await api.friendAction('respond', { userId: u.id, accept: false });
      toast.info(`Pedido de ${u.displayName} recusado.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível recusar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelOutgoing(u: PublicUser) {
    if (busy) return;
    setBusy(true);
    try {
      await api.friendAction('remove', { userId: u.id });
      toast.info(`Pedido para ${u.displayName} cancelado.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível cancelar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  function handlePromptRemove(u: PublicUser) {
    setConfirmAction({
      title: 'Remover amigo',
      description: `Tens a certeza que pretendes remover ${u.displayName} (@${u.username}) da tua lista de amigos?`,
      confirmLabel: 'Remover',
      destructive: true,
      execute: async () => {
        await api.friendAction('remove', { userId: u.id });
        toast.success(`Amizade com ${u.displayName} removida.`);
      },
    });
  }

  async function handleAddToGroup(groupId: string, groupName: string, username: string, displayName: string) {
    try {
      await api.addCommunityMemberConfirmed(groupId, username);
      toast.success(`${displayName} foi adicionado ao grupo ${groupName}.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível adicionar ao grupo.');
    }
  }

  function renderUserRow(u: PublicUser, actions: React.ReactNode, extraSubtext?: string) {
    return (
      <div
        key={u.id}
        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 hover:bg-secondary/40 transition-colors"
      >
        <div className="relative shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-inner overflow-hidden bg-cover bg-center"
            style={{
              backgroundColor: `hsl(${u.hue || 210}, 60%, 45%)`,
              backgroundImage: u.avatarUrl ? `url(${u.avatarUrl})` : undefined,
            }}
          >
            {!u.avatarUrl && u.displayName.trim().slice(0, 1).toUpperCase()}
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card"
            style={{ backgroundColor: statusColor(u.status, u.online) }}
            title={statusText(u.status, u.online)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-foreground truncate">{u.displayName}</p>
            <span className="text-[11px] text-muted-foreground font-mono truncate">@{u.username}</span>
          </div>
          {extraSubtext ? (
            <p className="text-[11px] text-muted-foreground truncate">{extraSubtext}</p>
          ) : u.customStatus ? (
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              <Sparkles className="size-3 text-primary shrink-0" />
              <span>{u.customStatus}</span>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground truncate">
              {statusText(u.status, u.online)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">{actions}</div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setError('');
          api.loadFriends();
        }}
        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-2 text-xs font-medium bg-secondary/60 hover:bg-secondary transition-colors group cursor-pointer text-foreground"
      >
        <Users size={16} className="text-primary shrink-0" />
        <span>Amigos</span>
        {state.incoming.length > 0 ? (
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground animate-pulse">
            {state.incoming.length} {state.incoming.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
            {state.friends.length}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl rounded-3xl p-6 bg-card border-border shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Users className="size-5 text-primary" /> Os teus amigos
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Conversa com amigos, envia pedidos de amizade e reúne todos em grupos.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as typeof activeTab);
              setError('');
            }}
            className="w-full mt-2"
          >
            <TabsList className="grid grid-cols-4 w-full bg-secondary/60 p-1 rounded-2xl h-10">
              <TabsTrigger value="online" className="rounded-xl text-xs font-medium">
                Disponíveis
                {onlineFriends.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                    {onlineFriends.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" className="rounded-xl text-xs font-medium">
                Todos
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-secondary text-muted-foreground font-semibold">
                  {state.friends.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="pending" className="rounded-xl text-xs font-medium">
                Pendentes
                {state.incoming.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-primary text-primary-foreground font-bold">
                    {state.incoming.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="add"
                className="rounded-xl text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <UserPlus size={13} className="mr-1" /> Adicionar
              </TabsTrigger>
            </TabsList>

            {/* TAB: ONLINE & ALL FRIENDS */}
            {(activeTab === 'online' || activeTab === 'all') && (
              <TabsContent value={activeTab} className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Pesquisar amigos..."
                    className="pl-8 h-9 rounded-xl bg-secondary/40 border-border text-xs focus:bg-card"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                  {filteredFriends.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl bg-secondary/30 border border-border/40">
                      <Users className="size-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-xs font-medium text-foreground">
                        {search
                          ? 'Nenhum amigo encontrado para esta pesquisa.'
                          : activeTab === 'online'
                          ? 'Nenhum amigo online de momento.'
                          : 'Ainda não tens amigos na tua lista.'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {activeTab === 'all' && !search
                          ? 'Clica em "Adicionar" para convidar pessoas pelo nome de utilizador!'
                          : ''}
                      </p>
                    </div>
                  ) : (
                    filteredFriends.map((u) =>
                      renderUserRow(
                        u,
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 rounded-xl text-xs gap-1.5 font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={() => {
                              onMessage(u.id);
                              setOpen(false);
                            }}
                            title={`Conversar com ${u.displayName}`}
                          >
                            <MessageSquare className="size-3.5" /> Conversar
                          </Button>

                          {ownedGroups.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={busy}
                                  className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                                  title="Adicionar a um grupo"
                                  aria-label={`Adicionar ${u.displayName} a um grupo`}
                                >
                                  <FolderPlus size={15} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5 shadow-xl">
                                <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold px-2 py-1">
                                  Adicionar ao grupo
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {ownedGroups.map((group) => {
                                  const isMember = group.members.includes(u.id);
                                  return (
                                    <DropdownMenuItem
                                      key={group.id}
                                      disabled={isMember || busy}
                                      onSelect={() =>
                                        void handleAddToGroup(group.id, group.name, u.username, u.displayName)
                                      }
                                      className="text-xs rounded-xl px-2.5 py-2 cursor-pointer flex items-center justify-between"
                                    >
                                      <span className="truncate flex-1">{group.name}</span>
                                      {isMember ? (
                                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                                          Já no grupo
                                        </span>
                                      ) : (
                                        <PlusIcon className="size-3 text-primary shrink-0 ml-2" />
                                      )}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}

                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={busy}
                            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            aria-label={`Remover amizade com ${u.displayName}`}
                            title={`Remover ${u.displayName}`}
                            onClick={() => handlePromptRemove(u)}
                          >
                            <UserMinus size={15} />
                          </Button>
                        </>
                      )
                    )
                  )}
                </div>
              </TabsContent>
            )}

            {/* TAB: PENDING REQUESTS */}
            <TabsContent value="pending" className="mt-4 space-y-4">
              <div className="max-h-[50vh] overflow-y-auto space-y-4 pr-1">
                {/* Incoming Requests */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                    Pedidos Recebidos ({state.incoming.length})
                  </h3>
                  {state.incoming.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 px-4 rounded-xl bg-secondary/30 border border-border/40">
                      Não tens pedidos de amizade pendentes.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {state.incoming.map((u) =>
                        renderUserRow(
                          u,
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              disabled={busy}
                              className="h-8 rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                              onClick={() => void handleAccept(u)}
                            >
                              <Check size={14} /> Aceitar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              className="h-8 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => void handleDecline(u)}
                            >
                              <X size={14} /> Recusar
                            </Button>
                          </div>,
                          'Enviou-te um pedido de amizade'
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Outgoing Requests */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                    Pedidos Enviados ({state.outgoing.length})
                  </h3>
                  {state.outgoing.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 px-4 rounded-xl bg-secondary/30 border border-border/40">
                      Não tens pedidos enviados a aguardar resposta.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {state.outgoing.map((u) =>
                        renderUserRow(
                          u,
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            className="h-8 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30"
                            onClick={() => void handleCancelOutgoing(u)}
                          >
                            Cancelar
                          </Button>,
                          'A aguardar aceitação'
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* TAB: ADD FRIEND */}
            <TabsContent value="add" className="mt-4 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Adicionar Amigo</h3>
                <p className="text-xs text-muted-foreground">
                  Podes adicionar amigos introduzindo o nome de utilizador (username).
                </p>
              </div>

              <form onSubmit={handleSendRequest} className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-2.5 text-xs font-mono text-muted-foreground">@</span>
                    <Input
                      autoFocus
                      aria-label="Nome de utilizador"
                      placeholder="nome de utilizador"
                      value={addUsername}
                      onChange={(e) => {
                        setAddUsername(e.target.value);
                        setError('');
                      }}
                      maxLength={21}
                      disabled={busy}
                      className="pl-8 h-10 rounded-2xl bg-secondary/50 border-border text-xs focus:bg-card focus:border-primary"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy || !addUsername.trim()}
                    className="h-10 px-4 rounded-2xl text-xs font-semibold gap-1.5 shadow-sm"
                  >
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus size={15} />}
                    <span>Enviar Pedido</span>
                  </Button>
                </div>

                {error && (
                  <p role="alert" className="text-xs text-destructive font-medium px-1">
                    {error}
                  </p>
                )}

                {addSuggestions.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Sugestões:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {addSuggestions.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setAddUsername(u.username);
                            setError('');
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-secondary hover:bg-secondary/80 text-xs text-foreground transition-colors group"
                        >
                          <span className="font-semibold">{u.displayName}</span>
                          <span className="text-muted-foreground group-hover:text-foreground">@{u.username}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form>

              <div className="rounded-2xl border border-border/60 bg-secondary/20 p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5 text-primary" /> Dicas de amizade
                </p>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
                  <li>O nome de utilizador não é sensível a maiúsculas (ex: @joao ou @Joao funcionam da mesma forma).</li>
                  <li>Quando a outra pessoa aceitar o teu pedido, ela aparecerá na tua lista de amigos.</li>
                  <li>Se ambos enviarem um pedido de amizade ao mesmo tempo, tornam-se amigos automaticamente!</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ActionConfirmation action={confirmAction} onClose={() => setConfirmAction(null)} />
    </>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
