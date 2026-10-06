import {
  deletePropertyImage,
  savePropertyImage,
  savePropertyProjectWithImage,
} from '../src/lib/property-transformer-db.ts';

const result = document.querySelector('#test-result');

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
  const { operation, requestId, key, project } = event.data ?? {};
  try {
    if (operation === 'add-concept') {
      await savePropertyImage(makeImage(key, 'Virtual stage', true, 'cross-tab concept'));
    } else if (operation === 'remove-image') {
      await deletePropertyImage(key);
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
  result.textContent = 'Photo writer ready.';
  window.opener.postMessage({ source: 'photo-writer', type: 'ready' }, location.origin);
}
