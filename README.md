# HyForm browser application

[Open the designer](https://hyform.github.io/drone-testbed-static/) ·
[GitHub repository](https://github.com/hyform/drone-testbed-static)

A standalone browser adaptation of the HyForm drone designer, flight evaluator,
operations planner, and business planner. The landing page links to three
full-viewport workspaces with a shared project/file toolbar and optional panels:

- `designer.html`: drone design and local flight evaluation;
- `ops.html`: customer-route and delivery operations planning;
- `business.html`: market selection and submitted-plan comparison.

The original Unity WebGL application, flight physics, and planning calculations are reused without
modifying or rebuilding the compiled engine. The live app still runs without an
account, while `backend/` now provides the production-oriented API foundation for
durable cross-device storage. No package installation is needed for either runtime.

## Run or deploy

Serve the contents of `docs/` from any ordinary HTTPS static host. The bundle is
about 16 MB. Its compatibility service worker requires HTTPS, or localhost for development.
Opening `index.html` directly as a file is not supported.

For local development:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:8765/`. Python only serves files during this local preview;
it performs no design, evaluation, storage, or project-file work.

GitHub Pages publishes the `docs/` directory directly from the `main` branch.
Push changes to `main` to publish them; no custom deployment workflow or build
step is needed. Retain `.nojekyll`. Subdirectory hosting is supported: Unity's
origin-relative legacy data URLs are intercepted for the controlled designer
page by its service worker. The original `.unityweb` files are gzip-compressed
with the original Unity JavaScript decompression fallback; serve them as files
without recompressing or altering them.

## Project files

Use **Save file** to download a `.hyform.json` file. It contains:

- `format: "hyform-project"` and `version: 1`;
- a project name, creation/update timestamps, and the current draft grammar;
- the named vehicle library, with the original full-precision vehicle metrics;
- the latest local simulation's logged metrics, at the precision exposed by the
  original client (range and speed to two decimals; cost to whole dollars);
- the current Market 1 scenario and submitted operations plans, after those tools
  have been used.

**Open file** validates the entire file before changing the current project.
Malformed files, unsupported versions, non-finite metrics, duplicate vehicle
IDs, and broken grammar connections are rejected. The file limit is 5 MiB.
New/open actions use an in-page confirmation so the current project can first
be downloaded. Invalid imports leave it intact.

Geometry edits, capacity changes, undo/redo, and reset actions update the saved
draft from the original client's local activity stream. Reopening a draft calls
the original Unity `GUI.fromstring` method. Undo history, camera position, and
trajectory frames are not serialized; rerun Evaluate to view the flight again.

The legacy evaluation log omits the stability verdict. Accordingly, a summary
record uses `result: "MetricsRecorded"`; it must not be treated as proof of a
successful flight. The original Unity results display remains authoritative for
Success / CouldNotStabilize / HitBoundary. Named vehicles submitted by Unity
retain the verdict supplied in its vehicle record. An evaluation summary is
marked as belonging to a previous design when the draft has since changed.

The browser evaluation dock listens to the original activity stream. It reserves
space below the Unity canvas while a flight is running or results are available,
so its progress, metrics, and **Back to design** control do not cover the Unity
verdict or controls. Returning to design reloads the autosaved draft into a clean
design scene; it is offered only after the simulator records that evaluation has
ended.

The shared toolbar distinguishes browser autosave from the downloadable project
file with a persistent local-save state. Each Project drawer also shows the next
available workflow handoff based on the saved designs and submitted plans, while
keeping Design, Operations, and Business directly reachable from the mode bar.

## Operations and business planning

The compiled WebGL bundle already includes the original `plan_tool` scene. The
Operations and Business pages select its original modes with `scene=ops` and
`scene=business`; there is no replacement planning model in JavaScript.

The service worker supplies the scene's legacy data requests from the active
browser project:

- `/repo/scenario/` reads and versions the current market;
- `/repo/planshort/` and `/repo/plan/` store and reopen submitted plans;
- `/repo/vehicle/` shares named successful designs from the designer.

Market 1 customer, payload, weight, and location data comes from
`drone-testbed-server` commit `a390c949…`, file `ateams-basic.sql`. The original
Unity code remains responsible for route limits, restricted airspace, delivery
timing, operating/startup costs, and profit. Collaboration and server AI remain
out of scope. A plan becomes durable when **Submit** names it; in-progress Unity
route edits that have not been submitted are not restored after a reload.

Browser autosave uses IndexedDB. It is a convenience, not a backup: clearing
site data removes it. Download project files for durable storage and sharing.
The application is online-first and does not precache its 16 MB Unity runtime
for offline use. The service worker exists only to bridge the compiled client’s
legacy API-shaped requests to the selected storage implementation.

## Architecture

- `docs/index.html`, `landing.css`: introduction and tool links.
- `docs/designer.html`, `ops.html`, `business.html`, `app.js`, `studio.css`:
  full-window workspaces, evaluation states, and file UI.
- `docs/market-data.js`: canonical Market 1 data from the original release.
- `docs/project-model.js`: versioned format, validation, and activity parsing.
- `docs/local-store.js`: atomic device-local IndexedDB transactions.
- `docs/service-worker.js`: browser-local compatibility adapter for
  `/exper/session/`, `/repo/vehicle/`, and `/repo/datalog/`.
- `docs/Build/`: original Unity WebGL build, unchanged.

The apparent legacy Unity API URLs are handled inside the browser and do not
reach the static host. They are separate from the project snapshot API below.
Collaboration, AI services, and experiment administration remain outside this
version.

## Optional backend foundation

`backend/` contains a zero-runtime-dependency Cloudflare Worker and D1 schema for
validated cross-device project snapshots. It is additive: the deployed GitHub
Pages application still uses local IndexedDB and project files, and does not send
project data anywhere. The API supports health checks, protected snapshot
creation, public snapshot reads, edit-token updates, ETags, strict origin and
payload checks, and optimistic conflict handling.

Project creation is disabled unless the server has an encrypted
`CREATE_ACCESS_KEY`; that key is never committed or embedded in the public app.
The backend is not wired into the live UI until a production endpoint, identity
or cohort-access model, retention policy, and abuse controls are selected. See
`backend/README.md` for the deployment contract.

## Validation

```sh
node --test tests/project.test.cjs tests/service-worker.test.cjs tests/static.test.cjs tests/backend.test.mjs
```

The automated suite covers legacy version 1 project compatibility, market/plan
round trips, local scenario and plan endpoint behavior, evaluation-state shell
hooks, portable local assets, and hashes for every original compiled asset.

Browser verification on 2026-11-19 (Chromium / Codex in-app browser):

1. Loaded the original designer and evaluated the baseline configuration:
   Success, 10.00 mi range, 5 lb payload, $3,470 cost, 20.00 mph velocity.
2. Submitted a named vehicle; confirmed it survived a page reload.
3. Changed the draft payload to 6 lb without submitting; exported the file and
   inspected its name, draft grammar, library, and evaluation fields.
4. Created a new project, reopened that exported file, and confirmed the designer
   restored 6 lb and the existing library/previous evaluation.
5. Imported an unsupported format version; the UI rejected it and preserved the
   current project.
6. Evaluated the restored 6 lb drone: 9.30 mi, 19.67 mph, $3,470. Network
   inspection confirmed legacy data responses came from the compatibility bridge.
7. Entered and exited full-screen mode; checked the full-window layout and drawers.

The 2026-11-19 evaluation-interface, Operations, and Business release was also
checked with the automated suite and a local HTTP server. Browser computer-use
was unavailable on the release workstation, so the new end-to-end visual flows
were not falsely recorded as browser-verified here.

The retained Unity runtime emits an old Emscripten warning about its fixed 30 fps
loop and occasionally overlapping filesystem synchronization. These did not
prevent the verified flows. Physics equivalence across all browsers/platforms
has not been established. The legacy designer works best in a desktop browser;
narrow displays can pan horizontally through its minimum-width workspace.

## Maintenance

There is no dependency installation or build step for the GitHub Pages frontend.
Keep the release files and this source together. The service worker is network-only
outside its legacy API bridge, so application updates do not require cache-version
bookkeeping. Test both a fresh install and a service-worker upgrade after bridge
changes.
Keep the format version stable unless implementing an explicit migration.

## Provenance and license

Compiled build source:
`hyform/drone-testbed-server` commit
`a390c949a716b79d2b5018b795708f998e9178f0`, directory
`design/static/js/Build/`.

Interface source inspected:
`hyform/drone-testbed-unity` commit
`5f3ab3d929eb8507af51b68a567cea105919d8d9`.

`upstream-assets.json` records the original build checksums. `docs/about.html`
retains research attribution, citation, funding acknowledgment, and a description
of this adaptation. See `LICENSE` for the upstream
Attribution–NonCommercial–ShareAlike 2.0 license.
