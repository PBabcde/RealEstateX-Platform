import { flushSync } from 'react-dom';
import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const {
  deletePropertyProject,
  loadPropertyProjects,
  savePropertyProject,
  savePropertyProjectSortOrderPreference,
} = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);

const result = document.querySelector('#test-result');
const projects = [
  {
    id: 'browser-search-lake',
    projectName: 'Lake House',
    address: '1 Plaslaan',
    municipality: 'Rotterdam',
    updatedAt: '2026-10-06T12:00:00.000Z',
  },
  {
    id: 'browser-search-canal',
    projectName: 'Canal View',
    address: '14 Herengracht',
    municipality: 'Amsterdam',
    updatedAt: '2026-10-05T12:00:00.000Z',
  },
  {
    id: 'browser-search-annex',
    projectName: 'Canal Annex',
    address: '9 Singel',
    municipality: 'Amsterdam',
    updatedAt: '2026-10-04T18:00:00.000Z',
  },
  {
    id: 'browser-search-garden',
    projectName: 'Garden Flat',
    address: '8 Linden Road',
    municipality: 'Amsterdam',
    updatedAt: '2026-10-04T12:00:00.000Z',
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
  savePropertyProjectSortOrderPreference('recent');
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

  setSearchQuery('Amsterdam');
  const matchingAmsterdamIds = ['browser-search-canal', 'browser-search-annex', 'browser-search-garden'];
  assert(
    JSON.stringify(visibleProjectIds()) === JSON.stringify(matchingAmsterdamIds),
    'The shared-municipality search did not show all three matches in source order.',
  );

  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    const deleteMiddleMatch = document.querySelector('[data-testid="button-delete-project-browser-search-annex"]');
    assert(deleteMiddleMatch instanceof HTMLButtonElement, 'The delete action for the middle search match was not rendered.');
    flushSync(() => deleteMiddleMatch.click());
    await waitFor(
      () => JSON.stringify(visibleProjectIds()) === JSON.stringify(['browser-search-canal', 'browser-search-garden']),
      'the remaining matching projects after deleting the middle match',
    );
    assert(
      !document.querySelector('[data-testid="empty-project-search"]'),
      'Deleting one of several matching projects incorrectly showed the no-results state.',
    );

    setSearchQuery('Garden Flat');
    assert(
      JSON.stringify(visibleProjectIds()) === JSON.stringify(['browser-search-garden']),
      'The final-match search did not show Garden Flat.',
    );
    const deleteLastMatch = document.querySelector('[data-testid="button-delete-project-browser-search-garden"]');
    assert(deleteLastMatch instanceof HTMLButtonElement, 'The delete action for the last matching project was not rendered.');
    flushSync(() => deleteLastMatch.click());
    await waitFor(
      () => Boolean(document.querySelector('[data-testid="empty-project-search"]')),
      'the no-results explanation after deleting the final matching project',
    );
    const emptyState = document.querySelector('[data-testid="empty-project-search"]');
    assert(emptyState.textContent.includes('Geen opgeslagen projecten gevonden'), 'Deleting the final match did not show the no-results explanation.');
    assert(emptyState.textContent.includes('Garden Flat'), 'The no-results explanation did not retain the active search.');

    const clearSearch = document.querySelector('[data-testid="button-clear-project-search"]');
    assert(clearSearch instanceof HTMLButtonElement, 'The clear-search action disappeared after deleting the final match.');
    flushSync(() => clearSearch.click());
    await waitFor(
      () => JSON.stringify(visibleProjectIds()) === JSON.stringify(['browser-search-lake', 'browser-search-canal']),
      'the surviving projects after clearing search',
    );
    const persistedAfterDeletion = (await loadPropertyProjects()).map((project) => project.id);
    assert(
      JSON.stringify(persistedAfterDeletion) === JSON.stringify(['browser-search-lake', 'browser-search-canal']),
      `IndexedDB retained deleted search matches: ${persistedAfterDeletion.join(', ')}.`,
    );
  } finally {
    window.confirm = originalConfirm;
  }

  result.dataset.status = 'passed';
  result.textContent = 'Passed: the signed-in project manager preserved source order after deleting a matching project, showed the no-results explanation after the final match was deleted, and showed only surviving projects when search was cleared.';
}

prepareFixture().catch((error) => {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
