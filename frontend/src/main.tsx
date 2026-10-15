import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { lightweightMode } from './lib/performance-settings';
import { AppErrorBoundary } from './components/AppErrorBoundary';

document.documentElement.classList.toggle('tuga-lightweight', lightweightMode());
const updateVisibility = () => document.documentElement.classList.toggle('tuga-background', document.visibilityState === 'hidden');
document.addEventListener('visibilitychange', updateVisibility);
updateVisibility();

if ('serviceWorker' in navigator && import.meta.env.PROD && !('__TAURI_INTERNALS__' in window)) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}

const root = createRoot(document.getElementById('root')!);
root.render(<div role="status" className="min-h-screen grid place-items-center bg-background text-foreground"><div className="flex flex-col items-center gap-4"><div className="size-8 rounded-full border-2 border-current border-t-transparent animate-spin opacity-60" /><span className="text-sm">A preparar o Tuga…</span></div></div>);

async function startApp() {
  if ('__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    (window as Window & { __TUGA_DESKTOP_API__?: string }).__TUGA_DESKTOP_API__ = await invoke<string>('desktop_backend_url');
  }
  const { default: App } = await import('./App.tsx');
  root.render(<StrictMode><AppErrorBoundary><BrowserRouter><App /></BrowserRouter></AppErrorBoundary></StrictMode>);
}
void startApp().catch(() => {
  root.render(<main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><div className="max-w-sm text-center space-y-4"><h1 className="text-xl font-semibold">Não foi possível abrir o Tuga</h1><p className="text-sm text-muted-foreground">Verifica a ligação e volta a tentar. Se o problema continuar na aplicação, fecha e abre o Tuga novamente.</p><button type="button" onClick={() => location.reload()} className="rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm">Tentar novamente</button></div></main>);
});
