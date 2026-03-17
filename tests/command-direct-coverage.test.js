import { expect, test } from "vitest";

import {
  processCommand,
  validateAgainstState,
  validatePayload,
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

  state.layouts.items["layout-dialogue"] = {
    id: "layout-dialogue",
    type: "layout",
    name: "Dialogue",
    layoutType: "dialogue",
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
      ).toThrow("payload.parentId must reference a section in the same scene");
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
      const result = processCommand({
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
    },
    updateData: {
      width: 1280,
    },
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
        type: "live",
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
      type: "number",
      name: "Score",
      scope: "context",
      default: 0,
      value: 0,
    },
    updateData: {
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
      layoutType: "dialogue",
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
    type: "character.sprite.create",
    runPositive: () => {
      const state = createCharacterBaseState();
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
              opacity: 0.5,
            },
          },
        },
      });

      expect(
        result.state.layouts.items["layout-dialogue"].elements.items["text-a"]
          .opacity,
      ).toBe(0.5);
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
];

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
