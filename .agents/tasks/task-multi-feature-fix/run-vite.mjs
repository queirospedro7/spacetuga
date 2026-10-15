import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const cwd = 'c:\\Users\\pedro\\Desktop\\dc';
const out = {};

try {
  const viteOut = execSync('node node_modules/vite/bin/vite.js build', { cwd, stdio: 'pipe', timeout: 120000 });
  out.vite = { exit: 0, output: viteOut.toString().slice(-3000) };
} catch (e) {
  out.vite = { exit: e.status ?? -1, output: ((e.stdout?.toString() || '') + (e.stderr?.toString() || '')).slice(-3000) };
}

writeFileSync(join(cwd, '.agents/tasks/task-multi-feature-fix/vite-result.json'), JSON.stringify(out, null, 2));
console.log('vite exit:', out.vite.exit);
