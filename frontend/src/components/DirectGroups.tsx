import { useState } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ActionConfirmation, type ConfirmationAction } from '@/components/ActionConfirmation';
import type { Community, PublicUser } from '@/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function DirectGroups({ groups, users, currentUserId, onSelect, activeGroupId, voiceState }: { activeGroupId?: string | null; voiceState: Record<string, string[]>; groups: Community[]; users: PublicUser[]; currentUserId: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  return <section className="space-y-1 pb-3 border-b border-border mb-3">
    <div className="flex items-center justify-between px-2"><h3 className="text-xs font-semibold">Grupos</h3><Button size="icon" variant="ghost" className="size-7" aria-label="Criar grupo" onClick={() => { setOpen(true); setError(''); }}><Plus className="size-3.5" /></Button></div>
    {groups.map((group) => <div key={group.id} className={`flex items-center rounded-2xl border transition-colors ${activeGroupId === group.id ? 'border-border bg-secondary' : 'border-transparent hover:bg-secondary/60'}`}><button type="button" onClick={() => onSelect(group.id)} className="flex-1 min-w-0 flex items-center gap-2 p-2 text-left"><span className="grid size-10 shrink-0 grid-cols-2 gap-0.5 rounded-xl bg-card p-1 overflow-hidden" aria-hidden="true">{group.members.slice(0,4).map((id) => {const user=users.find((u)=>u.id===id);return <span key={id} className="grid place-items-center rounded-md bg-secondary overflow-hidden text-[8px]">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : user?.displayName.slice(0,1).toUpperCase() || 'T'}</span>;})}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{group.name}</span><span className="block mt-1 text-[10px] text-muted-foreground">{(voiceState[group.channels.find((c)=>c.type==='voice')?.id||''] || []).length ? `${(voiceState[group.channels.find((c)=>c.type==='voice')?.id||''] || []).length} na chamada` : `${group.members.length} pessoas`}</span></span></button><DropdownMenu><DropdownMenuTrigger asChild><button aria-label={`Opções do grupo ${group.name}`} className="p-2 rounded-lg hover:bg-secondary"><MoreHorizontal className="size-3.5" /></button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem className="text-destructive" onSelect={() => setConfirmation({ title: group.ownerId === currentUserId ? `Eliminar ${group.name}?` : `Sair de ${group.name}?`, description: group.ownerId === currentUserId ? 'O grupo e as suas mensagens serão removidos para todos.' : 'Deixas de receber mensagens e de ter acesso às chamadas deste grupo.', execute: async () => { if (group.ownerId === currentUserId) await api.deleteCommunityConfirmed(group.id); else await api.leaveCommunityConfirmed(group.id); } })}>{group.ownerId === currentUserId ? 'Eliminar grupo' : 'Sair do grupo'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}
    <ActionConfirmation action={confirmation} onClose={() => setConfirmation(null)} />
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>Criar grupo privado</DialogTitle><DialogDescription>Escolhe as pessoas que queres para conversar e fazer chamadas contigo.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { const result = await api.createGroup(name.trim(), selected); setOpen(false); setName(''); setSelected([]); onSelect(result.community.id); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar o grupo.'); } finally { setBusy(false); } }}>
        <Input aria-label="Nome do grupo" placeholder="Nome do grupo" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required disabled={busy} />
        <Input aria-label="Pesquisar pessoas para o grupo" placeholder="Pesquisar nome ou @utilizador" value={search} onChange={(e)=>setSearch(e.target.value)} /><p className="text-xs text-muted-foreground">{selected.length} pessoas selecionadas</p><div className="max-h-64 overflow-y-auto space-y-1">{users.filter((user)=>`${user.displayName} ${user.username}`.toLowerCase().includes(search.replace(/^@/,'').toLowerCase())).map((user) => <label key={user.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-secondary cursor-pointer"><input type="checkbox" checked={selected.includes(user.id)} disabled={busy || (!selected.includes(user.id) && selected.length >= 49)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, user.id] : previous.filter((id) => id !== user.id))} className="accent-primary" /><span className="text-sm">{user.displayName}<span className="ml-2 text-xs text-muted-foreground">@{user.username}</span></span></label>)}{!users.length && <p className="text-sm text-muted-foreground">Adiciona contactos ou conhece pessoas num servidor para criar um grupo.</p>}</div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" className="w-full" disabled={busy || selected.length < 2 || !name.trim()}>{busy ? 'A criar…' : `Criar grupo — ${selected.length + 1} pessoas`}</Button>
      </form></DialogContent></Dialog>
  </section>;
}





