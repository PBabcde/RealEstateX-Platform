import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromiumPath = process.env.CHROMIUM_PATH || process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const testUrlPath = '/tests/property-transformer-pro-beta.html';

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
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.once('close', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function waitForServer(server, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited before starting (code ${server.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep checking until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Vite did not become ready at ${url}.`);
}

async function connectDevTools(debugPort, browser) {
  const deadline = Date.now() + 30_000;
  let webSocketUrl;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited before opening a page (code ${browser.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const pages = await response.json();
        webSocketUrl = pages.find((page) => page.type === 'page')?.webSocketDebuggerUrl;
        if (webSocketUrl) break;
      }
    } catch {
      // Chromium has not opened its debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!webSocketUrl) throw new Error('Chromium did not expose its debugging endpoint.');

  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const eventHandlers = new Map();
  let nextId = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')), { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method && eventHandlers.has(message.method)) {
      for (const handler of eventHandlers.get(message.method)) handler(message.params);
    }
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });

  return {
    on(method, handler) {
      const handlers = eventHandlers.get(method) ?? [];
      handlers.push(handler);
      eventHandlers.set(method, handlers);
    },
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

const port = await getFreePort();
const debugPort = await getFreePort();
const url = `http://127.0.0.1:${port}${testUrlPath}`;
const userDataDir = await mkdtemp(path.join(tmpdir(), 'realestatex-pro-beta-keyboard-'));
const server = spawn('pnpm', ['exec', 'vite', '--config', 'tests/vite.authenticated.config.ts', '--host', '127.0.0.1'], {
  cwd: packageDir,
  env: { ...process.env, PORT: String(port), BASE_PATH: '/' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
let browser;
let devTools;
let browserTimeout;

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
  browserTimeout = setTimeout(() => browser.kill('SIGKILL'), 90_000);

  devTools = await connectDevTools(debugPort, browser);
  await devTools.send('Runtime.enable');
  await devTools.send('Page.enable');
  await devTools.send('Fetch.enable', {
    patterns: [{ urlPattern: '*property-transformations/virtual-staging', requestStage: 'Request' }],
  });
  devTools.on('Fetch.requestPaused', ({ requestId, request }) => {
    if (!request.url.includes('/property-transformations/virtual-staging')) {
      void devTools.send('Fetch.continueRequest', { requestId });
      return;
    }
    void devTools.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 402,
      responseHeaders: [{ name: 'content-type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify({ message: 'Analysis limit reached.' })).toString('base64'),
    });
  });
  await devTools.send('Page.navigate', { url });

  const evaluate = async (expression) => {
    const response = await devTools.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result?.value;
  };
  const waitFor = async (expression, predicate, description) => {
    const deadline = Date.now() + 30_000;
    let lastValue;
    while (Date.now() < deadline) {
      if (browser.exitCode !== null) throw new Error(`Chromium exited during ${description} (code ${browser.exitCode}).`);
      lastValue = await evaluate(expression);
      if (lastValue?.status === 'failed') throw new Error(`Browser fixture failed: ${lastValue.text}`);
      if (predicate(lastValue)) return lastValue;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${description}. Last state: ${JSON.stringify(lastValue)}`);
  };
  const pressKey = async (key, code, keyCode, modifiers = 0) => {
    await devTools.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers,
    });
    await devTools.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers,
    });
  };

  await waitFor(
    `(() => ({ status: document.querySelector('#test-result')?.dataset.status, text: document.querySelector('#test-result')?.textContent }))()`,
    (state) => state?.status === 'app-started',
    'the signed-in studio fixture',
  );
  const opened = await evaluate(`(() => {
    const trigger = document.querySelector('[data-testid="button-transform-stage"]');
    if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) return false;
    trigger.focus();
    trigger.click();
    return true;
  })()`);
  assert.equal(opened, true, 'The stage action was not available to open the Pro beta dialog.');
  await waitFor(
    `(() => {
      const dialog = document.querySelector('[data-testid="dialog-pro-beta"]');
      return {
        open: Boolean(dialog),
        active: document.activeElement?.getAttribute('data-testid') ?? null,
      };
    })()`,
    (state) => state?.open,
    'the Pro beta dialog after the 402 response',
  );

  let activeTestId = await evaluate('document.activeElement?.getAttribute("data-testid") ?? null');
  assert.equal(activeTestId, 'input-pro-beta-email', 'Opening the dialog did not focus the email field.');

  await evaluate(`document.querySelector('[data-testid="button-transform-stage"]')?.focus()`);
  await pressKey('Tab', 'Tab', 9, 8);
  assert.equal(
    await evaluate('document.activeElement?.textContent?.trim() ?? null'),
    'Niet nu',
    'Shift+Tab from outside the dialog did not enter at its last control.',
  );
  await evaluate(`document.querySelector('[data-testid="button-transform-stage"]')?.focus()`);
  await pressKey('Tab', 'Tab', 9);
  activeTestId = await evaluate('document.activeElement?.getAttribute("data-testid") ?? null');
  assert.equal(activeTestId, null, 'Tab from outside the dialog did not move focus to its first control.');
  const firstControlLabel = await evaluate('document.activeElement?.getAttribute("aria-label") ?? null');
  assert.equal(firstControlLabel, 'Sluit Pro-bèta-aanmelding', 'Tab from outside did not enter at the dialog close control.');

  await pressKey('Tab', 'Tab', 9, 8);
  const reverseBoundary = await evaluate('document.activeElement?.textContent?.trim() ?? null');
  assert.equal(reverseBoundary, 'Niet nu', 'Shift+Tab from the first control did not wrap to the cancel control.');
  await pressKey('Tab', 'Tab', 9);
  const forwardBoundary = await evaluate('document.activeElement?.getAttribute("aria-label") ?? null');
  assert.equal(forwardBoundary, 'Sluit Pro-bèta-aanmelding', 'Tab from the last enabled control did not wrap to the first control.');

  await evaluate(`document.querySelector('[data-testid="input-pro-beta-email"]')?.focus()`);
  await pressKey('Tab', 'Tab', 9);
  activeTestId = await evaluate('document.activeElement?.getAttribute("data-testid") ?? null');
  assert.equal(activeTestId, 'checkbox-pro-beta-consent', 'Keyboard navigation skipped the consent control.');
  await pressKey(' ', 'Space', 32);
  await waitFor(
    'document.querySelector("[data-testid=\\"button-submit-pro-beta\\"]")?.disabled',
    (disabled) => disabled === false,
    'the submit control to become available after keyboard consent',
  );
  await pressKey('Tab', 'Tab', 9);
  assert.equal(await evaluate('document.activeElement?.textContent?.trim() ?? null'), 'Niet nu', 'Tab did not reach the cancel control.');
  await pressKey('Tab', 'Tab', 9);
  assert.equal(
    await evaluate('document.activeElement?.getAttribute("data-testid") ?? null'),
    'button-submit-pro-beta',
    'Tab did not reach the enabled submit control.',
  );
  await pressKey('Tab', 'Tab', 9);
  assert.equal(
    await evaluate('document.activeElement?.getAttribute("aria-label") ?? null'),
    'Sluit Pro-bèta-aanmelding',
    'Tab from the submit control did not continue within the dialog.',
  );
  await pressKey('Tab', 'Tab', 9, 8);
  assert.equal(
    await evaluate('document.activeElement?.getAttribute("data-testid") ?? null'),
    'button-submit-pro-beta',
    'Shift+Tab from the first dialog control did not wrap to the submit control.',
  );

  await pressKey('Escape', 'Escape', 27);
  await waitFor(
    `(() => ({
      closed: !document.querySelector('[data-testid="dialog-pro-beta"]'),
      active: document.activeElement?.getAttribute('data-testid') ?? null,
    }))()`,
    (state) => state?.closed && state?.active === 'button-transform-stage',
    'Escape to close the dialog and restore focus to its opener',
  );

  console.log('Passed: the Pro beta dialog focused its email field, contained Tab and Shift+Tab navigation across cancel and submit controls, closed on Escape, and restored focus to the stage-action opener.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (serverOutput) console.error(`Vite output:\n${serverOutput}`);
  process.exitCode = 1;
} finally {
  clearTimeout(browserTimeout);
  devTools?.close();
  await stopProcess(browser);
  await stopProcess(server);
  await rm(userDataDir, { recursive: true, force: true });
}
