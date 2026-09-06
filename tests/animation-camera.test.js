import { describe, expect, it } from "vitest";
import {
  processCommand,
  replayCommands,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const createTween = () =>
  Object.fromEntries(
    Object.entries({ x: 640, y: 360, scaleX: 1, scaleY: 1 }).map(
      ([key, value]) => [
        key,
        {
          initialValue: value,
          keyframes: [{ duration: 1000, value, easing: "linear" }],
        },
      ],
    ),
  );
const createData = () => ({
  type: "animation",
  name: "Camera One",
  cameraTracks: ["update"],
  animation: { type: "update", tween: createTween() },
});
const createCommand = (data = createData()) => ({
  type: "animation.create",
  payload: { animationId: "camera-one", data },
});
const updateCommand = (data) => ({
  type: "animation.update",
  payload: { animationId: "camera-one", data },
});

describe("animation Camera grouping", () => {
  it.each(["update", "prev", "next"])(
    "supports removing and restoring the %s Camera initial pose without changing keyframes",
    (side) => {
      const data = createData();
      data.cameraTracks = [side];
      if (side !== "update") {
        data.animation = {
          type: "transition",
          [side]: { tween: createTween() },
        };
      }
      const original = structuredClone(data.animation);
      const animation = structuredClone(original);
      const tween = side === "update" ? animation.tween : animation[side].tween;
      for (const track of Object.values(tween)) delete track.initialValue;
      const implicitData = { ...data, animation };
      expect(validatePayload(createCommand(implicitData))).toEqual({
        valid: true,
      });
      const initialState = createEmptyTestState();
      const commands = [createCommand(data), updateCommand({ animation })];
      const removed = replayCommands({ state: initialState, commands });
      expect(removed.valid).toBe(true);
      expect(validateState({ state: removed.state })).toEqual({ valid: true });
      expect(removed.state.animations.items["camera-one"].animation).toEqual(
        animation,
      );
      expect(removed.state.animations.items["camera-one"].cameraTracks).toEqual(
        [side],
      );
      const restored = processCommand({
        state: removed.state,
        command: updateCommand({ animation: original }),
      });
      expect(restored.valid).toBe(true);
      expect(restored.state.animations.items["camera-one"].animation).toEqual(
        original,
      );
    },
  );

  it("creates, edits, replays, and removes grouping without mutating prior state", () => {
    const initialState = createEmptyTestState();
    const commands = [
      createCommand(),
      updateCommand({ name: "Camera Two" }),
      updateCommand({ animation: { type: "update", tween: createTween() } }),
      updateCommand({ cameraTracks: [] }),
    ];
    let state = initialState;
    for (const [index, command] of commands.entries()) {
      const before = structuredClone(state);
      const result = processCommand({ state, command });
      expect(result.valid).toBe(true);
      expect(state).toEqual(before);
      state = result.state;
      const expected = createData();
      expected.id = "camera-one";
      if (index > 0) expected.name = "Camera Two";
      if (index === 3) expected.cameraTracks = [];
      const expectedState = structuredClone(initialState);
      expectedState.animations.items["camera-one"] = expected;
      expectedState.animations.tree = [{ id: "camera-one", children: [] }];
      expect(state).toEqual(expectedState);
      expect(validateState({ state })).toEqual({ valid: true });
    }
    expect(replayCommands({ state: initialState, commands })).toEqual({
      valid: true,
      state,
    });
  });

  it("does not infer grouping on legacy four-track animations", () => {
    const data = createData();
    delete data.cameraTracks;
    const result = processCommand({
      state: createEmptyTestState(),
      command: createCommand(data),
    });
    expect(result.valid).toBe(true);
    expect(result.state.animations.items["camera-one"]).not.toHaveProperty(
      "cameraTracks",
    );
  });

  it("accepts independently grouped transition sides", () => {
    for (const cameraTracks of [["prev"], ["next"], ["prev", "next"]]) {
      const data = createData();
      data.cameraTracks = cameraTracks;
      data.animation = {
        type: "transition",
        prev: { tween: createTween() },
        next: { tween: createTween() },
      };
      expect(validatePayload(createCommand(data))).toEqual({ valid: true });
      expect(
        processCommand({
          state: createEmptyTestState(),
          command: createCommand(data),
        }).valid,
      ).toBe(true);
    }
  });

  it.each([null, {}, "update", ["unknown"], ["update", "update"]])(
    "rejects malformed grouping %j in create and partial update payloads",
    (cameraTracks) => {
      const data = createData();
      data.cameraTracks = cameraTracks;
      expect(validatePayload(createCommand(data)).valid).toBe(false);
      expect(validatePayload(updateCommand({ cameraTracks })).valid).toBe(
        false,
      );
    },
  );

  const invalidEdits = [
    (data) => {
      data.cameraTracks = ["prev"];
    },
    (data) => {
      delete data.animation.tween.x;
    },
    (data) => {
      delete data.animation.tween.y.initialValue;
    },
    (data) => {
      data.animation.tween.y.keyframes.push({ duration: 1000, value: 360 });
    },
    (data) => {
      data.animation.tween.y.keyframes[0].duration = 500;
    },
    (data) => {
      data.animation.tween.y.keyframes[0].delay = 5;
    },
    (data) => {
      data.animation.tween.y.keyframes[0].easing = "easeInQuad";
    },
    (data) => {
      data.animation.tween.y.keyframes[0].relative = true;
    },
    (data) => {
      data.animation.tween.y.keyframes[0].startValue = 0;
    },
    (data) => {
      data.animation.tween.scaleX.initialValue = 0;
    },
    (data) => {
      data.animation.tween.scaleY.keyframes[0].value = -1;
    },
    (data) => {
      data.animation.tween.translateX = { keyframes: [] };
    },
    (data) => {
      data.animation.tween.x = { auto: { duration: 1000 } };
    },
  ];
  it.each(invalidEdits)(
    "rejects incompatible grouped data in payloads and snapshots",
    (edit) => {
      const data = createData();
      edit(data);
      expect(validatePayload(createCommand(data)).valid).toBe(false);
      const state = createEmptyTestState();
      state.animations.items["camera-one"] = { id: "camera-one", ...data };
      state.animations.tree = [{ id: "camera-one", children: [] }];
      expect(validateState({ state }).valid).toBe(false);
    },
  );

  it("checks partial edits against retained grouping and permits explicitly ungrouping", () => {
    const created = processCommand({
      state: createEmptyTestState(),
      command: createCommand(),
    });
    const animation = { type: "update", tween: { x: { keyframes: [] } } };
    const result = processCommand({
      state: created.state,
      command: updateCommand({ animation }),
    });
    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("precondition");
    expect(
      processCommand({
        state: created.state,
        command: updateCommand({ animation, cameraTracks: [] }),
      }).valid,
    ).toBe(true);
  });

  it("rejects grouping missing resources and folders", () => {
    const state = createEmptyTestState();
    expect(
      processCommand({ state, command: updateCommand({ cameraTracks: [] }) })
        .valid,
    ).toBe(false);
    const folder = processCommand({
      state,
      command: createCommand({ type: "folder", name: "Folder One" }),
    });
    expect(
      processCommand({
        state: folder.state,
        command: updateCommand({ cameraTracks: [] }),
      }).valid,
    ).toBe(false);
    expect(
      validatePayload(
        createCommand({ type: "folder", name: "Folder One", cameraTracks: [] }),
      ).valid,
    ).toBe(false);
  });
});
