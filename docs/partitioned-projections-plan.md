# Partitioned Projections Plan

## Goals

- Avoid loading the full project state into memory for large projects.
- Keep the event log on disk and use persisted projections as checkpoints.
- Load only the projection slices needed by the current screen.
- Keep the storage schema simple and compact.
- Keep exactly one WebSocket connection per project.

## Final Decisions

- Use exactly 2 projection types:
  - `main`: whole project except scene lines
  - `scene`: one scene with all of its line detail
- Use exactly 1 WebSocket sync session per project.
- Sync the full project's committed event stream to the client.
- Use exactly 1 routing partition per event.
- Change `insieme` itself to singular `partition`.
- This is a breaking change. We do not want a plural `partitions`
  compatibility layer.
- Remove `commandVersion` and standardize on `schemaVersion`.
- Store `payload` as `BLOB`.
- Do not enable payload compression yet.
- Use `partition` only for event routing, local projection filtering, and DB
  indexing. It is not a sync subscription scope.

## Projection Model

### Main Projection

`main` stores:

- project settings/info
- scene metadata and ordering
- section metadata and ordering
- resources
- layouts
- controls
- variables
- any overview-only summary data needed by the UI

`main` does not store scene lines.

### Scene Projection

`scene:<scene>` stores:

- scene metadata
- that scene's sections
- that scene's lines
- any scene-local derived state

Only one or a few scene projections should be loaded into memory at a time.

## Partition Format

Use one compact string partition per event:

- `m`
- `m:s:<hash6>`
- `s:<hash6>`

Where:

- `m` means "main only"
- `m:s:<hash6>` means "affects both main and one scene"
- `s:<hash6>` means "affects one scene only"
- `<hash6>` is a deterministic base58 6-character token derived from the full
  scene id

ID rule:

- random entity ids should use `nanoid` with the RouteVN base58 variant
- these partition tokens are not random ids; they are deterministic derived
  compact hashes

Examples:

- `m`
- `m:s:4Er9Xa`
- `s:4Er9Xa`

## Partition Routing Rules

- `project.*` commands route to `m`
- commands that affect both overview state and one scene route to `m:s:<hash6>`
- line-only scene detail commands route to `s:<hash6>`

Typical examples:

- `project.create`: used during projection build, but not retained as full state
- `scene.create`, `scene.rename`, `scene.delete`, `scene.reorder`:
  `m:s:<hash6>`
- `section.create`, `section.rename`, `section.delete`, `section.reorder`:
  usually `m:s:<hash6>`
- `line.create`, `line.update_actions`, `line.delete`, `line.insert_after`:
  usually `s:<hash6>`
- if a line command must update overview-visible scene summary data, route it to
  `m:s:<hash6>` instead

## Insieme API

RouteVN and `insieme` will both use singular `partition`.

- outbound event:
  - `partition: "m:s:4Er9Xa"`
- inbound event:
  - `partition: "m:s:4Er9Xa"`

Plural `partitions` is removed everywhere in this rollout.

- submit/commit/broadcast event item:
  - `partition`
- sync request / sync response scope:
  - `projectId`
- local draft row:
  - `partition`
- committed row:
  - `partition`

Consequence:

- one `insieme` sync session watches one project
- every client receives the full project event stream
- page-specific filtering happens only in local projection loading/runtime code

## Final SQLite Schema

### Local Drafts

Removed from `local_drafts`:

- `project_id`
- `user_id`
- `client_id`
- `meta`
- plural `partitions`

Final table:

```sql
CREATE TABLE local_drafts (
  draft_clock INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  partition TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload BLOB NOT NULL,
  payload_compression TEXT DEFAULT NULL,
  client_ts INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX local_drafts_partition_draft_clock_idx
  ON local_drafts(partition, draft_clock);
```

### Committed Events

Removed from `committed_events`:

- `meta`
- plural `partitions`

Keep:

- `project_id` for server-side multi-project separation
- `user_id` for committed actor identity
- `server_ts` as authoritative commit time
- `created_at` as row creation time in the local/server DB

Final table:

```sql
CREATE TABLE committed_events (
  committed_id INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT,
  user_id TEXT,
  partition TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload BLOB NOT NULL,
  payload_compression TEXT DEFAULT NULL,
  client_ts INTEGER NOT NULL,
  server_ts INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX committed_events_project_partition_committed_idx
  ON committed_events(project_id, partition, committed_id);
```

Notes:

- Local drafts do not store `client_id`. Shared per-project `client_id` should
  live once in app/store state so any surviving tab can continue syncing drafts.
- Committed rows also do not persist `client_id`. `client_id` remains a
  submit/auth concern, not a committed-storage column.
- In local/client `committed_events`, `project_id` should remain `NULL`.
  Backend/server storage is responsible for populating `project_id`.
- This plan keeps the authoritative/server table explicit first.
- `payload_compression` is reserved for future payload storage compression.
  Current behavior remains raw UTF-8 JSON bytes in `payload BLOB` with `NULL`
  compression.

## Payload Compression Decision

Current decision:

- keep `payload_compression = NULL`
- keep payloads uncompressed for now
- revisit later without another schema change, because `payload` is already a
  `BLOB`

What was benchmarked:

- non-`project.create` `local_drafts.payload` rows
- `zstd -1`
- plain zstd vs zstd with a trained `4 KB` dictionary

### Sample: `project.db`

- `73` payloads
- raw total: `13,672 B`
- average payload: `187 B`
- max payload: `1,919 B`

Compression result:

- plain zstd: `11,127 B` (`-18.6%`)
- zstd + dictionary: `3,812 B` (`-72.1%`)

CPU estimate:

- compress: about `0.195 ms / payload`
- decompress: about `0.182 ms / payload`

### Sample: `project2.db`

- `227` payloads
- raw total: `44,306 B`
- average payload: `195 B`
- max payload: `1,239 B`

Compression result:

- plain zstd: `34,728 B` (`-21.6%`)
- zstd + dictionary: `16,760 B` (`-62.2%`)

CPU estimate:

- compress: about `0.139 ms / payload`
- decompress: about `0.128 ms / payload`

Conclusion:

- dictionary compression looks worthwhile for these very small JSON payloads
- per-row CPU cost is modest
- but we do not need to take that complexity yet
- defer implementation until storage pressure is real
- when we do enable it later:
  - use a low level such as `zstd -1`
  - keep materialized views uncompressed
  - avoid recompressing the same payload when drafts become committed rows

## Projection Filter Model

### Main Projection

`main` reduces events where:

- `partition = 'm'`
- or `partition LIKE 'm:s:%'`

This means `main` is a projection family, not one literal partition key.

### Scene Projection

For one scene token `X`, `scene:X` reduces events where:

- `partition = 's:X'`
- `partition = 'm:s:X'`

### Server Sync

Server sync is project-scoped:

- client requests committed events by `project_id`
- server returns the full committed stream for that project, ordered by
  `committed_id`
- no server-side partition filter is applied during sync

### Local Projection Loading

Local projection catch-up reads from the local committed table for the project
and filters by `partition`.

This keeps:

- network model simple
- one WS connection per project
- DB indexing simple on one `partition` string column

## Query Model

### Server Committed Events Query

Read by:

- `project_id`
- `committed_id`

### Local Main Projection Query

Read by:

- `partition = 'm'`
- `partition LIKE 'm:s:%'`

### Local Scene Projection Query

For one scene token `X`, read by:

- `partition = 's:X'`
- `partition = 'm:s:X'`

## Implementation Tasks

### 1. Partition Helper

- add a deterministic scene partition token helper
- input: full `sceneId`
- output: base58 `hash6`
- add tests for stable output

### 2. RouteVN Event Shape

- standardize RouteVN and `insieme` on singular `partition`
- keep `schemaVersion`
- remove `commandVersion`

### 3. Insieme Breaking API Change

- replace public `partitions` fields with `partition`
- remove plural validation and mapping code
- require explicit `projectId`; do not infer it from partitions
- make sync requests/responses project-scoped instead of partition-scoped
- update compatibility logic to use `schemaVersion`

### 4. Client SQLite Store Migration

- migrate `local_drafts.partitions` to `partition`
- split `meta` into `client_ts`
- add nullable `payload_compression`
- keep `created_at`
- remove `project_id`, `user_id`, and `client_id` from `local_drafts`
- persist one shared per-project `client_id` in app/store state
- update draft read/write code

### 5. Server/Committed Store Migration

- migrate `committed_events.partitions` to `partition`
- split `meta` into `client_ts`
- add nullable `payload_compression`
- add `server_ts`
- keep `created_at` as row creation time
- keep `project_id` and `user_id`
- keep local/client `project_id` as `NULL`; populate it only in backend/server
- update query paths to use single-partition equality/prefix matching

### 6. Projection Runtime

- implement only 2 projection types:
  - `main`
  - `scene`
- open project: load only `main`
- open scene: load only that scene projection
- evict inactive scene projections from memory

### 7. Command Routing

- assign every command exactly one partition string
- review each command type and choose:
  - `m`
  - `m:s:<hash6>`
  - `s:<hash6>`

## Implementation Plan

### Insieme

1. Change event record normalization and validation to accept singular
   `partition` for submit items and committed events.
2. Change sync requests/responses to use `projectId` instead of partition
   scopes.
3. Remove persisted committed `client_id`.
4. Split committed timing fields into:
   - `client_ts`
   - `server_ts`
   - `created_at`
5. Add `payload_compression TEXT DEFAULT NULL` to both draft and committed
   tables and keep `payload` as `BLOB`.
6. Change SQLite/LibSQL/IndexedDB store row mappers and schema versions.
7. Treat the schema change as reset-required. No backward-compat migration
   layer.
8. Update tests and docs to the new event/storage contract.
9. Update materialized-view and sync runtime assumptions so they no longer
   depend on subscription partition sets.

### RouteVN Creator Client

1. Add partition helpers for:
   - `m`
   - `m:s:<hash6>`
   - `s:<hash6>`
2. Remove `commandVersion` from command envelopes and compatibility logic.
3. Change stored command/repository events to singular `partition`.
4. Update command builders so they resolve candidate scopes down to one final
   event partition.
5. Update local collab store schema to:
   - `partition`
   - `payload_compression`
   - `client_ts`
   - `created_at`
6. Keep local draft `project_id`, `user_id`, and `client_id` removed.
7. Keep shared per-project `client_id` outside the draft rows.
8. Update projection bootstrapping and repository runtime to use:
   - `serverTs`
   - singular event `partition`
9. Keep exactly one sync session per project. No partition switching.
10. Update local projection loading so:
   - `main` reads `m` plus all `m:s:*`
   - `scene:X` reads `s:X` plus `m:s:X`

### Follow-Up Validation

1. Run `insieme` tests/lint/types and fix all event-shape regressions.
2. Run `routevn-creator-client` tests/lint/types and fix command-envelope
   regressions.
3. Verify the main/scene projection loading flow end to end:
   - open project loads `main`
   - open scene loads one `scene`
   - sync still uses one project-scoped WS session
   - local drafts still overlay onto both projections correctly

### 8. Rebuild / Bootstrap

- `project.create` is still consumed during projection build/rebuild
- projection state must not retain the full bootstrap payload in memory
- rebuild logic must seed `main` and scene projections from `project.create`
  and then continue with incremental events

### 9. Testing

- partition token stability tests
- projection routing tests per command type
- catch-up query tests for:
  - `main`
  - one scene
- memory/load tests with many scenes

## Non-Goals For This Pass

- no `partition` lookup table
- no association table
- no partition normalization tables
- no payload compression implementation yet
- no backward-compatibility layer for old `partitions`
- no dual-read runtime support for old and new schemas

## Repo Implementation Plan

### Rollout Order

1. Update `../insieme` first so the stores can persist the compact RouteVN
   schema and singular API in a major breaking release.
2. Update `../routevn-creator-client` to switch fully to singular
   `partition`, compact partition routing, and the new `insieme` major version.
3. After both repos are wired together, reset existing stores before changing
   server-side deployments.

### `../insieme`

Goal:

- change `insieme` public APIs, protocol payloads, and stores to singular
  `partition`
- remove plural `partitions` support
- use one compact `partition` column and flattened metadata columns everywhere
- ship this as a breaking major version

Files in scope:

- `src/command-sync-session.js`
- `src/sync-server.js`
- `src/canonicalize.js`
- `src/authz-helpers.js`
- `src/sqlite-client-store.js`
- `src/libsql-client-store.js`
- `src/indexeddb-client-store.js`
- `src/sqlite-sync-store.js`
- `src/libsql-sync-store.js`
- `src/in-memory-sync-store.js`
- `src/materialized-view-runtime.js`
- `src/event-record.js`
- `src/command-profile.js`
- `src/client.js`
- `src/server.js`
- protocol docs and API docs

Planned changes:

1. Replace `partitions` with `partition` across the entire `insieme` API.
   - submit items use `partition`
   - committed and broadcast events use `partition`
   - authz helpers use `partition`
   - materialized-view runtime uses `partition`
   - store interfaces use `partition`
   - sync session scope uses `projectId`, not partition

2. Replace the store schemas directly in `sqlite-client-store`,
   `libsql-client-store`, `indexeddb-client-store`, and `sqlite-sync-store`.
   - `local_drafts` columns:
     - `draft_clock`
     - `id`
     - `partition`
     - `type`
     - `schema_version`
     - `payload`
     - `payload_compression`
     - `client_ts`
     - `created_at`
   - `committed_events` columns:
     - `committed_id`
     - `id`
     - `project_id`
     - `user_id`
     - `partition`
     - `type`
     - `schema_version`
     - `payload`
     - `payload_compression`
     - `client_ts`
     - `server_ts`
     - `created_at`

3. Update runtime objects and helpers to singular `partition`.
   - Draft rows decode to:
     - `partition`
     - `meta: { clientTs }`
   - Committed rows decode to:
     - `partition`
     - `meta: { clientTs }`
     - `serverTs`
     - `createdAt`
   - remove plural-array normalization helpers where no longer needed

4. Update query and authz paths to singular equality.
   - stop using JSON-array overlap queries
   - use exact single `partition` equality
   - remove plural partition intersection logic from the new code path
   - keep sync authorization and committed-event listing scoped by `projectId`

5. Keep `projectId` explicit.
   - compact partitions no longer encode `projectId`
   - callers must send `projectId` explicitly on submit
   - remove `projectIdFromPartitions` usage from the new API path
   - `client_id` is still validated during submit/auth, but not persisted in
     committed rows

6. Migration strategy.
   - No runtime backward compatibility.
   - SQLite/libSQL server stores:
     - use a one-shot migration or reset before rollout
   - IndexedDB/local browser stores:
     - bump schema version
     - rebuild object stores in the new shape
     - accept local cache reset

7. Add tests in `../insieme`.
   - singular `partition` API tests
   - SQLite/libSQL migration tests
   - IndexedDB roundtrip tests
   - committed/draft decode tests
   - partition query tests for:
     - `m`
     - `m:s:<hash6>`
     - `s:<hash6>`

8. Release work.
   - bump `insieme` major version after the breaking changes land
   - update changelog/release notes to call out:
     - singular `partition` replaces plural `partitions`
     - no backward compatibility
     - IndexedDB cache reset

### `../routevn-creator-client`

Goal:

- switch RouteVN internals to singular `partition`
- replace broad project/story/resource partitioning with:
  - `m`
  - `m:s:<hash6>`
  - `s:<hash6>`
- consume the new singular `insieme` API directly

Files in scope:

- `src/deps/services/shared/collab/commandEnvelope.js`
- `src/deps/services/shared/collab/mappers.js`
- `src/deps/services/shared/collab/compatibility.js`
- `src/deps/services/shared/collab/createProjectCollabService.js`
- `src/deps/services/shared/projectCollabCore.js`
- `src/deps/services/web/collabClientStore.js`
- `src/deps/services/tauri/collabClientStore.js`
- `src/deps/services/web/collab/connectionRuntime.js`

Planned changes:

1. Add a shared scene-token helper.
   - input: full `sceneId`
   - output: deterministic base58 `hash6`
   - route helpers:
     - `m`
     - `m:s:<hash6>`
     - `s:<hash6>`

2. Change RouteVN command envelopes to singular `partition`.
   - `commandEnvelope.js` should build `partition`, not plural `partitions`.
   - remove RouteVN-only base partition merging logic.
   - keep explicit `projectId` on the command envelope.

3. Remove `commandVersion`.
   - `mappers.js` should stop writing `meta.commandVersion`
   - `mappers.js` should stop reading `meta.commandVersion`
   - `compatibility.js` should compare `schemaVersion`
   - RouteVN command compatibility should standardize on `schemaVersion`

4. Update the `insieme` boundary usage to singular.
   - outbound RouteVN command uses `partition`
   - inbound committed event uses `partition`
   - remove singular/plural wrapper logic from the mappers

5. Stop relying on partition-derived `projectId`.
   - RouteVN must always submit an explicit `projectId`.
   - When local committed rows omit `project_id`, RouteVN should inject the
     current project id from session/context when mapping the event back to a
     command.
   - RouteVN committed-event handling should use `serverTs` for authoritative
     remote commit time and `createdAt` only for local row bookkeeping

6. Replace current routing helpers in `projectCollabCore.js`.
   - remove old `project:${projectId}:...` partition builders
   - add RouteVN-specific `m` / `m:s:<hash6>` / `s:<hash6>` routing helpers
   - review command routing so each command gets exactly one partition

7. Update draft persistence in `createProjectCollabService.js`.
   - draft inserts should persist one `partition`
   - still keep `createdAt`
   - local projection rebuild should query drafts by the new partition strings

8. Move shared `client_id` ownership out of `local_drafts`.
   - persist one per-project `client_id` in store/app state
   - surviving tabs reuse the same `client_id`
   - `connectionRuntime.js` should stop defaulting to a fresh tab-scoped client
     id for the shared local-store path
   - explicit remote/debug overrides can still provide a different `clientId`

9. Switch RouteVN stores to the new singular `insieme` schema.
   - Tauri path:
     - `src/deps/services/tauri/collabClientStore.js`
   - Web path:
     - `src/deps/services/web/collabClientStore.js`
   - both should use the new singular `partition` store API directly

10. Update projection loading to the new two-projection model.
    - load `main` on project open
    - load only the active `scene` projection on scene open
    - avoid loading all scene-detail state at once
    - one WS sync session still receives the full project event stream
    - local projection filtering happens after storage, not in WS subscription
    - overlay committed state plus relevant local drafts for:
      - `m`
      - `m:s:<hash6>`
      - `s:<hash6>`

11. Add tests in `../routevn-creator-client`.
    - partition helper stability tests
    - mapper tests for singular `partition`
    - compatibility tests using `schemaVersion`
    - draft persistence tests against the new schema
    - projection loading tests for:
      - main overview only
      - single-scene detail only

### Follow-Up After These Two Repos

- update the backend app repo to consume the new `insieme` major version and
  populate `committed_events.project_id`
- reset server/client stores before rollout

## Review Notes

- `project_id` stays the top-level sync key. We are not introducing `streamId`.
- `partition` is singular and only describes local projection routing.
- WS sync is whole-project:
  - connect/auth by `projectId`
  - sync committed events by `projectId`
  - broadcast committed events by `projectId`
- The current partially-updated `insieme` source still needs follow-through in:
  - local client stores
  - stream initializer / session plumbing
  - materialized-view runtime semantics for RouteVN `main` family loading
