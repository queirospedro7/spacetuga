// Tuga — Servidor de sinalização WebRTC + comunidades + mensagens (WebSocket)
import { WebSocketServer } from "ws";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.TUGA_DATA_FILE || process.env.VEYA_DATA_FILE || process.env.NEBULA_DATA_FILE || path.join(__dirname, "data.json");
const PORT = process.env.PORT || process.env.TUGA_PORT || process.env.VEYA_PORT || process.env.NEBULA_PORT || 8787;
const HOST = process.env.TUGA_HOST || process.env.VEYA_HOST || process.env.NEBULA_HOST || "0.0.0.0";
const UPLOAD_DIR = `${DATA_FILE}.uploads`;
const JWT_ISSUERS = new Set(["tuga", "veya"]);
const JWT_TTL_SECONDS = 12 * 60 * 60;
const MAX_MSGS_PER_CONV = 200;
const MAX_MSG_LEN = 4000;
const configuredOrigins = new Set((process.env.TUGA_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean));
function allowedOrigin(origin, requestHost) {
  if (!origin) return true;
  if (configuredOrigins.has('*') || configuredOrigins.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:', 'tauri:'].includes(parsed.protocol)) return false;
    if (parsed.protocol === 'tauri:' || parsed.hostname === 'tauri.localhost') return true;
    if (configuredOrigins.size === 0) return true;
    const loopbacks = new Set(['localhost', '127.0.0.1', '[::1]', 'tauri.localhost']);
    return parsed.hostname === requestHost || (loopbacks.has(parsed.hostname) && loopbacks.has(requestHost));
  } catch { return false; }
}

// ---------- Base de dados persistente (JSON) ----------
let db = { users: [], messages: [], communities: [], channelMessages: [], uploads: [] };
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    db = {
      users: raw.users || [],
      messages: raw.messages || [],
      communities: raw.communities || [],
      channelMessages: raw.channelMessages || [],
      uploads: raw.uploads || [],
    };
  }
} catch (error) {
  throw new Error('Não foi possível ler a base de dados. O servidor foi interrompido para preservar os dados.', { cause: error });
}
if (db.users.length && !db.users.some((u) => u.globalRole === "owner")) db.users[0].globalRole = "owner";

// Inicializar comunidade pública padrão se ainda não existir
const now = () => Date.now();
const uid = () => crypto.randomBytes(9).toString("base64url");

const jwtSecretPath = `${DATA_FILE}.jwt-secret`;
let jwtSecret = process.env.TUGA_JWT_SECRET || process.env.VEYA_JWT_SECRET || process.env.NEBULA_JWT_SECRET || "";
if (!jwtSecret) {
  try { jwtSecret = fs.readFileSync(jwtSecretPath, "utf8").trim(); } catch { /* first run */ }
  if (!jwtSecret) {
    jwtSecret = crypto.randomBytes(48).toString("base64url");
    fs.mkdirSync(path.dirname(jwtSecretPath), { recursive: true });
    fs.writeFileSync(jwtSecretPath, jwtSecret, { mode: 0o600, flag: "wx" });
  }
}
function jwtSign(userId) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: userId, ver: findUser(userId)?.authVersion || 0, iss: "tuga", iat: nowSeconds, exp: nowSeconds + JWT_TTL_SECONDS })).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${crypto.createHmac("sha256", jwtSecret).update(input).digest("base64url")}`;
}
function jwtVerify(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const input = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac("sha256", jwtSecret).update(input).digest();
  let actual;
  try { actual = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || !JWT_ISSUERS.has(payload.iss) || typeof payload.sub !== 'string' || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    const user = findUser(payload.sub);
    return user && user.accountStatus !== 'suspended' && (payload.ver || 0) === (user.authVersion || 0) ? user : null;
  } catch { return null; }
}

function turnIceServers(user) {
  const urls = (process.env.TUGA_TURN_URLS || process.env.VEYA_TURN_URLS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const secret = process.env.TUGA_TURN_SECRET || process.env.VEYA_TURN_SECRET || "";
  const stunUrls = (process.env.TUGA_STUN_URLS || process.env.VEYA_STUN_URLS || "stun:stun.l.google.com:19302").split(",").map((value) => value.trim()).filter(Boolean);
  const iceServers = stunUrls.length ? [{ urls: stunUrls }] : [];
  if (urls.length && secret) {
    const username = `${Math.floor(Date.now() / 1000) + 60 * 60}:${user.id}`;
    const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");
    iceServers.push({ urls, username, credential });
  }
  return { iceServers, turnConfigured: urls.length > 0 && !!secret };
}

if (!db.communities || db.communities.length === 0) {
  db.communities = [
    {
      id: "comm-lagg-hq",
      name: "Tuga Lounge",
      icon: "T",
      description: "Um espaço aberto para conversar e partilhar.",
      isPublic: true,
      ownerId: "system",
      inviteCode: "TUGA-HQ",
      members: [],
      membershipPrivacyMigrated: true,
      channels: [
        { id: "chan-general", name: "general", type: "text" },
        { id: "chan-dev", name: "dev-chat", type: "text" },
        { id: "chan-voice-lounge", name: "Voice Lounge", type: "voice" },
        { id: "chan-voice-gaming", name: "Gaming & Stream", type: "voice" },
      ],
      createdAt: now(),
    },
  ];
}
if (!db.channelMessages) db.channelMessages = [];
let privacyMembershipMigration = false;
for (const community of db.communities) {
  if (!community.isPublic || community.membershipPrivacyMigrated) continue;
  const activeMembers = new Set(db.channelMessages.filter((message) => message.communityId === community.id).map((message) => message.from));
  activeMembers.add(community.ownerId);
  (community.admins || []).forEach((adminId) => activeMembers.add(adminId));
  community.members = (community.members || []).filter((memberId) => activeMembers.has(memberId));
  community.membershipPrivacyMigrated = true;
  privacyMembershipMigration = true;
}
const legacyHome = db.communities.find((community) => community.id === "comm-lagg-hq" && community.ownerId === "system");
let legacyBrandMigration = false;
if (legacyHome) {
  legacyBrandMigration = legacyHome.name !== "Tuga Lounge" || legacyHome.icon !== "T";
  legacyHome.name = "Tuga Lounge";
  legacyHome.icon = "T";
  legacyHome.description = "Um espaço aberto para conversar e partilhar.";
}

let saveTimer = null;
let immediateSave = false;
function writeDb() {
  const tmp = DATA_FILE + '.tmp';
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}
function saveDb() {
  if (immediateSave) { if (saveTimer) clearTimeout(saveTimer); saveTimer = null; writeDb(); return; }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { writeDb(); }
    catch (error) { console.error('[Tuga] Falha ao guardar a base de dados:', error.code || 'write_failed'); }
  }, 300);
}
function shutdown() {
  if (saveTimer) { clearTimeout(saveTimer); writeDb(); }
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
if (process.env.TUGA_DESKTOP === '1') {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input = (input + chunk).slice(-128); if (input.includes('tuga-shutdown\n')) shutdown(); });
  process.stdin.once('end', shutdown);
}
if (privacyMembershipMigration) saveDb();
if (legacyBrandMigration) saveDb();

// ---------- Helpers ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function safeUser(u) {
  const { salt, hash, blockedUserIds, friendIds, friendRequests, authVersion, ...pub } = u;
  return pub;
}
function safeProfileImage(value, allowGradient = false) {
  if (typeof value !== "string" || value.length > 600_000) return "";
  if (allowGradient && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim();
  if (allowGradient && /^linear-gradient\(135deg,\s*#[0-9a-f]{6}\s+0%,\s*#[0-9a-f]{6}\s+100%\)$/i.test(value.trim())) return value.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* invalid image URL */ }
  return "";
}
function convKey(a, b) {
  return [a, b].sort().join("|");
}
function trimMessageStores() {
  const conversations = new Map();
  for (const message of db.messages) {
    const key = convKey(message.from, message.to);
    const list = conversations.get(key) || [];
    list.push(message.id);
    conversations.set(key, list);
  }
  const removed = new Set();
  for (const messages of conversations.values()) for (const id of messages.slice(0, Math.max(0, messages.length - MAX_MSGS_PER_CONV))) removed.add(id);
  if (removed.size) db.messages = db.messages.filter((message) => !removed.has(message.id));
  if (db.channelMessages.length > MAX_MSGS_PER_CONV * 50) db.channelMessages = db.channelMessages.slice(-MAX_MSGS_PER_CONV * 40);
}
function findUser(id) {
  return db.users.find((u) => u.id === id);
}
function usersBlockEachOther(a, b) {
  return !!findUser(a)?.blockedUserIds?.includes(b) || !!findUser(b)?.blockedUserIds?.includes(a);
}
function allowsDirectContact(from, to) {
  const recipient = findUser(to);
  return !!recipient && from !== to && !usersBlockEachOther(from, to) && (recipient.friendIds?.includes(from) || recipient.allowMemberDMs !== false || db.messages.some((message) => (message.from === from && message.to === to) || (message.from === to && message.to === from)));
}
function blockedProfilesFor(userId) {
  return (findUser(userId)?.blockedUserIds || []).map(findUser).filter(Boolean).map((user) => publicUser(user, conns.has(user.id)));
}
function publicUser(u, online, includeAdminData = false) {
  const profile = safeUser(u);
  delete profile.readReceiptsEnabled;
  delete profile.allowMemberDMs;
  delete profile.statusReason;
  if (!includeAdminData) delete profile.accountStatus;
  return { ...profile, online: !!online && u.status !== "invisible" };
}
function isGlobalAdmin(user) { return user?.globalRole === "owner" || user?.globalRole === "admin"; }
function visibleUsersFor(userId) {
  const me = findUser(userId);
  if (isGlobalAdmin(me)) return db.users.filter((u) => u.id !== userId).map((u) => publicUser(u, conns.has(u.id), true));
  const shared = new Set(db.communities.filter((c) => c.members?.includes(userId)).flatMap((c) => c.members || []));
  for (const id of me?.friendIds || []) shared.add(id);
  db.messages.forEach((m) => {
    if (m.from === userId) shared.add(m.to);
    if (m.to === userId) shared.add(m.from);
  });
  return db.users.filter((u) => u.id !== userId && shared.has(u.id) && !usersBlockEachOther(userId, u.id)).map((u) => publicUser(u, conns.has(u.id)));
}

function friendState(user) {
  const profiles = (ids) => ids.map(findUser).filter((peer) => peer && !usersBlockEachOther(user.id, peer.id)).map((peer) => publicUser(peer, conns.has(peer.id)));
  return { friends: profiles(user.friendIds || []), incoming: profiles(user.friendRequests || []), outgoing: profiles(db.users.filter((peer) => peer.friendRequests?.includes(user.id)).map((peer) => peer.id)) };
}
function sendFriends(user, requestId) { sendTo(user.id, { t: 'friends:update', ...friendState(user), requestId }); }
const authAttempts = new Map();
function authRateLimited(key, limit, windowMs) {
  const time = now();
  const current = authAttempts.get(key) || { count: 0, since: time };
  if (time - current.since > windowMs) { current.count = 0; current.since = time; }
  current.count++;
  authAttempts.set(key, current);
  if (authAttempts.size > 10000) {
    for (const [bucket, state] of authAttempts) if (time - state.since > 300_000) authAttempts.delete(bucket);
  }
  return current.count > limit;
}
// Ligações ativas: userId -> ws
const conns = new Map();

// Estado de voz em tempo real: channelId -> Set<userId>
const voiceChannels = new Map();
const pendingCalls = new Map(); // calleeId -> callerId
const activeCalls = new Map(); // userId -> peerId
const pendingCallTimers = new Map(); // calleeId -> timeout handle
function releaseRealtime(userId) {
  const peerId = activeCalls.get(userId);
  if (peerId) {
    activeCalls.delete(userId);
    activeCalls.delete(peerId);
    sendTo(peerId, { t: 'call:hangup', from: userId });
    sendTo(userId, { t: 'call:hangup', from: peerId });
  }
  for (const [calleeId, callerId] of pendingCalls) {
    if (calleeId !== userId && callerId !== userId) continue;
    pendingCalls.delete(calleeId);
    clearTimeout(pendingCallTimers.get(calleeId));
    pendingCallTimers.delete(calleeId);
    sendTo(calleeId, { t: 'call:hangup', from: callerId });
    sendTo(callerId, { t: 'call:hangup', from: calleeId });
  }
  for (const [channelId, members] of voiceChannels) {
    if (members.delete(userId)) sendTo(userId, { t: 'voice:kicked', channelId, by: userId });
    if (!members.size) voiceChannels.delete(channelId);
  }
  broadcastVoiceState();
}

function getVoiceStateObj() {
  const obj = {};
  for (const [chanId, set] of voiceChannels.entries()) {
    obj[chanId] = [...set];
  }
  return obj;
}
function getVoiceStateFor(userId) {
  const result = {};
  const globalAdmin = isGlobalAdmin(findUser(userId));
  for (const [channelId, members] of voiceChannels.entries()) {
    const community = db.communities.find((entry) => entry.channels.some((channel) => channel.id === channelId));
    const channel = community?.channels.find((entry) => entry.id === channelId);
    const canSee = canReadChannel(community, channel, findUser(userId));
    if (canSee) result[channelId] = [...members].filter((memberId) => globalAdmin || community.members.includes(memberId));
  }
  return result;
}

function send(ws, obj) {
  if (obj.t === 'err') ws.failedCurrentRequest = true;
  if (['err', 'community:update', 'msg', 'community:msg', 'msg:delete', 'user:search:result'].includes(obj.t) && ws.responseRequestId && !obj.requestId) obj = { ...obj, requestId: ws.responseRequestId };
  const user = findUser(ws.userId);
  if (obj.t === 'users' || obj.t === 'ready') ws.visiblePeerIds = new Set((obj.users || []).map((entry) => entry.id));
  if (obj.t === 'msg' && user && !ws.visiblePeerIds?.has(obj.msg.from === user.id ? obj.msg.to : obj.msg.from)) send(ws, { t: 'users', users: visibleUsersFor(user.id) });
  if (obj.msg?.communityId) {
    const comm = db.communities.find((entry) => entry.id === obj.msg.communityId);
    const channel = comm?.channels.find((entry) => entry.id === obj.msg.channelId);
    if (!canReadChannel(comm, channel, user)) return;
  }
  if (obj.community && user) obj = { ...obj, community: communityForUser(obj.community, user) };
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function sendTo(userId, obj) {
  const ws = conns.get(userId);
  if (ws) send(ws, obj);
}
function broadcastUsers() {
  for (const [userId, ws] of conns.entries()) send(ws, { t: "users", users: visibleUsersFor(userId) });
}

function broadcastVoiceState() {
  for (const [channelId, members] of voiceChannels) {
    const comm = db.communities.find((entry) => entry.channels.some((channel) => channel.id === channelId));
    const channel = comm?.channels.find((entry) => entry.id === channelId);
    for (const memberId of members) {
      const user = findUser(memberId);
      if (!canReadChannel(comm, channel, user) || !canUseCommunityFeature(comm, user, 'connectVoice') || user.accountStatus === 'restricted' || (comm.suspended && !isGlobalAdmin(user))) {
        members.delete(memberId);
        sendTo(memberId, { t: 'voice:kicked', channelId, by: comm?.ownerId || 'system' });
      }
    }
    if (!members.size) voiceChannels.delete(channelId);
  }
  for (const [userId, ws] of conns.entries()) {
    send(ws, { t: "voice:state", voiceState: getVoiceStateFor(userId) });
  }
}

function broadcastCommunities() {
  for (const [userId, ws] of conns.entries()) {
    send(ws, { t: "communities:update", communities: getCommunitiesForUser(userId) });
  }
}

function canManageCommunity(comm, user) {
  if (!comm || !user) return false;
  if (isGlobalAdmin(user) || comm.ownerId === user.id || comm.admins?.includes(user.id)) return true;
  const userRoles = comm.memberRoles?.[user.id] || [];
  return (comm.roles || []).some((r) => userRoles.includes(r.id) && (r.permissions?.administrator || r.permissions?.manageServer));
}

function canManageChannels(comm, user) {
  if (!comm || !user) return false;
  if (canManageCommunity(comm, user)) return true;
  const userRoles = comm.memberRoles?.[user.id] || [];
  return (comm.roles || []).some((r) => userRoles.includes(r.id) && (r.permissions?.administrator || r.permissions?.manageChannels));
}

function canManageRoles(comm, user) {
  if (!comm || !user) return false;
  if (canManageCommunity(comm, user)) return true;
  const userRoles = comm.memberRoles?.[user.id] || [];
  return (comm.roles || []).some((r) => userRoles.includes(r.id) && (r.permissions?.administrator || r.permissions?.manageRoles));
}

function hasCommunityPermission(comm, user, permName) {
  if (!comm || !user) return false;
  if (isGlobalAdmin(user) || comm.ownerId === user.id || comm.admins?.includes(user.id)) return true;
  const userRoles = comm.memberRoles?.[user.id] || [];
  return (comm.roles || []).some((r) => userRoles.includes(r.id) && (r.permissions?.administrator || r.permissions?.[permName]));
}

const ROLE_PERMISSIONS = ['administrator', 'manageServer', 'manageChannels', 'manageRoles', 'manageMessages', 'sendMessages', 'connectVoice', 'speakVoice', 'muteVoiceMembers', 'kickVoiceMembers', 'kickMembers', 'inviteMembers'];
function rolePermissions(value) {
  return Object.fromEntries(ROLE_PERMISSIONS.filter((key) => typeof value?.[key] === 'boolean').map((key) => [key, value[key]]));
}
function canUseCommunityFeature(comm, user, permission) {
  if (hasCommunityPermission(comm, user, 'administrator')) return true;
  const roleIds = comm.memberRoles?.[user.id] || [];
  const roles = (comm.roles || []).filter((role) => roleIds.includes(role.id) && typeof role.permissions?.[permission] === 'boolean');
  return !roles.length || roles.some((role) => role.permissions[permission] === true);
}
function canGrantRole(comm, user, permissions) {
  if (isGlobalAdmin(user) || comm.ownerId === user.id || comm.admins?.includes(user.id) || hasCommunityPermission(comm, user, 'administrator')) return true;
  return ROLE_PERMISSIONS.every((key) => !permissions?.[key] || (key !== 'administrator' && hasCommunityPermission(comm, user, key)));
}

function canReadChannel(comm, channel, user) {
  return !!comm && !!channel && !!user && (isGlobalAdmin(user) || (comm.members.includes(user.id) && (!channel.deniedUsers?.includes(user.id) || hasCommunityPermission(comm, user, 'administrator'))));
}
function communityForUser(comm, user) {
  const canInvite = !!user && (isGlobalAdmin(user) || (comm.members.includes(user.id) && (comm.allowMemberInvites || hasCommunityPermission(comm, user, 'inviteMembers'))));
  return { ...comm, inviteCode: canInvite ? comm.inviteCode : '', channels: comm.channels.filter((channel) => canReadChannel(comm, channel, user)) };
}
function getCommunitiesForUser(userId) {
  const user = findUser(userId);
  return db.communities.filter((c) => isGlobalAdmin(user) || c.members?.includes(userId)).map((comm) => communityForUser(comm, user));
}

function getPublicCommunities() {
  return db.communities
    .filter((c) => c.isPublic && !c.suspended)
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      bannerUrl: c.bannerUrl,
      bannerPosition: c.bannerPosition,
      description: c.description,
      isPublic: true,
      ownerId: c.ownerId,
      inviteCode: c.inviteCode,
      members: [],
      memberCount: c.members.length,
      channels: [],
      textChannelCount: c.channels.filter((ch) => ch.type !== 'voice').length,
      voiceChannelCount: c.channels.filter((ch) => ch.type === 'voice').length,
      createdAt: c.createdAt,
    }));
}

function broadcastPublicCommunities() {
  const publicList = getPublicCommunities();
  for (const [, ws] of conns.entries()) {
    send(ws, { t: "community:public:list", communities: publicList });
  }
}

function getChannelMessagesForUser(userId) {
  const userCommIds = new Set(db.communities.filter((c) => c.members?.includes(userId)).map((c) => c.id));
  return db.channelMessages
    .filter((m) => {
      const community = db.communities.find((c) => c.id === m.communityId);
      const channel = community?.channels.find((ch) => ch.id === m.channelId);
      return (userCommIds.has(m.communityId) || isGlobalAdmin(findUser(userId))) && canReadChannel(community, channel, findUser(userId));
    })
    .slice(-MAX_MSGS_PER_CONV * 10);
}

function loadHistory(userId) {
  const msgs = db.messages.filter((m) => (m.from === userId || m.to === userId) && !usersBlockEachOther(m.from, m.to));
  const convs = new Map();
  for (const m of msgs) {
    const other = m.from === userId ? m.to : m.from;
    if (!convs.has(other)) convs.set(other, []);
    convs.get(other).push(m);
  }
  return [...convs.entries()]
    .map(([otherId, list]) => {
      const u = findUser(otherId);
      return {
        user: u ? publicUser(u, conns.has(u.id)) : null,
        messages: list.slice(-MAX_MSGS_PER_CONV),
      };
    })
    .filter((c) => c.user);
}

// ---------- API HTTP protegida + WebSocket ----------
function jsonResponse(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
function authorizedUser(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (match) return jwtVerify(match[1]);
  return null;
}
function canAccessUpload(user, upload) {
  if (!user || !upload) return false;
  if (isGlobalAdmin(user)) return true;
  if (upload.targetType === "dm") return !usersBlockEachOther(user.id, upload.uploaderId) && (upload.targetId === user.id || upload.uploaderId === user.id);
  const community = db.communities.find((entry) => entry.id === upload.targetId);
  const channel = community?.channels.find((entry) => entry.id === upload.channelId);
  return canReadChannel(community, channel, user);
}
const httpServer = http.createServer(async (req, res) => {
  res.setMaxListeners(20);
  const origin = req.headers.origin;
  if (origin) {
    try {
      const requestHost = new URL(`http://${req.headers.host || 'localhost'}`).hostname;
      if (allowedOrigin(origin, requestHost)) {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "Origin");
        res.setHeader("access-control-allow-headers", "authorization, content-type, x-file-name, x-file-type, x-target-type, x-target-id, x-channel-id");
        res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      }
    } catch { /* invalid origin is not reflected */ }
  }
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const user = authorizedUser(req);
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { return jsonResponse(res, 400, { error: 'invalid_url' }); }
  if (req.method === 'GET' && url.pathname === '/api/health') return jsonResponse(res, 200, { app: 'tuga', version: '0.2.3' });
  if (req.method === "GET" && url.pathname === "/api/me") {
    if (!user) return jsonResponse(res, 401, { error: "unauthorized" });
    return jsonResponse(res, 200, { profile: safeUser(user) });
  }
  if (req.method === "GET" && url.pathname === "/api/rtc-config") {
    if (!user) return jsonResponse(res, 401, { error: "unauthorized" });
    return jsonResponse(res, 200, turnIceServers(user));
  }
  if (req.method === "POST" && url.pathname === "/api/uploads") {
    if (!user) return jsonResponse(res, 401, { error: "unauthorized" });
    if (user.accountStatus === 'restricted') return jsonResponse(res, 403, { error: 'account_restricted' });
    if (authRateLimited(`upload:${user.id}`, 12, 60_000)) return jsonResponse(res, 429, { error: "rate_limit" });
    const maxBytes = 50 * 1024 * 1024;
    const length = Number(req.headers["content-length"] || 0);
    if (!Number.isFinite(length) || length <= 0 || length > maxBytes) return jsonResponse(res, 413, { error: "file_size" });
    const targetType = String(req.headers["x-target-type"] || "");
    const targetId = String(req.headers["x-target-id"] || "");
    const channelId = String(req.headers["x-channel-id"] || "");
    let allowed = false;
    if (targetType === "dm") allowed = allowsDirectContact(user.id, targetId);
    if (targetType === "channel") {
      const community = db.communities.find((entry) => entry.id === targetId);
      const channel = community?.channels.find((entry) => entry.id === channelId && ["text", "announcement"].includes(entry.type));
      allowed = canReadChannel(community, channel, user) && canUseCommunityFeature(community, user, 'sendMessages') && (!community.suspended || isGlobalAdmin(user)) && (channel.type !== 'announcement' || hasCommunityPermission(community, user, 'administrator'));
    }
    if (!allowed) return jsonResponse(res, 403, { error: "target_forbidden" });
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(); return jsonResponse(res, 413, { error: "file_size" }); }
        chunks.push(chunk);
      }
      if (!size) return jsonResponse(res, 400, { error: "empty_file" });
      await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
      const id = crypto.randomUUID();
      const originalName = decodeURIComponent(String(req.headers["x-file-name"] || "ficheiro")).replace(/[\\/\0-\x1f\x7f]/g, "_").slice(0, 180) || "ficheiro";
      const upload = { id, name: originalName, size, type: String(req.headers["x-file-type"] || "application/octet-stream").slice(0, 120), uploaderId: user.id, targetType, targetId, channelId: targetType === "channel" ? channelId : undefined, createdAt: now() };
      await fs.promises.writeFile(path.join(UPLOAD_DIR, id), Buffer.concat(chunks), { flag: "wx", mode: 0o600 });
      db.uploads.push(upload);
      saveDb();
      return jsonResponse(res, 201, { attachment: { id, name: upload.name, size, type: upload.type } });
    } catch { return jsonResponse(res, 500, { error: "upload_failed" }); }
  }
  const downloadMatch = /^\/api\/uploads\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (req.method === "GET" && downloadMatch) {
    if (!user) return jsonResponse(res, 401, { error: "unauthorized" });
    const upload = db.uploads.find((entry) => entry.id === downloadMatch[1]);
    if (!canAccessUpload(user, upload)) return jsonResponse(res, 404, { error: "not_found" });
    const filePath = path.join(UPLOAD_DIR, upload.id);
    if (!fs.existsSync(filePath)) return jsonResponse(res, 404, { error: "not_found" });
    const isImage = /^image\/(png|jpeg|gif|webp|avif)$/.test(upload.type || '');
    const forceDownload = url.searchParams.get("download") === "1";
    const disposition = isImage && !forceDownload ? "inline" : "attachment";
    const contentType = isImage && !forceDownload ? upload.type : "application/octet-stream";
    const encodedName = encodeURIComponent(upload.name).replace(/['()]/g, escape);
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": upload.size,
      "content-disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "referrer-policy": "no-referrer",
      "cache-control": "private, no-store"
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    return stream.pipe(res);
  }
  jsonResponse(res, 404, { error: "not_found" });
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 1024 * 1024,
  verifyClient: (info, done) => {
    const origin = info.req.headers.origin;
    if (!origin) return done(true);
    try {
      const requestHost = new URL(`http://${info.req.headers.host || 'localhost'}`).hostname;
      done(allowedOrigin(origin, requestHost));
    } catch { done(false, 403, "Invalid origin"); }
  },
});
wss.setMaxListeners(50);
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
heartbeat.unref();
wss.on('close', () => clearInterval(heartbeat));
httpServer.listen(PORT, HOST, () => console.log(`[Tuga] servidor API e WebSocket em http://${HOST}:${httpServer.address().port}`));

wss.on("connection", (ws) => {
  ws.setMaxListeners(20);
  ws.on('error', () => ws.terminate());
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const sessionDeadline = setTimeout(() => { if (!ws.userId) ws.close(4003, 'Authentication required'); }, 60000);
  sessionDeadline.unref();
  let me = null;
  let wsToken = "";
  const authKey = ws._socket?.remoteAddress || "unknown";
  let frameWindowStart = now();
  let frameCount = 0;

  ws.on("message", (raw) => {
    const frameTime = now();
    if (frameTime - frameWindowStart > 10_000) { frameWindowStart = frameTime; frameCount = 0; }
    if (++frameCount > 300 || authRateLimited(`frames:${authKey}`, 5000, 10_000)) { ws.close(1008, 'Rate limit'); return; }
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!m || typeof m !== "object" || Array.isArray(m)) return;
    ws.responseRequestId = typeof m.requestId === 'string' ? m.requestId.slice(0, 64) : undefined;
    ws.failedCurrentRequest = false;
    immediateSave = !!ws.responseRequestId || ['register', 'community:create'].includes(m.t);
    try {
    const authed = () => me && conns.get(me.id) === ws && jwtVerify(wsToken)?.id === me.id;
    if (me && ['register', 'login'].includes(m.t)) return send(ws, { t: 'err', code: 'invalid_request' });
    if (me && !['login', 'register', 'session'].includes(m.t)) {
      if (!authed()) { send(ws, { t: 'err', code: 'session' }); return ws.close(); }
      if (me.accountStatus === 'restricted' && !['profile', 'user:block', 'friends:list', 'dm:read', 'community:public:list', 'voice:leave', 'call:hangup', 'call:reject'].includes(m.t)) return send(ws, { t: 'err', code: 'account_restricted' });
    }

    switch (m.t) {
      // ----- Registo -----
      case "register": {
        if (authRateLimited(`register:${authKey}`, 5, 60_000)) return send(ws, { t: "err", code: "rate_limit" });
        const username = String(m.username || "").trim().toLowerCase();
        const displayName = String(m.displayName || "").trim().slice(0, 32);
        const password = String(m.password || "");
        if (!/^[a-z0-9_.]{3,20}$/.test(username)) return send(ws, { t: "err", code: "username" });
        if (password.length < 10 || password.length > 128) return send(ws, { t: "err", code: "password" });
        if (db.users.some((u) => u.username === username)) return send(ws, { t: "err", code: "taken" });
        const salt = crypto.randomBytes(16).toString("hex");
        const user = {
          id: uid(),
          username,
          displayName: displayName || username,
          salt,
          hash: hashPassword(password, salt),
          hue: Math.floor(Math.random() * 360),
          emoji: "🚀",
          about: "",
          status: "online",
          readReceiptsEnabled: false,
          createdAt: now(),
        };
        db.users.push(user);
        if (db.users.length === 1) user.globalRole = "owner";

        saveDb();
        const tk = jwtSign(user.id);
        send(ws, { t: "auth", token: tk, profile: safeUser(user) });
        broadcastUsers();
        break;
      }

      // ----- Login -----
      case "login": {
        if (authRateLimited(`login:${authKey}`, 30, 60_000)) return send(ws, { t: "err", code: "rate_limit" });
        const username = String(m.username || "").trim().toLowerCase();
        const user = db.users.find((u) => u.username === username);
        if (!user) return send(ws, { t: "err", code: "credentials" });
        const password = String(m.password || '');
        if (password.length > 128) return send(ws, { t: 'err', code: 'credentials' });
        const h = hashPassword(password, user.salt);
        const a = Buffer.from(h, "hex");
        const b = Buffer.from(user.hash, "hex");
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
          return send(ws, { t: "err", code: "credentials" });
        const tk = jwtSign(user.id);
        if (user.accountStatus === "suspended") return send(ws, { t: "err", code: "account_suspended" });
        send(ws, { t: "auth", token: tk, profile: safeUser(user) });
        break;
      }

      // ----- Sessão por token -----
      case "session": {
        wsToken = String(m.token || "");
        const user = jwtVerify(wsToken);
        if (!user) return send(ws, { t: "err", code: "session" });
        if (me && me.id !== user.id) { send(ws, { t: 'err', code: 'session' }); return ws.close(); }
        if (user.accountStatus === "suspended") return send(ws, { t: "err", code: "account_suspended" });
        me = user;
        ws.userId = user.id;
        clearTimeout(sessionDeadline);
        const previousConnection = conns.get(user.id);
        if (previousConnection && previousConnection !== ws) {
          releaseRealtime(user.id);
          previousConnection.close(4001, 'Session replaced');
        }
        conns.set(user.id, ws);

        send(ws, {
          t: "ready",
          profile: safeUser(user),
          users: visibleUsersFor(user.id),
          conversations: loadHistory(user.id),
          communities: getCommunitiesForUser(user.id),
          publicCommunities: getPublicCommunities(),
          channelMessages: getChannelMessagesForUser(user.id),
          voiceState: getVoiceStateFor(user.id),
          blockedUsers: blockedProfilesFor(user.id),
        });
        sendFriends(user);
        broadcastUsers();
        break;
      }

      // ----- Perfil -----
      case 'account:password': {
        if (!authed()) return;
        if (authRateLimited(`password:${me.id}`, 5, 60_000)) return send(ws, { t: 'err', code: 'rate_limit' });
        const current = String(m.currentPassword || '');
        const next = String(m.newPassword || '');
        if (!current || current.length > 128 || next.length < 10 || next.length > 128) return send(ws, { t: 'err', code: 'password' });
        const actual = Buffer.from(hashPassword(current, me.salt), 'hex');
        const expected = Buffer.from(me.hash, 'hex');
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return send(ws, { t: 'err', code: 'current_password' });
        me.salt = crypto.randomBytes(16).toString('hex');
        me.hash = hashPassword(next, me.salt);
        me.authVersion = (me.authVersion || 0) + 1;
        writeDb();
        wsToken = jwtSign(me.id);
        saveDb();
        send(ws, { t: 'account:password:changed', token: wsToken });
        break;
      }
      case "profile": {
        if (!authed()) return;
        const p = m.patch || {};
        for (const field of ['avatarUrl', 'bannerUrl']) {
          if (typeof p[field] === 'string' && p[field].trim() && !safeProfileImage(p[field].trim(), field === 'bannerUrl')) return send(ws, { t: 'err', code: 'invalid_image', requestId: ws.responseRequestId });
        }
        if (typeof p.displayName === "string" && p.displayName.trim())
          me.displayName = p.displayName.trim().slice(0, 32);
        if (typeof p.about === "string") me.about = p.about.slice(0, 500);
        if (typeof p.customStatus === "string") me.customStatus = p.customStatus.slice(0, 100);
        if (typeof p.avatarUrl === "string") me.avatarUrl = safeProfileImage(p.avatarUrl.trim());
        if (typeof p.bannerUrl === "string") me.bannerUrl = safeProfileImage(p.bannerUrl.trim(), true);
        if (Number.isFinite(p.bannerPosition)) me.bannerPosition = Math.max(0, Math.min(100, Math.round(p.bannerPosition)));
        if (typeof p.emoji === "string") me.emoji = [...p.emoji][0] || "🚀";
        if (Number.isFinite(p.hue)) me.hue = ((p.hue % 360) + 360) % 360;
        if (["online", "away", "busy", "invisible"].includes(p.status)) me.status = p.status;
        if (typeof p.readReceiptsEnabled === "boolean") me.readReceiptsEnabled = p.readReceiptsEnabled;
        if (typeof p.allowMemberDMs === 'boolean') me.allowMemberDMs = p.allowMemberDMs;
        saveDb();
        send(ws, { t: "profile", profile: safeUser(me), requestId: ws.responseRequestId });
        broadcastUsers();
        break;
      }

      case 'friends:list': {
        if (!authed()) return;
        send(ws, { t: 'friends:update', ...friendState(me), requestId: ws.responseRequestId });
        break;
      }

      case 'user:search': {
        if (!authed()) return;
        const q = String(m.query || '').trim().toLowerCase().replace(/^@/, '');
        if (!q) {
          send(ws, { t: 'user:search:result', users: [], query: '', requestId: ws.responseRequestId });
          break;
        }
        const matches = db.users
          .filter((u) => u.id !== me.id && u.accountStatus !== 'suspended' && !usersBlockEachOther(me.id, u.id))
          .filter((u) => (u.username && u.username.toLowerCase().includes(q)) || (u.displayName && u.displayName.toLowerCase().includes(q)))
          .sort((a, b) => {
            const aUser = (a.username || '').toLowerCase();
            const bUser = (b.username || '').toLowerCase();
            const aStarts = aUser.startsWith(q) || (a.displayName || '').toLowerCase().startsWith(q);
            const bStarts = bUser.startsWith(q) || (b.displayName || '').toLowerCase().startsWith(q);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return (a.displayName || '').localeCompare(b.displayName || '');
          })
          .slice(0, 15)
          .map((u) => publicUser(u, conns.has(u.id)));
        send(ws, { t: 'user:search:result', users: matches, query: q, requestId: ws.responseRequestId });
        break;
      }
      case 'friend:request':
      case 'friend:respond':
      case 'friend:remove': {
        if (!authed()) return;
        if (authRateLimited(`friends:${me.id}`, 20, 60_000)) return send(ws, { t: 'err', code: 'rate_limit' });
        const target = m.t === 'friend:request'
          ? (m.userId ? findUser(String(m.userId)) : db.users.find((peer) => peer.username === String(m.username || '').trim().replace(/^@/, '').toLowerCase()))
          : findUser(String(m.userId || ''));
        if (!target) return send(ws, { t: 'err', code: 'user_not_found' });
        if (target.id === me.id) return send(ws, { t: 'err', code: 'cannot_friend_self' });
        if (usersBlockEachOther(me.id, target.id)) return send(ws, { t: 'err', code: 'user_blocked' });
        if (target.accountStatus === 'suspended') return send(ws, { t: 'err', code: 'user_not_found' });
        me.friendIds ||= []; target.friendIds ||= []; me.friendRequests ||= []; target.friendRequests ||= [];
        if (m.t === 'friend:request') {
          if (me.friendIds.includes(target.id)) return send(ws, { t: 'err', code: 'already_friend' });
          if (me.friendRequests.includes(target.id)) {
            if (me.friendIds.length >= 500 || target.friendIds.length >= 500) return send(ws, { t: 'err', code: 'rate_limit' });
            if (!me.friendIds.includes(target.id)) me.friendIds.push(target.id);
            if (!target.friendIds.includes(me.id)) target.friendIds.push(me.id);
            me.friendRequests = me.friendRequests.filter((id) => id !== target.id);
            target.friendRequests = target.friendRequests.filter((id) => id !== me.id);
          } else if (target.friendRequests.includes(me.id)) {
            return send(ws, { t: 'err', code: 'already_requested' });
          } else {
            if (target.friendRequests.length >= 100 || me.friendIds.length >= 500) return send(ws, { t: 'err', code: 'rate_limit' });
            target.friendRequests.push(me.id);
          }
        } else if (m.t === 'friend:respond') {
          if (!me.friendRequests.includes(target.id)) return send(ws, { t: 'err', code: 'request_not_found' });
          if (m.accept === true) {
            if (me.friendIds.length >= 500 || target.friendIds.length >= 500) return send(ws, { t: 'err', code: 'rate_limit' });
            if (!me.friendIds.includes(target.id)) me.friendIds.push(target.id);
            if (!target.friendIds.includes(me.id)) target.friendIds.push(me.id);
          }
          me.friendRequests = me.friendRequests.filter((id) => id !== target.id);
          target.friendRequests = target.friendRequests.filter((id) => id !== me.id);
        } else {
          me.friendIds = me.friendIds.filter((id) => id !== target.id); target.friendIds = target.friendIds.filter((id) => id !== me.id);
          me.friendRequests = me.friendRequests.filter((id) => id !== target.id); target.friendRequests = target.friendRequests.filter((id) => id !== me.id);
        }
        saveDb(); sendFriends(me, ws.responseRequestId); sendFriends(target); broadcastUsers();
        break;
      }
      case "user:block": {
        if (!authed()) return;
        const target = findUser(String(m.userId || ""));
        if (!target || target.id === me.id) return send(ws, { t: "err", code: "block_target" });
        const blocked = new Set(me.blockedUserIds || []);
        if (m.blocked === false) blocked.delete(target.id); else blocked.add(target.id);
        me.blockedUserIds = [...blocked];
        if (m.blocked !== false) {
          me.friendIds = (me.friendIds || []).filter((id) => id !== target.id); target.friendIds = (target.friendIds || []).filter((id) => id !== me.id);
          me.friendRequests = (me.friendRequests || []).filter((id) => id !== target.id); target.friendRequests = (target.friendRequests || []).filter((id) => id !== me.id);
          sendFriends(me); sendFriends(target);
        }
        saveDb();
        if (m.blocked !== false) {
          send(ws, { t: 'call:hangup', from: target.id });
          if (activeCalls.get(me.id) === target.id) {
            activeCalls.delete(me.id);
            activeCalls.delete(target.id);
            sendTo(target.id, { t: "call:hangup", from: me.id });
          }
          if (pendingCalls.get(target.id) === me.id) {
            pendingCalls.delete(target.id);
            clearTimeout(pendingCallTimers.get(target.id));
            pendingCallTimers.delete(target.id);
            sendTo(target.id, { t: "call:hangup", from: me.id });
          } else if (pendingCalls.get(me.id) === target.id) {
            pendingCalls.delete(me.id);
            clearTimeout(pendingCallTimers.get(me.id));
            pendingCallTimers.delete(me.id);
            sendTo(target.id, { t: "call:hangup", from: me.id });
          }
        }
        send(ws, { t: "blocks:update", users: blockedProfilesFor(me.id) });
        broadcastUsers();
        break;
      }

      case "admin:user:role": {
        if (!authed()) return;
        if (me.globalRole !== "owner") return send(ws, { t: "err", code: "admin_permission" });
        const target = findUser(String(m.userId || ""));
        if (!target || target.id === me.id || target.globalRole === "owner") return send(ws, { t: "err", code: "admin_target" });
        if (m.role === "admin") target.globalRole = "admin";
        else delete target.globalRole;
        saveDb();
        send(ws, { t: "admin:user:role:updated", userId: target.id, globalRole: target.globalRole });
        sendTo(target.id, { t: 'profile', profile: safeUser(target) });
        broadcastCommunities();
        broadcastUsers();
        break;
      }

      case "admin:user:status": {
        if (!authed()) return;
        if (!isGlobalAdmin(me)) return send(ws, { t: "err", code: "admin_permission" });
        const target = findUser(String(m.userId || ""));
        if (!target || target.id === me.id || target.globalRole === "owner") return send(ws, { t: "err", code: "admin_target" });
        if (target.globalRole === "admin" && me.globalRole !== "owner") return send(ws, { t: "err", code: "admin_permission" });
        const newStatus = ["active", "suspended", "restricted"].includes(m.status) ? m.status : "active";
        target.accountStatus = newStatus;
        target.statusReason = String(m.reason || "").slice(0, 150);
        saveDb();
        if (newStatus !== 'active') releaseRealtime(target.id);
        sendTo(target.id, { t: 'profile', profile: safeUser(target) });
        if (newStatus === "suspended") {
          sendTo(target.id, { t: "err", code: "account_suspended" });
          const targetWs = conns.get(target.id);
          if (targetWs) targetWs.close();
        }
        send(ws, { t: "admin:user:status:updated", userId: target.id, status: newStatus });
        broadcastUsers();
        break;
      }

      case "admin:community:suspend": {
        if (!authed()) return;
        if (!isGlobalAdmin(me)) return send(ws, { t: "err", code: "admin_permission" });
        const comm = db.communities.find((c) => c.id === String(m.communityId || ""));
        if (!comm) return send(ws, { t: "err", code: "not_found" });
        comm.suspended = !!m.suspended;
        comm.suspendReason = String(m.reason || "").slice(0, 150);
        if (comm.suspended) for (const channel of comm.channels) {
          for (const memberId of voiceChannels.get(channel.id) || []) sendTo(memberId, { t: 'voice:kicked', channelId: channel.id, by: me.id });
          voiceChannels.delete(channel.id);
        }
        broadcastVoiceState();
        broadcastPublicCommunities();
        saveDb();
        comm.members.forEach((memId) => {
          sendTo(memId, { t: "community:update", community: comm });
        });
        send(ws, { t: "communities:update", communities: getCommunitiesForUser(me.id) });
        send(ws, { t: 'admin:community:status:updated', communityId: comm.id, suspended: comm.suspended });
        break;
      }

      case "admin:community:join": {
        if (!authed()) return;
        if (!isGlobalAdmin(me)) return send(ws, { t: "err", code: "admin_permission" });
        const comm = db.communities.find((c) => c.id === String(m.communityId || ""));
        if (!comm) return send(ws, { t: "err", code: "not_found" });
        if (!comm.members.includes(me.id)) {
          comm.members.push(me.id);
          saveDb();
        }
        send(ws, {
          t: "community:joined",
          community: comm,
          communities: getCommunitiesForUser(me.id),
          channelMessages: getChannelMessagesForUser(me.id),
        });
        comm.members.forEach((memId) => {
          sendTo(memId, { t: "community:update", community: comm });
        });
        break;
      }

      // ----- Mensagens Diretas (DMs) -----
      case "msg": {
        if (!authed()) return;
        if (me.accountStatus === "restricted" || me.accountStatus === "suspended") return send(ws, { t: "err", code: "account_restricted" });
        if (authRateLimited(`msg:${me.id}`, 30, 10_000)) return send(ws, { t: "err", code: "rate_limit" });
        const to = String(m.to || "");
        const text = String(m.text || "").trim().slice(0, MAX_MSG_LEN);
        if (!text || !allowsDirectContact(me.id, to)) return send(ws, { t: "err", code: "user_blocked" });
        const msg = { id: uid(), from: me.id, to, text, at: now() };
        db.messages.push(msg);

        const key = convKey(me.id, to);
        const convMsgs = db.messages.filter((x) => convKey(x.from, x.to) === key);
        if (convMsgs.length > MAX_MSGS_PER_CONV) {
          const drop = new Set(convMsgs.slice(0, convMsgs.length - MAX_MSGS_PER_CONV).map((x) => x.id));
          db.messages = db.messages.filter((x) => !drop.has(x.id));
        }
        saveDb();
        send(ws, { t: "msg", msg });
        sendTo(to, { t: "msg", msg });
        break;
      }

      case "dm:read": {
        if (!authed()) return;
        if (me.readReceiptsEnabled !== true) return;
        const peerId = String(m.peerId || "");
        const throughAt = Number(m.throughAt);
        if (!findUser(peerId) || peerId === me.id || usersBlockEachOther(me.id, peerId) || !Number.isFinite(throughAt)) return;
        const nowAt = now();
        const messageIds = [];
        for (const message of db.messages) {
          if (message.from === peerId && message.to === me.id && message.at <= Math.min(throughAt, nowAt) && !message.readAt) {
            message.readAt = nowAt;
            messageIds.push(message.id);
          }
        }
        if (messageIds.length) {
          saveDb();
          sendTo(peerId, { t: "dm:read:update", peerId: me.id, messageIds, readAt: nowAt });
        }
        break;
      }

      case "file:share": {
        if (!authed()) return;
        if (authRateLimited(`fileshare:${me.id}`, 30, 10_000)) return send(ws, { t: 'err', code: 'rate_limit' });
        const upload = db.uploads.find((entry) => entry.id === String(m.fileId || "") && entry.uploaderId === me.id);
        if (!upload) return send(ws, { t: "err", code: "file_not_found" });
        const attachment = { id: upload.id, name: upload.name, size: upload.size, type: upload.type };
        const text = String(m.text || "").trim().slice(0, MAX_MSG_LEN);
        if (upload.targetType === "dm") {
          const to = upload.targetId;
          if (!allowsDirectContact(me.id, to)) return send(ws, { t: "err", code: "user_blocked" });
          const msg = { id: uid(), from: me.id, to, text, attachment, at: now() };
          db.messages.push(msg);
          trimMessageStores();
          saveDb();
          send(ws, { t: "msg", msg });
          sendTo(to, { t: "msg", msg });
        } else {
          const comm = db.communities.find((entry) => entry.id === upload.targetId);
          const channel = comm?.channels.find((entry) => entry.id === upload.channelId);
          if (!canReadChannel(comm, channel, me) || !canUseCommunityFeature(comm, me, 'sendMessages') || (comm.suspended && !isGlobalAdmin(me)) || !['text', 'announcement'].includes(channel.type) || (channel.type === 'announcement' && !hasCommunityPermission(comm, me, 'administrator'))) return send(ws, { t: 'err', code: 'member_permission' });
          const msg = { id: uid(), communityId: comm.id, channelId: channel.id, from: me.id, text, attachment, at: now() };
          db.channelMessages.push(msg);
          trimMessageStores();
          saveDb();
          comm.members.forEach((memberId) => sendTo(memberId, { t: "community:msg", msg }));
          if (!comm.members.includes(me.id)) send(ws, { t: 'community:msg', msg });
        }
        break;
      }

      case "msg:delete": {
        if (!authed()) return;
        if (authRateLimited(`msgdel:${me.id}`, 60, 10_000)) return send(ws, { t: "err", code: "rate_limit" });
        const scope = m.scope === "channel" ? "channel" : "dm";
        const messageId = String(m.messageId || "");
        if (!messageId) return;

        if (scope === "dm") {
          const index = db.messages.findIndex((x) => x.id === messageId);
          if (index === -1) return;
          const msg = db.messages[index];
          if (msg.from !== me.id && !isGlobalAdmin(me)) return send(ws, { t: "err", code: "forbidden" });
          db.messages.splice(index, 1);
          saveDb();
          const recipients = [msg.from, msg.to];
          recipients.forEach((id) => sendTo(id, { t: "msg:delete", scope: "dm", messageId }));
        } else {
          const index = db.channelMessages.findIndex((x) => x.id === messageId);
          if (index === -1) return;
          const msg = db.channelMessages[index];
          const comm = db.communities.find((entry) => entry.id === msg.communityId);
          const isOwner = comm && comm.ownerId === me.id;
          const isAdmin = comm && comm.admins?.includes(me.id);
          const hasPerm = comm && (hasCommunityPermission(comm, me, "manageMessages") || hasCommunityPermission(comm, me, "canManageMessages"));
          const isAuthor = msg.from === me.id;
          if (!isAuthor && !isOwner && !isAdmin && !hasPerm && !isGlobalAdmin(me)) return send(ws, { t: "err", code: "forbidden" });
          db.channelMessages.splice(index, 1);
          saveDb();
          if (comm) {
            comm.members.forEach((memberId) => sendTo(memberId, { t: "msg:delete", scope: "channel", messageId, channelId: msg.channelId }));
            if (!comm.members.includes(me.id)) send(ws, { t: 'msg:delete', scope: 'channel', messageId, channelId: msg.channelId });
          }
        }
        break;
      }

      case "reaction:toggle": {
        if (!authed()) return;
        if (authRateLimited(`reaction:${me.id}`, 90, 10_000)) return send(ws, { t: "err", code: "rate_limit" });
        const emoji = String(m.emoji || "");
        if (!["👍", "❤️", "😂", "🎉", "👀", "🔥"].includes(emoji)) return;
        const scope = m.scope === "channel" ? "channel" : "dm";
        const store = scope === "channel" ? db.channelMessages : db.messages;
        const target = store.find((entry) => entry.id === String(m.messageId || ""));
        if (!target) return;
        let recipients;
        if (scope === "dm") {
          if ((target.from !== me.id && target.to !== me.id) || usersBlockEachOther(target.from, target.to)) return;
          recipients = [target.from, target.to];
        } else {
          const comm = db.communities.find((entry) => entry.id === target.communityId);
          const channel = comm?.channels.find((entry) => entry.id === target.channelId);
          if (!comm || (!comm.members.includes(me.id) && !isGlobalAdmin(me)) || (!isGlobalAdmin(me) && channel?.deniedUsers?.includes(me.id))) return;
          recipients = comm.members;
        }
        const reactions = target.reactions || (target.reactions = {});
        const users = new Set(reactions[emoji] || []);
        if (users.has(me.id)) users.delete(me.id); else users.add(me.id);
        if (users.size) reactions[emoji] = [...users]; else delete reactions[emoji];
        if (!Object.keys(reactions).length) delete target.reactions;
        saveDb();
        recipients.forEach((id) => sendTo(id, { t: "reaction:update", scope, msg: target }));
        break;
      }

      case "poll:create": {
        if (!authed()) return;
        if (authRateLimited(`poll:${me.id}`, 5, 60_000)) return send(ws, { t: "err", code: "rate_limit" });
        const scope = m.scope === "channel" ? "channel" : "dm";
        const question = String(m.question || "").trim().slice(0, 180);
        const options = Array.isArray(m.options) ? [...new Set(m.options.map((value) => String(value).trim().slice(0, 100)).filter(Boolean))].slice(0, 8) : [];
        if (!question || options.length < 2) return send(ws, { t: "err", code: "poll_invalid" });
        let msg, recipients;
        if (scope === "dm") {
          const to = String(m.destinationId || "");
          if (!allowsDirectContact(me.id, to)) return send(ws, { t: "err", code: "user_blocked" });
          msg = { id: uid(), from: me.id, to, text: question, poll: { question, options, votes: {} }, at: now() };
          db.messages.push(msg);
          recipients = [me.id, to];
        } else {
          const comm = db.communities.find((entry) => entry.id === String(m.destinationId || ""));
          const channel = comm?.channels.find((entry) => entry.id === String(m.channelId || "") && entry.type === "text");
          if (!canReadChannel(comm, channel, me) || !canUseCommunityFeature(comm, me, 'sendMessages') || (comm.suspended && !isGlobalAdmin(me))) return send(ws, { t: 'err', code: 'member_permission' });
          msg = { id: uid(), communityId: comm.id, channelId: channel.id, from: me.id, text: question, poll: { question, options, votes: {} }, at: now() };
          db.channelMessages.push(msg);
          recipients = comm.members;
        }
        trimMessageStores();
        saveDb();
        recipients.forEach((id) => sendTo(id, { t: scope === "dm" ? "msg" : "community:msg", msg }));
        if (!recipients.includes(me.id)) send(ws, { t: scope === 'dm' ? 'msg' : 'community:msg', msg });
        break;
      }

      case "poll:vote": {
        if (!authed()) return;
        if (authRateLimited(`pollvote:${me.id}`, 45, 10_000)) return send(ws, { t: "err", code: "rate_limit" });
        const scope = m.scope === "channel" ? "channel" : "dm";
        const store = scope === "channel" ? db.channelMessages : db.messages;
        const msg = store.find((entry) => entry.id === String(m.messageId || "") && entry.poll);
        if (!msg) return;
        let recipients;
        if (scope === "dm") {
          if ((msg.from !== me.id && msg.to !== me.id) || usersBlockEachOther(msg.from, msg.to)) return;
          recipients = [msg.from, msg.to];
        } else {
          const comm = db.communities.find((entry) => entry.id === msg.communityId);
          const channel = comm?.channels.find((entry) => entry.id === msg.channelId);
          if (!comm || (!comm.members.includes(me.id) && !isGlobalAdmin(me)) || (!isGlobalAdmin(me) && channel?.deniedUsers?.includes(me.id))) return;
          recipients = comm.members;
        }
        const option = Number(m.option);
        if (!Number.isInteger(option) || option < 0 || option >= msg.poll.options.length) return;
        const votes = msg.poll.votes || (msg.poll.votes = {});
        if (votes[me.id] === option) delete votes[me.id]; else votes[me.id] = option;
        saveDb();
        recipients.forEach((id) => sendTo(id, { t: "poll:update", scope, msg }));
        break;
      }

      case "typing": {
        if (!authed()) return;
        const to = String(m.to || "");
        if (!usersBlockEachOther(me.id, to)) sendTo(to, { t: "typing", from: me.id });
        break;
      }

      // ==========================================
      // ===== COMUNIDADES & GRUPOS (DISCORD) =====
      // ==========================================
      case "community:create": {
        if (!authed()) return;
        if (authRateLimited(`communitycreate:${me.id}`, 10, 60_000)) return send(ws, { t: 'err', code: 'rate_limit' });
        const name = String(m.name || "").trim().slice(0, 40);
        if (!name) return;
        const directGroup = m.directGroup === true;
        const memberIds = directGroup && Array.isArray(m.memberIds) ? [...new Set(m.memberIds.filter((id) => typeof id === 'string' && id !== me.id))] : [];
        if (directGroup && (memberIds.length < 2 || memberIds.length > 49 || memberIds.some((id) => !visibleUsersFor(me.id).some((user) => user.id === id) || usersBlockEachOther(me.id, id)))) return send(ws, { t: 'err', code: 'member_permission' });
        const isPublic = !directGroup && !!m.isPublic;
        const rawIcon = String(m.icon || '').trim();
        if (/^(?:data:|https?:|blob:)/i.test(rawIcon) && !safeProfileImage(rawIcon)) return send(ws, { t: 'err', code: 'invalid_image' });
        const icon = safeProfileImage(rawIcon) || rawIcon.slice(0, 4) || name.charAt(0).toUpperCase();
        const description = String(m.description || "").trim().slice(0, 150);
        const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();

        const community = {
          id: `comm-${uid()}`,
          name,
          icon,
          description,
          directGroup,
          isPublic,
          ownerId: me.id,
          inviteCode,
          members: [me.id, ...memberIds],
          membershipPrivacyMigrated: true,
          channels: [
            { id: `chan-${uid()}`, name: "geral", type: "text" },
            { id: `chan-${uid()}`, name: "call", type: "voice" },
          ],
          createdAt: now(),
        };

        db.communities.push(community);
        saveDb();

        // Notificar criador
        send(ws, { t: "community:created", community, requestId: ws.responseRequestId });

        // Atualizar lista para todos se for pública, ou apenas para o criador
        for (const [uidKey, userWs] of conns.entries()) {
          if (isPublic || community.members.includes(uidKey) || isGlobalAdmin(findUser(uidKey))) {
            send(userWs, { t: "communities:update", communities: getCommunitiesForUser(uidKey) });
          }
        }
        if (isPublic) broadcastPublicCommunities();
        if (directGroup) broadcastUsers();
        break;
      }

      case "community:join": {
        if (!authed()) return;
        const query = String(m.code || "").trim().toUpperCase();
        const target = db.communities.find(
          (c) =>
            (c.isPublic && c.id === m.code) ||
            c.inviteCode.toUpperCase() === query ||
            (c.isPublic && c.name.toLowerCase() === String(m.code).toLowerCase())
        );
        if (!target) {
          return send(ws, { t: "err", code: "invite_invalid" });
        }
        if (target.suspended && !isGlobalAdmin(me)) return send(ws, { t: 'err', code: 'community_suspended' });
        if (!target.members.includes(me.id)) {
          if (target.directGroup && target.members.length >= 50) return send(ws, { t: 'err', code: 'group_full' });
          target.members.push(me.id);
          // Atribuir cargo predefinido (default role) se configurado
          if (target.defaultRoleId && (target.roles || []).some((r) => r.id === target.defaultRoleId)) {
            target.memberRoles = target.memberRoles || {};
            target.memberRoles[me.id] = target.memberRoles[me.id] || [];
            if (!target.memberRoles[me.id].includes(target.defaultRoleId)) {
              target.memberRoles[me.id].push(target.defaultRoleId);
            }
          }
          saveDb();
        }

        // Atualizar lista de comunidades do utilizador
        send(ws, {
          t: "community:joined",
          community: target,
          communities: getCommunitiesForUser(me.id),
          channelMessages: getChannelMessagesForUser(me.id),
        });

        // Notificar outros membros online
        target.members.forEach((memId) => {
          sendTo(memId, { t: "community:update", community: target });
        });
        if (target.isPublic) broadcastPublicCommunities();
        broadcastUsers();
        break;
      }

      case "community:member:add": {
        if (!authed()) return;
        if (authRateLimited(`invite:${me.id}`, 20, 60_000)) return send(ws, { t: "err", code: "rate_limit" });
        const comm = db.communities.find((c) => c.id === m.communityId);
        const canInvite = comm && (
          comm.ownerId === me.id ||
          comm.admins?.includes(me.id) ||
          isGlobalAdmin(me) ||
          comm.allowMemberInvites ||
          hasCommunityPermission(comm, me, "inviteMembers")
        );
        if (!comm || !comm.members.includes(me.id) || !canInvite) return send(ws, { t: "err", code: "member_permission" });
        const username = String(m.username || "").trim().replace(/^@/, "").toLowerCase();
        const targetUser = db.users.find((user) => user.username === username);
        if (!targetUser) return send(ws, { t: "err", code: "user_not_found" });
        if (usersBlockEachOther(me.id, targetUser.id)) return send(ws, { t: 'err', code: 'user_blocked' });
        if (!comm.members.includes(targetUser.id)) {
          if (comm.directGroup && comm.members.length >= 50) return send(ws, { t: 'err', code: 'group_full' });
          comm.members.push(targetUser.id);
          // Atribuir cargo predefinido (default role) se configurado
          if (comm.defaultRoleId && (comm.roles || []).some((r) => r.id === comm.defaultRoleId)) {
            comm.memberRoles = comm.memberRoles || {};
            comm.memberRoles[targetUser.id] = comm.memberRoles[targetUser.id] || [];
            if (!comm.memberRoles[targetUser.id].includes(comm.defaultRoleId)) {
              comm.memberRoles[targetUser.id].push(comm.defaultRoleId);
            }
          }
          saveDb();
        }
        sendTo(targetUser.id, {
          t: "community:joined",
          community: comm,
          communities: getCommunitiesForUser(targetUser.id),
          channelMessages: getChannelMessagesForUser(targetUser.id),
        });
        comm.members.forEach((memberId) => sendTo(memberId, { t: "community:update", community: comm }));
        send(ws, { t: "community:member:added", communityId: comm.id, username: targetUser.username, displayName: targetUser.displayName, requestId: ws.responseRequestId });
        broadcastUsers();
        break;
      }

      case "community:update": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        const fail = (code) => send(ws, { t: 'err', code, requestId: typeof m.requestId === 'string' ? m.requestId.slice(0, 64) : undefined });
        if (!canManageCommunity(comm, me)) return fail('member_permission');
        if (comm.directGroup && m.isPublic === true) return fail('member_permission');
        if (m.defaultRoleId !== undefined && m.defaultRoleId !== comm.defaultRoleId) {
          const role = (comm.roles || []).find((entry) => entry.id === m.defaultRoleId);
          if (m.defaultRoleId && (!role || !canGrantRole(comm, me, role.permissions))) return fail('member_permission');
        }
        if (m.icon !== undefined && /^(?:data:|https?:|blob:)/i.test(String(m.icon).trim()) && !safeProfileImage(String(m.icon).trim())) return fail('invalid_request');
        if (m.bannerUrl && !safeProfileImage(String(m.bannerUrl).trim(), true)) return fail('invalid_request');
        const original = { ...comm };
        if (m.name) comm.name = String(m.name).trim().slice(0, 40) || comm.name;
        if (m.icon !== undefined) {
          const icon = String(m.icon).trim();
          comm.icon = safeProfileImage(icon) || icon.slice(0, 4);
        }
        if (m.bannerUrl !== undefined) comm.bannerUrl = safeProfileImage(String(m.bannerUrl).trim(), true) || "";
        if (Number.isFinite(m.bannerPosition)) comm.bannerPosition = Math.max(0, Math.min(100, Math.round(m.bannerPosition)));
        if (m.description !== undefined) comm.description = String(m.description).trim().slice(0, 200);
        if (m.isPublic !== undefined) comm.isPublic = !!m.isPublic;
        if (m.defaultRoleId !== undefined) {
          const role = (comm.roles || []).find((entry) => entry.id === m.defaultRoleId);
          comm.defaultRoleId = role?.id || null;
        }
        if (m.allowMemberInvites !== undefined) comm.allowMemberInvites = !!m.allowMemberInvites;
        if (m.bannerColor !== undefined) { const color = /^#[0-9a-f]{6}$/i.test(String(m.bannerColor)) ? String(m.bannerColor) : ''; comm.bannerColor = color; }
        try { writeDb(); } catch { Object.keys(comm).forEach((key) => delete comm[key]); Object.assign(comm, original); return fail('save_failed'); }
        if (typeof m.requestId === 'string') send(ws, { t: 'community:saved', communityId: comm.id, requestId: ws.responseRequestId.slice(0, 64) });
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        broadcastCommunities();
        broadcastPublicCommunities();
        break;
      }

      case "community:delete": {
        if (!authed()) return;
        const commIndex = db.communities.findIndex((c) => c.id === m.communityId);
        if (commIndex === -1) return;
        const comm = db.communities[commIndex];
        if (comm.ownerId !== me.id && !isGlobalAdmin(me)) return send(ws, { t: "err", code: "member_permission" });
        db.communities.splice(commIndex, 1);
        for (const channel of comm.channels) {
          for (const memberId of voiceChannels.get(channel.id) || []) sendTo(memberId, { t: 'voice:kicked', channelId: channel.id, by: me.id });
          voiceChannels.delete(channel.id);
        }
        broadcastVoiceState();
        db.channelMessages = db.channelMessages.filter((msg) => msg.communityId !== comm.id);
        saveDb();
        comm.members.forEach((memId) => {
          sendTo(memId, { t: "community:deleted", communityId: comm.id });
          sendTo(memId, { t: "communities:update", communities: getCommunitiesForUser(memId) });
        });
        broadcastPublicCommunities();
        break;
      }

      case "community:public:list": {
        if (!authed()) return;
        send(ws, { t: "community:public:list", communities: getPublicCommunities() });
        break;
      }

      case "community:admin:set": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        const target = findUser(String(m.userId || ""));
        if (!comm || comm.ownerId !== me.id || !target || target.id === comm.ownerId || !comm.members.includes(target.id)) return send(ws, { t: "err", code: "member_permission" });
        const admins = new Set(comm.admins || []);
        if (m.enabled) admins.add(target.id); else admins.delete(target.id);
        comm.admins = [...admins];
        saveDb();
        comm.members.forEach((memberId) => sendTo(memberId, { t: "community:update", community: comm }));
        break;
      }

      case "community:channel:create": {
        if (!authed()) return;
        const { communityId, name, type, categoryId } = m;
        const comm = db.communities.find((c) => c.id === communityId);
        if (!canManageChannels(comm, me)) return send(ws, { t: "err", code: "member_permission" });

        const cleanName = String(name || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
        if (!cleanName) return;

        const chan = {
          id: `chan-${uid()}`,
          name: cleanName,
          type: ["voice", "announcement"].includes(String(type)) ? String(type) : "text",
          categoryId: categoryId ? String(categoryId) : undefined,
          position: comm.channels.length,
        };
        comm.channels.push(chan);
        saveDb();

        comm.members.forEach((memId) => {
          sendTo(memId, { t: "community:update", community: comm });
        });
        break;
      }

      case "community:channel:update": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageChannels(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const channel = comm?.channels.find((c) => c.id === m.channelId);
        if (!channel) return;
        if (m.name) {
          channel.name = String(m.name).trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30) || channel.name;
        }
        if (m.type && ["text", "voice", "announcement"].includes(m.type)) {
          channel.type = m.type;
        }
        if (m.categoryId !== undefined) {
          channel.categoryId = m.categoryId ? String(m.categoryId) : undefined;
        }
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        break;
      }

      case "community:channel:delete": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageChannels(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const idx = comm.channels.findIndex((c) => c.id === m.channelId);
        if (idx === -1 || comm.channels.length <= 1) return send(ws, { t: "err", code: "cannot_delete_last_channel" });
        const [removedChan] = comm.channels.splice(idx, 1);
        db.channelMessages = db.channelMessages.filter((msg) => msg.channelId !== removedChan.id);
        if (removedChan.type === "voice") {
          for (const memberId of voiceChannels.get(removedChan.id) || []) sendTo(memberId, { t: 'voice:kicked', channelId: removedChan.id, by: me.id });
          voiceChannels.delete(removedChan.id);
          broadcastVoiceState();
        }
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        break;
      }

      case "community:category:create": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageChannels(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const name = String(m.name || "").trim().slice(0, 30);
        if (!name) return;
        comm.categories = comm.categories || [];
        comm.categories.push({ id: `cat-${uid()}`, name, position: comm.categories.length });
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        break;
      }

      case "community:category:update": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageChannels(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const category = (comm.categories || []).find((cat) => cat.id === m.categoryId);
        if (!category) return;
        const name = String(m.name || "").trim().slice(0, 30);
        if (name) category.name = name;
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        break;
      }

      case "community:category:delete": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageChannels(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        comm.categories = (comm.categories || []).filter((cat) => cat.id !== m.categoryId);
        comm.channels.forEach((ch) => {
          if (ch.categoryId === m.categoryId) delete ch.categoryId;
        });
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        break;
      }

      case "community:structure:reorder": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageChannels(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        if (Array.isArray(m.channels)) {
          const chanMap = new Map(comm.channels.map((c) => [c.id, c]));
          const nextChannels = [];
          m.channels.forEach((updatedChan, idx) => {
            const existing = chanMap.get(updatedChan.id);
            if (existing) {
              existing.position = idx;
              existing.categoryId = updatedChan.categoryId || undefined;
              nextChannels.push(existing);
              chanMap.delete(updatedChan.id);
            }
          });
          for (const remaining of chanMap.values()) nextChannels.push(remaining);
          comm.channels = nextChannels;
        }
        if (Array.isArray(m.categories)) {
          const catMap = new Map((comm.categories || []).map((cat) => [cat.id, cat]));
          const nextCategories = [];
          m.categories.forEach((updatedCat, idx) => {
            const existing = catMap.get(updatedCat.id);
            if (existing) {
              existing.position = idx;
              if (updatedCat.name) existing.name = updatedCat.name;
              nextCategories.push(existing);
              catMap.delete(updatedCat.id);
            }
          });
          for (const remaining of catMap.values()) nextCategories.push(remaining);
          comm.categories = nextCategories;
        }
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        break;
      }

      case "community:leave": {
        if (!authed()) return;
        const comm = db.communities.find((entry) => entry.id === m.communityId);
        if (!comm || !comm.members.includes(me.id)) return send(ws, { t: 'err', code: 'member_permission' });
        if (comm.ownerId === me.id) return send(ws, { t: 'err', code: 'owner_must_transfer' });
        comm.members = comm.members.filter((id) => id !== me.id);
        comm.admins = (comm.admins || []).filter((id) => id !== me.id);
        if (comm.memberRoles) delete comm.memberRoles[me.id];
        for (const channel of comm.channels) {
          const members = voiceChannels.get(channel.id);
          if (members?.delete(me.id)) send(ws, { t: 'voice:kicked', channelId: channel.id, by: me.id });
          if (members?.size === 0) voiceChannels.delete(channel.id);
        }
        saveDb();
        send(ws, { t: 'community:left', communityId: comm.id, requestId: ws.responseRequestId });
        broadcastCommunities(); broadcastUsers(); broadcastVoiceState();
        break;
      }

      case "community:member:kick": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        const targetId = String(m.userId || "");
        if (!comm || targetId === comm.ownerId) return send(ws, { t: "err", code: "cannot_kick_owner" });
        const canKick = isGlobalAdmin(me) || comm.ownerId === me.id || comm.admins?.includes(me.id) || hasCommunityPermission(comm, me, "kickMembers");
        if (!canKick) return send(ws, { t: "err", code: "member_permission" });
        const target = findUser(targetId);
        if ((isGlobalAdmin(target) && !isGlobalAdmin(me)) || (hasCommunityPermission(comm, target, 'administrator') && comm.ownerId !== me.id && !isGlobalAdmin(me))) return send(ws, { t: 'err', code: 'member_permission' });
        comm.members = comm.members.filter((id) => id !== targetId);
        comm.admins = (comm.admins || []).filter((id) => id !== targetId);
        if (comm.memberRoles) delete comm.memberRoles[targetId];
        comm.channels.forEach((ch) => {
          if (ch.deniedUsers) ch.deniedUsers = ch.deniedUsers.filter((id) => id !== targetId);
          if (voiceChannels.get(ch.id)?.delete(targetId)) sendTo(targetId, { t: 'voice:kicked', channelId: ch.id, by: me.id });
          if (voiceChannels.get(ch.id)?.size === 0) voiceChannels.delete(ch.id);
        });
        broadcastVoiceState();
        broadcastUsers();
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        sendTo(targetId, { t: "community:kicked", communityId: comm.id });
        sendTo(targetId, { t: "communities:update", communities: getCommunitiesForUser(targetId) });
        break;
      }

      case "community:role:create": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageRoles(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const name = String(m.name || "Novo Cargo").trim().slice(0, 30);
        const color = String(m.color || "#3b82f6").trim().slice(0, 20);
        const permissions = rolePermissions(m.permissions);
        if (!canGrantRole(comm, me, permissions)) return send(ws, { t: 'err', code: 'member_permission' });
        comm.roles = comm.roles || [];
        comm.roles.push({ id: `role-${uid()}`, name, color, permissions });
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        broadcastVoiceState();
        break;
      }

      case "community:role:update": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageRoles(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const role = (comm.roles || []).find((r) => r.id === m.roleId);
        if (!role) return;
        if (!canGrantRole(comm, me, role.permissions) || (m.permissions && !canGrantRole(comm, me, rolePermissions(m.permissions)))) return send(ws, { t: 'err', code: 'member_permission' });
        if (m.name) role.name = String(m.name).trim().slice(0, 30);
        if (m.color) role.color = String(m.color).trim().slice(0, 20);
        if (typeof m.permissions === "object" && m.permissions) role.permissions = rolePermissions(m.permissions);
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        broadcastVoiceState();
        break;
      }

      case "community:role:delete": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageRoles(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const role = (comm.roles || []).find((entry) => entry.id === m.roleId);
        if (!role || !canGrantRole(comm, me, role.permissions)) return send(ws, { t: 'err', code: 'member_permission' });
        comm.roles = (comm.roles || []).filter((r) => r.id !== m.roleId);
        if (comm.defaultRoleId === m.roleId) comm.defaultRoleId = null;
        if (comm.memberRoles) {
          for (const uidKey of Object.keys(comm.memberRoles)) {
            comm.memberRoles[uidKey] = (comm.memberRoles[uidKey] || []).filter((rid) => rid !== m.roleId);
          }
        }
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        broadcastVoiceState();
        break;
      }

      case "community:member:roles:set": {
        if (!authed()) return;
        const comm = db.communities.find((c) => c.id === m.communityId);
        if (!canManageRoles(comm, me)) return send(ws, { t: "err", code: "member_permission" });
        const targetId = String(m.userId || "");
        if (!comm.members.includes(targetId)) return;
        const requestedIds = Array.isArray(m.roleIds) ? [...new Set(m.roleIds.filter((id) => typeof id === 'string'))] : [];
        const affectedIds = new Set([...(comm.memberRoles?.[targetId] || []), ...requestedIds]);
        if (requestedIds.some((id) => !(comm.roles || []).some((role) => role.id === id)) || [...affectedIds].some((id) => !canGrantRole(comm, me, (comm.roles || []).find((role) => role.id === id)?.permissions))) return send(ws, { t: 'err', code: 'member_permission' });
        comm.memberRoles = comm.memberRoles || {};
        comm.memberRoles[targetId] = requestedIds;
        saveDb();
        comm.members.forEach((memId) => sendTo(memId, { t: "community:update", community: comm }));
        broadcastVoiceState();
        break;
      }

      case "community:channel:access": {
        if (!authed()) return;
        const { communityId, channelId, userId } = m;
        const comm = db.communities.find((c) => c.id === communityId);
        const channel = comm?.channels.find((c) => c.id === channelId);
        if (!comm || !channel || (comm.ownerId !== me.id && !comm.admins?.includes(me.id) && !isGlobalAdmin(me)) || !comm.members.includes(userId)) return;
        const denied = new Set(channel.deniedUsers || []);
        if (m.allowed === false) denied.add(userId); else denied.delete(userId);
        channel.deniedUsers = [...denied];
        if (denied.has(userId)) {
          const members = voiceChannels.get(channelId);
          if (members?.delete(userId)) sendTo(userId, { t: 'voice:kicked', channelId, by: me.id });
          if (members?.size === 0) voiceChannels.delete(channelId);
        }
        saveDb();
        comm.members.forEach((memberId) => sendTo(memberId, { t: "community:update", community: comm }));
        broadcastVoiceState();
        break;
      }

      case "community:msg": {
        if (!authed()) return;
        if (authRateLimited(`channelmsg:${me.id}`, 30, 10_000)) return send(ws, { t: 'err', code: 'rate_limit' });
        if (me.accountStatus === "restricted" || me.accountStatus === "suspended") return send(ws, { t: "err", code: "account_restricted" });
        const { communityId, channelId } = m;
        const text = String(m.text || "").trim().slice(0, MAX_MSG_LEN);
        const comm = db.communities.find((c) => c.id === communityId);
        if (!comm || (!comm.members.includes(me.id) && !isGlobalAdmin(me))) return send(ws, { t: 'err', code: 'member_permission' });
        if (!text) return send(ws, { t: 'err', code: 'invalid_request' });
        if (comm.suspended && !isGlobalAdmin(me)) return send(ws, { t: "err", code: "community_suspended" });
        const chan = comm.channels.find((ch) => ch.id === channelId && ["text", "announcement"].includes(ch.type));
        if (!canReadChannel(comm, chan, me) || !canUseCommunityFeature(comm, me, 'sendMessages')) return send(ws, { t: 'err', code: 'member_permission' });
        if (chan.type === "announcement" && !hasCommunityPermission(comm, me, 'administrator')) return send(ws, { t: "err", code: "announcement_readonly" });

        const msg = {
          id: uid(),
          communityId,
          channelId,
          from: me.id,
          text,
          at: now(),
        };

        db.channelMessages.push(msg);
        if (db.channelMessages.length > MAX_MSGS_PER_CONV * 50) {
          db.channelMessages = db.channelMessages.slice(-MAX_MSGS_PER_CONV * 40);
        }
        saveDb();

        // Enviar para todos os membros online da comunidade
        comm.members.forEach((memId) => {
          sendTo(memId, { t: "community:msg", msg });
        });
        if (!comm.members.includes(me.id)) send(ws, { t: 'community:msg', msg });
        break;
      }

      // ==========================================
      // ===== CANAIS DE VOZ (DISCORD VOICE) ======
      // ==========================================
      case "voice:join": {
        if (!authed()) return;
        const channelId = String(m.channelId || "");
        const comm = db.communities.find((c) => c.channels.some((ch) => ch.id === channelId && ch.type === "voice"));
        const channel = comm?.channels.find((c) => c.id === channelId);
        if (!canReadChannel(comm, channel, me) || !canUseCommunityFeature(comm, me, 'connectVoice')) {
          return send(ws, { t: "err", code: "voice_forbidden" });
        }
        if (comm.suspended && !isGlobalAdmin(me)) {
          return send(ws, { t: "err", code: "community_suspended" });
        }

        // Remover utilizador de qualquer canal anterior
        for (const [cId, set] of voiceChannels.entries()) {
          set.delete(me.id);
          if (set.size === 0) voiceChannels.delete(cId);
        }

        if (!voiceChannels.has(channelId)) {
          voiceChannels.set(channelId, new Set());
        }
        voiceChannels.get(channelId).add(me.id);

        broadcastVoiceState();
        break;
      }

      case "voice:leave": {
        if (!authed()) return;
        const { channelId } = m;
        if (channelId && voiceChannels.has(channelId)) {
          voiceChannels.get(channelId).delete(me.id);
          if (voiceChannels.get(channelId).size === 0) {
            voiceChannels.delete(channelId);
          }
        } else {
          for (const [cId, set] of voiceChannels.entries()) {
            set.delete(me.id);
            if (set.size === 0) voiceChannels.delete(cId);
          }
        }
        broadcastVoiceState();
        break;
      }

      case "voice:signal": {
        if (!authed()) return;
        const to = String(m.to || "");
        const channelId = String(m.channelId || "");
        if (!voiceChannels.get(channelId)?.has(me.id) || !voiceChannels.get(channelId)?.has(to)) return;
        if (!m.data || typeof m.data !== 'object') return;
        if (m.data.media && (!Array.isArray(m.data.media) || m.data.media.length > 4 || m.data.media.some((state) => !state || typeof state.mid !== 'string' || state.mid.length > 16 || !['microphone', 'camera', 'screen', 'screenAudio'].includes(state.kind) || typeof state.active !== 'boolean'))) return;
        sendTo(to, { t: "voice:signal", from: me.id, channelId, data: m.data });
        break;
      }

      case "voice:user:kick": {
        if (!authed()) return;
        const channelId = String(m.channelId || "");
        const targetUserId = String(m.userId || "");
        const comm = db.communities.find((c) => c.channels.some((ch) => ch.id === channelId && ch.type === "voice"));
        if (!comm) return send(ws, { t: "err", code: "community_not_found" });

        const canKickVoice =
          isGlobalAdmin(me) ||
          comm.ownerId === me.id ||
          comm.admins?.includes(me.id) ||
          hasCommunityPermission(comm, me, "kickVoiceMembers") ||
          hasCommunityPermission(comm, me, "kickMembers");

        if (!canKickVoice) return send(ws, { t: "err", code: "permission_denied" });

        // Não permitir expulsar o dono do servidor
        if (targetUserId === comm.ownerId && !isGlobalAdmin(me) && me.id !== comm.ownerId) {
          return send(ws, { t: "err", code: "cannot_kick_owner" });
        }

        const channelMembers = voiceChannels.get(channelId);
        if (channelMembers?.has(targetUserId)) {
          channelMembers.delete(targetUserId);
          if (channelMembers.size === 0) voiceChannels.delete(channelId);
          broadcastVoiceState();
          sendTo(targetUserId, { t: "voice:kicked", channelId, by: me.id });
        }
        break;
      }

      case "voice:user:mute": {
        if (!authed()) return;
        const channelId = String(m.channelId || "");
        const targetUserId = String(m.userId || "");
        const muted = m.muted !== false;
        const comm = db.communities.find((c) => c.channels.some((ch) => ch.id === channelId && ch.type === "voice"));
        if (!comm) return send(ws, { t: "err", code: "community_not_found" });

        const canMuteVoice =
          isGlobalAdmin(me) ||
          comm.ownerId === me.id ||
          comm.admins?.includes(me.id) ||
          hasCommunityPermission(comm, me, "muteVoiceMembers") ||
          hasCommunityPermission(comm, me, "kickVoiceMembers");

        if (!canMuteVoice) return send(ws, { t: "err", code: "permission_denied" });

        // Não permitir mutar o dono do servidor
        if (targetUserId === comm.ownerId && !isGlobalAdmin(me) && me.id !== comm.ownerId) {
          return send(ws, { t: "err", code: "cannot_mute_owner" });
        }

        const channelMembers = voiceChannels.get(channelId);
        if (channelMembers?.has(targetUserId)) {
          sendTo(targetUserId, { t: "voice:muted", channelId, by: me.id, muted });
          send(ws, { t: 'voice:moderation:confirmed', channelId, userId: targetUserId, muted, requestId: ws.responseRequestId });
        } else send(ws, { t: 'err', code: 'user_not_found' });
        break;
      }

      // ----- Sinalização WebRTC 1-para-1 direta -----
      case "call:invite": {
        if (!authed()) return;
        const to = String(m.to || "");
        if (!allowsDirectContact(me.id, to)) return send(ws, { t: 'err', code: 'user_blocked' });
        const pendingCallers = new Set(pendingCalls.values());
        if (activeCalls.has(me.id) || activeCalls.has(to) || pendingCalls.has(me.id) || pendingCalls.has(to) || pendingCallers.has(me.id) || pendingCallers.has(to)) return send(ws, { t: "call:busy", peerId: to });
        if (!conns.has(to)) return send(ws, { t: "call:offline", peerId: to });
        pendingCalls.set(to, me.id);
        pendingCallTimers.set(to, setTimeout(() => {
          if (pendingCalls.get(to) !== me.id) return;
          pendingCalls.delete(to);
          pendingCallTimers.delete(to);
          sendTo(me.id, { t: "call:timeout", peerId: to });
          sendTo(to, { t: "call:timeout", peerId: me.id });
        }, 45_000));
        sendTo(to, { t: "call:invite", from: me.id, user: publicUser(me, true), kind: m.kind === "video" ? "video" : "voice" });
        break;
      }
      case "call:accept": {
        if (!authed()) return;
        const to = String(m.to || "");
        if (pendingCalls.get(me.id) !== to || usersBlockEachOther(me.id, to) || activeCalls.has(me.id) || activeCalls.has(to)) return;
        pendingCalls.delete(me.id);
        clearTimeout(pendingCallTimers.get(me.id));
        pendingCallTimers.delete(me.id);
        activeCalls.set(me.id, to);
        activeCalls.set(to, me.id);
        sendTo(to, { t: "call:accept", from: me.id });
        break;
      }
      case "call:reject": {
        if (!authed()) return;
        const to = String(m.to || "");
        if (pendingCalls.get(me.id) !== to) return;
        pendingCalls.delete(me.id);
        clearTimeout(pendingCallTimers.get(me.id));
        pendingCallTimers.delete(me.id);
        sendTo(to, { t: "call:reject", from: me.id });
        break;
      }
      case "call:hangup": {
        if (!authed()) return;
        const to = String(m.to || "");
        if (activeCalls.get(me.id) === to && activeCalls.get(to) === me.id) {
          activeCalls.delete(me.id);
          activeCalls.delete(to);
          sendTo(to, { t: "call:hangup", from: me.id });
        } else if (pendingCalls.get(to) === me.id) {
          pendingCalls.delete(to);
          clearTimeout(pendingCallTimers.get(to));
          pendingCallTimers.delete(to);
          sendTo(to, { t: "call:hangup", from: me.id });
        } else if (pendingCalls.get(me.id) === to) {
          pendingCalls.delete(me.id);
          clearTimeout(pendingCallTimers.get(me.id));
          pendingCallTimers.delete(me.id);
          sendTo(to, { t: "call:hangup", from: me.id });
        }
        break;
      }
      case "signal": {
        if (!authed()) return;
        const to = String(m.to || "");
        if (activeCalls.get(me.id) !== to || activeCalls.get(to) !== me.id || usersBlockEachOther(me.id, to)) return;
        if (!m.data || typeof m.data !== "object" || (!m.data.description && !m.data.candidate && m.data.renegotiate !== true && !Array.isArray(m.data.media))) return;
        if (m.data.media && (!Array.isArray(m.data.media) || m.data.media.length > 4 || m.data.media.some((state) => !state || typeof state.mid !== 'string' || state.mid.length > 16 || !['microphone', 'camera', 'screen', 'screenAudio'].includes(state.kind) || typeof state.active !== 'boolean'))) return;
        sendTo(to, { t: "signal", from: me.id, data: m.data });
        break;
      }
    } } catch { send(ws, { t: 'err', code: 'invalid_request' }); } finally { if (ws.responseRequestId && !ws.failedCurrentRequest && isGlobalAdmin(me) && String(m.t).startsWith('community:')) { const changed = db.communities.find((entry) => entry.id === m.communityId); if (changed && !changed.members.includes(me.id)) send(ws, { t: 'community:update', community: changed }); } ws.responseRequestId = undefined; ws.failedCurrentRequest = false; immediateSave = false; }
  });

  ws.on("close", () => {
    clearTimeout(sessionDeadline);
    if (me && conns.get(me.id) === ws) {
      conns.delete(me.id);

      const activePeer = activeCalls.get(me.id);
      if (activePeer) {
        activeCalls.delete(me.id);
        if (activeCalls.get(activePeer) === me.id) activeCalls.delete(activePeer);
        sendTo(activePeer, { t: "call:hangup", from: me.id });
      }
      for (const [calleeId, callerId] of pendingCalls) {
        if (callerId === me.id || calleeId === me.id) {
          pendingCalls.delete(calleeId);
          clearTimeout(pendingCallTimers.get(calleeId));
          pendingCallTimers.delete(calleeId);
          sendTo(callerId === me.id ? calleeId : callerId, { t: "call:hangup", from: me.id });
        }
      }

      // Remover utilizador de salas de voz ativas
      for (const [cId, set] of voiceChannels.entries()) {
        if (set.has(me.id)) {
          set.delete(me.id);
          if (set.size === 0) voiceChannels.delete(cId);
        }
      }
      broadcastVoiceState();
      broadcastUsers();
    }
  });
});




