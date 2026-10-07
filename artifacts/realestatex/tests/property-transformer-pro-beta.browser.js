import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const result = document.querySelector('#test-result');
const storage = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);
const project = {
  id: 'pro-beta-keyboard-project',
  address: '12 Example Street',
  municipality: 'Amsterdam',
  projectName: 'Keyboard test project',
  notes: '',
  selectedStyle: 'modern',
  originalKey: 'pro-beta-keyboard-source',
  resultKeys: {},
  selectedResult: null,
  purchasePrice: 300000,
  renovationCost: 25000,
  acquisitionCost: 9000,
  estimatedValue: 410000,
  monthlyRent: 2100,
  splitRatio: 50,
  flipHorizontal: false,
  roiFields: {
    purchasePrice: 300000,
    renovationCost: 25000,
    acquisitionCost: 9000,
    estimatedValue: 410000,
    monthlyRent: 2100,
  },
  units: [{ id: 'pro-beta-keyboard-unit', label: 'Unit A', area: 50, value: 205000, flipped: false }],
  checklist: [],
  updatedAt: '2026-10-07T12:00:00.000Z',
};

async function prepare() {
  for (const previousProject of await storage.loadPropertyProjects()) {
    await storage.deletePropertyProject(previousProject);
  }
  await storage.savePropertyProject(project);
  await storage.savePropertyImage({
    key: project.originalKey,
    blob: new Blob(['keyboard test source photo'], { type: 'image/png' }),
    label: 'Originele foto',
    mimeType: 'image/png',
    isConcept: false,
    disclaimer: 'Source photo stored locally for the keyboard test.',
    createdAt: project.updatedAt,
  });

  history.replaceState(null, '', '/property-transformer');
  await import('../src/main.tsx');
  const deadline = Date.now() + 20_000;
  while (!document.querySelector('[data-testid="button-transform-stage"]')) {
    if (Date.now() >= deadline) throw new Error('The signed-in studio did not load the staged-photo action.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  result.dataset.status = 'app-started';
  result.textContent = 'The signed-in studio is ready for the Pro beta keyboard test.';
}

prepare().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.message : String(error);
});
