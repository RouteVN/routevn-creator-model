# Schema Compatibility Maintenance

This repo treats persisted model compatibility as a product contract.

If you change model validation, reducer behavior, or any persisted command/state
shape, you must update the compatibility archive and rerun the compatibility
suite in the same PR.

## Versioning Rule

- `SCHEMA_VERSION` is the persisted schema compatibility number
- `SCHEMA_VERSION` must stay aligned with the **minor** version from
  `package.json`
- patch releases must not change persisted schema compatibility

Examples:

- package `1.1.0` => `SCHEMA_VERSION = 1`
- package `1.1.7` => `SCHEMA_VERSION = 1`
- package `1.2.0` => `SCHEMA_VERSION = 2`

The current repo policy is:

- newer schema versions must continue to accept older schema fixtures
- older schema versions do not need to accept newer schema fixtures
- additive object properties are allowed in replay/state assertions
- missing old properties, changed old values, or changed array results are
  compatibility failures

## Compatibility Archive

Compatibility fixtures live under:

```text
tests/compat/schema-<n>/
```

Each schema archive has 3 layers:

```text
tests/compat/schema-<n>/
  payloads/
    <command-type>/
      minimal.yaml
      full.yaml
      ...
  states/
    minimal-project.yaml
    omitted-optionals-project.yaml
    present-optionals-project.yaml
    cross-referenced-project.yaml
    maximal-project.yaml
  streams/
    story-crud.yaml
    media-crud.yaml
    ui-resources-crud.yaml
    ...
```

### Payload Fixtures

Payload fixtures exist to catch validator regressions.

For the current schema version:

- every public command type must have `minimal.yaml`
- every public command type must have `full.yaml`
- extra variants should exist when one command type has multiple important shapes
  such as:
  - folder vs non-folder resources
  - different layout/control element kinds
  - different nested payload branches

Meaning:

- `minimal.yaml` covers the smallest valid shipped shape
- `full.yaml` covers a rich valid shipped shape with optional fields present
- extra files cover meaningful alternate valid branches

### State Fixtures

State fixtures exist to catch `validateState()` and invariant regressions.

Each schema archive should include at least:

- minimal project
- project with optionals omitted
- project with optionals present
- cross-referenced project
- maximal project with all major collections populated

### Stream Fixtures

Stream fixtures exist to catch reducer and replay regressions.

Each schema archive should include realistic command sequences covering:

- create/update/move/delete flows
- cross-reference flows
- historically tricky cases
- major resource families and nested structures

## Required Workflow For Model Changes

Use this checklist for every PR that changes model behavior.

### 1. Decide Whether The Persisted Contract Changed

If your change affects any of these, treat it as a schema compatibility change:

- accepted command payload shape
- accepted persisted state shape
- reducer output shape
- required vs optional fields
- defaulted fields that become persisted output
- nested structure shape

If yes:

- bump package **minor**
- keep `SCHEMA_VERSION` aligned with that new minor
- add a new `tests/compat/schema-<n>/` archive

If no:

- package patch is sufficient
- current schema archive must still be updated if the new feature adds new valid
  command/state shapes inside the same schema line

### 2. Update The Compatibility Definitions

When adding or changing a feature:

- update the generator in
  [scripts/generate-compat-fixtures.js](../scripts/generate-compat-fixtures.js)
- add or expand payload fixtures for every affected command type
- add or expand state fixtures if persisted state shape changed
- add or expand stream fixtures if reducer/replay behavior changed

Do not leave new public command/state shape unrepresented in compatibility
fixtures.

### 3. Regenerate The Archive

Run:

```bash
bun run generate:compat-fixtures
```

The generated YAML under `tests/compat/` is committed source-of-truth, not a
temporary artifact.

### 4. Run The Compatibility Suite

Minimum required checks:

```bash
bunx vitest run tests/compatibility-fixtures.test.js
bunx vitest run tests/model-api.test.js tests/compatibility-fixtures.test.js
```

Also run formatting on changed compatibility files:

```bash
bunx prettier --check scripts/generate-compat-fixtures.js tests/compatibility-fixtures.test.js tests/support/compatFixtures.js README.md package.json tests/compat/schema-1/**/*.yaml
```

## What The Compatibility Suite Enforces

[tests/compatibility-fixtures.test.js](../tests/compatibility-fixtures.test.js)
currently enforces:

- every command type from `listCommandTypes()` is represented in current-schema
  payload fixtures
- every current-schema command type has `minimal.yaml`
- every current-schema command type has `full.yaml`
- all archived payload fixtures still pass `validatePayload()`
- all archived state fixtures still pass `validateState()`
- all archived stream fixtures still replay through `processCommand()`
- replayed final state still validates
- final-state assertions allow additive object properties while still rejecting:
  - missing old fields
  - changed old values
  - changed array contents/order

## Freeze Rule

Old compatibility fixtures are historical truth.

- do not rewrite old schema fixtures just to satisfy new code
- only change an old fixture if it was factually wrong
- otherwise fix the model code or add a new schema archive

## Review Rule

A model PR should be considered incomplete if:

- a new command/state shape was added but compatibility fixtures were not updated
- `SCHEMA_VERSION` / package minor changed without a new schema archive
- compatibility tests were not run
- fixture generator changed but generated YAML was not regenerated and committed

Future changes should follow this document, not ad hoc judgment.
