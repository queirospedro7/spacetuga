import { useState } from 'react';
import { Search, LogOut, ChevronRight } from 'lucide-react';
import { settingsSections } from '@/lib/settings-sections';
import type { SettingsSection } from '@/sections/SettingsPage';
import { BrandMark } from '@/components/BrandMark';
import type { MyProfile } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function SettingsNavigation({ profile, active, onSelect, onLogout, onAdmin }: { profile: MyProfile; active: SettingsSection; onSelect: (section: SettingsSection) => void; onLogout: () => void; onAdmin?: () => void }) {
  const [search, setSearch] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const sections = settingsSections.filter((section) => (section.id !== 'admin' || !!profile.globalRole) && normalize(`${section.title} ${section.description}`).includes(normalize(search)));
  return <>
    <div className="settings-brand"><BrandMark className="size-9 rounded-xl" /><div><strong>Definições</strong><span>Tuga</span></div></div>
    <div className="settings-person"><div className="settings-person-avatar" style={{ backgroundColor: `hsl(${profile.hue}, 45%, 45%)` }}>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{profile.displayName}</strong><span>@{profile.username}</span></div></div>
    <label className="settings-search"><Search className="size-4" /><input aria-label="Pesquisar definições" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar definições" /></label>
    <nav aria-label="Secções das definições" className="settings-navigation">
      {['A tua conta', 'Preferências', 'Tuga'].map((group) => {
        const items = sections.filter((section) => section.group === group);
        return items.length ? <div className="settings-navigation-group" key={group}><p>{group}</p>{items.map(({ id, title, icon: Icon }) => <button key={id} type="button" aria-current={active === id ? 'page' : undefined} data-settings-tab={id} onClick={() => id === 'admin' && onAdmin ? onAdmin() : onSelect(id)}><Icon className="size-4" /><span>{title}</span>{active === id && <ChevronRight className="size-3.5 settings-navigation-arrow" />}</button>)}</div> : null;
      })}
      {!sections.length && <p className="settings-search-empty">Nenhuma secção encontrada.</p>}
    </nav>
    <button type="button" className="settings-logout" onClick={() => setLogoutOpen(true)}><LogOut className="size-4" />Terminar sessão</button>

    <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Tens a certeza que queres terminar sessão?</AlertDialogTitle>
          <AlertDialogDescription>
            Vais perder a sessão atual e terás de iniciar sessão novamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onLogout}
          >
            Terminar sessão
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
