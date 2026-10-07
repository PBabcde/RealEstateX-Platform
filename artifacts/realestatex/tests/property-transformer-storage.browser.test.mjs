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

async function getPageTarget(debugPort, browser, targetId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited before opening a page (code ${browser.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page' && (!targetId || target.id === targetId));
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chromium has not opened its debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chromium did not expose its browser debugging endpoint within ${timeoutMs}ms.`);
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

async function openBrowserPage(debugPort, browser, browserDevTools, url) {
  const { targetId } = await browserDevTools.send('Target.createTarget', { url });
  const socketUrl = await getPageTarget(debugPort, browser, targetId);
  const devTools = await connectDevTools(socketUrl);
  await devTools.send('Runtime.enable');
  await devTools.send('Page.enable');
  return { targetId, devTools };
}

async function runBrowserTest(debugPort, url, browser) {
  const socketUrl = await getPageTarget(debugPort, browser);
  const devTools = await connectDevTools(socketUrl);
  await devTools.send('Runtime.enable');
  await devTools.send('Page.enable');
  await devTools.send('Page.navigate', { url });

  const deadline = Date.now() + 45_000;
  let lastKeyboardRequestId = 0;
  let lastState;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited during the browser test (code ${browser.exitCode}).`);
    const keyboardRequestEvaluation = await devTools.send('Runtime.evaluate', {
      expression: 'window.__browserTestKeyboardRequest ?? null',
      returnByValue: true,
    });
    const keyboardRequest = keyboardRequestEvaluation.result?.value;
    if (keyboardRequest && keyboardRequest.id > lastKeyboardRequestId) {
      const keyData = keyboardRequest.key === 'Tab'
        ? { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 }
        : keyboardRequest.key === 'Escape'
          ? { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
          : null;
      if (!keyData) throw new Error(`The browser test requested an unsupported keyboard key: ${keyboardRequest.key}`);
      const modifiers = keyboardRequest.shift ? 8 : 0;
      await devTools.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyData, modifiers });
      await devTools.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyData, modifiers });
      lastKeyboardRequestId = keyboardRequest.id;
      await devTools.send('Runtime.evaluate', {
        expression: `window.__browserTestKeyboardRequest = null; window.__browserTestKeyboardResponse = ${keyboardRequest.id};`,
        returnByValue: true,
      });
    }
    const evaluation = await devTools.send('Runtime.evaluate', {
      expression: `(() => {
        const element = document.querySelector('#test-result');
        return element ? { status: element.dataset.status, text: element.textContent } : null;
      })()`,
      returnByValue: true,
    });
    const state = evaluation.result?.value;
    lastState = state;
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
  throw new Error(`Browser test timed out waiting for its checks to finish. Last browser state: ${JSON.stringify(lastState)}`);
}

async function runAuthenticatedRecoveryTest(debugPort, url, uploadPath, jpegUploadPath, unreadableImagePath, unsupportedImagePath, browser) {
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
    if (!initial.notice.includes('Conceptfoto ontbreekt: Virtual stage')
      || !initial.notice.includes('Style makeover')) {
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
    await uploadReplacement(jpegUploadPath);

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
    if (persisted.source.size <= 0 || persisted.source.isConcept || persisted.source.type !== 'image/jpeg') {
      throw new Error(`The recovered JPEG is not stored as a non-empty JPEG source photo: ${persisted.source.type}`);
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
    if (!finalNotice.includes('Conceptfoto ontbreekt: Virtual stage')) {
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
    const beforeFailedRepairSave = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
      }))()`,
      true,
    );
    await evaluate(`(() => {
      window.__propertyRecoveryTest.failNextImageWrite();
      document.querySelector('[data-testid="button-repair-concept-stage"]')?.click();
    })()`);
    const failedRepairSave = await waitFor(
      `(() => {
        const retry = document.querySelector('[data-testid="button-repair-concept-stage"]');
        return {
          error: document.querySelector('[data-testid="status-upload-error"]')?.textContent ?? '',
          retryEnabled: Boolean(retry && !retry.disabled),
          missingConceptVisible: document.querySelector('[data-testid="status-missing-project-images"]')?.textContent.includes('Conceptfoto ontbreekt: Virtual stage') ?? false,
          actionFinished: !document.querySelector('[data-testid="button-open-projects"]')?.disabled,
        };
      })()`,
      (value) => value?.error && value.retryEnabled && value.missingConceptVisible && value.actionFinished,
      'the generated concept save to fail while keeping the repair action available',
    );
    if (!failedRepairSave.error.includes('opgeslagen project en foto’s zijn ongewijzigd gebleven')
      || !failedRepairSave.error.includes('het nieuwe concept is niet bewaard')
      || !failedRepairSave.error.includes('probeer opnieuw')) {
      throw new Error(`The failed concept save did not explain that the project is unchanged and can be retried: ${failedRepairSave.error}`);
    }
    const afterFailedRepairSave = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
      }))()`,
      true,
    );
    if (JSON.stringify(afterFailedRepairSave.project) !== JSON.stringify(beforeFailedRepairSave.project)) {
      throw new Error('A failed concept image save changed the saved project settings or image references.');
    }
    if (JSON.stringify(afterFailedRepairSave.imageRecords) !== JSON.stringify(beforeFailedRepairSave.imageRecords)) {
      throw new Error('A failed concept image save left a partial generated image in browser storage.');
    }
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
          request: window.__propertyRecoveryTest.lastConceptRequestUrl,
          missingConcept: notice.includes('Conceptfoto ontbreekt: Virtual stage'),
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
    if (!successfulRepair.request.includes('/api/property-transformations/virtual-staging')) {
      throw new Error(`The successful repair started the wrong concept action: ${successfulRepair.request}`);
    }
    const omitRepairFields = ({ resultKeys, selectedResult, updatedAt, ...settings }) => settings;
    if (JSON.stringify(omitRepairFields(successfulRepair.project)) !== JSON.stringify(omitRepairFields(beforeSuccessfulRepair))) {
      throw new Error('The successful concept repair changed the saved project settings.');
    }
    const otherResultKeys = (resultKeys) => Object.fromEntries(
      Object.entries(resultKeys ?? {}).filter(([action]) => action !== 'stage'),
    );
    if (JSON.stringify(otherResultKeys(successfulRepair.project.resultKeys)) !== JSON.stringify(otherResultKeys(beforeSuccessfulRepair.resultKeys))) {
      throw new Error('The successful concept repair changed unrelated concept references.');
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
        const source = project?.originalKey
          ? await window.__propertyRecoveryTest.readSourceImage(project.originalKey)
          : null;
        const notice = document.querySelector('[data-testid="status-missing-project-images"]')?.textContent ?? '';
        const preview = document.querySelector('img[alt="Virtual stage concept"]');
        const sourcePreview = document.querySelector('img[alt="Originele woningfoto"]');
        const scenarioHeading = Array.from(document.querySelectorAll('h2'))
          .find((heading) => heading.textContent?.includes('Virtual stage naast het origineel'));
        return {
          project,
          image,
          source,
          notice,
          previewLoaded: Boolean(preview?.complete && preview.naturalWidth > 0),
          sourcePreviewLoaded: Boolean(sourcePreview?.complete && sourcePreview.naturalWidth > 0),
          scenarioVisible: Boolean(scenarioHeading),
        };
      })()`,
      (value) => value?.project?.selectedResult === 'stage'
        && value.project.resultKeys?.stage === successfulRepair.project.resultKeys.stage
        && value.image?.isConcept
        && value.image?.size > 0
        && value.source?.type === 'image/jpeg'
        && value.previewLoaded
        && value.sourcePreviewLoaded
        && value.scenarioVisible
        && !value.notice.includes('Conceptfoto ontbreekt: Virtual stage'),
      'the repaired concept and selected scenario to persist after refresh',
    );
    if (!persistedRepair.project) throw new Error('The repaired concept was not available after refresh.');
    if (JSON.stringify(omitRepairFields(persistedRepair.project)) !== JSON.stringify(omitRepairFields(successfulRepair.project))) {
      throw new Error('The project settings changed after reloading the successfully repaired concept.');
    }
    if (JSON.stringify(persistedRepair.project.resultKeys) !== JSON.stringify(successfulRepair.project.resultKeys)) {
      throw new Error('The repaired concept references changed after reloading the studio.');
    }

    if (persistedRepair.project.resultKeys?.makeover !== beforeSuccessfulRepair.resultKeys?.makeover) {
      throw new Error('Repairing Virtual stage changed the missing Style makeover reference.');
    }
    const missingMakeoverImage = await evaluate(
      `window.__propertyRecoveryTest.readConceptImage(${JSON.stringify(persistedRepair.project.resultKeys.makeover)})`,
      true,
    );
    if (missingMakeoverImage) {
      throw new Error('The missing Style makeover reference unexpectedly had a saved image before its repair.');
    }
    const beforeMakeoverRepair = persistedRepair.project;
    const makeoverRepairButton = await evaluate(
      `Boolean(document.querySelector('[data-testid="button-repair-concept-makeover"]'))`,
    );
    if (!makeoverRepairButton) throw new Error('The missing Style makeover concept did not offer its targeted repair action.');
    await evaluate(`(() => {
      window.__propertyRecoveryTest.lastConceptRequestUrl = '';
      document.querySelector('[data-testid="button-repair-concept-makeover"]')?.click();
    })()`);
    const successfulMakeoverRepair = await waitFor(
      `(async () => {
        const project = await window.__propertyRecoveryTest.readProject();
        const image = project?.resultKeys?.makeover
          ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.makeover)
          : null;
        const notice = document.querySelector('[data-testid="status-missing-project-images"]')?.textContent ?? '';
        return {
          project,
          image,
          request: window.__propertyRecoveryTest.lastConceptRequestUrl,
          missingConcept: notice.includes('Style makeover'),
        };
      })()`,
      (value) => value?.project?.resultKeys?.makeover
        && value.project.resultKeys.makeover !== beforeMakeoverRepair.resultKeys.makeover
        && value.image?.isConcept
        && value.image?.label === 'Style makeover'
        && value.image?.size > 0
        && value.request
        && !value.missingConcept,
      'the missing Style makeover concept to be repaired',
    );
    if (successfulMakeoverRepair.project.selectedResult !== 'makeover') {
      throw new Error(`The successful Style makeover repair selected ${successfulMakeoverRepair.project.selectedResult} instead.`);
    }
    if (!successfulMakeoverRepair.request.includes('/api/property-transformations/makeover')) {
      throw new Error(`The Style makeover repair used the wrong endpoint: ${successfulMakeoverRepair.request}`);
    }
    if (successfulMakeoverRepair.project.resultKeys.stage !== beforeMakeoverRepair.resultKeys.stage) {
      throw new Error('Repairing Style makeover changed the saved Virtual stage image reference.');
    }
    const otherMakeoverKeys = (resultKeys) => Object.fromEntries(
      Object.entries(resultKeys ?? {}).filter(([action]) => action !== 'makeover'),
    );
    if (JSON.stringify(otherMakeoverKeys(successfulMakeoverRepair.project.resultKeys))
      !== JSON.stringify(otherMakeoverKeys(beforeMakeoverRepair.resultKeys))) {
      throw new Error('Repairing Style makeover changed another concept image reference.');
    }
    if (JSON.stringify(omitRepairFields(successfulMakeoverRepair.project))
      !== JSON.stringify(omitRepairFields(beforeMakeoverRepair))) {
      throw new Error('Repairing Style makeover changed unrelated saved project settings.');
    }

    await devTools.send('Page.navigate', { url });
    await waitFor(
      `(() => ({
        status: document.querySelector('#test-result')?.dataset.status,
        fixtureReady: typeof window.__propertyRecoveryTest?.readProject === 'function',
        studioReady: Boolean(document.querySelector('[data-testid="button-open-projects"]')),
      }))()`,
      (value) => value?.status === 'app-started' && value.fixtureReady && value.studioReady,
      'the studio after refreshing the repaired Style makeover concept',
    );
    const persistedMakeoverRepair = await waitFor(
      `(async () => {
        const project = await window.__propertyRecoveryTest.readProject();
        const image = project?.resultKeys?.makeover
          ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.makeover)
          : null;
        const stageImage = project?.resultKeys?.stage
          ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.stage)
          : null;
        const preview = document.querySelector('img[alt="Style makeover concept"]');
        const scenarioHeading = Array.from(document.querySelectorAll('h2'))
          .find((heading) => heading.textContent?.includes('Style makeover naast het origineel'));
        const notice = document.querySelector('[data-testid="status-missing-project-images"]')?.textContent ?? '';
        return {
          project,
          image,
          stageImage,
          previewLoaded: Boolean(preview?.complete && preview.naturalWidth > 0),
          scenarioVisible: Boolean(scenarioHeading),
          notice,
        };
      })()`,
      (value) => value?.project?.selectedResult === 'makeover'
        && value.project.resultKeys?.makeover === successfulMakeoverRepair.project.resultKeys.makeover
        && value.image?.isConcept
        && value.image?.label === 'Style makeover'
        && value.image?.size > 0
        && value.stageImage?.isConcept
        && value.previewLoaded
        && value.scenarioVisible
        && !value.notice.includes('Conceptfoto ontbreekt'),
      'the repaired Style makeover image and selected scenario to persist after refresh',
    );
    if (JSON.stringify(persistedMakeoverRepair.project.resultKeys)
      !== JSON.stringify(successfulMakeoverRepair.project.resultKeys)) {
      throw new Error('The Style makeover image references changed after reloading the studio.');
    }

    await evaluate(`document.querySelector('[data-testid="button-transform-stage"]')?.click()`);
    const restoredStageSelection = await waitFor(
      `(async () => {
        const project = await window.__propertyRecoveryTest.readProject();
        const image = project?.resultKeys?.stage
          ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.stage)
          : null;
        const scenarioHeading = Array.from(document.querySelectorAll('h2'))
          .find((heading) => heading.textContent?.includes('Virtual stage naast het origineel'));
        return { project, image, scenarioVisible: Boolean(scenarioHeading) };
      })()`,
      (value) => value?.project?.selectedResult === 'stage'
        && value.image?.isConcept
        && value.scenarioVisible
        && value.project.resultKeys?.makeover === successfulMakeoverRepair.project.resultKeys.makeover,
      'the existing Virtual stage checks to resume with their expected selected scenario',
    );
    if (!restoredStageSelection.scenarioVisible) {
      throw new Error('The Virtual stage scenario was not restored for the remaining recovery checks.');
    }

    await evaluate(`document.querySelector('[data-testid="button-open-projects"]')?.click()`);
    const projectListBeforeFailedDelete = await waitFor(
      projectListState,
      (value) => value?.open && value.projectIds?.join(',') === expectedNameOrder.join(','),
      'the saved-project list before the failed deletion check',
    );
    if (!projectListBeforeFailedDelete.open) throw new Error('The project list did not open for the deletion failure check.');

    const projectBeforeFailedDeletion = await evaluate(
      `(async () => {
        const project = await window.__propertyRecoveryTest.readProject();
        return {
          project,
          imageKeys: await window.__propertyRecoveryTest.readImageKeys(),
          source: project?.originalKey
            ? await window.__propertyRecoveryTest.readSourceImage(project.originalKey)
            : null,
          concept: project?.resultKeys?.stage
            ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.stage)
            : null,
        };
      })()`,
      true,
    );
    if (!projectBeforeFailedDeletion.project || !projectBeforeFailedDeletion.source || !projectBeforeFailedDeletion.concept) {
      throw new Error('The deletion-failure test did not start with a saved project and both referenced photos.');
    }
    await evaluate(`(async () => {
      window.confirm = () => true;
      const project = await window.__propertyRecoveryTest.readProject();
      const prototype = IDBObjectStore.prototype;
      const originalDelete = prototype.delete;
      window.__propertyRecoveryTest.deletionFailureInjected = false;
      window.__propertyRecoveryTest.restoreDeleteMethod = () => {
        prototype.delete = originalDelete;
        window.__propertyRecoveryTest.restoreDeleteMethod = null;
      };
      prototype.delete = function (key) {
        const request = originalDelete.call(this, key);
        if (this.name === 'images' && key === project.resultKeys.makeover) {
          window.__propertyRecoveryTest.deletionFailureInjected = true;
          this.transaction.abort();
        }
        return request;
      };
      const deleteButton = document.querySelector(
        '[data-testid="button-delete-project-browser-photo-recovery-project"]'
      );
      if (!deleteButton) throw new Error('The saved project deletion action was not rendered.');
      deleteButton.click();
    })()`, true);
    try {
      const failedDeletion = await waitFor(
        `(() => {
          const alert = document.querySelector('[data-testid="status-project-transfer-error"]');
          const row = document.querySelector('[data-testid="project-row-browser-photo-recovery-project"]');
          const deleteButton = document.querySelector('[data-testid="button-delete-project-browser-photo-recovery-project"]');
          return {
            alert: alert?.textContent ?? '',
            alertRole: alert?.getAttribute('role') ?? '',
            projectVisible: Boolean(row),
            actionReady: Boolean(deleteButton && !deleteButton.disabled),
            injected: window.__propertyRecoveryTest.deletionFailureInjected,
          };
        })()`,
        (value) => value?.alert && value.projectVisible && value.actionReady && value.injected,
        'the failed project deletion to leave the project visible and show an error',
      );
      if (failedDeletion.alertRole !== 'alert') {
        throw new Error('The project deletion error was not announced as an alert.');
      }
      if (!failedDeletion.alert.includes('Er is niets verwijderd') || !failedDeletion.alert.includes('project blijft in de lijst')) {
        throw new Error(`The project deletion error did not explain that the project was kept: ${failedDeletion.alert}`);
      }
      const dataAfterFailedDeletion = await evaluate(
        `(async () => {
          const project = await window.__propertyRecoveryTest.readProject();
          return {
            project,
            imageKeys: await window.__propertyRecoveryTest.readImageKeys(),
            source: project?.originalKey
              ? await window.__propertyRecoveryTest.readSourceImage(project.originalKey)
              : null,
            concept: project?.resultKeys?.stage
              ? await window.__propertyRecoveryTest.readConceptImage(project.resultKeys.stage)
              : null,
          };
        })()`,
        true,
      );
      if (JSON.stringify(dataAfterFailedDeletion.project) !== JSON.stringify(projectBeforeFailedDeletion.project)) {
        throw new Error('The failed deletion removed or changed the saved project.');
      }
      if (JSON.stringify(dataAfterFailedDeletion.imageKeys) !== JSON.stringify(projectBeforeFailedDeletion.imageKeys)) {
        throw new Error('The failed deletion partially removed or added photo records.');
      }
      if (!dataAfterFailedDeletion.source || !dataAfterFailedDeletion.concept) {
        throw new Error('The failed deletion removed a photo referenced by the saved project.');
      }
    } finally {
      await evaluate('window.__propertyRecoveryTest.restoreDeleteMethod?.()');
    }

    const assertReplacementSaveFailure = async ({
      testName,
      injection,
      expectedMessage,
      rawMessage,
    }) => {
      const before = await evaluate(
        `(async () => ({
          project: await window.__propertyRecoveryTest.readProject(),
          imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
        }))()`,
        true,
      );
      if (!before.project?.originalKey || !before.project?.resultKeys?.stage || !before.imageRecords.length) {
        throw new Error(`The ${testName} test did not start with saved source and concept photos.`);
      }
      await evaluate(`window.__propertyRecoveryTest.${injection}(${JSON.stringify(
        testName === 'blocked browser storage access' ? 'SecurityError'
          : testName === 'full browser storage' ? 'QuotaExceededError'
            : 'Error',
      )}, ${JSON.stringify(rawMessage)})`);
      await uploadReplacement(uploadPath);

      const failure = await waitFor(
        `(() => ({
          error: document.querySelector('[data-testid="status-upload-error"]')?.textContent ?? '',
          retryEnabled: Boolean(document.querySelector('[data-testid="button-upload-property"]') && !document.querySelector('[data-testid="button-upload-property"]').disabled),
          actionFinished: !document.querySelector('[data-testid="button-open-projects"]')?.disabled,
          selectedScenarioVisible: Array.from(document.querySelectorAll('h2'))
            .some((heading) => heading.textContent?.includes('Virtual stage naast het origineel')),
        }))()`,
        (value) => value?.error && value.retryEnabled && value.actionFinished && value.selectedScenarioVisible,
        `the ${testName} failure to keep the replacement-photo retry available`,
      );
      if (!failure.error.includes(expectedMessage)) {
        throw new Error(`The ${testName} failure showed the wrong guidance: ${failure.error}`);
      }
      if (failure.error.includes(rawMessage)) {
        throw new Error(`The ${testName} failure exposed the raw browser error: ${failure.error}`);
      }
      const after = await evaluate(
        `(async () => ({
          project: await window.__propertyRecoveryTest.readProject(),
          imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
        }))()`,
        true,
      );
      if (JSON.stringify(after.project) !== JSON.stringify(before.project)) {
        throw new Error(`The ${testName} failure changed the saved project or selected scenario.`);
      }
      if (JSON.stringify(after.imageRecords) !== JSON.stringify(before.imageRecords)) {
        throw new Error(`The ${testName} failure changed or partially wrote an existing photo.`);
      }
    };

    await assertReplacementSaveFailure({
      testName: 'full browser storage',
      injection: 'failNextImageWriteWith',
      expectedMessage: 'Maak ruimte vrij',
      rawMessage: 'SENSITIVE_QUOTA_DETAILS',
    });
    await assertReplacementSaveFailure({
      testName: 'blocked browser storage access',
      injection: 'failNextReadwriteTransactionWith',
      expectedMessage: 'Sta lokale opslag toe',
      rawMessage: 'SENSITIVE_ACCESS_DETAILS',
    });
    await assertReplacementSaveFailure({
      testName: 'unknown browser storage failure',
      injection: 'failNextImageWriteWith',
      expectedMessage: 'Controleer de browseropslag en probeer opnieuw',
      rawMessage: 'SENSITIVE_UNKNOWN_DETAILS',
    });

    const beforeFailedPhotoSave = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
      }))()`,
      true,
    );
    await uploadReplacement(uploadPath);
    await waitFor(
      `(() => ({
        error: document.querySelector('[data-testid="status-upload-error"]')?.textContent ?? '',
        uploadEnabled: Boolean(document.querySelector('[data-testid="button-upload-property"]') && !document.querySelector('[data-testid="button-upload-property"]').disabled),
        projectReady: document.querySelector('[data-testid="button-transform-stage"]') && !document.querySelector('[data-testid="button-transform-stage"]').disabled,
      }))()`,
      (value) => !value?.error && value?.uploadEnabled && value?.projectReady,
      'the retry replacement photo to save successfully',
    );
    const afterRetriedPhotoSave = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
      }))()`,
      true,
    );
    if (!afterRetriedPhotoSave.project?.originalKey
      || afterRetriedPhotoSave.project.originalKey === beforeFailedPhotoSave.project.originalKey
      || !afterRetriedPhotoSave.imageRecords.some((image) => image.key === afterRetriedPhotoSave.project.originalKey)) {
      throw new Error('The retry did not save and reference the replacement source photo.');
    }

    await evaluate(`(() => {
      if (document.querySelector('[data-testid="dialog-project-manager"]')) {
        document.querySelector('[data-testid="button-close-projects"]')?.click();
      }
    })()`);
    await waitFor(
      `!document.querySelector('[data-testid="dialog-project-manager"]')`,
      (value) => value === true,
      'the project manager to close before regenerating the active project preview',
    );
    await evaluate(`document.querySelector('[data-testid="button-transform-stage"]')?.click()`);
    const regeneratedActivePreview = await waitFor(
      `(() => {
        const source = document.querySelector('img[alt="Originele woningfoto"]');
        const concept = document.querySelector('img[alt="Virtual stage concept"]');
        const upload = document.querySelector('[data-testid="button-upload-property"]');
        return {
          sourceLoaded: Boolean(source?.complete && source.naturalWidth > 0),
          conceptLoaded: Boolean(concept?.complete && concept.naturalWidth > 0),
          uploadReady: Boolean(upload && !upload.disabled),
        };
      })()`,
      (value) => value?.sourceLoaded && value.conceptLoaded && value.uploadReady,
      'the active project to show its regenerated source and concept previews with uploads enabled',
    );
    if (!regeneratedActivePreview.sourceLoaded || !regeneratedActivePreview.conceptLoaded) {
      throw new Error('The active project did not show both photo previews before successful deletion.');
    }

    const beforeFailedPhotoCleanup = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
      }))()`,
      true,
    );
    const oldSourceKey = beforeFailedPhotoCleanup.project?.originalKey;
    const oldConceptKey = beforeFailedPhotoCleanup.project?.resultKeys?.stage;
    if (!oldSourceKey || !oldConceptKey || beforeFailedPhotoCleanup.project.selectedResult !== 'stage') {
      throw new Error('The cleanup-failure test did not start with a selected scenario and both saved photos.');
    }
    const sharedPhotoProject = {
      ...beforeFailedPhotoCleanup.project,
      id: 'browser-photo-cleanup-shared-reference',
      projectName: 'Photo cleanup shared reference',
      originalKey: oldSourceKey,
      resultKeys: {},
      selectedResult: null,
    };
    await evaluate(
      `window.__propertyRecoveryTest.saveProject(${JSON.stringify(sharedPhotoProject)})`,
      true,
    );
    const sharedReferenceReady = await waitFor(
      `(() => {
        const source = document.querySelector('img[alt="Originele woningfoto"]');
        const upload = document.querySelector('[data-testid="button-upload-property"]');
        return {
          sourceLoaded: Boolean(source?.complete && source.naturalWidth > 0),
          uploadReady: Boolean(upload && !upload.disabled),
        };
      })()`,
      (value) => value?.sourceLoaded && value.uploadReady,
      'the active source preview to remain ready after saving a second project reference',
    );
    if (!sharedReferenceReady.sourceLoaded || !sharedReferenceReady.uploadReady) {
      throw new Error('Saving a second project reference made the active source photo unavailable.');
    }
    await evaluate(
      `window.__propertyRecoveryTest.failNextPhotoCleanup([${JSON.stringify(oldConceptKey)}])`,
    );
    await uploadReplacement(uploadPath);

    const cleanupFailureUi = await waitFor(
      `(async () => {
        const alert = document.querySelector('[data-testid="status-photo-cleanup-error"]');
        const retryButton = document.querySelector('[data-testid="button-retry-photo-cleanup"]');
        const upload = document.querySelector('[data-testid="button-upload-property"]');
        const project = await window.__propertyRecoveryTest.readProject();
        const source = project?.originalKey
          ? await window.__propertyRecoveryTest.readSourceImage(project.originalKey)
          : null;
        return {
          projectUpdated: Boolean(project?.originalKey && project.originalKey !== ${JSON.stringify(oldSourceKey)}),
          sourceSaved: Boolean(source?.size > 0 && source.type.startsWith('image/') && !source.isConcept),
          uploadError: document.querySelector('[data-testid="status-upload-error"]')?.textContent ?? '',
          alert: alert?.textContent ?? '',
          alertRole: alert?.getAttribute('role') ?? '',
          retryEnabled: Boolean(retryButton && !retryButton.disabled),
          injected: window.__propertyRecoveryTest.didInjectPhotoCleanupFailure(),
        };
      })()`,
      (value) => (value?.alert && value.retryEnabled && value.projectUpdated && value.sourceSaved && value.injected) || value?.uploadError,
      'a failed old-photo cleanup to keep the replacement project valid and offer retry',
    );
    if (!cleanupFailureUi.alert) {
      throw new Error(`The photo replacement failed before cleanup could be tested: ${cleanupFailureUi.uploadError}`);
    }
    if (cleanupFailureUi.alertRole !== 'alert'
      || !cleanupFailureUi.alert.includes('oude foto')
      || !cleanupFailureUi.alert.includes('opgeslagen')) {
      throw new Error(`The cleanup warning did not explain that the old photo could not be removed after saving: ${cleanupFailureUi.alert}`);
    }
    const afterFailedPhotoCleanup = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        sharedProject: await window.__propertyRecoveryTest.readProject('browser-photo-cleanup-shared-reference'),
        source: await window.__propertyRecoveryTest.readSourceImage(
          (await window.__propertyRecoveryTest.readProject())?.originalKey
        ),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
        pendingCleanup: await window.__propertyRecoveryTest.readPendingPhotoCleanup(),
      }))()`,
      true,
    );
    if (!afterFailedPhotoCleanup.project
      || !afterFailedPhotoCleanup.source
      || afterFailedPhotoCleanup.project.originalKey === oldSourceKey
      || afterFailedPhotoCleanup.project.selectedResult !== null
      || Object.keys(afterFailedPhotoCleanup.project.resultKeys).length !== 0) {
      throw new Error('A cleanup failure invalidated the new source photo or changed the existing selected-scenario behavior.');
    }
    if (!afterFailedPhotoCleanup.imageRecords.some((image) => image.key === afterFailedPhotoCleanup.project.originalKey)
      || !afterFailedPhotoCleanup.imageRecords.some((image) => image.key === oldSourceKey)
      || !afterFailedPhotoCleanup.imageRecords.some((image) => image.key === oldConceptKey)
      || afterFailedPhotoCleanup.sharedProject?.originalKey !== oldSourceKey
      || !afterFailedPhotoCleanup.pendingCleanup.includes(oldSourceKey)
      || !afterFailedPhotoCleanup.pendingCleanup.includes(oldConceptKey)) {
      throw new Error('The failed cleanup did not preserve the new image, referenced old image, unused concept, and retry record.');
    }

    await evaluate(`document.querySelector('[data-testid="button-retry-photo-cleanup"]')?.click()`);
    const cleanupRetryUi = await waitFor(
      `(() => ({
        alertGone: !document.querySelector('[data-testid="status-photo-cleanup-error"]'),
        notice: document.querySelector('[data-testid="status-transform-success"]')?.textContent ?? '',
      }))()`,
      (value) => value?.alertGone && value.notice.includes('opgeslagen project'),
      'the safe cleanup retry to complete and explain that referenced photos were kept',
    );
    if (!cleanupRetryUi.alertGone || !cleanupRetryUi.notice.includes('behouden')) {
      throw new Error(`The cleanup retry did not explain that photos still used by saved projects are preserved: ${cleanupRetryUi.notice}`);
    }
    const afterPhotoCleanupRetry = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        sharedProject: await window.__propertyRecoveryTest.readProject('browser-photo-cleanup-shared-reference'),
        source: await window.__propertyRecoveryTest.readSourceImage(
          (await window.__propertyRecoveryTest.readProject())?.originalKey
        ),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
        pendingCleanup: await window.__propertyRecoveryTest.readPendingPhotoCleanup(),
      }))()`,
      true,
    );
    if (!afterPhotoCleanupRetry.source
      || afterPhotoCleanupRetry.project?.selectedResult !== null
      || !afterPhotoCleanupRetry.imageRecords.some((image) => image.key === afterPhotoCleanupRetry.project.originalKey)
      || !afterPhotoCleanupRetry.imageRecords.some((image) => image.key === oldSourceKey)
      || afterPhotoCleanupRetry.imageRecords.some((image) => image.key === oldConceptKey)
      || afterPhotoCleanupRetry.sharedProject?.originalKey !== oldSourceKey
      || afterPhotoCleanupRetry.pendingCleanup.length !== 0) {
      throw new Error('The cleanup retry removed a still-referenced photo, retained the unreferenced concept, or changed the saved project.');
    }
    await evaluate(
      `window.__propertyRecoveryTest.deleteProject(${JSON.stringify(sharedPhotoProject)})`,
      true,
    );
    const oldSharedPhoto = await evaluate(
      `window.__propertyRecoveryTest.readSourceImage(${JSON.stringify(oldSourceKey)})`,
      true,
    );
    if (oldSharedPhoto) {
      throw new Error('Removing the final project reference did not allow its old photo to be deleted.');
    }

    await evaluate(`document.querySelector('[data-testid="button-transform-stage"]')?.click()`);
    const finalActivePreview = await waitFor(
      `(() => {
        const source = document.querySelector('img[alt="Originele woningfoto"]');
        const concept = document.querySelector('img[alt="Virtual stage concept"]');
        return {
          sourceLoaded: Boolean(source?.complete && source.naturalWidth > 0),
          conceptLoaded: Boolean(concept?.complete && concept.naturalWidth > 0),
        };
      })()`,
      (value) => value?.sourceLoaded && value.conceptLoaded,
      'the active project to restore its source and concept previews after cleanup retry',
    );
    if (!finalActivePreview.sourceLoaded || !finalActivePreview.conceptLoaded) {
      throw new Error('The active project did not show its source and concept previews after the cleanup retry.');
    }

    await evaluate(`document.querySelector('[data-testid="button-open-projects"]')?.click()`);
    const openProjectBeforeDeletion = await waitFor(
      `(() => {
        const row = document.querySelector('[data-testid="project-row-browser-photo-recovery-project"]');
        const source = document.querySelector('img[alt="Originele woningfoto"]');
        const concept = document.querySelector('img[alt="Virtual stage concept"]');
        return {
          managerOpen: Boolean(document.querySelector('[data-testid="dialog-project-manager"]')),
          targetActive: row?.textContent?.includes('Actief') ?? false,
          sourceLoaded: Boolean(source?.complete && source.naturalWidth > 0),
          conceptLoaded: Boolean(concept?.complete && concept.naturalWidth > 0),
        };
      })()`,
      (value) => value?.managerOpen && value.targetActive && value.sourceLoaded && value.conceptLoaded,
      'the open project and both photo previews before successful deletion',
    );
    if (!openProjectBeforeDeletion.targetActive
      || !openProjectBeforeDeletion.sourceLoaded
      || !openProjectBeforeDeletion.conceptLoaded) {
      throw new Error('The successful deletion check did not start with the open project and both loaded photo previews.');
    }

    const beforeSuccessfulDeletion = await evaluate(
      `(async () => ({
        project: await window.__propertyRecoveryTest.readProject(),
        projects: await window.__propertyRecoveryTest.readProjects(),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
      }))()`,
      true,
    );
    if (!beforeSuccessfulDeletion.project
      || !beforeSuccessfulDeletion.imageRecords.some((image) => image.key === beforeSuccessfulDeletion.project.originalKey)
      || !beforeSuccessfulDeletion.imageRecords.some((image) => image.key === beforeSuccessfulDeletion.project.resultKeys.stage)
      || !beforeSuccessfulDeletion.imageRecords.some((image) => image.key === 'browser-photo-recovery-survivor-source')
      || !beforeSuccessfulDeletion.imageRecords.some((image) => image.key === 'browser-photo-recovery-survivor-concept')) {
      throw new Error('The successful deletion check did not start with the active project photos and a separate project with photos.');
    }

    await evaluate(`(() => {
      const test = window.__propertyRecoveryTest;
      test.deleteConfirmations = [];
      window.confirm = (message) => {
        test.deleteConfirmations.push(message);
        return true;
      };
      const deleteButton = document.querySelector(
        '[data-testid="button-delete-project-browser-photo-recovery-project"]'
      );
      if (!deleteButton) throw new Error('The open saved project deletion action was not rendered.');
      deleteButton.click();
    })()`);
    const successfulDeletionUi = await waitFor(
      `(async () => ({
        projectExists: Boolean(await window.__propertyRecoveryTest.readProject()),
        emptyHeading: Array.from(document.querySelectorAll('h1'))
          .some((heading) => heading.textContent?.includes('Geen actief project')),
        createEnabled: Boolean(document.querySelector('[data-testid="button-create-project"]')
          && !document.querySelector('[data-testid="button-create-project"]').disabled),
        savedProjectsButton: Boolean(document.querySelector('[data-testid="button-open-projects"]')),
        targetRowExists: Boolean(document.querySelector('[data-testid="project-row-browser-photo-recovery-project"]')),
        stalePhotoPreviewCount: document.querySelectorAll(
          'img[alt="Originele woningfoto"], img[alt$="concept"]'
        ).length,
        deleteConfirmation: window.__propertyRecoveryTest.deleteConfirmations[0] ?? '',
      }))()`,
      (value) => value?.emptyHeading
        && value.createEnabled
        && value.savedProjectsButton
        && !value.projectExists
        && !value.targetRowExists
        && value.stalePhotoPreviewCount === 0
        && value.deleteConfirmation,
      'the studio to return to a usable empty state after deleting its open project',
    );
    if (!successfulDeletionUi.deleteConfirmation.includes('Photo recovery browser fixture')
      || !successfulDeletionUi.deleteConfirmation.includes('foto')) {
      throw new Error(`The project deletion confirmation did not name the project and its photos: ${successfulDeletionUi.deleteConfirmation}`);
    }
    if (!successfulDeletionUi.emptyHeading || !successfulDeletionUi.createEnabled
      || !successfulDeletionUi.savedProjectsButton || successfulDeletionUi.stalePhotoPreviewCount !== 0) {
      throw new Error('Deleting the open project did not leave a usable empty studio without stale photo previews.');
    }

    const afterSuccessfulDeletion = await evaluate(
      `(async () => ({
        projects: await window.__propertyRecoveryTest.readProjects(),
        deletedProject: await window.__propertyRecoveryTest.readProject('browser-photo-recovery-project'),
        imageRecords: await window.__propertyRecoveryTest.readImageRecords(),
      }))()`,
      true,
    );
    const expectedRemainingProjects = beforeSuccessfulDeletion.projects
      .filter((item) => item.id !== beforeSuccessfulDeletion.project.id);
    const expectedRemainingImages = beforeSuccessfulDeletion.imageRecords
      .filter((image) => image.key !== beforeSuccessfulDeletion.project.originalKey
        && !Object.values(beforeSuccessfulDeletion.project.resultKeys).includes(image.key));
    if (afterSuccessfulDeletion.deletedProject) {
      throw new Error('The successfully deleted open project remained in browser storage.');
    }
    if (JSON.stringify(afterSuccessfulDeletion.projects) !== JSON.stringify(expectedRemainingProjects)) {
      throw new Error('Deleting the open project changed or removed another saved project.');
    }
    if (JSON.stringify(afterSuccessfulDeletion.imageRecords) !== JSON.stringify(expectedRemainingImages)) {
      throw new Error('Deleting the open project changed or removed another project’s photos.');
    }

    await evaluate(`document.querySelector('[data-testid="button-close-projects"]')?.click()`);
    await waitFor(
      `(() => ({
        managerClosed: !document.querySelector('[data-testid="dialog-project-manager"]'),
        emptyHeading: Array.from(document.querySelectorAll('h1'))
          .some((heading) => heading.textContent?.includes('Geen actief project')),
        createEnabled: Array.from(document.querySelectorAll('button')).some((button) =>
          button.textContent?.includes('Nieuw project') && !button.disabled),
        photoPreviewCount: document.querySelectorAll(
          'img[alt="Originele woningfoto"], img[alt$="concept"]'
        ).length,
      }))()`,
      (value) => value?.managerClosed && value.emptyHeading && value.createEnabled && value.photoPreviewCount === 0,
      'the saved-project manager to close onto the ready empty studio',
    );

    await devTools.send('Page.navigate', { url });
    const reloadedDeletionState = await waitFor(
      `(async () => {
        const fixture = window.__propertyRecoveryTest;
        if (typeof fixture?.readProject !== 'function' || typeof fixture?.readProjects !== 'function') {
          return { fixtureReady: false };
        }
        const projects = await fixture.readProjects();
        const survivor = await fixture.readProject('browser-photo-recovery-sort-alpha');
        const deletedProject = await fixture.readProject('browser-photo-recovery-project');
        const source = await fixture.readSourceImage('browser-photo-recovery-survivor-source');
        const concept = await fixture.readConceptImage('browser-photo-recovery-survivor-concept');
        const sourcePreview = document.querySelector('img[alt="Originele woningfoto"]');
        const conceptPreview = document.querySelector('img[alt="Surviving concept photo concept"]');
        return {
          fixtureReady: true,
          projects: projects.map((item) => item.id),
          survivor,
          deletedProjectExists: Boolean(deletedProject),
          source,
          concept,
          sourcePreviewLoaded: Boolean(sourcePreview?.complete && sourcePreview.naturalWidth > 0),
          conceptPreviewLoaded: Boolean(conceptPreview?.complete && conceptPreview.naturalWidth > 0),
        };
      })()`,
      (value) => value?.fixtureReady
        && value.projects
        && !value.projects.includes('browser-photo-recovery-project')
        && value.survivor?.id === 'browser-photo-recovery-sort-alpha'
        && value.source?.type === 'image/png'
        && value.concept?.type === 'image/png'
        && value.sourcePreviewLoaded
        && value.conceptPreviewLoaded,
      'the remaining project and its photos to be available in the studio after reload',
    );
    if (reloadedDeletionState.deletedProjectExists
      || !reloadedDeletionState.projects.includes('browser-photo-recovery-sort-zulu')
      || !reloadedDeletionState.source
      || !reloadedDeletionState.concept
      || !reloadedDeletionState.sourcePreviewLoaded
      || !reloadedDeletionState.conceptPreviewLoaded) {
      throw new Error('Reloading after deletion did not preserve the other saved projects and their usable photo previews.');
    }

    return 'Passed: JPEG source recovery stored and displayed the replacement photo without changing project assumptions or the selected scenario; quota, blocked-access, and unknown replacement-photo failures showed safe, specific guidance while preserving the saved project and photo contents, and retry succeeded; a failed generated-concept write kept the saved project and image records unchanged, showed a retry action, and succeeded on retry; both Virtual stage and Style makeover repairs used their matching endpoints and image references, remained selected, and persisted after refresh; the selected project-list order survived close, reopen, and reload; an aborted project deletion preserved the project and photos while showing a clear error; and deleting the open project returned the studio to a usable empty state, removed its photos, and preserved the other projects and their photos after reload.';
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

function makeTestJpeg() {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADoDFU3/2Q==',
    'base64',
  );
}

async function runSortOrderCrossTabTest(debugPort, url, browser) {
  const versionResponse = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
  if (!versionResponse.ok) throw new Error('Could not connect to the Chromium browser debugging endpoint.');
  const { webSocketDebuggerUrl } = await versionResponse.json();
  const browserDevTools = await connectDevTools(webSocketDebuggerUrl);
  const targets = [];

  const openPage = async () => {
    const page = await openBrowserPage(debugPort, browser, browserDevTools, url);
    targets.push(page);
    return page.devTools;
  };
  const evaluate = async (devTools, expression, awaitPromise = false) => {
    const response = await devTools.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.result?.exceptionDetails?.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result?.value;
  };
  const stateExpression = `(() => {
    const result = document.querySelector('#test-result');
    const dialog = document.querySelector('[data-testid="dialog-project-manager"]');
    const select = dialog?.querySelector('[data-testid="select-project-sort-order"]');
    const projectIds = Array.from(dialog?.querySelectorAll('li[data-testid^="project-row-"]') ?? [])
      .map((row) => row.getAttribute('data-testid')?.replace('project-row-', ''));
    return {
      status: result?.dataset.status,
      message: result?.textContent ?? '',
      order: select?.value,
      projectIds,
    };
  })()`;
  const waitForState = async (devTools, expectedOrder, expectedIds, description) => {
    const deadline = Date.now() + 15_000;
    let lastValue;
    while (Date.now() < deadline) {
      if (browser.exitCode !== null) throw new Error(`Chromium exited while waiting for ${description}.`);
      lastValue = await evaluate(devTools, stateExpression);
      if (lastValue?.status === 'failed') throw new Error(`Sort synchronization fixture failed: ${lastValue.message}`);
      if (lastValue?.status === 'ready'
          && lastValue.order === expectedOrder
          && lastValue.projectIds?.join(',') === expectedIds.join(',')) {
        return lastValue;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${description}. Last state: ${JSON.stringify(lastValue)}`);
  };
  const selectOrder = async (devTools, order) => evaluate(devTools, `(() => {
    const select = document.querySelector('[data-testid="select-project-sort-order"]');
    select.value = ${JSON.stringify(order)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  try {
    const firstTab = await openPage();
    const recentOrder = ['sort-sync-main', 'sort-sync-alpha', 'sort-sync-zulu'];
    const nameOrder = ['sort-sync-alpha', 'sort-sync-main', 'sort-sync-zulu'];
    const municipalityOrder = ['sort-sync-zulu', 'sort-sync-main', 'sort-sync-alpha'];
    await waitForState(firstTab, 'recent', recentOrder, 'the first project list');
    const savedProjectsBefore = await evaluate(
      firstTab,
      'window.__propertySortSyncTest.readProjects()',
      true,
    );

    const secondTab = await openPage();
    await waitForState(secondTab, 'recent', recentOrder, 'the second project list');

    await selectOrder(firstTab, 'name');
    await waitForState(firstTab, 'name', nameOrder, 'the first tab to apply project-name order');
    await waitForState(secondTab, 'name', nameOrder, 'the second tab to receive project-name order');

    await selectOrder(secondTab, 'municipality');
    await waitForState(secondTab, 'municipality', municipalityOrder, 'the second tab to apply municipality order');
    await waitForState(firstTab, 'municipality', municipalityOrder, 'the first tab to receive municipality order');

    const savedProjectsAfter = await evaluate(
      firstTab,
      'window.__propertySortSyncTest.readProjects()',
      true,
    );
    if (JSON.stringify(savedProjectsAfter) !== JSON.stringify(savedProjectsBefore)) {
      throw new Error('Synchronizing the project-list order changed a saved project or its timestamp.');
    }

    const blockedStorageResult = await evaluate(firstTab, `(() => {
      const originalGetItem = Storage.prototype.getItem;
      const originalSetItem = Storage.prototype.setItem;
      const preferenceKey = window.__propertySortSyncTest.preferenceKey;
      const originalPreference = originalGetItem.call(localStorage, preferenceKey);
      let blockRead = true;
      let blockWrite = false;
      Storage.prototype.getItem = function(key) {
        if (blockRead && key === preferenceKey) throw new DOMException('Storage access denied', 'SecurityError');
        return originalGetItem.call(this, key);
      };
      Storage.prototype.setItem = function(key, value) {
        if (blockWrite && key === preferenceKey) throw new DOMException('Storage access denied', 'SecurityError');
        return originalSetItem.call(this, key, value);
      };
      originalSetItem.call(localStorage, preferenceKey, 'recent');
      window.__propertySortSyncTest.setFailureMode = (mode) => {
        blockRead = mode === 'read';
        blockWrite = mode === 'write';
      };
      window.__propertySortSyncTest.restoreStorage = () => {
        Storage.prototype.getItem = originalGetItem;
        Storage.prototype.setItem = originalSetItem;
      };
      window.__propertySortSyncTest.cleanupStorage = () => {
        if (originalPreference === null) localStorage.removeItem(preferenceKey);
        else originalSetItem.call(localStorage, preferenceKey, originalPreference);
      };
      window.__propertySortSyncTest.remount();
      return true;
    })()`);
    if (!blockedStorageResult) throw new Error('Could not configure blocked project-sort storage in the browser test.');
    const blockedRead = await waitForState(firstTab, 'recent', recentOrder, 'the project list with blocked preference reads');
    const getNotice = async () => evaluate(firstTab, `(() => ({
      text: document.querySelector('[data-testid="status-project-sort-not-saved"]')?.textContent ?? '',
      order: document.querySelector('[data-testid="select-project-sort-order"]')?.value,
      projectIds: Array.from(document.querySelectorAll('li[data-testid^="project-row-"]'))
        .map((row) => row.getAttribute('data-testid')?.replace('project-row-', '')),
    }))()`);
    const readWarning = await getNotice();
    if (!readWarning.text.includes('wordt niet bewaard na vernieuwen')) {
      throw new Error('The project list did not explain that its sort preference could not be read.');
    }
    await evaluate(firstTab, `window.__propertySortSyncTest.setFailureMode('write')`);
    await selectOrder(firstTab, 'name');
    const writeWarning = await getNotice();
    if (writeWarning.order !== 'name' || writeWarning.projectIds?.join(',') !== nameOrder.join(',')) {
      throw new Error('Project sorting stopped working for the current session when saving the preference was blocked.');
    }
    if (!writeWarning.text.includes('wordt niet bewaard na vernieuwen')) {
      throw new Error('The project list did not explain that its sort preference could not be saved.');
    }
    await evaluate(firstTab, `window.__propertySortSyncTest.restoreStorage()`);
    await evaluate(firstTab, `window.__propertySortSyncTest.remount()`);
    const afterReload = await waitForState(firstTab, 'recent', recentOrder, 'the default order after a blocked preference write');
    const clearedWarning = await getNotice();
    if (clearedWarning.text) throw new Error('The storage warning remained after preference storage became available again.');
    await evaluate(firstTab, `window.__propertySortSyncTest.cleanupStorage()`);

    const secondAccountId = 'property-sort-order-second-account-browser-test';
    await evaluate(firstTab, `(() => {
      window.__propertySortSyncTest.savePreference('name', window.__propertySortSyncTest.accountId);
      window.__propertySortSyncTest.savePreference('municipality', ${JSON.stringify(secondAccountId)});
      window.__propertySortSyncTest.switchAccount(${JSON.stringify(secondAccountId)});
    })()`);
    await waitForState(firstTab, 'municipality', municipalityOrder, 'the second account to load its own project order');

    await evaluate(firstTab, `window.__propertySortSyncTest.switchAccount(window.__propertySortSyncTest.accountId)`);
    await waitForState(firstTab, 'name', nameOrder, 'the first account to keep its saved project order');

    await evaluate(firstTab, `window.__propertySortSyncTest.switchAccount(${JSON.stringify(secondAccountId)})`);
    await waitForState(firstTab, 'municipality', municipalityOrder, 'the second account to keep its saved project order');
    await selectOrder(firstTab, 'recent');
    await waitForState(firstTab, 'recent', recentOrder, 'the second account to save a different project order');

    const accountPreferences = await evaluate(firstTab, `({
      first: window.__propertySortSyncTest.readPreference(window.__propertySortSyncTest.accountId),
      second: window.__propertySortSyncTest.readPreference(${JSON.stringify(secondAccountId)}),
    })`);
    if (accountPreferences.first !== 'name' || accountPreferences.second !== 'recent') {
      throw new Error(`Changing one account's order overwrote another account's preference: ${JSON.stringify(accountPreferences)}.`);
    }

    await evaluate(firstTab, `window.__propertySortSyncTest.switchAccount(window.__propertySortSyncTest.accountId)`);
    await waitForState(firstTab, 'name', nameOrder, 'the first account after changing the second account preference');
    await evaluate(firstTab, `window.__propertySortSyncTest.switchAccount(${JSON.stringify(secondAccountId)})`);
    await waitForState(firstTab, 'recent', recentOrder, 'the second account after switching back');

    return `Cross-tab project sorting passed; blocked preference reads and writes showed a warning while sorting remained usable (read state: ${blockedRead.order}, reload state: ${afterReload.order}); switching accounts loaded and saved each account's separate project order.`;
  } finally {
    for (const { devTools } of targets) devTools.close();
    await Promise.all(targets.map(({ targetId }) =>
      browserDevTools.send('Target.closeTarget', { targetId }).catch(() => undefined)));
    browserDevTools.close();
  }
}

async function runAccountIsolationCrossTabTest(debugPort, url, browser) {
  const versionResponse = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
  if (!versionResponse.ok) throw new Error('Could not connect to the Chromium browser debugging endpoint.');
  const { webSocketDebuggerUrl } = await versionResponse.json();
  const browserDevTools = await connectDevTools(webSocketDebuggerUrl);
  const targets = [];

  const openPage = async (account, seed = false) => {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('crossTab', '1');
    pageUrl.searchParams.set('account', account);
    pageUrl.searchParams.set('seed', seed ? '1' : '0');
    const page = await openBrowserPage(debugPort, browser, browserDevTools, pageUrl.toString());
    targets.push(page);
    return page.devTools;
  };
  const evaluate = async (devTools, expression, awaitPromise = false) => {
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
  const waitFor = async (devTools, expression, predicate, description, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
      if (browser.exitCode !== null) throw new Error(`Chromium exited while waiting for ${description}.`);
      lastValue = await evaluate(devTools, expression, true);
      if (lastValue?.status === 'failed') {
        throw new Error(`Account privacy cross-tab fixture failed: ${lastValue.message}`);
      }
      if (predicate(lastValue)) return lastValue;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${description}. Last state: ${JSON.stringify(lastValue)}`);
  };
  const studioExpression = `(() => {
    const result = document.querySelector('#test-result');
    return {
      status: result?.dataset.status,
      message: result?.textContent ?? '',
      fixtureReady: Boolean(window.__accountIsolationCrossTabTest),
      studioReady: Boolean(document.querySelector('[data-testid="button-open-projects"]')),
    };
  })()`;
  const projectDialogExpression = `(() => {
    const result = document.querySelector('#test-result');
    const dialog = document.querySelector('[data-testid="dialog-project-manager"]');
    const projectIds = Array.from(dialog?.querySelectorAll('li[data-testid^="project-row-"]') ?? [])
      .map((row) => row.getAttribute('data-testid')?.replace('project-row-', ''));
    return {
      status: result?.dataset.status,
      message: result?.textContent ?? '',
      open: Boolean(dialog),
      projectIds,
      text: dialog?.textContent ?? '',
    };
  })()`;
  const imageStateExpression = `(async () => {
    const test = window.__accountIsolationCrossTabTest;
    const source = document.querySelector('img[alt="Originele woningfoto"]');
    const concept = document.querySelector('img[alt="' + test.conceptMarker + ' concept"]');
    const readImage = async (image) => image ? (await (await fetch(image.src)).text()) : '';
    return {
      sourceLoaded: Boolean(source?.complete && source.naturalWidth > 0),
      conceptLoaded: Boolean(concept?.complete && concept.naturalWidth > 0),
      sourceBytes: await readImage(source),
      conceptBytes: await readImage(concept),
    };
  })()`;

  try {
    const accountATab = await openPage('a', true);
    await waitFor(
      accountATab,
      studioExpression,
      (state) => state?.fixtureReady && state.status === 'app-started' && state.studioReady,
      'Account A’s signed-in studio',
    );

    const accountBTab = await openPage('b');
    await waitFor(
      accountBTab,
      studioExpression,
      (state) => state?.fixtureReady && state.status === 'app-started' && state.studioReady,
      'Account B’s signed-in studio',
    );

    const accountBWriterTab = await openPage('b');
    await waitFor(
      accountBWriterTab,
      studioExpression,
      (state) => state?.fixtureReady && state.status === 'app-started' && state.studioReady,
      'the second Account B tab',
    );

    const accountTest = (devTools) => evaluate(devTools, 'window.__accountIsolationCrossTabTest');
    const [accountATest, accountBTest] = await Promise.all([
      accountTest(accountATab),
      accountTest(accountBTab),
    ]);
    if (accountATest.accountId === accountBTest.accountId) {
      throw new Error('The separate browser tabs did not use distinct account scopes.');
    }

    const assertImages = async (devTools, test, accountLabel) => {
      const state = await waitFor(
        devTools,
        imageStateExpression,
        (value) => value?.sourceLoaded && value?.conceptLoaded,
        `${accountLabel}’s source photo and concept to load in the studio`,
      );
      if (!state.sourceBytes.includes(test.sourceMarker) || !state.conceptBytes.includes(test.conceptMarker)) {
        throw new Error(`${accountLabel} displayed images that did not match its own account’s stored photo bytes.`);
      }
      if (state.sourceBytes.includes(test.foreignSourceMarker)
        || state.sourceBytes.includes(test.foreignConceptMarker)
        || state.conceptBytes.includes(test.foreignSourceMarker)
        || state.conceptBytes.includes(test.foreignConceptMarker)) {
        throw new Error(`${accountLabel} displayed photo data belonging to the other account.`);
      }
    };
    await assertImages(accountATab, accountATest, 'Account A');
    await assertImages(accountBTab, accountBTest, 'Account B');

    const assertDirectReadsScoped = async (devTools, accountLabel) => {
      const reads = await evaluate(
        devTools,
        'window.__accountIsolationCrossTabTest.readForeignReferences()',
        true,
      );
      if (reads.foreignProjectRecord || reads.foreignSource || reads.foreignConcept
        || reads.projectImagesHasOriginal || reads.projectImagesHasConcept
        || !reads.missingOriginal || !reads.missingConcepts.includes('stage')) {
        throw new Error(`${accountLabel} could load the other account’s project or image records: ${JSON.stringify(reads)}.`);
      }
    };
    await assertDirectReadsScoped(accountATab, 'Account A');
    await assertDirectReadsScoped(accountBTab, 'Account B');

    await evaluate(accountATab, `document.querySelector('[data-testid="button-open-projects"]')?.click()`);
    await evaluate(accountBTab, `document.querySelector('[data-testid="button-open-projects"]')?.click()`);
    const [accountAList, accountBList] = await Promise.all([
      waitFor(
        accountATab,
        projectDialogExpression,
        (state) => state?.open && state.projectIds?.length === 1,
        'Account A’s saved-project list',
      ),
      waitFor(
        accountBTab,
        projectDialogExpression,
        (state) => state?.open && state.projectIds?.length === 1,
        'Account B’s saved-project list',
      ),
    ]);
    if (accountAList.projectIds[0] !== accountATest.project.id
      || accountAList.text.includes(accountATest.foreignProject.projectName)) {
      throw new Error('Account A’s project list displayed a project from Account B.');
    }
    if (accountBList.projectIds[0] !== accountBTest.project.id
      || accountBList.text.includes(accountBTest.foreignProject.projectName)) {
      throw new Error('Account B’s project list displayed a project from Account A.');
    }

    await Promise.all([
      evaluate(accountATab, 'window.__accountIsolationCrossTabTest.resetNotifications()'),
      evaluate(accountBTab, 'window.__accountIsolationCrossTabTest.resetNotifications()'),
    ]);
    const updatedAccountBProjectName = 'Account B project updated from a separate tab';
    await evaluate(
      accountBWriterTab,
      `window.__accountIsolationCrossTabTest.renameOwnProject(${JSON.stringify(updatedAccountBProjectName)})`,
      true,
    );
    const refreshedAccountBList = await waitFor(
      accountBTab,
      projectDialogExpression,
      (state) => state?.open && state.text.includes(updatedAccountBProjectName),
      'the matching Account B tab to refresh its saved-project list',
    );
    if (!refreshedAccountBList.projectIds.includes(accountBTest.project.id)) {
      throw new Error('The Account B storage notification removed or replaced its own project.');
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    const accountANotifications = await evaluate(
      accountATab,
      'window.__accountIsolationCrossTabTest.getNotificationCount()',
    );
    const accountBNotifications = await evaluate(
      accountBTab,
      'window.__accountIsolationCrossTabTest.getNotificationCount()',
    );
    const accountAAfterUpdate = await evaluate(accountATab, projectDialogExpression);
    if (accountANotifications !== 0) {
      throw new Error(`Account A received ${accountANotifications} storage-change notification(s) from Account B.`);
    }
    if (accountBNotifications < 1) {
      throw new Error('The matching Account B tab did not receive its storage-change notification.');
    }
    if (accountAAfterUpdate.text.includes(updatedAccountBProjectName)
      || accountAAfterUpdate.text.includes(accountATest.foreignProject.projectName)
      || accountAAfterUpdate.projectIds?.join(',') !== accountATest.project.id) {
      throw new Error('Account B’s storage change refreshed or exposed project data in Account A’s tab.');
    }

    return 'Passed: separate Account A and B tabs showed and loaded only their own projects and photo bytes; foreign project/image reads were empty; and an Account B storage update refreshed the matching tab without notifying or exposing data to Account A.';
  } finally {
    for (const { devTools } of targets) devTools.close();
    await Promise.all(targets.map(({ targetId }) =>
      browserDevTools.send('Target.closeTarget', { targetId }).catch(() => undefined)));
    browserDevTools.close();
  }
}

const chromiumPath = process.env.CHROMIUM_PATH || process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const port = await getFreePort();
const debugPort = await getFreePort();
const storageUrl = `http://127.0.0.1:${port}/tests/property-transformer-storage.html`;
const accountIsolationUrl = `http://127.0.0.1:${port}/tests/property-transformer-account-isolation.html`;
const accountIsolationCrossTabUrl = `http://127.0.0.1:${port}/tests/property-transformer-account-isolation.html`;
const recoveryUrl = `http://127.0.0.1:${port}/tests/property-transformer-recovery.html`;
const duplicateImportUrl = `http://127.0.0.1:${port}/tests/property-transformer-duplicate-import.html`;
const searchUrl = `http://127.0.0.1:${port}/tests/property-transformer-search.html`;
const sortSyncUrl = `http://127.0.0.1:${port}/tests/property-transformer-sort-sync.html`;
const userDataDir = await mkdtemp(path.join(tmpdir(), 'realestatex-property-storage-'));
const recoveryImagePath = path.join(userDataDir, 'replacement-source.png');
const recoveryJpegImagePath = path.join(userDataDir, 'replacement-source.jpeg');
const unreadableImagePath = path.join(userDataDir, 'unreadable-source.png');
const unsupportedImagePath = path.join(userDataDir, 'unsupported-source.gif');
await writeFile(
  recoveryImagePath,
  makeTestPng(),
);
await writeFile(recoveryJpegImagePath, makeTestJpeg());
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
  const timeout = setTimeout(() => browser.kill('SIGKILL'), 180_000);
  try {
    if (process.env.PROPERTY_DUPLICATE_IMPORT_ONLY === '1') {
      const duplicateImportResult = await runBrowserTest(debugPort, duplicateImportUrl, browser);
      console.log(duplicateImportResult);
    } else if (process.env.PROPERTY_RECOVERY_ONLY === '1') {
      const recoveryResult = await runAuthenticatedRecoveryTest(debugPort, recoveryUrl, recoveryImagePath, recoveryJpegImagePath, unreadableImagePath, unsupportedImagePath, browser);
      console.log(recoveryResult);
    } else if (process.env.PROPERTY_ACCOUNT_ISOLATION_ONLY === '1') {
      const accountIsolationResult = await runBrowserTest(debugPort, accountIsolationUrl, browser);
      const crossTabResult = await runAccountIsolationCrossTabTest(debugPort, accountIsolationCrossTabUrl, browser);
      console.log(`${accountIsolationResult}\n${crossTabResult}`);
    } else {
      const storageResult = await runBrowserTest(debugPort, storageUrl, browser);
      if (process.env.PROPERTY_STORAGE_ONLY === '1') {
        console.log(storageResult);
      } else {
        const accountIsolationResult = await runBrowserTest(debugPort, accountIsolationUrl, browser);
        const crossTabAccountIsolationResult = await runAccountIsolationCrossTabTest(debugPort, accountIsolationCrossTabUrl, browser);
        const recoveryResult = await runAuthenticatedRecoveryTest(debugPort, recoveryUrl, recoveryImagePath, recoveryJpegImagePath, unreadableImagePath, unsupportedImagePath, browser);
        const duplicateImportResult = await runBrowserTest(debugPort, duplicateImportUrl, browser);
        const searchResult = await runBrowserTest(debugPort, searchUrl, browser);
        const sortSyncResult = await runSortOrderCrossTabTest(debugPort, sortSyncUrl, browser);
        console.log(`${storageResult}\n${accountIsolationResult}\n${crossTabAccountIsolationResult}\n${recoveryResult}\n${duplicateImportResult}\n${searchResult}\n${sortSyncResult}`);
      }
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
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}