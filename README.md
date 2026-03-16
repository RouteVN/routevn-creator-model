# RouteVN Creator Model

Shared RouteVN domain model package.

Repo rules and contribution expectations are in
[GUIDELINES.md](./GUIDELINES.md).

This repo is intended to be the single source of truth for:

- state validation
- command payload validation
- state-aware command preconditions
- command-to-state reduction

It is intentionally **not** responsible for:

- Insieme transport
- Insieme storage
- partition routing
- actors, tokens, client timestamps

Those stay in the client and server repos.

## Public API

```js
SCHEMA_VERSION;

validateState({ state });

validatePayload({ type, payload });

validateAgainstState({
  state,
  command: { type, payload },
});

processCommand({
  state,
  command: { type, payload },
});
```

`SCHEMA_VERSION` is the exported schema version constant for persisted command
compatibility.

Validation functions return:

```js
{
  valid: true;
}
```

or:

```js
{
  valid: false,
  error: {
    kind: "state" | "payload" | "precondition" | "invariant",
    code: "payload_validation_failed",
    message: "payload.data.foo is not allowed",
    path: "payload.data.foo", // only when available
    details: {}, // only when available
  },
}
```

`processCommand()` returns:

```js
{ valid: true, state: nextState }
```

Design rules:

- no classes
- pure functions whenever possible
- command payload shape is validated separately from state-aware preconditions
- `SCHEMA_VERSION` is the source of truth for persisted command schema versioning
- `processCommand()` is the authoritative state transition
- model state should contain project-owned runtime data only
- app-owned metadata like project id, name, and description should stay out of
  this package
- `project` may start empty; fields like `resolution` are optional until the
  model starts owning them

## File Structure

```text
src/
  index.js
  errors.js
  helpers.js
  model.js
tests/
  model-api.test.js
  command-direct-coverage.test.js
  project.create.spec.yaml
  story-and-scenes.spec.yaml
  scenes-advanced.spec.yaml
  sections-and-lines.spec.yaml
  images.spec.yaml
  sounds-and-videos.spec.yaml
  animations.spec.yaml
  fonts-and-colors.spec.yaml
  transforms-variables-textstyles.spec.yaml
  characters-and-layouts.spec.yaml
  state-validation.spec.yaml
  animations-drift.test.js
  command-sequences.test.js
```

## How This Maps To The Current Client Repo

Current RouteVN files:

- `src/internal/project/commands.js`
- `src/internal/project/state.js`

should map into this package like this:

- `src/errors.js`
  - internal domain error factories
- `src/helpers.js`
  - tiny pure shared helpers
- `src/model.js`
  - state validation
  - invariants
  - command definitions
  - payload validation
  - state-aware validation
  - reduction
- `src/index.js`
  - public exports only

`projection.js` should stay in the app repos for now. It is downstream of the
domain model and is still tied to current app/repository needs.

## Intended Usage

Client:

1. validate payload before submit when useful
2. optionally run `processCommand()` for optimistic apply
3. send to Insieme transport

Server:

1. validate payload at submit boundary
2. validate against current state before commit
3. commit event to storage
4. use `processCommand()` for authoritative projection

## Testing

This repo uses Bun + Vitest + Puty.

- runner: `bunx vitest run`
- package script: `bun run test`
- benchmark script: `bun run bench`
- YAML specs live in `tests/**/*.spec.yaml`
- JS sequence tests live in `tests/**/*.test.js`

There are 2 test styles:

1. Command contract specs
   - treat commands as pure functions
   - validate one call at a time
   - assert exact input/output or expected invalid result
   - include a direct command coverage matrix for the full public registry
   - examples:
     - [tests/command-direct-coverage.test.js](./tests/command-direct-coverage.test.js)
     - [tests/project.create.spec.yaml](./tests/project.create.spec.yaml)
     - [tests/story-and-scenes.spec.yaml](./tests/story-and-scenes.spec.yaml)
     - [tests/state-validation.spec.yaml](./tests/state-validation.spec.yaml)

2. Command sequence tests
   - apply a sequence of commands
   - assert the full state after each step
   - also assert the previous state was not mutated
   - use these for reducer flows that are easier to reason about as a tape
   - example:
     - [tests/command-sequences.test.js](./tests/command-sequences.test.js)

YAML Puty specs use [tests/support/putyApi.js](./tests/support/putyApi.js) as a
small adapter so the declarative `throws:` assertions can stay concise while the
real public API returns `{ valid: ... }` result objects.

## Current Scope

Currently implemented command types:

- `project.create`
- `story.update`
- `scene.create`
- `scene.update`
- `scene.delete`
- `scene.move`
- `section.create`
- `section.update`
- `section.delete`
- `section.move`
- `line.create`
- `line.update_actions`
- `line.delete`
- `line.move`
- `image.create`
- `image.update`
- `image.delete`
- `image.move`
- `sound.create`
- `sound.update`
- `sound.delete`
- `sound.move`
- `video.create`
- `video.update`
- `video.delete`
- `video.move`
- `animation.create`
- `animation.update`
- `animation.delete`
- `animation.move`
- `font.create`
- `font.update`
- `font.delete`
- `font.move`
- `color.create`
- `color.update`
- `color.delete`
- `color.move`
- `transform.create`
- `transform.update`
- `transform.delete`
- `transform.move`
- `variable.create`
- `variable.update`
- `variable.delete`
- `variable.move`
- `textStyle.create`
- `textStyle.update`
- `textStyle.delete`
- `textStyle.move`
- `character.create`
- `character.update`
- `character.delete`
- `character.move`
- `layout.create`
- `layout.update`
- `layout.delete`
- `layout.move`
- `character.sprite.create`
- `character.sprite.update`
- `character.sprite.delete`
- `character.sprite.move`
- `layout.element.create`
- `layout.element.update`
- `layout.element.delete`
- `layout.element.move`

The rest of the future command surface should be added only when full
validation, preconditions, reducer behavior, and tests are added together.
