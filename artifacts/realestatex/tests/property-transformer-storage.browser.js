import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';
import { ProjectManager } from '../src/pages/property-transformer.tsx';

const {
  deletePropertyProject,
  deletePropertyImage,
  exportPropertyPortfolio,
  exportPropertyProject,
  findMatchingSavedPropertyProject,
  importPropertyPortfolio,
  importPropertyProject,
  loadPropertyImage,
  loadPropertyProject,
  loadPropertyProjectImages,
  loadPropertyProjects,
  loadPropertyProjectsWithPhotoHealth,
  savePropertyImage,
  savePropertyProject,
  savePropertyProjectWithImage,
  subscribePropertyStorageChanges,
} = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);
const result = document.querySelector('#test-result');
const phaseKey = 'property-storage-browser-test-phase';
result.textContent = 'Test module loaded; preparing IndexedDB…';
const imagePayloads = {
  'alpha-original': { text: 'alpha source photo', type: 'image/png', label: 'Originele foto' },
  'alpha-stage': { text: 'alpha generated concept', type: 'image/jpeg', label: 'Virtual stage' },
  'beta-original': { text: 'beta source photo', type: 'image/png', label: 'Originele foto' },
  'beta-dusk': { text: 'beta generated concept', type: 'image/jpeg', label: 'Day to dusk' },
  'recovery-original': { text: 'replacement source photo', type: 'image/png', label: 'Originele foto' },
  'recovery-stage': { text: 'saved concept whose image is missing', type: 'image/jpeg', label: 'Virtual stage' },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeProject({
  id,
  name,
  originalKey,
  resultAction,
  resultKey,
  style,
  splitRatio,
  flipHorizontal,
  purchasePrice,
  renovationCost,
  acquisitionCost,
  estimatedValue,
  monthlyRent,
  unitFlip,
  checklist,
}) {
  return {
    id,
    address: `${id} street 12`,
    municipality: 'Amsterdam',
    projectName: name,
    notes: `Notes for ${name}`,
    selectedStyle: style,
    originalKey,
    resultKeys: { [resultAction]: resultKey },
    selectedResult: resultAction,
    purchasePrice,
    renovationCost,
    acquisitionCost,
    estimatedValue,
    monthlyRent,
    splitRatio,
    flipHorizontal,
    roiFields: { purchasePrice, renovationCost, acquisitionCost, estimatedValue, monthlyRent },
    units: [
      { id: `${id}-unit-a`, label: 'Unit A', area: 47.5, value: 238000, flipped: unitFlip },
      { id: `${id}-unit-b`, label: 'Unit B', area: 36, value: 191500, flipped: !unitFlip },
    ],
    checklist: checklist.map(([itemId, label, done]) => ({ id: itemId, label, done })),
    updatedAt: id === 'project-alpha' ? '2026-01-02T03:04:05.000Z' : '2026-02-03T04:05:06.000Z',
  };
}

const expectedProjects = {
  alpha: makeProject({
    id: 'project-alpha',
    name: 'Canal House',
    originalKey: 'alpha-original',
    resultAction: 'stage',
    resultKey: 'alpha-stage',
    style: 'modern',
    splitRatio: 37,
    flipHorizontal: true,
    purchasePrice: 412500,
    renovationCost: 37600,
    acquisitionCost: 12350,
    estimatedValue: 529000,
    monthlyRent: 2475,
    unitFlip: true,
    checklist: [
      ['alpha-survey', 'Check the survey', true],
      ['alpha-contract', 'Review contractor quote', false],
      ['alpha-photo', 'Book photography', true],
    ],
  }),
  beta: makeProject({
    id: 'project-beta',
    name: 'Garden Apartment',
    originalKey: 'beta-original',
    resultAction: 'dusk',
    resultKey: 'beta-dusk',
    style: 'industrial',
    splitRatio: 68,
    flipHorizontal: false,
    purchasePrice: 298000,
    renovationCost: 51400,
    acquisitionCost: 8900,
    estimatedValue: 422000,
    monthlyRent: 2090,
    unitFlip: false,
    checklist: [
      ['beta-permit', 'Confirm permit status', false],
      ['beta-budget', 'Approve renovation budget', true],
    ],
  }),
};

async function saveImage(key) {
  const image = imagePayloads[key];
  await savePropertyImage({
    key,
    blob: new Blob([image.text], { type: image.type }),
    label: image.label,
    mimeType: image.type,
    isConcept: key.endsWith('-stage') || key.endsWith('-dusk'),
    disclaimer: key.endsWith('-original') ? 'Source photo stored locally.' : 'AI concept, not a factual representation.',
    createdAt: '2026-03-04T05:06:07.000Z',
  });
}

async function assertProjectAndPhotos(name) {
  const expected = expectedProjects[name];
  const actual = await loadPropertyProject(expected.id);
  assert(actual, `${expected.projectName} was not found after reload.`);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${expected.projectName} settings changed after reload.`);

  for (const key of [expected.originalKey, ...Object.values(expected.resultKeys)]) {
    const stored = await loadPropertyImage(key);
    const payload = imagePayloads[key];
    assert(stored, `Image ${key} was not found after reload.`);
    assert(stored.blob instanceof Blob, `Image ${key} was not restored as a Blob.`);
    assert(stored.blob.type === payload.type, `Image ${key} MIME type changed.`);
    assert((await stored.blob.text()) === payload.text, `Image ${key} content changed.`);
    assert(stored.label === payload.label, `Image ${key} label changed.`);
    assert(stored.isConcept === !key.endsWith('-original'), `Image ${key} concept selection changed.`);
    assert(Boolean(stored.disclaimer), `Image ${key} disclaimer was lost.`);
  }
}

async function assertProjectList(expectedIds) {
  const projects = await loadPropertyProjects();
  const actualIds = projects.map((project) => project.id).sort();
  assert(JSON.stringify(actualIds) === JSON.stringify([...expectedIds].sort()), `Expected project list ${expectedIds.join(', ')}, received ${actualIds.join(', ')}.`);
}

function assertVisibleProjectOrder(expectedIds, message) {
  const actualIds = [...document.querySelectorAll('#project-search-test-root [data-testid^="project-row-"]')]
    .map((row) => row.getAttribute('data-testid').replace('project-row-', ''));
  assert(JSON.stringify(actualIds) === JSON.stringify(expectedIds), `${message} Expected ${expectedIds.join(', ')}, received ${actualIds.join(', ')}.`);
}

function setSearchQuery(value) {
  const input = document.querySelector('#project-search-test-root [data-testid="input-search-projects"]');
  assert(input instanceof HTMLInputElement, 'The saved-project search field was not rendered.');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

function setProjectSortOrder(value) {
  const select = document.querySelector('#project-search-test-root [data-testid="select-project-sort-order"]');
  assert(select instanceof HTMLSelectElement, 'The saved-project sort selector was not rendered.');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
  flushSync(() => select.dispatchEvent(new Event('change', { bubbles: true })));
}

function runSavedProjectSearchUiChecks(transferError = '') {
  const projects = [
    { id: 'search-newest', projectName: 'Café Loft', address: '12 Rue Road', municipality: 'Haarlem', updatedAt: '2026-09-28T00:00:00.000Z' },
    { id: 'search-middle', projectName: 'Canal House', address: '42 Canal Road', municipality: 'Amsterdam', updatedAt: '2026-08-28T00:00:00.000Z' },
    { id: 'search-oldest', projectName: 'Garden Apartment', address: '8 Oak Road', municipality: 'Amsterdam', updatedAt: '2026-07-28T00:00:00.000Z' },
    { id: 'search-alphabetical', projectName: 'Aardvark House', address: '5 Aardvark Road', municipality: 'Utrecht', updatedAt: '2026-06-28T00:00:00.000Z' },
    { id: 'search-no-road', projectName: 'Lakeside Manor', address: '1 Lakeside Avenue', municipality: 'Rotterdam', updatedAt: '2026-05-28T00:00:00.000Z' },
  ];
  const sourceOrder = projects.map((project) => project.id);
  const originalProjects = JSON.stringify(projects);
  const clickedPortfolioActions = [];
  let displayedProjects = [...projects];
  const root = createRoot(document.querySelector('#project-search-test-root'));
  const photoHealthByProject = {
    'search-newest': { sourcePhoto: 'missing', missingConcepts: ['stage'] },
    'search-middle': { sourcePhoto: 'available', missingConcepts: [] },
    'search-oldest': { sourcePhoto: 'not-added', missingConcepts: [] },
    'search-alphabetical': { sourcePhoto: 'available', missingConcepts: ['dusk'] },
    'search-no-road': { sourcePhoto: 'available', missingConcepts: [] },
  };
  const renderProjectManager = () => root.render(React.createElement(ProjectManager, {
    accountId: PROPERTY_STORAGE_TEST_ACCOUNT_ID,
    legacyClaimStatus: { status: 'none', projectCount: 0 },
    legacyClaimBusy: false,
    onClaimLegacy() {},
    projects: displayedProjects,
    photoHealthByProject,
    loading: false,
    busy: false,
    activeProjectId: null,
    transferError,
    transferNotice: '',
    onClose() {},
    onCreate() {},
    onOpen() {},
    onDelete(project) {
      displayedProjects = displayedProjects.filter((item) => item.id !== project.id);
      renderProjectManager();
    },
    onExport() {},
    onExportPortfolio() { clickedPortfolioActions.push('export'); },
    onImport() {},
    onImportPortfolio() { clickedPortfolioActions.push('import'); },
  }));
  flushSync(renderProjectManager);
  const exportPortfolioButton = document.querySelector('#project-search-test-root [data-testid="button-export-portfolio"]');
  const importPortfolioButton = document.querySelector('#project-search-test-root [data-testid="button-import-portfolio"]');
  assert(exportPortfolioButton instanceof HTMLButtonElement && !exportPortfolioButton.disabled, 'The portfolio export action was not available for saved projects.');
  assert(importPortfolioButton instanceof HTMLButtonElement && !importPortfolioButton.disabled, 'The portfolio restore action was not available.');
  flushSync(() => {
    exportPortfolioButton.click();
    importPortfolioButton.click();
  });
  assert(JSON.stringify(clickedPortfolioActions) === JSON.stringify(['export', 'import']), 'Portfolio backup actions did not invoke their handlers.');
  if (transferError) {
    const errorNotice = document.querySelector('#project-search-test-root [data-testid="status-project-transfer-error"]');
    assert(errorNotice?.getAttribute('role') === 'alert', 'A failed portfolio restore was not shown as an alert.');
    assert(errorNotice.textContent === transferError, 'The portfolio restore storage error was not shown clearly to the user.');
  }
  assert(
    document.querySelector('#project-search-test-root [data-testid="status-project-photo-health-search-newest"]')?.textContent.includes('Bronfoto ontbreekt · Conceptfoto ontbreken: Virtual stage'),
    'A saved project with a missing source photo and concept was not flagged in the list.',
  );
  assert(
    document.querySelector('#project-search-test-root [data-testid="status-project-photo-health-search-middle"]')?.textContent === 'Geen ontbrekende foto’s',
    'A project with available photos did not show a healthy photo status.',
  );
  assert(
    document.querySelector('#project-search-test-root [data-testid="status-project-photo-health-search-oldest"]')?.textContent === 'Bronfoto niet toegevoegd',
    'A project without an uploaded source photo was not identified.',
  );
  assert(
    document.querySelector('#project-search-test-root [data-testid="status-project-photo-health-search-alphabetical"]')?.textContent.includes('Conceptfoto ontbreken: Day to dusk'),
    'A project with a missing concept photo was not flagged in the list.',
  );

  const matchingCases = [
    ['canal house', ['search-middle'], 'project name'],
    ['42 canal', ['search-middle'], 'address'],
    ['amsterdam', ['search-middle', 'search-oldest'], 'municipality'],
    ['cafe', ['search-newest'], 'accent-insensitive matching'],
    ['CAFÉ', ['search-newest'], 'case-insensitive matching'],
    ['canal amsterdam', ['search-middle'], 'terms spread across searchable fields'],
    ['road', ['search-newest', 'search-middle', 'search-oldest', 'search-alphabetical'], 'filtered newest-first order'],
  ];

  for (const [query, expectedIds, description] of matchingCases) {
    setSearchQuery(query);
    assertVisibleProjectOrder(expectedIds, `Search for "${query}" should match ${description}.`);
    assert(JSON.stringify(projects.map((project) => project.id)) === JSON.stringify(sourceOrder), 'Searching changed the source projects list order.');
  }

  setSearchQuery('');
  setProjectSortOrder('name');
  assertVisibleProjectOrder(['search-alphabetical', 'search-newest', 'search-middle', 'search-oldest', 'search-no-road'], 'Project-name sorting should be alphabetical.');
  setSearchQuery('road');
  assertVisibleProjectOrder(['search-alphabetical', 'search-newest', 'search-middle', 'search-oldest'], 'Search results should retain project-name order.');

  setSearchQuery('');
  setProjectSortOrder('municipality');
  assertVisibleProjectOrder(['search-middle', 'search-oldest', 'search-newest', 'search-no-road', 'search-alphabetical'], 'Municipality sorting should be alphabetical with name order for ties.');
  setSearchQuery('road');
  assertVisibleProjectOrder(['search-middle', 'search-oldest', 'search-newest', 'search-alphabetical'], 'Search results should retain municipality order.');
  assert(JSON.stringify(projects) === originalProjects, 'Changing sort order or searching changed project data or timestamps.');

  setSearchQuery('Atlantis');
  const emptyState = document.querySelector('#project-search-test-root [data-testid="empty-project-search"]');
  assert(emptyState?.textContent.includes('Geen opgeslagen projecten gevonden'), 'A query without matches did not show a clear empty state.');
  assert(emptyState.textContent.includes('wis deze om alle projecten te zien'), 'The no-results explanation did not explain how to restore all projects.');
  assertVisibleProjectOrder([], 'A query without matches should not show project rows.');

  const clearButton = document.querySelector('#project-search-test-root [data-testid="button-clear-project-search"]');
  assert(clearButton instanceof HTMLButtonElement, 'The clear-search button was not rendered for a non-empty query.');
  flushSync(() => clearButton.click());
  const input = document.querySelector('#project-search-test-root [data-testid="input-search-projects"]');
  assert(input.value === '', 'Clearing the search did not clear the query.');
  setProjectSortOrder('recent');
  assertVisibleProjectOrder(sourceOrder, 'Clearing the query and selecting recent order should restore every project in newest-first order.');
  assert(JSON.stringify(projects) === originalProjects, 'Restoring recent order changed project data or timestamps.');

  setSearchQuery('road');
  assertVisibleProjectOrder(['search-newest', 'search-middle', 'search-oldest', 'search-alphabetical'], 'The deletion search should start with all matching projects in source order.');
  const deleteMiddleMatch = document.querySelector('#project-search-test-root [data-testid="button-delete-project-search-middle"]');
  assert(deleteMiddleMatch instanceof HTMLButtonElement, 'The delete action for a matching project was not rendered.');
  flushSync(() => deleteMiddleMatch.click());
  assertVisibleProjectOrder(['search-newest', 'search-oldest', 'search-alphabetical'], 'Deleting one of several matches should leave the remaining matches in source order.');

  setSearchQuery('Café Loft');
  assertVisibleProjectOrder(['search-newest'], 'The last-match deletion query should show its matching project.');
  const deleteLastMatch = document.querySelector('#project-search-test-root [data-testid="button-delete-project-search-newest"]');
  assert(deleteLastMatch instanceof HTMLButtonElement, 'The delete action for the last matching project was not rendered.');
  flushSync(() => deleteLastMatch.click());
  const deletedLastMatchState = document.querySelector('#project-search-test-root [data-testid="empty-project-search"]');
  assert(deletedLastMatchState?.textContent.includes('Geen opgeslagen projecten gevonden'), 'Deleting the last match did not show the no-results explanation.');
  assert(deletedLastMatchState.textContent.includes('Café Loft'), 'The no-results explanation did not retain the active search.');

  const clearAfterDelete = document.querySelector('#project-search-test-root [data-testid="button-clear-project-search"]');
  assert(clearAfterDelete instanceof HTMLButtonElement, 'The clear-search action was not rendered after deleting the last match.');
  flushSync(() => clearAfterDelete.click());
  assertVisibleProjectOrder(['search-oldest', 'search-alphabetical', 'search-no-road'], 'Clearing search after deletion should show only the projects that still exist.');

  for (const [id, query] of [['search-oldest', 'Garden Apartment'], ['search-alphabetical', 'Aardvark House'], ['search-no-road', 'Lakeside Manor']]) {
    setSearchQuery(query);
    const deleteProject = document.querySelector(`#project-search-test-root [data-testid="button-delete-project-${id}"]`);
    assert(deleteProject instanceof HTMLButtonElement, `The delete action for ${id} was not rendered.`);
    flushSync(() => deleteProject.click());
  }
  const noProjectsWithActiveSearch = document.querySelector('#project-search-test-root [data-testid="empty-project-search"]');
  assert(noProjectsWithActiveSearch?.textContent.includes('Geen opgeslagen projecten gevonden'), 'An active search did not retain its no-results explanation after the final project was removed.');
  assert(!document.querySelector('#project-search-test-root [data-testid="empty-project-search"]')?.textContent.includes('Nog geen opgeslagen projecten'), 'The no-results explanation was replaced by the generic empty-project state.');
  const clearLastSearch = document.querySelector('#project-search-test-root [data-testid="button-clear-project-search"]');
  assert(clearLastSearch instanceof HTMLButtonElement, 'The active search could not be cleared after the final saved project was removed.');
  flushSync(() => clearLastSearch.click());
  assert(!document.querySelector('#project-search-test-root [data-testid="empty-project-search"]'), 'Clearing search did not leave the no-results state after all projects were removed.');
  assert(document.querySelector('#project-search-test-root')?.textContent.includes('Nog geen opgeslagen projecten'), 'Clearing the query did not show the empty-project explanation.');
  root.unmount();
}

async function runCrossTabPhotoHealthChecks() {
  const project = {
    ...expectedProjects.alpha,
    id: 'browser-cross-tab-photo-health',
    projectName: 'Cross-tab photo health fixture',
    originalKey: 'browser-cross-tab-original',
    resultKeys: { stage: 'browser-cross-tab-concept' },
    selectedResult: 'stage',
    updatedAt: '2026-10-06T12:00:00.000Z',
  };
  const originalRecord = {
    key: project.originalKey,
    blob: new Blob(['cross-tab original'], { type: 'image/png' }),
    label: 'Originele foto',
    mimeType: 'image/png',
    isConcept: false,
    disclaimer: 'Source photo stored locally.',
    createdAt: project.updatedAt,
  };
  await savePropertyProjectWithImage(project, originalRecord);

  const rootElement = document.querySelector('#cross-tab-photo-test-root');
  const root = createRoot(rootElement);
  let displayedProjects = [];
  let photoHealthByProject = {};
  let refreshError;
  const render = () => flushSync(() => root.render(React.createElement(ProjectManager, {
    accountId: PROPERTY_STORAGE_TEST_ACCOUNT_ID,
    legacyClaimStatus: { status: 'none', projectCount: 0 },
    legacyClaimBusy: false,
    onClaimLegacy() {},
    projects: displayedProjects,
    photoHealthByProject,
    loading: false,
    busy: false,
    activeProjectId: null,
    transferError: '',
    transferNotice: '',
    onClose() {},
    onCreate() {},
    onOpen() {},
    onDelete() {},
    onExport() {},
    onExportPortfolio() {},
    onImport() {},
    onImportPortfolio() {},
  })));
  const refresh = async () => {
    const stored = await loadPropertyProjectsWithPhotoHealth();
    displayedProjects = stored.projects.filter((item) => item.id === project.id);
    photoHealthByProject = { [project.id]: stored.photoHealthById[project.id] };
    render();
  };
  await refresh();
  const unsubscribe = subscribePropertyStorageChanges(() => {
    void refresh().catch((error) => { refreshError = error; });
  });
  let writer;

  const statusSelector = `[data-testid="status-project-photo-health-${project.id}"]`;
  const readStatus = () => rootElement.querySelector(statusSelector)?.textContent ?? '';
  const waitForStatus = async (predicate, description) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (refreshError) throw refreshError;
      const status = readStatus();
      if (predicate(status)) return status;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${description}. Current photo status: ${readStatus()}`);
  };

  try {
    assert(
      readStatus().includes('Conceptfoto ontbreken: Virtual stage'),
      `The open project list did not start with the expected missing-concept warning: ${readStatus()}`,
    );
    window.__photoWriterReady = false;
    window.addEventListener('message', (event) => {
      if (event.origin === location.origin && event.data?.source === 'photo-writer' && event.data.type === 'ready') {
        window.__photoWriterReady = true;
      }
    });
    writer = window.open(
      '/tests/property-transformer-cross-tab-writer.html',
      'property-photo-cross-tab-writer',
      'popup,width=360,height=240',
    );
    assert(writer, 'The second browser tab for photo changes could not be opened.');
    const readyDeadline = Date.now() + 15_000;
    while (!window.__photoWriterReady && Date.now() < readyDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(window.__photoWriterReady, 'The second tab photo writer did not connect.');

    let requestNumber = 0;
    const runWriterCommand = (operation, payload = {}) => new Promise((resolve, reject) => {
      const requestId = `photo-health-${++requestNumber}`;
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error(`The second tab did not finish ${operation}.`));
      }, 15_000);
      const onMessage = (event) => {
        if (event.origin !== location.origin || event.data?.source !== 'photo-writer' || event.data.requestId !== requestId) return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve();
      };
      window.addEventListener('message', onMessage);
      writer.postMessage({ operation, requestId, ...payload }, location.origin);
    });

    await runWriterCommand('add-concept', { key: project.resultKeys.stage });
    await waitForStatus(
      (status) => status === 'Geen ontbrekende foto’s',
      'the warning to clear after the second tab adds the referenced concept photo',
    );

    await runWriterCommand('remove-image', { key: project.resultKeys.stage });
    await waitForStatus(
      (status) => status.includes('Conceptfoto ontbreken: Virtual stage'),
      'the warning to return after the second tab removes the concept photo',
    );

    await runWriterCommand('remove-image', { key: project.originalKey });
    await waitForStatus(
      (status) => status.includes('Bronfoto ontbreekt') && status.includes('Conceptfoto ontbreken: Virtual stage'),
      'the source-photo warning after the second tab removes the source photo',
    );

    const recoveredProject = {
      ...project,
      originalKey: 'browser-cross-tab-restored-original',
      updatedAt: new Date().toISOString(),
    };
    await runWriterCommand('recover-source', { project: recoveredProject });
    const recoveredStatus = await waitForStatus(
      (status) => !status.includes('Bronfoto ontbreekt') && status.includes('Conceptfoto ontbreken: Virtual stage'),
      'the source-photo warning to clear after the second tab recovers the photo',
    );
    assert(
      !recoveredStatus.includes('Bronfoto ontbreekt'),
      'The open project list kept showing a missing-source warning after recovery.',
    );

    const savedProject = await loadPropertyProject(project.id);
    const settingsOnly = (value) => {
      const settings = { ...value };
      delete settings.originalKey;
      delete settings.updatedAt;
      return settings;
    };
    assert(
      JSON.stringify(settingsOnly(savedProject)) === JSON.stringify(settingsOnly(project)),
      'Cross-tab photo status refresh changed saved project settings or scenario data.',
    );
    assert(savedProject.selectedResult === 'stage', 'Cross-tab photo recovery changed the selected scenario.');
  } finally {
    unsubscribe();
    writer?.close();
    root.unmount();
  }
}

async function run() {
  const phase = sessionStorage.getItem(phaseKey);

  if (!phase) {
    result.textContent = 'Saving two projects and four photos…';
    for (const key of Object.keys(imagePayloads)) await saveImage(key);
    await savePropertyProject(expectedProjects.alpha);
    await savePropertyProject(expectedProjects.beta);
    result.textContent = 'Projects saved; reloading browser page…';
    sessionStorage.setItem(phaseKey, 'created');
    location.reload();
    return;
  }

  if (phase === 'created') {
    result.textContent = 'Checking both projects after reload…';
    await assertProjectList([expectedProjects.alpha.id, expectedProjects.beta.id]);
    await assertProjectAndPhotos('alpha');
    await assertProjectAndPhotos('beta');
    const completePhotoHealth = await loadPropertyProjectsWithPhotoHealth();
    assert(completePhotoHealth.photoHealthById[expectedProjects.alpha.id]?.sourcePhoto === 'available', 'A saved source photo was shown as missing in the list status.');
    assert(completePhotoHealth.photoHealthById[expectedProjects.alpha.id]?.missingConcepts.length === 0, 'An available concept photo was shown as missing in the list status.');

    const archive = await exportPropertyProject(expectedProjects.alpha);
    sessionStorage.setItem('property-transfer-archive', JSON.stringify(archive));
    const portfolioArchive = await exportPropertyPortfolio(await loadPropertyProjects());
    assert(portfolioArchive.format === 'realestatex-property-portfolio', 'The portfolio export used an unexpected format.');
    assert(portfolioArchive.projects.length === 2, 'The portfolio export did not include every saved project.');
    assert(portfolioArchive.projects.every((projectArchive) => projectArchive.images.length === 2), 'The portfolio export omitted a source photo or generated concept.');
    sessionStorage.setItem('property-portfolio-archive', JSON.stringify(portfolioArchive));
    await deletePropertyProject(expectedProjects.alpha);
    assert(!(await loadPropertyProject(expectedProjects.alpha.id)), 'Deleted project A is still stored.');
    await assertProjectList([expectedProjects.beta.id]);
    for (const key of [expectedProjects.alpha.originalKey, ...Object.values(expectedProjects.alpha.resultKeys)]) {
      assert(!(await loadPropertyImage(key)), `Deleted project A left behind image ${key}.`);
    }
    await assertProjectAndPhotos('beta');

    sessionStorage.setItem(phaseKey, 'deleted');
    location.reload();
    return;
  }

  if (phase === 'deleted') {
    result.textContent = 'Checking surviving project after deletion and reload…';
    assert(!(await loadPropertyProject(expectedProjects.alpha.id)), 'Deleted project A returned after another reload.');
    await assertProjectList([expectedProjects.beta.id]);
    for (const key of [expectedProjects.alpha.originalKey, ...Object.values(expectedProjects.alpha.resultKeys)]) {
      assert(!(await loadPropertyImage(key)), `Image ${key} returned after deletion and reload.`);
    }
    await assertProjectAndPhotos('beta');

    const serializedPortfolio = sessionStorage.getItem('property-portfolio-archive');
    assert(serializedPortfolio, 'Portfolio export fixture was not retained for the restore test.');
    const portfolioArchive = JSON.parse(serializedPortfolio);
    const invalidPortfolio = structuredClone(portfolioArchive);
    invalidPortfolio.projects[1].images = invalidPortfolio.projects[1].images.filter(
      (image) => image.key !== invalidPortfolio.projects[1].project.originalKey,
    );
    let invalidPortfolioError = '';
    try {
      await importPropertyPortfolio(invalidPortfolio);
    } catch (error) {
      invalidPortfolioError = error instanceof Error ? error.message : String(error);
    }
    assert(invalidPortfolioError.includes('bronfoto ontbreekt'), 'A portfolio with one invalid project was not rejected with a clear error.');
    await assertProjectList([expectedProjects.beta.id]);

    const writesBeforeFailure = await loadPropertyProjects();
    const attemptedProjectIds = [];
    const attemptedImageKeys = [];
    const writeSequence = [];
    const imageStorePrototype = IDBObjectStore.prototype;
    const originalAdd = imageStorePrototype.add;
    let failedPortfolioRestoreError = '';
    imageStorePrototype.add = function (value) {
      if (this.name === 'projects') {
        attemptedProjectIds.push(value.id);
        writeSequence.push('projects');
      } else if (this.name === 'images') {
        attemptedImageKeys.push(value.key);
        writeSequence.push('images');
      }

      if (writeSequence.length === 6 && this.name === 'images') {
        // Reuse a stored image key to make IndexedDB fail this queued request with ConstraintError.
        return originalAdd.call(this, { ...value, key: expectedProjects.beta.originalKey });
      }

      return originalAdd.call(this, value);
    };
    try {
      await importPropertyPortfolio(portfolioArchive);
    } catch (error) {
      failedPortfolioRestoreError = error instanceof Error ? error.message : String(error);
    } finally {
      imageStorePrototype.add = originalAdd;
    }
    assert(
      JSON.stringify(writeSequence) === JSON.stringify(['projects', 'images', 'images', 'projects', 'images', 'images']),
      `The simulated storage failure did not happen after multiple projects and images were queued: ${writeSequence.join(', ')}.`,
    );
    assert(attemptedProjectIds.length === 2, 'The storage failure happened before both imported projects were queued.');
    assert(attemptedImageKeys.length === 4, 'The storage failure happened before all imported images were attempted.');
    assert(
      failedPortfolioRestoreError.includes('beschikbare opslagruimte en browserrechten')
        && failedPortfolioRestoreError.includes('er is niets toegevoegd'),
      `A failed portfolio write did not produce a clear storage error: ${failedPortfolioRestoreError}`,
    );
    await assertProjectList(writesBeforeFailure.map((project) => project.id));
    for (const id of attemptedProjectIds) {
      assert(!(await loadPropertyProject(id)), `Failed portfolio restore left imported project ${id} behind.`);
    }
    for (const key of attemptedImageKeys) {
      assert(!(await loadPropertyImage(key)), `Failed portfolio restore left imported image ${key} behind.`);
    }
    sessionStorage.setItem('property-portfolio-write-failure-error', failedPortfolioRestoreError);

    const portfolioImports = await importPropertyPortfolio(portfolioArchive);
    assert(portfolioImports.length === 2, 'Portfolio restore did not add every saved project.');
    assert(portfolioImports.every((project) => !Object.values(expectedProjects).some((expected) => expected.id === project.id)), 'Portfolio restore reused a source project ID.');
    const restoredByName = new Map(portfolioImports.map((project) => [project.projectName, project]));
    for (const [name, original] of Object.entries(expectedProjects)) {
      const restored = restoredByName.get(original.projectName);
      assert(restored, `Portfolio restore omitted ${original.projectName}.`);
      const images = await loadPropertyProjectImages(restored);
      assert(images.original && (await images.original.blob.text()) === imagePayloads[`${name}-original`].text, `Portfolio restore changed or omitted ${original.projectName}'s source photo.`);
      const resultAction = Object.keys(original.resultKeys)[0];
      assert(images.results[resultAction] && (await images.results[resultAction].blob.text()) === imagePayloads[Object.keys(original.resultKeys).map((key) => original.resultKeys[key])[0]].text, `Portfolio restore changed or omitted ${original.projectName}'s concept.`);
    }
    const importedAlphaFromPortfolio = portfolioImports.find((project) => project.projectName === expectedProjects.alpha.projectName);
    assert(importedAlphaFromPortfolio, 'Portfolio restore did not include the expected alpha project.');
    assert((await findMatchingSavedPropertyProject(portfolioArchive.projects.find((item) => item.project.projectName === expectedProjects.alpha.projectName)))?.id === importedAlphaFromPortfolio.id, 'An imported portfolio project was not recognized as a matching project.');
    sessionStorage.setItem('property-portfolio-imported-ids', JSON.stringify(portfolioImports.map((project) => project.id)));

    const serializedArchive = sessionStorage.getItem('property-transfer-archive');
    assert(serializedArchive, 'Project export fixture was not retained for the import test.');
    const archive = JSON.parse(serializedArchive);
    assert((await findMatchingSavedPropertyProject(archive))?.id === importedAlphaFromPortfolio.id, 'A single-project archive did not match its copy restored from the portfolio.');
    const incompleteArchive = structuredClone(archive);
    incompleteArchive.images = incompleteArchive.images.filter((image) => image.key !== expectedProjects.alpha.originalKey);
    let incompleteError = '';
    try {
      await importPropertyProject(incompleteArchive);
    } catch (error) {
      incompleteError = error instanceof Error ? error.message : String(error);
    }
    assert(incompleteError.includes('bronfoto ontbreekt'), 'An export without its source photo was not rejected with a clear error.');
    await assertProjectList([expectedProjects.beta.id, ...portfolioImports.map((project) => project.id)]);

    const damagedArchive = structuredClone(archive);
    damagedArchive.images[0].blobBase64 = btoa('altered image bytes');
    let damagedError = '';
    try {
      await importPropertyProject(damagedArchive);
    } catch (error) {
      damagedError = error instanceof Error ? error.message : String(error);
    }
    assert(damagedError.includes('beschadigd'), 'An archive with modified image bytes was not rejected with a clear error.');
    await assertProjectList([expectedProjects.beta.id, ...portfolioImports.map((project) => project.id)]);

    const imported = await importPropertyProject(archive);
    assert(imported.id !== expectedProjects.alpha.id, 'Import overwrote or reused the source project ID.');
    assert([imported.id, importedAlphaFromPortfolio.id].includes((await findMatchingSavedPropertyProject(archive))?.id), 'A saved import was not recognized as a matching project.');
    const editedArchive = structuredClone(archive);
    editedArchive.project.notes += ' edited';
    assert(!(await findMatchingSavedPropertyProject(editedArchive)), 'An archive with different project details was treated as a duplicate.');
    const changedPhotoArchive = structuredClone(archive);
    const changedPhotoBytes = new TextEncoder().encode('different but validly checksummed photo data');
    changedPhotoArchive.images[0].blobBase64 = btoa(String.fromCharCode(...changedPhotoBytes));
    const changedPhotoDigest = await crypto.subtle.digest('SHA-256', changedPhotoBytes);
    changedPhotoArchive.images[0].sha256 = [...new Uint8Array(changedPhotoDigest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    assert(!(await findMatchingSavedPropertyProject(changedPhotoArchive)), 'An archive with different photo contents was treated as a duplicate.');
    const secondCopy = await importPropertyProject(archive);
    assert(secondCopy.id !== imported.id, 'Importing another copy did not create a separate project.');
    const matchingCopies = [imported.id, secondCopy.id, importedAlphaFromPortfolio.id];
    assert(matchingCopies.includes((await findMatchingSavedPropertyProject(archive))?.id), 'Duplicate detection failed after an intentional extra copy was imported.');
    const comparable = (project) => {
      const copy = { ...project };
      delete copy.id;
      delete copy.originalKey;
      delete copy.resultKeys;
      return copy;
    };
    assert(JSON.stringify(comparable(imported)) === JSON.stringify(comparable(expectedProjects.alpha)), 'Imported project settings, checklist, or units changed.');
    const importedPhotos = await loadPropertyProjectImages(imported);
    assert(importedPhotos.original?.key === imported.originalKey, 'The imported source photo could not be reopened.');
    assert((await importedPhotos.original.blob.text()) === imagePayloads['alpha-original'].text, 'The imported source photo content changed.');
    assert(importedPhotos.results.stage?.key === imported.resultKeys.stage, 'The imported generated concept could not be reopened.');
    assert((await importedPhotos.results.stage.blob.text()) === imagePayloads['alpha-stage'].text, 'The imported generated concept content changed.');
    sessionStorage.setItem('property-transfer-imported-id', imported.id);
    sessionStorage.setItem('property-transfer-second-copy-id', secondCopy.id);
    sessionStorage.setItem(phaseKey, 'imported');
    location.reload();
    return;
  }

  if (phase === 'imported') {
    const storageFailureError = sessionStorage.getItem('property-portfolio-write-failure-error') ?? '';
    assert(
      storageFailureError.includes('beschikbare opslagruimte en browserrechten')
        && storageFailureError.includes('er is niets toegevoegd'),
      'The failed portfolio restore storage error was not retained for the user-interface check.',
    );
    const importedId = sessionStorage.getItem('property-transfer-imported-id');
    const secondCopyId = sessionStorage.getItem('property-transfer-second-copy-id');
    assert(importedId, 'Imported project ID was not retained across the reload.');
    assert(secondCopyId, 'Intentional extra-copy ID was not retained across the reload.');
    const portfolioImportedIds = JSON.parse(sessionStorage.getItem('property-portfolio-imported-ids') ?? '[]');
    assert(portfolioImportedIds.length === 2, 'Portfolio import IDs were not retained across the reload.');
    for (const id of portfolioImportedIds) {
      const restoredProject = await loadPropertyProject(id);
      assert(restoredProject, 'A portfolio project was not available after reload.');
      const restoredImages = await loadPropertyProjectImages(restoredProject);
      assert(restoredImages.original && restoredImages.results[Object.keys(restoredProject.resultKeys)[0]], 'A portfolio photo or concept was missing after reload.');
    }
    const imported = await loadPropertyProject(importedId);
    assert(imported, 'Imported project was not available after reload.');
    const comparable = (project) => {
      const copy = { ...project };
      delete copy.id;
      delete copy.originalKey;
      delete copy.resultKeys;
      return copy;
    };
    assert(JSON.stringify(comparable(imported)) === JSON.stringify(comparable(expectedProjects.alpha)), 'Imported project settings changed after reload.');
    const importedPhotos = await loadPropertyProjectImages(imported);
    assert((await importedPhotos.original?.blob.text()) === imagePayloads['alpha-original'].text, 'Imported source photo did not survive reload.');
    assert((await importedPhotos.results.stage?.blob.text()) === imagePayloads['alpha-stage'].text, 'Imported generated concept did not survive reload.');
    assert((await loadPropertyProject(secondCopyId)), 'The intentional extra copy was not available after reload.');
    await assertProjectList([expectedProjects.beta.id, importedId, secondCopyId, ...portfolioImportedIds]);
    runSavedProjectSearchUiChecks(storageFailureError);

    const recoveryProject = makeProject({
      id: 'project-recovery',
      name: 'Photo recovery fixture',
      originalKey: 'recovery-original',
      resultAction: 'stage',
      resultKey: 'recovery-stage',
      style: 'industrial',
      splitRatio: 71,
      flipHorizontal: true,
      purchasePrice: 384000,
      renovationCost: 46250,
      acquisitionCost: 10750,
      estimatedValue: 498000,
      monthlyRent: 2180,
      unitFlip: true,
      checklist: [
        ['recovery-inspect', 'Inspect roof', true],
        ['recovery-contract', 'Confirm contractor', false],
      ],
    });
    recoveryProject.updatedAt = '2026-09-28T00:00:00.000Z';
    await savePropertyProjectWithImage(recoveryProject, {
      key: 'recovery-original',
      blob: new Blob([imagePayloads['recovery-original'].text], { type: 'image/png' }),
      label: imagePayloads['recovery-original'].label,
      mimeType: 'image/png',
      isConcept: false,
      disclaimer: 'Source photo stored locally.',
      createdAt: '2026-09-28T00:00:00.000Z',
    });
    await saveImage('recovery-stage');
    await deletePropertyImage('recovery-stage');
    const missingConceptHealth = await loadPropertyProjectsWithPhotoHealth();
    assert(missingConceptHealth.photoHealthById[recoveryProject.id]?.sourcePhoto === 'available', 'Removing a concept changed the source-photo status.');
    assert(missingConceptHealth.photoHealthById[recoveryProject.id]?.missingConcepts.includes('stage'), 'Removing a concept did not refresh the saved-project status.');
    await deletePropertyImage('recovery-original');
    const missingImages = await loadPropertyProjectImages(recoveryProject);
    assert(missingImages.missingOriginal, 'A missing source image was not identified.');
    assert(missingImages.missingConcepts.includes('stage'), 'A missing concept image was not identified.');
    assert(!missingImages.results.stage, 'A missing concept was returned as if its image existed.');
    assert(recoveryProject.selectedResult === 'stage', 'The selected scenario changed when its image went missing.');
    const missingPhotoHealth = await loadPropertyProjectsWithPhotoHealth();
    assert(missingPhotoHealth.photoHealthById[recoveryProject.id]?.sourcePhoto === 'missing', 'Removing the source photo did not refresh the saved-project status.');
    assert(missingPhotoHealth.photoHealthById[recoveryProject.id]?.missingConcepts.includes('stage'), 'The list status hid a missing concept when the source photo was also missing.');

    const restoredProject = { ...recoveryProject, originalKey: 'recovery-restored-original', updatedAt: '2026-09-28T00:01:00.000Z' };
    await savePropertyProjectWithImage(restoredProject, {
      key: 'recovery-restored-original',
      blob: new Blob(['replacement source photo'], { type: 'image/png' }),
      label: 'Originele foto',
      mimeType: 'image/png',
      isConcept: false,
      disclaimer: 'Source photo stored locally.',
      createdAt: '2026-09-28T00:01:00.000Z',
    });
    const storedRecovery = await loadPropertyProject(recoveryProject.id);
    assert(storedRecovery?.originalKey === 'recovery-restored-original', 'Replacement source photo was not saved with the project.');
    const settingsOnly = (project) => {
      const settings = { ...project };
      delete settings.originalKey;
      delete settings.updatedAt;
      return settings;
    };
    const storedSettings = settingsOnly(storedRecovery);
    const expectedSettings = settingsOnly(recoveryProject);
    assert(JSON.stringify(storedSettings) === JSON.stringify(expectedSettings), 'Source-photo recovery changed saved project settings.');
    const restoredImages = await loadPropertyProjectImages(storedRecovery);
    assert(restoredImages.original?.key === 'recovery-restored-original', 'Replacement source photo could not be loaded.');
    assert(restoredImages.missingConcepts.includes('stage'), 'Restoring the source photo hid the still-missing concept image.');
    assert(storedRecovery.selectedResult === 'stage', 'Restoring the source photo changed the selected scenario.');
    const recoveredPhotoHealth = await loadPropertyProjectsWithPhotoHealth();
    assert(recoveredPhotoHealth.photoHealthById[recoveryProject.id]?.sourcePhoto === 'available', 'Restoring the source photo did not clear its missing status.');
    assert(recoveredPhotoHealth.photoHealthById[recoveryProject.id]?.missingConcepts.includes('stage'), 'Restoring the source photo incorrectly cleared the missing concept status.');

    await saveImage('recovery-stage');
    const addedConceptHealth = await loadPropertyProjectsWithPhotoHealth();
    assert(addedConceptHealth.photoHealthById[recoveryProject.id]?.missingConcepts.length === 0, 'Adding the concept photo did not clear its missing status.');
    await deletePropertyImage('recovery-stage');
    await runCrossTabPhotoHealthChecks();
    result.dataset.status = 'passed';
    result.textContent = 'Passed: saved-project photo status identifies missing and available source/concept photos, refreshes after removal, recovery, and re-addition in another tab, and preserves the selected scenario and project settings. Portfolio restore rolled back all queued projects and images after a failed IndexedDB write and showed a clear storage error. Saved-project search, ordering, export, and import checks also passed.';
    return;
  }

  throw new Error(`Unknown test phase: ${phase}`);
}

run().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});