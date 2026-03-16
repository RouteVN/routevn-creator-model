# Repo Guidelines

This repo is the formal RouteVN domain model package.

It exists to be the single shared authority for:
- state validation
- command payload validation
- state-aware command preconditions
- command reduction

It does not own:
- Insieme transport
- Insieme storage
- partition routing
- actor/session metadata
- app-level project entry fields such as project name, description, or icon

## Design Rules

- Use functions and factory functions only.
- Do not add classes.
- Prefer pure functions whenever possible.
- Keep validation, preconditions, and reduction separate:
  - `validateState`
  - `validatePayload`
  - `validateAgainstState`
  - `processCommand`
- `processCommand()` is the authoritative state transition:
  - validate current state
  - validate payload
  - validate against current state
  - reduce
  - validate resulting state/invariants

## Strictness Rules

- State and payload validation must reject unknown fields.
- A command is not considered supported until all 3 exist:
  - payload validator
  - state-aware precondition validator
  - reducer
- Do not silently accept partial command implementations.
- Prefer explicit failure over compatibility shims in this repo.
- Keep state shape strict and explicit.
- Keep command payloads strict and explicit.
- Do not put transport metadata into domain state or payloads.

## Public Surface

Keep the public API small:

```js
validateState({ state })

validatePayload({ type, payload })

validateAgainstState({
  state,
  command: { type, payload },
})

processCommand({
  state,
  command: { type, payload },
})
```

Do not expand the public API casually. If a helper is not needed by both client
and server integration, keep it internal.

## Implementation Layout

Keep the implementation flat.

- `src/errors.js`
- `src/helpers.js`
- `src/model.js`
- `src/index.js`

`src/model.js` is the main file. It should stay readable, but it is allowed to
own all model logic while the supported command surface is still small.

Shared helpers are acceptable when they remove repetition without hiding domain
meaning.

Do:
- share low-level helpers for common shape checks
- share tree helpers for collection placement logic

Do not:
- centralize all command rules into one giant generic validator
- create generic `entity.*` commands
- blur the difference between payload errors and state/precondition errors

## State Rules

- Collections are top-level plural roots.
- Collections own their own `items + tree`.
- Singleton roots such as `story` keep singleton settings only.
- The live state must contain domain data only.
- Do not store model version in the state tree.

## Testing Rules

Every supported command should have both:

1. Command contract tests
   - validate one command call at a time
   - cover positive behavior
   - cover negative schema failures
   - cover negative precondition failures

2. Command sequence tests
   - apply a sequence of commands
   - assert full state after each step
   - assert prior state was not mutated
   - use these for reducer tape behavior

Also add direct `validateState` coverage when:
- a new invariant is added
- a new collection/tree rule is added
- a snapshot shape rule changes

## Support Policy

- Only implemented command types should be treated as active runtime support.
- Do not keep placeholder command files or placeholder registry entries.
- If a command type is exposed publicly, it must be backed by real validation and
  reducer behavior.

## Change Checklist

When adding or changing a command:

1. Define exact payload shape.
2. Define exact state-aware preconditions.
3. Implement reducer behavior.
4. Tighten state/invariant validation if needed.
5. Add single-command contract tests.
6. Add sequence tests when the command participates in multi-step flows.
7. Update README or repo docs if the supported surface changed.

When changing state shape:

1. Update `validateState`.
2. Update invariant checks if needed.
3. Update bootstrap/test builders.
4. Add direct state-validation failure cases.
5. Update command tests that rely on the shape.
