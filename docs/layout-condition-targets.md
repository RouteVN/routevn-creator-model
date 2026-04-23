# Layout Condition Targets

## Summary

Layout conditions use a direct engine-facing `target` string.

This contract is used for:

- `conditionalOverrides[].when` in the creator model
- layout-editor visibility conditions in the client before they compile to
  `$when`

The goal is to avoid fake special ids such as `__autoMode` and to keep the
authored condition contract close to the engine render/template contract.

This contract is intentionally coupled to the engine layout template data,
not to engine store internals. Use:

- `autoMode`
- `skipMode`
- `isLineCompleted`
- `item.savedAt`
- `variables.*`

Do not use paths such as:

- `state.global.autoMode`
- `state.global.skipMode`

## Rule Shape

Current authored rule shape:

```js
{
  when: {
    target: string,
    op: "eq",
    value: string | number | boolean,
  },
  set: {
    textStyleId?: string,
    hoverTextStyleId?: string,
    clickTextStyleId?: string,
    imageId?: string,
    hoverImageId?: string,
    clickImageId?: string,
    hoverSoundId?: string,
    clickSoundId?: string,
    opacity?: number,
    anchorX?: number,
    anchorY?: number,
    visible?: boolean,
    textStyle?: {
      align?: "left" | "center" | "right",
    },
  },
}
```

Example:

```js
{
  when: {
    target: "autoMode",
    op: "eq",
    value: true,
  },
  set: {
    textStyleId: "text-style-auto",
    opacity: 0.7,
  },
}
```

Currently supported `set` keys are:

- `textStyleId`
- `hoverTextStyleId`
- `clickTextStyleId`
- `imageId`
- `hoverImageId`
- `clickImageId`
- `hoverSoundId`
- `clickSoundId`
- `opacity`
- `anchorX`
- `anchorY`
- `visible`
- `textStyle.align`

For `visible`, the client compiler folds the override into the element `$when`
expression instead of emitting a separate runtime `visible` property. This
keeps the authored interface simple while still allowing conditional show/hide
behavior.

## Allowed Targets

Currently supported target forms are:

- `autoMode`
- `skipMode`
- `isLineCompleted`
- `item.savedAt`
- `variables.someIdentifier`
- `variables["some-id"]`

## Runtime Targets

These map directly to engine layout template data:

- `autoMode`
- `skipMode`
- `isLineCompleted`

These values come from runtime state, not from the project variable catalog.

They are layout/template-facing names, not raw engine store paths.

## Variable Targets

Project or system variables use the `variables.*` namespace.

Preferred form when the variable id is a valid identifier:

```js
variables.playerMode;
```

Fallback form when the variable id is not dot-safe:

```js
variables["player-mode"];
```

Both are accepted by the current model validation.

## Save Slot Availability

Use:

```js
item.savedAt;
```

for save/load slot availability checks.

This is intentional.

Why:

- a save slot is considered occupied when it has saved state and timestamp data
- screenshot/image data is optional
- `image` can be missing even for a valid saved slot
- `savedAt` is the stable canonical occupancy signal in the engine save-slot
  contract

So availability checks must use:

- `item.savedAt == true` logically

and not:

- `item.image`

In practice, the client compiler treats this target specially:

- `target: "item.savedAt", value: true` compiles to `item.savedAt`
- `target: "item.savedAt", value: false` compiles to `!item.savedAt`

## Examples

Runtime state:

```js
{
  when: {
    target: "autoMode",
    op: "eq",
    value: true,
  },
}
```

```js
{
  when: {
    target: "skipMode",
    op: "eq",
    value: false,
  },
}
```

```js
{
  when: {
    target: "isLineCompleted",
    op: "eq",
    value: true,
  },
}
```

Save/load slot state:

```js
{
  when: {
    target: "item.savedAt",
    op: "eq",
    value: true,
  },
}
```

Variable state:

```js
{
  when: {
    target: "variables.playerMode",
    op: "eq",
    value: "alert",
  },
}
```

```js
{
  when: {
    target: 'variables["player-mode"]',
    op: "eq",
    value: "alert",
  },
}
```

## Notes

- This `target` string replaces the older overloaded `variableId` contract for
  layout-condition authoring.
- The creator model currently validates this `target` contract for
  `conditionalOverrides[].when`.
- Raw `$when` is still a string field in persisted layout element data.
- The long-term direction is to keep one shared target contract across model,
  client authoring, and engine template evaluation.
