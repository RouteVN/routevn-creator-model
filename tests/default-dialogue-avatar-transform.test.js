import { expect, test } from "vitest";
import {
  processCommand,
  replayCommands,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const command = (transformId) => ({
  type: "project.set_default_dialogue_avatar_transform",
  payload: { transformId },
});
const createState = () => {
  const state = createEmptyTestState();
  for (const id of ["transform-one", "transform-two"]) {
    state.transforms.items[id] = {
      id,
      type: "transform",
      name: id,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
    };
  }
  state.transforms.items.folder = {
    id: "folder",
    type: "folder",
    name: "Folder One",
  };
  state.transforms.tree = [
    { id: "transform-one", children: [] },
    { id: "folder", children: [{ id: "transform-two", children: [] }] },
  ];
  return state;
};

test.each([null, "transform-one"])(
  "default transform command accepts %s",
  (id) => {
    expect(validatePayload(command(id))).toEqual({ valid: true });
    expect(
      validateAgainstState({ state: createState(), command: command(id) }),
    ).toEqual({ valid: true });
  },
);

test.each([
  {},
  { transformId: "" },
  { transformId: 1 },
  { transformId: [] },
  { transformId: undefined },
  { transformId: null, extra: true },
])("default transform command rejects invalid payload %j", (payload) => {
  expect(validatePayload({ type: command(null).type, payload }).valid).toBe(
    false,
  );
});

test.each(["missing", "folder"])(
  "default transform rejects reference %s",
  (id) => {
    expect(
      validateAgainstState({ state: createState(), command: command(id) })
        .valid,
    ).toBe(false);
  },
);

test.each([null, "", 1, [], "missing", "folder"])(
  "state rejects invalid default %j",
  (id) => {
    const state = createState();
    state.project.defaultDialogueAvatarTransformId = id;
    expect(validateState({ state }).valid).toBe(false);
  },
);

test("state accepts absent and existing default references", () => {
  const state = createState();
  expect(validateState({ state })).toEqual({ valid: true });
  state.project.defaultDialogueAvatarTransformId = "transform-one";
  expect(validateState({ state })).toEqual({ valid: true });
});

test("set, replace, clear and recursive deletion preserve full state and replay", () => {
  const initialState = createState();
  let state = initialState;
  let expected = structuredClone(state);
  const commands = [];
  const step = (nextCommand, updateExpected) => {
    const before = structuredClone(state);
    commands.push(nextCommand);
    updateExpected(expected);
    const result = processCommand({ state, command: nextCommand });
    expect(result.valid).toBe(true);
    expect(result.state).toEqual(expected);
    expect(state).toEqual(before);
    state = result.state;
  };
  step(command("transform-one"), (s) => {
    s.project.defaultDialogueAvatarTransformId = "transform-one";
  });
  step(command("transform-two"), (s) => {
    s.project.defaultDialogueAvatarTransformId = "transform-two";
  });
  step(command(null), (s) => {
    delete s.project.defaultDialogueAvatarTransformId;
  });
  step(command(null), () => {});
  step(command("transform-two"), (s) => {
    s.project.defaultDialogueAvatarTransformId = "transform-two";
  });
  step(
    {
      type: "transform.update",
      payload: { transformId: "transform-two", data: { name: "Renamed" } },
    },
    (s) => {
      s.transforms.items["transform-two"].name = "Renamed";
    },
  );
  step(
    { type: "transform.delete", payload: { transformIds: ["transform-one"] } },
    (s) => {
      delete s.transforms.items["transform-one"];
      s.transforms.tree.shift();
    },
  );
  step(
    { type: "transform.delete", payload: { transformIds: ["folder"] } },
    (s) => {
      delete s.project.defaultDialogueAvatarTransformId;
      delete s.transforms.items.folder;
      delete s.transforms.items["transform-two"];
      s.transforms.tree = [];
    },
  );
  const replay = replayCommands({ state: initialState, commands });
  expect(replay.valid).toBe(true);
  expect(replay.state).toEqual(expected);
});

test("deleting the selected transform clears the default", () => {
  const state = createState();
  state.project.defaultDialogueAvatarTransformId = "transform-one";
  const result = processCommand({
    state,
    command: {
      type: "transform.delete",
      payload: { transformIds: ["transform-one"] },
    },
  });
  expect(result.valid).toBe(true);
  expect(result.state.project).not.toHaveProperty(
    "defaultDialogueAvatarTransformId",
  );
  expect(state.project.defaultDialogueAvatarTransformId).toBe("transform-one");
});

test("moving and copying transforms do not replace the default", () => {
  const state = createState();
  state.project.defaultDialogueAvatarTransformId = "transform-one";
  const moved = processCommand({
    state,
    command: {
      type: "transform.move",
      payload: {
        transformId: "transform-one",
        parentId: "folder",
        position: "last",
      },
    },
  });
  expect(moved.valid).toBe(true);
  expect(moved.state.project).toEqual(state.project);
  const { id, ...data } = moved.state.transforms.items["transform-one"];
  const copied = processCommand({
    state: moved.state,
    command: {
      type: "transform.create",
      payload: { transformId: `${id}-copy`, data },
    },
  });
  expect(copied.valid).toBe(true);
  expect(copied.state.project).toEqual(state.project);
  expect(validateState({ state: copied.state })).toEqual({ valid: true });
});
