import React, { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createPropertyProjectStorage,
  loadPropertyProjectSortOrderPreference,
  savePropertyProjectSortOrderPreference,
} from '../src/lib/property-transformer-db.ts';
import { ProjectManager } from '../src/pages/property-transformer.tsx';

const accountId = 'property-sort-order-cross-tab-browser-test';
const storage = createPropertyProjectStorage(accountId);
const projectFixtures = [
  {
    id: 'sort-sync-main',
    address: '18 Main Street',
    municipality: 'Amsterdam',
    projectName: 'Middle order fixture',
    updatedAt: '2026-10-05T12:00:00.000Z',
  },
  {
    id: 'sort-sync-alpha',
    address: '2 Alpha Road',
    municipality: 'Utrecht',
    projectName: 'Alpha order fixture',
    updatedAt: '2026-10-04T12:00:00.000Z',
  },
  {
    id: 'sort-sync-zulu',
    address: '9 Zulu Lane',
    municipality: 'Aalsmeer',
    projectName: 'Zulu order fixture',
    updatedAt: '2026-10-03T12:00:00.000Z',
  },
].map((fixture) => ({
  ...fixture,
  notes: '',
  selectedStyle: 'modern',
  originalKey: '',
  resultKeys: {},
  selectedResult: null,
  purchasePrice: 0,
  renovationCost: 0,
  acquisitionCost: 0,
  estimatedValue: 0,
  monthlyRent: 0,
  splitRatio: 50,
  flipHorizontal: false,
  roiFields: {
    purchasePrice: 0,
    renovationCost: 0,
    acquisitionCost: 0,
    estimatedValue: 0,
    monthlyRent: 0,
  },
  units: [],
  checklist: [],
}));
const projectIds = new Set(projectFixtures.map(({ id }) => id));
const result = document.querySelector('#test-result');

async function initialize() {
  const existingProjects = await storage.loadPropertyProjects();
  for (const fixture of projectFixtures) {
    if (!existingProjects.some((project) => project.id === fixture.id)) {
      await storage.savePropertyProject(fixture);
    }
  }
  const projects = (await storage.loadPropertyProjects()).filter((project) => projectIds.has(project.id));
  if (projects.length !== projectFixtures.length) {
    throw new Error('The project-order test fixtures could not be loaded from IndexedDB.');
  }
  savePropertyProjectSortOrderPreference('recent', accountId);

  const managerProps = {
    accountId,
    legacyClaimStatus: { status: 'none', projectCount: 0 },
    legacyClaimBusy: false,
    onClaimLegacy() {},
    projects,
    photoHealthByProject: {},
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
  };
  let root = createRoot(document.querySelector('#root'));
  const mountProjectManager = (scope = accountId) => root.render(createElement(ProjectManager, {
    ...managerProps,
    accountId: scope,
  }));
  window.__propertySortSyncTest = {
    accountId,
    savePreference: (order, scope) => savePropertyProjectSortOrderPreference(order, scope),
    readPreference: (scope) => loadPropertyProjectSortOrderPreference(scope),
    preferenceKey: `realestatex.property-project-sort-order:${encodeURIComponent(accountId)}`,
    switchAccount: (scope) => mountProjectManager(scope),
    readProjects: async () => (await storage.loadPropertyProjects())
      .filter((project) => projectIds.has(project.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
    remount() {
      root.unmount();
      root = createRoot(document.querySelector('#root'));
      mountProjectManager();
    },
  };
  mountProjectManager();
  await new Promise((resolve) => setTimeout(resolve, 0));
  result.dataset.status = 'ready';
  result.textContent = `Project list ready; saved order is ${loadPropertyProjectSortOrderPreference(accountId)}.`;
}

initialize().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.message : String(error);
});
