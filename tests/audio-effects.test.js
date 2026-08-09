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

const createTransitionDefinition = () => ({
  type: "transition",
  prev: {
    fade: {
      duration: 600,
      easing: "easeInSine",
    },
  },
  next: {
    fade: {
      delay: 100,
      duration: 900,
      easing: "easeOutSine",
    },
  },
});

const createUpdateDefinition = () => ({
  type: "update",
  tween: {
    volume: {
      keyframes: [
        {
          startValue: 75,
          value: "target",
          duration: 500,
          easing: "easeInOutSine",
        },
      ],
    },
    pan: {
      keyframes: [
        {
          value: 2,
          duration: 100,
          relative: true,
        },
        {
          value: "target",
          duration: 400,
        },
      ],
    },
    playbackRate: {
      keyframes: [
        {
          value: "target",
          duration: 250,
        },
      ],
    },
  },
});

const createAudioEffectItem = ({
  id = "crossfade",
  audioEffect = createTransitionDefinition(),
} = {}) => ({
  id,
  type: "audioEffect",
  name: "Crossfade",
  audioEffect,
});

const createStateWithAudioEffect = ({ audioEffect } = {}) => {
  const state = createEmptyTestState();
  state.audioEffects.items.crossfade = createAudioEffectItem({ audioEffect });
  state.audioEffects.tree = [{ id: "crossfade", children: [] }];
  return state;
};

describe("audio effect state", () => {
  test("normalizes missing audio effect collection and tag scope", () => {
    const state = createEmptyTestState();
    delete state.audioEffects;
    delete state.tags.audioEffects;
    const snapshot = structuredClone(state);

    const normalized = normalizeState({ state });

    expect(normalized).toMatchObject({
      audioEffects: {
        items: {},
        tree: [],
      },
      tags: {
        audioEffects: {
          items: {},
          tree: [],
        },
      },
    });
    expect(state).toEqual(snapshot);
  });

  test("accepts transition and update definitions", () => {
    expect(validateState({ state: createStateWithAudioEffect() })).toEqual({
      valid: true,
    });
    expect(
      validateState({
        state: createStateWithAudioEffect({
          audioEffect: createUpdateDefinition(),
        }),
      }),
    ).toEqual({ valid: true });
  });

  test.each([
    [
      "a transition without a side",
      {
        type: "transition",
      },
      "must define prev or next",
    ],
    [
      "an empty update tween",
      {
        type: "update",
        tween: {},
      },
      "must contain at least one audio property",
    ],
    [
      "an update without an absolute target final keyframe",
      {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 50, duration: 100 }],
          },
        },
      },
      "final keyframe must use the absolute value 'target'",
    ],
    [
      "an out-of-range absolute pan",
      {
        type: "update",
        tween: {
          pan: {
            keyframes: [
              { value: 2, duration: 100 },
              { value: "target", duration: 100 },
            ],
          },
        },
      },
      "must be between -1 and 1",
    ],
  ])("rejects %s", (_name, audioEffect, message) => {
    const result = validateState({
      state: createStateWithAudioEffect({ audioEffect }),
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toContain(message);
  });
});

describe("audio effect commands", () => {
  test("validates folder, transition, and update create payloads", () => {
    for (const data of [
      {
        type: "folder",
        name: "BGM Effects",
      },
      {
        type: "audioEffect",
        name: "Crossfade",
        audioEffect: createTransitionDefinition(),
      },
      {
        type: "audioEffect",
        name: "Smooth Update",
        audioEffect: createUpdateDefinition(),
      },
    ]) {
      expect(
        validatePayload({
          type: "audioEffect.create",
          payload: {
            audioEffectId: "item-a",
            data,
          },
        }),
      ).toEqual({ valid: true });
    }
  });

  test("requires tags to exist in the audioEffects scope", () => {
    const result = validateAgainstState({
      state: createEmptyTestState(),
      command: {
        type: "audioEffect.create",
        payload: {
          audioEffectId: "crossfade",
          data: {
            type: "audioEffect",
            name: "Crossfade",
            tagIds: ["transition"],
            audioEffect: createTransitionDefinition(),
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("precondition");
    expect(result.error.message).toContain(
      "existing tag in scope 'audioEffects'",
    );
  });

  test("rejects audio effect fields when updating a folder", () => {
    const state = createEmptyTestState();
    state.audioEffects.items.folder = {
      id: "folder",
      type: "folder",
      name: "Folder",
    };
    state.audioEffects.tree = [{ id: "folder", children: [] }];

    const result = processCommand({
      state,
      command: {
        type: "audioEffect.update",
        payload: {
          audioEffectId: "folder",
          data: {
            audioEffect: createUpdateDefinition(),
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("precondition");
    expect(result.error.message).toBe(
      "folder audio effect items cannot update audio effect fields",
    );
  });

  test("applies create, update, move, and delete as an immutable sequence", () => {
    const steps = runCommandSequence({
      initialState: createEmptyTestState(),
      commands: [
        {
          type: "tag.create",
          payload: {
            scopeKey: "audioEffects",
            tagId: "transition",
            data: {
              type: "tag",
              name: "Transition",
            },
          },
        },
        {
          type: "audioEffect.create",
          payload: {
            audioEffectId: "folder",
            data: {
              type: "folder",
              name: "BGM Effects",
            },
          },
        },
        {
          type: "audioEffect.create",
          payload: {
            audioEffectId: "crossfade",
            parentId: "folder",
            data: {
              type: "audioEffect",
              name: "Crossfade",
              tagIds: ["transition"],
              audioEffect: createTransitionDefinition(),
            },
          },
        },
        {
          type: "audioEffect.update",
          payload: {
            audioEffectId: "crossfade",
            data: {
              name: "Smooth Update",
              tagIds: [],
              audioEffect: createUpdateDefinition(),
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
          type: "audioEffect.delete",
          payload: {
            audioEffectIds: ["folder", "crossfade"],
          },
        },
      ],
    });

    expect(steps[2].state.audioEffects.items.crossfade.tagIds).toEqual([
      "transition",
    ]);
    expect(steps[3].state.audioEffects.items.crossfade).toMatchObject({
      name: "Smooth Update",
      audioEffect: createUpdateDefinition(),
    });
    expect(steps[3].state.audioEffects.items.crossfade.tagIds).toBeUndefined();
    expect(steps[4].state.audioEffects.tree[0].id).toBe("crossfade");
    expect(steps[5].state.audioEffects).toEqual({
      items: {},
      tree: [],
    });
  });
});
