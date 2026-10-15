import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function start(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`[${label}] ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
  return child;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('server', ['backend/index.mjs']);
start('vite', ['node_modules/vite/bin/vite.js', 'frontend', '--host', '127.0.0.1']);
