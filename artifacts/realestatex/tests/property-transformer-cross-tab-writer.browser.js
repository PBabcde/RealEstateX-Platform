import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { createPropertyProjectStorage } from '../src/lib/property-transformer-db.ts';
import { PROPERTY_STORAGE_TEST_ACCOUNT_ID } from './property-storage-test-account.ts';
import { PropertyTransformer } from '../src/pages/property-transformer.tsx';

const storage = createPropertyProjectStorage(PROPERTY_STORAGE_TEST_ACCOUNT_ID);
const { deletePropertyImage, loadPropertyProject, savePropertyImage, savePropertyProjectWithImage } = storage;

const result = document.querySelector('#test-result');
const root = createRoot(document.querySelector('#app-root'));
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

root.render(
  React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(Router, null,
      React.createElement(PropertyTransformer, {
        accountId: PROPERTY_STORAGE_TEST_ACCOUNT_ID,
        userEmail: '',
      }),
    ),
  ),
);

function waitFor(predicate, description) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15_000;
    const check = () => {
      if (predicate()) {
        resolve();
      } else if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${description}.`));
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

async function openProjectList() {
  await waitFor(
    () => document.querySelector('[data-testid="button-open-projects"]'),
    'the project-list button in the second tab',
  );
  document.querySelector('[data-testid="button-open-projects"]').click();
  await waitFor(
    () => document.querySelector('[data-testid="dialog-project-manager"]'),
    'the saved-project list in the second tab',
  );
}

async function deleteProjectFromList(id) {
  const selector = `[data-testid="button-delete-project-${id}"]`;
  await waitFor(() => document.querySelector(selector), `the delete action for ${id} in the second tab`);
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    document.querySelector(selector).click();
  } finally {
    window.confirm = originalConfirm;
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const remainingProject = await loadPropertyProject(id);
    if (!remainingProject && !document.querySelector(`[data-testid="project-row-${id}"]`)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The project ${id} did not disappear from the second tab after deletion.`);
}

async function deleteImageWithoutNotification(key) {
  const name = `realestatex-property-transformer:account:${encodeURIComponent(PROPERTY_STORAGE_TEST_ACCOUNT_ID)}`;
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('images', 'readwrite');
      transaction.objectStore('images').delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function makeImage(key, label, isConcept, content) {
  return {
    key,
    blob: new Blob([content], { type: isConcept ? 'image/jpeg' : 'image/png' }),
    label,
    mimeType: isConcept ? 'image/jpeg' : 'image/png',
    isConcept,
    disclaimer: isConcept ? 'AI-concept, not a factual representation.' : 'Source photo stored locally.',
    createdAt: new Date().toISOString(),
  };
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.opener || event.origin !== location.origin) return;
  const { operation, requestId, key, project, id } = event.data ?? {};
  try {
    if (operation === 'open-project-list') {
      await openProjectList();
    } else if (operation === 'delete-project') {
      await deleteProjectFromList(id);
    } else if (operation === 'add-concept') {
      await savePropertyImage(makeImage(key, 'Virtual stage', true, 'cross-tab concept'));
    } else if (operation === 'remove-image') {
      await deletePropertyImage(key);
    } else if (operation === 'remove-image-without-notification') {
      await deleteImageWithoutNotification(key);
    } else if (operation === 'recover-source') {
      await savePropertyProjectWithImage(
        project,
        makeImage(project.originalKey, 'Originele foto', false, 'cross-tab replacement source'),
      );
    } else {
      throw new Error(`Unknown photo change operation: ${operation}`);
    }
    result.textContent = `Completed ${operation}.`;
    window.opener.postMessage({ source: 'photo-writer', requestId }, event.origin);
  } catch (error) {
    window.opener.postMessage({
      source: 'photo-writer',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }, event.origin);
  }
});

if (window.opener) {
  result.textContent = 'Project-list tab ready.';
  window.opener.postMessage({ source: 'photo-writer', type: 'ready' }, location.origin);
}
