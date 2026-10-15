import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Building2, Search, Shield, Users, X, AlertTriangle, Ban, CheckCircle, LogIn, ShieldAlert } from 'lucide-react';
import type { Community, MyProfile, PublicUser } from '@/types';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type AdminSection = 'overview' | 'users' | 'servers';

interface AdminPanelProps {
  profile: MyProfile;
  users: PublicUser[];
  communities: Community[];
  onClose: () => void;
  onEnterCommunity?: (communityId: string) => void;
}

const tabs: { id: AdminSection; label: string; icon: typeof Shield }[] = [
  { id: 'overview', label: 'Visão geral', icon: Shield },
  { id: 'users', label: 'Contas', icon: Users },
  { id: 'servers', label: 'Servidores', icon: Building2 },
];

export function AdminPanel({ profile, users, communities, onClose, onEnterCommunity }: AdminPanelProps) {
  const [section, setSection] = useState<AdminSection>('overview');
  const [search, setSearch] = useState('');
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingServer, setPendingServer] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const isOwner = profile.globalRole === 'owner';
  const accounts: PublicUser[] = useMemo(() => [{ ...profile, online: true }, ...users.filter((user) => user.id !== profile.id)], [profile, users]);
  const filteredAccounts = accounts.filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filteredCommunities = communities.filter((community) => community.name.toLowerCase().includes(search.trim().toLowerCase()));
  const onlineCount = accounts.filter((user) => user.online || user.id === profile.id).length;

  useEffect(() => {
    const stopUpdated = api.on('admin:user:role:updated', ({ userId }) => {
      setPendingRole((current) => current === userId ? null : current);
    });
    const stopError = api.on('err', ({ code }) => {
      if (code === 'admin_permission' || code === 'admin_target') {
        setRoleError(code === 'admin_permission' ? 'Não tens autorização para alterar cargos ou estados globais.' : 'Não foi possível alterar o cargo/estado desta conta.');
        setPendingRole(null);
        setPendingStatus(null);
      }
    });
    return () => { stopUpdated(); stopError(); };
  }, []);

  async function changeRole(userId: string, enabled: boolean) {
    if (!isOwner || userId === profile.id || pendingRole) return;
    setRoleError(null);
    setPendingRole(userId);
    try { await api.setGlobalAdminConfirmed(userId, enabled); }
    catch { setRoleError('O servidor não confirmou a alteração do cargo.'); }
    finally { setPendingRole(null); }
  }

  async function changeAccountStatus(userId: string, status: 'active' | 'suspended' | 'restricted') {
    if (userId === profile.id || pendingStatus) return;
    setRoleError(null);
    setPendingStatus(userId);
    try { await api.setAccountStatusConfirmed(userId, status); }
    catch { setRoleError('O servidor não confirmou a alteração da conta.'); }
    finally { setPendingStatus(null); }
  }

  async function toggleCommunitySuspension(community: Community) {
    if (pendingServer) return;
    setPendingServer(community.id);
    try { await api.setCommunitySuspensionConfirmed(community.id, !community.suspended); }
    catch { setRoleError('O servidor não confirmou a alteração do servidor.'); }
    finally { setPendingServer(null); }
  }

  async function handleAdminEnter(communityId: string) {
    if (pendingServer) return;
    setPendingServer(communityId);
    try { await api.adminJoinCommunityConfirmed(communityId); onEnterCommunity?.(communityId); onClose(); }
    catch { setRoleError('Não foi possível confirmar a entrada no servidor.'); }
    finally { setPendingServer(null); }
  }

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="fixed inset-0 z-[80] flex bg-background text-foreground admin-panel-root"
      aria-label="Painel de administração da plataforma"
    >
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/60 p-5 md:flex">
        <div className="mb-9 flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-2xl bg-foreground text-background"><Shield className="size-5" /></span>
          <div><p className="text-sm font-semibold tracking-tight">Tuga</p><p className="text-xs text-muted-foreground">Administração</p></div>
        </div>
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Plataforma</p>
        <nav className="space-y-1" aria-label="Secções de administração">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setSection(id); setSearch(''); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${section === id ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-border bg-background p-3">
          <p className="truncate text-xs font-medium">{profile.displayName}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{isOwner ? 'Proprietário da plataforma' : 'Administrador global'}</p>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Voltar à aplicação"><ArrowLeft className="size-4" /></button>
            <div><p className="text-sm font-semibold">Administração da plataforma</p><p className="hidden text-xs text-muted-foreground sm:block">Gestão restrita aos administradores globais</p></div>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Fechar painel"><X className="size-4" /></button>
        </header>

        <div className="border-b border-border px-4 py-2 md:hidden">
          <nav className="flex gap-1" aria-label="Secções de administração">
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setSearch(''); }} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs ${section === id ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}><Icon className="size-3.5" />{label}</button>)}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-9">
          <div className="mx-auto max-w-6xl">
            <AnimatePresence mode="wait">
              <motion.div key={section} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
                {section === 'overview' && <>
                  <div className="mb-7"><p className="text-xs font-medium text-muted-foreground">TUGA / PLATAFORMA</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Visão geral</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">Estado atual das contas e comunidades disponíveis para a administração.</p></div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[{ label: 'Contas registadas', value: accounts.length, icon: Users }, { label: 'Contas ligadas', value: onlineCount, icon: Shield }, { label: 'Servidores', value: communities.length, icon: Building2 }].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><Icon className="size-4 text-muted-foreground" /></div><p className="mt-5 text-3xl font-semibold tracking-tight">{value}</p></article>)}
                  </div>
                  <div className="mt-6 rounded-2xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Acesso e Controlo Administrativo</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Como administrador podes gerir contas (suspender, restringir mensagens ou reativar), suspender servidores em infração e entrar em qualquer servidor diretamente sem necessidade de código de convite.</p></div>
                  <div className="mt-5 flex gap-4">
                    <button onClick={() => setSection('users')} className="text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">Gerir contas</button>
                    <button onClick={() => setSection('servers')} className="text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">Gerir servidores</button>
                  </div>
                </>}

                {section === 'users' && <>
                  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-medium text-muted-foreground">TUGA / PLATAFORMA</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Contas</h1><p className="mt-2 text-sm text-muted-foreground">{accounts.length} contas registadas</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por nome ou username" className="h-10 rounded-xl pl-9" /></div></div>
                  {roleError && <p role="alert" className="mb-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{roleError}</p>}
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="hidden grid-cols-[minmax(0,1.2fr)_120px_140px_200px] gap-4 border-b border-border bg-secondary/35 px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid"><span>Conta</span><span>Estado</span><span>Cargo</span><span>Gestão & Moderação</span></div>
                    {filteredAccounts.map((user) => (
                      <div key={user.id} className="grid gap-3 border-b border-border p-4 last:border-0 sm:grid-cols-[minmax(0,1.2fr)_120px_140px_200px] sm:items-center sm:gap-4 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-sm font-semibold">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                            ) : (
                              user.displayName.trim().slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{user.displayName}{user.id === profile.id ? ' (tu)' : ''}</span>
                            <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
                          </span>
                        </div>
                        
                        <div>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className={`size-2 rounded-full ${user.online || user.id === profile.id ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                            {user.online || user.id === profile.id ? 'Ligada' : 'Desligada'}
                          </span>
                          {user.accountStatus === 'suspended' && (
                            <span className="inline-block mt-1 text-[10px] text-destructive font-semibold bg-destructive/10 px-1.5 py-0.5 rounded">Suspensa</span>
                          )}
                          {user.accountStatus === 'restricted' && (
                            <span className="inline-block mt-1 text-[10px] text-amber-500 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded">Restrita (Muda)</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{user.globalRole === 'owner' ? 'Proprietário' : user.globalRole === 'admin' ? 'Administrador' : 'Utilizador'}</span>
                          {isOwner && user.id !== profile.id && user.globalRole !== 'owner' && (
                            <label className="flex items-center gap-1.5 text-xs">
                              <input type="checkbox" checked={user.globalRole === 'admin'} disabled={pendingRole !== null} onChange={(event) => changeRole(user.id, event.target.checked)} className="accent-foreground" />
                              <span className="text-[11px]">{pendingRole === user.id ? '...' : 'Admin'}</span>
                            </label>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {user.id !== profile.id && user.globalRole !== 'owner' && (
                            <>
                              {user.accountStatus === 'suspended' ? (
                                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10" onClick={() => changeAccountStatus(user.id, 'active')}>
                                  <CheckCircle className="size-3" /> Reativar
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg gap-1 text-destructive hover:bg-destructive/10" onClick={() => changeAccountStatus(user.id, 'suspended')}>
                                  <Ban className="size-3" /> Suspender
                                </Button>
                              )}

                              {user.accountStatus === 'restricted' ? (
                                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg gap-1" onClick={() => changeAccountStatus(user.id, 'active')}>
                                  Desbloquear
                                </Button>
                              ) : user.accountStatus !== 'suspended' && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg gap-1 text-amber-500 hover:bg-amber-500/10" onClick={() => changeAccountStatus(user.id, 'restricted')}>
                                  <AlertTriangle className="size-3" /> Restringir
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {filteredAccounts.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Não foram encontradas contas.</p>}
                  </div>
                  {!isOwner && <p className="mt-3 text-xs text-muted-foreground">A atribuição de administradores globais é exclusiva do proprietário da plataforma.</p>}
                </>}

                {section === 'servers' && <>
                  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-medium text-muted-foreground">TUGA / PLATAFORMA</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Servidores</h1><p className="mt-2 text-sm text-muted-foreground">Vista e controlo administrativo dos servidores públicos e privados.</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar servidores" className="h-10 rounded-xl pl-9" /></div></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredCommunities.map((community) => {
                      const owner = accounts.find((user) => user.id === community.ownerId);
                      const isMember = community.members.includes(profile.id);
                      return (
                        <article key={community.id} className={`rounded-2xl border bg-card p-5 transition-all ${community.suspended ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-sm font-semibold">
                                {community.icon && (community.icon.startsWith('http') || community.icon.startsWith('data:') || community.icon.startsWith('blob:') || community.icon.startsWith('/')) ? (
                                  <img src={community.icon} alt={community.name} className="size-full object-cover" />
                                ) : community.icon && community.icon.length <= 4 ? (
                                  community.icon
                                ) : (
                                  community.name.trim().slice(0, 1).toUpperCase()
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h2 className="truncate text-sm font-semibold">{community.name}</h2>
                                  {community.suspended && <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold text-destructive">SUSPENSO</span>}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{owner ? `Criado por @${owner.username}` : 'Proprietário indisponível'}</p>
                              </div>
                            </div>
                            <span className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground">{community.isPublic ? 'Público' : 'Privado'}</span>
                          </div>
                          
                          <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{community.description || 'Sem descrição'}</p>
                          
                          <div className="mt-3 flex gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                            <span>{community.members.length} membros</span>
                            <span>{community.channels.length} canais</span>
                            <span>{community.admins?.length || 0} admins</span>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                            <Button size="sm" variant="secondary" className="h-8 rounded-xl text-xs gap-1.5" onClick={() => handleAdminEnter(community.id)}>
                              <LogIn className="size-3.5" /> {isMember ? 'Abrir Servidor' : 'Entrar como Admin'}
                            </Button>

                            <Button
                              size="sm"
                              variant={community.suspended ? 'outline' : 'destructive'}
                              className="h-8 rounded-xl text-xs gap-1.5"
                              onClick={() => toggleCommunitySuspension(community)}
                            >
                              <ShieldAlert className="size-3.5" />
                              {community.suspended ? 'Reativar Servidor' : 'Suspender Servidor'}
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {filteredCommunities.length === 0 && <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Não foram encontrados servidores.</p>}
                </>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>
    </motion.main>
  );
}
