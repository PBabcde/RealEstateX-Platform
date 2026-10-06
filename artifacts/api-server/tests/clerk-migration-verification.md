# Clerk migration verification

Verified on 2026-10-06 in the running development application.

## Real browser session (not mocked)

A browser tester signed in programmatically through `signInClerkUser` as a new
Clerk user, then navigated to the returned sign-in URL. No test-only auth fixture
or replacement server middleware was used for this pass.

- Signed-in home redirected to `/dashboard`, not `/sign-in`.
- `/dashboard`: `/api/account` and `/api/dashboard/summary` returned 200.
  The data-dependent `Objecten in portefeuille` metric rendered successfully.
- `/properties`: `/api/properties` returned 200; the successful empty response
  rendered `[data-testid=status-empty]` with `Nog geen objecten`.
- Both authenticated pages had no console errors.
- Same-origin requests to `/api/account` and `/api/properties` returned 200 with
  session cookies only, without an Authorization header.
- Account response included the local user ID, owner role, and tenant ID.
- Clicking `[data-testid=button-logout]` returned to `/`, displaying the public
  `[data-testid=button-login]` rather than redirecting to `/sign-in`.
- After logout, a cookie-only request to `/api/account` returned 401.

## Complementary checks

- Shared-library, web, and API TypeScript checks passed.
- Production frontend bundle built successfully.
- Bridge unit tests passed for legacy-ID mapping, existing role/tenant retention,
  first-request provisioning, concurrent insertion, missing-claim rejection, and
  unauthorized access. These tests use doubles and are not the browser proof.
- The property-transformation authorization regression passed.
- Existing isolated photo/storage browser checks passed, including project
  recovery, search, ordering, exports, and imports. Their signed-in fixtures
  intentionally do not serve as authentication acceptance evidence.
- API and frontend workflows restarted successfully; the component-preview
  workflow also restarted after the shared compatible React patch upgrade.

## Production boundary and proxy configuration

The deployment service reported that this project has no active deployment and
no production URL. A live production session test has therefore not been run;
the browser evidence above covers the development instance only.

The required Replit-managed Clerk setup explicitly says production publishing
supplies `VITE_CLERK_PROXY_URL` automatically. It is intentionally empty in
development. The frontend copies the canonical wiring:

```ts
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
```

`ClerkProvider` receives `proxyUrl={clerkProxyUrl}` unconditionally, and the
server mounts the provided `/api/__clerk` proxy before body parsers. There is
deliberately no hardcoded fallback, manually supplied proxy variable, or client
production gate: all three are forbidden by the managed-Clerk setup contract.

References:
- `.local/skills/clerk-auth/references/setup-and-customization.md`
  (IMPORTANT, proxy URL pitfalls, and canonical frontend wiring).
- https://docs.replit.com/features/auth-and-identity/clerk-auth

When the owner publishes the application, verify the published sign-in,
cookie-only account and portfolio requests, and logout on that hostname.
