import { describe, expect, test } from "vitest";

import {
  normalizeState,
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";
import { runCommandSequence } from "./support/runCommandSequence.js";

const createAudioEffectCommand = (audioEffect, data = {}) => ({
  type: "audioEffect.create",
  payload: {
    audioEffectId: "audio-effect-a",
    data: {
      type: "audioEffect",
      name: "Audio Effect",
      audioEffect,
      ...data,
    },
  },
});

const expectInvalidDefinition = (audioEffect, message) => {
  const result = validatePayload(createAudioEffectCommand(audioEffect));

  expect(result.valid).toBe(false);
  expect(result.error.kind).toBe("payload");
  expect(result.error.message).toContain(message);
};

const createCrossfadeDefinition = () => ({
  type: "transition",
  prev: {
    volume: {
      keyframes: [
        {
          value: 40,
          duration: 200,
          easing: "easeOutSine",
        },
        {
          value: 0,
          duration: 400,
          easing: "easeInOutSine",
        },
      ],
    },
  },
  next: {
    volume: {
      initialValue: 0,
      keyframes: [
        {
          value: 60,
          duration: 300,
          easing: "easeOutSine",
        },
        {
          value: 100,
          duration: 600,
          easing: "easeInOutSine",
        },
      ],
    },
  },
});

const createSmoothVolumeDefinition = () => ({
  type: "update",
  tween: {
    volume: {
      keyframes: [
        {
          startValue: 80,
          value: 50,
          duration: 150,
          easing: "easeOutQuad",
        },
        {
          value: 30,
          duration: 350,
          easing: "easeInOutSine",
        },
      ],
    },
  },
});

const AUDIO_EFFECT_FINAL_VALUES = Object.freeze({
  volume: 50,
  pan: 0,
  playbackRate: 1,
});

describe("audio effect definitions", () => {
  test("accepts the crossfade transition contract", () => {
    expect(
      validatePayload(createAudioEffectCommand(createCrossfadeDefinition())),
    ).toEqual({ valid: true });
  });

  test("accepts volume, pan, and playback-rate transition properties", () => {
    expect(
      validatePayload(
        createAudioEffectCommand({
          type: "transition",
          prev: {
            volume: {
              keyframes: [{ value: 0, duration: 600 }],
            },
            pan: {
              keyframes: [{ value: -1, duration: 300 }],
            },
          },
          next: {
            volume: {
              initialValue: 0,
              keyframes: [{ value: 100, duration: 900 }],
            },
            playbackRate: {
              keyframes: [{ value: 1, duration: 500 }],
            },
          },
        }),
      ),
    ).toEqual({ valid: true });
  });

  test("accepts retained volume, pan, and playback-rate update tweens", () => {
    expect(
      validatePayload(
        createAudioEffectCommand({
          type: "update",
          tween: {
            volume: createSmoothVolumeDefinition().tween.volume,
            pan: {
              keyframes: [
                {
                  startValue: -1,
                  value: 0.5,
                  duration: 100,
                  delay: 25,
                  easing: "linear",
                },
                { value: 0, duration: 0 },
              ],
            },
            playbackRate: {
              keyframes: [
                {
                  startValue: -2,
                  value: -3,
                  duration: 50,
                  relative: true,
                },
                { value: 1, duration: 75 },
              ],
            },
          },
        }),
      ),
    ).toEqual({ valid: true });
  });

  test("accepts property initial values independently from keyframe start values", () => {
    expect(
      validatePayload(
        createAudioEffectCommand({
          type: "update",
          tween: {
            volume: {
              initialValue: 90,
              keyframes: [
                { startValue: 75, value: 50, duration: 100 },
                { value: 30, duration: 100 },
              ],
            },
            pan: {
              initialValue: -0.5,
              keyframes: [{ value: 0, duration: 100 }],
            },
            playbackRate: {
              initialValue: 1.25,
              keyframes: [{ value: 1, duration: 100 }],
            },
          },
        }),
      ),
    ).toEqual({ valid: true });

    expect(
      validatePayload(
        createAudioEffectCommand({
          type: "transition",
          prev: {
            volume: {
              initialValue: 90,
              keyframes: [{ startValue: 75, value: 0, duration: 100 }],
            },
          },
          next: {
            volume: {
              initialValue: 10,
              keyframes: [{ startValue: 25, value: 100, duration: 100 }],
            },
          },
        }),
      ),
    ).toEqual({ valid: true });
  });

  test.each([
    [
      "unknown definition keys",
      { ...createCrossfadeDefinition(), extra: true },
      ".extra is not allowed",
    ],
    ["a transition side", { type: "transition" }, ".prev or"],
    [
      "transition tween data",
      { ...createCrossfadeDefinition(), tween: {} },
      "cannot define tween",
    ],
    [
      "update transition sides",
      {
        ...createSmoothVolumeDefinition(),
        prev: createCrossfadeDefinition().prev,
      },
      "cannot define prev or next",
    ],
    ["an update tween", { type: "update" }, ".tween is required"],
    [
      "an empty update tween",
      { type: "update", tween: {} },
      "at least one audio property",
    ],
    [
      "unsupported tween properties",
      { type: "update", tween: { pitch: { keyframes: [] } } },
      "not a supported audio effect property",
    ],
    [
      "a transition property",
      { type: "transition", prev: {} },
      "at least one audio property",
    ],
    [
      "transition keyframes",
      { type: "transition", prev: { volume: {} } },
      ".keyframes is required",
    ],
    [
      "transition keyframe duration",
      {
        type: "transition",
        prev: { volume: { keyframes: [{ value: 0 }] } },
      },
      ".duration is required",
    ],
    [
      "non-negative transition timing",
      {
        type: "transition",
        prev: { volume: { keyframes: [{ value: 0, duration: -1 }] } },
      },
      "finite number >= 0",
    ],
    [
      "known easing names",
      {
        type: "transition",
        next: {
          volume: {
            keyframes: [{ value: 100, duration: 1, easing: "unknown" }],
          },
        },
      },
      "supported Route Graphics easing",
    ],
    [
      "non-empty transition keyframes",
      { type: "transition", prev: { volume: { keyframes: [] } } },
      "must be a non-empty array",
    ],
    [
      "bounded transition property values",
      {
        type: "transition",
        prev: {
          volume: { keyframes: [{ value: 101, duration: 1 }] },
        },
      },
      "between 0 and 100",
    ],
    [
      "an absolute final transition keyframe",
      {
        type: "transition",
        next: {
          volume: {
            keyframes: [{ value: 10, duration: 1, relative: true }],
          },
        },
      },
      "absolute numeric value",
    ],
    [
      "non-empty keyframes",
      { type: "update", tween: { volume: { keyframes: [] } } },
      "non-empty array",
    ],
    [
      "numeric keyframe values",
      {
        type: "update",
        tween: { volume: { keyframes: [{ value: "target", duration: 10 }] } },
      },
      "must be a finite number",
    ],
    [
      "an absolute final keyframe",
      {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 10, duration: 10, relative: true }],
          },
        },
      },
      "absolute numeric value",
    ],
    [
      "unknown tween config keys",
      {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 50, duration: 10 }],
            extra: 50,
          },
        },
      },
      ".extra is not allowed",
    ],
  ])("rejects definitions missing %s", (_label, definition, message) => {
    expectInvalidDefinition(definition, message);
  });

  test.each(["prev", "next"])(
    "accepts every supported transition property on %s",
    (side) => {
      expect(
        validatePayload(
          createAudioEffectCommand({
            type: "transition",
            [side]: {
              volume: { keyframes: [{ value: 35, duration: 100 }] },
              pan: { keyframes: [{ value: 0.5, duration: 100 }] },
              playbackRate: { keyframes: [{ value: 1.25, duration: 100 }] },
            },
          }),
        ),
      ).toEqual({ valid: true });
    },
  );

  test.each([
    ["volume", -1, "between 0 and 100"],
    ["volume", 101, "between 0 and 100"],
    ["pan", -1.1, "between -1 and 1"],
    ["pan", 1.1, "between -1 and 1"],
    ["playbackRate", -0.1, "greater than or equal to 0"],
  ])("enforces absolute %s bounds", (property, value, message) => {
    expectInvalidDefinition(
      {
        type: "update",
        tween: {
          [property]: {
            keyframes: [
              { startValue: value, value, duration: 1 },
              { value: AUDIO_EFFECT_FINAL_VALUES[property], duration: 1 },
            ],
          },
        },
      },
      message,
    );
  });

  test.each([
    ["volume", -1, "between 0 and 100"],
    ["volume", 101, "between 0 and 100"],
    ["pan", -1.1, "between -1 and 1"],
    ["pan", 1.1, "between -1 and 1"],
    ["playbackRate", -0.1, "greater than or equal to 0"],
  ])("enforces %s initialValue bounds", (property, initialValue, message) => {
    expectInvalidDefinition(
      {
        type: "update",
        tween: {
          [property]: {
            initialValue,
            keyframes: [
              { value: AUDIO_EFFECT_FINAL_VALUES[property], duration: 1 },
            ],
          },
        },
      },
      message,
    );
  });

  test("allows unbounded numeric deltas on relative keyframes", () => {
    for (const property of ["volume", "pan", "playbackRate"]) {
      expect(
        validatePayload(
          createAudioEffectCommand({
            type: "update",
            tween: {
              [property]: {
                keyframes: [
                  {
                    startValue: -1000,
                    value: 1000,
                    duration: 1,
                    relative: true,
                  },
                  {
                    value: AUDIO_EFFECT_FINAL_VALUES[property],
                    duration: 1,
                  },
                ],
              },
            },
          }),
        ),
      ).toEqual({ valid: true });
    }
  });
});

describe("audio effect persisted state", () => {
  test("normalizes the schema-13 collection and tag scope onto older states", () => {
    const state = createEmptyTestState();
    delete state.audioEffects;
    delete state.tags.audioEffects;

    expect(validateState({ state })).toEqual({ valid: true });

    const normalizedState = normalizeState({ state });
    expect(normalizedState.audioEffects).toEqual({ items: {}, tree: [] });
    expect(normalizedState.tags.audioEffects).toEqual({ items: {}, tree: [] });
    expect(state.audioEffects).toBeUndefined();
    expect(state.tags.audioEffects).toBeUndefined();
  });

  test("rejects mismatched ids, unknown wrapper fields, and non-folder parents", () => {
    const state = createEmptyTestState();
    state.audioEffects.items["audio-effect-a"] = {
      id: "different-id",
      type: "audioEffect",
      name: "Effect",
      audioEffect: createCrossfadeDefinition(),
    };
    state.audioEffects.tree = [{ id: "audio-effect-a", children: [] }];

    expect(validateState({ state }).error.message).toContain(
      "must match item key",
    );

    state.audioEffects.items["audio-effect-a"].id = "audio-effect-a";
    state.audioEffects.items["audio-effect-a"].preview = { unsupported: {} };
    expect(validateState({ state }).error.message).toContain(
      ".preview.unsupported is not allowed",
    );

    delete state.audioEffects.items["audio-effect-a"].preview;
    state.audioEffects.tree[0].children = [{ id: "child", children: [] }];
    state.audioEffects.items.child = {
      id: "child",
      type: "audioEffect",
      name: "Child",
      audioEffect: createCrossfadeDefinition(),
    };
    expect(validateState({ state }).error.message).toContain(
      "folder audio effect item",
    );
  });

  test("requires tag ids to exist in the audioEffects tag scope", () => {
    const state = createEmptyTestState();
    const command = createAudioEffectCommand(createCrossfadeDefinition(), {
      tagIds: ["smooth"],
    });

    expect(validatePayload(command)).toEqual({ valid: true });
    expect(validateAgainstState({ state, command }).error.message).toContain(
      "must reference an existing tag in scope 'audioEffects'",
    );
  });
});

test("replays audio effect create, update, move, tag cleanup, and subtree delete", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "tag.create",
        payload: {
          scopeKey: "audioEffects",
          tagId: "smooth",
          data: { type: "tag", name: "Smooth" },
        },
      },
      {
        type: "audioEffect.create",
        payload: {
          audioEffectId: "transitions",
          data: { type: "folder", name: "Transitions" },
        },
      },
      {
        type: "audioEffect.create",
        payload: {
          audioEffectId: "crossfade",
          parentId: "transitions",
          data: {
            type: "audioEffect",
            name: "Crossfade",
            description: "Fade between two BGM sources",
            tagIds: ["smooth"],
            audioEffect: createCrossfadeDefinition(),
          },
        },
      },
      {
        type: "audioEffect.update",
        payload: {
          audioEffectId: "crossfade",
          data: {
            name: "Smooth Volume Change",
            audioEffect: createSmoothVolumeDefinition(),
          },
        },
      },
      {
        type: "audioEffect.move",
        payload: {
          audioEffectId: "crossfade",
          parentId: null,
          position: "first",
        },
      },
      {
        type: "tag.delete",
        payload: {
          scopeKey: "audioEffects",
          tagIds: ["smooth"],
        },
      },
      {
        type: "audioEffect.move",
        payload: {
          audioEffectId: "crossfade",
          parentId: "transitions",
          position: "last",
        },
      },
      {
        type: "audioEffect.delete",
        payload: {
          audioEffectIds: ["transitions"],
        },
      },
    ],
  });

  expect(steps[2].state.audioEffects.items.crossfade.tagIds).toEqual([
    "smooth",
  ]);
  expect(steps[3].state.audioEffects.items.crossfade.audioEffect).toEqual(
    createSmoothVolumeDefinition(),
  );
  expect(steps[4].state.audioEffects.tree.map((node) => node.id)).toEqual([
    "crossfade",
    "transitions",
  ]);
  expect(steps[5].state.audioEffects.items.crossfade.tagIds).toBeUndefined();
  expect(steps[7].state.audioEffects).toEqual({ items: {}, tree: [] });
});

test("audioEffect.update replaces nested definitions atomically", () => {
  const state = createEmptyTestState();
  const created = processCommand({
    state,
    command: createAudioEffectCommand(createCrossfadeDefinition()),
  });
  expect(created.valid).toBe(true);

  const updated = processCommand({
    state: created.state,
    command: {
      type: "audioEffect.update",
      payload: {
        audioEffectId: "audio-effect-a",
        data: { audioEffect: createSmoothVolumeDefinition() },
      },
    },
  });

  expect(updated.valid).toBe(true);
  expect(
    updated.state.audioEffects.items["audio-effect-a"].audioEffect,
  ).toEqual(createSmoothVolumeDefinition());
  expect(
    updated.state.audioEffects.items["audio-effect-a"].audioEffect.prev,
  ).toBeUndefined();
});

test("audioEffect.create and audioEffect.update persist preview sounds", () => {
  const created = processCommand({
    state: createEmptyTestState(),
    command: createAudioEffectCommand(createCrossfadeDefinition(), {
      preview: {
        outgoing: { soundId: "sound-a" },
        incoming: { soundId: "sound-b" },
      },
    }),
  });

  expect(created.valid).toBe(true);
  expect(created.state.audioEffects.items["audio-effect-a"].preview).toEqual({
    outgoing: { soundId: "sound-a" },
    incoming: { soundId: "sound-b" },
  });

  const updated = processCommand({
    state: created.state,
    command: {
      type: "audioEffect.update",
      payload: {
        audioEffectId: "audio-effect-a",
        data: {
          preview: {
            outgoing: { soundId: "sound-c" },
            incoming: { soundId: "sound-d" },
          },
        },
      },
    },
  });

  expect(updated.valid).toBe(true);
  expect(updated.state.audioEffects.items["audio-effect-a"].preview).toEqual({
    outgoing: { soundId: "sound-c" },
    incoming: { soundId: "sound-d" },
  });
  expect(validateState({ state: updated.state })).toEqual({ valid: true });
});

test.each([
  ["a non-object preview", false, "must be an object"],
  [
    "an unsupported preview slot",
    { unsupported: {} },
    ".unsupported is not allowed",
  ],
  [
    "an unsupported preview field",
    { outgoing: { fileId: "sound-a" } },
    ".fileId is not allowed",
  ],
  [
    "an empty sound id",
    { incoming: { soundId: "" } },
    ".soundId must be a non-empty string",
  ],
])("audioEffect.create rejects %s", (_label, preview, message) => {
  const result = validatePayload(
    createAudioEffectCommand(createCrossfadeDefinition(), { preview }),
  );

  expect(result.valid).toBe(false);
  expect(result.error.kind).toBe("payload");
  expect(result.error.message).toContain(message);
});

test.each([
  ["definition", { audioEffect: undefined }],
  ["name", { name: undefined }],
])("audioEffect.update rejects an explicitly undefined %s", (_label, data) => {
  const created = processCommand({
    state: createEmptyTestState(),
    command: createAudioEffectCommand(createCrossfadeDefinition()),
  });
  expect(created.valid).toBe(true);

  const command = {
    type: "audioEffect.update",
    payload: {
      audioEffectId: "audio-effect-a",
      data,
    },
  };

  expect(validatePayload(command)).toMatchObject({
    valid: false,
    error: { kind: "payload" },
  });
  expect(validateAgainstState({ state: created.state, command })).toMatchObject(
    {
      valid: false,
      error: { kind: "payload" },
    },
  );
  expect(processCommand({ state: created.state, command })).toMatchObject({
    valid: false,
    error: { kind: "payload" },
  });
});
