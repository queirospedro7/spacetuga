import type { MouseEventHandler } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, ShieldBan, UserCheck, MessageSquare, Calendar, Sparkles, UserPlus, Check, Clock } from 'lucide-react';
import type { PublicUser } from '@/types';
import { bannerStyle } from '@/lib/banner-style';
import { format } from 'date-fns';
export function ProfileCard({
  user,
  isBlocked = false,
  onToggleBlock,
  onStartMessage,
  onBannerMouseDown,
  isFriend,
  isPendingIncoming,
  isPendingOutgoing,
  onFriendAction,
}: {
  user: PublicUser;
  isBlocked?: boolean;
  onToggleBlock?: (id: string, blocked: boolean) => void;
  onStartMessage?: (id: string) => void;
  onBannerMouseDown?: MouseEventHandler<HTMLDivElement>;
  isFriend?: boolean;
  isPendingIncoming?: boolean;
  isPendingOutgoing?: boolean;
  onFriendAction?: (action: 'request' | 'accept' | 'remove') => void;
}) {
const joinDate=user.createdAt?format(new Date(user.createdAt),'dd/MM/yyyy'):'Recentemente';
return <>        {/* Banner with customized gradient or image */}
        <div
          className="h-32 w-full bg-cover relative transition-all" onMouseDown={onBannerMouseDown}
          style={bannerStyle(user.bannerUrl, `linear-gradient(135deg, hsl(${user.hue}, 65%, 45%) 0%, hsl(${(user.hue + 45) % 360}, 75%, 25%) 100%)`, user.bannerPosition ?? 50)}
        >
          {user.globalRole && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/50 backdrop-blur-md text-white text-[11px] font-semibold shadow-xs">
              <Shield className="size-3 text-amber-400" />
              <span>{user.globalRole === 'owner' ? 'CRIADOR' : 'ADMINISTRADOR'}</span>
            </div>
          )}
        </div>

        {/* Profile Card Header overlapping banner */}
        <div className="px-5 pb-5 pt-0 relative bg-card flow-root">
          <div className="flex items-end justify-between -mt-12 mb-3">
            <div className="relative">
              <div
                className="w-20 h-20 rounded-2xl border-4 border-card shadow-lg flex items-center justify-center text-3xl font-bold overflow-hidden bg-cover bg-center text-white"
                style={{
                  backgroundColor: `hsl(${user.hue}, 60%, 45%)`,
                  backgroundImage: user.avatarUrl ? `url(${user.avatarUrl})` : undefined,
                }}
              >
                {!user.avatarUrl && user.displayName.trim().slice(0, 1).toUpperCase()}
              </div>
              <span
                className={`absolute bottom-1 right-1 size-4 rounded-full ring-2 ring-card ${
                  user.online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                }`}
                title={user.online ? 'Online' : 'Offline'}
              />
            </div>

            <div className="flex items-center gap-2">
              {onStartMessage && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 rounded-xl text-xs gap-1.5 font-medium"
                  onClick={() => {
                    onStartMessage(user.id);
                  }}
                >
                  <MessageSquare className="size-3.5" /> Mensagem
                </Button>
              )}

              {onFriendAction && (
                isFriend ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-xl text-xs gap-1.5 font-medium text-emerald-600 dark:text-emerald-400 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onFriendAction('remove')}
                    title="Remover dos amigos"
                  >
                    <UserCheck className="size-3.5" /> Amigo
                  </Button>
                ) : isPendingIncoming ? (
                  <Button
                    size="sm"
                    className="h-8 rounded-xl text-xs gap-1.5 font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => onFriendAction('accept')}
                    title="Aceitar pedido de amizade"
                  >
                    <Check className="size-3.5" /> Aceitar
                  </Button>
                ) : isPendingOutgoing ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-xl text-xs gap-1.5 font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30"
                    onClick={() => onFriendAction('remove')}
                    title="Cancelar pedido enviado"
                  >
                    <Clock className="size-3.5" /> Enviado
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-xl text-xs gap-1.5 font-medium hover:bg-primary hover:text-primary-foreground"
                    onClick={() => onFriendAction('request')}
                    title="Enviar pedido de amizade"
                  >
                    <UserPlus className="size-3.5" /> Adicionar
                  </Button>
                )
              )}

              {onToggleBlock && (
                <Button
                  size="sm"
                  variant={isBlocked ? 'outline' : 'ghost'}
                  className={`h-8 rounded-xl text-xs gap-1.5 font-medium ${
                    isBlocked ? 'text-destructive border-destructive/30 hover:bg-destructive/10' : 'text-muted-foreground hover:text-destructive'
                  }`}
                  onClick={() => onToggleBlock(user.id, !isBlocked)}
                  title={isBlocked ? 'Desbloquear pessoa' : 'Bloquear pessoa'}
                >
                  {isBlocked ? <UserCheck className="size-3.5" /> : <ShieldBan className="size-3.5" />}
                  {isBlocked ? 'Desbloquear' : 'Bloquear'}
                </Button>
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="space-y-1">
            <h3 className="text-lg font-bold tracking-tight text-foreground">{user.displayName}</h3>
            <p className="text-xs text-muted-foreground font-mono">@{user.username}</p>
          </div>

          {user.customStatus && (
            <div className="mt-3 p-2.5 rounded-xl bg-secondary/50 border border-border/80 flex items-center gap-2 text-xs text-foreground">
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span>{user.customStatus}</span>
            </div>
          )}

          {/* Bio / About */}
          <div className="mt-4 space-y-1.5 border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sobre Mim</p>
            <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {user.about ? user.about : 'Esta pessoa ainda não adicionou uma biografia.'}
            </p>
          </div>

          {/* Member since */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              <span>Membro desde {joinDate}</span>
            </div>
            <span className="capitalize">{user.status || (user.online ? 'Online' : 'Offline')}</span>
          </div>
        </div>
</>;
}


