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
modifying or rebuilding the compiled engine. No application backend, account,
database service, paid API, or package installation is needed to run the app.

## Run or deploy

Serve the contents of `docs/` from any ordinary HTTPS static host. The bundle is
about 16 MB. A service worker requires HTTPS, or localhost for development.
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
After the first successful load, the cached studio, file controls, and local
evaluation also work without a network connection.

## Architecture

- `docs/index.html`, `landing.css`: introduction and tool links.
- `docs/designer.html`, `ops.html`, `business.html`, `app.js`, `studio.css`:
  full-window workspaces, evaluation states, and file UI.
- `docs/market-data.js`: canonical Market 1 data from the original release.
- `docs/project-model.js`: versioned format, validation, and activity parsing.
- `docs/local-store.js`: atomic device-local IndexedDB transactions.
- `docs/service-worker.js`: cache and browser-local compatibility adapter for
  `/exper/session/`, `/repo/vehicle/`, and `/repo/datalog/`.
- `docs/Build/`: original Unity WebGL build, unchanged.

The apparent legacy API URLs are handled inside the browser. They do not reach
the static host. There is no server implementation of these routes. Collaboration,
AI services, and experiment administration are outside this first version.

## Validation

```sh
node --test tests/project.test.cjs tests/service-worker.test.cjs tests/static.test.cjs
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
6. Enabled offline mode and stopped the static preview host. Reloaded the cached
   studio and evaluated the restored 6 lb drone: 9.30 mi, 19.67 mph, $3,470.
   Network inspection confirmed legacy data responses came from the service
   worker. No application server was running.
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

There is no dependency installation or build step for deployment. Keep the
release files and this source together. When changing cached files, increment
`CACHE` in `service-worker.js`, then test a fresh install and an upgrade. The
worker removes only this application's older named caches, never project data.
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
