import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const {
  deletePropertyProject,
  loadPropertyImage,
  loadPropertyProject,
  loadPropertyProjects,
  loadPropertyProjectImages,
  savePropertyProject,
} = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);
const recoveryFixtureSessionKey = 'realestatex-photo-recovery-fixture-ready';

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
  const fixtureAlreadyPrepared = sessionStorage.getItem(recoveryFixtureSessionKey) === 'true';
  if (!fixtureAlreadyPrepared) {
    for (const previousProject of await loadPropertyProjects()) {
      await deletePropertyProject(previousProject);
    }
    await savePropertyProject(project);
    for (const orderFixture of projectOrderFixtures) {
      await savePropertyProject(orderFixture);
    }
    sessionStorage.setItem(recoveryFixtureSessionKey, 'true');
  }
  const missingPhotos = fixtureAlreadyPrepared ? null : await loadPropertyProjectImages(project);
  if (missingPhotos && (!missingPhotos.missingOriginal || !missingPhotos.missingConcepts.includes('stage'))) {
    throw new Error('Recovery fixture did not start with both referenced photos missing.');
  }

  let abortNextImageWrite = false;
  const nativePut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = Reflect.apply(nativePut, this, args);
    if (abortNextImageWrite && this.name === 'images') {
      abortNextImageWrite = false;
      this.transaction.abort();
    }
    return request;
  };

  window.__propertyRecoveryTest = {
    initialProject: project,
    failNextConceptRequest: false,
    lastConceptRequestUrl: '',
    successfulConceptDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+WQAAAABJRU5ErkJggg==',
    failNextImageWrite() {
      abortNextImageWrite = true;
    },
    async readProject() {
      return loadPropertyProject(project.id);
    },
    async readSourceImage(key) {
      const image = await loadPropertyImage(key);
      return image ? { type: image.blob.type, size: image.blob.size, isConcept: image.isConcept } : null;
    },
    async readConceptImage(key) {
      const image = await loadPropertyImage(key);
      return image ? { type: image.blob.type, size: image.blob.size, isConcept: image.isConcept } : null;
    },
    async readImageKeys() {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(`realestatex-property-transformer:account:${encodeURIComponent(PROPERTY_STORAGE_TEST_ACCOUNT_ID)}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open the property image store.'));
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = database.transaction('images', 'readonly').objectStore('images').getAllKeys();
          request.onsuccess = () => resolve(request.result.map(String).sort());
          request.onerror = () => reject(request.error ?? new Error('Could not read property image keys.'));
        });
      } finally {
        database.close();
      }
    },
    async readImageRecords() {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(`realestatex-property-transformer:account:${encodeURIComponent(PROPERTY_STORAGE_TEST_ACCOUNT_ID)}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open the property image store.'));
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = database.transaction('images', 'readonly').objectStore('images').getAll();
          request.onsuccess = () => resolve(request.result.map((image) => ({
            key: image.key,
            label: image.label,
            mimeType: image.mimeType,
            isConcept: image.isConcept,
            disclaimer: image.disclaimer,
            createdAt: image.createdAt,
            blobSize: image.blob.size,
            blobType: image.blob.type,
          })).sort((left, right) => String(left.key).localeCompare(String(right.key))));
          request.onerror = () => reject(request.error ?? new Error('Could not read property image records.'));
        });
      } finally {
        database.close();
      }
    },
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, ...init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (window.__propertyRecoveryTest.failNextConceptRequest && url.includes('/api/property-transformations/virtual-staging')) {
      window.__propertyRecoveryTest.failNextConceptRequest = false;
      window.__propertyRecoveryTest.lastConceptRequestUrl = url;
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (url.includes('/api/property-transformations/virtual-staging')) {
      window.__propertyRecoveryTest.lastConceptRequestUrl = url;
      return Promise.resolve(new Response(JSON.stringify({
        imageDataUrl: window.__propertyRecoveryTest.successfulConceptDataUrl,
        mimeType: 'image/png',
        isConcept: true,
        disclaimer: 'AI-concept, not a factual representation.',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return nativeFetch(input, ...init);
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
