import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

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
      throw new Error(`Browser test failed:\n${state.text}`);
    }
    if (devTools.exceptions.length) {
      devTools.close();
      throw new Error(`Browser exception: ${devTools.exceptions.join('\n')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  devTools.close();
  throw new Error('Browser test timed out waiting for its checks to finish.');
}

async function runAuthenticatedRecoveryTest(debugPort, url, uploadPath, unreadableImagePath, unsupportedImagePath, browser) {
  const socketUrl = await getPageTarget(debugPort, browser);
  const devTools = await connectDevTools(socketUrl);
  await devTools.send('Runtime.enable');
  await devTools.send('Page.enable');
  await devTools.send('DOM.enable');
  await devTools.send('Page.navigate', { url });

  const evaluate = async (expression, awaitPromise = false) => {
    const response = await devTools.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result?.value;
  };
  const waitFor = async (expression, predicate, description, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
      if (browser.exitCode !== null) throw new Error(`Chromium exited during ${description} (code ${browser.exitCode}).`);
      const value = await evaluate(expression, true);
      lastValue = value;
      if (value?.status === 'failed') throw new Error(`Photo recovery fixture failed:\n${value.text}`);
      if (predicate(value)) return value;
      if (devTools.exceptions.length) {
        throw new Error(`Browser exception during ${description}:\n${devTools.exceptions.join('\n')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for ${description}. Last browser state: ${JSON.stringify(lastValue)}`);
  };

  try {
    const initial = await waitFor(
      `(() => {
        const result = document.querySelector('#test-result');
        const notice = document.querySelector('[data-testid="status-missing-project-images"]');
        return {
          status: result?.dataset.status,
          text: result?.textContent ?? '',
          signedIn: Boolean(document.querySelector('[data-testid="button-logout"]')) && !document.querySelector('[data-testid="button-login"]'),
          studioReady: Boolean(document.querySelector('[data-testid="button-open-projects"]')),
          notice: notice?.textContent ?? '',
          repairButton: Boolean(document.querySelector('[data-testid="button-repair-concept-stage"]')),
          restoreFirst: Boolean(document.querySelector('[data-testid="status-restore-source-before-concept"]')),
        };
      })()`,
      (value) => value?.signedIn && value?.studioReady && value?.notice,
      'the signed-in studio and missing-photo notices',
    );
    if (!initial.notice.includes('De bronfoto ontbreekt.')) {
      throw new Error(`The studio did not show the missing source-photo notice: ${initial.notice}`);
    }
    if (!initial.notice.includes('Conceptfoto ontbreekt: Virtual stage.')) {
      throw new Error(`The studio did not show the missing concept-photo notice: ${initial.notice}`);
    }
    if (!initial.notice.includes('Het gekozen scenario blijft Virtual stage')) {
      throw new Error(`The studio did not explain that the selected scenario remains unchanged: ${initial.notice}`);
    }
    if (initial.repairButton || !initial.restoreFirst) {
      throw new Error('The studio did not direct the user to restore the missing source photo before concept generation.');
    }

    const initialProject = await evaluate(
      `window.__propertyRecoveryTest.readProject()`,
      true,
    );
    if (!initialProject || initialProject.id !== 'browser-photo-recovery-project') {
      throw new Error('The expected saved project was not opened in the studio.');
    }
    const originalProjectSettings = JSON.stringify(initialProject);
    const originalImageKeys = await evaluate('window.__propertyRecoveryTest.readImageKeys()', true);

    const uploadReplacement = async (filePath) => {
      const documentRoot = await devTools.send('DOM.getDocument');
      const input = await devTools.send('DOM.querySelector', {
        nodeId: documentRoot.root.nodeId,
        selector: '[data-testid="input-property-image"]',
      });
      if (!input.nodeId) throw new Error('The source-photo upload input was not rendered.');
      await devTools.send('DOM.setFileInputFiles', {
        files: [filePath],
        nodeId: input.nodeId,
      });
    };
    const assertRejectedReplacement = async (filePath, expectedError, description) => {
      await uploadReplacement(filePath);
      const rejected = await waitFor(
        `(() => {
          const error = document.querySelector('[data-testid="status-upload-error"]');
          const retryButton = document.querySelector('[data-testid="button-restore-source-photo"]');
          const notice = document.querySelector('[data-testid="status-missing-project-images"]');
          return {
            error: error?.textContent ?? '',
            retryEnabled: Boolean(retryButton && !retryButton.disabled),
            sourceStillMissing: notice?.textContent.includes('De bronfoto ontbreekt.') ?? false,
          };
        })()`,
        (value) => value?.error && value.retryEnabled && value.sourceStillMissing,
        `${description} to fail while leaving source-photo recovery available`,
      );
      if (!rejected.error.includes(expectedError)) {
        throw new Error(`The ${description} produced an unclear upload error: ${rejected.error}`);
      }
      const afterFailure = await evaluate(
        `(async () => ({
          project: await window.__propertyRecoveryTest.readProject(),
          imageKeys: await window.__propertyRecoveryTest.readImageKeys(),
        }))()`,
        true,
      );
      if (JSON.stringify(afterFailure.project) !== originalProjectSettings) {
        throw new Error(`The ${description} changed the saved project, selected scenario, or image references.`);
      }
      if (JSON.stringify(afterFailure.imageKeys) !== JSON.stringify(originalImageKeys)) {
        throw new Error(`The ${description} left a partial image record in browser storage.`);
      }
    };

    await assertRejectedReplacement(unreadableImagePath, 'kan niet worden gelezen', 'an unreadable replacement image');
    await assertRejectedReplacement(unsupportedImagePath, 'Alleen JPEG- en PNG-afbeeldingen', 'an unsupported replacement image');
    await uploadReplacement(uploadPath);

    await waitFor(
      `(() => {
        const result = document.querySelector('#test-result');
        const notice = document.querySelector('[data-testid="status-missing-project-images"]');
        const stageAction = document.querySelector('[data-testid="button-transform-stage"]');
        const error = document.querySelector('[data-testid="status-upload-error"]');
        return {
          status: result?.dataset.status,
          text: result?.textContent ?? '',
          notice: notice?.textContent ?? '',
          sourceReady: !document.querySelector('[data-testid="button-empty-upload"]') && stageAction && !stageAction.disabled,
          error: error?.textContent ?? '',
        };
      })()`,
      (value) => value?.sourceReady && value.notice && !value.notice.includes('De bronfoto ontbreekt.') && !value.error,
      'the replacement source photo to be saved and displayed',
    );

    const persisted = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        source: await window.__propertyRecoveryTest.readSourceImage(
          (await window.__propertyRecoveryTest.readProject())?.originalKey
        ),
      }))()`,
      true,
    );
    if (!persisted.project || !persisted.source) {
      throw new Error('The replacement source image was not stored in the browser.');
    }
    if (persisted.source.size <= 0 || persisted.source.isConcept || !persisted.source.type.startsWith('image/')) {
      throw new Error('The recovered source image is not stored as a non-empty source photo.');
    }
    const settingsAfterRecovery = { ...persisted.project };
    delete settingsAfterRecovery.originalKey;
    delete settingsAfterRecovery.updatedAt;
    const originalSettings = { ...JSON.parse(originalProjectSettings) };
    delete originalSettings.originalKey;
    delete originalSettings.updatedAt;
    if (JSON.stringify(settingsAfterRecovery) !== JSON.stringify(originalSettings)) {
      throw new Error('Replacing the missing source photo changed saved project assumptions or settings.');
    }
    if (persisted.project.selectedResult !== 'stage') {
      throw new Error(`Source-photo recovery changed the selected scenario to ${persisted.project.selectedResult}.`);
    }
    const finalNotice = await evaluate(
      `document.querySelector('[data-testid="status-missing-project-images"]')?.textContent ?? ''`,
    );
    if (!finalNotice.includes('Conceptfoto ontbreekt: Virtual stage.')) {
      throw new Error(`Recovering the source photo hid the still-missing concept notice: ${finalNotice}`);
    }
    if (!finalNotice.includes('Het gekozen scenario blijft Virtual stage')) {
      throw new Error(`Recovering the source photo changed or hid the selected-scenario notice: ${finalNotice}`);
    }
    const repairAvailable = await evaluate(`Boolean(document.querySelector('[data-testid="button-repair-concept-stage"]'))`);
    if (!repairAvailable) {
      throw new Error('The missing Virtual stage concept did not offer a targeted repair action after source recovery.');
    }

    const projectBeforeFailedRepair = await evaluate(`window.__propertyRecoveryTest.readProject()`, true);
    await evaluate(`(() => {
      window.__propertyRecoveryTest.failNextConceptRequest = true;
      document.querySelector('[data-testid="button-repair-concept-stage"]')?.click();
    })()`);
    const failedRepair = await waitFor(
      `(() => ({
        error: document.querySelector('[data-testid="status-upload-error"]')?.textContent ?? '',
        request: window.__propertyRecoveryTest.lastConceptRequestUrl,
        actionFinished: !document.querySelector('[data-testid="button-open-projects"]')?.disabled,
      }))()`,
      (value) => value?.error && value?.request && value.actionFinished,
      'the targeted Virtual stage repair request to fail cleanly',
    );
    if (!failedRepair.request.includes('/api/property-transformations/virtual-staging')) {
      throw new Error(`The repair notice started the wrong concept action: ${failedRepair.request}`);
    }
    const projectAfterFailedRepair = await evaluate(`window.__propertyRecoveryTest.readProject()`, true);
    if (JSON.stringify(projectAfterFailedRepair) !== JSON.stringify(projectBeforeFailedRepair)) {
      throw new Error('A failed concept repair changed the saved scenario or project settings.');
    }

    await evaluate(`document.querySelector('[data-testid="button-open-projects"]')?.click()`);
    const portfolioControls = await waitFor(
      `(() => {
        const dialog = document.querySelector('[data-testid="dialog-project-manager"]');
        const exportButton = document.querySelector('[data-testid="button-export-portfolio"]');
        const importButton = document.querySelector('[data-testid="button-import-portfolio"]');
        return {
          dialogOpen: Boolean(dialog),
          exportEnabled: Boolean(exportButton && !exportButton.disabled),
          importEnabled: Boolean(importButton && !importButton.disabled),
          localOnlyExplanation: dialog?.textContent.includes('blijft in deze browser') ?? false,
        };
      })()`,
      (value) => value?.dialogOpen && value.exportEnabled && value.importEnabled,
      'the signed-in portfolio backup and restore controls',
    );
    if (!portfolioControls.localOnlyExplanation) {
      throw new Error('The signed-in project manager did not explain that the portfolio backup stays in this browser.');
    }

    const projectBeforeSorting = JSON.stringify(await evaluate('window.__propertyRecoveryTest.readProject()', true));
    const expectedNameOrder = [
      'browser-photo-recovery-sort-alpha',
      'browser-photo-recovery-project',
      'browser-photo-recovery-sort-zulu',
    ];
    const projectListState = `(() => {
      const dialog = document.querySelector('[data-testid="dialog-project-manager"]');
      const select = dialog?.querySelector('[data-testid="select-project-sort-order"]');
      const projectIds = Array.from(dialog?.querySelectorAll('li[data-testid^="project-row-"]') ?? [])
        .map((row) => row.getAttribute('data-testid')?.replace('project-row-', ''));
      return { open: Boolean(dialog), order: select?.value, projectIds };
    })()`;
    await evaluate(`(() => {
      const select = document.querySelector('[data-testid="select-project-sort-order"]');
      select.value = 'name';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const sortedPortfolio = await waitFor(
      projectListState,
      (value) => value?.order === 'name' && value.projectIds?.join(',') === expectedNameOrder.join(','),
      'the project-name sort order to be applied',
    );
    if (!sortedPortfolio.open) throw new Error('The project list closed while applying its sort order.');

    await evaluate(`document.querySelector('[data-testid="button-close-projects"]')?.click()`);
    await evaluate(`document.querySelector('[data-testid="button-open-projects"]')?.click()`);
    const reopenedPortfolio = await waitFor(
      projectListState,
      (value) => value?.open && value.order === 'name' && value.projectIds?.join(',') === expectedNameOrder.join(','),
      'the selected sort order after closing and reopening the project list',
    );
    if (!reopenedPortfolio.open) throw new Error('The project list did not reopen.');
    if (JSON.stringify(await evaluate('window.__propertyRecoveryTest.readProject()', true)) !== projectBeforeSorting) {
      throw new Error('Changing the project-list order modified the saved project record or timestamp.');
    }

    await devTools.send('Page.navigate', { url });
    const reloadedStudio = await waitFor(
      `(() => ({
        status: document.querySelector('#test-result')?.dataset.status,
        fixtureReady: typeof window.__propertyRecoveryTest?.readProject === 'function',
        studioReady: Boolean(document.querySelector('[data-testid="button-open-projects"]')),
      }))()`,
      (value) => value?.status === 'app-started' && value.fixtureReady && value.studioReady,
      'the authenticated studio after reloading the page',
    );
    if (!reloadedStudio.studioReady) throw new Error('The authenticated studio did not return after reloading.');
    await evaluate(`document.querySelector('[data-testid="button-open-projects"]')?.click()`);
    const reloadedPortfolio = await waitFor(
      projectListState,
      (value) => value?.open && value.order === 'name' && value.projectIds?.join(',') === expectedNameOrder.join(','),
      'the selected sort order after reloading the page',
    );
    if (!reloadedPortfolio.open) throw new Error('The portfolio did not open after the page reload.');

    await evaluate(`document.querySelector('[data-testid="button-close-projects"]')?.click()`);
    const beforeSuccessfulRepair = await evaluate('window.__propertyRecoveryTest.readProject()', true);
    if (!beforeSuccessfulRepair?.resultKeys?.stage) throw new Error('The missing Virtual stage result reference was not available before repair.');
    await evaluate(`document.querySelector('[data-testid="button-repair-concept-stage"]')?.click()`);
    const successfulRepair = await waitFor(
      `(async () => {
        const project = await window.__propertyRecoveryTest.readProject();
        const image = project?.resultKeys?.stage
          ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.stage)
          : null;
        const notice = document.querySelector('[data-testid="status-missing-project-images"]')?.textContent ?? '';
        return {
          project,
          image,
          missingConcept: notice.includes('Conceptfoto ontbreekt: Virtual stage.'),
        };
      })()`,
      (value) => value?.project?.resultKeys?.stage
        && value.project.resultKeys.stage !== beforeSuccessfulRepair.resultKeys.stage
        && value.image?.isConcept
        && value.image?.size > 0
        && !value.missingConcept,
      'the repaired Virtual stage concept to be saved',
    );
    if (!successfulRepair.project || successfulRepair.project.selectedResult !== 'stage') {
      throw new Error('The successful concept repair did not keep Virtual stage selected.');
    }
    await devTools.send('Page.navigate', { url });
    const repairedStudio = await waitFor(
      `(() => ({
        status: document.querySelector('#test-result')?.dataset.status,
        fixtureReady: typeof window.__propertyRecoveryTest?.readProject === 'function',
        studioReady: Boolean(document.querySelector('[data-testid="button-open-projects"]')),
      }))()`,
      (value) => value?.status === 'app-started' && value.fixtureReady && value.studioReady,
      'the studio after refreshing the successfully repaired project',
    );
    if (!repairedStudio.studioReady) throw new Error('The studio did not return after refreshing the repaired project.');
    const persistedRepair = await waitFor(
      `(async () => {
        const project = await window.__propertyRecoveryTest.readProject();
        const image = project?.resultKeys?.stage
          ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.stage)
          : null;
        const notice = document.querySelector('[data-testid="status-missing-project-images"]')?.textContent ?? '';
        return { project, image, notice };
      })()`,
      (value) => value?.project?.selectedResult === 'stage'
        && value.project.resultKeys?.stage === successfulRepair.project.resultKeys.stage
        && value.image?.isConcept
        && value.image?.size > 0
        && !value.notice.includes('Conceptfoto ontbreekt: Virtual stage.'),
      'the repaired concept and selected scenario to persist after refresh',
    );
    if (!persistedRepair.project) throw new Error('The repaired concept was not available after refresh.');

    return 'Passed: unsupported replacement photos remained retryable without changing saved data; the repaired concept persisted after refresh; and the selected project-list order survived close, reopen, and reload.';
  } finally {
    devTools.close();
  }
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBytes, data]);
  let checksum = 0xffffffff;
  for (const byte of payload) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
    }
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, payload, crc]);
}

function makeTestPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixel = Buffer.from([0, 180, 130, 75, 255]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixel)),
    pngChunk('IEND'),
  ]);
}

const chromiumPath = process.env.CHROMIUM_PATH || process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const port = await getFreePort();
const debugPort = await getFreePort();
const storageUrl = `http://127.0.0.1:${port}/tests/property-transformer-storage.html`;
const accountIsolationUrl = `http://127.0.0.1:${port}/tests/property-transformer-account-isolation.html`;
const recoveryUrl = `http://127.0.0.1:${port}/tests/property-transformer-recovery.html`;
const duplicateImportUrl = `http://127.0.0.1:${port}/tests/property-transformer-duplicate-import.html`;
const searchUrl = `http://127.0.0.1:${port}/tests/property-transformer-search.html`;
const userDataDir = await mkdtemp(path.join(tmpdir(), 'realestatex-property-storage-'));
const recoveryImagePath = path.join(userDataDir, 'replacement-source.png');
const unreadableImagePath = path.join(userDataDir, 'unreadable-source.png');
const unsupportedImagePath = path.join(userDataDir, 'unsupported-source.gif');
await writeFile(
  recoveryImagePath,
  makeTestPng(),
);
await writeFile(unreadableImagePath, Buffer.from('This is not a readable PNG image.'));
await writeFile(unsupportedImagePath, Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64'));
const server = spawn('pnpm', ['exec', 'vite', '--config', 'tests/vite.authenticated.config.ts', '--host', '127.0.0.1'], {
  cwd: packageDir,
  env: { ...process.env, PORT: String(port), BASE_PATH: '/' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
let browser;

try {
  await waitForServer(server, storageUrl);
  browser = spawn(chromiumPath, [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const timeout = setTimeout(() => browser.kill('SIGKILL'), 120_000);
  try {
    const storageResult = await runBrowserTest(debugPort, storageUrl, browser);
    if (process.env.PROPERTY_STORAGE_ONLY === '1') {
      console.log(storageResult);
    } else {
      const accountIsolationResult = await runBrowserTest(debugPort, accountIsolationUrl, browser);
      const recoveryResult = await runAuthenticatedRecoveryTest(debugPort, recoveryUrl, recoveryImagePath, unreadableImagePath, unsupportedImagePath, browser);
      const duplicateImportResult = await runBrowserTest(debugPort, duplicateImportUrl, browser);
      const searchResult = await runBrowserTest(debugPort, searchUrl, browser);
      console.log(`${storageResult}\n${accountIsolationResult}\n${recoveryResult}\n${duplicateImportResult}\n${searchResult}`);
    }
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