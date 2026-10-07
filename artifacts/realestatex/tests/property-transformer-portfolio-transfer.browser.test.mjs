import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromiumPath = process.env.CHROMIUM_PATH || process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const projectNames = ['Canal House', 'Garden Apartment', 'Courtyard Loft'];

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
    const networkRequests = [];
    const networkFailures = [];
    let nextId = 0;
    socket.addEventListener('open', () => resolve({
      exceptions,
      networkRequests,
      networkFailures,
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
      if (message.method === 'Network.requestWillBeSent') {
        const request = message.params.request;
        networkRequests.push({
          url: request.url,
          method: request.method,
          includesBody: Boolean(request.postData),
        });
      }
      if (message.method === 'Network.loadingFailed') {
        networkFailures.push({
          requestId: message.params.requestId,
          errorText: message.params.errorText,
        });
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

async function openTestPage(debugPort, url, browser) {
  const devTools = await connectDevTools(await getPageTarget(debugPort, browser));
  await devTools.send('Runtime.enable');
  await devTools.send('Page.enable');
  await devTools.send('DOM.enable');
  await devTools.send('Network.enable');
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
      lastValue = await evaluate(expression, true);
      if (lastValue?.status === 'failed') {
        const details = lastValue.text ?? await evaluate(`document.querySelector('#test-result')?.textContent ?? ''`);
        throw new Error(`Portfolio transfer fixture failed:\n${details}`);
      }
      if (predicate(lastValue)) return lastValue;
      if (devTools.exceptions.length) {
        throw new Error(`Browser exception during ${description}:\n${devTools.exceptions.join('\n')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(
      `Timed out waiting for ${description}. Last browser state: ${JSON.stringify(lastValue)}`
      + `\nRecent requests: ${JSON.stringify(devTools.networkRequests.slice(-20))}`
      + `\nRequest failures: ${JSON.stringify(devTools.networkFailures)}`
      + `\nBrowser exceptions: ${JSON.stringify(devTools.exceptions)}`,
    );
  };

  return {
    devTools,
    evaluate,
    waitFor,
    navigate: (targetUrl) => devTools.send('Page.navigate', { url: targetUrl }),
    close: () => devTools.close(),
  };
}

async function waitForDownload(downloadDirectory, browser) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited before the portfolio backup downloaded (code ${browser.exitCode}).`);
    const names = await readdir(downloadDirectory);
    const candidates = names.filter((name) => name.endsWith('.json'));
    for (const name of candidates) {
      const filePath = path.join(downloadDirectory, name);
      if ((await stat(filePath)).size > 0) {
        try {
          const contents = await readFile(filePath, 'utf8');
          return { filePath, contents };
        } catch {
          // The browser may still be finishing the download.
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`The project manager did not produce a completed JSON download in ${downloadDirectory}.`);
}

function assertNoServerUploads(page, phase) {
  const apiRequests = page.devTools.networkRequests
    .filter((request) => new URL(request.url).pathname.startsWith('/api/'));
  const writes = apiRequests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.includesBody);
  if (writes.length) {
    throw new Error(`${phase} sent project data to a server API: ${JSON.stringify(writes)}`);
  }
}

function assertDownloadedPortfolio(archive, expectedProjects) {
  assert.equal(archive.format, 'realestatex-property-portfolio', 'The download is not a RealEstateX portfolio backup.');
  assert.equal(archive.version, 1, 'The portfolio backup version changed unexpectedly.');
  assert.ok(archive.exportedAt, 'The portfolio backup is missing its export timestamp.');
  assert.equal(archive.projects.length, expectedProjects.length, 'The downloaded portfolio does not contain every saved project.');

  const archivesByName = new Map(archive.projects.map((entry) => [entry.project.projectName, entry]));
  for (const expected of expectedProjects) {
    const downloaded = archivesByName.get(expected.project.projectName);
    assert.ok(downloaded, `The downloaded backup is missing ${expected.project.projectName}.`);
    assert.deepEqual(downloaded.project, expected.project, `${expected.project.projectName} project details changed in the download.`);
    assert.equal(downloaded.images.length, expected.images.length, `${expected.project.projectName} is missing a source photo or concept.`);
    const imagesByKey = new Map(downloaded.images.map((image) => [image.key, image]));
    for (const expectedImage of expected.images) {
      const image = imagesByKey.get(expectedImage.key);
      assert.ok(image, `${expected.project.projectName} is missing ${expectedImage.label} in the download.`);
      assert.equal(image.blobBase64, expectedImage.payloadBase64, `${expectedImage.label} bytes changed in the download.`);
      assert.equal(image.mimeType, expectedImage.mimeType, `${expectedImage.label} MIME type changed in the download.`);
      assert.equal(image.isConcept, expectedImage.isConcept, `${expectedImage.label} source/concept flag changed in the download.`);
      assert.equal(image.label, expectedImage.label, `${expectedImage.label} metadata changed in the download.`);
      assert.equal(image.disclaimer, expectedImage.disclaimer, `${expectedImage.label} disclaimer changed in the download.`);
      assert.equal(image.createdAt, expectedImage.createdAt, `${expectedImage.label} timestamp changed in the download.`);
      assert.ok(image.sha256, `${expectedImage.label} is missing its integrity hash.`);
    }
  }
}

function assertRestoredPortfolio(snapshot, expectedProjects) {
  const restoredByName = new Map(
    snapshot
      .filter(({ project }) => projectNames.includes(project.projectName))
      .map((entry) => [entry.project.projectName, entry]),
  );
  assert.equal(restoredByName.size, expectedProjects.length, 'Not every backed-up project appears in the fresh browser profile.');

  for (const expected of expectedProjects) {
    const restored = restoredByName.get(expected.project.projectName);
    assert.ok(restored, `${expected.project.projectName} was not restored.`);
    assert.notEqual(restored.project.id, expected.project.id, `${expected.project.projectName} was not restored as a new project.`);
    const { id: _id, originalKey: _originalKey, resultKeys: _resultKeys, ...restoredFields } = restored.project;
    const { id: _expectedId, originalKey: _expectedOriginalKey, resultKeys: _expectedResultKeys, ...expectedFields } = expected.project;
    assert.deepEqual(restoredFields, expectedFields, `${expected.project.projectName} project data changed during restore.`);
    assert.equal(restored.images.length, expected.images.length, `${expected.project.projectName} is missing a restored photo.`);
    const imagesByKey = new Map(restored.images.map((image) => [image.key, image]));

    for (const expectedImage of expected.images) {
      const restoredKey = expectedImage.kind === 'source'
        ? restored.project.originalKey
        : restored.project.resultKeys[expectedImage.action];
      assert.ok(restoredKey, `${expected.project.projectName} no longer references ${expectedImage.label}.`);
      const image = imagesByKey.get(restoredKey);
      assert.ok(image?.found, `${expectedImage.label} is not available in the restored browser profile.`);
      assert.equal(image.payloadBase64, expectedImage.payloadBase64, `${expectedImage.label} bytes changed during restore.`);
      assert.equal(image.mimeType, expectedImage.mimeType, `${expectedImage.label} MIME type changed during restore.`);
      assert.equal(image.isConcept, expectedImage.isConcept, `${expectedImage.label} source/concept flag changed during restore.`);
      assert.equal(image.label, expectedImage.label, `${expectedImage.label} metadata changed during restore.`);
      assert.equal(image.disclaimer, expectedImage.disclaimer, `${expectedImage.label} disclaimer changed during restore.`);
      assert.equal(image.createdAt, expectedImage.createdAt, `${expectedImage.label} timestamp changed during restore.`);
    }
  }
}

async function openProjectManager(page, expectedCount, description) {
  await page.waitFor(
    `(() => ({
      appStarted: document.querySelector('#test-result')?.dataset.status === 'app-started',
      button: Boolean(document.querySelector('[data-testid="button-open-projects"]')),
    }))()`,
    (value) => value?.appStarted && value.button,
    `${description} studio to load`,
  );
  await page.evaluate(`document.querySelector('[data-testid="button-open-projects"]')?.click()`);
  const state = await page.waitFor(
    `(() => {
      const dialog = document.querySelector('[data-testid="dialog-project-manager"]');
      const rows = [...document.querySelectorAll('[data-testid^="project-row-"]')];
      return { open: Boolean(dialog), rowCount: rows.length, names: rows.map((row) => row.textContent ?? '') };
    })()`,
    (value) => value?.open && value.rowCount >= expectedCount,
    `${description} project manager to show its saved projects`,
  );
  return state;
}

async function runExport(sourceDebugPort, sourceBrowser, exportUrl, downloadDirectory) {
  const page = await openTestPage(sourceDebugPort, exportUrl, sourceBrowser);
  try {
    const fixture = await page.waitFor(
      `(() => ({
        status: document.querySelector('#test-result')?.dataset.status,
        fixture: Boolean(window.__portfolioTransferTest),
        expected: window.__portfolioTransferTest?.expectedProjects ?? [],
      }))()`,
      (value) => value?.status === 'app-started' && value.fixture,
      'the signed-in export fixture to initialize',
      60_000,
    );
    assert.equal(fixture.expected.length, projectNames.length, 'The export fixture has an unexpected project count.');
    const manager = await openProjectManager(page, fixture.expected.length, 'Export');
    for (const name of projectNames) {
      assert.ok(manager.names.some((text) => text.includes(name)), `The signed-in project manager is missing ${name} before export.`);
    }

    await page.devTools.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDirectory,
    });
    await page.evaluate(`document.querySelector('[data-testid="button-export-portfolio"]')?.click()`);
    const notice = await page.waitFor(
      `document.querySelector('[data-testid="status-project-transfer-notice"]')?.textContent ?? ''`,
      (text) => text.includes(`${fixture.expected.length} projects`) || text.includes(`${fixture.expected.length} projecten`),
      'the portfolio backup download to finish',
    );
    assert.ok(notice.includes('projecten') || notice.includes('projects'), `Unexpected export notice: ${notice}`);

    const { filePath, contents } = await waitForDownload(downloadDirectory, sourceBrowser);
    const archive = JSON.parse(contents);
    assertDownloadedPortfolio(archive, fixture.expected);
    assertNoServerUploads(page, 'Portfolio export');
    return { filePath, expectedProjects: fixture.expected };
  } finally {
    page.close();
  }
}

async function runRestore(restoreDebugPort, restoreBrowser, restoreUrl, backupFilePath, expectedProjects) {
  const page = await openTestPage(restoreDebugPort, restoreUrl, restoreBrowser);
  try {
    const fixture = await page.waitFor(
      `(() => ({
        status: document.querySelector('#test-result')?.dataset.status,
        fixture: Boolean(window.__portfolioTransferTest),
        initialProjectIds: window.__portfolioTransferTest?.initialProjectIds ?? null,
        mode: window.__portfolioTransferTest?.mode,
      }))()`,
      (value) => value?.status === 'app-started' && value.fixture,
      'the fresh restore browser profile to initialize',
      60_000,
    );
    assert.equal(fixture.mode, 'restore', 'The destination browser opened the wrong transfer mode.');
    assert.deepEqual(fixture.initialProjectIds, [], 'The destination browser profile was not empty before restore.');

    const initialManager = await openProjectManager(page, 1, 'Fresh restore');
    assert.ok(
      !initialManager.names.some((text) => projectNames.some((name) => text.includes(name))),
      'A source portfolio project was already present in the fresh browser profile.',
    );

    await page.evaluate(`document.querySelector('[data-testid="button-import-portfolio"]')?.click()`);
    const documentResponse = await page.devTools.send('DOM.getDocument', { depth: -1 });
    const input = await page.devTools.send('DOM.querySelector', {
      nodeId: documentResponse.root.nodeId,
      selector: '[data-testid="input-import-portfolio"]',
    });
    assert.ok(input.nodeId, 'The portfolio restore file input was not available.');
    await page.devTools.send('DOM.setFileInputFiles', {
      files: [backupFilePath],
      nodeId: input.nodeId,
    });

    const successNotice = await page.waitFor(
      `document.querySelector('[data-testid="status-project-transfer-notice"]')?.textContent ?? ''`,
      (text) => text.includes(`${expectedProjects.length} projecten met foto’s en concepten hersteld`),
      'the downloaded portfolio file to restore through the project manager',
    );
    assert.ok(successNotice.includes('herstel'), `Unexpected restore notice: ${successNotice}`);
    const manager = await page.waitFor(
      `(() => {
        const dialog = document.querySelector('[data-testid="dialog-project-manager"]');
        const rows = [...document.querySelectorAll('[data-testid^="project-row-"]')];
        return { open: Boolean(dialog), names: rows.map((row) => row.textContent ?? '') };
      })()`,
      (value) => value?.open && projectNames.every((name) => value.names.some((text) => text.includes(name))),
      'every restored project to appear in the project manager',
    );
    for (const name of projectNames) {
      assert.ok(manager.names.some((text) => text.includes(name)), `${name} is missing from the restored project list.`);
    }

    const beforeReload = await page.evaluate('window.__portfolioTransferTest.snapshotProjects()', true);
    assertRestoredPortfolio(beforeReload, expectedProjects);
    assertNoServerUploads(page, 'Portfolio restore');

    const recoveredExpected = expectedProjects.find(({ project }) => project.id === 'portfolio-transfer-river');
    assert.ok(recoveredExpected, 'The recovered-JPEG project is missing from the export fixture.');
    const restoredRecoveredProject = beforeReload.find(
      ({ project }) => project.projectName === recoveredExpected.project.projectName,
    )?.project;
    assert.ok(restoredRecoveredProject, 'The recovered-JPEG project is missing after restore.');
    await page.evaluate(
      `document.querySelector('[data-testid="button-open-project-${restoredRecoveredProject.id}"]')?.click()`,
    );
    const restoredPreview = await page.waitFor(
      `(async () => {
        const preview = document.querySelector('img[alt="Originele woningfoto"]');
        const project = (await window.__portfolioTransferTest.snapshotProjects())
          .find(({ project }) => project.projectName === ${JSON.stringify(recoveredExpected.project.projectName)})?.project;
        const scenarioHeading = Array.from(document.querySelectorAll('h2'))
          .find((heading) => heading.textContent?.includes('Virtual stage naast het origineel'));
        return {
          projectId: project?.id,
          selectedResult: project?.selectedResult,
          previewLoaded: Boolean(preview?.complete && preview.naturalWidth > 0 && preview.naturalHeight > 0),
          previewWidth: preview?.naturalWidth ?? 0,
          previewHeight: preview?.naturalHeight ?? 0,
          scenarioVisible: Boolean(scenarioHeading),
          managerOpen: Boolean(document.querySelector('[data-testid="dialog-project-manager"]')),
        };
      })()`,
      (value) => value?.previewLoaded
        && value.projectId === restoredRecoveredProject.id
        && value.selectedResult === recoveredExpected.project.selectedResult
        && value.scenarioVisible
        && !value.managerOpen,
      'the restored recovered-JPEG source preview and selected scenario to load',
    );
    assert.equal(restoredPreview.previewWidth, 2, 'The restored recovered portrait JPEG has an unexpected preview width.');
    assert.equal(restoredPreview.previewHeight, 3, 'The restored recovered portrait JPEG has an unexpected preview height.');

    await page.navigate(restoreUrl);
    await page.waitFor(
      `(() => ({
        status: document.querySelector('#test-result')?.dataset.status,
        fixture: Boolean(window.__portfolioTransferTest),
      }))()`,
      (value) => value?.status === 'app-started' && value.fixture,
      'the destination studio to reload after restore',
      60_000,
    );
    const reloadedManager = await openProjectManager(page, 1, 'Reloaded restore');
    for (const name of projectNames) {
      assert.ok(reloadedManager.names.some((text) => text.includes(name)), `${name} is missing after reloading the destination browser.`);
    }
    const afterReload = await page.evaluate('window.__portfolioTransferTest.snapshotProjects()', true);
    assertRestoredPortfolio(afterReload, expectedProjects);
    assertNoServerUploads(page, 'Portfolio restore after reload');
  } finally {
    page.close();
  }
}

const port = await getFreePort();
const sourceDebugPort = await getFreePort();
const restoreDebugPort = await getFreePort();
const exportUrl = `http://127.0.0.1:${port}/tests/property-transformer-portfolio-transfer.html?mode=export`;
const restoreUrl = `http://127.0.0.1:${port}/tests/property-transformer-portfolio-transfer.html?mode=restore`;
const sourceProfileDir = await mkdtemp(path.join(tmpdir(), 'realestatex-portfolio-export-profile-'));
const restoreProfileDir = await mkdtemp(path.join(tmpdir(), 'realestatex-portfolio-restore-profile-'));
const downloadDirectory = path.join(sourceProfileDir, 'downloads');
await mkdir(downloadDirectory, { recursive: true });
const server = spawn('pnpm', ['exec', 'vite', '--config', 'tests/vite.authenticated.config.ts', '--host', '127.0.0.1'], {
  cwd: packageDir,
  env: { ...process.env, PORT: String(port), BASE_PATH: '/' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
let sourceBrowser;
let restoreBrowser;
let sourceTimeout;
let restoreTimeout;

try {
  await waitForServer(server, exportUrl);
  sourceBrowser = spawn(chromiumPath, [
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
    `--remote-debugging-port=${sourceDebugPort}`,
    `--user-data-dir=${sourceProfileDir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  sourceTimeout = setTimeout(() => sourceBrowser.kill('SIGKILL'), 120_000);
  const { filePath: backupFilePath, expectedProjects } = await runExport(
    sourceDebugPort,
    sourceBrowser,
    exportUrl,
    downloadDirectory,
  );

  restoreBrowser = spawn(chromiumPath, [
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
    `--remote-debugging-port=${restoreDebugPort}`,
    `--user-data-dir=${restoreProfileDir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  restoreTimeout = setTimeout(() => restoreBrowser.kill('SIGKILL'), 120_000);
  await runRestore(restoreDebugPort, restoreBrowser, restoreUrl, backupFilePath, expectedProjects);
  console.log('Passed: restored a missing source from an EXIF-rotated phone-camera JPEG, exported it, restored it as a new project in a separate empty Chromium profile, and verified its upright source preview, assumptions, selected scenario, other photos, and post-reload data without server uploads.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (serverOutput) console.error(`Vite output:\n${serverOutput}`);
  process.exitCode = 1;
} finally {
  clearTimeout(sourceTimeout);
  clearTimeout(restoreTimeout);
  await stopProcess(restoreBrowser);
  await stopProcess(sourceBrowser);
  await stopProcess(server);
  await rm(sourceProfileDir, { recursive: true, force: true });
  await rm(restoreProfileDir, { recursive: true, force: true });
}
