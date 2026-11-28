import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SalesEngine } from "../src/pages/sales";
import { ContentAutopilot } from "../src/pages/content-autopilot";
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
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};
const activateTab = (element) => {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
  element.click();
};

const root = createRoot(document.querySelector("#root"));
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
window.__copiedContentDrafts = [];
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (value) => { window.__copiedContentDrafts.push(value); } },
});
root.render(createElement(QueryClientProvider, { client }, createElement(SalesEngine)));

try {
  await waitFor(() => byId("stat-nieuwe-relaties"), "Het Sales-overzicht is niet geladen.");
  assert(byId("stat-nieuwe-relaties").textContent.includes("1"), "Nieuw-leadtotalen kloppen niet.");
  assert(byId("stat-conversie").textContent.includes("50%"), "De conversie uit bestaande leadstatussen wordt niet getoond.");
  activateTab(byId("tab-pipeline"));
  await waitFor(() => byId("lead-card-00000000-0000-0000-0000-000000000101"), `De bestaande leadpijplijn ontbreekt. Actieve tab: ${byId("tab-pipeline").getAttribute("data-state")}; inhoud: ${document.body.innerText.slice(-1500)}`);
  let leadCard = byId("lead-card-00000000-0000-0000-0000-000000000101");
  assert(leadCard.textContent.includes("Energierapport"), "Interessegebied ontbreekt in de leadkaart.");
  assert(leadCard.textContent.includes("landing"), "Leadbron ontbreekt in de leadkaart.");
  const status = leadCard.querySelector("select");
  setValue(status, "qualified");
  await waitFor(() => window.__salesTestStatuses?.includes("qualified"), "De bestaande statusroute werd niet aangeroepen.");
  await waitFor(() => byId("lead-card-00000000-0000-0000-0000-000000000101")?.querySelector("select")?.value === "qualified", "De bijgewerkte lead werd niet opnieuw weergegeven.");
  leadCard = byId("lead-card-00000000-0000-0000-0000-000000000101");
  leadCard.querySelector("summary").click();
  const followup = byId("input-followup-00000000-0000-0000-0000-000000000101");
  setValue(followup, "Belafspraak plannen");
  byId("button-followup-00000000-0000-0000-0000-000000000101").closest("form").requestSubmit();
  await waitFor(() => leadCard.textContent.includes("Opvolging opgeslagen"), `De CRM-opvolging werd niet bevestigd. invoer=${followup.value}, knopUitgeschakeld=${byId("button-followup-00000000-0000-0000-0000-000000000101").disabled}, fout=${leadCard.querySelector('[role="alert"]')?.textContent ?? "geen"}, requests=${JSON.stringify(window.__salesTestNotes ?? [])}`);
  assert(window.__salesTestNotes?.includes("Belafspraak plannen"), "De bestaande opvolgnotitieroute ontving de notitie niet.");

  activateTab(byId("tab-partners"));
  await waitFor(() => byId("crm-contact-contact-early-adopter"), "Bestaande CRM-contacten ontbreken.");
  setValue(byId("select-partner-role"), "installateur");
  const name = byId("input-partner-name");
  setValue(name, "Nieuwe Installateur");
  byId("button-create-partner").click();
  await waitFor(() => byId("crm-contact-contact-created"), "Een partnercontact werd niet zichtbaar na opslaan.");
  assert(document.body.textContent.includes("Sales Engine rol: Installateur"), "De partnerrol werd niet aan het bestaande CRM-contact gekoppeld.");

  activateTab(byId("tab-growth"));
  await waitFor(() => byId("marketing-format-blogs"), "De voorbereide contentstructuur ontbreekt.");
  assert(byId("marketing-format-seo-pagina-s"), "SEO-voorbereiding ontbreekt.");
  assert(byId("marketing-format-nieuwsbrieven"), "Nieuwsbriefvoorbereiding ontbreekt.");
  assert(byId("marketing-format-campagnes"), "Campagnevoorbereiding ontbreekt.");
  assert(byId("marketing-format-social-media"), "Social-media-voorbereiding ontbreekt.");
  assert(byId("community-early-adopters").textContent.includes("1"), "Bestaande early-adopterinteresse is niet afgeleid uit CRM-inzendingen.");
  assert(byId("community-premium-gebruikers").textContent.includes("Niet geactiveerd"), "Premium wordt ten onrechte als actief getoond.");
  assert(document.body.textContent.includes("geen Stripe-wijzigingen"), "De pagina maakt onvoldoende duidelijk dat betalingen niet zijn gewijzigd.");

  root.render(createElement(QueryClientProvider, { client }, createElement(ContentAutopilot)));
  await waitFor(() => byId("content-lead-00000000-0000-0000-0000-000000000101"), "De contentassistent toont geen recente leads.");
  const leadIds = [...document.querySelectorAll('[data-testid^="content-lead-"]')].map((node) => node.dataset.testid);
  assert(leadIds[0]?.endsWith("000000000101") && leadIds[1]?.endsWith("000000000102"), "De leads zijn niet nieuwste eerst gesorteerd.");
  activateTab(byId("tab-content-partners"));
  await waitFor(() => byId("select-content-partner-category"), "Het partnerregister is niet geopend.");
  const category = byId("select-content-partner-category");
  setValue(category, "warmtepompen");
  setValue(byId("input-content-partner-name"), "Nieuwe Partner");
  setValue(byId("input-content-partner-company"), "Nieuwe Organisatie");
  byId("button-save-content-partner").click();
  await waitFor(() => byId("content-partner-content-contact-created"), "De partner is niet aan het losse partnerregister toegevoegd.");
  assert(byId("content-partner-content-contact-created").textContent.includes("Actief voor aanbevelingen"), "Een actieve partner is niet als selecteerbaar gemarkeerd.");
  byId("button-edit-content-partner-content-contact-created").click();
  setValue(byId("select-content-partner-status"), "INACTIVE");
  byId("button-save-content-partner").click();
  await waitFor(() => byId("content-partner-content-contact-created").textContent.includes("Inactief"), `De partnerstatus kon niet worden aangepast. form=${byId("select-content-partner-status")?.value}, rij=${byId("content-partner-content-contact-created")?.textContent ?? "ontbreekt"}, alert=${document.querySelector('[role="alert"]')?.textContent ?? "geen"}`);

  activateTab(byId("tab-content-drafts"));
  await waitFor(() => byId("button-open-content-draft-00000000-0000-0000-0000-000000000101"), "De berichtlijst is niet geopend.");
  byId("button-open-content-draft-00000000-0000-0000-0000-000000000101").click();
  await waitFor(() => byId("select-content-type"), "Het berichtdialoogvenster is niet geopend.");
  assert([...byId("select-content-type").options].length === 4, "Niet alle vier de berichttypes zijn beschikbaar.");
  setValue(byId("select-content-type"), "homeowner_energy");
  setValue(byId("select-content-partner"), "contact-early-adopter");
  byId("button-generate-content-00000000-0000-0000-0000-000000000101").click();
  await waitFor(() => byId("textarea-content-draft"), "Het conceptbericht is niet getoond.");
  assert(window.__contentDraftRequests?.at(-1).leadId === "00000000-0000-0000-0000-000000000101", "De leadreferentie ontbreekt in de generatie-aanvraag.");
  assert(!JSON.stringify(window.__contentDraftRequests?.at(-1)).includes("lead@example.invalid"), "De e-mail van de lead is meegestuurd vanuit de browser.");
  setValue(byId("textarea-content-draft"), "Bewerkt concept voor de controle.");
  byId("button-copy-content-draft").click();
  await waitFor(() => byId("button-copy-content-draft").textContent.includes("Goedgekeurd"), "Het bewerkte concept is niet gekopieerd.");
  assert(window.__copiedContentDrafts.includes("Bewerkt concept voor de controle."), "De knop heeft niet de bewerkte tekst gekopieerd.");

  const dialogButtons = document.querySelectorAll('[role="dialog"] button');
  dialogButtons[0]?.click();
  await waitFor(() => !document.querySelector('[role="dialog"]'), "Het berichtvenster sluit niet.");
  byId("button-open-content-draft-00000000-0000-0000-0000-000000000101").click();
  await waitFor(() => byId("select-content-type"), "Het berichtvenster opent niet opnieuw.");
  setValue(byId("select-content-type"), "realtor_linkedin");
  setValue(byId("select-content-deal"), "deal-approved");
  setValue(byId("select-content-partner"), "contact-realtor");
  byId("button-generate-content-00000000-0000-0000-0000-000000000101").click();
  await waitFor(() => window.__contentDraftRequests?.some((request) => request.contentType === "realtor_linkedin"), "Het LinkedIn-concept voor een GO-object is niet aangevraagd.");
  assert(window.__contentDraftRequests.at(-1).dealId === "deal-approved", "Het geselecteerde Deal Room-object ontbreekt in de aanvraag.");

  assert(document.documentElement.scrollWidth <= window.innerWidth, "De Sales Engine veroorzaakt horizontaal scrollen op mobiel.");
  window.__salesTestRole = "member";
  await client.invalidateQueries({ queryKey: ["/api/account"] });
  await waitFor(() => document.body.textContent.includes("Alleen voor beheerders"), "De Sales Engine werd niet voor een gewone gebruiker afgeschermd.");
  assert(!byId("tab-pipeline") && !byId("tab-partners"), "Een gewone gebruiker kon Sales & CRM-tabbladen openen.");
  assert(errors.length === 0, `Browserfouten: ${errors.join(" | ")}`);
  result.dataset.status = "passed";
  result.textContent = "Dashboard, bron/interesse/status, CRM-opvolging, partneraanmaak, groeivoorbereiding en mobiele breedte gecontroleerd.";
} catch (error) {
  result.dataset.status = "failed";
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
}
