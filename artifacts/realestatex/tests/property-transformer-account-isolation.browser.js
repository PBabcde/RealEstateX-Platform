import { createPropertyProjectStorage, deletePropertyProject, loadPropertyProjects, savePropertyImage, savePropertyProjectWithImage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';

const result = document.querySelector('#test-result');
const secondAccountId = 'photo-recovery-secondary-test';
const accountA = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);
const accountB = createPropertyProjectStorage(secondAccountId);
const legacyProject = {
  id: 'legacy-account-claim-project',
  address: '18 Old Harbor Road',
  municipality: 'Gorinchem',
  projectName: 'Legacy account claim fixture',
  notes: 'Project stored before account-level browser isolation.',
  selectedStyle: 'modern',
  originalKey: 'legacy-account-claim-source',
  resultKeys: { stage: 'legacy-account-claim-stage' },
  selectedResult: 'stage',
  purchasePrice: 195000,
  renovationCost: 18000,
  acquisitionCost: 4500,
  estimatedValue: 245000,
  monthlyRent: 1250,
  splitRatio: 63,
  flipHorizontal: false,
  roiFields: {
    purchasePrice: 195000,
    renovationCost: 18000,
    acquisitionCost: 4500,
    estimatedValue: 245000,
    monthlyRent: 1250,
  },
  units: [{ id: 'legacy-account-claim-unit', label: 'Unit A', area: 62, value: 245000, flipped: false }],
  checklist: [{ id: 'legacy-account-claim-check', label: 'Confirm measurements', done: true }],
  updatedAt: '2026-10-05T12:00:00.000Z',
};

function image(key, content, isConcept) {
  return {
    key,
    blob: new Blob([content], { type: 'image/png' }),
    label: isConcept ? 'Virtual stage' : 'Originele foto',
    mimeType: 'image/png',
    isConcept,
    disclaimer: isConcept ? 'AI-concept, not a factual representation.' : 'Source photo stored locally.',
    createdAt: legacyProject.updatedAt,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(condition, description, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function prepare() {
  for (const project of await loadPropertyProjects()) await deletePropertyProject(project);
  for (const project of await accountA.loadPropertyProjects()) await accountA.deletePropertyProject(project);
  for (const project of await accountB.loadPropertyProjects()) await accountB.deletePropertyProject(project);
  await savePropertyProjectWithImage(legacyProject, image(legacyProject.originalKey, 'private legacy source bytes', false));
  await savePropertyImage(image(legacyProject.resultKeys.stage, 'private legacy concept bytes', true));

  window.__accountIsolationTest = {
    accountA,
    accountB,
    async listA() { return accountA.loadPropertyProjects(); },
    async listB() { return accountB.loadPropertyProjects(); },
    async legacyStatusA() { return accountA.getLegacyProjectClaimStatus(); },
    async legacyStatusB() { return accountB.getLegacyProjectClaimStatus(); },
    async legacyProjectRecord() { return loadPropertyProjects().then((projects) => projects.find((project) => project.id === legacyProject.id)); },
  };

  result.dataset.status = 'fixture-ready';
  result.textContent = 'Unclaimed local project prepared; opening the signed-in studio…';
  history.replaceState(null, '', '/property-transformer');
  await import('../src/main.tsx');
  result.dataset.status = 'app-started';
}

async function run() {
  await prepare();
  await waitFor(() => document.querySelector('[data-testid="button-open-projects"]'), 'the signed-in studio');
  document.querySelector('[data-testid="button-open-projects"]').click();
  await waitFor(() => document.querySelector('[data-testid="button-claim-legacy-projects"]'), 'the explicit legacy-claim action');

  const dialog = document.querySelector('[data-testid="dialog-project-manager"]');
  assert(dialog, 'The project manager did not open.');
  assert(!dialog.textContent.includes(legacyProject.projectName), 'Unclaimed legacy project details were shown before the account owner claimed them.');
  assert(!dialog.textContent.includes(legacyProject.address), 'The unclaimed legacy address was shown before the account owner claimed it.');
  assert(await accountA.loadPropertyProjects().then((projects) => projects.length === 0), 'Account A could see a legacy project before claiming it.');
  assert(await accountB.loadPropertyProjects().then((projects) => projects.length === 0), 'Account B could see a legacy project before claiming it.');
  const beforeClaim = await accountA.getLegacyProjectClaimStatus();
  assert(beforeClaim.status === 'available' && beforeClaim.projectCount === 1, 'The unclaimed legacy project was not reported as available for an explicit claim.');

  document.querySelector('[data-testid="button-claim-legacy-projects"]').click();
  await waitFor(() => {
    const notice = document.querySelector('[data-testid="status-project-transfer-notice"]');
    const rows = Array.from(document.querySelectorAll('[data-testid^="project-row-"]'));
    return notice?.textContent.includes('aan deze account gekoppeld') && rows.some((row) => row.textContent.includes(legacyProject.projectName));
  }, 'the legacy project to appear only after explicit claim');

  const claimedProjects = await accountA.loadPropertyProjects();
  const claimedProject = claimedProjects.find((project) => project.projectName === legacyProject.projectName);
  assert(claimedProject, 'The claimed project was not copied into Account A storage.');
  const claimedImages = await accountA.loadPropertyProjectImages(claimedProject);
  assert((await claimedImages.original?.blob.text()) === 'private legacy source bytes', 'The claimed source image was not copied into Account A storage.');
  assert((await claimedImages.results.stage?.blob.text()) === 'private legacy concept bytes', 'The claimed concept image was not copied into Account A storage.');
  const statusA = await accountA.getLegacyProjectClaimStatus();
  const statusB = await accountB.getLegacyProjectClaimStatus();
  assert(statusA.status === 'claimed', 'The legacy claim was not recorded for Account A.');
  assert(statusB.status === 'unavailable' && statusB.projectCount === 0, 'Account B learned legacy project details after Account A claimed them.');
  assert((await accountB.claimLegacyPropertyProjects()).status === 'unavailable', 'Account B was allowed to claim Account A legacy projects.');
  assert(!(await accountB.loadPropertyProjects()).some((project) => project.projectName === legacyProject.projectName), 'Account B can read Account A legacy project details.');
  assert(!(await accountB.loadPropertyImage(claimedProject.originalKey)), 'Account B can read Account A image bytes.');

  const objectUrlsCreated = [];
  const objectUrlsRevoked = [];
  const createNative = URL.createObjectURL.bind(URL);
  const revokeNative = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = createNative(blob);
    objectUrlsCreated.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    objectUrlsRevoked.push(url);
    revokeNative(url);
  };

  document.querySelector(`[data-testid="button-open-project-${claimedProject.id}"]`).click();
  await waitFor(() => Array.from(document.querySelectorAll('img')).filter((element) => element.src.startsWith('blob:')).length >= 2, 'the claimed project photos to load');
  const activeObjectUrls = Array.from(document.querySelectorAll('img'))
    .map((element) => element.src)
    .filter((url) => url.startsWith('blob:'));
  assert(activeObjectUrls.every((url) => objectUrlsCreated.includes(url)), 'The displayed project images were not tracked as active object URLs.');

  assert(typeof window.__setPropertyTestUser === 'function', 'The test auth fixture could not switch accounts.');
  window.__setPropertyTestUser(secondAccountId, null);
  await waitFor(async () => {
    const projects = await accountB.loadPropertyProjects();
    return projects.length > 0 && document.body.textContent.includes('Start met één listingfoto');
  }, 'the studio to load Account B local storage');
  await waitFor(() => activeObjectUrls.every((url) => objectUrlsRevoked.includes(url)), 'Account A image object URLs to be revoked on account switch');
  await waitFor(() => document.querySelector('[data-testid="button-open-projects"]'), 'the project-list button for Account B');
  document.querySelector('[data-testid="button-open-projects"]').click();
  await waitFor(() => document.querySelector('[data-testid="dialog-project-manager"]'), 'Account B project manager');
  const accountBDialog = document.querySelector('[data-testid="dialog-project-manager"]');
  assert(!accountBDialog.textContent.includes(legacyProject.projectName), 'Account B saw Account A project details after switching accounts.');
  assert(!(await accountB.loadPropertyProjects()).some((project) => project.projectName === legacyProject.projectName), 'Account B storage contains Account A projects after switching.');
  assert((await accountA.loadPropertyProjects()).some((project) => project.projectName === legacyProject.projectName), 'Switching accounts removed Account A project data.');

  URL.createObjectURL = createNative;
  URL.revokeObjectURL = revokeNative;
  result.dataset.status = 'passed';
  result.textContent = 'Passed: unclaimed legacy projects stayed hidden until the signed-in account explicitly claimed them; projects and image bytes remained isolated between accounts; and active image URLs were revoked on account switch.';
}

run().catch((error) => {
  result.dataset.status = 'failed';
  const reason = error instanceof Error ? error.stack ?? error.message : String(error);
  result.textContent = `${reason}\nPage: ${document.body.innerText.slice(0, 1600)}`;
});
