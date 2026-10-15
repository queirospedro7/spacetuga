import { MascotFace } from '@/components/MascotFace';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AtSign, Eye, EyeOff, ArrowRight, LoaderCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeSelector } from '@/components/ThemeSelector';
import { BrandMark } from '@/components/BrandMark';
import '@/styles/auth.css';

const ERR_MAP: Record<string, string> = {
  username: 'Usa entre 3 e 20 caracteres: letras, números, pontos ou underscores.',
  password: 'A palavra-passe deve ter entre 10 e 128 caracteres.',
  taken: 'Este nome de utilizador já está registado. Escolhe outro.',
  credentials: 'O nome de utilizador ou a palavra-passe estão incorretos.',
  session: 'A sessão expirou. Inicia sessão novamente.',
  rate_limit: 'Demasiadas tentativas. Aguarda um minuto e tenta novamente.',
};
type AuthTab = 'login' | 'register';

export function AuthForm() {
  const [tab, setTab] = useState<AuthTab>('login');
  const [loading, setLoading] = useState(false);
  const [serverConnected, setServerConnected] = useState(api.isSocketOpen);
  const [error, setError] = useState<string | null>(null);
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [focusedField, setFocusedField] = useState('');
  const [mascotLook,setMascotLook]=useState({x:0,y:0,lean:0});
  function focusMascot(target:HTMLElement){
    setFocusedField(target.getAttribute('name') || 'control');
    const mascot=document.querySelector('.auth-mascot')?.getBoundingClientRect();if(!mascot)return;
    const field=target.getBoundingClientRect();const dx=field.left+field.width/2-mascot.left-mascot.width/2;const dy=field.top+field.height/2-mascot.top-mascot.height/2;const distance=Math.max(100,Math.hypot(dx,dy));
    setMascotLook({x:dx/distance*5,y:dy/distance*5,lean:Math.max(-8,Math.min(8,dx/22))});
  }
  const [drafts, setDrafts] = useState({ login: { username: '', password: '' }, register: { username: '', password: '', displayName: '' } });
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();
  const registering = tab === 'register';

  function clearRequestTimer() {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    requestTimer.current = null;
  }

  useEffect(() => {
    const unsubErr = api.on('err', ({ code }) => {
      clearRequestTimer();
      setError(ERR_MAP[code] ?? 'Não foi possível continuar. Tenta novamente.');
      setLoading(false);
    });
    const unsubReady = api.on('ready', () => { clearRequestTimer(); setLoading(false); });
    const unsubConnected = api.on('connected', () => setServerConnected(true));
    const unsubDisconnected = api.on('disconnected', () => setServerConnected(false));
    return () => { clearRequestTimer(); unsubErr(); unsubReady(); unsubConnected(); unsubDisconnected(); };
  }, []);

  function selectTab(next: AuthTab) {
    if (loading) return;
    setTab(next);
    setVisiblePassword(false);
    setError(null);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || requestTimer.current) return;
    setError(null);
    const username = drafts[tab].username.trim().toLowerCase();
    const password = drafts[tab].password;
    if (!username || !password) { setError('Preenche o nome de utilizador e a palavra-passe.'); return; }
    if (registering && !/^[a-z0-9_.]{3,20}$/.test(username)) { setError(ERR_MAP.username); return; }
    if (registering && (password.length < 10 || password.length > 128)) { setError(ERR_MAP.password); return; }
    setLoading(true);
    requestTimer.current = setTimeout(() => {
      api.cancelPendingAuth();
      setLoading(false);
      requestTimer.current = null;
      setError('O servidor demorou a responder. Tenta novamente daqui a pouco.');
    }, 12000);
    if (registering) api.register(username, drafts.register.displayName.trim() || username, password);
    else api.login(username, password);
  }

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <div className="auth-brand"><BrandMark className="size-9" /><span>Tuga</span></div>
        <ThemeSelector />
      </header>
      <main className="auth-main">
        <motion.aside className="auth-story" initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="auth-story-eyebrow">O teu lugar no Tuga</p>
          <h2>Há conversas que merecem mais espaço.</h2>
          <p className="auth-story-description">Junta os teus amigos, cria o teu servidor e fica por perto. À tua maneira.</p>
          <div className="auth-scene" aria-hidden="true">
            <div className="auth-scene-window"><div className="auth-scene-header"><BrandMark className="size-7" /><span>O nosso espaço</span></div><div className="auth-scene-message">Já estamos por aqui.</div><div className="auth-scene-message reply">Estou a chegar!</div></div>
            <div className="auth-scene-call"><div className="auth-wave"><i /><i /><i /><i /></div><div><strong>A conversa continua</strong><small>Um lugar para estar juntos</small></div></div>
          </div>
        </motion.aside>
        <motion.section className="auth-card" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} aria-labelledby="auth-title">
          <div className="auth-mascot"><MascotFace animated look={mascotLook} mood={loading ? 'loading' : error ? 'error' : focusedField.startsWith('password') ? visiblePassword ? 'peek' : 'privacy' : focusedField ? 'typing' : registering ? 'greet' : 'idle'} activity={drafts[tab].username.length + drafts[tab].password.length + drafts.register.displayName.length} className="size-full" /></div>
          <div className="auth-heading">
            <h1 id="auth-title">{registering ? 'Cria o teu espaço.' : 'Olá de novo.'}</h1>
            <p>{registering ? 'Uma conta. Todas as tuas conversas.' : 'As tuas conversas estão à tua espera.'}</p>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Autenticação">
            {(['login', 'register'] as const).map((value) => (
              <button key={value} id={`auth-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls="auth-panel" tabIndex={tab === value ? 0 : -1} disabled={loading} onClick={() => selectTab(value)} onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : tab === 'login' ? 'register' : 'login';
                selectTab(next);
                document.getElementById(`auth-tab-${next}`)?.focus();
              }}>{value === 'login' ? 'Iniciar Sessão' : 'Criar Conta'}</button>
            ))}
          </div>
          <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${tab}`}>
            <motion.form key={tab} onSubmit={handleSubmit} className="auth-form" onInput={() => setError(null)} onInvalidCapture={() => setError('Confirma os campos assinalados para continuar.')} onFocus={(e) => focusMascot(e.target)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setFocusedField(''); setMascotLook({x:0,y:0,lean:0}); } }} aria-busy={loading} initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
              {registering && <div className="auth-field">
                <Label htmlFor="auth-name">Como te devemos chamar? <span className="auth-optional">Opcional</span></Label>
                <Input id="auth-name" name="displayName" placeholder="O teu nome" autoComplete="name" maxLength={32} disabled={loading} className="auth-input" value={drafts.register.displayName} onChange={(e) => setDrafts((d) => ({ ...d, register: { ...d.register, displayName: e.target.value } }))} />
              </div>}
              <div className="auth-field">
                <Label htmlFor="auth-username">Nome de utilizador</Label>
                <div className="auth-input-wrap">
                  <AtSign className="auth-input-icon" size={17} aria-hidden="true" />
                  <Input id="auth-username" name="username" placeholder="utilizador" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} required disabled={loading} className="auth-input auth-input-with-icon" value={drafts[tab].username} onChange={(e) => setDrafts((d) => ({ ...d, [tab]: { ...d[tab], username: e.target.value } }))} />
                </div>
                {registering && <p className="auth-hint">O nome que os teus amigos vão procurar.</p>}
              </div>
              <div className="auth-field">
                <Label htmlFor="auth-password">Palavra-passe</Label>
                <div className="auth-input-wrap">
                  <Input id="auth-password" name="password" type={visiblePassword ? 'text' : 'password'} placeholder={registering ? 'Pelo menos 10 caracteres' : 'A tua palavra-passe'} autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 10 : undefined} maxLength={128} required disabled={loading} className="auth-input auth-password" value={drafts[tab].password} onChange={(e) => setDrafts((d) => ({ ...d, [tab]: { ...d[tab], password: e.target.value } }))} />
                  <button type="button" name="password-toggle" className="auth-password-toggle" disabled={loading} aria-label={visiblePassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'} aria-pressed={visiblePassword} onClick={() => setVisiblePassword((v) => !v)}>{visiblePassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </div>
              {error && <p role="alert" className="auth-error">{error}</p>}
              <Button type="submit" disabled={loading} className="auth-submit">
                {loading ? <><LoaderCircle size={18} className="animate-spin" />{registering ? 'A criar conta…' : 'A verificar…'}</> : <>{registering ? 'Criar Conta' : 'Entrar no Tuga'}<ArrowRight size={18} aria-hidden="true" /></>}
              </Button>
            </motion.form>
          </div>
          <p className="auth-status" role="status">{loading ? 'Só um momento…' : !serverConnected ? 'A ligar ao servidor…' : registering ? 'O próximo passo é conhecer o Tuga.' : 'Bom ter-te por aqui.'}</p>
        </motion.section>
      </main>
      <footer className="auth-footer">Tuga<span aria-hidden="true">/</span>Mensagens, grupos e chamadas.</footer>
    </div>
  );
}








