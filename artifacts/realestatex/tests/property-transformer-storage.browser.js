import {
  deletePropertyProject,
  loadPropertyImage,
  loadPropertyProject,
  loadPropertyProjects,
  savePropertyImage,
  savePropertyProject,
} from '../src/lib/property-transformer-db.ts';

const result = document.querySelector('#test-result');
const phaseKey = 'property-storage-browser-test-phase';
result.textContent = 'Test module loaded; preparing IndexedDB…';
const imagePayloads = {
  'alpha-original': { text: 'alpha source photo', type: 'image/png', label: 'Originele foto' },
  'alpha-stage': { text: 'alpha generated concept', type: 'image/jpeg', label: 'Virtual stage' },
  'beta-original': { text: 'beta source photo', type: 'image/png', label: 'Originele foto' },
  'beta-dusk': { text: 'beta generated concept', type: 'image/jpeg', label: 'Day to dusk' },
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
    sessionStorage.removeItem(phaseKey);
    result.dataset.status = 'passed';
    result.textContent = 'Passed: both projects and all settings/photos survived reload; deleting project A left project B and its images intact.';
    return;
  }

  throw new Error(`Unknown test phase: ${phase}`);
}

run().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});