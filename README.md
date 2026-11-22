# HyForm browser application

[Open the designer](https://hyform.github.io/drone-testbed-static/) ·
[GitHub repository](https://github.com/hyform/drone-testbed-static)

A standalone browser adaptation of the HyForm drone designer, flight evaluator,
operations planner, business planner, and experimenter console. The landing page
links to three full-viewport participant workspaces with a shared project/file
toolbar and an experimenter surface:

- `designer.html`: drone design and local flight evaluation;
- `ops.html`: customer-route and delivery operations planning;
- `business.html`: market selection and submitted-plan comparison.
- `experimenter.html`: local team roster, direct pairing, and data collection.

The original Unity WebGL application, flight physics, and planning calculations are reused without
modifying or rebuilding the compiled engine. No application backend, account,
database service, paid API, or package installation is needed to run the app.

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
timing, operating/startup costs, and profit. A plan becomes durable when
**Submit** names it; in-progress Unity
route edits that have not been submitted are not restored after a reload.

Browser autosave uses IndexedDB. It is a convenience, not a backup: clearing
site data removes it. Download project files for durable storage and sharing.
The application is online-first and does not precache its 16 MB Unity runtime
for offline use. The service worker exists only to bridge the compiled client’s
legacy API-shaped requests to the selected storage implementation.

## Restored AI assistants

The original wand buttons are enabled in the retained Unity Design and
Operations scenes. Their legacy API calls are answered locally by the service
worker, so neither assistant requires the Django application server.

The Designer wand evaluates the current drone, then calls `/ai/designer1/`.
The browser ships the original 1,043-row `designerAI.csv` library created by the
trained design RNN and reproduces the deployed selection logic: normalized
range/cost distance, a shuffled best-100 pool, and five alternatives. Samples
using the superseded design grammar are skipped before they reach the retained
Unity client. The deployed historical wand queried this generated library; it
did not run the TensorFlow 1 checkpoint for each click.

The Operations wand posts the active market and selected fleet to
`/ai/opsplan/`. A dependency-free browser port keeps the recovered sequential
vehicle assignment, range, payload, 30-hour route horizon, parcel and food time
windows, and extra food priority. It returns the plan-shaped response expected
by the original Unity scene. The historical server used Google OR-Tools
`PATH_CHEAPEST_ARC`; this browser implementation uses deterministic
cheapest-feasible arcs with the same constraints rather than claiming
byte-identical OR-Tools solutions.

## Direct browser-to-browser transfer

Each participant workspace is an independent individual/demo mode by default.
Nothing connects or collects data until the person opens **Connect**. The panel
supports optional WebRTC project transfer: one browser creates
an offer, the second browser pastes it and creates an answer, and the first
pastes that answer to finish the connection. The connection codes can be sent
through any existing messaging channel; HyForm has no signaling server.

After the encrypted data channel opens, either person can deliberately send the
current project. The receiver validates the same versioned project format,
previews its name and saved-item counts, and must confirm before replacing local
work. Projects are never automatically merged or overwritten. Applying an
incoming project reloads the workspace and ends the temporary connection.

The peer setup uses the public STUN endpoint shown in the WebRTC project’s
official peer-connection example to discover a direct route. STUN receives
connection metadata, not project contents. There is no TURN relay, so some
corporate, campus, or symmetric-NAT networks may prevent a connection.

## Experimenter sessions

`experimenter.html` maintains a browser-local roster and one independent manual
peer connection per participant. An experimenter can create any number of teams,
assign people to Design, Operations, Business, or Observer positions, and run
individual/no-team participants alongside those teams. Each roster card has its
own offer/answer flow, connection state, collection controls, and captured data,
so several live participants can be managed at the same time.

The experimenter creates an offer for a roster entry; that participant answers
it from **Connect** in Design, Operations, or Business. The participant must
separately enable **Allow experimenter data collection** before the console can
request project or activity data. Connecting for chat does not silently grant
collection permission, and an individual can use the full workspace without
connecting at all.

The experimenter browser is a small star-topology relay for four channel types:

- **All participants · Announcements** reaches every connected roster entry;
- **Team · Session** reaches everyone assigned to one team;
- **Team · Position** reaches one Design, Operations, Business, or Observer group;
- **Help · participant** is a direct participant/experimenter channel.

These names and scopes adapt the original HyForm Team, Position, Session, and
Help-channel concepts. They do not reuse the legacy Django chat backend. A
participant receives only their assigned channel list; incoming participant
messages are checked against it and then relayed by the experimenter to the
currently connected recipients. There is no participant mesh, hosted room, or
signaling service. Chat history is durable only in the experimenter browser;
participant views keep the current connection's messages in memory.

During a consenting live connection, the experimenter console requests and
stores validated project snapshots plus the participant’s subsequent HyForm
activity events. Captured projects, activity, roster assignments, teams, and
chat stay in the experimenter browser’s IndexedDB. The console can download a
project, export an individual versioned experiment-data JSON record, export a
whole team's roster/data/chat record, or open a captured project in Design.
Removing a member deletes that member and their collected project/activity data
and chat records from the local roster. Removing an empty team also removes that
team's session/position history. Connections are temporary and must be paired
again after either page reloads.

## Architecture

- `docs/index.html`, `landing.css`: introduction and tool links.
- `docs/designer.html`, `ops.html`, `business.html`, `app.js`, `studio.css`:
  full-window workspaces, evaluation states, and file UI.
- `docs/market-data.js`: canonical Market 1 data from the original release.
- `docs/assistant-core.js`, `ai/designerAI.csv`: browser-hosted Designer
  candidate selection and Operations routing assistant.
- `docs/project-model.js`: versioned format, validation, and activity parsing.
- `docs/local-store.js`: atomic device-local IndexedDB transactions.
- `docs/peer-sync.js`: manual WebRTC pairing and bounded project, activity,
  configuration, and chat packets.
- `docs/experimenter.html`, `experimenter.js`, `experimenter-store.js`,
  `experimenter.css`, `experimenter-team.css`: multi-team roster, WebRTC hub,
  collection, channel relay, persistence, and exports.
- `docs/service-worker.js`: browser-local compatibility adapter for
  `/exper/session/`, `/repo/vehicle/`, and `/repo/datalog/`.
- `docs/Build/`: original Unity WebGL build, unchanged.

The apparent legacy Unity API URLs are handled inside the browser and do not
reach the static host. There is no application backend. Persistent hosted rooms,
automatic signaling, TURN relay, automatic multi-user project merging,
conversational AI partners, and server-managed experiment administration remain
outside this version.

## Validation

```sh
node --test tests/project.test.cjs tests/service-worker.test.cjs tests/static.test.cjs tests/peer-sync.test.cjs
```

The automated suite covers legacy version 1 project compatibility, market/plan
round trips, local scenario and plan endpoint behavior, both restored wand
endpoints, WebRTC code/message validation, evaluation-state shell hooks,
portable local assets, and hashes for every original compiled asset.

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
8. In separate headless Chrome profiles, created two teams, paired two live
   participants concurrently, and confirmed each received only their team,
   position, announcement, and direct-help channels.
9. Sent an Alpha Session message in both directions and confirmed it did not
   appear in Beta; reloaded the experimenter and confirmed teams, assignments,
   captured project, and channel history persisted while connections correctly
   returned to disconnected.
10. Confirmed an automatic project request collected nothing before consent,
    then enabled collection for one participant and received a validated snapshot.

Assistant verification on 2026-11-22 (Chromium / Codex in-app browser):

1. Confirmed the original Designer wand appears in the retained Unity scene,
   evaluates the baseline configuration, and renders five selectable alternatives
   with range, cost, and capacity bars from the historical RNN library.
2. Loaded the example project, added its Baseline vehicle in Operations, and
   confirmed the original Operations wand returned and drew a two-stop feasible
   route with success status.

The two-process loopback WebRTC check disabled Chrome's local-IP mDNS
obfuscation because the headless test processes could not resolve each other's
generated `.local` names. The application code and production browser defaults
were not changed for the test.

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
