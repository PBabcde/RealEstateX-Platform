import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Keep the chosen port before closing its temporary listener.
const port = await new Promise((resolve) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); });
});
const debugPort = await new Promise((resolve) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); });
});
const profile = await mkdtemp(path.join(tmpdir(), 'energyx-ui-test-'));
const vite = spawn('pnpm', ['exec', 'vite', '--config', 'tests/vite.authenticated.config.ts', '--host', '127.0.0.1'], {
  cwd: packageDir, env: { ...process.env, PORT: String(port), BASE_PATH: '/', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let viteOutput = '';
vite.stdout.on('data', (chunk) => { viteOutput += chunk; });
vite.stderr.on('data', (chunk) => { viteOutput += chunk; });
let browser;
let browserOutput = '';
let socket;
try {
  const url = `http://127.0.0.1:${port}/tests/energyx-module.html`;
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (vite.exitCode !== null || attempt > 300) throw new Error(`Test Vite did not start: ${viteOutput}`);
    await sleep(200);
  }
  browser = spawn(process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run',
    '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stdout.on('data', (chunk) => { browserOutput += chunk; });
  browser.stderr.on('data', (chunk) => { browserOutput += chunk; });
  let target;
  for (let attempt = 0; ; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((entry) => entry.type === 'page'); } catch {}
    if (target) break;
    if (browser.exitCode !== null || attempt > 600) throw new Error(`Chromium did not start: ${browserOutput}`);
    await sleep(100);
  }
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
  await send('Page.navigate', { url });
  const deadline = Date.now() + 90_000;
  let state;
  while (Date.now() < deadline) {
    const output = await send('Runtime.evaluate', { expression: "(() => { const r = document.querySelector('#test-result'); return r ? {status:r.dataset.status,text:r.textContent} : null; })()", returnByValue: true });
    state = output.result?.value;
    if (state?.status === 'failed') throw new Error(state.text);
    if (state?.status === 'passed') { console.log(state.text); break; }
    await sleep(200);
  }
  if (state?.status !== 'passed') throw new Error(`Browser test timed out: ${JSON.stringify(state)}`);
} finally {
  socket?.close();
  browser?.kill('SIGTERM');
  vite.kill('SIGTERM');
  await sleep(300);
  await rm(profile, { recursive: true, force: true });
}
