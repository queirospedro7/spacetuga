import net from 'node:net';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
const backendPort = Number(process.env.TUGA_PORT || 8787);
let stopping = false;
const freePort = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
function launch(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); shutdown(1); });
  child.on('exit', (code) => { if (!stopping) shutdown(code || 0); });
  return child;
}
async function ready(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (stopping) throw new Error('O processo de arranque terminou.');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch { /* Waiting for the child we launched. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('O Tuga demorou demasiado tempo a iniciar.');
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
try {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('O Tuga precisa de Node.js 20 ou mais recente.');
  if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) throw new Error('A porta do servidor nao e valida.');
  const backend = `http://127.0.0.1:${backendPort}`;
  if (await freePort(backendPort)) {
    const serverScript = fs.existsSync(path.join(root, 'backend', 'index.mjs')) ? 'backend/index.mjs' : 'server/index.mjs';
    launch([serverScript]);
    await ready(`${backend}/api/health`);
  } else {
    let health;
    try { const response = await fetch(`${backend}/api/health`, { signal: AbortSignal.timeout(2000) }); health = await response.json(); } catch { /* Never stop an unidentified process. */ }
    if (health?.app !== 'tuga' || health?.version !== '0.2.3') throw new Error(`A porta ${backendPort} esta ocupada por outra execucao. Fecha o servidor anterior do Tuga e volta a abrir start.bat.`);
    console.log('O servidor Tuga ja esta ativo.');
  }
  let port = 3000;
  while (!await freePort(port) && port < 3020) port++;
  if (port === 3020 && !await freePort(port)) throw new Error('Nao foi encontrada uma porta livre para a interface.');
  const viteTarget = fs.existsSync(path.join(root, 'frontend', 'index.html')) ? 'frontend' : '.';
  launch(['node_modules/vite/bin/vite.js', viteTarget, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { VITE_TUGA_API_URL: process.env.VITE_TUGA_API_URL || backend });
  const url = `http://127.0.0.1:${port}`;
  await ready(url);
  console.log(`\nTuga pronto: ${url}\nMantem esta janela aberta. Ctrl+C termina a execucao iniciada aqui.\n`);
  if (process.platform === 'win32' && process.env.TUGA_OPEN_BROWSER !== 'false') spawn('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
} catch (error) { console.error(`\n${error.message}\n`); shutdown(1); }
