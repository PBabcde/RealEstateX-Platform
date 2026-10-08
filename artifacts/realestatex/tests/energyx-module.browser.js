// Component-level browser test: fake auth and API data, not a live EnergyX test.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EnergyXModule } from '../src/components/energyx-module';
import '../src/index.css';

const result = document.querySelector('#test-result');
const errors = [];
const requests = [];
window.addEventListener('error', (event) => errors.push(event.message));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async (condition, message) => {
  const deadline = Date.now() + 20000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
};
const byId = (id) => document.querySelector(`[data-testid="${id}"]`);
const syncedAt = '2026-10-09T08:00:00.000Z';
const b2b = {
  view: 'b2b', syncedAt,
  building: { type: 'Appartement', areaM2: 100, buildYear: 1985, energyLabel: 'D' },
  specs: { heatingKw: 8.3, coolingKw: 5, roofAreaM2: 80, connection: '3x25A', glazing: 'dubbel', woz: 300000, wwsPoints: 140, wwsPointsGain: 12 },
  metrics: { sustainabilityScore: 48, solar: { panels: 28, kwp: 11.2, kwhPerYear: 10080 }, battery: { kwh: 14 }, annualSavings: 3000, paybackYears: 9.5, investments: { total: 28500 } },
  technicalReport: { summary: 'Label D, 100 m², bouwjaar 1985.', comfortLevel: 'verbeterpotentieel' },
  maintenance: { status: 'inspectie aanbevolen', nextCheck: 'binnen 6 maanden' },
  quoteIndication: { min: 25650, max: 32775 },
};
const b2c = { view: 'b2c', monthlySavingsEur: 250, sustainabilityScore: 48, comfortImprovement: 'Een comfortabeler binnenklimaat.', paybackYears: 9.5 };
let lastServicePayload;
let serviceCalls = 0;
let reportHtml = '';
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  requests.push(url.pathname);
  if (!url.pathname.includes('/v1/energyx/')) return originalFetch(input, options);
  let body;
  let status = 200;
  if (url.pathname.includes('/status/')) body = { status: 'synced', syncedAt, specs: b2b.specs };
  else if (url.pathname.includes('/metrics/')) body = url.searchParams.get('view') === 'b2c' ? b2c : b2b;
  else if (url.pathname.endsWith('/service-request')) {
    lastServicePayload = JSON.parse(options.body);
    serviceCalls += 1;
    status = serviceCalls === 1 ? 503 : 201;
    body = serviceCalls === 1 ? { error: 'Test failure' } : { requestId: 'request-ui-check', kind: lastServicePayload.kind, status: 'received' };
  }
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};
window.open = () => ({
  opener: null,
  document: { open() {}, write(value) { reportHtml = value; }, close() {} },
});

const root = createRoot(document.querySelector('#root'));
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const mount = (propertyId) => root.render(React.createElement(QueryClientProvider, { client },
  React.createElement(EnergyXModule, { key: propertyId, propertyId, adres: 'Teststraat <1>', onClose() { root.render(null); } })));

try {
  window.__setPropertyTestUser('energyx-ui-check');
  localStorage.clear();
  mount('object-a');
  await waitFor(() => byId('energyx-b2b'), 'B2B did not load.');
  byId('button-energyx-export').click();
  assert(reportHtml.includes('Teststraat &lt;1&gt;'), 'Report does not escape the address.');
  for (const section of ['Huidig energielabel', 'Verwarmingsbehoefte', 'Koelbehoefte', 'Aanbevolen zonnepanelen', 'Aanbevolen batterij', 'Investeringsindicatie', 'Geschatte jaarlijkse energiebesparing', 'Terugverdientijd', 'Indicatieve WWS-puntenwinst', '12 punten', 'window.print()']) {
    assert(reportHtml.includes(section), `Report is missing ${section}.`);
  }
  byId('tab-energyx-b2c').click();
  await waitFor(() => byId('energyx-b2c'), 'B2C did not load.');
  assert(!document.querySelector('details').open, 'The B2C technical form should initially be collapsed.');
  byId('button-energyx-service').click();
  await waitFor(() => byId('dialog-energyx-service'), 'Service dialog did not open.');
  const note = byId('textarea-energyx-service-note');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(note, 'Mijn warmtepomp maakt geluid.');
  note.dispatchEvent(new Event('input', { bubbles: true }));
  const kind = byId('select-energyx-service-kind');
  kind.value = 'maintenance';
  kind.dispatchEvent(new Event('change', { bubbles: true }));
  byId('button-energyx-service-submit').click();
  await waitFor(() => byId('dialog-energyx-service').querySelector('[role="alert"]'), 'Failure was not shown.');
  assert(byId('textarea-energyx-service-note').value === 'Mijn warmtepomp maakt geluid.', 'Failed request lost the note.');
  byId('button-energyx-service-submit').click();
  await waitFor(() => byId('energyx-service-confirmation'), 'Success confirmation was not shown.');
  assert(lastServicePayload.propertyId === 'object-a' && lastServicePayload.kind === 'maintenance' && lastServicePayload.note === 'Mijn warmtepomp maakt geluid.', 'Service request payload is incorrect.');
  assert(byId('energyx-service-confirmation').textContent.includes('request-ui-check'), 'Confirmation does not include the request reference.');
  byId('button-energyx-service-done').click();
  root.render(null);
  await new Promise((resolve) => setTimeout(resolve, 30));
  mount('object-a');
  await waitFor(() => byId('energyx-b2c'), 'Saved per-object view was not restored.');
  mount('object-b');
  await waitFor(() => byId('energyx-b2b'), 'Another object reused the wrong view.');
  window.__setPropertyTestUser('different-energyx-account');
  mount('object-a');
  await waitFor(() => byId('energyx-b2b'), 'Another account reused the wrong view.');
  result.dataset.status = 'passed';
  result.textContent = 'Passed: B2B report fields and escaping, B2C simplified display, service dialog failure/retry/confirmation, and per-object/account view persistence.';
} catch (error) {
  result.dataset.status = 'failed';
  result.textContent = `${error.stack ?? String(error)}\nDOM: ${document.querySelector('#root').textContent}\nErrors: ${errors.join('; ')}\nRequests: ${requests.join(', ')}\nQueries: ${JSON.stringify(client.getQueryCache().getAll().map((query) => ({ key: query.queryKey, data: query.state.data, status: query.state.status, error: String(query.state.error) })))}`;
}
