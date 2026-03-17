import { expect, test } from "vitest";

import { processCommand } from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";
import { createStoryScenesState } from "./support/createStoryScenesState.js";
import { deepFreeze } from "./support/deepFreeze.js";
import { runCommandSequence } from "./support/runCommandSequence.js";

const cloneState = (state) => structuredClone(state);

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

const createSceneSectionLineBootstrapState = () => {
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
    "scene-outro": {
      id: "scene-outro",
      type: "scene",
      name: "Outro",
      sections: createEmptyNestedCollection(),
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
    {
      id: "scene-outro",
      children: [],
    },
  ];

  return state;
};

const createImageBootstrapState = () => createEmptyTestState();
const createMediaBootstrapState = () => createEmptyTestState();

test("applies a story and scenes command sequence with intermediate state snapshots", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
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
    ],
  });

  expect(steps).toHaveLength(4);

  expect(steps[0].state).toEqual(createBootstrapState());

  expect(steps[1].state).toEqual({
    ...createBootstrapState(),
    scenes: {
      items: {
        ...createBootstrapState().scenes.items,
        "scene-flashback": {
          id: "scene-flashback",
          type: "scene",
          name: "Flashback",
          position: {
            x: 120,
            y: 80,
          },
          sections: createEmptyNestedCollection(),
        },
      },
      tree: [
        {
          id: "scene-intro",
          children: [],
        },
        {
          id: "folder-prologue",
          children: [
            {
              id: "scene-flashback",
              children: [],
            },
          ],
        },
      ],
    },
  });

  expect(steps[2].state).toEqual({
    ...createBootstrapState(),
    scenes: {
      items: {
        ...createBootstrapState().scenes.items,
        "scene-flashback": {
          id: "scene-flashback",
          type: "scene",
          name: "Train Station",
          position: {
            x: 320,
            y: 80,
          },
          sections: createEmptyNestedCollection(),
        },
      },
      tree: [
        {
          id: "scene-intro",
          children: [],
        },
        {
          id: "folder-prologue",
          children: [
            {
              id: "scene-flashback",
              children: [],
            },
          ],
        },
      ],
    },
  });

  expect(steps[3].state).toEqual({
    ...createBootstrapState(),
    story: {
      initialSceneId: "scene-flashback",
    },
    scenes: {
      items: {
        ...createBootstrapState().scenes.items,
        "scene-flashback": {
          id: "scene-flashback",
          type: "scene",
          name: "Train Station",
          position: {
            x: 320,
            y: 80,
          },
          sections: createEmptyNestedCollection(),
        },
      },
      tree: [
        {
          id: "scene-intro",
          children: [],
        },
        {
          id: "folder-prologue",
          children: [
            {
              id: "scene-flashback",
              children: [],
            },
          ],
        },
      ],
    },
  });
});

test("processCommand does not mutate input state when a command fails preconditions", () => {
  const state = createStoryScenesState();
  const originalSnapshot = structuredClone(state);
  deepFreeze(state);

  expect(
    processCommand({
      state,
      command: {
        type: "story.update",
        payload: {
          data: {
            initialSceneId: "folder-prologue",
          },
        },
      },
    }),
  ).toEqual({
    valid: false,
    error: {
      kind: "precondition",
      code: "precondition_validation_failed",
      message: "payload.data.initialSceneId must reference a non-folder scene",
    },
  });

  expect(state).toEqual(originalSnapshot);
});

test("applies a scenes sections and lines command tape with intermediate state snapshots", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createSceneSectionLineBootstrapState(),
        },
      },
      {
        type: "section.create",
        payload: {
          sectionId: "section-intro-a",
          sceneId: "scene-intro",
          data: {
            name: "Setup",
          },
        },
      },
      {
        type: "section.create",
        payload: {
          sectionId: "section-intro-b",
          sceneId: "scene-intro",
          position: "after",
          positionTargetId: "section-intro-a",
          data: {
            name: "Payoff",
          },
        },
      },
      {
        type: "line.create",
        payload: {
          sectionId: "section-intro-a",
          lines: [
            {
              lineId: "line-1",
              data: {
                actions: {
                  say: "hello",
                },
              },
            },
            {
              lineId: "line-2",
              data: {
                actions: {
                  say: "bye",
                },
              },
            },
          ],
        },
      },
      {
        type: "line.update_actions",
        payload: {
          lineId: "line-1",
          data: {
            mood: "tense",
          },
        },
      },
      {
        type: "line.move",
        payload: {
          lineId: "line-2",
          toSectionId: "section-intro-b",
          position: "first",
        },
      },
      {
        type: "scene.move",
        payload: {
          sceneId: "scene-outro",
          position: "before",
          positionTargetId: "scene-intro",
        },
      },
      {
        type: "scene.delete",
        payload: {
          sceneIds: ["scene-intro"],
        },
      },
    ],
  });

  const expected0 = createSceneSectionLineBootstrapState();

  const expected1 = cloneState(expected0);
  expected1.scenes.items["scene-intro"].sections = {
    items: {
      "section-intro-a": {
        id: "section-intro-a",
        name: "Setup",
        lines: createEmptyNestedCollection(),
      },
    },
    tree: [
      {
        id: "section-intro-a",
        children: [],
      },
    ],
  };

  const expected2 = cloneState(expected1);
  expected2.scenes.items["scene-intro"].sections.items["section-intro-b"] = {
    id: "section-intro-b",
    name: "Payoff",
    lines: createEmptyNestedCollection(),
  };
  expected2.scenes.items["scene-intro"].sections.tree = [
    {
      id: "section-intro-a",
      children: [],
    },
    {
      id: "section-intro-b",
      children: [],
    },
  ];

  const expected3 = cloneState(expected2);
  expected3.scenes.items["scene-intro"].sections.items[
    "section-intro-a"
  ].lines = {
    items: {
      "line-1": {
        id: "line-1",
        actions: {
          say: "hello",
        },
      },
      "line-2": {
        id: "line-2",
        actions: {
          say: "bye",
        },
      },
    },
    tree: [
      {
        id: "line-1",
      },
      {
        id: "line-2",
      },
    ],
  };

  const expected4 = cloneState(expected3);
  expected4.scenes.items["scene-intro"].sections.items[
    "section-intro-a"
  ].lines.items["line-1"].actions = {
    say: "hello",
    mood: "tense",
  };

  const expected5 = cloneState(expected4);
  expected5.scenes.items["scene-intro"].sections.items[
    "section-intro-a"
  ].lines.tree = [
    {
      id: "line-1",
    },
  ];
  expected5.scenes.items["scene-intro"].sections.items[
    "section-intro-a"
  ].lines.items = {
    "line-1":
      expected5.scenes.items["scene-intro"].sections.items["section-intro-a"]
        .lines.items["line-1"],
  };
  expected5.scenes.items["scene-intro"].sections.items[
    "section-intro-b"
  ].lines = {
    items: {
      "line-2": {
        id: "line-2",
        actions: {
          say: "bye",
        },
      },
    },
    tree: [
      {
        id: "line-2",
      },
    ],
  };

  const expected6 = cloneState(expected5);
  expected6.scenes.tree = [
    {
      id: "scene-outro",
      children: [],
    },
    {
      id: "scene-intro",
      children: [],
    },
    {
      id: "folder-prologue",
      children: [],
    },
  ];

  const expected7 = cloneState(expected6);
  expected7.story.initialSceneId = "scene-outro";
  expected7.scenes.items = {
    "folder-prologue": {
      id: "folder-prologue",
      type: "folder",
      name: "Prologue",
    },
    "scene-outro": {
      id: "scene-outro",
      type: "scene",
      name: "Outro",
      sections: createEmptyNestedCollection(),
    },
  };
  expected7.scenes.tree = [
    {
      id: "scene-outro",
      children: [],
    },
    {
      id: "folder-prologue",
      children: [],
    },
  ];
  delete expected7.scenes.items["scene-intro"];

  expect(steps).toHaveLength(8);
  expect(steps[0].state).toEqual(expected0);
  expect(steps[1].state).toEqual(expected1);
  expect(steps[2].state).toEqual(expected2);
  expect(steps[3].state).toEqual(expected3);
  expect(steps[4].state).toEqual(expected4);
  expect(steps[5].state).toEqual(expected5);
  expect(steps[6].state).toEqual(expected6);
  expect(steps[7].state).toEqual(expected7);
});

test("applies an image command tape with intermediate state snapshots", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createImageBootstrapState(),
        },
      },
      {
        type: "image.create",
        payload: {
          imageId: "folder-art",
          data: {
            type: "folder",
            name: "Art",
          },
        },
      },
      {
        type: "image.create",
        payload: {
          imageId: "image-bg",
          parentId: "folder-art",
          data: {
            type: "image",
            name: "Background",
            thumbnailFileId: "thumb-bg",
            fileId: "file-bg",
            fileType: "image/png",
            width: 1920,
            height: 1080,
          },
        },
      },
      {
        type: "image.update",
        payload: {
          imageId: "image-bg",
          data: {
            description: "Opening shot",
            fileSize: 4096,
          },
        },
      },
      {
        type: "image.move",
        payload: {
          imageId: "image-bg",
          position: "before",
          positionTargetId: "folder-art",
        },
      },
      {
        type: "image.delete",
        payload: {
          imageIds: ["folder-art"],
        },
      },
    ],
  });

  const expected0 = createImageBootstrapState();

  const expected1 = cloneState(expected0);
  expected1.images.items = {
    "folder-art": {
      id: "folder-art",
      type: "folder",
      name: "Art",
    },
  };
  expected1.images.tree = [
    {
      id: "folder-art",
      children: [],
    },
  ];

  const expected2 = cloneState(expected1);
  expected2.images.items["image-bg"] = {
    id: "image-bg",
    type: "image",
    name: "Background",
    thumbnailFileId: "thumb-bg",
    fileId: "file-bg",
    fileType: "image/png",
    width: 1920,
    height: 1080,
  };
  expected2.images.tree = [
    {
      id: "folder-art",
      children: [
        {
          id: "image-bg",
          children: [],
        },
      ],
    },
  ];

  const expected3 = cloneState(expected2);
  expected3.images.items["image-bg"].description = "Opening shot";
  expected3.images.items["image-bg"].fileSize = 4096;

  const expected4 = cloneState(expected3);
  expected4.images.tree = [
    {
      id: "image-bg",
      children: [],
    },
    {
      id: "folder-art",
      children: [],
    },
  ];

  const expected5 = cloneState(expected4);
  expected5.images.items = {
    "image-bg": {
      id: "image-bg",
      type: "image",
      name: "Background",
      thumbnailFileId: "thumb-bg",
      fileId: "file-bg",
      fileType: "image/png",
      width: 1920,
      height: 1080,
      description: "Opening shot",
      fileSize: 4096,
    },
  };
  expected5.images.tree = [
    {
      id: "image-bg",
      children: [],
    },
  ];

  expect(steps).toHaveLength(6);
  expect(steps[0].state).toEqual(expected0);
  expect(steps[1].state).toEqual(expected1);
  expect(steps[2].state).toEqual(expected2);
  expect(steps[3].state).toEqual(expected3);
  expect(steps[4].state).toEqual(expected4);
  expect(steps[5].state).toEqual(expected5);
});

test("applies a sound and video command tape with intermediate state snapshots", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createMediaBootstrapState(),
        },
      },
      {
        type: "sound.create",
        payload: {
          soundId: "folder-audio",
          data: {
            type: "folder",
            name: "Audio",
          },
        },
      },
      {
        type: "sound.create",
        payload: {
          soundId: "sound-a",
          parentId: "folder-audio",
          data: {
            type: "sound",
            name: "Ambience",
            fileId: "file-a",
            waveformDataFileId: null,
          },
        },
      },
      {
        type: "sound.update",
        payload: {
          soundId: "sound-a",
          data: {
            duration: 42.5,
            description: "Night ambience",
          },
        },
      },
      {
        type: "video.create",
        payload: {
          videoId: "folder-cuts",
          data: {
            type: "folder",
            name: "Cuts",
          },
        },
      },
      {
        type: "video.create",
        payload: {
          videoId: "video-a",
          parentId: "folder-cuts",
          data: {
            type: "video",
            name: "Intro Cut",
            fileId: "file-v",
            thumbnailFileId: "thumb-v",
          },
        },
      },
      {
        type: "video.move",
        payload: {
          videoId: "video-a",
          position: "before",
          positionTargetId: "folder-cuts",
        },
      },
      {
        type: "sound.delete",
        payload: {
          soundIds: ["folder-audio"],
        },
      },
    ],
  });

  const expected0 = createMediaBootstrapState();

  const expected1 = cloneState(expected0);
  expected1.sounds.items = {
    "folder-audio": {
      id: "folder-audio",
      type: "folder",
      name: "Audio",
    },
  };
  expected1.sounds.tree = [
    {
      id: "folder-audio",
      children: [],
    },
  ];

  const expected2 = cloneState(expected1);
  expected2.sounds.items["sound-a"] = {
    id: "sound-a",
    type: "sound",
    name: "Ambience",
    fileId: "file-a",
    waveformDataFileId: null,
  };
  expected2.sounds.tree = [
    {
      id: "folder-audio",
      children: [
        {
          id: "sound-a",
          children: [],
        },
      ],
    },
  ];

  const expected3 = cloneState(expected2);
  expected3.sounds.items["sound-a"].duration = 42.5;
  expected3.sounds.items["sound-a"].description = "Night ambience";

  const expected4 = cloneState(expected3);
  expected4.videos.items = {
    "folder-cuts": {
      id: "folder-cuts",
      type: "folder",
      name: "Cuts",
    },
  };
  expected4.videos.tree = [
    {
      id: "folder-cuts",
      children: [],
    },
  ];

  const expected5 = cloneState(expected4);
  expected5.videos.items["video-a"] = {
    id: "video-a",
    type: "video",
    name: "Intro Cut",
    fileId: "file-v",
    thumbnailFileId: "thumb-v",
  };
  expected5.videos.tree = [
    {
      id: "folder-cuts",
      children: [
        {
          id: "video-a",
          children: [],
        },
      ],
    },
  ];

  const expected6 = cloneState(expected5);
  expected6.videos.tree = [
    {
      id: "video-a",
      children: [],
    },
    {
      id: "folder-cuts",
      children: [],
    },
  ];

  const expected7 = cloneState(expected6);
  expected7.sounds.items = {};
  expected7.sounds.tree = [];

  expect(steps).toHaveLength(8);
  expect(steps[0].state).toEqual(expected0);
  expect(steps[1].state).toEqual(expected1);
  expect(steps[2].state).toEqual(expected2);
  expect(steps[3].state).toEqual(expected3);
  expect(steps[4].state).toEqual(expected4);
  expect(steps[5].state).toEqual(expected5);
  expect(steps[6].state).toEqual(expected6);
  expect(steps[7].state).toEqual(expected7);
});

test("applies an animation command tape with intermediate state snapshots", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createMediaBootstrapState(),
        },
      },
      {
        type: "animation.create",
        payload: {
          animationId: "folder-motion",
          data: {
            type: "folder",
            name: "Motion",
          },
        },
      },
      {
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          parentId: "folder-motion",
          data: {
            type: "animation",
            name: "Slide In",
            animation: {
              type: "live",
              tween: {
                x: {
                  initialValue: 960,
                  keyframes: [
                    {
                      duration: 300,
                      value: -120,
                      easing: "linear",
                      relative: true,
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        type: "animation.update",
        payload: {
          animationId: "animation-a",
          data: {
            name: "Push Left",
            animation: {
              type: "replace",
              prev: {
                tween: {
                  translateX: {
                    initialValue: 0,
                    keyframes: [
                      {
                        duration: 500,
                        value: -1,
                        easing: "linear",
                      },
                    ],
                  },
                },
              },
              next: {
                tween: {
                  translateX: {
                    initialValue: 1,
                    keyframes: [
                      {
                        duration: 500,
                        value: 0,
                        easing: "linear",
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      {
        type: "animation.move",
        payload: {
          animationId: "animation-a",
          position: "before",
          positionTargetId: "folder-motion",
        },
      },
      {
        type: "animation.delete",
        payload: {
          animationIds: ["folder-motion"],
        },
      },
    ],
  });

  const expected0 = createMediaBootstrapState();

  const expected1 = cloneState(expected0);
  expected1.animations.items = {
    "folder-motion": {
      id: "folder-motion",
      type: "folder",
      name: "Motion",
    },
  };
  expected1.animations.tree = [
    {
      id: "folder-motion",
      children: [],
    },
  ];

  const expected2 = cloneState(expected1);
  expected2.animations.items["animation-a"] = {
    id: "animation-a",
    type: "animation",
    name: "Slide In",
    animation: {
      type: "live",
      tween: {
        x: {
          initialValue: 960,
          keyframes: [
            {
              duration: 300,
              value: -120,
              easing: "linear",
              relative: true,
            },
          ],
        },
      },
    },
  };
  expected2.animations.tree = [
    {
      id: "folder-motion",
      children: [
        {
          id: "animation-a",
          children: [],
        },
      ],
    },
  ];

  const expected3 = cloneState(expected2);
  expected3.animations.items["animation-a"].name = "Push Left";
  expected3.animations.items["animation-a"].animation = {
    type: "replace",
    prev: {
      tween: {
        translateX: {
          initialValue: 0,
          keyframes: [
            {
              duration: 500,
              value: -1,
              easing: "linear",
            },
          ],
        },
      },
    },
    next: {
      tween: {
        translateX: {
          initialValue: 1,
          keyframes: [
            {
              duration: 500,
              value: 0,
              easing: "linear",
            },
          ],
        },
      },
    },
  };

  const expected4 = cloneState(expected3);
  expected4.animations.tree = [
    {
      id: "animation-a",
      children: [],
    },
    {
      id: "folder-motion",
      children: [],
    },
  ];

  const expected5 = cloneState(expected4);
  expected5.animations.items = {
    "animation-a": {
      id: "animation-a",
      type: "animation",
      name: "Push Left",
      animation: {
        type: "replace",
        prev: {
          tween: {
            translateX: {
              initialValue: 0,
              keyframes: [
                {
                  duration: 500,
                  value: -1,
                  easing: "linear",
                },
              ],
            },
          },
        },
        next: {
          tween: {
            translateX: {
              initialValue: 1,
              keyframes: [
                {
                  duration: 500,
                  value: 0,
                  easing: "linear",
                },
              ],
            },
          },
        },
      },
    },
  };
  expected5.animations.tree = [
    {
      id: "animation-a",
      children: [],
    },
  ];

  expect(steps).toHaveLength(6);
  expect(steps[0].state).toEqual(expected0);
  expect(steps[1].state).toEqual(expected1);
  expect(steps[2].state).toEqual(expected2);
  expect(steps[3].state).toEqual(expected3);
  expect(steps[4].state).toEqual(expected4);
  expect(steps[5].state).toEqual(expected5);
});

test("applies a ui resources and layout command tape with intermediate state snapshots", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createEmptyTestState(),
        },
      },
      {
        type: "font.create",
        payload: {
          fontId: "font-ui",
          data: {
            type: "font",
            name: "UI Font",
            fileId: "file-font",
            fontFamily: "Suit",
          },
        },
      },
      {
        type: "color.create",
        payload: {
          colorId: "color-ui",
          data: {
            type: "color",
            name: "White",
            hex: "#ffffff",
          },
        },
      },
      {
        type: "textStyle.create",
        payload: {
          textStyleId: "style-ui",
          data: {
            type: "textStyle",
            name: "Dialogue",
            fontId: "font-ui",
            colorId: "color-ui",
            fontSize: 32,
            lineHeight: 1.4,
            fontWeight: "700",
          },
        },
      },
      {
        type: "character.create",
        payload: {
          characterId: "character-hero",
          data: {
            type: "character",
            name: "Hero",
            sprites: {
              items: {
                "folder-default": {
                  id: "folder-default",
                  type: "folder",
                  name: "Default",
                },
              },
              tree: [
                {
                  id: "folder-default",
                  children: [],
                },
              ],
            },
          },
        },
      },
      {
        type: "character.sprite.create",
        payload: {
          characterId: "character-hero",
          spriteId: "sprite-happy",
          parentId: "folder-default",
          data: {
            type: "image",
            name: "Happy",
            fileId: "file-happy",
            width: 512,
            height: 512,
          },
        },
      },
      {
        type: "layout.create",
        payload: {
          layoutId: "layout-dialogue",
          data: {
            type: "layout",
            name: "Dialogue",
            layoutType: "dialogue",
            elements: {
              items: {},
              tree: [],
            },
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-dialogue",
          elementId: "container-root",
          data: {
            type: "container",
            name: "Root",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-dialogue",
          elementId: "text-title",
          parentId: "container-root",
          data: {
            type: "text",
            name: "Title",
            x: 10,
            y: 12,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Hello",
            textStyleId: "style-ui",
          },
        },
      },
      {
        type: "textStyle.update",
        payload: {
          textStyleId: "style-ui",
          data: {
            previewText: "Hello",
            strokeWidth: 2,
          },
        },
      },
      {
        type: "character.update",
        payload: {
          characterId: "character-hero",
          data: {
            description: "Lead actor",
            shortcut: "1",
          },
        },
      },
      {
        type: "character.sprite.update",
        payload: {
          characterId: "character-hero",
          spriteId: "sprite-happy",
          data: {
            name: "Happy Smile",
            width: 640,
          },
        },
      },
      {
        type: "character.sprite.move",
        payload: {
          characterId: "character-hero",
          spriteId: "sprite-happy",
          position: "before",
          positionTargetId: "folder-default",
        },
      },
      {
        type: "transform.create",
        payload: {
          transformId: "transform-camera",
          data: {
            type: "transform",
            name: "Camera",
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            anchorX: 0,
            anchorY: 0,
            rotation: 0,
          },
        },
      },
      {
        type: "transform.update",
        payload: {
          transformId: "transform-camera",
          data: {
            x: 320,
            y: 180,
          },
        },
      },
      {
        type: "variable.create",
        payload: {
          variableId: "variable-score",
          data: {
            type: "number",
            name: "Score",
            scope: "context",
            default: 0,
            value: 0,
          },
        },
      },
      {
        type: "variable.update",
        payload: {
          variableId: "variable-score",
          data: {
            name: "Total Score",
            value: 10,
          },
        },
      },
      {
        type: "layout.update",
        payload: {
          layoutId: "layout-dialogue",
          data: {
            name: "Dialogue Main",
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-dialogue",
          elementId: "text-subtitle",
          parentId: "container-root",
          data: {
            type: "text",
            name: "Subtitle",
            x: 20,
            y: 52,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Sub",
            textStyleId: "style-ui",
          },
        },
      },
      {
        type: "layout.element.update",
        payload: {
          layoutId: "layout-dialogue",
          elementId: "text-title",
          data: {
            opacity: 0.5,
            text: "Welcome",
          },
        },
      },
      {
        type: "layout.element.move",
        payload: {
          layoutId: "layout-dialogue",
          elementId: "text-title",
          parentId: "container-root",
          position: "after",
          positionTargetId: "text-subtitle",
        },
      },
      {
        type: "layout.element.delete",
        payload: {
          layoutId: "layout-dialogue",
          elementIds: ["text-subtitle"],
        },
      },
    ],
  });

  const expected0 = createEmptyTestState();

  const expected1 = cloneState(expected0);
  expected1.fonts.items = {
    "font-ui": {
      id: "font-ui",
      type: "font",
      name: "UI Font",
      fileId: "file-font",
      fontFamily: "Suit",
    },
  };
  expected1.fonts.tree = [{ id: "font-ui", children: [] }];

  const expected2 = cloneState(expected1);
  expected2.colors.items = {
    "color-ui": {
      id: "color-ui",
      type: "color",
      name: "White",
      hex: "#ffffff",
    },
  };
  expected2.colors.tree = [{ id: "color-ui", children: [] }];

  const expected3 = cloneState(expected2);
  expected3.textStyles.items = {
    "style-ui": {
      id: "style-ui",
      type: "textStyle",
      name: "Dialogue",
      fontId: "font-ui",
      colorId: "color-ui",
      fontSize: 32,
      lineHeight: 1.4,
      fontWeight: "700",
    },
  };
  expected3.textStyles.tree = [{ id: "style-ui", children: [] }];

  const expected4 = cloneState(expected3);
  expected4.characters.items = {
    "character-hero": {
      id: "character-hero",
      type: "character",
      name: "Hero",
      sprites: {
        items: {
          "folder-default": {
            id: "folder-default",
            type: "folder",
            name: "Default",
          },
        },
        tree: [{ id: "folder-default", children: [] }],
      },
    },
  };
  expected4.characters.tree = [{ id: "character-hero", children: [] }];

  const expected5 = cloneState(expected4);
  expected5.characters.items["character-hero"].sprites = {
    items: {
      "folder-default": {
        id: "folder-default",
        type: "folder",
        name: "Default",
      },
      "sprite-happy": {
        id: "sprite-happy",
        type: "image",
        name: "Happy",
        fileId: "file-happy",
        width: 512,
        height: 512,
      },
    },
    tree: [
      {
        id: "folder-default",
        children: [{ id: "sprite-happy", children: [] }],
      },
    ],
  };

  const expected6 = cloneState(expected5);
  expected6.layouts.items = {
    "layout-dialogue": {
      id: "layout-dialogue",
      type: "layout",
      name: "Dialogue",
      layoutType: "dialogue",
      elements: {
        items: {},
        tree: [],
      },
    },
  };
  expected6.layouts.tree = [{ id: "layout-dialogue", children: [] }];

  const expected7 = cloneState(expected6);
  expected7.layouts.items["layout-dialogue"].elements = {
    items: {
      "container-root": {
        id: "container-root",
        type: "container",
        name: "Root",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
    },
    tree: [{ id: "container-root", children: [] }],
  };

  const expected8 = cloneState(expected7);
  expected8.layouts.items["layout-dialogue"].elements = {
    items: {
      "container-root": {
        id: "container-root",
        type: "container",
        name: "Root",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
      "text-title": {
        id: "text-title",
        type: "text",
        name: "Title",
        x: 10,
        y: 12,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        text: "Hello",
        textStyleId: "style-ui",
      },
    },
    tree: [
      {
        id: "container-root",
        children: [{ id: "text-title", children: [] }],
      },
    ],
  };

  const expected9 = cloneState(expected8);
  expected9.textStyles.items["style-ui"].previewText = "Hello";
  expected9.textStyles.items["style-ui"].strokeWidth = 2;

  const expected10 = cloneState(expected9);
  expected10.characters.items["character-hero"].description = "Lead actor";
  expected10.characters.items["character-hero"].shortcut = "1";

  const expected11 = cloneState(expected10);
  expected11.characters.items["character-hero"].sprites.items[
    "sprite-happy"
  ].name = "Happy Smile";
  expected11.characters.items["character-hero"].sprites.items[
    "sprite-happy"
  ].width = 640;

  const expected12 = cloneState(expected11);
  expected12.characters.items["character-hero"].sprites.tree = [
    {
      id: "sprite-happy",
      children: [],
    },
    {
      id: "folder-default",
      children: [],
    },
  ];

  const expected13 = cloneState(expected12);
  expected13.transforms.items = {
    "transform-camera": {
      id: "transform-camera",
      type: "transform",
      name: "Camera",
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
    },
  };
  expected13.transforms.tree = [{ id: "transform-camera", children: [] }];

  const expected14 = cloneState(expected13);
  expected14.transforms.items["transform-camera"].x = 320;
  expected14.transforms.items["transform-camera"].y = 180;

  const expected15 = cloneState(expected14);
  expected15.variables.items = {
    "variable-score": {
      id: "variable-score",
      type: "number",
      name: "Score",
      scope: "context",
      default: 0,
      value: 0,
    },
  };
  expected15.variables.tree = [{ id: "variable-score", children: [] }];

  const expected16 = cloneState(expected15);
  expected16.variables.items["variable-score"].name = "Total Score";
  expected16.variables.items["variable-score"].value = 10;

  const expected17 = cloneState(expected16);
  expected17.layouts.items["layout-dialogue"].name = "Dialogue Main";

  const expected18 = cloneState(expected17);
  expected18.layouts.items["layout-dialogue"].elements.items["text-subtitle"] =
    {
      id: "text-subtitle",
      type: "text",
      name: "Subtitle",
      x: 20,
      y: 52,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      text: "Sub",
      textStyleId: "style-ui",
    };
  expected18.layouts.items["layout-dialogue"].elements.tree = [
    {
      id: "container-root",
      children: [
        { id: "text-title", children: [] },
        { id: "text-subtitle", children: [] },
      ],
    },
  ];

  const expected19 = cloneState(expected18);
  expected19.layouts.items["layout-dialogue"].elements.items[
    "text-title"
  ].opacity = 0.5;
  expected19.layouts.items["layout-dialogue"].elements.items[
    "text-title"
  ].text = "Welcome";

  const expected20 = cloneState(expected19);
  expected20.layouts.items["layout-dialogue"].elements.tree = [
    {
      id: "container-root",
      children: [
        { id: "text-subtitle", children: [] },
        { id: "text-title", children: [] },
      ],
    },
  ];

  const expected21 = cloneState(expected20);
  delete expected21.layouts.items["layout-dialogue"].elements.items[
    "text-subtitle"
  ];
  expected21.layouts.items["layout-dialogue"].elements.tree = [
    {
      id: "container-root",
      children: [{ id: "text-title", children: [] }],
    },
  ];

  expect(steps).toHaveLength(22);
  expect(steps[0].state).toEqual(expected0);
  expect(steps[1].state).toEqual(expected1);
  expect(steps[2].state).toEqual(expected2);
  expect(steps[3].state).toEqual(expected3);
  expect(steps[4].state).toEqual(expected4);
  expect(steps[5].state).toEqual(expected5);
  expect(steps[6].state).toEqual(expected6);
  expect(steps[7].state).toEqual(expected7);
  expect(steps[8].state).toEqual(expected8);
  expect(steps[9].state).toEqual(expected9);
  expect(steps[10].state).toEqual(expected10);
  expect(steps[11].state).toEqual(expected11);
  expect(steps[12].state).toEqual(expected12);
  expect(steps[13].state).toEqual(expected13);
  expect(steps[14].state).toEqual(expected14);
  expect(steps[15].state).toEqual(expected15);
  expect(steps[16].state).toEqual(expected16);
  expect(steps[17].state).toEqual(expected17);
  expect(steps[18].state).toEqual(expected18);
  expect(steps[19].state).toEqual(expected19);
  expect(steps[20].state).toEqual(expected20);
  expect(steps[21].state).toEqual(expected21);
});

test("applies a font and color command tape with intermediate state snapshots", () => {
  const steps = runCommandSequence({
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createMediaBootstrapState(),
        },
      },
      {
        type: "font.create",
        payload: {
          fontId: "folder-fonts",
          data: {
            type: "folder",
            name: "Fonts",
          },
        },
      },
      {
        type: "font.create",
        payload: {
          fontId: "font-a",
          parentId: "folder-fonts",
          data: {
            type: "font",
            name: "Display",
            fileId: "file-font",
            fontFamily: "Fraunces",
          },
        },
      },
      {
        type: "font.update",
        payload: {
          fontId: "font-a",
          data: {
            fileSize: 2048,
            fontFamily: "Fraunces Soft",
          },
        },
      },
      {
        type: "color.create",
        payload: {
          colorId: "folder-palette",
          data: {
            type: "folder",
            name: "Palette",
          },
        },
      },
      {
        type: "color.create",
        payload: {
          colorId: "color-a",
          parentId: "folder-palette",
          data: {
            type: "color",
            name: "Primary",
            hex: "#112233",
          },
        },
      },
      {
        type: "color.move",
        payload: {
          colorId: "color-a",
          position: "before",
          positionTargetId: "folder-palette",
        },
      },
      {
        type: "font.delete",
        payload: {
          fontIds: ["folder-fonts"],
        },
      },
      {
        type: "color.update",
        payload: {
          colorId: "color-a",
          data: {
            name: "Primary Dark",
            hex: "#223344",
          },
        },
      },
    ],
  });

  const expected0 = createMediaBootstrapState();

  const expected1 = cloneState(expected0);
  expected1.fonts.items = {
    "folder-fonts": {
      id: "folder-fonts",
      type: "folder",
      name: "Fonts",
    },
  };
  expected1.fonts.tree = [
    {
      id: "folder-fonts",
      children: [],
    },
  ];

  const expected2 = cloneState(expected1);
  expected2.fonts.items["font-a"] = {
    id: "font-a",
    type: "font",
    name: "Display",
    fileId: "file-font",
    fontFamily: "Fraunces",
  };
  expected2.fonts.tree = [
    {
      id: "folder-fonts",
      children: [
        {
          id: "font-a",
          children: [],
        },
      ],
    },
  ];

  const expected3 = cloneState(expected2);
  expected3.fonts.items["font-a"].fileSize = 2048;
  expected3.fonts.items["font-a"].fontFamily = "Fraunces Soft";

  const expected4 = cloneState(expected3);
  expected4.colors.items = {
    "folder-palette": {
      id: "folder-palette",
      type: "folder",
      name: "Palette",
    },
  };
  expected4.colors.tree = [
    {
      id: "folder-palette",
      children: [],
    },
  ];

  const expected5 = cloneState(expected4);
  expected5.colors.items["color-a"] = {
    id: "color-a",
    type: "color",
    name: "Primary",
    hex: "#112233",
  };
  expected5.colors.tree = [
    {
      id: "folder-palette",
      children: [
        {
          id: "color-a",
          children: [],
        },
      ],
    },
  ];

  const expected6 = cloneState(expected5);
  expected6.colors.tree = [
    {
      id: "color-a",
      children: [],
    },
    {
      id: "folder-palette",
      children: [],
    },
  ];

  const expected7 = cloneState(expected6);
  expected7.fonts.items = {};
  expected7.fonts.tree = [];

  const expected8 = cloneState(expected7);
  expected8.colors.items["color-a"].name = "Primary Dark";
  expected8.colors.items["color-a"].hex = "#223344";

  expect(steps).toHaveLength(9);
  expect(steps[0].state).toEqual(expected0);
  expect(steps[1].state).toEqual(expected1);
  expect(steps[2].state).toEqual(expected2);
  expect(steps[3].state).toEqual(expected3);
  expect(steps[4].state).toEqual(expected4);
  expect(steps[5].state).toEqual(expected5);
  expect(steps[6].state).toEqual(expected6);
  expect(steps[7].state).toEqual(expected7);
  expect(steps[8].state).toEqual(expected8);
});
