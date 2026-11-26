import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InnovationCenter } from '../src/pages/innovation-center';
import '../src/index.css';

const result = document.querySelector('#test-result');
const errors = [];
window.__innovationSubmissions = [];
window.__innovationShouldFail = false;
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async (condition, message) => {
  const deadline = Date.now() + 20000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
};
const byId = (id) => document.querySelector(`[data-testid="${id}"]`);
const setValue = (element, value) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

const root = createRoot(document.querySelector('#root'));
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
root.render(React.createElement(QueryClientProvider, { client }, React.createElement(InnovationCenter)));

try {
  await waitFor(() => byId('input-name')?.value === 'Studio Test', 'Clerk-profielgegevens werden niet vooraf ingevuld.');
  assert(document.body.textContent.includes('RealEstateX ontwikkelen we samen'), 'De introductie ontbreekt.');
  assert(byId('input-email')?.value === 'photo-recovery@example.invalid', 'E-mail uit het profiel werd niet ingevuld.');

  setValue(byId('input-idea-title'), 'Snellere energieanalyse');
  setValue(byId('textarea-idea-details'), 'Ik wil voor meerdere woningen sneller de verwachte energiebesparing kunnen vergelijken.');
  setValue(byId('select-category'), 'Energie');
  byId('button-submit-innovation').click();
  await waitFor(() => document.body.textContent.includes('Geef toestemming voordat je je bijdrage verstuurt.'), 'Versturen zonder toestemming werd niet geblokkeerd.');
  assert(window.__innovationSubmissions.length === 0, 'Een bijdrage is zonder toestemming verstuurd.');

  byId('checkbox-beta-interest').click();
  byId('checkbox-partner-interest').click();
  byId('checkbox-consent').click();
  byId('button-submit-innovation').click();
  await waitFor(() => byId('status-submission-success'), 'Succesbevestiging ontbreekt na opslaan.');
  assert(window.__innovationSubmissions.length === 1, 'De CRM-inzending is niet precies eenmaal verstuurd.');
  const saved = window.__innovationSubmissions[0];
  assert(saved.type === 'PARTNER' && saved.company === 'Innovation Center', 'De bijdrage is niet aan de bestaande CRM-structuur gekoppeld.');
  assert(saved.name === 'Studio Test' && saved.email === 'photo-recovery@example.invalid', 'Naam of optioneel e-mailadres ontbreekt.');
  assert(saved.notes.includes('Categorie: Energie') && saved.notes.includes('Prioriteit: Normaal'), 'Categorie of prioriteit ontbreekt in de opgeslagen CRM-notitie.');
  assert(saved.notes.includes('Idee/titel: Snellere energieanalyse') && saved.notes.includes('Toelichting: Ik wil voor meerdere woningen'), 'Inhoud ontbreekt in de CRM-notitie.');
  assert(saved.notes.includes('Beta-tester / early-adopter interesse: Ja') && saved.notes.includes('Partnerinteresse: Ja'), 'Beta- of partnerinteresse ontbreekt.');
  assert(saved.notes.includes('Toestemming vastgelegd op:'), 'Toestemmingstijdstip ontbreekt.');

  window.__innovationShouldFail = true;
  setValue(byId('input-name'), 'Studio Test');
  setValue(byId('input-idea-title'), 'Probleem bij opslaan');
  setValue(byId('textarea-idea-details'), 'Bij een tijdelijke storing wil ik mijn ingevulde tekst kunnen behouden.');
  byId('checkbox-consent').click();
  byId('button-submit-innovation').click();
  await waitFor(() => byId('status-submission-error'), 'Foutmelding ontbreekt bij een CRM-storing.');
  assert(byId('input-idea-title').value === 'Probleem bij opslaan', 'Ingevulde waarden zijn gewist na een fout.');

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'De pagina veroorzaakt horizontaal scrollen op mobiel.');
  assert(errors.length === 0, `Browserfouten: ${errors.join(' | ')}`);
  result.dataset.status = 'passed';
  result.textContent = 'Innovation Center formulier, CRM-payload, toestemming, foutafhandeling en mobiele breedte gecontroleerd.';
} catch (error) {
  result.dataset.status = 'failed';
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
}
