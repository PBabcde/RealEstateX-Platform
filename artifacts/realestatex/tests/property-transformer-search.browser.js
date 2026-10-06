import { flushSync } from 'react-dom';
import {
  deletePropertyProject,
  loadPropertyProjects,
  savePropertyProject,
} from '../src/lib/property-transformer-db.ts';

const result = document.querySelector('#test-result');
const projects = [
  {
    id: 'browser-search-canal',
    projectName: 'Canal View',
    address: '14 Herengracht',
    municipality: 'Amsterdam',
    updatedAt: '2026-10-05T12:00:00.000Z',
  },
  {
    id: 'browser-search-garden',
    projectName: 'Garden Flat',
    address: '8 Linden Road',
    municipality: 'Haarlem',
    updatedAt: '2026-10-04T12:00:00.000Z',
  },
  {
    id: 'browser-search-lake',
    projectName: 'Lake House',
    address: '1 Plaslaan',
    municipality: 'Rotterdam',
    updatedAt: '2026-10-03T12:00:00.000Z',
  },
].map((project) => ({
  ...project,
  notes: `Saved search fixture for ${project.projectName}.`,
  selectedStyle: 'modern',
  originalKey: '',
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
  units: [{ id: `${project.id}-unit-a`, label: 'Unit A', area: 50, value: 205000, flipped: false }],
  checklist: [],
}));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function visibleProjectIds() {
  return [...document.querySelectorAll('[data-testid^="project-row-"]')]
    .map((row) => row.getAttribute('data-testid').replace('project-row-', ''));
}

function setSearchQuery(value) {
  const input = document.querySelector('[data-testid="input-search-projects"]');
  assert(input instanceof HTMLInputElement, 'The authenticated project manager did not render its search field.');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

async function waitFor(predicate, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function prepareFixture() {
  for (const previousProject of await loadPropertyProjects()) {
    await deletePropertyProject(previousProject);
  }
  for (const project of projects) await savePropertyProject(project);

  const persisted = await loadPropertyProjects();
  const persistedIds = persisted.map((project) => project.id).sort();
  const expectedIds = projects.map((project) => project.id).sort();
  assert(
    JSON.stringify(persistedIds) === JSON.stringify(expectedIds),
    `IndexedDB did not contain the seeded projects: ${persistedIds.join(', ')}.`,
  );

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
    `The app did not open the saved-project route (found ${window.location.pathname}).`,
  );

  await waitFor(
    () => Boolean(document.querySelector('[data-testid="button-open-projects"]')),
    'the loaded Property Transformer route',
  );
  const openProjectsButton = document.querySelector('[data-testid="button-open-projects"]');
  assert(openProjectsButton instanceof HTMLButtonElement, 'The Property Transformer route did not render its saved-project button.');
  flushSync(() => openProjectsButton.click());

  await waitFor(
    () => document.querySelector('[data-testid="dialog-project-manager"]')
      && visibleProjectIds().length === projects.length,
    'the persisted projects in the authenticated project manager',
  );
  const expectedVisibleIds = projects.map((project) => project.id);
  assert(
    JSON.stringify(visibleProjectIds()) === JSON.stringify(expectedVisibleIds),
    `The project manager showed unexpected projects: ${visibleProjectIds().join(', ')}.`,
  );

  const matchingCases = [
    ['Canal View', 'browser-search-canal', 'project name'],
    ['14 Herengracht', 'browser-search-canal', 'address'],
    ['Rotterdam', 'browser-search-lake', 'municipality'],
  ];
  for (const [query, expectedId, fieldDescription] of matchingCases) {
    setSearchQuery(query);
    assert(
      JSON.stringify(visibleProjectIds()) === JSON.stringify([expectedId]),
      `Searching by ${fieldDescription} "${query}" did not show the matching persisted project.`,
    );
  }

  setSearchQuery('missing project');
  assert(
    document.querySelector('[data-testid="empty-project-search"]'),
    'A search with no matches did not show the empty-results state.',
  );
  const clearButton = document.querySelector('[data-testid="button-clear-project-search"]');
  assert(clearButton instanceof HTMLButtonElement, 'The clear-search control was not rendered.');
  flushSync(() => clearButton.click());

  const searchInput = document.querySelector('[data-testid="input-search-projects"]');
  assert(searchInput instanceof HTMLInputElement && searchInput.value === '', 'Clearing search did not reset the query.');
  assert(
    JSON.stringify(visibleProjectIds()) === JSON.stringify(expectedVisibleIds),
    'Clearing search did not restore every project loaded from IndexedDB.',
  );

  result.dataset.status = 'passed';
  result.textContent = 'Passed: the signed-in Property Transformer route loaded three IndexedDB projects, found them by name, address, and municipality, and restored the persisted list when search was cleared.';
}

prepareFixture().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
