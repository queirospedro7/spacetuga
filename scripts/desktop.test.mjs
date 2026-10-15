import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { desktopRuntime } from './desktop-runtime.mjs';

test('Desktop escolhe o serviço local ou a API configurada', () => {
  assert.equal(desktopRuntime(undefined), 'local');
  assert.equal(desktopRuntime(' '), 'local');
  assert.equal(desktopRuntime('https://api.example.test'), 'remote');
  assert.equal(desktopRuntime('http://127.0.0.1:8787'), 'remote');
  for (const value of ['javascript:alert(1)', 'https://user:secret@example.test', 'https://example.test/api', 'https://example.test/?token=test']) assert.throws(() => desktopRuntime(value));
});

test('Encerramento desktop guarda alterações pendentes', { timeout: 15000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuga-desktop-'));
  const dataFile = path.join(directory, 'data.json');
  const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, TUGA_DESKTOP: '1', TUGA_PORT: '0', TUGA_HOST: '127.0.0.1', TUGA_DATA_FILE: dataFile, TUGA_JWT_SECRET: 'isolated-desktop-test-secret' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let socket;
  t.after(async () => {
    socket?.terminate();
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('tuga-desktop-')) throw new Error('Unsafe cleanup path');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Desktop startup timeout')), 5000);
    child.stdout.on('data', (chunk) => { const match = String(chunk).match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Desktop server exited')); });
  });
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = []; socket.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
  async function take(type) { for (let attempt = 0; attempt < 200; attempt++) { const index = inbox.findIndex((event) => event.t === type); if (index >= 0) return inbox.splice(index, 1)[0]; await new Promise((resolve) => setTimeout(resolve, 10)); } throw new Error(`Missing desktop event: ${type}`); }
  await once(socket, 'open');
  socket.send(JSON.stringify({ t: 'register', username: 'desktop_user', displayName: 'Desktop', password: 'desktop-password-123' }));
  const auth = await take('auth');
  socket.send(JSON.stringify({ t: 'session', token: auth.token })); await take('ready');
  socket.send(JSON.stringify({ t: 'profile', patch: { displayName: 'Persistido ao fechar' } }));
  assert.equal((await take('profile')).profile.displayName, 'Persistido ao fechar');
  const exited = once(child, 'exit'); child.stdin.end('tuga-shutdown\n');
  assert.equal((await exited)[0], 0);
  const stored = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.equal(stored.users.find((user) => user.username === 'desktop_user').displayName, 'Persistido ao fechar');
});
