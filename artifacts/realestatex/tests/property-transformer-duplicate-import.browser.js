import { flushSync } from 'react-dom';
import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const {
  deletePropertyProject,
  exportPropertyProject,
  loadPropertyProjects,
  savePropertyProject,
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
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(predicate, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}.`);
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
  flushSync(() => button.click());
  await waitFor(
    () => Boolean(document.querySelector('[data-testid="dialog-project-manager"]')),
    'the authenticated project manager',
  );
}

function setImportFile(archive) {
  const input = document.querySelector('[data-testid="input-import-project"]');
  assert(input instanceof HTMLInputElement, 'The project import input was not rendered.');
  const transfer = new DataTransfer();
  transfer.items.add(new File([JSON.stringify(archive)], 'duplicate-project.realestatex.json', {
    type: 'application/json',
  }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function importMatchingBackup(archive) {
  const importButton = document.querySelector('[data-testid="button-import-project"]');
  assert(importButton instanceof HTMLButtonElement && !importButton.disabled, 'The project import control was not enabled.');
  flushSync(() => importButton.click());
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
    () => projectIds().length === 2 && activeProjectId() === initiallyOpenProject.id,
    'the different project to be active before importing',
  );
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
  result.textContent = 'Passed: the signed-in studio identified a matching backup; opening the saved project added no copy; importing an extra copy created and selected a distinct project; canceling left browser storage unchanged; simultaneous imports in two tabs saved only one copy and showed the duplicate choice in the other tab.';
}

prepareFixture().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
