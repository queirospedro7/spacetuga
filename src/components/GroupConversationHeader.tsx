import { useState } from 'react';
import { Phone, Users, UserPlus, ChevronLeft } from 'lucide-react';
import type { Community, MyProfile, PublicUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ActionConfirmation, type ConfirmationAction } from '@/components/ActionConfirmation';
import { api } from '@/lib/api';

export function GroupConversationHeader({ group, users, profile, voiceMembers, connected, onCall, onBack }: { group: Community; users: PublicUser[]; profile: MyProfile; voiceMembers: string[]; connected: boolean; onCall: () => void; onBack?: () => void }) {
  const [membersOpen, setMembersOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const canAdd = group.ownerId === profile.id;
  return <>
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">{onBack && <Button variant="ghost" size="icon" className="md:hidden shrink-0" aria-label="Voltar" onClick={onBack}><ChevronLeft size={18} /></Button>}<span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary"><Users size={19} /></span><div className="min-w-0"><h2 className="text-sm font-semibold truncate">{group.name}</h2><p className="text-[11px] text-muted-foreground mt-0.5">{group.members.length} pessoas numa conversa privada</p></div></div>
      <div className="flex items-center gap-1.5"><Button variant="ghost" size="icon" aria-label="Ver membros do grupo" onClick={() => setMembersOpen(true)}><Users size={18} /></Button><Button size="sm" className="rounded-xl gap-2" disabled={!group.channels.some((c) => c.type === 'voice')} onClick={() => connected ? onCall() : setConfirmation({ title: voiceMembers.length ? 'Entrar na chamada do grupo?' : 'Iniciar chamada do grupo?', description: 'A chamada fica disponível para os membros deste grupo. Podes ativar a câmara e partilhar o ecrã lá dentro.', confirmLabel: 'Entrar na chamada', destructive: false, execute: async () => { onCall(); } })}><Phone size={15} /><span className="hidden sm:inline">{connected ? 'Voltar à chamada' : voiceMembers.length ? 'Entrar na chamada' : 'Chamada'}</span></Button></div>
    </header>
    {!!voiceMembers.length && <button onClick={() => connected ? onCall() : setConfirmation({title:'Entrar na chamada do grupo?',description:'Junta-te à conversa com os membros que já estão na chamada.',confirmLabel:'Entrar',destructive:false,execute:async () => { onCall(); }})} className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-secondary/60 px-5 py-2.5 text-xs text-left hover:bg-secondary"><span className="flex items-center gap-2"><Phone size={14} />{voiceMembers.length} {voiceMembers.length === 1 ? 'pessoa na chamada' : 'pessoas na chamada'}</span><span className="font-medium">{connected ? 'Abrir chamada' : 'Participar'}</span></button>}
    <Dialog open={membersOpen} onOpenChange={setMembersOpen}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>Membros de {group.name}</DialogTitle><DialogDescription>{group.members.length} de 50 membros</DialogDescription></DialogHeader><div className="max-h-72 overflow-y-auto space-y-1">{group.members.map((id) => {const user = id === profile.id ? profile : users.find((u) => u.id === id); return <div key={id} className="flex items-center gap-3 rounded-xl p-2.5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary overflow-hidden">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : user?.displayName.slice(0,1).toUpperCase() || '?'}</span><div className="min-w-0 flex-1"><p className="text-sm truncate">{user?.displayName || 'Membro'}{id === profile.id && <span className="text-xs text-muted-foreground"> (tu)</span>}</p><p className="text-[11px] text-muted-foreground">{voiceMembers.includes(id) ? 'Na chamada' : id === group.ownerId ? 'Criador do grupo' : user ? `@${user.username}` : ''}</p></div></div>;})}</div>{canAdd && <form className="space-y-2 border-t border-border pt-4" onSubmit={async (e) => {e.preventDefault(); if(busy || !username.trim())return; setBusy(true);setError('');try {await api.addCommunityMemberConfirmed(group.id,username.trim().replace(/^@/,''));setUsername('');}catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível adicionar esta pessoa.');}finally{setBusy(false);}}}><label htmlFor="group-add-username" className="text-xs font-medium">Adicionar pelo nome de utilizador</label><div className="flex gap-2"><Input id="group-add-username" placeholder="@utilizador" value={username} onChange={(e)=>setUsername(e.target.value)} disabled={busy || group.members.length>=50} maxLength={21} required /><Button type="submit" disabled={busy || !username.trim() || group.members.length>=50} aria-label="Adicionar ao grupo"><UserPlus size={17}/></Button></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</form>}</DialogContent></Dialog>
    <ActionConfirmation action={confirmation} onClose={()=>setConfirmation(null)} />
  </>;
}


