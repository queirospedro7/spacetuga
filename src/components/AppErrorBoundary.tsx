import { Component, type ReactNode } from 'react';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('[Tuga] Não foi possível apresentar a interface.', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><section role="alert" className="max-w-sm text-center space-y-4"><h1 className="text-xl font-semibold">Vamos voltar ao Tuga</h1><p className="text-sm text-muted-foreground">Ocorreu um problema ao mostrar esta página. Reabre a aplicação para continuar.</p><button type="button" onClick={() => location.reload()} className="rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm">Reabrir o Tuga</button></section></main>;
  }
}
