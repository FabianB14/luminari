# Feature Audit

Audit date: 2026-05-24

Scope reviewed:
- `public/index.html` — single-page browser client, map, pouch, garden, AR, weather UI.
- `src/server.js` — Node API, Postgres schema, login, seed collection, planting.
- `render.yaml` — Render services, database, key-value, worker, cron wiring.
- `src/worker.js` — worker heartbeat only.
- `scripts/nightly-cleanup.js` — cron placeholder only.

No gameplay code changes were made as part of this audit. Several gaps are larger than one-line or one-function fixes and are documented below.

## Step 1 — Boot

Status: ⚠️ Partial

Where it lives:
- `public/index.html:24` — Bootstraps client state from `localStorage` key `interverseLuminaraV5`, including account, wild seeds, seed pouch, plants, lumens, and weather.
- `public/index.html:41` — Login fetches server player payload and replaces local seeds/plants/lumens with API data.
- `src/server.js:57` — `ensureSchema()` creates `players`, `seeds`, and `plants` tables.
- `src/server.js:205` — `getPlayerPayload()` returns player, unplanted seeds, plants, and rarity rates.
- `render.yaml:1` — Render has static web, API, worker, cron, Postgres, and key-value services wired.

What works:
- Guest/local state survives browser restart through `localStorage`.
- Account login loads server-owned seeds, plants, lumens, and XP from Postgres.
- Starter pack is granted once for new accounts when they have no seeds/plants.
- Render has a Postgres database configured for API/worker/cron.

What's broken or missing:
- Server account data does not auto-refresh on app boot; the player must log in again to pull current Postgres state.
- Garden tier does not exist in schema, API payload, or UI.
- Currency shown is only `lumens`; no broader balances or premium currency exist.
- Account username is not unique; only email is unique.
- `src/worker.js` is only a heartbeat and does not perform autosave, decay, auction settlement, or scheduled gameplay work.

Recommended fix:
Add a lightweight session restore endpoint or client boot refresh that reloads the current logged-in player by saved account id/email, and add explicit persisted fields for garden tier/cosmetic tier. Username uniqueness needs a new normalized unique index and login/signup behavior, not just a UI change.

## Step 2 — Get Seeds

Status: ⚠️ Partial

Where it lives:
- `public/index.html:35` — Client rarity roll uses weighted rarity table for generated wild seeds.
- `public/index.html:37` — `makeSeeds()` generates GPS-offset wild seeds around the current player position.
- `public/index.html:42` — `collectWildSeed()` enforces login, 15m distance, sends server collection, and puts seed in pouch.
- `public/index.html:45` — `loadHotspots()` queries OpenStreetMap/Overpass and creates boosted rare hotspot seeds.
- `public/index.html:48` — `renderMap()` displays wild seed markers and plant markers on the map.
- `src/server.js:263` — `collectSeed()` inserts collected seed into the Postgres `seeds` table.

What works:
- Seeds appear on the map around the player or simulated player location.
- Distance gating exists; player must be within 15m to collect.
- Collected server seeds are inserted into the `seeds` table and returned in the Seed Pouch.
- Rare hotspot discovery exists via Overpass API fallback.

What's broken or missing:
- Wild seed generation is client-trusted; the server accepts species/rarity sent by the browser instead of rolling rarity server-side.
- Camera/AR view does not show nearby uncollected wild seeds; seed discovery is map-only.
- Wild seed spawns are not persisted as world spawns, so refreshing wild seeds can create a new set.
- There is no global/shared seed spawn table or anti-cheat validation.
- Rarity rates are inconsistent between requested spec and code math because weights sum to 10,411, so effective percentages are not exactly 60/30/10/3/1/0.1/0.01.

Recommended fix:
Move wild seed spawn and rarity rolling to the API so server-created spawns have stable ids, server-rolled rarity, and collection validation. Camera-visible nearby seeds should be a separate AR overlay pass fed by the same spawn list, not a new inventory type.

## Step 3 — Plant In AR

Status: ⚠️ Partial

Where it lives:
- `public/index.html:43` — `plantSeed()` plants the selected pouch seed, posts to `/plants`, and removes the seed from pouch on success.
- `public/index.html:55` — `renderAr()` displays selected seed/plant state and fallback camera plant visual.
- `public/index.html:57` — `loadThree()` imports Three.js for WebXR rendering.
- `public/index.html:58` — `makeXrPlant()` builds the 3D plant mesh.
- `public/index.html:60` — `startRealAr()` starts WebXR hit-test mode and updates the floor reticle.
- `src/server.js:277` — `plantSeed()` validates the seed belongs to owner, creates plant, stores GPS anchor and AR anchor, and marks seed planted.
- `src/server.js:182` — `cleanAnchor()` validates either fallback screen anchor or WebXR matrix anchor.

What works:
- Player can select a seed from the Seed Pouch in My Garden and transition to AR.
- Real AR hit-test support exists for supported mobile browsers.
- Planting converts a server seed into a server plant and marks the seed planted.
- Genetics are generated at planting time by `dnaFor()`.
- Feedback exists through `setStatus()` and the AR status pill after planting.

What's broken or missing:
- Feedback does not clearly distinguish `wild seed`, `seed-in-pouch`, and `planted plant` tags in AR/camera view.
- If WebXR is unavailable, fallback camera mode uses a screen anchor, not a true physical-world anchor.
- WebXR matrix persistence is saved, but there is no robust relocalization/cloud-anchor system for returning to the exact same physical spot across sessions/devices.
- AR view does not show nearby wild seeds from the camera before collection.
- Genetics are hidden and not exposed to UI.

Recommended fix:
Add explicit visual state tags in AR/Garden cards: `Wild`, `In Pouch`, `Planted`, `World`, `WebXR Anchor`, and `Fallback Anchor`. True return-to-exact-floor persistence will need WebXR Anchors/cloud-anchor style support; the current matrix is a useful first pass but not enough for durable physical relocalization.

## Step 4 — Care For Plants

Status: ⚠️ Partial

Where it lives:
- `public/index.html:34` — `stageFor()` computes growth stage from age, harmony, weather growth, and rarity days.
- `public/index.html:39` — `weatherMod()` changes growth modifiers based on weather condition and temperature.
- `public/index.html:53` — `plantCard()` shows Light, Essence, Harmony, and Growth meters.
- `public/index.html:56` — `care()` increments Light, Essence, or Harmony locally.
- `src/server.js:73` — Plant table has `light`, `essence`, `harmony`, `health`, `generation`, and `dna` columns.

What works:
- Plants show Light, Essence, Harmony, Health defaults, and growth progress.
- Light/Essence/Attention buttons exist in AR and Real AR dock.
- Growth changes over real elapsed time, which matches observed behavior.
- Weather can affect growth calculation on the client.

What's broken or missing:
- Care changes are local-only; there is no API endpoint to persist Light/Essence/Harmony after care.
- Harmony does not update based on the balance between Light and Essence; Attention directly adds Harmony.
- `CareDaysStreak` does not exist in schema or client state.
- Requested growth stages are `Seed -> Sprout -> Sapling -> Juvenile -> Mature -> Bloom`, but code uses `Seed -> Sprout -> Young -> Mature -> Blooming -> Ancient`.
- Decay over real time is not persisted or scheduled server-side.
- Health damage/death/protection are not implemented.

Recommended fix:
Add one care endpoint that accepts a plant id and action, verifies ownership, updates meters, recalculates harmony/balance and daily streak, and returns the same player payload. Route AR and My Garden care through that endpoint so both surfaces share one care path.

## Step 5 — My Garden

Status: ⚠️ Partial

Where it lives:
- `public/index.html:18` — My Garden section contains a plant list and Seed Pouch list.
- `public/index.html:50` — `seedButton()` renders pouch seed cards.
- `public/index.html:51` — `renderGarden()` renders plants and seeds in the same screen.
- `public/index.html:53` — `plantCard()` shows plant species, rarity, growth, GPS anchor distance, and meters.
- `public/index.html:56` — Selecting a plant or pouch seed changes selected ids and routes to AR.

What works:
- My Garden is available from anywhere in the app.
- It shows owned plants and Seed Pouch seeds in one view/screen.
- Seed selection from pouch exists and routes into AR planting.
- Plant cards display basic plant location info as GPS distance and whether it is saved in Postgres/local.

What's broken or missing:
- No filters by species, rarity, or location.
- Care from My Garden is not direct; player must select a plant and use AR controls.
- Location tags are incomplete: no `world`, `greenhouse`, or `seed-in-pouch` unified tag model.
- My Garden does not include garden tier or cosmetic theme.
- Seeds and plants are visually separated into two lists rather than one fully unified query/lens.

Recommended fix:
Keep My Garden as a view over seeds plus plants, but add filter controls and route care buttons on plant cards to the same care function/API used by AR. Add explicit location tags to each rendered entry before building greenhouse.

## Step 6 — Greenhouse

Status: ❌ Missing

Where it lives:
- `public/index.html:53` — Plant cards only show GPS anchor/local persistence; no greenhouse status.
- `src/server.js:73` — `plants` table has no `location`, `greenhouse`, `decay_modifier`, or slot fields.
- `render.yaml:37` — Worker service exists but does not process greenhouse effects.

What works:
- Nothing specific to greenhouse is implemented.

What's broken or missing:
- No greenhouse location flag on plants.
- No move-to-greenhouse or move-back action.
- No greenhouse buffed remote care/slower decay.
- No greenhouse slots, tiers, upgrades, or garden display mode.

Recommended fix:
Implement greenhouse as a `location` field on `plants` with values like `world` and `greenhouse`, matching the requested inventory model. Then add small API mutations to move a plant between locations and have decay/growth logic read the field.

## Step 7 — Marketplace

Status: ❌ Missing

Where it lives:
- `public/index.html:13` — Menu has a Marketplace button, but it routes to the generic Systems screen.
- `src/server.js:57` — Schema has no listings, auctions, bids, purchases, or ownership transfer records.
- `scripts/nightly-cleanup.js:1` — Cron job says no cleanup tasks are registered.

What works:
- Only a placeholder menu button exists.

What's broken or missing:
- No listing creation, fixed price, auction, bid, buy, fee, currency transfer, or ownership transfer.
- No expired auction settlement.
- No marketplace UI.
- No rarity tradeability rules.

Recommended fix:
This is a full feature, not a one-function gap. Add marketplace tables and server-side transaction endpoints first; only after ownership/currency transfer is safe should the UI be added.

## Step 8 — World Trading

Status: ❌ Missing

Where it lives:
- `public/index.html:48` — Map can render owned plant markers, but there is no other-player nearby plant fetch.
- `src/server.js:57` — Schema has no trade offers or trade items.
- `src/server.js:318` — API routes expose only health, login, collect seed, and plant seed.

What works:
- No world trading functionality is implemented.

What's broken or missing:
- No nearby other-player plant discovery endpoint.
- No offer creation, accept, decline, currency transfer, seed transfer, or plant transfer.
- No async owner notification/offer inbox.

Recommended fix:
Add server-owned trade offer records and transactional accept/decline endpoints. Do not trust the client for offered inventory or currency amounts; every item and currency balance must be checked in the database transaction.

## Step 9 — Store

Status: ❌ Missing

Where it lives:
- `src/server.js:57` — Schema has no purchases, inventory grants, boosters, essence packs, premium currency, or cosmetics.
- `public/index.html:19` — Systems screen shows API/database/weather/location only, not a store.
- `render.yaml:1` — No payment webhook service or environment variables are configured.

What works:
- No store functionality is implemented.

What's broken or missing:
- No real-money purchase flow.
- No in-game store purchases.
- No premium seeds, growth boosters, essence packs, cosmetic themes, or garden tier changes.
- No receipt validation or payment provider webhook.

Recommended fix:
Separate in-game currency purchases from real-money purchases. In-game purchases can be handled by API transactions; real-money purchases need a payment provider webhook and receipt validation before granting items.

## Step 10 — Persistence

Status: ⚠️ Partial

Where it lives:
- `public/index.html:30` — `save()` writes client state to `localStorage`.
- `public/index.html:46` — `renderAll()` calls `save()` after rerendering.
- `src/server.js:205` — Server payload returns persisted player seeds and plants.
- `src/server.js:263` — Collected seeds persist to Postgres.
- `src/server.js:277` — Planted plants persist to Postgres.
- `src/worker.js:1` — Worker only logs heartbeat.
- `scripts/nightly-cleanup.js:1` — Cron has no registered cleanup/settlement tasks.

What works:
- Local client state survives browser restart.
- Login, starter seeds, collected server seeds, and planted server plants persist in Postgres.
- Render is configured with a database.

What's broken or missing:
- Care, move, remove, Light/Essence/Harmony changes, greenhouse state, listings, trades, and store purchases do not persist server-side.
- No autosave timer exists beyond saves triggered by rendering/transitions.
- No server-side decay, streak, auction settlement, or cleanup job exists.
- Client can fall back to local-only state for several actions, which can diverge from server state.

Recommended fix:
Persist every mutation that affects an account-owned object through the API first, then update local state from the returned payload. Add a small interval client autosave only for local fallback, but do not rely on localStorage for account-owned canonical state.

## Step 11 — Interverse

Status: ❌ Missing

Where it lives:
- `public/index.html:16` — Brand text says Interverse, but there is no Interverse mode toggle or mint/migrate flow.
- `src/server.js:304` — Health payload mentions gameplay features but not an Interverse mode capability.
- `src/server.js:26` — Rarity table uses `Ethereal`, not `InterverseUltraRare`.

What works:
- The game can run without Interverse functionality.
- Ultra-rare-style rarity exists under the name `Ethereal`.

What's broken or missing:
- No Interverse ON/OFF mode.
- No Epic+ mint/migrate eligibility logic.
- No wallet, chain, migration, or asset status fields.
- Rarity naming does not match requested `InterverseUltraRare`.

Recommended fix:
Keep Interverse optional and off by default. Add explicit eligibility fields/status only after core inventory, persistence, trading, and marketplace ownership transfers are reliable.

## Inventory Model Check

The current code partially matches the requested model.

What matches:
- `seeds` in Postgres with `planted_at is null` act as the Seed Pouch (`src/server.js:205`).
- `plants` in Postgres act as the Plant Collection (`src/server.js:205`).
- My Garden is a client view over `state.plants` plus `state.seeds` rather than a separate storage table (`public/index.html:51`).
- Planting removes a seed from the pouch by setting `planted_at` and creates a plant (`src/server.js:277`).

What deviates:
- Greenhouse is not implemented, so there is no greenhouse-as-location-flag model yet.
- My Garden is visually split into two lists, not a fully unified filtered lens.
- Care from My Garden does not route through the same durable care path as AR because there is no durable server care path.
- Client fallback can create local seeds/plants that duplicate the conceptual server model and can diverge from Postgres.
- No explicit `world` vs `greenhouse` vs `seed-in-pouch` location tag is stored or consistently rendered.

Rarity table check:
- `src/server.js:26` is the server authority for account starter seeds and API health rarity labels/rates.
- `public/index.html:22` duplicates the rarity table client-side for wild seed generation.
- Both files use labels `Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`, `Mythic`, `Ethereal` and display rates `60%`, `30%`, `10%`, `3%`, `1%`, `0.1%`, `0.01%`.
- The requested label `InterverseUltraRare` is not used; code uses `Ethereal`.
- The effective weighted probabilities do not equal the displayed rates because weights sum to 10,411, not 10,000 plus separate bonus logic. Example: Common weight 6000 is about 57.6% of total, not exactly 60%.

## Cross-Cutting Issues

- Account uniqueness: email is unique via `players_email_unique` (`src/server.js:68`), but username/name is not unique. Device id is unique, but login now primarily uses email.
- Security: wild seed collection trusts client-sent species, rarity, source, and coordinates (`src/server.js:263`; `public/index.html:42`). Rarity and collection validation should be server-owned.
- Persistence: server persistence exists for login, collected seeds, and planted plants only. Care/move/remove are client-local.
- Stale startup: logged-in account state is not automatically reloaded from Postgres on app boot.
- Stage mismatch: requested stages are `Seed`, `Sprout`, `Sapling`, `Juvenile`, `Mature`, `Bloom`; client uses `Seed`, `Sprout`, `Young`, `Mature`, `Blooming`, `Ancient` (`public/index.html:21`).
- Client/server duplication: rarity tables, species lists, and growth calculations are duplicated between frontend and backend, and some logic exists only on the client.
- Worker/cron placeholders: `src/worker.js` and `scripts/nightly-cleanup.js` do not process gameplay tasks, decay, streaks, auction settlement, or cleanup.
- Tests: no test files or automated gameplay verification were found in reviewed files; `package.json:10` only runs syntax checks.
- Build/deploy: `render.yaml` correctly wires static frontend and API, but the static web build command runs the root Node syntax check rather than a frontend-specific validation.
- AR persistence: WebXR hit-test placement works for the active session on supported browsers, but durable cross-session physical relocalization is not guaranteed by the saved matrix alone.
