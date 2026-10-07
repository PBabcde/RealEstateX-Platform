import { flushSync } from 'react-dom';
import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const {
  deletePropertyProject,
  exportPropertyProject,
  loadPropertyProjects,
  savePropertyProject,
  savePropertyImage,
  savePropertyProjectSortOrderPreference,
} = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);

const result = document.querySelector('#test-result');
const matchingProject = {
  id: 'browser-duplicate-import-existing',
  address: '22 Example Street',
  municipality: 'Amsterdam',
  projectName: 'Duplicate import fixture',
  notes: 'Saved project that matches the imported backup.',
  selectedStyle: 'industrial',
  originalKey: '',
  resultKeys: {},
  selectedResult: null,
  purchasePrice: 384000,
  renovationCost: 46250,
  acquisitionCost: 10750,
  estimatedValue: 498000,
  monthlyRent: 2180,
  splitRatio: 71,
  flipHorizontal: true,
  roiFields: {
    purchasePrice: 384000,
    renovationCost: 46250,
    acquisitionCost: 10750,
    estimatedValue: 498000,
    monthlyRent: 2180,
  },
  units: [{ id: 'duplicate-import-unit', label: 'Unit A', area: 47.5, value: 238000, flipped: true }],
  checklist: [{ id: 'duplicate-import-checklist', label: 'Review the saved plan', done: true }],
  updatedAt: '2026-10-05T12:00:00.000Z',
};
const initiallyOpenProject = {
  ...matchingProject,
  id: 'browser-duplicate-import-current',
  address: '8 Other Street',
  municipality: 'Utrecht',
  projectName: 'Different open project',
  notes: 'This project is open before importing the matching backup.',
  updatedAt: '2026-10-06T12:00:00.000Z',
};

const concurrentImportProject = {
  ...matchingProject,
  id: 'browser-concurrent-import-project',
  address: '14 Cross-tab Street',
  municipality: 'Rotterdam',
  projectName: 'Concurrent import fixture',
  notes: 'This backup is imported from two tabs at the same time.',
};
const rejectedImportProject = {
  ...matchingProject,
  id: 'browser-rejected-import-fixture',
  address: '31 Damaged Archive Road',
  projectName: 'Rejected archive fixture',
  notes: 'This project is only used to create rejected backup files.',
  originalKey: 'browser-rejected-import-source',
};
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let browserKeyboardRequestId = 0;

async function waitFor(predicate, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function pressKeyboardKey(key, expectedFocusSelector, shift = false) {
  const requestId = ++browserKeyboardRequestId;
  window.__browserTestKeyboardRequest = { id: requestId, key, shift };
  await waitFor(
    () => window.__browserTestKeyboardResponse === requestId,
    `the browser to send the ${shift ? 'Shift+' : ''}${key} key`,
  );
  if (expectedFocusSelector) {
    await waitFor(
      () => document.activeElement === document.querySelector(expectedFocusSelector),
      `keyboard focus to move to ${expectedFocusSelector}`,
    );
  }
}

function projectIds() {
  return [...document.querySelectorAll('[data-testid^="project-row-"]')]
    .map((row) => row.getAttribute('data-testid').replace('project-row-', ''));
}

function activeProjectId() {
  const row = [...document.querySelectorAll('[data-testid^="project-row-"]')]
    .find((item) => item.querySelector('button[data-testid^="button-open-project-"]')?.textContent?.trim() === 'Geopend');
  return row?.getAttribute('data-testid')?.replace('project-row-', '') ?? null;
}

async function openProjectManager() {
  const button = document.querySelector('[data-testid="button-open-projects"]');
  assert(button instanceof HTMLButtonElement, 'The signed-in Property Transformer did not render its project-list control.');
  flushSync(() => {
    button.focus();
    button.click();
  });
  await waitFor(
    () => Boolean(document.querySelector('[data-testid="dialog-project-manager"]')),
    'the authenticated project manager',
  );
  await waitFor(
    () => document.activeElement === document.querySelector('[data-testid="input-search-projects"]'),
    'keyboard focus to move to project search when the list opens',
  );
}

function setImportFile(archive, name = 'duplicate-project.realestatex.json') {
  const input = document.querySelector('[data-testid="input-import-project"]');
  assert(input instanceof HTMLInputElement, 'The project import input was not rendered.');
  const transfer = new DataTransfer();
  transfer.items.add(new File([JSON.stringify(archive)], name, {
    type: 'application/json',
  }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function importMatchingBackup(archive) {
  const importButton = document.querySelector('[data-testid="button-import-project"]');
  assert(importButton instanceof HTMLButtonElement && !importButton.disabled, 'The project import control was not enabled.');
  flushSync(() => {
    importButton.focus();
    importButton.click();
  });
  setImportFile(archive);
  await waitFor(
    () => Boolean(document.querySelector('[data-testid="dialog-duplicate-import"]')),
    'the duplicate-project dialog for the matching saved backup',
  );
}

async function prepareFixture() {
  savePropertyProjectSortOrderPreference('recent');
  for (const previousProject of await loadPropertyProjects()) {
    await deletePropertyProject(previousProject);
  }
  await savePropertyProject(matchingProject);
  await savePropertyProject(initiallyOpenProject);
  const archive = await exportPropertyProject(matchingProject);
  await savePropertyImage({
    key: rejectedImportProject.originalKey,
    blob: new Blob(['source bytes for rejected archive'], { type: 'image/png' }),
    label: 'Originele foto',
    mimeType: 'image/png',
    isConcept: false,
    disclaimer: 'Test source photo.',
    createdAt: '2026-10-06T12:00:00.000Z',
  });
  const rejectedArchive = await exportPropertyProject(rejectedImportProject);
  const incompleteArchive = structuredClone(rejectedArchive);
  incompleteArchive.images = incompleteArchive.images.filter(
    (image) => image.key !== rejectedImportProject.originalKey,
  );
  const damagedArchive = structuredClone(rejectedArchive);
  damagedArchive.images[0].blobBase64 = btoa('modified source bytes');
  const concurrentArchive = await exportPropertyProject(concurrentImportProject);

  history.replaceState(null, '', '/property-transformer');
  await import('../src/main.tsx');
  await waitFor(
    () => Boolean(document.querySelector('[data-testid="button-logout"]')),
    'the signed-in app shell',
  );
  assert(
    !document.querySelector('[data-testid="button-login"]'),
    'The browser fixture rendered the signed-out gate instead of its signed-in session.',
  );
  assert(
    window.location.pathname === '/property-transformer',
    `The app did not open the protected studio route (found ${window.location.pathname}).`,
  );
  await waitFor(
    () => Boolean(document.querySelector('[data-testid="button-open-projects"]')),
    'the authenticated Property Transformer screen',
  );

  await openProjectManager();
  await waitFor(
    () => projectIds().length === 2,
    'the saved projects to load before checking the project-list Tab boundary',
  );
  const projectManagerDialog = document.querySelector('[data-testid="dialog-project-manager"]');
  const projectManagerFocusables = projectManagerDialog?.querySelectorAll(
    'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  );
  const projectManagerFirstFocus = projectManagerFocusables?.[0];
  const projectManagerLastFocus = projectManagerFocusables?.[projectManagerFocusables.length - 1];
  assert(projectManagerFirstFocus?.getAttribute('data-testid') === 'button-close-projects', 'The project list did not expose its close control as the first Tab stop.');
  assert(projectManagerLastFocus instanceof HTMLElement, 'The project list did not expose a final keyboard control.');
  flushSync(() => projectManagerFirstFocus.focus());
  await pressKeyboardKey('Tab', `[data-testid="${projectManagerLastFocus.getAttribute('data-testid')}"]`, true);
  await pressKeyboardKey('Tab', '[data-testid="button-close-projects"]');
  const beforeProjectListEscape = JSON.stringify(await loadPropertyProjects());
  await pressKeyboardKey('Escape');
  await waitFor(
    () => !document.querySelector('[data-testid="dialog-project-manager"]'),
    'the project list to close after Escape',
  );
  assert(
    JSON.stringify(await loadPropertyProjects()) === beforeProjectListEscape,
    'Closing the project list with Escape changed the saved projects.',
  );
  await waitFor(
    () => document.activeElement === document.querySelector('[data-testid="button-open-projects"]'),
    'focus to return to the project-list opener after Escape',
  );

  await openProjectManager();
  await waitFor(
    () => projectIds().length === 2 && activeProjectId() === initiallyOpenProject.id,
    'the different project to be active before importing',
  );

  const assertRejectedBackup = async (rejected, expectedReason, label) => {
    const beforeProjects = await loadPropertyProjects();
    const beforeActiveProjectId = activeProjectId();
    setImportFile(rejected, `${label}.realestatex.json`);
    await waitFor(
      () => {
        const error = document.querySelector('[data-testid="status-project-transfer-error"]');
        const importButton = document.querySelector('[data-testid="button-import-project"]');
        return Boolean(error?.textContent && importButton && !importButton.disabled);
      },
      `the ${label} backup to be rejected with a recoverable message`,
    );
    const error = document.querySelector('[data-testid="status-project-transfer-error"]');
    assert(error?.getAttribute('role') === 'alert', `The ${label} backup error was not announced as an alert.`);
    assert(error.textContent.includes(expectedReason), `The ${label} backup error did not explain the problem: ${error.textContent}`);
    assert(error.textContent.includes('Er is niets toegevoegd'), `The ${label} backup error did not confirm that nothing was added: ${error.textContent}`);
    assert(error.textContent.includes('opgeslagen projecten zijn ongewijzigd'), `The ${label} backup error did not reassure the user that saved projects are unchanged: ${error.textContent}`);
    assert(error.textContent.includes('probeer het opnieuw'), `The ${label} backup error did not explain how to recover: ${error.textContent}`);
    assert(document.querySelector('[data-testid="dialog-project-manager"]'), `The project manager closed after rejecting the ${label} backup.`);
    assert(
      JSON.stringify(await loadPropertyProjects()) === JSON.stringify(beforeProjects),
      `Rejecting the ${label} backup added or changed a saved project.`,
    );
    assert(
      JSON.stringify(projectIds().sort()) === JSON.stringify(beforeProjects.map((project) => project.id).sort()),
      `The project manager list changed after rejecting the ${label} backup.`,
    );
    assert(activeProjectId() === beforeActiveProjectId, `Rejecting the ${label} backup changed which project was open.`);
  };

  await assertRejectedBackup(incompleteArchive, 'bronfoto ontbreekt', 'incomplete');
  await assertRejectedBackup(damagedArchive, 'beschadigd', 'checksum-damaged');

  await importMatchingBackup(archive);
  const duplicateDialog = document.querySelector('[data-testid="dialog-duplicate-import"]');
  assert(duplicateDialog?.textContent?.includes(matchingProject.projectName), 'The duplicate dialog did not identify the matching saved project.');
  for (const selector of [
    '[data-testid="button-open-existing-duplicate"]',
    '[data-testid="button-import-another-copy"]',
    '[data-testid="button-cancel-duplicate-import"]',
  ]) {
    assert(duplicateDialog.querySelector(selector), `The duplicate dialog did not render ${selector}.`);
  }

  flushSync(() => duplicateDialog.querySelector('[data-testid="button-open-existing-duplicate"]').click());
  await waitFor(
    () => !document.querySelector('[data-testid="dialog-duplicate-import"]')
      && !document.querySelector('[data-testid="dialog-project-manager"]'),
    'the matching saved project to open',
  );
  await waitFor(
    () => document.activeElement === document.querySelector('[data-testid="button-open-projects"]'),
    'focus to return to the project-list control after opening the saved project',
  );
  await openProjectManager();
  await waitFor(
    () => projectIds().length === 2 && activeProjectId() === matchingProject.id,
    'the matching saved project to be selected without adding a copy',
  );
  const idsAfterOpeningExisting = (await loadPropertyProjects()).map((project) => project.id).sort();
  assert(
    JSON.stringify(idsAfterOpeningExisting) === JSON.stringify([matchingProject.id, initiallyOpenProject.id].sort()),
    'Opening the saved project added or removed a stored project.',
  );
  flushSync(() => document.querySelector('[data-testid="button-close-projects"]').click());

  await openProjectManager();
  await importMatchingBackup(archive);
  flushSync(() => document.querySelector('[data-testid="button-import-another-copy"]').click());
  await waitFor(
    async () => (await loadPropertyProjects()).length === 3
      && !document.querySelector('[data-testid="dialog-duplicate-import"]')
      && !document.querySelector('[data-testid="dialog-project-manager"]'),
    'a distinct extra copy to be saved and opened',
  );
  await waitFor(
    () => document.activeElement === document.querySelector('[data-testid="button-open-projects"]'),
    'focus to return to the project-list control after importing an extra copy',
  );
  const projectsAfterCopy = await loadPropertyProjects();
  const extraCopies = projectsAfterCopy.filter((project) => project.projectName === matchingProject.projectName);
  assert(extraCopies.length === 2, 'Importing an extra copy did not leave exactly two projects with the matching project details.');
  const importedCopy = extraCopies.find((project) => project.id !== matchingProject.id);
  assert(importedCopy, 'The extra copy did not receive a distinct project ID.');
  assert(
    importedCopy.notes === matchingProject.notes
      && importedCopy.address === matchingProject.address
      && importedCopy.checklist[0]?.label === matchingProject.checklist[0]?.label,
    'The extra copy did not preserve the archived project details.',
  );

  await openProjectManager();
  await waitFor(
    () => activeProjectId() === importedCopy.id && projectIds().length === 3,
    'the new copy to be selected in the project manager',
  );
  const beforeCancel = JSON.stringify(await loadPropertyProjects());
  await importMatchingBackup(archive);
  flushSync(() => document.querySelector('[data-testid="button-cancel-duplicate-import"]').click());
  await waitFor(
    () => !document.querySelector('[data-testid="dialog-duplicate-import"]'),
    'the duplicate dialog to close after cancellation',
  );
  const afterCancel = JSON.stringify(await loadPropertyProjects());
  assert(beforeCancel === afterCancel, 'Canceling the duplicate import changed the saved projects.');
  assert(
    activeProjectId() === importedCopy.id,
    'Canceling the duplicate import changed which project is open.',
  );

  await importMatchingBackup(archive);
  const keyboardDialog = document.querySelector('[data-testid="dialog-duplicate-import"]');
  const cancelChoice = keyboardDialog?.querySelector('[data-testid="button-cancel-duplicate-import"]');
  assert(document.activeElement === cancelChoice, 'Opening the duplicate dialog did not move keyboard focus inside it.');
  const beforeKeyboardCancel = JSON.stringify(await loadPropertyProjects());
  await pressKeyboardKey('Tab', '[data-testid="button-import-another-copy"]');
  await pressKeyboardKey('Tab', '[data-testid="button-open-existing-duplicate"]');
  await pressKeyboardKey('Tab', '[data-testid="button-cancel-duplicate-import"]');
  await pressKeyboardKey('Tab', '[data-testid="button-open-existing-duplicate"]', true);
  await pressKeyboardKey('Escape');
  await waitFor(
    () => !document.querySelector('[data-testid="dialog-duplicate-import"]'),
    'the duplicate dialog to close after Escape',
  );
  const afterKeyboardCancel = JSON.stringify(await loadPropertyProjects());
  assert(beforeKeyboardCancel === afterKeyboardCancel, 'Canceling the duplicate import with Escape changed the saved projects in IndexedDB.');
  assert(activeProjectId() === importedCopy.id, 'Canceling the duplicate import with Escape changed which project is open.');
  await waitFor(
    () => document.activeElement === document.querySelector('[data-testid="button-import-project"]'),
    'focus to return to the project import control after Escape',
  );

  const countBeforeConcurrentImport = (await loadPropertyProjects()).length;
  const racePopup = window.open('/tests/property-transformer-cross-tab-import.html', '_blank');
  assert(racePopup, 'Chromium did not open a second tab for the concurrent-import test.');
  try {
    await waitFor(
      () => racePopup.document.querySelector('#test-result')?.dataset.status === 'ready',
      'the second tab to load the authenticated project-import interface',
    );
    const secondTabImport = racePopup.__startCrossTabImport(concurrentArchive);
    setImportFile(concurrentArchive);
    const [secondTabOutcome] = await Promise.all([
      secondTabImport,
      waitFor(
        () => {
          const duplicateDialog = document.querySelector('[data-testid="dialog-duplicate-import"]');
          const managerOpen = Boolean(document.querySelector('[data-testid="dialog-project-manager"]'));
          return duplicateDialog ? 'duplicate' : managerOpen ? null : 'imported';
        },
        'this tab to either save the backup or show the duplicate choice',
      ),
    ]);
    const firstTabOutcome = document.querySelector('[data-testid="dialog-duplicate-import"]')
      ? 'duplicate'
      : 'imported';
    assert(
      [firstTabOutcome, secondTabOutcome].filter((outcome) => outcome === 'duplicate').length === 1
        && [firstTabOutcome, secondTabOutcome].filter((outcome) => outcome === 'imported').length === 1,
      `The two tabs did not resolve the competing imports consistently (this tab: ${firstTabOutcome}; second tab: ${secondTabOutcome}).`,
    );
    const projectsAfterConcurrentImport = await loadPropertyProjects();
    assert(
      projectsAfterConcurrentImport.length === countBeforeConcurrentImport + 1,
      'Concurrent imports from two tabs created more than one new project.',
    );
    assert(
      projectsAfterConcurrentImport.filter((project) => project.projectName === concurrentImportProject.projectName).length === 1,
      'The matching backup was not saved exactly once across both tabs.',
    );
  } finally {
    racePopup.close();
  }

  result.dataset.status = 'passed';
  result.textContent = 'Passed: the signed-in studio showed recoverable errors for incomplete and checksum-damaged project backups without changing saved projects; a valid import remained available; opening the saved project added no copy; importing an extra copy created and selected a distinct project; canceling left browser storage unchanged; simultaneous imports in two tabs saved only one copy and showed the duplicate choice in the other tab.';
}

prepareFixture().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
