# Publieke voordeur en beheerderstoegang

## Publieke routes

- `/`: publieke verkenning, rapportvoorbeeld, Catch of the Day-teaser, community-/partnerinteresse en de internationale try-out.
- `/calculators`: bestaande waarderings-, huurreturn- en hypotheekberekeningen zonder account. Deze rekenaanvragen worden niet opgeslagen.
- `/cirkel-1` en `/cirkel-1/preview`: bestaande handmatige investeringstoets.
- `/innovation-center`: ideeën indienen zonder verplichte Clerk-login.

De app bevat geen gevalideerde officiële WWS-puntentelling. WWS-indicaties zijn handmatig; er is geen nieuwe WWS-formule toegevoegd. Internationale voorbeelden zijn demonstraties, geen live vastgoedaanbiedingen of vergunning-/rendementsgoedkeuringen.

## E-mailregistratie

De bestaande `POST /api/public/leads` gebruikt de bestaande `leads`-tabel. Naam is optioneel; een geldig e-mailadres en uitdrukkelijke toestemming zijn verplicht. Bronnen zijn onder andere `public_report_unlock`, `catch_of_the_day`, `beta_community`, `partner_interest` en `international_opportunities`.

Dezelfde genormaliseerde e-mail werkt een bestaand record bij binnen de publieke tenant. Bestaande opvolgstatus blijft behouden; de bronnen worden gecombineerd. Gelijktijdige aanvragen worden in een database-transactie geserialiseerd. Innovation Center-bijdragen worden daarnaast als opvolgnotities in de bestaande `crm_interactions` bewaard.

De bevestiging betekent dat de aanvraag is opgeslagen. Er wordt geen e-mail verzonden of persoonlijk AI-/energierapport automatisch geleverd. De Innovation Button registreert uitsluitend vrijwillige interesse en verwerkt geen betaling.

## Coolify: admin-toegang instellen

1. Stel **server-side** `ADMIN_ACCESS_KEY` in op een cryptografisch willekeurige, geheime waarde van minimaal 32 tekens, bijvoorbeeld uit een wachtwoordmanager. Gebruik geen voorbeeldwaarde en geen `VITE_`-variabele.
2. Behoud de bestaande `SESSION_SECRET` voor sessieondertekening en de gehashte limieten voor publieke formulieren. Gebruik de bestaande databaseconfiguratie. De admin-sessie kan ook met `ADMIN_ACCESS_KEY` worden ondertekend als `SESSION_SECRET` ontbreekt, maar de publieke registratie vereist nog steeds de bestaande `SESSION_SECRET`.
3. Gebruik HTTPS en `NODE_ENV=production`, zodat de admin-cookie ook `Secure` is.
4. Neem de gewijzigde code op in de Coolify-release en open `/admin-access`. Voer de sleutel uitsluitend daar in, niet in een URL.
5. De login bevestigt de cookie en opent `/control-room`; `/admin-access?next=%2Fsales` opent na verificatie `/sales`.

De sessie is acht uur geldig, `HttpOnly` en `SameSite=Strict`. De sleutel wordt niet opgeslagen in browseropslag of queryparameters. Ongeldige inlogpogingen worden begrensd; cross-site login wordt geweigerd. Afmelden verwijdert de browsercookie en wist de clientcache. Reeds gekopieerde cookies vervallen uiterlijk bij de sessie-expiratie; roteer `ADMIN_ACCESS_KEY` om alle bestaande sleutel-sessies direct ongeldig te maken.

De sleutel is een beheercredential voor de bestaande **standaard/publieke tenant**, niet een willekeurige door de bezoeker opgegeven tenant. Hij ontsluit alleen accountstatus, Control Room, Sales Engine, bijbehorende CRM-routes en de bezoekersintentiesamenvatting. Hij geeft geen toegang tot privéportefeuilles, eigendomsrapporten, Property Transformer of andere modules. Bestaande Clerk-beheerders behouden hun eigen tenant- en rolcontroles.

De frontend behoudt de bestaande Clerk-configuratie voor de overige accountfuncties. Dit document bevestigt geen uitgevoerde Coolify-deploy of productieconfiguratie.
