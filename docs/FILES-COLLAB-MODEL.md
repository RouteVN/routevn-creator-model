# Files In Shared Collab Model

## Summary

Files are first-class shared project entities.

The model stores file metadata only. It does not store binary bytes, transfer
state, or environment-specific availability.

Project icon files are out of scope because they are app-level metadata, not
shared repository state.

## Model Shape

Add a top-level `files` collection with the same `items + tree` shape used by
other project collections.

Each file item stores:

- `id`
- `type`
- `mimeType`
- `size`
- `sha256`

`sha256` is required.

File metadata is immutable after creation in the current design.

## File Types

Supported shared `file.type` values:

- `image`
- `image-thumbnail`
- `audio`
- `audio-waveform`
- `video`
- `video-thumbnail`
- `font`

Usage notes:

- character avatars use `image`
- character sprites use `image`
- template-seeded assets use the same types above

## Commands

The model exposes:

- `file.create`
- `file.delete`
- `file.move`

There is no `file.update` in the current design.

## Rules

- every persisted `fileId` reference in project state must point to an existing
  non-folder file item
- a file cannot be deleted while any project resource still references it
- file metadata sync uses the existing Insieme collaboration flow because
  `files` is part of the shared model

## Non-Goals

This model does not define:

- binary upload or download
- retry logic
- transfer readiness or availability state
- signed URLs or storage tokens
- local cache presence

Those concerns stay outside the shared model and can be added later at the app
or infrastructure layer.
