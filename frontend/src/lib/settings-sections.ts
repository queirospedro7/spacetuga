import { User, ShieldCheck, Palette, Mic, Bell, Lock, Keyboard, Download, Info, ShieldAlert } from 'lucide-react';
export const settingsSections = [
  { id: 'profile', title: 'Perfil', description: 'A tua identidade, foto e presença no Tuga.', group: 'A tua conta', icon: User },
  { id: 'account', title: 'Conta e segurança', description: 'Dados da conta, palavra-passe e acesso.', group: 'A tua conta', icon: ShieldCheck },
  { id: 'privacy', title: 'Privacidade', description: 'Escolhe quem pode contactar-te e gere os bloqueios.', group: 'A tua conta', icon: Lock },
  { id: 'appearance', title: 'Aparência', description: 'Tema, cor de destaque, tipografia e disposição.', group: 'Preferências', icon: Palette },
  { id: 'voice', title: 'Voz e áudio', description: 'Microfone, volume, ruído e som das partilhas.', group: 'Preferências', icon: Mic },
  { id: 'notifications', title: 'Notificações e sons', description: 'Define os avisos e os sons que queres receber.', group: 'Preferências', icon: Bell },
  { id: 'shortcuts', title: 'Atalhos', description: 'Navega e controla as chamadas com o teclado.', group: 'Preferências', icon: Keyboard },
  { id: 'downloads', title: 'Aplicação', description: 'Instala o Tuga ou continua no navegador.', group: 'Tuga', icon: Download },
  { id: 'about', title: 'Sobre o Tuga', description: 'Informações sobre a aplicação.', group: 'Tuga', icon: Info },
  { id: 'admin', title: 'Administração', description: 'Gestão da plataforma e dos seus utilizadores.', group: 'Tuga', icon: ShieldAlert },
] as const;

