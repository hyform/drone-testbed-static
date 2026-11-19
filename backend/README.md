# Optional HyForm project backend

The browser app remains fully local and continues to deploy from GitHub Pages.
This directory adds an optional, zero-runtime-dependency Cloudflare Worker API
for durable cross-device project snapshots. It is not required for design,
evaluation, Operations, Business, or project-file import/export.

## API

- `GET /api/v1/health` reports service health.
- `POST /api/v1/projects` creates a validated project snapshot and returns a
  one-time edit token. Creation requires `X-Hyform-Access-Key`.
- `GET /api/v1/projects/:id` reads a snapshot without exposing its edit token.
- `PUT /api/v1/projects/:id` updates a snapshot using `Authorization: Bearer`
  and its current `ETag` in `If-Match`.

Every project is normalized with the same `docs/project-model.js` validator used
by the browser. Payloads are capped at 5 MiB. Edit tokens are stored only as
SHA-256 hashes, and optimistic version checks prevent silent overwrites.

## Secure deployment outline

1. Create a Cloudflare D1 database and apply
   `migrations/0001_initial.sql`.
2. Copy `wrangler.toml.example` to the untracked deployment configuration and
   fill in the D1 database ID.
3. Configure `CREATE_ACCESS_KEY` as an encrypted Worker secret.
4. Deploy the Worker and verify `/api/v1/health`.
5. Add browser sync UI only after the production API URL, origin policy, access
   model, retention policy, and abuse controls are confirmed.

The creation key is intentionally not suitable for embedding in public
JavaScript. The current backend is a secure administrative/cohort foundation;
public anonymous sharing requires an identity or anti-abuse layer first.
