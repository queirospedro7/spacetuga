import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const cwd = 'c:\\Users\\pedro\\Desktop\\dc';
const out = { tsc: null, vite: null, tests: null };

try {
  execSync('node node_modules/typescript/bin/tsc -b', { cwd, stdio: 'pipe' });
  out.tsc = { exit: 0, output: '' };
} catch (e) {
  out.tsc = { exit: e.status, output: (e.stdout?.toString() || '') + (e.stderr?.toString() || '') };
}

try {
  const viteOut = execSync('node node_modules/vite/bin/vite.js build', { cwd, stdio: 'pipe' });
  out.vite = { exit: 0, output: viteOut.toString() };
} catch (e) {
  out.vite = { exit: e.status, output: (e.stdout?.toString() || '') + (e.stderr?.toString() || '') };
}

try {
  const testOut = execSync('node --test scripts/audit.test.mjs', { cwd, stdio: 'pipe' });
  out.tests = { exit: 0, output: testOut.toString() };
} catch (e) {
  out.tests = { exit: e.status, output: (e.stdout?.toString() || '') + (e.stderr?.toString() || '') };
}

writeFileSync(join(cwd, '.agents/tasks/task-multi-feature-fix/build-result3.json'), JSON.stringify(out, null, 2));
console.log('Done. tsc:', out.tsc.exit, 'vite:', out.vite?.exit, 'tests:', out.tests?.exit);
