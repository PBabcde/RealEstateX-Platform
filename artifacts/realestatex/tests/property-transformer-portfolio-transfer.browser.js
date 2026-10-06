import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const storage = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);
const result = document.querySelector('#test-result');
const mode = new URL(window.location.href).searchParams.get('mode');
const definitions = [
  {
    id: 'portfolio-transfer-river',
    name: 'Canal House',
    address: '12 Canal Street',
    municipality: 'Amsterdam',
    style: 'modern',
    actions: ['stage', 'dusk'],
    updatedAt: '2026-08-05T10:15:00.000Z',
    purchasePrice: 412500,
    renovationCost: 37600,
    acquisitionCost: 12350,
    estimatedValue: 529000,
    monthlyRent: 2475,
  },
  {
    id: 'portfolio-transfer-garden',
    name: 'Garden Apartment',
    address: '8 Oak Lane',
    municipality: 'Utrecht',
    style: 'industrial',
    actions: ['makeover'],
    updatedAt: '2026-08-06T11:30:00.000Z',
    purchasePrice: 298000,
    renovationCost: 51400,
    acquisitionCost: 8900,
    estimatedValue: 422000,
    monthlyRent: 2090,
  },
  {
    id: 'portfolio-transfer-courtyard',
    name: 'Courtyard Loft',
    address: '4 Garden Road',
    municipality: 'Haarlem',
    style: 'japandi',
    actions: ['declutter', 'stage'],
    updatedAt: '2026-08-07T12:45:00.000Z',
    purchasePrice: 365000,
    renovationCost: 42800,
    acquisitionCost: 10200,
    estimatedValue: 478000,
    monthlyRent: 2260,
  },
];

const actionLabels = {
  declutter: 'Declutter',
  stage: 'Virtual stage',
  makeover: 'Makeover',
  dusk: 'Day to dusk',
};

function buildProject(definition) {
  const resultKeys = Object.fromEntries(
    definition.actions.map((action) => [action, `${definition.id}-${action}`]),
  );
  return {
    id: definition.id,
    address: definition.address,
    municipality: definition.municipality,
    projectName: definition.name,
    notes: `Backup restore verification for ${definition.name}.`,
    selectedStyle: definition.style,
    originalKey: `${definition.id}-source`,
    resultKeys,
    selectedResult: definition.actions[0],
    purchasePrice: definition.purchasePrice,
    renovationCost: definition.renovationCost,
    acquisitionCost: definition.acquisitionCost,
    estimatedValue: definition.estimatedValue,
    monthlyRent: definition.monthlyRent,
    splitRatio: 36 + definition.actions.length * 9,
    flipHorizontal: definition.actions.length === 1,
    roiFields: {
      purchasePrice: definition.purchasePrice,
      renovationCost: definition.renovationCost,
      acquisitionCost: definition.acquisitionCost,
      estimatedValue: definition.estimatedValue,
      monthlyRent: definition.monthlyRent,
    },
    units: [
      { id: `${definition.id}-unit-a`, label: 'Unit A', area: 48, value: 238000, flipped: true },
      { id: `${definition.id}-unit-b`, label: 'Unit B', area: 36, value: 191500, flipped: false },
    ],
    checklist: [
      { id: `${definition.id}-survey`, label: 'Check the survey', done: true },
      { id: `${definition.id}-contract`, label: 'Review contractor quote', done: false },
    ],
    updatedAt: definition.updatedAt,
  };
}

const expectedProjects = definitions.map((definition) => {
  const project = buildProject(definition);
  const images = [
    {
      key: project.originalKey,
      kind: 'source',
      label: 'Originele foto',
      mimeType: 'image/png',
      isConcept: false,
      disclaimer: 'Original source photo, stored locally.',
      createdAt: '2026-08-01T08:00:00.000Z',
      payload: `${project.id}:source-photo:portfolio-download-restore`,
    },
    ...definition.actions.map((action) => ({
      key: project.resultKeys[action],
      action,
      kind: 'concept',
      label: actionLabels[action],
      mimeType: 'image/jpeg',
      isConcept: true,
      disclaimer: 'AI concept, not a factual representation.',
      createdAt: `2026-08-02T0${definition.actions.indexOf(action) + 8}:00:00.000Z`,
      payload: `${project.id}:${action}:portfolio-download-restore`,
    })),
  ];
  return { project, images };
});

const apiRequests = [];
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const request = input instanceof Request ? input : null;
  const requestUrl = request?.url ?? String(input);
  const parsedUrl = new URL(requestUrl, window.location.href);
  if (parsedUrl.origin === window.location.origin && parsedUrl.pathname.startsWith('/api/')) {
    apiRequests.push({
      path: parsedUrl.pathname,
      method: (init?.method ?? request?.method ?? 'GET').toUpperCase(),
    });
  }
  return nativeFetch(input, init);
};

async function snapshotProjects() {
  const projects = await storage.loadPropertyProjects();
  return Promise.all(projects.map(async (project) => {
    const keys = [...new Set([
      project.originalKey,
      ...Object.values(project.resultKeys),
    ].filter(Boolean))];
    const images = await Promise.all(keys.map(async (key) => {
      const image = await storage.loadPropertyImage(key);
      if (!image) return { key, found: false };
      return {
        key,
        found: true,
        label: image.label,
        mimeType: image.mimeType,
        isConcept: image.isConcept,
        disclaimer: image.disclaimer,
        createdAt: image.createdAt,
        payload: await image.blob.text(),
      };
    }));
    return { project, images };
  }));
}

async function prepare() {
  if (mode !== 'export' && mode !== 'restore') {
    throw new Error('The portfolio transfer page requires mode=export or mode=restore.');
  }

  if (mode === 'export') {
    for (const existing of await storage.loadPropertyProjects()) {
      await storage.deletePropertyProject(existing);
    }
    for (const expected of expectedProjects) {
      await storage.savePropertyProject(expected.project);
      for (const image of expected.images) {
        await storage.savePropertyImage({
          key: image.key,
          blob: new Blob([image.payload], { type: image.mimeType }),
          label: image.label,
          mimeType: image.mimeType,
          isConcept: image.isConcept,
          disclaimer: image.disclaimer,
          createdAt: image.createdAt,
        });
      }
    }
  }

  const initialProjects = await storage.loadPropertyProjects();
  window.__portfolioTransferTest = {
    mode,
    initialProjectIds: initialProjects.map((project) => project.id),
    expectedProjects,
    snapshotProjects,
    apiRequests,
  };

  result.dataset.status = 'app-starting';
  result.textContent = 'Portfolio fixtures ready; opening the signed-in studio…';
  history.replaceState(null, '', '/property-transformer');
  await import('../src/main.tsx');
  result.dataset.status = 'app-started';
  result.textContent = 'Signed-in project manager ready for portfolio transfer.';
}

prepare().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
