import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Compass,
  Search,
  Users,
  Hash,
  LogIn,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Layers,
  Volume2,
} from 'lucide-react';
import type { Community, MyProfile } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface PublicServersViewProps {
  profile: MyProfile;
  publicCommunities: Community[];
  myCommunities: Community[];
  onSelectCommunity: (communityId: string) => void;
  onOpenCreate?: () => void;
}

export function PublicServersView({
  profile,
  publicCommunities,
  myCommunities,
  onSelectCommunity,
  onOpenCreate,
}: PublicServersViewProps) {
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const myCommunityIds = useMemo(
    () => new Set(myCommunities.map((c) => c.id)),
    [myCommunities]
  );

  const filteredCommunities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return publicCommunities;
    return publicCommunities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [publicCommunities, search]);

  async function handleJoinOrOpen(comm: Community) {
    const isMember = myCommunityIds.has(comm.id) || (comm.members || []).includes(profile.id);
    if (isMember) {
      onSelectCommunity(comm.id);
      return;
    }

    setJoiningId(comm.id);
    try {
      await api.joinCommunityConfirmed(comm.inviteCode || comm.id, comm.id);
      toast.success(`Entraste no servidor ${comm.name}.`);
      onSelectCommunity(comm.id);
    } catch { toast.error('Não foi possível entrar no servidor. Confirma a ligação e tenta novamente.'); }
    finally { setJoiningId(null); }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background text-foreground overflow-hidden select-none">
      {/* Header Bar */}
      <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-card/60 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Compass className="size-4" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              Explorar Servidores Públicos
            </h1>
            <p className="text-[10px] text-muted-foreground hidden sm:block">
              Descobre comunidades abertas no Tuga e faz novos amigos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCreate && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenCreate}
              className="h-8 rounded-xl text-xs gap-1.5 border-border hover:bg-secondary"
            >
              <Sparkles className="size-3.5 text-primary" />
              <span>Criar Servidor</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
        {/* Hero Banner Section */}
        <div className="relative rounded-3xl overflow-hidden border border-border bg-gradient-to-br from-card via-card/90 to-primary/10 p-6 md:p-10 shadow-sm">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-primary/15 text-primary border border-primary/20">
              <Compass className="size-3" /> Comunidades Abertas
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Encontra a tua próxima comunidade no Tuga
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              De jogos e desenvolvimento a música e convívio geral, explora servidores onde és sempre bem-vindo.
            </p>

            {/* Search Box */}
            <div className="pt-2">
              <div className="relative max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar por nome ou assunto..."
                  className="h-11 rounded-2xl pl-10 pr-4 bg-background/80 border-border text-xs focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>
            </div>
          </div>

          <div className="absolute right-6 -bottom-6 opacity-10 pointer-events-none hidden md:block">
            <Compass className="size-56 text-primary" />
          </div>
        </div>

        {/* Server Count & Highlights */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Layers className="size-4 text-primary" />
            <span>
              Servidores em Destaque ({filteredCommunities.length})
            </span>
          </div>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-primary hover:underline"
            >
              Limpar pesquisa
            </button>
          )}
        </div>

        {/* Server Cards Grid */}
        {filteredCommunities.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center space-y-3">
            <div className="size-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto text-muted-foreground">
              <Compass className="size-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Nenhum servidor público encontrado
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {search
                ? `Não foram encontrados servidores públicos com o termo "${search}".`
                : 'Ainda não existem outros servidores públicos criados.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCommunities.map((comm) => {
              const isMember = myCommunityIds.has(comm.id) || (comm.members || []).includes(profile.id);
              const isJoining = joiningId === comm.id;
              const textChannelsCount = comm.textChannelCount ?? (comm.channels || []).filter((c) => c.type === 'text' || c.type === 'announcement').length;
              const voiceChannelsCount = comm.voiceChannelCount ?? (comm.channels || []).filter((c) => c.type === 'voice').length;

              return (
                <motion.article
                  key={comm.id}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-3xl border border-border bg-card/80 hover:bg-card hover:border-border/80 transition-all flex flex-col overflow-hidden shadow-xs hover:shadow-md group"
                >
                  {/* Server Banner or Colored Header */}
                  <div
                    className="h-28 w-full bg-cover bg-center relative shrink-0"
                    style={{
                      backgroundImage: comm.bannerUrl ? `url(${comm.bannerUrl})` : undefined,
                      backgroundPosition: comm.bannerPosition !== undefined ? `center ${comm.bannerPosition}%` : 'center',
                      backgroundColor: !comm.bannerUrl ? 'hsl(215, 25%, 27%)' : undefined,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/40 backdrop-blur-md text-white border border-white/10">
                        <Users className="size-3" />
                        <span>{comm.memberCount ?? (comm.members || []).length}</span>
                      </span>
                    </div>
                  </div>

                  {/* Server Details */}
                  <div className="p-4 pt-0 flex-1 flex flex-col relative">
                    {/* Server Icon Overlapping Banner */}
                    <div className="-mt-8 mb-3 flex items-end justify-between">
                      <div
                        className="size-14 rounded-2xl border-2 border-card bg-secondary shadow-md flex items-center justify-center font-bold text-base overflow-hidden shrink-0 bg-cover bg-center"
                        style={{
                          backgroundColor: 'hsl(215, 30%, 35%)',
                          backgroundImage: comm.icon && (comm.icon.startsWith('data:') || comm.icon.startsWith('http')) ? `url(${comm.icon})` : undefined,
                        }}
                      >
                        {(!comm.icon || (!comm.icon.startsWith('data:') && !comm.icon.startsWith('http'))) && (
                          <span className="text-white">
                            {comm.icon ? comm.icon.slice(0, 4) : comm.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {isMember && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="size-3" />
                          <span>Membro</span>
                        </span>
                      )}
                    </div>

                    {/* Server Name & Description */}
                    <div className="flex-1 space-y-1">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {comm.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 min-h-8 leading-relaxed">
                        {comm.description || 'Uma comunidade acolhedora no Tuga.'}
                      </p>
                    </div>

                    {/* Channel Badges */}
                    <div className="pt-3 pb-4 flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border/50 mt-3">
                      <span className="flex items-center gap-1">
                        <Hash className="size-3.5" />
                        <span>{textChannelsCount} texto</span>
                      </span>
                      {voiceChannelsCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Volume2 className="size-3.5" />
                          <span>{voiceChannelsCount} voz</span>
                        </span>
                      )}
                    </div>

                    {/* Action Button */}
                    <Button
                      onClick={() => handleJoinOrOpen(comm)}
                      disabled={joiningId !== null}
                      variant={isMember ? 'secondary' : 'default'}
                      className={`w-full rounded-2xl h-9 text-xs font-semibold gap-1.5 transition-all ${
                        isMember
                          ? 'hover:bg-secondary/80'
                          : 'bg-primary text-primary-foreground hover:opacity-90 shadow-xs'
                      }`}
                    >
                      {isJoining ? (
                        <>
                          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          <span>A entrar...</span>
                        </>
                      ) : isMember ? (
                        <>
                          <LogIn className="size-3.5" />
                          <span>Abrir Servidor</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="size-3.5" />
                          <span>Entrar no Servidor</span>
                        </>
                      )}
                    </Button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
