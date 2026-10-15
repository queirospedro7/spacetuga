export interface NotificationTarget { peerId?: string; communityId?: string; channelId?: string }
const native = '__TAURI_INTERNALS__' in window;
export const notificationsEnabled = () => localStorage.getItem('tuga.notifications') !== 'false';
export function setNotificationsEnabled(value: boolean) { localStorage.setItem('tuga.notifications', String(value)); }
export async function requestNotificationPermission() {
  let granted = false;
  if (native) {
    const plugin = await import('@tauri-apps/plugin-notification');
    granted = await plugin.isPermissionGranted() || await plugin.requestPermission() === 'granted';
  } else if ('Notification' in window) granted = await Notification.requestPermission() === 'granted';
  if (granted) setNotificationsEnabled(true);
  return granted;
}
function navigate(target: NotificationTarget) { window.focus(); window.dispatchEvent(new CustomEvent('tuga:notification-open', { detail: target })); }
export async function listenNotificationActions() {
  if (!native) return () => {};
  const plugin = await import('@tauri-apps/plugin-notification');
  const listener = await plugin.onAction((event) => navigate(event.notification?.extra || {}));
  return () => { void listener.unregister(); };
}
export async function notifyIncoming(kind: 'message' | 'call', target: NotificationTarget) {
  if (!notificationsEnabled() || (document.visibilityState === 'visible' && document.hasFocus())) return;
  const title = kind === 'call' ? 'Chamada recebida — Tuga' : 'Nova mensagem — Tuga';
  // Keep conversation content out of desktop lock-screen previews.
  const body = kind === 'call' ? 'Abre o Tuga para atender.' : 'Abre o Tuga para ler a mensagem.';
  try {
    if (native) {
      const plugin = await import('@tauri-apps/plugin-notification');
      if (await plugin.isPermissionGranted()) plugin.sendNotification({ title, body, extra: { ...target } });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, { body, tag: `tuga-${kind}-${target.peerId || target.channelId}`, icon: '/tuga-icon.png', silent: true });
      notification.onclick = () => { navigate(target); notification.close(); };
    }
  } catch { /* A denied system notification never interrupts the conversation. */ }
}


