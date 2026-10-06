const result = document.querySelector('#test-result');

function waitFor(predicate, description, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (predicate()) {
        resolve();
      } else if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${description}.`));
      } else {
        window.setTimeout(check, 50);
      }
    };
    check();
  });
}

window.__startCrossTabImport = async (archive) => {
  try {
    const openProjectsButton = document.querySelector('[data-testid="button-open-projects"]');
    if (!(openProjectsButton instanceof HTMLButtonElement)) {
      throw new Error('The second tab did not render its project-list control.');
    }
    openProjectsButton.click();
    await waitFor(
      () => Boolean(document.querySelector('[data-testid="dialog-project-manager"]')),
      'the second tab project manager',
    );

    const importButton = document.querySelector('[data-testid="button-import-project"]');
    const input = document.querySelector('[data-testid="input-import-project"]');
    if (!(importButton instanceof HTMLButtonElement) || !(input instanceof HTMLInputElement)) {
      throw new Error('The second tab project-import controls were not available.');
    }
    importButton.click();
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(archive)], 'concurrent-project.realestatex.json', {
      type: 'application/json',
    }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="dialog-duplicate-import"]'))
        || !document.querySelector('[data-testid="dialog-project-manager"]'),
      'the second tab to resolve the concurrent import',
    );
    const outcome = document.querySelector('[data-testid="dialog-duplicate-import"]')
      ? 'duplicate'
      : 'imported';
    result.dataset.status = outcome;
    result.textContent = `The second tab resolved the import as ${outcome}.`;
    return outcome;
  } catch (error) {
    result.dataset.status = 'failed';
    result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
    throw error;
  }
};

history.replaceState(null, '', '/property-transformer');
await import('../src/main.tsx');
await waitFor(
  () => Boolean(document.querySelector('[data-testid="button-open-projects"]')),
  'the authenticated studio in the second tab',
);
result.dataset.status = 'ready';
result.textContent = 'The second tab is ready.';
