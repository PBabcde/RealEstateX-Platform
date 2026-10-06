import {
  deletePropertyProject,
  loadPropertyImage,
  loadPropertyProject,
  loadPropertyProjects,
  savePropertyProject,
} from '../src/lib/property-transformer-db.ts';

const result = document.querySelector('#test-result');
const project = {
  id: 'browser-photo-recovery-project',
  address: '18 Sample Street',
  municipality: 'Amsterdam',
  projectName: 'Photo recovery browser fixture',
  notes: 'Keep these saved assumptions during source-photo recovery.',
  selectedStyle: 'industrial',
  originalKey: 'browser-photo-recovery-missing-source',
  resultKeys: { stage: 'browser-photo-recovery-missing-concept' },
  selectedResult: 'stage',
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
  units: [
    { id: 'recovery-unit-a', label: 'Unit A', area: 47.5, value: 238000, flipped: true },
    { id: 'recovery-unit-b', label: 'Unit B', area: 36, value: 191500, flipped: false },
  ],
  checklist: [
    { id: 'recovery-inspection', label: 'Inspect the roof', done: true },
    { id: 'recovery-contract', label: 'Confirm contractor', done: false },
  ],
  updatedAt: '2026-10-05T12:00:00.000Z',
};

const projectOrderFixtures = [
  {
    ...project,
    id: 'browser-photo-recovery-sort-alpha',
    projectName: 'Alpha order fixture',
    municipality: 'Utrecht',
    originalKey: '',
    resultKeys: {},
    selectedResult: null,
    updatedAt: '2026-10-04T12:00:00.000Z',
  },
  {
    ...project,
    id: 'browser-photo-recovery-sort-zulu',
    projectName: 'Zulu order fixture',
    municipality: 'Aalsmeer',
    originalKey: '',
    resultKeys: {},
    selectedResult: null,
    updatedAt: '2026-10-03T12:00:00.000Z',
  },
];

async function prepareFixture() {
  for (const previousProject of await loadPropertyProjects()) {
    await deletePropertyProject(previousProject);
  }
  await savePropertyProject(project);
  for (const orderFixture of projectOrderFixtures) {
    await savePropertyProject(orderFixture);
  }
  const missingPhotos = await import('../src/lib/property-transformer-db.ts')
    .then(({ loadPropertyProjectImages }) => loadPropertyProjectImages(project));
  if (!missingPhotos.missingOriginal || !missingPhotos.missingConcepts.includes('stage')) {
    throw new Error('Recovery fixture did not start with both referenced photos missing.');
  }

  window.__propertyRecoveryTest = {
    initialProject: project,
    async readProject() {
      return loadPropertyProject(project.id);
    },
    async readSourceImage(key) {
      const image = await loadPropertyImage(key);
      return image ? { type: image.blob.type, size: image.blob.size, isConcept: image.isConcept } : null;
    },
  };

  result.dataset.status = 'fixture-ready';
  result.textContent = 'Missing-photo fixture ready; opening the authenticated studio…';
  history.replaceState(null, '', '/property-transformer');
  await import('../src/main.tsx');
  result.dataset.status = 'app-started';
  result.textContent = 'Authenticated studio mounted; checking photo recovery…';
}

prepareFixture().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
