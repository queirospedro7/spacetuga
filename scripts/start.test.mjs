import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('start.bat inicia servidor e interface sem tocar nos dados existentes', { timeout: 45000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuga-start-'));
  const probe = net.createServer(); await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.platform === 'win32' ? 'cmd.exe' : process.execPath, process.platform === 'win32' ? ['/d', '/c', 'start.bat'] : ['scripts/start.mjs'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TUGA_PORT: String(port), TUGA_HOST: '127.0.0.1', TUGA_DATA_FILE: path.join(directory, 'data.json'), TUGA_JWT_SECRET: 'isolated-start-test-secret', TUGA_OPEN_BROWSER: 'false' } });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      if (process.platform === 'win32') { const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); await once(kill, 'exit'); }
      else child.kill('SIGTERM');
      if (child.exitCode === null) await once(child, 'exit');
    }
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('tuga-start-')) throw new Error('Unsafe cleanup path');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  for (let i = 0; i < 100 && !output.includes('Tuga pronto:'); i++) { if (child.exitCode !== null) break; await new Promise((resolve) => setTimeout(resolve, 300)); }
  assert.match(output, /Tuga pronto: (http:\/\/127\.0\.0\.1:\d+)/);
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(health.app, 'tuga'); assert.equal(health.version, '0.2.3');
  assert.equal((await fetch(output.match(/Tuga pronto: (http:\/\/127\.0\.0\.1:\d+)/)[1])).status, 200);
});
