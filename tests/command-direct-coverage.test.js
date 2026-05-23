import { expect, test } from "vitest";

import {
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { listCommandTypes } from "../src/model.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";
import { expectValidation } from "./support/expectValidation.js";

const clone = (value) => structuredClone(value);

const createTreeNode = (id, children = []) => ({
  id,
  children,
});

const createEmptyNestedCollection = () => ({
  items: {},
  tree: [],
});

const createFileItem = ({
  id,
  type = "image",
  mimeType = "application/octet-stream",
  size = 1,
  sha256,
}) => {
  if (type === "folder") {
    return {
      id,
      type: "folder",
      name: id,
    };
  }

  return {
    id,
    mimeType,
    size,
    sha256: sha256 ?? `${id}-sha256`,
  };
};

const withFiles = (state, files) => {
  for (const file of files) {
    state.files.items[file.id] = createFileItem(file);
    if (!state.files.tree.find((node) => node.id === file.id)) {
      state.files.tree.push(createTreeNode(file.id));
    }
  }
  return state;
};

const getSceneSection = (state, sceneId, sectionId) =>
  state.scenes.items[sceneId].sections.items[sectionId];

const createCollectionState = ({
  collectionKey,
  items,
  tree,
  decorateState,
}) => {
  const state = createEmptyTestState();
  state[collectionKey] = {
    items,
    tree,
  };
  return decorateState ? decorateState(state) : state;
};

const withFontAndColorRefs = (state) => {
  withFiles(state, [
    { id: "file-font-ui", type: "font", mimeType: "font/ttf" },
  ]);
  state.fonts.items["font-ui"] = {
    id: "font-ui",
    type: "font",
    name: "UI Font",
    fileId: "file-font-ui",
    fontFamily: "Suit",
  };
  state.fonts.tree = [createTreeNode("font-ui")];

  state.colors.items["color-ui"] = {
    id: "color-ui",
    type: "color",
    name: "White",
    hex: "#ffffff",
  };
  state.colors.tree = [createTreeNode("color-ui")];

  return state;
};

const withTextStyleRefs = (state) => {
  withFontAndColorRefs(state);
  state.textStyles.items["text-style-ui"] = {
    id: "text-style-ui",
    type: "textStyle",
    name: "UI Style",
    fontId: "font-ui",
    colorId: "color-ui",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.tree = [createTreeNode("text-style-ui")];
  return state;
};

const withImageFileRefs = (state) =>
  withFiles(state, [
    { id: "file-image", type: "image", mimeType: "image/png" },
    {
      id: "thumb-image",
      type: "image-thumbnail",
      mimeType: "image/webp",
    },
  ]);

const withSoundFileRefs = (state) =>
  withFiles(state, [
    { id: "file-sound", type: "audio", mimeType: "audio/mpeg" },
  ]);

const withVideoFileRefs = (state) =>
  withFiles(state, [
    { id: "file-video", type: "video", mimeType: "video/mp4" },
    {
      id: "thumb-video",
      type: "video-thumbnail",
      mimeType: "image/jpeg",
    },
  ]);

const withTagScope = (state, scopeKey, tags) => {
  state.tags[scopeKey] ??= {
    items: {},
    tree: [],
  };

  for (const tag of tags) {
    state.tags[scopeKey].items[tag.id] = clone(tag);
    state.tags[scopeKey].tree.push({ id: tag.id });
  }

  return state;
};

const withFontFileRefs = (state) =>
  withFiles(state, [{ id: "file-font", type: "font", mimeType: "font/ttf" }]);

const createSceneBaseState = () => {
  const state = createEmptyTestState();

  state.story.initialSceneId = "scene-a";
  state.scenes.items = {
    "scene-a": {
      id: "scene-a",
      type: "scene",
      name: "Intro",
      sections: createEmptyNestedCollection(),
    },
    "folder-scenes": {
      id: "folder-scenes",
      type: "folder",
      name: "Folder",
    },
    "scene-b": {
      id: "scene-b",
      type: "scene",
      name: "Middle",
      sections: createEmptyNestedCollection(),
    },
  };
  state.scenes.tree = [
    createTreeNode("scene-a"),
    createTreeNode("folder-scenes", [createTreeNode("scene-b")]),
  ];

  return state;
};

const findSectionInState = (state, sectionId) => {
  for (const scene of Object.values(state.scenes.items)) {
    const section = scene?.sections?.items?.[sectionId];
    if (section) {
      return section;
    }
  }
  return undefined;
};

const findSectionCollectionInState = (state, sectionId) => {
  for (const scene of Object.values(state.scenes.items)) {
    if (scene?.sections?.items?.[sectionId]) {
      return scene.sections;
    }
  }
  return undefined;
};

const findLineInState = (state, lineId) => {
  for (const scene of Object.values(state.scenes.items)) {
    for (const section of Object.values(scene?.sections?.items || {})) {
      const line = section?.lines?.items?.[lineId];
      if (line) {
        return line;
      }
    }
  }
  return undefined;
};

const createSectionBaseState = () => {
  const state = createSceneBaseState();

  state.scenes.items["scene-a"].sections = {
    items: {
      "section-a": {
        id: "section-a",
        name: "Section A",
        lines: createEmptyNestedCollection(),
      },
      "section-b": {
        id: "section-b",
        name: "Section B",
        lines: createEmptyNestedCollection(),
      },
    },
    tree: [createTreeNode("section-a"), createTreeNode("section-b")],
  };
  state.scenes.items["scene-b"].sections = {
    items: {
      "section-other": {
        id: "section-other",
        name: "Other",
        lines: createEmptyNestedCollection(),
      },
    },
    tree: [createTreeNode("section-other")],
  };

  return state;
};

const createLineBaseState = () => {
  const state = createSectionBaseState();

  state.scenes.items["scene-a"].sections.items["section-a"].lines = {
    items: {
      "line-a": {
        id: "line-a",
        actions: {
          say: "hello",
        },
      },
      "line-b": {
        id: "line-b",
        actions: {
          say: "bye",
        },
      },
    },
    tree: [createTreeNode("line-a"), createTreeNode("line-b")],
  };
  state.scenes.items["scene-a"].sections.items["section-b"].lines = {
    items: {
      "line-other": {
        id: "line-other",
        actions: {
          say: "other",
        },
      },
    },
    tree: [createTreeNode("line-other")],
  };

  return state;
};

const createCharacterBaseState = () => {
  const state = createEmptyTestState();
  withFiles(state, [
    { id: "file-smile", type: "image", mimeType: "image/png" },
    { id: "file-angry", type: "image", mimeType: "image/png" },
  ]);
  state.characters.items["character-hero"] = {
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
        "sprite-a": {
          id: "sprite-a",
          type: "image",
          name: "Smile",
          fileId: "file-smile",
        },
        "sprite-b": {
          id: "sprite-b",
          type: "image",
          name: "Angry",
          fileId: "file-angry",
        },
      },
      tree: [
        createTreeNode("folder-default", [createTreeNode("sprite-a")]),
        createTreeNode("sprite-b"),
      ],
    },
  };
  state.characters.tree = [createTreeNode("character-hero")];
  return state;
};

const createLayoutBaseState = () => {
  const state = withTextStyleRefs(createEmptyTestState());
  state.variables.items["variable-ui"] = {
    id: "variable-ui",
    type: "variable",
    variableType: "number",
    name: "UI Value",
    scope: "device",
    default: 50,
    value: 50,
  };
  state.variables.tree = [createTreeNode("variable-ui")];

  state.layouts.items["layout-dialogue"] = {
    id: "layout-dialogue",
    type: "layout",
    name: "Dialogue",
    layoutType: "dialogue-adv",
    elements: {
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
        "text-a": {
          id: "text-a",
          type: "text",
          name: "Title",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "text-style-ui",
        },
        "text-b": {
          id: "text-b",
          type: "text",
          name: "Subtitle",
          x: 0,
          y: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "World",
          textStyleId: "text-style-ui",
        },
      },
      tree: [
        createTreeNode("container-root", [
          createTreeNode("text-a"),
          createTreeNode("text-b"),
        ]),
      ],
    },
  };
  state.layouts.tree = [createTreeNode("layout-dialogue")];

  return state;
};

const withParticleRefs = (state) => {
  state.particles.items["particle-snow"] = {
    id: "particle-snow",
    type: "particle",
    name: "Snow",
    width: 1280,
    height: 720,
    seed: 42,
    modules: {
      emission: {},
      appearance: {},
    },
  };
  state.particles.tree = [createTreeNode("particle-snow")];
  return state;
};

const createControlBaseState = () => {
  const state = withTextStyleRefs(createEmptyTestState());
  state.variables.items["variable-ui"] = {
    id: "variable-ui",
    type: "variable",
    variableType: "number",
    name: "UI Value",
    scope: "device",
    default: 50,
    value: 50,
  };
  state.variables.tree = [createTreeNode("variable-ui")];

  state.controls.items["control-default"] = {
    id: "control-default",
    type: "control",
    name: "Default Control",
    elements: {
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
        "text-a": {
          id: "text-a",
          type: "text",
          name: "Title",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "text-style-ui",
        },
        "text-b": {
          id: "text-b",
          type: "text",
          name: "Subtitle",
          x: 0,
          y: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "World",
          textStyleId: "text-style-ui",
        },
      },
      tree: [
        createTreeNode("container-root", [
          createTreeNode("text-a"),
          createTreeNode("text-b"),
        ]),
      ],
    },
  };
  state.controls.tree = [createTreeNode("control-default")];

  return state;
};

test("layout.element.create accepts particle elements", () => {
  const state = withParticleRefs(createLayoutBaseState());
  const result = processCommand({
    state,
    command: {
      type: "layout.element.create",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "particle-a",
        parentId: "container-root",
        data: {
          type: "particle",
          name: "Snow Overlay",
          x: 0,
          y: 0,
          width: 1280,
          height: 720,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          particleId: "particle-snow",
        },
      },
    },
  });

  expect(
    result.state.layouts.items["layout-dialogue"].elements.items["particle-a"],
  ).toEqual({
    id: "particle-a",
    type: "particle",
    name: "Snow Overlay",
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
    anchorX: 0,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    particleId: "particle-snow",
  });
});

test("layout.element.create accepts container elements with absolute direction", () => {
  const state = createLayoutBaseState();
  const result = processCommand({
    state,
    command: {
      type: "layout.element.create",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "container-absolute",
        parentId: "container-root",
        data: {
          type: "container",
          name: "Absolute Container",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          direction: "absolute",
        },
      },
    },
  });

  expect(
    result.state.layouts.items["layout-dialogue"].elements.items[
      "container-absolute"
    ],
  ).toEqual({
    id: "container-absolute",
    type: "container",
    name: "Absolute Container",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    anchorX: 0,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    direction: "absolute",
  });
});

test("layout element commands persist form submit roles", () => {
  const state = createLayoutBaseState();
  const createResult = processCommand({
    state,
    command: {
      type: "layout.element.create",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "submit-button",
        parentId: "container-root",
        data: {
          type: "rect",
          name: "Submit Button",
          x: 0,
          y: 0,
          width: 160,
          height: 52,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          formRole: "submit",
        },
      },
    },
  });

  expect(
    createResult.state.layouts.items["layout-dialogue"].elements.items[
      "submit-button"
    ],
  ).toMatchObject({
    id: "submit-button",
    type: "rect",
    formRole: "submit",
  });

  const updateResult = processCommand({
    state: createResult.state,
    command: {
      type: "layout.element.update",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "submit-button",
        data: {
          formRole: "submit",
        },
      },
    },
  });

  expect(
    updateResult.state.layouts.items["layout-dialogue"].elements.items[
      "submit-button"
    ].formRole,
  ).toBe("submit");
});

test("layout element validation rejects unsupported form roles", () => {
  expectValidation(() =>
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "submit-button",
        data: {
          formRole: "cancel",
        },
      },
    }),
  ).toThrow("payload.data.formRole must be 'submit' when provided");

  const state = createLayoutBaseState();
  state.layouts.items["layout-dialogue"].elements.items[
    "container-root"
  ].formRole = "cancel";

  expectValidation(() => validateState({ state })).toThrow(
    "state.layouts.items.layout-dialogue.elements.items.container-root.formRole must be 'submit' when provided",
  );
});

test("layout element commands persist choice single item containers", () => {
  const state = createLayoutBaseState();
  const createResult = processCommand({
    state,
    command: {
      type: "layout.element.create",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "choice-single-item",
        parentId: "container-root",
        data: {
          type: "container-ref-choice-single-item",
          name: "Choice Single Item",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          direction: "absolute",
          choiceItemIndex: 0,
          click: {
            inheritToChildren: true,
          },
        },
      },
    },
  });

  expect(
    createResult.state.layouts.items["layout-dialogue"].elements.items[
      "choice-single-item"
    ],
  ).toMatchObject({
    id: "choice-single-item",
    type: "container-ref-choice-single-item",
    choiceItemIndex: 0,
  });

  const updateResult = processCommand({
    state: createResult.state,
    command: {
      type: "layout.element.update",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "choice-single-item",
        data: {
          choiceItemIndex: 2,
        },
      },
    },
  });

  expect(
    updateResult.state.layouts.items["layout-dialogue"].elements.items[
      "choice-single-item"
    ].choiceItemIndex,
  ).toBe(2);
});

test("layout element commands persist sprite blur", () => {
  const state = createLayoutBaseState();
  withImageFileRefs(state);
  state.images.items["image-a"] = {
    id: "image-a",
    type: "image",
    name: "Image A",
    fileId: "file-image",
  };
  state.images.tree = [createTreeNode("image-a")];

  const blur = {
    x: 6,
    y: 9,
    quality: 3,
    kernelSize: 9,
    repeatEdgePixels: true,
  };
  const createResult = processCommand({
    state,
    command: {
      type: "layout.element.create",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "sprite-blur",
        parentId: "container-root",
        data: {
          type: "sprite",
          name: "Blurred Sprite",
          x: 0,
          y: 60,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          imageId: "image-a",
          blur,
        },
      },
    },
  });

  expect(
    createResult.state.layouts.items["layout-dialogue"].elements.items[
      "sprite-blur"
    ].blur,
  ).toEqual(blur);

  const updatedBlur = {
    x: 8,
    y: 10,
    quality: 4,
    kernelSize: 11,
    repeatEdgePixels: false,
  };
  const updateResult = processCommand({
    state: createResult.state,
    command: {
      type: "layout.element.update",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "sprite-blur",
        data: {
          blur: updatedBlur,
        },
      },
    },
  });

  expect(
    updateResult.state.layouts.items["layout-dialogue"].elements.items[
      "sprite-blur"
    ].blur,
  ).toEqual(updatedBlur);
});

test("layout.element.update rejects blur on non-sprite elements", () => {
  const state = createLayoutBaseState();
  const blur = {
    x: 6,
    y: 9,
    quality: 3,
    kernelSize: 9,
    repeatEdgePixels: true,
  };

  expectValidation(() =>
    validateAgainstState({
      state,
      command: {
        type: "layout.element.update",
        payload: {
          layoutId: "layout-dialogue",
          elementId: "text-a",
          data: {
            blur,
          },
        },
      },
    }),
  ).toThrow("layout element blur can only be provided for sprite elements");
});

test("validateAgainstState rejects missing particle references in layout elements", () => {
  const state = createLayoutBaseState();

  expectValidation(() =>
    validateAgainstState({
      state,
      command: {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-dialogue",
          elementId: "particle-a",
          parentId: "container-root",
          data: {
            type: "particle",
            name: "Snow Overlay",
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            particleId: "particle-missing",
          },
        },
      },
    }),
  ).toThrow(
    "layout element particleId must reference an existing non-folder particle",
  );
});

const createFolderedCommandCases = ({
  familyName,
  collectionKey,
  idField,
  idsField,
  createData,
  updateData,
  decorateState,
}) => {
  const createType = `${familyName}.create`;
  const updateType = `${familyName}.update`;
  const deleteType = `${familyName}.delete`;
  const moveType = `${familyName}.move`;

  const createItem = (id, data = createData) => ({
    id,
    ...clone(data),
  });

  return [
    {
      type: createType,
      runPositive: () => {
        const state = decorateState
          ? decorateState(createEmptyTestState())
          : createEmptyTestState();
        const result = processCommand({
          state,
          command: {
            type: createType,
            payload: {
              [idField]: "item-a",
              data: createData,
            },
          },
        });

        expect(result.state[collectionKey].items["item-a"]).toEqual(
          createItem("item-a"),
        );
      },
      runNegative: () => {
        expectValidation(() =>
          validatePayload({
            type: createType,
            payload: {
              [idField]: "",
              data: createData,
            },
          }),
        ).toThrow(
          new RegExp(`payload\\.${idField} must be a non-empty string`),
        );
      },
    },
    {
      type: updateType,
      runPositive: () => {
        const state = createCollectionState({
          collectionKey,
          items: {
            "item-a": createItem("item-a"),
          },
          tree: [createTreeNode("item-a")],
          decorateState,
        });

        const result = processCommand({
          state,
          command: {
            type: updateType,
            payload: {
              [idField]: "item-a",
              data: updateData,
            },
          },
        });

        expect(result.state[collectionKey].items["item-a"]).toEqual({
          ...createItem("item-a"),
          ...clone(updateData),
        });
      },
      runNegative: () => {
        const state = decorateState
          ? decorateState(createEmptyTestState())
          : createEmptyTestState();

        expectValidation(() =>
          validateAgainstState({
            state,
            command: {
              type: updateType,
              payload: {
                [idField]: "missing-item",
                data: updateData,
              },
            },
          }),
        ).toThrow(/must reference an existing/);
      },
    },
    {
      type: deleteType,
      runPositive: () => {
        const state = createCollectionState({
          collectionKey,
          items: {
            "item-a": createItem("item-a"),
          },
          tree: [createTreeNode("item-a")],
          decorateState,
        });

        const result = processCommand({
          state,
          command: {
            type: deleteType,
            payload: {
              [idsField]: ["item-a"],
            },
          },
        });

        expect(result.state[collectionKey].items).toEqual({});
        expect(result.state[collectionKey].tree).toEqual([]);
      },
      runNegative: () => {
        expectValidation(() =>
          validatePayload({
            type: deleteType,
            payload: {
              [idsField]: [],
            },
          }),
        ).toThrow(
          new RegExp(`payload\\.${idsField} must be a non-empty array`),
        );
      },
    },
    {
      type: moveType,
      runPositive: () => {
        const state = createCollectionState({
          collectionKey,
          items: {
            "item-a": createItem("item-a"),
            "folder-a": {
              id: "folder-a",
              type: "folder",
              name: "Folder",
            },
          },
          tree: [createTreeNode("item-a"), createTreeNode("folder-a")],
          decorateState,
        });

        const result = processCommand({
          state,
          command: {
            type: moveType,
            payload: {
              [idField]: "item-a",
              parentId: "folder-a",
              position: "last",
            },
          },
        });

        expect(result.state[collectionKey].tree).toEqual([
          createTreeNode("folder-a", [createTreeNode("item-a")]),
        ]);
      },
      runNegative: () => {
        const state = createCollectionState({
          collectionKey,
          items: {
            "item-a": createItem("item-a"),
            "item-b": createItem("item-b"),
          },
          tree: [createTreeNode("item-a"), createTreeNode("item-b")],
          decorateState,
        });

        expectValidation(() =>
          validateAgainstState({
            state,
            command: {
              type: moveType,
              payload: {
                [idField]: "item-a",
                parentId: "item-b",
                position: "last",
              },
            },
          }),
        ).toThrow(/payload\.parentId must reference a folder/);
      },
    },
  ];
};

const directCases = [
  {
    type: "project.create",
    runPositive: () => {
      const state = createEmptyTestState();
      const snapshot = createEmptyTestState();
      snapshot.project = {
        resolution: {
          width: 1920,
          height: 1080,
        },
      };

      const result = processCommand({
        state,
        command: {
          type: "project.create",
          payload: {
            state: snapshot,
          },
        },
      });

      expect(result.state).toEqual(snapshot);
    },
    runNegative: () => {
      const snapshot = createEmptyTestState();
      snapshot.metadata = {};

      expectValidation(() =>
        validatePayload({
          type: "project.create",
          payload: {
            state: snapshot,
          },
        }),
      ).toThrow("state.metadata is not allowed");
    },
  },
  {
    type: "story.update",
    runPositive: () => {
      const state = createSceneBaseState();
      const result = processCommand({
        state,
        command: {
          type: "story.update",
          payload: {
            data: {
              initialSceneId: "scene-b",
            },
          },
        },
      });

      expect(result.state.story.initialSceneId).toBe("scene-b");
    },
    runNegative: () => {
      const state = createSceneBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "story.update",
            payload: {
              data: {
                initialSceneId: "folder-scenes",
              },
            },
          },
        }),
      ).toThrow(
        "payload.data.initialSceneId must reference a non-folder scene",
      );
    },
  },
  {
    type: "scene.create",
    runPositive: () => {
      const state = createSceneBaseState();
      const result = processCommand({
        state,
        command: {
          type: "scene.create",
          payload: {
            sceneId: "scene-c",
            parentId: "folder-scenes",
            data: {
              name: "New Scene",
            },
          },
        },
      });

      expect(result.state.scenes.items["scene-c"]).toEqual({
        id: "scene-c",
        type: "scene",
        name: "New Scene",
        sections: createEmptyNestedCollection(),
      });
    },
    runNegative: () => {
      const state = createSceneBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "scene.create",
            payload: {
              sceneId: "scene-c",
              parentId: "scene-a",
              data: {
                name: "New Scene",
              },
            },
          },
        }),
      ).toThrow("payload.parentId must reference a folder scene");
    },
  },
  {
    type: "scene.update",
    runPositive: () => {
      const state = createSceneBaseState();
      const result = processCommand({
        state,
        command: {
          type: "scene.update",
          payload: {
            sceneId: "scene-a",
            data: {
              name: "Intro Updated",
            },
          },
        },
      });

      expect(result.state.scenes.items["scene-a"].name).toBe("Intro Updated");
    },
    runNegative: () => {
      const state = createSceneBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "scene.update",
            payload: {
              sceneId: "missing-scene",
              data: {
                name: "Nope",
              },
            },
          },
        }),
      ).toThrow("payload.sceneId must reference an existing scene");
    },
  },
  {
    type: "scene.delete",
    runPositive: () => {
      const state = createSceneBaseState();
      const result = processCommand({
        state,
        command: {
          type: "scene.delete",
          payload: {
            sceneIds: ["scene-b"],
          },
        },
      });

      expect(result.state.scenes.items["scene-b"]).toBeUndefined();
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "scene.delete",
          payload: {
            sceneIds: [],
          },
        }),
      ).toThrow("payload.sceneIds must be a non-empty array");
    },
  },
  {
    type: "scene.move",
    runPositive: () => {
      const state = createSceneBaseState();
      const result = processCommand({
        state,
        command: {
          type: "scene.move",
          payload: {
            sceneId: "scene-b",
            position: "before",
            positionTargetId: "scene-a",
          },
        },
      });

      expect(result.state.scenes.tree[0].id).toBe("scene-b");
    },
    runNegative: () => {
      const state = createSceneBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "scene.move",
            payload: {
              sceneId: "folder-scenes",
              parentId: "scene-b",
              position: "last",
            },
          },
        }),
      ).toThrow(/payload\.parentId must reference a folder scene/);
    },
  },
  {
    type: "section.create",
    runPositive: () => {
      const state = createSectionBaseState();
      const result = processCommand({
        state,
        command: {
          type: "section.create",
          payload: {
            sectionId: "section-c",
            sceneId: "scene-a",
            data: {
              name: "Section C",
            },
          },
        },
      });

      expect(getSceneSection(result.state, "scene-a", "section-c")).toEqual({
        id: "section-c",
        name: "Section C",
        lines: createEmptyNestedCollection(),
      });
    },
    runNegative: () => {
      const state = createSectionBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "section.create",
            payload: {
              sectionId: "section-c",
              sceneId: "folder-scenes",
              data: {
                name: "Section C",
              },
            },
          },
        }),
      ).toThrow("payload.sceneId must reference a non-folder scene");

      const lastSectionState = createSectionBaseState();
      delete lastSectionState.scenes.items["scene-a"].sections.items[
        "section-b"
      ];
      lastSectionState.scenes.items["scene-a"].sections.tree = [
        createTreeNode("section-a"),
      ];

      expectValidation(() =>
        validateAgainstState({
          state: lastSectionState,
          command: {
            type: "section.move",
            payload: {
              sectionId: "section-a",
              sceneId: "scene-b",
              position: "last",
            },
          },
        }),
      ).toThrow(
        "payload.sectionId must not move the last section out of a scene",
      );
    },
  },
  {
    type: "section.update",
    runPositive: () => {
      const state = createSectionBaseState();
      const result = processCommand({
        state,
        command: {
          type: "section.update",
          payload: {
            sectionId: "section-a",
            data: {
              name: "Section A Updated",
            },
          },
        },
      });

      expect(getSceneSection(result.state, "scene-a", "section-a").name).toBe(
        "Section A Updated",
      );
    },
    runNegative: () => {
      const state = createSectionBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "section.update",
            payload: {
              sectionId: "missing-section",
              data: {
                name: "Nope",
              },
            },
          },
        }),
      ).toThrow("payload.sectionId must reference an existing section");
    },
  },
  {
    type: "section.delete",
    runPositive: () => {
      const state = createSectionBaseState();
      const result = processCommand({
        state,
        command: {
          type: "section.delete",
          payload: {
            sectionIds: ["section-b"],
          },
        },
      });

      expect(
        result.state.scenes.items["scene-a"].sections.items["section-b"],
      ).toBeUndefined();
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "section.delete",
          payload: {
            sectionIds: [],
          },
        }),
      ).toThrow("payload.sectionIds must be a non-empty array");
    },
  },
  {
    type: "section.move",
    runPositive: () => {
      const state = createSectionBaseState();
      const result = processCommand({
        state,
        command: {
          type: "section.move",
          payload: {
            sectionId: "section-b",
            position: "before",
            positionTargetId: "section-a",
          },
        },
      });

      expect(result.state.scenes.items["scene-a"].sections.tree[0].id).toBe(
        "section-b",
      );

      const crossSceneState = createLineBaseState();
      const crossSceneResult = processCommand({
        state: crossSceneState,
        command: {
          type: "section.move",
          payload: {
            sectionId: "section-a",
            sceneId: "scene-b",
            position: "after",
            positionTargetId: "section-other",
          },
        },
      });

      expect(
        crossSceneResult.state.scenes.items["scene-a"].sections.items[
          "section-a"
        ],
      ).toBeUndefined();
      expect(
        crossSceneResult.state.scenes.items["scene-b"].sections.tree.map(
          (node) => node.id,
        ),
      ).toEqual(["section-other", "section-a"]);
      expect(
        getSceneSection(crossSceneResult.state, "scene-b", "section-a").lines
          .items["line-a"].actions,
      ).toEqual({
        say: "hello",
      });
    },
    runNegative: () => {
      const state = createSectionBaseState();
      state.scenes.items["scene-b"].sections.items["folder-section"] = {
        id: "folder-section",
        name: "Folder Section",
        lines: createEmptyNestedCollection(),
      };
      state.scenes.items["scene-b"].sections.tree.push(
        createTreeNode("folder-section"),
      );

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "section.move",
            payload: {
              sectionId: "section-a",
              parentId: "folder-section",
              position: "last",
            },
          },
        }),
      ).toThrow(
        "payload.parentId must reference a section in the target scene",
      );

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "section.move",
            payload: {
              sectionId: "section-a",
              sceneId: "missing-scene",
              position: "last",
            },
          },
        }),
      ).toThrow("payload.sceneId must reference an existing scene");

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "section.move",
            payload: {
              sectionId: "section-a",
              sceneId: "folder-scenes",
              position: "last",
            },
          },
        }),
      ).toThrow("payload.sceneId must reference a non-folder scene");
    },
  },
  {
    type: "line.create",
    runPositive: () => {
      const state = createLineBaseState();
      const result = processCommand({
        state,
        command: {
          type: "line.create",
          payload: {
            sectionId: "section-a",
            lines: [
              {
                lineId: "line-c",
                data: {
                  actions: {
                    say: "new",
                  },
                },
              },
            ],
          },
        },
      });

      expect(
        getSceneSection(result.state, "scene-a", "section-a").lines.items[
          "line-c"
        ],
      ).toEqual({
        id: "line-c",
        actions: {
          say: "new",
        },
      });
      expect(
        getSceneSection(result.state, "scene-a", "section-a").lines.tree.map(
          (node) => node.id,
        ),
      ).toEqual(["line-a", "line-b", "line-c"]);
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "line.create",
          payload: {
            sectionId: "section-a",
            lines: [],
          },
        }),
      ).toThrow("payload.lines must be a non-empty array");
    },
  },
  {
    type: "line.update_actions",
    runPositive: () => {
      const state = createLineBaseState();
      let result = processCommand({
        state,
        command: {
          type: "line.update_actions",
          payload: {
            lineId: "line-a",
            data: {
              mood: "tense",
            },
          },
        },
      });

      expect(
        getSceneSection(result.state, "scene-a", "section-a").lines.items[
          "line-a"
        ].actions,
      ).toEqual({
        say: "hello",
        mood: "tense",
      });

      const preserveState = createLineBaseState();
      getSceneSection(preserveState, "scene-a", "section-a").lines.items[
        "line-a"
      ].actions = {
        dialogue: {
          content: [{ text: "Long text stays here" }],
          characterId: "character-a",
          ui: {
            resourceId: "layout-a",
          },
          mode: "adv",
        },
      };

      result = processCommand({
        state: preserveState,
        command: {
          type: "line.update_actions",
          payload: {
            lineId: "line-a",
            data: {
              dialogue: {
                mode: "nvl",
              },
            },
            preserve: ["dialogue.content"],
          },
        },
      });

      expect(
        getSceneSection(result.state, "scene-a", "section-a").lines.items[
          "line-a"
        ].actions,
      ).toEqual({
        dialogue: {
          content: [{ text: "Long text stays here" }],
          mode: "nvl",
        },
      });
    },
    runNegative: () => {
      const state = createLineBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "line.update_actions",
            payload: {
              lineId: "missing-line",
              data: {
                mood: "tense",
              },
            },
          },
        }),
      ).toThrow("payload.lineId must reference an existing line");
      expectValidation(() =>
        validatePayload({
          type: "line.update_actions",
          payload: {
            lineId: "line-a",
            data: {
              dialogue: {
                mode: "nvl",
              },
            },
            replace: true,
            preserve: ["dialogue.content"],
          },
        }),
      ).toThrow(
        "payload.preserve is only supported when payload.replace is not true",
      );
    },
  },
  {
    type: "line.delete",
    runPositive: () => {
      const state = createLineBaseState();
      const result = processCommand({
        state,
        command: {
          type: "line.delete",
          payload: {
            lineIds: ["line-b"],
          },
        },
      });

      expect(
        getSceneSection(result.state, "scene-a", "section-a").lines.items[
          "line-b"
        ],
      ).toBeUndefined();
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "line.delete",
          payload: {
            lineIds: [],
          },
        }),
      ).toThrow("payload.lineIds must be a non-empty array");
    },
  },
  {
    type: "line.move",
    runPositive: () => {
      const state = createLineBaseState();
      const result = processCommand({
        state,
        command: {
          type: "line.move",
          payload: {
            lineId: "line-b",
            toSectionId: "section-b",
            position: "last",
          },
        },
      });

      expect(
        getSceneSection(result.state, "scene-a", "section-a").lines.tree.map(
          (node) => node.id,
        ),
      ).toEqual(["line-a"]);
      expect(
        getSceneSection(result.state, "scene-a", "section-b").lines.tree.map(
          (node) => node.id,
        ),
      ).toEqual(["line-other", "line-b"]);
    },
    runNegative: () => {
      const state = createLineBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "line.move",
            payload: {
              lineId: "line-a",
              toSectionId: "section-b",
              position: "before",
              positionTargetId: "line-b",
            },
          },
        }),
      ).toThrow(
        "payload.positionTargetId must reference a line in the target section",
      );
    },
  },
  {
    type: "file.create",
    runPositive: () => {
      const state = createEmptyTestState();
      const result = processCommand({
        state,
        command: {
          type: "file.create",
          payload: {
            fileId: "file-a",
            data: {
              mimeType: "image/png",
              size: 128,
              sha256: "file-a-sha256",
            },
          },
        },
      });

      expect(result.state.files.items["file-a"]).toEqual({
        id: "file-a",
        mimeType: "image/png",
        size: 128,
        sha256: "file-a-sha256",
      });
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "file.create",
          payload: {
            fileId: "file-a",
            data: {
              mimeType: "image/png",
              size: 128,
            },
          },
        }),
      ).toThrow("payload.data.sha256 must be a non-empty string");
    },
  },
  {
    type: "file.delete",
    runPositive: () => {
      const state = withFiles(createEmptyTestState(), [
        { id: "file-a", type: "image", mimeType: "image/png" },
      ]);
      const result = processCommand({
        state,
        command: {
          type: "file.delete",
          payload: {
            fileIds: ["file-a"],
          },
        },
      });

      expect(result.state.files.items).toEqual({});
      expect(result.state.files.tree).toEqual([]);
    },
    runNegative: () => {
      const state = withFiles(createEmptyTestState(), [
        { id: "file-image", type: "image", mimeType: "image/png" },
      ]);
      state.images.items["image-a"] = {
        id: "image-a",
        type: "image",
        name: "Image A",
        fileId: "file-image",
      };
      state.images.tree = [createTreeNode("image-a")];

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "file.delete",
            payload: {
              fileIds: ["file-image"],
            },
          },
        }),
      ).toThrow("payload.fileIds cannot delete a referenced file");
    },
  },
  {
    type: "file.move",
    runPositive: () => {
      const state = withFiles(createEmptyTestState(), [
        { id: "file-a", type: "image", mimeType: "image/png" },
      ]);
      state.files.items["folder-a"] = {
        id: "folder-a",
        type: "folder",
        name: "Folder",
      };
      state.files.tree = [createTreeNode("file-a"), createTreeNode("folder-a")];

      const result = processCommand({
        state,
        command: {
          type: "file.move",
          payload: {
            fileId: "file-a",
            parentId: "folder-a",
            position: "last",
          },
        },
      });

      expect(result.state.files.tree).toEqual([
        createTreeNode("folder-a", [createTreeNode("file-a")]),
      ]);
    },
    runNegative: () => {
      const state = withFiles(createEmptyTestState(), [
        { id: "file-a", type: "image", mimeType: "image/png" },
        { id: "file-b", type: "image", mimeType: "image/png" },
      ]);

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "file.move",
            payload: {
              fileId: "file-a",
              parentId: "file-b",
              position: "last",
            },
          },
        }),
      ).toThrow(/payload\.parentId must reference a folder/);
    },
  },
  ...createFolderedCommandCases({
    familyName: "image",
    collectionKey: "images",
    idField: "imageId",
    idsField: "imageIds",
    createData: {
      type: "image",
      name: "Image",
      thumbnailFileId: "thumb-image",
      fileId: "file-image",
    },
    updateData: {
      name: "Image Updated",
    },
    decorateState: withImageFileRefs,
  }),
  ...createFolderedCommandCases({
    familyName: "sound",
    collectionKey: "sounds",
    idField: "soundId",
    idsField: "soundIds",
    createData: {
      type: "sound",
      name: "Sound",
      fileId: "file-sound",
      waveformDataFileId: null,
    },
    updateData: {
      duration: 42,
    },
    decorateState: withSoundFileRefs,
  }),
  ...createFolderedCommandCases({
    familyName: "video",
    collectionKey: "videos",
    idField: "videoId",
    idsField: "videoIds",
    createData: {
      type: "video",
      name: "Video",
      fileId: "file-video",
      thumbnailFileId: "thumb-video",
      duration: 42.5,
    },
    updateData: {
      duration: 84,
      width: 1280,
    },
    decorateState: withVideoFileRefs,
  }),
  ...createFolderedCommandCases({
    familyName: "spritesheet",
    collectionKey: "spritesheets",
    idField: "spritesheetId",
    idsField: "spritesheetIds",
    createData: {
      type: "spritesheet",
      name: "Hero Idle",
      fileId: "file-image",
      thumbnailFileId: "thumb-image",
      jsonData: {
        meta: {
          image: "hero-idle.png",
        },
      },
      animations: {
        idle: {
          frames: [0, 1, 2, 3],
          fps: 12,
          loop: true,
        },
      },
    },
    updateData: {
      name: "Hero Idle Updated",
      frameCount: 6,
      animations: {
        idle: {
          frames: [0, 1, 2, 3, 4, 5],
          fps: 15,
          loop: true,
        },
      },
    },
    decorateState: withImageFileRefs,
  }),
  ...createFolderedCommandCases({
    familyName: "animation",
    collectionKey: "animations",
    idField: "animationId",
    idsField: "animationIds",
    createData: {
      type: "animation",
      name: "Animation",
      animation: {
        type: "update",
        tween: {
          x: {
            keyframes: [{ duration: 100, value: 1 }],
          },
        },
      },
    },
    updateData: {
      name: "Animation Updated",
    },
  }),
  ...createFolderedCommandCases({
    familyName: "font",
    collectionKey: "fonts",
    idField: "fontId",
    idsField: "fontIds",
    createData: {
      type: "font",
      name: "Font",
      fileId: "file-font",
      fontFamily: "Suit",
    },
    updateData: {
      fontFamily: "Suit Alt",
    },
    decorateState: withFontFileRefs,
  }),
  ...createFolderedCommandCases({
    familyName: "color",
    collectionKey: "colors",
    idField: "colorId",
    idsField: "colorIds",
    createData: {
      type: "color",
      name: "Color",
      hex: "#112233",
    },
    updateData: {
      hex: "#223344",
    },
  }),
  ...createFolderedCommandCases({
    familyName: "particle",
    collectionKey: "particles",
    idField: "particleId",
    idsField: "particleIds",
    createData: {
      type: "particle",
      name: "Snow",
      width: 1280,
      height: 720,
      seed: 12345,
      modules: {
        emission: {
          mode: "continuous",
          rate: 20,
          particleLifetime: {
            min: 1,
            max: 2,
          },
          source: {
            kind: "rect",
            data: {
              x: 0,
              y: 0,
              width: 1280,
              height: 20,
            },
          },
        },
        appearance: {
          texture: "snowflake",
        },
      },
    },
    updateData: {
      width: 1440,
      seed: 67890,
    },
  }),
  ...createFolderedCommandCases({
    familyName: "transform",
    collectionKey: "transforms",
    idField: "transformId",
    idsField: "transformIds",
    createData: {
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
    updateData: {
      x: 320,
    },
  }),
  ...createFolderedCommandCases({
    familyName: "variable",
    collectionKey: "variables",
    idField: "variableId",
    idsField: "variableIds",
    createData: {
      type: "variable",
      variableType: "number",
      name: "Score",
      scope: "device",
      default: 0,
      value: 0,
    },
    updateData: {
      scope: "account",
      value: 10,
    },
  }),
  ...createFolderedCommandCases({
    familyName: "textStyle",
    collectionKey: "textStyles",
    idField: "textStyleId",
    idsField: "textStyleIds",
    createData: {
      type: "textStyle",
      name: "Dialogue",
      fontId: "font-ui",
      colorId: "color-ui",
      fontSize: 32,
      lineHeight: 1.4,
      fontWeight: "700",
    },
    updateData: {
      previewText: "Preview",
    },
    decorateState: withFontAndColorRefs,
  }),
  ...createFolderedCommandCases({
    familyName: "character",
    collectionKey: "characters",
    idField: "characterId",
    idsField: "characterIds",
    createData: {
      type: "character",
      name: "Hero",
      sprites: {
        items: {},
        tree: [],
      },
    },
    updateData: {
      description: "Lead actor",
    },
  }),
  ...createFolderedCommandCases({
    familyName: "layout",
    collectionKey: "layouts",
    idField: "layoutId",
    idsField: "layoutIds",
    createData: {
      type: "layout",
      name: "Dialogue",
      layoutType: "dialogue-adv",
      elements: {
        items: {},
        tree: [],
      },
    },
    updateData: {
      name: "Dialogue Updated",
    },
  }),
  {
    type: "layout.schema.upgrade",
    runPositive: () => {
      const state = createLayoutBaseState();
      const result = processCommand({
        state,
        command: {
          type: "layout.schema.upgrade",
          payload: {
            layoutIds: ["layout-dialogue"],
            targetSchemaVersion: 2,
          },
        },
      });

      const layout = result.state.layouts.items["layout-dialogue"];
      expect(layout.layoutSchemaVersion).toBe(2);
      expect(layout.elements.tree[0].children).toEqual([
        createTreeNode("text-b"),
        createTreeNode("text-a"),
      ]);
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "layout.schema.upgrade",
          payload: {
            layoutIds: ["layout-dialogue"],
            targetSchemaVersion: 3,
          },
        }),
      ).toThrow("payload.targetSchemaVersion must be 2");
    },
  },
  ...createFolderedCommandCases({
    familyName: "control",
    collectionKey: "controls",
    idField: "controlId",
    idsField: "controlIds",
    createData: {
      type: "control",
      name: "Default Control",
      elements: {
        items: {},
        tree: [],
      },
    },
    updateData: {
      name: "Control Updated",
    },
  }),
  {
    type: "character.sprite.create",
    runPositive: () => {
      const state = createCharacterBaseState();
      withFiles(state, [
        { id: "file-new-sprite", type: "image", mimeType: "image/png" },
      ]);
      const result = processCommand({
        state,
        command: {
          type: "character.sprite.create",
          payload: {
            characterId: "character-hero",
            spriteId: "sprite-c",
            parentId: "folder-default",
            data: {
              type: "image",
              name: "New Sprite",
              fileId: "file-new-sprite",
            },
          },
        },
      });

      expect(
        result.state.characters.items["character-hero"].sprites.items[
          "sprite-c"
        ],
      ).toEqual({
        id: "sprite-c",
        type: "image",
        name: "New Sprite",
        fileId: "file-new-sprite",
      });
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "character.sprite.create",
          payload: {
            characterId: "character-hero",
            spriteId: "",
            data: {
              type: "image",
              name: "New Sprite",
              fileId: "file-new-sprite",
            },
          },
        }),
      ).toThrow("payload.spriteId must be a non-empty string");
    },
  },
  {
    type: "character.sprite.update",
    runPositive: () => {
      const state = createCharacterBaseState();
      const result = processCommand({
        state,
        command: {
          type: "character.sprite.update",
          payload: {
            characterId: "character-hero",
            spriteId: "sprite-a",
            data: {
              name: "Smile Updated",
            },
          },
        },
      });

      expect(
        result.state.characters.items["character-hero"].sprites.items[
          "sprite-a"
        ].name,
      ).toBe("Smile Updated");
    },
    runNegative: () => {
      const state = createCharacterBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "character.sprite.update",
            payload: {
              characterId: "character-hero",
              spriteId: "missing-sprite",
              data: {
                name: "Nope",
              },
            },
          },
        }),
      ).toThrow("payload.spriteId must reference an existing sprite item");
    },
  },
  {
    type: "character.sprite.delete",
    runPositive: () => {
      const state = createCharacterBaseState();
      const result = processCommand({
        state,
        command: {
          type: "character.sprite.delete",
          payload: {
            characterId: "character-hero",
            spriteIds: ["sprite-b"],
          },
        },
      });

      expect(
        result.state.characters.items["character-hero"].sprites.items[
          "sprite-b"
        ],
      ).toBeUndefined();
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "character.sprite.delete",
          payload: {
            characterId: "character-hero",
            spriteIds: [],
          },
        }),
      ).toThrow("payload.spriteIds must be a non-empty array");
    },
  },
  {
    type: "character.sprite.move",
    runPositive: () => {
      const state = createCharacterBaseState();
      const result = processCommand({
        state,
        command: {
          type: "character.sprite.move",
          payload: {
            characterId: "character-hero",
            spriteId: "sprite-b",
            parentId: "folder-default",
            position: "last",
          },
        },
      });

      expect(
        result.state.characters.items["character-hero"].sprites.tree,
      ).toEqual([
        createTreeNode("folder-default", [
          createTreeNode("sprite-a"),
          createTreeNode("sprite-b"),
        ]),
      ]);
    },
    runNegative: () => {
      const state = createCharacterBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "character.sprite.move",
            payload: {
              characterId: "character-hero",
              spriteId: "sprite-a",
              parentId: "sprite-b",
              position: "last",
            },
          },
        }),
      ).toThrow("payload.parentId must reference a folder sprite item");
    },
  },
  {
    type: "tag.create",
    runPositive: () => {
      const state = createEmptyTestState();
      const result = processCommand({
        state,
        command: {
          type: "tag.create",
          payload: {
            scopeKey: "images",
            tagId: "tag-bg",
            data: {
              type: "tag",
              name: "Background",
              color: "#112233",
            },
          },
        },
      });

      expect(result.state.tags.images.items["tag-bg"]).toEqual({
        id: "tag-bg",
        type: "tag",
        name: "Background",
        color: "#112233",
      });
      expect(result.state.tags.images.tree).toEqual([{ id: "tag-bg" }]);
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "tag.create",
          payload: {
            scopeKey: "images",
            tagId: "",
            data: {
              type: "tag",
              name: "Background",
            },
          },
        }),
      ).toThrow("payload.tagId must be a non-empty string");
    },
  },
  {
    type: "tag.update",
    runPositive: () => {
      const state = withTagScope(createEmptyTestState(), "images", [
        {
          id: "tag-bg",
          type: "tag",
          name: "Background",
          color: "#112233",
        },
      ]);
      const result = processCommand({
        state,
        command: {
          type: "tag.update",
          payload: {
            scopeKey: "images",
            tagId: "tag-bg",
            data: {
              name: "Backdrop",
              color: null,
            },
          },
        },
      });

      expect(result.state.tags.images.items["tag-bg"]).toEqual({
        id: "tag-bg",
        type: "tag",
        name: "Backdrop",
      });
    },
    runNegative: () => {
      const state = createEmptyTestState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "tag.update",
            payload: {
              scopeKey: "images",
              tagId: "missing-tag",
              data: {
                name: "Backdrop",
              },
            },
          },
        }),
      ).toThrow(
        "payload.tagId must reference an existing tag in payload.scopeKey",
      );
    },
  },
  {
    type: "tag.delete",
    runPositive: () => {
      const state = withTagScope(
        withImageFileRefs(createEmptyTestState()),
        "images",
        [
          {
            id: "tag-bg",
            type: "tag",
            name: "Background",
          },
        ],
      );
      state.images.items["image-a"] = {
        id: "image-a",
        type: "image",
        name: "Image A",
        fileId: "file-image",
        tagIds: ["tag-bg"],
      };
      state.images.tree = [createTreeNode("image-a")];

      const result = processCommand({
        state,
        command: {
          type: "tag.delete",
          payload: {
            scopeKey: "images",
            tagIds: ["tag-bg"],
          },
        },
      });

      expect(result.state.tags.images.items).toEqual({});
      expect(result.state.tags.images.tree).toEqual([]);
      expect(result.state.images.items["image-a"].tagIds).toBeUndefined();
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "tag.delete",
          payload: {
            scopeKey: "images",
            tagIds: [],
          },
        }),
      ).toThrow("payload.tagIds must be a non-empty array");
    },
  },
  {
    type: "layout.element.create",
    runPositive: () => {
      const state = createLayoutBaseState();
      const result = processCommand({
        state,
        command: {
          type: "layout.element.create",
          payload: {
            layoutId: "layout-dialogue",
            elementId: "text-c",
            parentId: "container-root",
            data: {
              type: "text",
              name: "Body",
              x: 0,
              y: 40,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              text: "More",
              textStyleId: "text-style-ui",
              variableId: "variable-ui",
            },
          },
        },
      });

      expect(
        result.state.layouts.items["layout-dialogue"].elements.items["text-c"],
      ).toEqual({
        id: "text-c",
        type: "text",
        name: "Body",
        x: 0,
        y: 40,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        text: "More",
        textStyleId: "text-style-ui",
        variableId: "variable-ui",
      });
    },
    runNegative: () => {
      const state = createLayoutBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "layout.element.create",
            payload: {
              layoutId: "layout-dialogue",
              elementId: "text-c",
              parentId: "text-a",
              data: {
                type: "text",
                name: "Body",
                x: 0,
                y: 40,
                anchorX: 0,
                anchorY: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                text: "More",
                textStyleId: "text-style-ui",
              },
            },
          },
        }),
      ).toThrow(
        "payload.parentId must reference a folder or container layout element",
      );
    },
  },
  {
    type: "layout.element.update",
    runPositive: () => {
      const state = createLayoutBaseState();
      const result = processCommand({
        state,
        command: {
          type: "layout.element.update",
          payload: {
            layoutId: "layout-dialogue",
            elementId: "text-a",
            data: {
              variableId: "variable-ui",
              scrollUp: {
                inheritToChildren: true,
                payload: {
                  actions: {
                    nextLine: {},
                  },
                },
              },
              scrollDown: {
                payload: {
                  actions: {
                    toggleDialogueUI: {},
                  },
                },
              },
            },
          },
        },
      });

      expect(
        result.state.layouts.items["layout-dialogue"].elements.items["text-a"],
      ).toMatchObject({
        variableId: "variable-ui",
        scrollUp: {
          inheritToChildren: true,
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        scrollDown: {
          payload: {
            actions: {
              toggleDialogueUI: {},
            },
          },
        },
      });
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "layout.element.update",
          payload: {
            layoutId: "layout-dialogue",
            elementId: "text-a",
            data: {
              opacity: 2,
            },
          },
        }),
      ).toThrow(
        "payload.data.opacity must be a finite number between 0 and 1 when provided",
      );
    },
  },
  {
    type: "layout.element.delete",
    runPositive: () => {
      const state = createLayoutBaseState();
      const result = processCommand({
        state,
        command: {
          type: "layout.element.delete",
          payload: {
            layoutId: "layout-dialogue",
            elementIds: ["text-b"],
          },
        },
      });

      expect(
        result.state.layouts.items["layout-dialogue"].elements.items["text-b"],
      ).toBeUndefined();
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "layout.element.delete",
          payload: {
            layoutId: "layout-dialogue",
            elementIds: [],
          },
        }),
      ).toThrow("payload.elementIds must be a non-empty array");
    },
  },
  {
    type: "layout.element.move",
    runPositive: () => {
      const state = createLayoutBaseState();
      const result = processCommand({
        state,
        command: {
          type: "layout.element.move",
          payload: {
            layoutId: "layout-dialogue",
            elementId: "text-a",
            parentId: "container-root",
            position: "after",
            positionTargetId: "text-b",
          },
        },
      });

      expect(
        result.state.layouts.items[
          "layout-dialogue"
        ].elements.tree[0].children.map((entry) => entry.id),
      ).toEqual(["text-b", "text-a"]);
    },
    runNegative: () => {
      const state = createLayoutBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "layout.element.move",
            payload: {
              layoutId: "layout-dialogue",
              elementId: "text-a",
              parentId: "text-b",
              position: "last",
            },
          },
        }),
      ).toThrow(
        "payload.parentId must reference a folder or container layout element",
      );
    },
  },
  {
    type: "control.element.create",
    runPositive: () => {
      const state = createControlBaseState();
      const result = processCommand({
        state,
        command: {
          type: "control.element.create",
          payload: {
            controlId: "control-default",
            elementId: "text-c",
            parentId: "container-root",
            data: {
              type: "text",
              name: "Body",
              x: 0,
              y: 40,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              text: "More",
              textStyleId: "text-style-ui",
              variableId: "variable-ui",
            },
          },
        },
      });

      expect(
        result.state.controls.items["control-default"].elements.items["text-c"],
      ).toEqual({
        id: "text-c",
        type: "text",
        name: "Body",
        x: 0,
        y: 40,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        text: "More",
        textStyleId: "text-style-ui",
        variableId: "variable-ui",
      });
    },
    runNegative: () => {
      const state = createControlBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "control.element.create",
            payload: {
              controlId: "control-default",
              elementId: "text-c",
              parentId: "text-a",
              data: {
                type: "text",
                name: "Body",
                x: 0,
                y: 40,
                anchorX: 0,
                anchorY: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                text: "More",
                textStyleId: "text-style-ui",
              },
            },
          },
        }),
      ).toThrow(
        "payload.parentId must reference a folder or container control element",
      );
    },
  },
  {
    type: "control.element.update",
    runPositive: () => {
      const state = createControlBaseState();
      const result = processCommand({
        state,
        command: {
          type: "control.element.update",
          payload: {
            controlId: "control-default",
            elementId: "text-a",
            data: {
              variableId: "variable-ui",
              scrollUp: {
                payload: {
                  actions: {
                    nextLine: {},
                  },
                },
              },
              scrollDown: {
                inheritToChildren: true,
                payload: {
                  actions: {
                    toggleSkipMode: {},
                  },
                },
              },
            },
          },
        },
      });

      expect(
        result.state.controls.items["control-default"].elements.items["text-a"],
      ).toMatchObject({
        variableId: "variable-ui",
        scrollUp: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        scrollDown: {
          inheritToChildren: true,
          payload: {
            actions: {
              toggleSkipMode: {},
            },
          },
        },
      });
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "control.element.update",
          payload: {
            controlId: "control-default",
            elementId: "text-a",
            data: {
              opacity: 2,
            },
          },
        }),
      ).toThrow(
        "payload.data.opacity must be a finite number between 0 and 1 when provided",
      );
    },
  },
  {
    type: "control.element.delete",
    runPositive: () => {
      const state = createControlBaseState();
      const result = processCommand({
        state,
        command: {
          type: "control.element.delete",
          payload: {
            controlId: "control-default",
            elementIds: ["text-b"],
          },
        },
      });

      expect(
        result.state.controls.items["control-default"].elements.items["text-b"],
      ).toBeUndefined();
    },
    runNegative: () => {
      expectValidation(() =>
        validatePayload({
          type: "control.element.delete",
          payload: {
            controlId: "control-default",
            elementIds: [],
          },
        }),
      ).toThrow("payload.elementIds must be a non-empty array");
    },
  },
  {
    type: "control.element.move",
    runPositive: () => {
      const state = createControlBaseState();
      const result = processCommand({
        state,
        command: {
          type: "control.element.move",
          payload: {
            controlId: "control-default",
            elementId: "text-a",
            parentId: "container-root",
            position: "after",
            positionTargetId: "text-b",
          },
        },
      });

      expect(
        result.state.controls.items[
          "control-default"
        ].elements.tree[0].children.map((entry) => entry.id),
      ).toEqual(["text-b", "text-a"]);
    },
    runNegative: () => {
      const state = createControlBaseState();

      expectValidation(() =>
        validateAgainstState({
          state,
          command: {
            type: "control.element.move",
            payload: {
              controlId: "control-default",
              elementId: "text-a",
              parentId: "text-b",
              position: "last",
            },
          },
        }),
      ).toThrow(
        "payload.parentId must reference a folder or container control element",
      );
    },
  },
];

test("character.create payload rejects sprite tagIds during payload validation", () => {
  expectValidation(() =>
    validatePayload({
      type: "character.create",
      payload: {
        characterId: "character-hero",
        data: {
          type: "character",
          name: "Hero",
          sprites: {
            items: {
              "sprite-default": {
                id: "sprite-default",
                type: "image",
                name: "Default",
                fileId: "file-smile",
                tagIds: ["tag-smile"],
              },
            },
            tree: [createTreeNode("sprite-default")],
          },
        },
      },
    }),
  ).toThrow("payload.data.sprites.items.sprite-default.tagIds is not allowed");
});

test("character.create rejects spriteGroups before character sprite tags exist", () => {
  const state = withTagScope(createEmptyTestState(), "characters", [
    {
      id: "tag-eyes",
      type: "tag",
      name: "Eyes",
    },
    {
      id: "tag-mouth",
      type: "tag",
      name: "Mouth",
    },
  ]);

  expectValidation(() =>
    processCommand({
      state,
      command: {
        type: "character.create",
        payload: {
          characterId: "character-hero",
          data: {
            type: "character",
            name: "Hero",
            spriteGroups: [
              {
                id: "group-face",
                name: "Face",
                tags: ["tag-eyes", "tag-mouth"],
              },
            ],
          },
        },
      },
    }),
  ).toThrow(
    "payload.data.spriteGroups[0].tags must reference an existing character sprite tag scope",
  );
});

test("character.create rejects spriteGroups without ids in payload data", () => {
  const state = withTagScope(createEmptyTestState(), "characters", [
    {
      id: "tag-eyes",
      type: "tag",
      name: "Eyes",
    },
  ]);

  expectValidation(() =>
    processCommand({
      state,
      command: {
        type: "character.create",
        payload: {
          characterId: "character-hero",
          data: {
            type: "character",
            name: "Hero",
            spriteGroups: [
              {
                name: "Face",
                tags: ["tag-eyes"],
              },
            ],
          },
        },
      },
    }),
  ).toThrow("payload.data.spriteGroups[0].id must be a non-empty string");
});

test("character.update clears spriteGroups when an empty array is provided", () => {
  const state = createCharacterBaseState();
  withTagScope(state, "characterSprites:character-hero", [
    {
      id: "tag-eyes",
      type: "tag",
      name: "Eyes",
    },
  ]);
  state.characters.items["character-hero"].spriteGroups = [
    {
      id: "group-face",
      name: "Face",
      tags: ["tag-eyes"],
    },
  ];

  const result = processCommand({
    state,
    command: {
      type: "character.update",
      payload: {
        characterId: "character-hero",
        data: {
          spriteGroups: [],
        },
      },
    },
  });

  expect(result.valid).toBe(true);
  expect(
    result.state.characters.items["character-hero"].spriteGroups,
  ).toBeUndefined();
});

test("tag.delete removes deleted character sprite group tags and drops empty groups", () => {
  const state = createCharacterBaseState();
  withTagScope(state, "characterSprites:character-hero", [
    {
      id: "tag-eyes",
      type: "tag",
      name: "Eyes",
    },
    {
      id: "tag-mouth",
      type: "tag",
      name: "Mouth",
    },
  ]);
  state.characters.items["character-hero"].spriteGroups = [
    {
      id: "group-face",
      name: "Face",
      tags: ["tag-eyes", "tag-mouth"],
    },
    {
      id: "group-mouth",
      name: "Mouth Only",
      tags: ["tag-mouth"],
    },
  ];

  const result = processCommand({
    state,
    command: {
      type: "tag.delete",
      payload: {
        scopeKey: "characterSprites:character-hero",
        tagIds: ["tag-mouth"],
      },
    },
  });

  expect(result.valid).toBe(true);
  expect(result.state.characters.items["character-hero"].spriteGroups).toEqual([
    {
      id: "group-face",
      name: "Face",
      tags: ["tag-eyes"],
    },
  ]);
});

test("tag.delete in characters scope preserves sprite groups from character sprite scopes", () => {
  const state = createCharacterBaseState();
  withTagScope(state, "characters", [
    {
      id: "tag-eyes",
      type: "tag",
      name: "Eyes",
    },
  ]);
  withTagScope(state, "characterSprites:character-hero", [
    {
      id: "tag-eyes",
      type: "tag",
      name: "Eyes",
    },
    {
      id: "tag-mouth",
      type: "tag",
      name: "Mouth",
    },
  ]);
  state.characters.items["character-hero"].tagIds = ["tag-eyes"];
  state.characters.items["character-hero"].spriteGroups = [
    {
      id: "group-face",
      name: "Face",
      tags: ["tag-eyes", "tag-mouth"],
    },
  ];

  const result = processCommand({
    state,
    command: {
      type: "tag.delete",
      payload: {
        scopeKey: "characters",
        tagIds: ["tag-eyes"],
      },
    },
  });

  expect(result.valid).toBe(true);
  expect(
    result.state.characters.items["character-hero"].tagIds,
  ).toBeUndefined();
  expect(result.state.characters.items["character-hero"].spriteGroups).toEqual([
    {
      id: "group-face",
      name: "Face",
      tags: ["tag-eyes", "tag-mouth"],
    },
  ]);
});

const createImageTagUpdateState = () => {
  const state = withTagScope(
    withImageFileRefs(createEmptyTestState()),
    "images",
    [
      {
        id: "tag-bg",
        type: "tag",
        name: "Background",
      },
    ],
  );
  state.images.items["image-a"] = {
    id: "image-a",
    type: "image",
    name: "Image A",
    fileId: "file-image",
    tagIds: ["tag-bg"],
  };
  state.images.tree = [createTreeNode("image-a")];
  return state;
};

const createSoundTagUpdateState = () => {
  const state = withTagScope(
    withSoundFileRefs(createEmptyTestState()),
    "sounds",
    [
      {
        id: "tag-bgm",
        type: "tag",
        name: "BGM",
      },
    ],
  );
  state.sounds.items["sound-a"] = {
    id: "sound-a",
    type: "sound",
    name: "Sound A",
    fileId: "file-sound",
    tagIds: ["tag-bgm"],
  };
  state.sounds.tree = [createTreeNode("sound-a")];
  return state;
};

const createVideoTagUpdateState = () => {
  const state = withTagScope(
    withVideoFileRefs(createEmptyTestState()),
    "videos",
    [
      {
        id: "tag-cutscene",
        type: "tag",
        name: "Cutscene",
      },
    ],
  );
  state.videos.items["video-a"] = {
    id: "video-a",
    type: "video",
    name: "Video A",
    fileId: "file-video",
    thumbnailFileId: "thumb-video",
    tagIds: ["tag-cutscene"],
  };
  state.videos.tree = [createTreeNode("video-a")];
  return state;
};

const createCharacterSpriteTagUpdateState = () => {
  const state = createCharacterBaseState();
  withTagScope(state, "characterSprites:character-hero", [
    {
      id: "tag-smile",
      type: "tag",
      name: "Smile",
    },
  ]);
  state.characters.items["character-hero"].sprites.items["sprite-a"].tagIds = [
    "tag-smile",
  ];
  return state;
};

const undefinedTagIdUpdateCases = [
  {
    type: "image.update",
    createState: createImageTagUpdateState,
    command: {
      type: "image.update",
      payload: {
        imageId: "image-a",
        data: {
          name: "Image Updated",
          tagIds: undefined,
        },
      },
    },
    readItem: (state) => state.images.items["image-a"],
    expectedName: "Image Updated",
    expectedTagIds: ["tag-bg"],
  },
  {
    type: "sound.update",
    createState: createSoundTagUpdateState,
    command: {
      type: "sound.update",
      payload: {
        soundId: "sound-a",
        data: {
          name: "Sound Updated",
          tagIds: undefined,
        },
      },
    },
    readItem: (state) => state.sounds.items["sound-a"],
    expectedName: "Sound Updated",
    expectedTagIds: ["tag-bgm"],
  },
  {
    type: "video.update",
    createState: createVideoTagUpdateState,
    command: {
      type: "video.update",
      payload: {
        videoId: "video-a",
        data: {
          name: "Video Updated",
          tagIds: undefined,
        },
      },
    },
    readItem: (state) => state.videos.items["video-a"],
    expectedName: "Video Updated",
    expectedTagIds: ["tag-cutscene"],
  },
  {
    type: "character.sprite.update",
    createState: createCharacterSpriteTagUpdateState,
    command: {
      type: "character.sprite.update",
      payload: {
        characterId: "character-hero",
        spriteId: "sprite-a",
        data: {
          name: "Smile Updated",
          tagIds: undefined,
        },
      },
    },
    readItem: (state) =>
      state.characters.items["character-hero"].sprites.items["sprite-a"],
    expectedName: "Smile Updated",
    expectedTagIds: ["tag-smile"],
  },
];

test("spritesheet animation fps must be positive when provided", () => {
  const createPayload = {
    spritesheetId: "spritesheet-a",
    data: {
      type: "spritesheet",
      name: "Hero Idle",
      fileId: "file-image",
      jsonData: {
        meta: {
          image: "hero-idle.png",
        },
      },
      animations: {
        idle: {
          frames: [0, 1],
          fps: 12,
        },
      },
    },
  };

  expectValidation(() =>
    validatePayload({
      type: "spritesheet.create",
      payload: {
        ...createPayload,
        data: {
          ...createPayload.data,
          animations: {
            idle: {
              frames: [0, 1],
              fps: 0,
            },
          },
        },
      },
    }),
  ).toThrow(
    "payload.data.animations.idle.fps must be a positive finite number when provided",
  );
});

for (const updateCase of undefinedTagIdUpdateCases) {
  test(`${updateCase.type} ignores own undefined tagIds during updates`, () => {
    const result = processCommand({
      state: updateCase.createState(),
      command: updateCase.command,
    });

    expect(result.valid).toBe(true);

    const item = updateCase.readItem(result.state);
    if (updateCase.expectedName !== undefined) {
      expect(item.name).toBe(updateCase.expectedName);
    }
    if (updateCase.expectedDescription !== undefined) {
      expect(item.description).toBe(updateCase.expectedDescription);
    }
    expect(item.tagIds).toEqual(updateCase.expectedTagIds);
  });
}

test("direct command coverage stays aligned with the public command registry", () => {
  const coveredTypes = directCases.map((entry) => entry.type).sort();
  expect(coveredTypes).toEqual(listCommandTypes().slice().sort());
});

for (const directCase of directCases) {
  test(
    `${directCase.type} accepts a direct valid call`,
    directCase.runPositive,
  );
  test(
    `${directCase.type} rejects a direct invalid call`,
    directCase.runNegative,
  );
}
