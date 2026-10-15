import { Emitter } from "./emitter";
import type { Attachment, Conversation, Message, MyProfile, PublicUser, SignalData, Community, ChannelMessage, CommunityRolePermissions } from "@/types";

function getBackendUrl(): URL {
  const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const WS_HOST = IS_TAURI ? 'localhost' : (typeof location !== 'undefined' ? location.hostname : 'localhost');
  const HTTP_PROTOCOL = typeof location !== 'undefined' && location.protocol === 'https:' && !IS_TAURI ? 'https:' : 'http:';
  const desktopBackend = typeof window !== 'undefined' ? (window as Window & { __TUGA_DESKTOP_API__?: string }).__TUGA_DESKTOP_API__ : undefined;
  const customServer = typeof localStorage !== 'undefined' ? (localStorage.getItem('tuga.custom_server') || localStorage.getItem('tuga.server_url')) : null;
  const raw = customServer || import.meta.env.VITE_TUGA_API_URL || desktopBackend || `${HTTP_PROTOCOL}//${WS_HOST}:8787`;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('VITE_TUGA_API_URL deve ser um endereço HTTP ou HTTPS sem credenciais.');
  }
  return url;
}

export const getHttpUrl = () => getBackendUrl().origin;
export const getWsUrl = () => {
  const url = getBackendUrl();
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
};
const TOKEN_KEY = "tuga.jwt";
const LEGACY_TOKEN_KEYS = ["veya.jwt", "nebula.token"];

interface Events extends Record<string, unknown> {
  'friends:update': { friends: PublicUser[]; incoming: PublicUser[]; outgoing: PublicUser[]; requestId?: string };
  'user:search:result': { users: PublicUser[]; query: string; requestId?: string };
  'users:add': { users: PublicUser[] };
  ready: {
    profile: MyProfile;
    users: PublicUser[];
    conversations: Conversation[];
    communities?: Community[];
    publicCommunities?: Community[];
    channelMessages?: ChannelMessage[];
    voiceState?: Record<string, string[]>;
    blockedUsers?: PublicUser[];
  };
  users: { users: PublicUser[] };
  "blocks:update": { users: PublicUser[] };
  msg: { msg: Message; requestId?: string };
  "reaction:update": { scope: 'dm' | 'channel'; msg: Message | ChannelMessage };
  "poll:update": { scope: 'dm' | 'channel'; msg: Message | ChannelMessage };
  profile: { profile: MyProfile; requestId?: string };
  'account:password:changed': { token: string };
  typing: { from: string };
  "call:invite": { from: string; kind: "voice" | "video"; user?: PublicUser };
  "call:accept": { from: string };
  "call:reject": { from: string };
  "call:hangup": { from: string };
  "call:busy": { peerId: string };
  "call:offline": { peerId: string };
  "call:timeout": { peerId: string };
  signal: { from: string; data: SignalData };
  "community:created": { community: Community };
  "community:joined": {
    community: Community;
    communities: Community[];
    channelMessages?: ChannelMessage[];
  };
  "community:update": { community: Community; requestId?: string };
  "community:saved": { communityId: string; requestId: string };
  "community:deleted": { communityId: string };
  "community:kicked": { communityId: string };
  "community:left": { communityId: string; requestId?: string };
  "community:member:added": { communityId: string; username: string; displayName: string; requestId?: string };
  "admin:user:role:updated": { userId: string; globalRole?: 'admin' };
  'admin:user:status:updated': { userId: string; status: 'active' | 'restricted' | 'suspended' };
  'admin:community:status:updated': { communityId: string; suspended: boolean };
  "communities:update": { communities: Community[] };
  "community:public:list": { communities: Community[] };
  "community:msg": { msg: ChannelMessage; requestId?: string };
  "voice:state": { voiceState: Record<string, string[]> };
  "voice:signal": { from: string; channelId: string; data: SignalData };
  "voice:kicked": { channelId: string; by: string };
  "voice:muted": { channelId: string; by: string; muted: boolean };
  "voice:moderation:confirmed": { channelId: string; userId: string; muted: boolean; requestId: string };
  "dm:read:update": { peerId: string; messageIds: string[]; readAt: number };
  "msg:delete": { scope: 'dm' | 'channel'; messageId: string; channelId?: string; requestId?: string };
  err: { code: string; requestId?: string };
  connected: Record<string, never>;
  disconnected: Record<string, never>;
}

class Api extends Emitter<Events> {
  ws: WebSocket | null = null;
  private queue: string[] = [];
  private reconnectDelay = 1000;
  private manualClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  get isSocketOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get token(): string | null {
    const current = localStorage.getItem(TOKEN_KEY);
    if (current) return current;
    for (const key of LEGACY_TOKEN_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) { localStorage.setItem(TOKEN_KEY, legacy); localStorage.removeItem(key); return legacy; }
    }
    return null;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.manualClose = false;
    const ws = new WebSocket(getWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectDelay = 1000;
      const token = this.token;
      if (token) this.send("session", { token });
      else this.emit("connected", {});
      this.queue.forEach((q) => ws.send(q));
      this.queue = [];
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let m: { t: keyof Events } & Record<string, unknown>;
      try {
        m = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      const { t, ...data } = m;
      if (t === "auth") {
        const { token } = data as unknown as { token: string };
        localStorage.setItem(TOKEN_KEY, token);
        LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
        this.send("session", { token });
        return;
      }
      if (t === 'account:password:changed') localStorage.setItem(TOKEN_KEY, String(data.token));
      if (t === "err" && ['session', 'account_suspended'].includes(String(data.code))) {
        localStorage.removeItem(TOKEN_KEY);
        LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
      }
      (this.emit as (e: unknown, d: unknown) => void)(t, data);
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.emit("disconnected", {});
      if (event.code === 4001) {
        this.disconnect();
        this.emit('err', { code: 'session_replaced' });
        return;
      }
      if (!this.manualClose) {
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; if (!this.manualClose) this.connect(); }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
      }
    };
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.queue = [];
    localStorage.removeItem(TOKEN_KEY);
    LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
    this.ws?.close();
    this.ws = null;
    this.emit('disconnected', {});
  }

  send(t: string, data: Record<string, unknown> = {}): void {
    const payload = JSON.stringify({ t, ...data });
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(payload);
    else {
      if (this.queue.length >= 100) { this.emit('err', { code: 'queue_full', requestId: typeof data.requestId === 'string' ? data.requestId : undefined }); return; }
      this.queue.push(payload);
      this.connect();
    }
  }

  cancelPendingAuth(): void {
    this.queue = this.queue.filter((payload) => {
      try {
        const type = (JSON.parse(payload) as { t?: string }).t;
        return type !== 'login' && type !== 'register';
      } catch {
        return true;
      }
    });
  }

  // ---- helpers semânticos ----
  register(username: string, displayName: string, password: string) {
    this.send("register", { username, displayName, password });
  }
  login(username: string, password: string) {
    this.send("login", { username, password });
  }
  logout() {
    this.disconnect();
  }
  sendMessage(to: string, text: string) {
    this.send("msg", { to, text });
  }
  sendMessageConfirmed(to: string, text: string) {
    const content = text.trim().slice(0, 4000);
    return this.requestConfirmed('msg', { to, text: content }, 'msg', ({ msg, requestId }, expected) => requestId === expected && msg.to === to && msg.text === content);
  }
  sendChannelMessageConfirmed(communityId: string, channelId: string, text: string) {
    const content = text.trim().slice(0, 4000);
    return this.requestConfirmed('community:msg', { communityId, channelId, text: content }, 'community:msg', ({ msg, requestId }, expected) => requestId === expected && msg.channelId === channelId && msg.text === content);
  }
  toggleReaction(scope: 'dm' | 'channel', messageId: string, emoji: string) {
    this.send('reaction:toggle', { scope, messageId, emoji });
  }
  loadFriends() { this.send('friends:list', {}); }
  friendAction(action: 'request' | 'respond' | 'remove', data: { username?: string; userId?: string; accept?: boolean }) { return this.requestConfirmed(`friend:${action}`, data, 'friends:update', (event, id) => event.requestId === id); }  blockUser(userId: string, blocked: boolean) {
    this.send('user:block', { userId, blocked });
  }
  blockUserConfirmed(userId: string, blocked: boolean) {
    return this.requestConfirmed('user:block', { userId, blocked }, 'blocks:update', ({ users }) => users.some((user) => user.id === userId) === blocked);
  }
  deleteCommunityConfirmed(communityId: string) {
    return this.requestConfirmed('community:delete', { communityId }, 'community:deleted', (event) => event.communityId === communityId);
  }
  leaveCommunityConfirmed(communityId: string) {
    return this.requestConfirmed('community:leave', { communityId }, 'community:left', (event, requestId) => event.communityId === communityId && event.requestId === requestId);
  }
  createPoll(scope: 'dm' | 'channel', destinationId: string, question: string, options: string[], channelId?: string) {
    this.send('poll:create', { scope, destinationId, question, options, channelId });
  }
  createPollConfirmed(scope: 'dm' | 'channel', destinationId: string, question: string, options: string[], channelId?: string) {
    return this.requestConfirmed('poll:create', { scope, destinationId, question, options, channelId }, scope === 'dm' ? 'msg' : 'community:msg', (event, expected) => event.requestId === expected && !!event.msg.poll);
  }
  votePoll(scope: 'dm' | 'channel', messageId: string, option: number) {
    this.send('poll:vote', { scope, messageId, option });
  }
  sendTyping(to: string) {
    this.send("typing", { to });
  }
  updateProfile(patch: Partial<MyProfile>) {
    this.send("profile", { patch });
  }
  private searchCache = new Map<string, { time: number; users: PublicUser[] }>();

  addKnownUsers(newUsers: PublicUser[]) {
    if (!newUsers || !newUsers.length) return;
    this.emit('users:add', { users: newUsers });
  }

  async searchUsers(query: string): Promise<PublicUser[]> {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (!q) return [];
    const cached = this.searchCache.get(q);
    if (cached && Date.now() - cached.time < 30_000) {
      return cached.users;
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          offResult();
          resolve(cached?.users || []);
        }
      }, 2500);

      const offResult = this.on('user:search:result', (event) => {
        if (event.requestId === requestId || event.query === q) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            offResult();
            this.searchCache.set(q, { time: Date.now(), users: event.users });
            if (this.searchCache.size > 200) {
              const oldestKey = this.searchCache.keys().next().value;
              if (oldestKey) this.searchCache.delete(oldestKey);
            }
            resolve(event.users);
          }
        }
      });

      this.send('user:search', { query: q, requestId });
    });
  }
  private requestConfirmed<K extends keyof Events>(type: string, data: Record<string, unknown>, event: K, accept?: (value: Events[K], requestId: string) => boolean): Promise<Events[K]> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer); offSuccess(); offError(); offDisconnect();
        this.queue = this.queue.filter((payload) => { try { return JSON.parse(payload).requestId !== requestId; } catch { return false; } });
      };
      const offSuccess = this.on(event, (value) => { if (accept && !accept(value, requestId)) return; cleanup(); resolve(value); });
      const offError = this.on('err', ({ code, requestId: failedId }) => {
        if (failedId && failedId !== requestId) return;
        cleanup();
        const messages: Record<string, string> = { already_friend: 'Esta pessoa já está na tua lista de amigos.', already_requested: 'Já enviaste um pedido de amizade a esta pessoa.', cannot_friend_self: 'Não podes adicionar-te a ti próprio como amigo.', request_not_found: 'O pedido de amizade já não se encontra disponível.', user_not_found: 'Não encontrámos esse utilizador.', owner_must_transfer: 'O criador precisa de transferir a propriedade ou eliminar o servidor.', group_full: 'Este grupo já tem 50 participantes.', invalid_image: 'A imagem não é válida. Usa PNG, JPEG, WebP, GIF ou uma ligação HTTPS.', member_permission: 'Não tens permissão para esta alteração.', user_blocked: 'Esta conversa não está disponível.', rate_limit: 'Aguarda um momento e tenta novamente.', session: 'A sessão expirou. Inicia sessão novamente.', account_restricted: 'A tua conta não pode executar esta ação.', file_not_found: 'O ficheiro já não está disponível.' };
        reject(Object.assign(new Error(messages[code] || 'Não foi possível concluir o pedido. Tenta novamente.'), { code }));
      });
      const offDisconnect = this.on('disconnected', () => { cleanup(); reject(new Error('Ligação interrompida. Tenta novamente.')); });
      const timer = setTimeout(() => { cleanup(); reject(new Error('O servidor não confirmou a alteração. Tenta novamente.')); }, 10000);
      this.send(type, { ...data, requestId });
    });
  }
  saveProfile(patch: Partial<MyProfile>) {
    return this.requestConfirmed('profile', { patch }, 'profile', (value, requestId) => value.requestId === requestId);
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.requestConfirmed('account:password', { currentPassword, newPassword }, 'account:password:changed');
  }
  call(to: string, kind: "voice" | "video") {
    this.send("call:invite", { to, kind });
  }
  accept(to: string) {
    this.send("call:accept", { to });
  }
  reject(to: string) {
    this.send("call:reject", { to });
  }
  hangup(to: string) {
    this.send("call:hangup", { to });
  }
  signal(to: string, data: SignalData) {
    this.send("signal", { to, data });
  }

  // ---- Comunidades & Canais (Discord) ----
  createCommunity(name: string, isPublic: boolean, icon?: string, description?: string) {
    this.send("community:create", { name, isPublic, icon, description });
  }
  createGroup(name: string, memberIds: string[]) {
    return this.requestConfirmed('community:create', { name, directGroup: true, memberIds, isPublic: false }, 'community:created', (event, requestId) => !!event.community.directGroup && (event as typeof event & { requestId?: string }).requestId === requestId);
  }
  joinCommunity(code: string) {
    this.send("community:join", { code });
  }
  joinCommunityConfirmed(code: string, communityId: string) {
    return this.requestConfirmed('community:join', { code }, 'community:joined', ({ community }) => community.id === communityId);
  }
  requestPublicCommunities() {
    this.send("community:public:list", {});
  }
  addCommunityMember(communityId: string, username: string) {
    this.send("community:member:add", { communityId, username });
  }
  addCommunityMemberConfirmed(communityId: string, username: string) {
    return this.requestConfirmed('community:member:add', { communityId, username }, 'community:member:added', (event, requestId) => event.requestId === requestId && event.communityId === communityId);
  }
  reorderCommunityConfirmed(communityId: string, channels: { id: string; categoryId?: string }[]) {
    return this.confirmCommunityChange('community:structure:reorder', communityId, { channels }, (community) => channels.every((channel, index) => community.channels[index]?.id === channel.id && (community.channels[index]?.categoryId || '') === (channel.categoryId || '')));
  }
  setGlobalAdmin(userId: string, enabled: boolean) {
    this.send('admin:user:role', { userId, role: enabled ? 'admin' : null });
  }
  setGlobalAdminConfirmed(userId: string, enabled: boolean) {
    return this.requestConfirmed('admin:user:role', { userId, role: enabled ? 'admin' : null }, 'admin:user:role:updated', (event) => event.userId === userId && (event.globalRole === 'admin') === enabled);
  }
  adminJoinCommunityConfirmed(communityId: string) {
    return this.requestConfirmed('admin:community:join', { communityId }, 'community:joined', ({ community }) => community.id === communityId);
  }
  markConversationRead(peerId: string, throughAt: number) {
    this.send('dm:read', { peerId, throughAt });
  }
  setAccountStatus(userId: string, status: 'active' | 'suspended' | 'restricted', reason?: string) {
    this.send('admin:user:status', { userId, status, reason });
  }
  setAccountStatusConfirmed(userId: string, status: 'active' | 'suspended' | 'restricted') {
    return this.requestConfirmed('admin:user:status', { userId, status }, 'admin:user:status:updated', (event) => event.userId === userId);
  }
  setCommunitySuspensionConfirmed(communityId: string, suspended: boolean) {
    return this.requestConfirmed('admin:community:suspend', { communityId, suspended }, 'admin:community:status:updated', (event) => event.communityId === communityId);
  }
  setCommunitySuspension(communityId: string, suspended: boolean, reason?: string) {
    this.send('admin:community:suspend', { communityId, suspended, reason });
  }
  adminJoinCommunity(communityId: string) {
    this.send('admin:community:join', { communityId });
  }
  setCommunityAdmin(communityId: string, userId: string, enabled: boolean) {
    this.send('community:admin:set', { communityId, userId, enabled });
  }
  updateCommunity(
    communityId: string,
    patch: {
      name?: string;
      icon?: string;
      bannerUrl?: string;
      bannerPosition?: number;
      bannerColor?: string;
      description?: string;
      isPublic?: boolean;
      defaultRoleId?: string | null;
      allowMemberInvites?: boolean;
    }
  ) {
    const requestId = crypto.randomUUID();
    this.send("community:update", { communityId, requestId, ...patch });
    return requestId;
  }
  confirmCommunityChange(type: string, communityId: string, patch: Record<string, unknown>, accept: (community: Community) => boolean) {
    return this.requestConfirmed(type, { communityId, ...patch }, 'community:update', ({ community, requestId }, expectedId) => requestId === expectedId && community.id === communityId && accept(community));
  }
  deleteCommunity(communityId: string) {
    this.send("community:delete", { communityId });
  }
  createChannel(communityId: string, name: string, type: "text" | "voice" | "announcement", categoryId?: string) {
    this.send("community:channel:create", { communityId, name, type, categoryId });
  }
  updateChannel(communityId: string, channelId: string, patch: { name?: string; type?: 'text' | 'voice' | 'announcement'; categoryId?: string | null }) {
    this.send("community:channel:update", { communityId, channelId, ...patch });
  }
  deleteChannel(communityId: string, channelId: string) {
    this.send("community:channel:delete", { communityId, channelId });
  }
  createCategory(communityId: string, name: string) {
    this.send("community:category:create", { communityId, name });
  }
  updateCategory(communityId: string, categoryId: string, name: string) {
    this.send("community:category:update", { communityId, categoryId, name });
  }
  deleteCategory(communityId: string, categoryId: string) {
    this.send("community:category:delete", { communityId, categoryId });
  }
  reorderCommunityStructure(communityId: string, channels?: { id: string; categoryId?: string }[], categories?: { id: string; name?: string }[]) {
    this.send("community:structure:reorder", { communityId, channels, categories });
  }
  kickCommunityMember(communityId: string, userId: string) {
    this.send("community:member:kick", { communityId, userId });
  }
  createCommunityRole(communityId: string, name: string, color?: string, permissions?: CommunityRolePermissions) {
    this.send("community:role:create", { communityId, name, color, permissions });
  }
  updateCommunityRole(communityId: string, roleId: string, patch: { name?: string; color?: string; permissions?: CommunityRolePermissions }) {
    this.send("community:role:update", { communityId, roleId, ...patch });
  }
  deleteCommunityRole(communityId: string, roleId: string) {
    this.send("community:role:delete", { communityId, roleId });
  }
  setCommunityMemberRoles(communityId: string, userId: string, roleIds: string[]) {
    this.send("community:member:roles:set", { communityId, userId, roleIds });
  }
  setChannelAccess(communityId: string, channelId: string, userId: string, allowed: boolean) {
    this.send("community:channel:access", { communityId, channelId, userId, allowed });
  }
  sendChannelMessage(communityId: string, channelId: string, text: string) {
    this.send("community:msg", { communityId, channelId, text });
  }
  deleteMessage(scope: 'dm' | 'channel', messageId: string) {
    this.send("msg:delete", { scope, messageId });
  }
  deleteMessageConfirmed(scope: 'dm' | 'channel', messageId: string) {
    return this.requestConfirmed('msg:delete', { scope, messageId }, 'msg:delete', (event, requestId) => event.requestId === requestId && event.messageId === messageId && event.scope === scope);
  }
  shareFile(fileId: string, text?: string) {
    this.send("file:share", { fileId, text });
  }
  shareFileConfirmed(fileId: string, scope: 'dm' | 'channel', text?: string) {
    return this.requestConfirmed('file:share', { fileId, text }, scope === 'dm' ? 'msg' : 'community:msg', ({ msg, requestId }, expected) => requestId === expected && msg.attachment?.id === fileId);
  }
  getFileUrl(fileId: string): string {
    return `${getHttpUrl()}/api/uploads/${encodeURIComponent(fileId)}`;
  }
  async uploadFile(file: File, target: { type: 'dm' | 'channel'; id: string; channelId?: string }): Promise<Attachment> {
    const token = this.token;
    if (!token) throw new Error('A sessão expirou. Inicia sessão novamente.');
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
      'x-file-type': file.type || 'application/octet-stream',
      'x-target-type': target.type,
      'x-target-id': target.id,
    };
    if (target.channelId) headers['x-channel-id'] = target.channelId;
    const response = await fetch(`${getHttpUrl()}/api/uploads`, { method: 'POST', headers, body: file, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error === 'file_size' ? 'O ficheiro excede o limite de 50 MB.' : result.error === 'target_forbidden' ? 'Não tens permissão para enviar ficheiros neste canal.' : 'Não foi possível enviar o ficheiro.');
    }
    return (await response.json() as { attachment: Attachment }).attachment;
  }
  async downloadFile(id: string, signal?: AbortSignal): Promise<Blob> {
    const token = this.token;
    if (!token) throw new Error('A sessão expirou. Inicia sessão novamente.');
    const response = await fetch(`${getHttpUrl()}/api/uploads/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error('Não foi possível transferir este ficheiro.');
    return response.blob();
  }
  async getRtcConfig(): Promise<RTCConfiguration> {
    const token = this.token;
    if (!token) throw new Error('A sessão expirou.');
    const response = await fetch(`${getHttpUrl()}/api/rtc-config`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Não foi possível obter as definições de ligação.');
    const result = await response.json() as { iceServers: RTCIceServer[] };
    return { iceServers: result.iceServers };
  }

  // ---- Voz em Comunidades ----
  joinVoiceChannel(channelId: string) {
    this.send("voice:join", { channelId });
  }
  leaveVoiceChannel() {
    this.send("voice:leave", {});
  }
  sendVoiceSignal(channelId: string, to: string, data: SignalData) {
    this.send("voice:signal", { channelId, to, data });
  }
  kickVoiceUser(channelId: string, userId: string) {
    this.send("voice:user:kick", { channelId, userId });
  }
  kickVoiceUserConfirmed(channelId: string, userId: string) {
    return this.requestConfirmed('voice:user:kick', { channelId, userId }, 'voice:state', ({ voiceState }) => !voiceState[channelId]?.includes(userId));
  }
  muteVoiceUser(channelId: string, userId: string, muted: boolean = true) {
    this.send("voice:user:mute", { channelId, userId, muted });
  }
  muteVoiceUserConfirmed(channelId: string, userId: string, muted = true) {
    return this.requestConfirmed('voice:user:mute', { channelId, userId, muted }, 'voice:moderation:confirmed', (event, requestId) => event.requestId === requestId && event.channelId === channelId && event.userId === userId && event.muted === muted);
  }
}

export const api = new Api();




