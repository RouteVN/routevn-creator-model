import { createEmptyTestState } from "./createEmptyTestState.js";

export const createStoryScenesState = () => {
  const state = createEmptyTestState();

  state.story.initialSceneId = "scene-a";
  state.scenes.items = {
    "scene-a": {
      id: "scene-a",
      type: "scene",
      name: "Intro",
    },
    "folder-prologue": {
      id: "folder-prologue",
      type: "folder",
      name: "Prologue",
    },
    "scene-b": {
      id: "scene-b",
      type: "scene",
      name: "Wake Up",
      position: {
        x: 100,
        y: 200,
      },
    },
  };
  state.scenes.tree = [
    {
      id: "scene-a",
      children: [],
    },
    {
      id: "folder-prologue",
      children: [
        {
          id: "scene-b",
          children: [],
        },
      ],
    },
  ];

  return state;
};
