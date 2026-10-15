import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

test('Permissões, privacidade, chamadas e alterações de conta', { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuga-audit-'));
  const processHandle = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, TUGA_PORT: '0', TUGA_HOST: '127.0.0.1', TUGA_DATA_FILE: path.join(directory, 'data.json'), TUGA_JWT_SECRET: 'isolated-audit-secret-only' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let logs = '';
  processHandle.stderr.on('data', (chunk) => { logs += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${logs}`)), 5000);
    processHandle.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
    processHandle.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.ws.terminate();
    processHandle.kill();
    if (processHandle.exitCode === null) await once(processHandle, 'exit');
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('tuga-audit-')) throw new Error('Unsafe test cleanup path');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  async function client(username) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
    await once(ws, 'open');
    const item = {
      ws, inbox,
      send: (t, data = {}) => ws.send(JSON.stringify({ t, ...data })),
      async take(type, predicate = () => true, timeout = 2000) {
        const end = Date.now() + timeout;
        while (Date.now() < end) {
          const index = inbox.findIndex((event) => event.t === type && predicate(event));
          if (index >= 0) return inbox.splice(index, 1)[0];
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`Missing ${type}: ${JSON.stringify(inbox.map((event) => event.t))}`);
      },
      async absent(type, predicate = () => true) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(inbox.some((event) => event.t === type && predicate(event)), false, `Unexpected ${type}`);
      },
    };
    clients.push(item);
    item.send('register', { username, displayName: username, password: 'initial-password-123' });
    const auth = await item.take('auth');
    item.token = auth.token;
    item.id = auth.profile.id;
    item.send('session', { token: item.token });
    item.ready = await item.take('ready');
    return item;
  }
  const owner = await client('audit_owner');
  const alice = await client('audit_alice');
  const bob = await client('audit_bob');
  const outsider = await client('audit_outside');
  for (const account of [owner, alice, bob]) for (let index = 0; index < 110; index++) account.send('noop');
  for (const account of [owner, alice, bob]) {
    account.send('profile', { requestId: `same-network-${account.id}`, patch: {} });
    await account.take('profile', (event) => event.requestId === `same-network-${account.id}`);
    assert.equal(account.ws.readyState, WebSocket.OPEN, 'Legitimate clients sharing an IP do not exhaust each other’s frame budget');
  }
  assert.equal(alice.ready.profile.readReceiptsEnabled, false);
  owner.send('profile', { requestId: 'normalized-profile', patch: { displayName: '  Perfil de teste  ' } });
  const normalizedProfile = await owner.take('profile', (event) => event.requestId === 'normalized-profile');
  assert.equal(normalizedProfile.profile.displayName, 'Perfil de teste');
  owner.send('profile', { requestId: 'invalid-profile-image', patch: { displayName: 'Must not apply', avatarUrl: 'http://example.invalid/avatar.png' } });
  await owner.take('err', (event) => event.code === 'invalid_image' && event.requestId === 'invalid-profile-image');
  owner.send('profile', { requestId: 'read-profile', patch: {} });
  assert.equal((await owner.take('profile', (event) => event.requestId === 'read-profile')).profile.displayName, 'Perfil de teste');
  owner.send('profile', { requestId: 'custom-banner-color', patch: { bannerUrl: '#123abc' } });
  assert.equal((await owner.take('profile', (event) => event.requestId === 'custom-banner-color')).profile.bannerUrl, '#123abc');
  assert.equal(alice.ready.users.length, 0);
  assert.ok(alice.ready.publicCommunities.every((community) => community.members.length === 0 && community.channels.length === 0));

  const serverIcon = 'data:image/gif;base64,R0lGODlhAQABAIAAAAD/AP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  owner.send('community:create', { name: 'Private audit', isPublic: false, icon: serverIcon });
  const { community } = await owner.take('community:created');
  assert.equal(community.icon, serverIcon, 'Creation preserves the complete server image');
  owner.send('community:update', { communityId: community.id, requestId: 'bad-save', name: 'Must not persist', icon: 'data:image/svg+xml;base64,PHN2Zz4=' });
  const rejectedSave = await owner.take('err', (event) => event.requestId === 'bad-save');
  assert.equal(rejectedSave.code, 'invalid_request');
  owner.send('community:update', { communityId: community.id, requestId: 'good-save', description: 'Confirmed persistence' });
  await owner.take('community:saved', (event) => event.requestId === 'good-save');
  const savedCommunity = (await owner.take('community:update', (event) => event.community.description === 'Confirmed persistence')).community;
  assert.equal(savedCommunity.name, community.name, 'Rejected updates cannot partially change server identity');
  owner.send('community:update', { communityId: community.id, requestId: 'remove-server-image', icon: '' });
  await owner.take('community:saved', (event) => event.requestId === 'remove-server-image');
  assert.equal((await owner.take('community:update', (event) => event.requestId === 'remove-server-image')).community.icon, '');
  const channelId = community.channels.find((channel) => channel.type === 'text').id;
  outsider.send('community:join', { code: community.id });
  await outsider.take('err', (event) => event.code === 'invite_invalid');
  for (const member of [alice, bob]) {
    member.send('community:join', { code: community.inviteCode });
    await member.take('community:joined');
  }
  owner.send('community:channel:access', { communityId: community.id, channelId, userId: bob.id, allowed: false });
  const restrictedView = await bob.take('community:update', (event) => !event.community.channels.some((channel) => channel.id === channelId));
  assert.ok(restrictedView);
  owner.send('community:msg', { communityId: community.id, channelId, text: 'protected-message' });
  const message = (await owner.take('community:msg', (event) => event.msg.text === 'protected-message')).msg;
  await alice.take('community:msg', (event) => event.msg.id === message.id);
  await bob.absent('community:msg', (event) => event.msg.id === message.id);
  owner.send('reaction:toggle', { scope: 'channel', messageId: message.id, emoji: '👍' });
  await alice.take('reaction:update');
  await bob.absent('reaction:update');
  owner.send('poll:create', { scope: 'channel', destinationId: community.id, channelId, question: 'Protected poll', options: ['Yes', 'No'] });
  const poll = (await alice.take('community:msg', (event) => !!event.msg.poll)).msg;
  await bob.absent('community:msg', (event) => event.msg.id === poll.id);
  alice.send('poll:vote', { scope: 'channel', messageId: poll.id, option: 0 });
  await alice.take('poll:update');
  await bob.absent('poll:update');

  const voiceId = community.channels.find((channel) => channel.type === 'voice').id;
  bob.send('voice:join', { channelId: voiceId });
  await bob.take('voice:state', (event) => event.voiceState[voiceId]?.includes(bob.id));
  owner.send('community:channel:access', { communityId: community.id, channelId: voiceId, userId: bob.id, allowed: false });
  await bob.take('voice:kicked', (event) => event.channelId === voiceId);
  await bob.take('voice:state', (event) => !event.voiceState[voiceId]?.includes(bob.id));

  const uploaded = await fetch(`${base}/api/uploads`, { method: 'POST', headers: {
    authorization: `Bearer ${owner.token}`, 'x-target-type': 'channel', 'x-target-id': community.id, 'x-channel-id': channelId, 'x-file-name': 'audit.svg', 'x-file-type': 'image/svg+xml',
  }, body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
  assert.equal(uploaded.status, 201);
  const attachment = (await uploaded.json()).attachment;
  owner.send('file:share', { fileId: attachment.id });
  await alice.take('community:msg', (event) => event.msg.attachment?.id === attachment.id);
  await bob.absent('community:msg', (event) => event.msg.attachment?.id === attachment.id);
  const download = await fetch(`${base}/api/uploads/${attachment.id}`, { headers: { authorization: `Bearer ${alice.token}` } });
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  assert.match(download.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(`${base}/api/uploads/${attachment.id}`, { headers: { authorization: `Bearer ${bob.token}` } })).status, 404);
  assert.equal((await fetch(`${base}/api/uploads/${attachment.id}?token=${alice.token}`)).status, 401);

  owner.send('community:role:create', { communityId: community.id, name: 'Role manager', permissions: { manageRoles: true } });
  const roleCommunity = (await owner.take('community:update', (event) => event.community.roles?.some((role) => role.name === 'Role manager'))).community;
  const roleId = roleCommunity.roles.find((role) => role.name === 'Role manager').id;
  owner.send('community:member:roles:set', { communityId: community.id, userId: alice.id, roleIds: [roleId] });
  await alice.take('community:update', (event) => event.community.memberRoles?.[alice.id]?.includes(roleId));
  alice.send('community:role:create', { communityId: community.id, name: 'Escalation', permissions: { administrator: true } });
  await alice.take('err', (event) => event.code === 'member_permission');

  alice.send('call:invite', { to: bob.id, kind: 'voice' });
  await bob.take('call:invite');
  outsider.send('call:invite', { to: alice.id, kind: 'voice' });
  await outsider.take('call:busy');
  bob.send('call:accept', { to: alice.id });
  await alice.take('call:accept');
  outsider.send('signal', { to: bob.id, data: { candidate: {} } });
  await bob.absent('signal', (event) => event.from === outsider.id);
  alice.send('signal', { to: bob.id, data: { description: { type: 'offer', sdp: 'audit' } } });
  await bob.take('signal', (event) => event.from === alice.id);
  alice.send('call:hangup', { to: bob.id });
  await bob.take('call:hangup');

  owner.send('msg', { to: alice.id, text: 'Receipt audit' });
  const direct = (await alice.take('msg')).msg;
  alice.send('dm:read', { peerId: owner.id, throughAt: direct.at });
  await owner.absent('dm:read:update');
  alice.send('profile', { patch: { readReceiptsEnabled: true, allowMemberDMs: false } });
  await alice.take('profile');
  alice.send('dm:read', { peerId: owner.id, throughAt: direct.at });
  assert.ok((await owner.take('dm:read:update')).messageIds.includes(direct.id));
  alice.send('msg:delete', { scope: 'dm', messageId: direct.id });
  await alice.take('err', (event) => event.code === 'forbidden');
  outsider.send('msg', { to: alice.id, text: 'Disallowed new contact' });
  await outsider.take('err', (event) => event.code === 'user_blocked');
  owner.send('msg', { to: alice.id, text: 'Existing conversation still works' });
  await alice.take('msg', (event) => event.msg.text === 'Existing conversation still works');
  alice.send('user:block', { userId: owner.id, blocked: true });
  assert.ok((await alice.take('blocks:update')).users.some((user) => user.id === owner.id));
  owner.send('msg', { to: alice.id, text: 'Blocked direct message' });
  await owner.take('err', (event) => event.code === 'user_blocked');
  owner.send('call:invite', { to: alice.id, kind: 'voice' });
  await owner.take('err', (event) => event.code === 'user_blocked');
  alice.send('user:block', { userId: owner.id, blocked: false });
  assert.equal((await alice.take('blocks:update')).users.some((user) => user.id === owner.id), false);
  owner.send('community:channel:create', { communityId: community.id, name: 'Avisos', type: 'announcement', requestId: 'announcement-create' });
  const announcementCommunity = (await owner.take('community:update', (event) => event.requestId === 'announcement-create')).community;
  const announcementId = announcementCommunity.channels.find((channel) => channel.type === 'announcement').id;
  owner.send('community:role:create', { communityId: community.id, name: 'Server administrator', permissions: { administrator: true }, requestId: 'administrator-role' });
  const administratorCommunity = (await owner.take('community:update', (event) => event.requestId === 'administrator-role')).community;
  const administratorRole = administratorCommunity.roles.find((role) => role.name === 'Server administrator').id;
  owner.send('community:member:roles:set', { communityId: community.id, userId: alice.id, roleIds: [administratorRole] });
  await alice.take('community:update', (event) => event.community.memberRoles?.[alice.id]?.includes(administratorRole));
  alice.send('community:msg', { communityId: community.id, channelId: announcementId, text: 'Administrator announcement' });
  await alice.take('community:msg', (event) => event.msg.text === 'Administrator announcement');
  bob.send('community:msg', { communityId: community.id, channelId: announcementId, text: 'Not permitted' });
  await bob.take('err', (event) => event.code === 'announcement_readonly');
  owner.send('community:member:roles:set', { communityId: community.id, userId: alice.id, roleIds: [roleId] });
  await alice.take('community:update', (event) => event.community.memberRoles?.[alice.id]?.includes(roleId));

  owner.send('community:role:update', { communityId: community.id, roleId, permissions: { manageRoles: true, sendMessages: false, connectVoice: false } });
  await alice.take('community:update', (event) => event.community.roles?.some((role) => role.id === roleId && role.permissions.sendMessages === false));
  alice.send('community:msg', { communityId: community.id, channelId, text: 'Role should prevent this' });
  await alice.take('err', (event) => event.code === 'member_permission');
  alice.send('voice:join', { channelId: community.channels.find((channel) => channel.type === 'voice').id });
  await alice.take('err', (event) => event.code === 'voice_forbidden');

  alice.send('account:password', { currentPassword: 'wrong-password', newPassword: 'updated-password-123' });
  await alice.take('err', (event) => event.code === 'current_password');
  alice.send('account:password', { currentPassword: 'initial-password-123', newPassword: 'updated-password-123' });
  const changed = await alice.take('account:password:changed');
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${alice.token}` } })).status, 401);
  alice.token = changed.token;
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${alice.token}` } })).status, 200);
  alice.send('community:create', { name: 'Grupo inválido', directGroup: true, memberIds: [bob.id], requestId: 'group-too-small' });
  await alice.take('err', (event) => event.requestId === 'group-too-small');
  alice.send('community:create', { name: 'Grupo privado', directGroup: true, memberIds: [owner.id, bob.id], requestId: 'group-create' });
  const privateGroup = (await alice.take('community:created', (event) => event.requestId === 'group-create')).community;
  assert.equal(privateGroup.members.length, 3); assert.equal(privateGroup.isPublic, false);
  alice.send('community:update', { communityId: privateGroup.id, isPublic: true, requestId: 'group-public' });
  await alice.take('err', (event) => event.requestId === 'group-public');
  await outsider.absent('communities:update', (event) => event.communities.some((entry) => entry.id === privateGroup.id));
  bob.send('community:leave', { communityId: privateGroup.id, requestId: 'group-leave' });
  await bob.take('community:left', (event) => event.requestId === 'group-leave');
  const groupChannel = privateGroup.channels.find((channel) => channel.type === 'text').id;
  bob.send('community:msg', { communityId: privateGroup.id, channelId: groupChannel, text: 'After leaving', requestId: 'group-after-leave' });
  await bob.take('err', (event) => event.requestId === 'group-after-leave');
  alice.send('community:leave', { communityId: privateGroup.id, requestId: 'owner-leave' });
  await alice.take('err', (event) => event.code === 'owner_must_transfer' && event.requestId === 'owner-leave');
  owner.send('admin:user:status', { userId: bob.id, status: 'restricted' });
  await owner.take('admin:user:status:updated');
  bob.send('poll:vote', { scope: 'channel', messageId: poll.id, option: 1 });
  await bob.take('err', (event) => event.code === 'account_restricted');
  assert.equal((await fetch(`${base}/api/uploads`, { method: 'POST', headers: { authorization: `Bearer ${bob.token}` }, body: 'test' })).status, 403);
  owner.send('admin:user:status', { userId: bob.id, status: 'suspended' });
  await owner.take('admin:user:status:updated');
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${bob.token}` } })).status, 401);
  owner.send('community:structure:reorder', { communityId: community.id, channels: [null] });
  await owner.take('err', (event) => event.code === 'invalid_request');
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${owner.token}` } })).status, 200);
  const oversized = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(oversized, 'open');
  const closed = once(oversized, 'close');
  oversized.send('x'.repeat(1024 * 1024 + 1));
  await closed;
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${owner.token}` } })).status, 200);

  alice.send('user:search', { query: 'own', requestId: 'search-1' });
  const searchResult = await alice.take('user:search:result', (e) => e.requestId === 'search-1');
  assert.equal(searchResult.users.some((u) => u.username === 'audit_owner'), true);
  assert.equal(searchResult.users.some((u) => u.username === 'audit_bob'), false);
});
