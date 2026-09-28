import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.once('close', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function waitForServer(server, url, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(check);
      reject(new Error(`Vite did not become ready at ${url} within ${timeoutMs}ms.`));
    }, timeoutMs);
    const check = setInterval(async () => {
      if (server.exitCode !== null) {
        clearInterval(check);
        clearTimeout(timeout);
        reject(new Error(`Vite exited before starting (code ${server.exitCode}).`));
        return;
      }
      try {
        const response = await fetch(url);
        if (response.ok) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        // Keep polling until Vite is ready or the startup timeout expires.
      }
    }, 200);
  });
}

async function getPageTarget(debugPort, browser) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited before opening a page (code ${browser.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chromium has not opened its debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Chromium did not expose its browser debugging endpoint.');
}

function connectDevTools(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    const exceptions = [];
    let nextId = 0;
    socket.addEventListener('open', () => resolve({
      exceptions,
      send(method, params = {}) {
        const id = ++nextId;
        return new Promise((resolveResponse, rejectResponse) => {
          pending.set(id, { resolve: resolveResponse, reject: rejectResponse });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      close() {
        socket.close();
      },
    }));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(message.params.exceptionDetails?.text ?? 'Uncaught browser exception.');
      }
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
    });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')));
  });
}

async function runBrowserTest(debugPort, url, browser) {
  const socketUrl = await getPageTarget(debugPort, browser);
  const devTools = await connectDevTools(socketUrl);
  await devTools.send('Runtime.enable');
  await devTools.send('Page.enable');
  await devTools.send('Page.navigate', { url });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited during the browser test (code ${browser.exitCode}).`);
    const evaluation = await devTools.send('Runtime.evaluate', {
      expression: `(() => {
        const element = document.querySelector('#test-result');
        return element ? { status: element.dataset.status, text: element.textContent } : null;
      })()`,
      returnByValue: true,
    });
    const state = evaluation.result?.value;
    if (state?.status === 'passed') {
      devTools.close();
      return state.text;
    }
    if (state?.status === 'failed') {
      devTools.close();
      throw new Error(`Browser storage test failed:\n${state.text}`);
    }
    if (devTools.exceptions.length) {
      devTools.close();
      throw new Error(`Browser exception: ${devTools.exceptions.join('\n')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  devTools.close();
  throw new Error('Browser storage test timed out waiting for IndexedDB and reload checks to finish.');
}

const chromiumPath = process.env.CHROMIUM_PATH || process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const port = await getFreePort();
const debugPort = await getFreePort();
const url = `http://127.0.0.1:${port}/tests/property-transformer-storage.html`;
const userDataDir = await mkdtemp(path.join(tmpdir(), 'realestatex-property-storage-'));
const server = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
  cwd: packageDir,
  env: { ...process.env, PORT: String(port), BASE_PATH: '/' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
let browser;

try {
  await waitForServer(server, url);
  browser = spawn(chromiumPath, [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const timeout = setTimeout(() => browser.kill('SIGKILL'), 60_000);
  try {
    console.log(await runBrowserTest(debugPort, url, browser));
  } finally {
    clearTimeout(timeout);
    await stopProcess(browser);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (serverOutput) console.error(`Vite output:\n${serverOutput}`);
  process.exitCode = 1;
} finally {
  await stopProcess(server);
  await rm(userDataDir, { recursive: true, force: true });
}