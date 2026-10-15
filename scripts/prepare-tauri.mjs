import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { desktopRuntime } from './desktop-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredApi = process.env.VITE_TUGA_API_URL || loadEnv('production', root, 'VITE_').VITE_TUGA_API_URL;
fs.writeFileSync(path.join(root, 'src-tauri', 'desktop-runtime.txt'), `${desktopRuntime(configuredApi)}\n`);
const destinationDir = path.join(root, 'src-tauri', 'binaries');
const destination = path.join(destinationDir, 'node.exe');
fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(process.execPath, destination);
console.log(`Node runtime prepared for Tauri: ${destination}`);
