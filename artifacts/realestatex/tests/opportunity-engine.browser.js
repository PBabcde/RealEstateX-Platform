import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpportunityEngine } from "../src/pages/opportunity-engine";
import "../src/index.css";

const result = document.querySelector("#test-result");
const errors = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
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
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const root = createRoot(document.querySelector("#root"));
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
root.render(createElement(QueryClientProvider, { client }, createElement(OpportunityEngine)));

try {
  await waitFor(() => byId("card-opportunity-deal-deal-visible-1"), "Een gekoppelde bestaande deal werd niet getoond.");
  assert(byId("card-opportunity-deal-deal-visible-2"), "De tweede zichtbare deal ontbreekt.");
  assert(!byId("card-opportunity-deal-deal-hidden-tenant"), "Een deal buiten de zichtbare objectlijst is zichtbaar geworden.");
  assert(document.querySelectorAll('[data-testid^="tab-opportunity-"]').length === 6, "Niet alle zes opportunitycategorieën worden aangeboden.");
  assert(byId("text-opportunity-market")?.textContent.includes("Stijgende markt"), "Bestaande marktinformatie is niet in de Opportunity Engine opgenomen.");

  const dealCountBeforeCategory = document.querySelectorAll('[data-testid^="card-opportunity-deal-"]').length;
  byId("tab-opportunity-splitsingskans").click();
  await waitFor(() => byId("tab-opportunity-splitsingskans").getAttribute("aria-pressed") === "true", "De geselecteerde categorielens reageerde niet.");
  assert(byId("tab-opportunity-splitsingskans").getAttribute("aria-pressed") === "true", "De geselecteerde categorielens is niet toegankelijk gemarkeerd.");
  assert(document.querySelectorAll('[data-testid^="card-opportunity-deal-"]').length === dealCountBeforeCategory, "Een categorielens heeft deals verborgen of gerangschikt.");
  assert(document.body.textContent.includes("72/100"), "De bestaande splitsingsindicator ontbreekt.");

  assert((window.__opportunityReportRequests ?? []).length === 0, "Rapportdata is opgehaald voordat de gebruiker het rapport opende.");
  byId("button-opportunity-report-property-visible-1").click();
  await waitFor(() => byId("report-opportunity-content"), "Het bestaande rapport werd niet getoond.");
  assert(window.__opportunityReportRequests?.includes("property-visible-1"), "Het rapport is niet voor het gekozen zichtbare object opgevraagd.");
  assert(document.body.textContent.includes("HR++ glas"), "De bestaande Energy Brain-rapportgegevens ontbreken.");
  byId("button-close-opportunity-report").click();
  await waitFor(() => !byId("dialog-opportunity-report"), "Het rapportdetail sloot niet.");

  setValue(byId("select-opportunity-property"), "property-visible-2");
  await waitFor(() => byId("card-opportunity-deal-deal-visible-2"), "De geselecteerde objectcontext werd niet toegepast.");
  assert(!byId("card-opportunity-deal-deal-visible-1"), "Een deal van een ander zichtbaar object bleef in de objectcontext staan.");
  assert(document.body.textContent.includes("AI-analyse is nog niet actief"), "De toekomstige AI-functionaliteit is niet als niet-actief gemarkeerd.");
  assert(document.body.textContent.includes("Er wordt vandaag niets automatisch geselecteerd"), "De voorbereiding van Catch of the Day selecteert automatisch data.");
  assert(byId("link-opportunity-control-room"), "De koppeling met de Control Room ontbreekt.");
  assert(byId("link-opportunity-suite-&-assistent"), "De koppeling met de bestaande assistent ontbreekt.");

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert(document.documentElement.scrollWidth <= window.innerWidth, "De pagina veroorzaakt horizontaal scrollen op mobiel.");
  assert(errors.length === 0, `Browserfouten: ${errors.join(" | ")}`);
  result.dataset.status = "passed";
  result.textContent = "Categorieën, bestaande dealindicatoren, tenant/property-koppeling, rapportdetail, voorbereidingsstatus en mobiele breedte gecontroleerd.";
} catch (error) {
  result.dataset.status = "failed";
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
}
