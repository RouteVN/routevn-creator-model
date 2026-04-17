import { expect, test } from "vitest";

import { processCommand, replayCommands } from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";
import { deepFreeze } from "./support/deepFreeze.js";

const createEmptyNestedCollection = () => ({
  items: {},
  tree: [],
});

const createBootstrapState = () => {
  const state = createEmptyTestState();

  state.story.initialSceneId = "scene-intro";
  state.scenes.items = {
    "scene-intro": {
      id: "scene-intro",
      type: "scene",
      name: "Intro",
      sections: createEmptyNestedCollection(),
    },
    "folder-prologue": {
      id: "folder-prologue",
      type: "folder",
      name: "Prologue",
    },
  };
  state.scenes.tree = [
    {
      id: "scene-intro",
      children: [],
    },
    {
      id: "folder-prologue",
      children: [],
    },
  ];

  return state;
};

const createReplayCommandSequence = () => [
  {
    type: "project.create",
    payload: {
      state: createBootstrapState(),
    },
  },
  {
    type: "scene.create",
    payload: {
      sceneId: "scene-flashback",
      parentId: "folder-prologue",
      data: {
        name: "Flashback",
        description: "First playable memory",
        position: {
          x: 120,
          y: 80,
        },
      },
    },
  },
  {
    type: "scene.update",
    payload: {
      sceneId: "scene-flashback",
      data: {
        name: "Train Station",
        description: "Arrival platform scene",
        position: {
          x: 320,
        },
      },
    },
  },
  {
    type: "story.update",
    payload: {
      data: {
        initialSceneId: "scene-flashback",
      },
    },
  },
];

test("replayCommands produces the same final state as repeated processCommand calls", () => {
  const commands = createReplayCommandSequence();
  let repeatedState = createEmptyTestState();

  for (const command of commands) {
    const result = processCommand({
      state: repeatedState,
      command,
    });
    expect(result.valid).toBe(true);
    repeatedState = result.state;
  }

  const replayResult = replayCommands({
    state: createEmptyTestState(),
    commands,
  });

  expect(replayResult).toEqual({
    valid: true,
    state: repeatedState,
  });
});

test("replayCommands does not mutate the input state or command tape", () => {
  const initialState = deepFreeze(createEmptyTestState());
  const commands = deepFreeze(createReplayCommandSequence());

  const replayResult = replayCommands({
    state: initialState,
    commands,
  });

  expect(replayResult.valid).toBe(true);
  expect(initialState).toEqual(createEmptyTestState());
  expect(commands).toEqual(createReplayCommandSequence());
});

test("replayCommands reports the failing command index and type", () => {
  const replayResult = replayCommands({
    state: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createBootstrapState(),
        },
      },
      {
        type: "story.update",
        payload: {
          data: {
            initialSceneId: "scene-missing",
          },
        },
      },
    ],
  });

  expect(replayResult).toEqual({
    valid: false,
    error: {
      kind: "precondition",
      code: "precondition_validation_failed",
      message: "payload.data.initialSceneId must reference an existing scene",
      details: {
        commandIndex: 1,
        commandType: "story.update",
      },
    },
  });
});
