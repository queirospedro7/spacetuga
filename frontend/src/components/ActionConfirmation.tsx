import { useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
export interface ConfirmationAction { title: string; description: string; confirmLabel?: string; destructive?: boolean; execute: () => Promise<boolean | void> }
export function ActionConfirmation({ action, onClose }: { action: ConfirmationAction | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <AlertDialog open={!!action} onOpenChange={(open) => { if (!open && !busy) { setError(''); onClose(); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{action?.title}</AlertDialogTitle><AlertDialogDescription>{action?.description}</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><Button disabled={busy} variant={action?.destructive === false ? 'default' : 'destructive'} onClick={async () => { if (!action || busy) return; setBusy(true); setError(''); try { if (await action.execute() !== false) onClose(); } catch { setError('Não foi possível concluir. Tenta novamente.'); } finally { setBusy(false); } }}>{busy ? 'A confirmar…' : action?.confirmLabel || 'Confirmar'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}



