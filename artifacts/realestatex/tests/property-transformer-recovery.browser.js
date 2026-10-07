import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const {
  deletePropertyProject,
  loadPropertyImage,
  loadPropertyProject,
  loadPropertyProjects,
  loadPropertyProjectImages,
  savePropertyImage,
  savePropertyProject,
  savePropertyProjectWithImage,
} = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);
const recoveryFixtureSessionKey = 'realestatex-photo-recovery-fixture-ready';
const fixturePngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+WQAAAABJRU5ErkJggg==';

const result = document.querySelector('#test-result');
const project = {
  id: 'browser-photo-recovery-project',
  address: '18 Sample Street',
  municipality: 'Amsterdam',
  projectName: 'Photo recovery browser fixture',
  notes: 'Keep these saved assumptions during source-photo recovery.',
  selectedStyle: 'industrial',
  originalKey: 'browser-photo-recovery-missing-source',
  resultKeys: {
    stage: 'browser-photo-recovery-missing-concept',
    makeover: 'browser-photo-recovery-missing-makeover-concept',
  },
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
    originalKey: 'browser-photo-recovery-survivor-source',
    resultKeys: { stage: 'browser-photo-recovery-survivor-concept' },
    selectedResult: 'stage',
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
      if (orderFixture.id === 'browser-photo-recovery-sort-alpha') {
        await savePropertyProjectWithImage(orderFixture, {
          key: orderFixture.originalKey,
          blob: await fetch(fixturePngDataUrl).then((response) => response.blob()),
          label: 'Surviving source photo',
          mimeType: 'image/png',
          isConcept: false,
          disclaimer: '',
          createdAt: orderFixture.updatedAt,
        });
        await savePropertyImage({
          key: orderFixture.resultKeys.stage,
          blob: await fetch(fixturePngDataUrl).then((response) => response.blob()),
          label: 'Surviving concept photo',
          mimeType: 'image/png',
          isConcept: true,
          disclaimer: 'AI concept for project-deletion preservation coverage.',
          createdAt: orderFixture.updatedAt,
        });
      } else {
        await savePropertyProject(orderFixture);
      }
    }
    sessionStorage.setItem(recoveryFixtureSessionKey, 'true');
  }
  const missingPhotos = fixtureAlreadyPrepared ? null : await loadPropertyProjectImages(project);
  if (missingPhotos && (!missingPhotos.missingOriginal
    || !missingPhotos.missingConcepts.includes('stage')
    || !missingPhotos.missingConcepts.includes('makeover'))) {
    throw new Error('Recovery fixture did not start with its source and both referenced concepts missing.');
  }

  let abortNextImageWrite = false;
  let nextImageWriteFailure = null;
  let nextReadwriteTransactionFailure = null;
  let photoCleanupFailureKeys = new Set();
  let photoCleanupFailureInjected = false;
  const nativePut = IDBObjectStore.prototype.put;
  const nativeDelete = IDBObjectStore.prototype.delete;
  const nativeTransaction = IDBDatabase.prototype.transaction;
  IDBObjectStore.prototype.put = function (...args) {
    if (nextImageWriteFailure && this.name === 'images') {
      const failure = nextImageWriteFailure;
      nextImageWriteFailure = null;
      if (failure.name === 'Error') throw new Error(failure.message);
      throw new DOMException(failure.message, failure.name);
    }
    const request = Reflect.apply(nativePut, this, args);
    if (abortNextImageWrite && this.name === 'images') {
      abortNextImageWrite = false;
      this.transaction.abort();
    }
    return request;
  };
  IDBObjectStore.prototype.delete = function (...args) {
    const request = Reflect.apply(nativeDelete, this, args);
    const key = String(args[0]);
    if (this.name === 'images' && photoCleanupFailureKeys.has(key)) {
      photoCleanupFailureKeys.delete(key);
      photoCleanupFailureInjected = true;
      this.transaction.abort();
    }
    return request;
  };
  IDBDatabase.prototype.transaction = function (...args) {
    const stores = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
    if (nextReadwriteTransactionFailure
      && args[1] === 'readwrite'
      && stores.includes('projects')
      && stores.includes('images')) {
      const failure = nextReadwriteTransactionFailure;
      nextReadwriteTransactionFailure = null;
      throw new DOMException(failure.message, failure.name);
    }
    return Reflect.apply(nativeTransaction, this, args);
  };

  window.__propertyRecoveryTest = {
    initialProject: project,
    failNextConceptRequest: false,
    lastConceptRequestUrl: '',
    deleteConfirmations: [],
    successfulConceptDataUrl: fixturePngDataUrl,
    failNextImageWrite() {
      abortNextImageWrite = true;
    },
    failNextImageWriteWith(name, message) {
      nextImageWriteFailure = { name, message };
    },
    failNextReadwriteTransactionWith(name, message) {
      nextReadwriteTransactionFailure = { name, message };
    },
    failNextPhotoCleanup(keys) {
      photoCleanupFailureKeys = new Set(keys);
      photoCleanupFailureInjected = false;
    },
    didInjectPhotoCleanupFailure() {
      return photoCleanupFailureInjected;
    },
    saveProject(value) {
      return savePropertyProject(value);
    },
    deleteProject(value) {
      return deletePropertyProject(value);
    },
    async readPendingPhotoCleanup() {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(`realestatex-property-transformer:account:${encodeURIComponent(PROPERTY_STORAGE_TEST_ACCOUNT_ID)}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open the property metadata store.'));
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = database.transaction('metadata', 'readonly').objectStore('metadata').get('pending-property-photo-cleanup');
          request.onsuccess = () => resolve(request.result?.imageKeys ?? []);
          request.onerror = () => reject(request.error ?? new Error('Could not read pending photo cleanup.'));
        });
      } finally {
        database.close();
      }
    },
    async readProject(id = project.id) {
      return loadPropertyProject(id);
    },
    async readProjects() {
      return loadPropertyProjects();
    },
    async readSourceImage(key) {
      const image = await loadPropertyImage(key);
      return image ? { type: image.blob.type, size: image.blob.size, isConcept: image.isConcept } : null;
    },
    async readConceptImage(key) {
      const image = await loadPropertyImage(key);
      return image ? {
        key: image.key,
        label: image.label,
        type: image.blob.type,
        size: image.blob.size,
        isConcept: image.isConcept,
      } : null;
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
          request.onsuccess = async () => {
            try {
              const images = await Promise.all(request.result.map(async (image) => {
                const digest = await crypto.subtle.digest('SHA-256', await image.blob.arrayBuffer());
                return {
                  key: image.key,
                  label: image.label,
                  mimeType: image.mimeType,
                  isConcept: image.isConcept,
                  disclaimer: image.disclaimer,
                  createdAt: image.createdAt,
                  blobSize: image.blob.size,
                  blobType: image.blob.type,
                  blobHash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
                };
              }));
              resolve(images.sort((left, right) => String(left.key).localeCompare(String(right.key))));
            } catch (error) {
              reject(error);
            }
          };
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
    if (url.includes('/api/property-transformations/virtual-staging')
      || url.includes('/api/property-transformations/makeover')) {
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
