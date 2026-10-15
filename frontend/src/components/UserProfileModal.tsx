import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PublicUser } from '@/types';
import { ProfileCard } from './ProfileCard';

interface UserProfileModalProps {
  user: PublicUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBlocked?: boolean;
  onToggleBlock?: (userId: string, blocked: boolean) => void;
  onStartMessage?: (userId: string) => void;
  isFriend?: boolean;
  isPendingIncoming?: boolean;
  isPendingOutgoing?: boolean;
  onFriendAction?: (action: 'request' | 'accept' | 'remove') => void;
}

export function UserProfileModal({
  user,
  open,
  onOpenChange,
  isBlocked = false,
  onToggleBlock,
  onStartMessage,
  isFriend,
  isPendingIncoming,
  isPendingOutgoing,
  onFriendAction,
}: UserProfileModalProps) {
  if (!user) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden rounded-3xl bg-card border-border text-card-foreground shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Perfil de {user.displayName}</DialogTitle>
        </DialogHeader>
        <ProfileCard
          user={user}
          isBlocked={isBlocked}
          onToggleBlock={onToggleBlock}
          onStartMessage={
            onStartMessage
              ? (id) => {
                  onStartMessage(id);
                  onOpenChange(false);
                }
              : undefined
          }
          isFriend={isFriend}
          isPendingIncoming={isPendingIncoming}
          isPendingOutgoing={isPendingOutgoing}
          onFriendAction={onFriendAction}
        />
      </DialogContent>
    </Dialog>
  );
}
