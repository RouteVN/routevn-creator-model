# Files In Shared Collab Model

## Summary

Use the existing shared model and existing Insieme sync flow for file metadata.

Do not build a second replicated sync store for files.
Do not send binary file bytes through Insieme.

Files become a first-class top-level collection in the shared project model.
Binary content stays outside the model.

## Decision

Add a top-level `files` collection to the shared model.

The shared model becomes the source of truth for:

- which files exist in a project
- stable `fileId` values
- file metadata

The shared model is not the source of truth for:

- local blob presence on one device
- transfer readiness or availability in one environment
- transfer tokens or signed URLs
- binary bytes
- app-level project icon metadata

## Model Shape

Add `files` as a top-level collection with `items + tree`, like other resource
collections.

Each file item stores shared metadata only:

- `id`
- `type`
- `mimeType`
- `size`
- `sha256`

Do not add local-only fields such as `hasLocalBlob`, retry counters, last
error, or readiness state to the model.

## Current File Kinds

These are the shared project file kinds that exist today or are already implied
by current project state.

Recommended `file.type` values:

- `image`
  - original image binary used by image resources
  - also used for character avatars
  - also used for character sprite binaries
- `image-thumbnail`
  - derived thumbnail binary for image resources
- `audio`
  - original sound binary used by sound resources
- `audio-waveform`
  - derived JSON metadata file generated from audio for waveform rendering
- `video`
  - original video binary used by video resources
- `video-thumbnail`
  - derived thumbnail binary for video resources
- `font`
  - original font binary used by font resources

Important distinctions:

- character avatars are not a separate file kind; they are image files by
  binary type and usage
- character sprites are not a separate file kind; they are image files by
  binary type and usage
- template-seeded files are not a separate file kind; they are just preexisting
  files of the kinds above
- project icon files are out of scope for this shared model because they are
  app-level metadata, not repository state

## Commands

Add file metadata commands to the model:

- `file.create`
- `file.delete`
- `file.move`

Rules:

- after `file.create`, file metadata is immutable in the current design
- a resource may reference a file as soon as the file exists in shared project
  state
- `file.delete` must be rejected while any project resource still references the
  `fileId`

This means `file.create` declares a file in project state, but does not by
itself guarantee that every environment already has the binary available.

## Deferred Transfer Effects

Upload and download orchestration is intentionally out of scope for this first
step.

This document only defines how files should exist in shared project state.

Future work may add local side-effect machinery for:

- upload retry
- download retry
- crash-safe transfer resumption
- environment-specific readiness rules outside the shared model

## Sync Behavior

Because `files` is part of the shared model, file metadata sync uses the same
Insieme collaboration path as the rest of project state.

That gives:

- offline draft persistence
- normal reconnect and replay behavior
- ordered convergence of file metadata with the rest of project state

Project icon uploads are out of scope. `iconFileId` remains app-level project
entry metadata, not shared project state.

## Implementation Order

Do a narrow refactor first before adding the new shared `files` feature.

The goal of the refactor is not to redesign upload/download behavior. The goal
is to unify how newly created `fileId` values and their metadata flow into
shared repository commands.

Phase 1, refactor first:

- normalize `uploadFiles()` results so they expose shared file descriptors for
  every persisted blob, including derived files such as thumbnails and waveform
  metadata
- centralize "ensure these file records exist" logic in the shared resource
  command submission layer
- patch known outliers that currently keep only a bare `fileId` and lose the
  metadata needed for `file.create`

Phase 2, feature second:

- add `files` to the shared model state shape
- add `file.create`, `file.delete`, and `file.move`
- enforce invariants so every shared `fileId` reference must exist in
  `state.files.items`
- update templates, tests, and bootstrap state to include `files`

This order keeps the implementation centralized and avoids scattering
`file.create` calls across page handlers.

## Rollout

Start from scratch.

There is no backfill or migration for older projects that do not have `files`.
This is a schema break.

Implications:

- templates must include `files`
- tests and bootstrap builders must include `files`
- older local projects without `files` are out of scope for compatibility

## Tests

Add tests for:

- `file.create`
- `file.delete`
- `file.move`
- resources referencing existing file ids
- delete rejection while referenced
- state validation for required `files` collection in the new schema

## Assumptions

- file metadata is now considered project-owned shared state, so it belongs in
  the shared model
- binary bytes never go through Insieme
- file availability/readiness is intentionally not modeled in this first step
- transfer implementation details are deferred and are not part of this first
  design note
- project icon uploads remain outside this feature because they are app-level
  metadata, not repository state
