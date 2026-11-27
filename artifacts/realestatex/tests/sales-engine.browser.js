import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SalesEngine } from "../src/pages/sales";
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
