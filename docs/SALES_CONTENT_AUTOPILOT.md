# Sales Content Assistant

The Control Room content assistant is an on-demand extension of the existing
Sales Engine. It does not add a payment flow, scheduled job, or second CRM.

## Routes

- `GET /api/sales/content-options` returns active, categorized CRM partners and
  Deal Room records whose current status is `GO`.
- `POST /api/sales/leads/{leadId}/content-draft` creates one Dutch message draft
  for an authorized administrator. The request accepts one of four content
  types and optional partner and Deal Room IDs.

Both routes use the existing Sales administrator and tenant checks. Draft
generation is limited to 20 requests per administrator per hour. A LinkedIn
draft requires a Deal Room record that is still at `GO` when generation runs.

## Data separation and AI inputs

Partner administration reuses the existing CRM contact records. The
`partnerCategory` tag is stored on that CRM record; it does not create a lead
foreign key or write partner details into lead metadata. Generated drafts are
returned to the browser only. They are editable and copyable, but are not saved,
emailed, published, or scheduled.

The AI request contains only a restricted profile: lead status and score,
validated source/user-type/energy-label values, an optional numeric ROI value
treated as reported and indicative,
campaign type, partner expertise category, and—only for a LinkedIn draft—a
limited set of non-address property facts and calculated yield metrics. Names,
email addresses, phone numbers, company names, free-text interests, notes,
partner contact details, Deal Room titles, and locations are excluded from the
prompt. Property types and energy labels are allowlisted before sharing.

The AI integration must be configured in the running environment using the
existing OpenAI integration. If it is unavailable, the endpoint returns a clear
service error; it does not fall back to a local model or silently produce a
template.
