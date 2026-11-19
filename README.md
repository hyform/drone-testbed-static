# HyForm static designer

[Open the designer](https://hyform.github.io/drone-testbed-static/) ·
[GitHub repository](https://github.com/hyform/drone-testbed-static)

A standalone browser adaptation of the HyForm drone designer. The landing page
introduces the tool; `designer.html` uses the full browser viewport, with a narrow
file toolbar and optional project/help panels. The Full screen button also works.

The original Unity WebGL application and flight physics are reused without
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
  original client (range and speed to two decimals; cost to whole dollars).

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

Browser autosave uses IndexedDB. It is a convenience, not a backup: clearing
site data removes it. Download project files for durable storage and sharing.
After the first successful load, the cached studio, file controls, and local
evaluation also work without a network connection.

## Architecture

- `docs/index.html`, `landing.css`: introduction and launch link.
- `docs/designer.html`, `app.js`, `studio.css`: full-window studio and file UI.
- `docs/project-model.js`: versioned format, validation, and draft log parsing.
- `docs/local-store.js`: atomic device-local IndexedDB transactions.
- `docs/service-worker.js`: cache and browser-local compatibility adapter for
  `/exper/session/`, `/repo/vehicle/`, and `/repo/datalog/`.
- `docs/Build/`: original Unity WebGL build, unchanged.

The apparent legacy API URLs are handled inside the browser. They do not reach
the static host. There is no server implementation of these routes. Collaboration,
AI services, and experiment administration are outside this first version.

## Validation

```sh
node --test tests/project.test.cjs
```

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
