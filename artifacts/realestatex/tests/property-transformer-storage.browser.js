import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  deletePropertyProject,
  deletePropertyImage,
  exportPropertyProject,
  importPropertyProject,
  loadPropertyImage,
  loadPropertyProject,
  loadPropertyProjectImages,
  loadPropertyProjects,
  savePropertyImage,
  savePropertyProject,
  savePropertyProjectWithImage,
} from '../src/lib/property-transformer-db.ts';
import { ProjectManager } from '../src/pages/property-transformer.tsx';

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

function runSavedProjectSearchUiChecks() {
  const projects = [
    { id: 'search-newest', projectName: 'Café Loft', address: '12 Rue Road', municipality: 'Haarlem', updatedAt: '2026-09-28T00:00:00.000Z' },
    { id: 'search-middle', projectName: 'Canal House', address: '42 Canal Road', municipality: 'Amsterdam', updatedAt: '2026-08-28T00:00:00.000Z' },
    { id: 'search-oldest', projectName: 'Garden Apartment', address: '8 Oak Road', municipality: 'Amsterdam', updatedAt: '2026-07-28T00:00:00.000Z' },
  ];
  const sourceOrder = projects.map((project) => project.id);
  const root = createRoot(document.querySelector('#project-search-test-root'));
  flushSync(() => root.render(React.createElement(ProjectManager, {
    projects,
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
    onImport() {},
  })));

  const matchingCases = [
    ['canal house', ['search-middle'], 'project name'],
    ['42 canal', ['search-middle'], 'address'],
    ['amsterdam', ['search-middle', 'search-oldest'], 'municipality'],
    ['cafe', ['search-newest'], 'accent-insensitive matching'],
    ['CAFÉ', ['search-newest'], 'case-insensitive matching'],
    ['canal amsterdam', ['search-middle'], 'terms spread across searchable fields'],
    ['road', sourceOrder, 'filtered newest-first order'],
  ];

  for (const [query, expectedIds, description] of matchingCases) {
    setSearchQuery(query);
    assertVisibleProjectOrder(expectedIds, `Search for "${query}" should match ${description}.`);
    assert(JSON.stringify(projects.map((project) => project.id)) === JSON.stringify(sourceOrder), 'Searching changed the source projects list order.');
  }

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
  assertVisibleProjectOrder(sourceOrder, 'Clearing the query should restore every project in newest-first order.');
  root.unmount();
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

    const archive = await exportPropertyProject(expectedProjects.alpha);
    sessionStorage.setItem('property-transfer-archive', JSON.stringify(archive));
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

    const serializedArchive = sessionStorage.getItem('property-transfer-archive');
    assert(serializedArchive, 'Project export fixture was not retained for the import test.');
    const archive = JSON.parse(serializedArchive);
    const incompleteArchive = structuredClone(archive);
    incompleteArchive.images = incompleteArchive.images.filter((image) => image.key !== expectedProjects.alpha.originalKey);
    let incompleteError = '';
    try {
      await importPropertyProject(incompleteArchive);
    } catch (error) {
      incompleteError = error instanceof Error ? error.message : String(error);
    }
    assert(incompleteError.includes('bronfoto ontbreekt'), 'An export without its source photo was not rejected with a clear error.');
    await assertProjectList([expectedProjects.beta.id]);

    const damagedArchive = structuredClone(archive);
    damagedArchive.images[0].blobBase64 = btoa('altered image bytes');
    let damagedError = '';
    try {
      await importPropertyProject(damagedArchive);
    } catch (error) {
      damagedError = error instanceof Error ? error.message : String(error);
    }
    assert(damagedError.includes('beschadigd'), 'An archive with modified image bytes was not rejected with a clear error.');
    await assertProjectList([expectedProjects.beta.id]);

    const imported = await importPropertyProject(archive);
    assert(imported.id !== expectedProjects.alpha.id, 'Import overwrote or reused the source project ID.');
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
    sessionStorage.setItem(phaseKey, 'imported');
    location.reload();
    return;
  }

  if (phase === 'imported') {
    const importedId = sessionStorage.getItem('property-transfer-imported-id');
    assert(importedId, 'Imported project ID was not retained across the reload.');
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
    await assertProjectList([expectedProjects.beta.id, importedId]);
    runSavedProjectSearchUiChecks();

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
    await deletePropertyImage('recovery-original');
    await deletePropertyImage('recovery-stage');
    const missingImages = await loadPropertyProjectImages(recoveryProject);
    assert(missingImages.missingOriginal, 'A missing source image was not identified.');
    assert(missingImages.missingConcepts.includes('stage'), 'A missing concept image was not identified.');
    assert(!missingImages.results.stage, 'A missing concept was returned as if its image existed.');
    assert(recoveryProject.selectedResult === 'stage', 'The selected scenario changed when its image went missing.');

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

    await deletePropertyImage('recovery-stage');
    result.dataset.status = 'passed';
    result.textContent = 'Passed: saved-project search matched name, address, and municipality (including case, accents, and multi-term queries); empty results and clearing restored the source order. Export/import and recovery checks also passed.';
    return;
  }

  throw new Error(`Unknown test phase: ${phase}`);
}

run().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});