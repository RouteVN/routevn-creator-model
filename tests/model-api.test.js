import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

import {
  RUNTIME_FIELD_IDS,
  SCHEMA_VERSION,
  isRuntimeFieldId,
  processCommand,
  replayCommands,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import {
  createInvariantValidationError,
  createPayloadValidationError,
  createPreconditionValidationError,
  createStateValidationError,
} from "../src/errors.js";
import { listCommandTypes } from "../src/model.js";
import { expectValidation } from "./support/expectValidation.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const addFileRecordToState = (
  state,
  { fileId, mimeType = "image/jpeg", size = 1, sha256 = `${fileId}-sha256` },
) => {
  state.files.items[fileId] = {
    id: fileId,
    type: "image",
    mimeType,
    size,
    sha256,
  };
  state.files.tree.push({
    id: fileId,
    children: [],
  });
};

const readPackageSchemaVersion = async () => {
  const packageJsonFile = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonFile, "utf8"));
  const schemaVersion = Number.parseInt(
    String(packageJson.version ?? "").split(".")[1] ?? "",
    10,
  );

  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    throw new Error(
      "package.json version must include a positive integer minor version for schemaVersion",
    );
  }

  return schemaVersion;
};

test("public api exports functions only", async () => {
  expect(SCHEMA_VERSION).toBe(await readPackageSchemaVersion());
  expect(typeof validateState).toBe("function");
  expect(typeof validatePayload).toBe("function");
  expect(typeof validateAgainstState).toBe("function");
  expect(typeof processCommand).toBe("function");
  expect(typeof replayCommands).toBe("function");
});

test("runtime field ids match the public runtime contract", () => {
  expect(RUNTIME_FIELD_IDS).toEqual([
    "dialogueTextSpeed",
    "autoForwardDelay",
    "skipUnseenText",
    "skipTransitionsAndAnimations",
    "soundVolume",
    "musicVolume",
    "muteAll",
    "saveLoadPagination",
    "menuPage",
    "menuEntryPoint",
    "autoMode",
    "skipMode",
    "dialogueUIHidden",
    "isLineCompleted",
  ]);
});

test("isRuntimeFieldId accepts known runtime ids and rejects unknown values", () => {
  expect(isRuntimeFieldId("dialogueTextSpeed")).toBe(true);
  expect(isRuntimeFieldId("saveLoadPagination")).toBe(true);
  expect(isRuntimeFieldId("unknownRuntimeField")).toBe(false);
  expect(isRuntimeFieldId("_dialogueTextSpeed")).toBe(false);
  expect(isRuntimeFieldId(undefined)).toBe(false);
});

test("validation functions return valid results instead of throwing", () => {
  expect(
    validatePayload({
      type: "story.update",
      payload: {
        data: {
          initialSceneId: null,
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "story.update",
      payload: {
        data: {
          title: "Invalid",
        },
      },
    }),
  ).toEqual({
    valid: false,
    error: {
      kind: "payload",
      code: "payload_validation_failed",
      message: "payload.data.title is not allowed",
    },
  });
});

test("error factories return normal errors, not custom classes", () => {
  const error = createPayloadValidationError("x");

  expect(error instanceof Error).toBe(true);
  expect(error.constructor).toBe(Error);
  expect(error.name).toBe("PayloadValidationError");
  expect(error.code).toBe("payload_validation_failed");
  expect(error.message).toBe("x");
  expect(error.details).toEqual({});
});

test("different error factories produce distinct public error codes", () => {
  expect(createPayloadValidationError("x").code).toBe(
    "payload_validation_failed",
  );
  expect(createPreconditionValidationError("x").code).toBe(
    "precondition_validation_failed",
  );
  expect(createStateValidationError("x").code).toBe("state_validation_failed");
  expect(createInvariantValidationError("x").code).toBe(
    "invariant_validation_failed",
  );
});

test("validatePayload rejects duplicate scene ids in scene.delete", () => {
  expectValidation(() =>
    validatePayload({
      type: "scene.delete",
      payload: {
        sceneIds: ["scene-a", "scene-a"],
      },
    }),
  ).toThrow("payload.sceneIds[1] must be unique");
});

test("validatePayload rejects duplicate line ids in line.create", () => {
  expectValidation(() =>
    validatePayload({
      type: "line.create",
      payload: {
        sectionId: "section-a",
        lines: [
          {
            lineId: "line-a",
            data: {
              actions: {},
            },
          },
          {
            lineId: "line-a",
            data: {
              actions: {},
            },
          },
        ],
      },
    }),
  ).toThrow("payload.lines[1].lineId must be unique");
});

test("validatePayload rejects keyboard data in layout.update", () => {
  expectValidation(() =>
    validatePayload({
      type: "layout.update",
      payload: {
        layoutId: "layout-dialogue",
        data: {
          keyboard: {
            enter: {
              payload: {
                actions: {
                  nextLine: {},
                },
              },
            },
          },
        },
      },
    }),
  ).toThrow("payload.data.keyboard is not allowed");
});

test("validatePayload accepts keyboard data in control.update", () => {
  expect(
    validatePayload({
      type: "control.update",
      payload: {
        controlId: "control-default",
        data: {
          keyboard: {
            enter: {
              payload: {
                actions: {
                  nextLine: {},
                },
              },
            },
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts description, thumbnailFileId, and preview on layouts, controls, and character sprites", () => {
  expect(
    validatePayload({
      type: "layout.create",
      payload: {
        layoutId: "layout-thumb",
        data: {
          type: "layout",
          name: "Thumbnail Layout",
          description: "Main dialogue frame",
          layoutType: "general",
          thumbnailFileId: "file-thumb-layout",
          preview: {
            backgroundImageId: "image-preview",
          },
          elements: {
            items: {},
            tree: [],
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.update",
      payload: {
        layoutId: "layout-thumb",
        data: {
          description: "Main dialogue frame",
          thumbnailFileId: "file-thumb-layout",
          preview: {
            variables: {
              score: 7,
            },
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "control.create",
      payload: {
        controlId: "control-thumb",
        data: {
          type: "control",
          name: "Thumbnail Control",
          description: "Shared navigation control",
          thumbnailFileId: "file-thumb-control",
          preview: {
            runtime: {
              autoMode: true,
            },
          },
          elements: {
            items: {},
            tree: [],
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "control.update",
      payload: {
        controlId: "control-thumb",
        data: {
          description: "Shared navigation control",
          thumbnailFileId: "file-thumb-control",
          preview: {
            choice: {
              items: [{ content: "Play" }],
            },
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "character.create",
      payload: {
        characterId: "character-thumb",
        data: {
          type: "character",
          name: "Thumbnail Character",
          sprites: {
            items: {
              "folder-default": {
                id: "folder-default",
                type: "folder",
                name: "Default",
                description: "Default sprite group",
              },
              "sprite-default": {
                id: "sprite-default",
                type: "image",
                name: "Default Sprite",
                description: "Neutral idle sprite",
                fileId: "file-sprite",
                thumbnailFileId: "file-sprite-thumb",
              },
            },
            tree: [
              {
                id: "folder-default",
                children: [{ id: "sprite-default", children: [] }],
              },
            ],
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "character.sprite.create",
      payload: {
        characterId: "character-thumb",
        spriteId: "sprite-new",
        data: {
          type: "image",
          name: "New Sprite",
          fileId: "file-sprite",
          thumbnailFileId: "file-sprite-thumb",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "character.sprite.update",
      payload: {
        characterId: "character-thumb",
        spriteId: "sprite-default",
        data: {
          thumbnailFileId: "file-sprite-thumb",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts save-load layout type", () => {
  expect(
    validatePayload({
      type: "layout.create",
      payload: {
        layoutId: "layout-save-load",
        data: {
          type: "layout",
          name: "Save Load Layout",
          layoutType: "save-load",
          elements: {
            items: {},
            tree: [],
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.update",
      payload: {
        layoutId: "layout-save-load",
        data: {
          layoutType: "save-load",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.update",
      payload: {
        layoutId: "layout-confirm",
        data: {
          layoutType: "confirmDialog",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.create",
      payload: {
        layoutId: "layout-history",
        data: {
          type: "layout",
          name: "History Layout",
          layoutType: "history",
          elements: {
            items: {},
            tree: [],
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.update",
      payload: {
        layoutId: "layout-history",
        data: {
          layoutType: "history",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts isFragment on layouts", () => {
  expect(
    validatePayload({
      type: "layout.create",
      payload: {
        layoutId: "layout-normal",
        data: {
          type: "layout",
          name: "Fragment Layout",
          layoutType: "general",
          isFragment: true,
          elements: {
            items: {},
            tree: [],
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.update",
      payload: {
        layoutId: "layout-normal",
        data: {
          isFragment: true,
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.update",
      payload: {
        layoutId: "layout-normal",
        data: {
          description: "Layout description",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("processCommand persists keyboard data on controls", () => {
  const state = createEmptyTestState();

  state.controls.items["control-default"] = {
    id: "control-default",
    type: "control",
    name: "Default Control",
    elements: {
      items: {},
      tree: [],
    },
  };
  state.controls.tree = [{ id: "control-default", children: [] }];

  const result = processCommand({
    state,
    command: {
      type: "control.update",
      payload: {
        controlId: "control-default",
        data: {
          keyboard: {
            enter: {
              payload: {
                actions: {
                  nextLine: {},
                },
              },
            },
          },
        },
      },
    },
  });

  expect(result.valid).toBe(true);
  expect(result.state.controls.items["control-default"].keyboard).toEqual({
    enter: {
      payload: {
        actions: {
          nextLine: {},
        },
      },
    },
  });
  expect(validateState({ state: result.state })).toEqual({
    valid: true,
  });
});

test("processCommand persists description, thumbnailFileId, and preview on layouts and controls", () => {
  const state = createEmptyTestState();

  addFileRecordToState(state, { fileId: "file-layout-thumb" });
  addFileRecordToState(state, { fileId: "file-control-thumb" });

  state.layouts.items["layout-default"] = {
    id: "layout-default",
    type: "layout",
    name: "Default Layout",
    layoutType: "general",
    elements: {
      items: {},
      tree: [],
    },
  };
  state.layouts.tree = [{ id: "layout-default", children: [] }];

  state.controls.items["control-default"] = {
    id: "control-default",
    type: "control",
    name: "Default Control",
    elements: {
      items: {},
      tree: [],
    },
  };
  state.controls.tree = [{ id: "control-default", children: [] }];

  const layoutResult = processCommand({
    state,
    command: {
      type: "layout.update",
      payload: {
        layoutId: "layout-default",
        data: {
          description: "Main dialogue frame",
          thumbnailFileId: "file-layout-thumb",
          preview: {
            backgroundImageId: "image-layout-preview",
            runtime: {
              autoMode: true,
            },
          },
        },
      },
    },
  });

  expect(layoutResult.valid).toBe(true);
  expect(layoutResult.state.layouts.items["layout-default"].description).toBe(
    "Main dialogue frame",
  );
  expect(
    layoutResult.state.layouts.items["layout-default"].thumbnailFileId,
  ).toBe("file-layout-thumb");
  expect(layoutResult.state.layouts.items["layout-default"].preview).toEqual({
    backgroundImageId: "image-layout-preview",
    runtime: {
      autoMode: true,
    },
  });

  const controlResult = processCommand({
    state: layoutResult.state,
    command: {
      type: "control.update",
      payload: {
        controlId: "control-default",
        data: {
          description: "Shared navigation control",
          thumbnailFileId: "file-control-thumb",
          preview: {
            choice: {
              items: [{ content: "Continue" }],
            },
          },
        },
      },
    },
  });

  expect(controlResult.valid).toBe(true);
  expect(
    controlResult.state.controls.items["control-default"].description,
  ).toBe("Shared navigation control");
  expect(
    controlResult.state.controls.items["control-default"].thumbnailFileId,
  ).toBe("file-control-thumb");
  expect(controlResult.state.controls.items["control-default"].preview).toEqual(
    {
      choice: {
        items: [{ content: "Continue" }],
      },
    },
  );
  expect(validateState({ state: controlResult.state })).toEqual({
    valid: true,
  });
});

test("processCommand persists thumbnailFileId on character sprites", () => {
  const state = createEmptyTestState();

  addFileRecordToState(state, { fileId: "file-sprite-initial" });
  addFileRecordToState(state, { fileId: "file-sprite-initial-thumb" });
  addFileRecordToState(state, { fileId: "file-sprite-created" });
  addFileRecordToState(state, { fileId: "file-sprite-created-thumb" });
  addFileRecordToState(state, { fileId: "file-sprite-updated-thumb" });

  const characterResult = processCommand({
    state,
    command: {
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
              "sprite-initial": {
                id: "sprite-initial",
                type: "image",
                name: "Neutral",
                fileId: "file-sprite-initial",
                thumbnailFileId: "file-sprite-initial-thumb",
              },
            },
            tree: [
              {
                id: "folder-default",
                children: [{ id: "sprite-initial", children: [] }],
              },
            ],
          },
        },
      },
    },
  });

  expect(characterResult.valid).toBe(true);
  expect(
    characterResult.state.characters.items["character-hero"].sprites.items[
      "sprite-initial"
    ].thumbnailFileId,
  ).toBe("file-sprite-initial-thumb");
  expect(validateState({ state: characterResult.state })).toEqual({
    valid: true,
  });

  const spriteCreateResult = processCommand({
    state: characterResult.state,
    command: {
      type: "character.sprite.create",
      payload: {
        characterId: "character-hero",
        spriteId: "sprite-created",
        parentId: "folder-default",
        data: {
          type: "image",
          name: "Happy",
          fileId: "file-sprite-created",
          thumbnailFileId: "file-sprite-created-thumb",
        },
      },
    },
  });

  expect(spriteCreateResult.valid).toBe(true);
  expect(
    spriteCreateResult.state.characters.items["character-hero"].sprites.items[
      "sprite-created"
    ].thumbnailFileId,
  ).toBe("file-sprite-created-thumb");
  expect(validateState({ state: spriteCreateResult.state })).toEqual({
    valid: true,
  });

  const spriteUpdateResult = processCommand({
    state: spriteCreateResult.state,
    command: {
      type: "character.sprite.update",
      payload: {
        characterId: "character-hero",
        spriteId: "sprite-initial",
        data: {
          thumbnailFileId: "file-sprite-updated-thumb",
        },
      },
    },
  });

  expect(spriteUpdateResult.valid).toBe(true);
  expect(
    spriteUpdateResult.state.characters.items["character-hero"].sprites.items[
      "sprite-initial"
    ].thumbnailFileId,
  ).toBe("file-sprite-updated-thumb");
  expect(validateState({ state: spriteUpdateResult.state })).toEqual({
    valid: true,
  });
});

test("validateState accepts legacy state without controls collection", () => {
  const state = createEmptyTestState();
  delete state.controls;

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts legacy state without tags root", () => {
  const state = createEmptyTestState();
  delete state.tags;

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("processCommand materializes normalized tags root for legacy states", () => {
  const state = createEmptyTestState();
  delete state.tags;

  const result = processCommand({
    state,
    command: {
      type: "story.update",
      payload: {
        data: {
          initialSceneId: null,
        },
      },
    },
  });

  expect(result.valid).toBe(true);
  expect(result.state.tags).toEqual({
    images: {
      items: {},
      tree: [],
    },
    sounds: {
      items: {},
      tree: [],
    },
    videos: {
      items: {},
      tree: [],
    },
  });
});

test("validatePayload rejects unsupported animation easing values", () => {
  expectValidation(() =>
    validatePayload({
      type: "animation.update",
      payload: {
        animationId: "animation-a",
        data: {
          animation: {
            type: "update",
            tween: {
              x: {
                initialValue: 10,
                keyframes: [
                  {
                    duration: 300,
                    value: 50,
                    easing: "easeInWhatever",
                  },
                ],
              },
            },
          },
        },
      },
    }),
  ).toThrow(
    "payload.data.animation.tween.x.keyframes[0].easing must be a supported Route Graphics easing",
  );
});

test("validatePayload accepts empty transition tween keyframes arrays", () => {
  expect(
    validatePayload({
      type: "animation.update",
      payload: {
        animationId: "animation-a",
        data: {
          animation: {
            type: "transition",
            next: {
              tween: {
                translateX: {
                  initialValue: 1,
                  keyframes: [],
                },
              },
            },
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts empty update tween keyframes arrays", () => {
  expect(
    validatePayload({
      type: "animation.update",
      payload: {
        animationId: "animation-a",
        data: {
          animation: {
            type: "update",
            tween: {
              x: {
                keyframes: [],
              },
            },
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});
test("validatePayload rejects invalid transition mask textures", () => {
  expectValidation(() =>
    validatePayload({
      type: "animation.update",
      payload: {
        animationId: "animation-a",
        data: {
          animation: {
            type: "transition",
            mask: {
              kind: "sequence",
              textures: ["mask-a", ""],
            },
          },
        },
      },
    }),
  ).toThrow(
    "payload.data.animation.mask.textures[1] must be a non-empty string",
  );
});

test("validatePayload accepts editor transition mask fields", () => {
  expect(
    validatePayload({
      type: "animation.update",
      payload: {
        animationId: "animation-a",
        data: {
          animation: {
            type: "transition",
            mask: {
              kind: "sequence",
              imageIds: ["image-a", "image-b"],
              channel: "red",
              invert: false,
              softness: 0.08,
              sample: "linear",
              progressDuration: 900,
              progressEasing: "linear",
            },
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts layout element rightClick interactions", () => {
  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "button-1",
        replace: false,
        data: {
          rightClick: {
            payload: {
              actions: {
                nextLine: {},
              },
            },
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts layout element textStyle overrides", () => {
  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "text-1",
        replace: false,
        data: {
          textStyle: {
            align: "center",
            wordWrapWidth: 480,
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts layout element revealEffect", () => {
  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "text-1",
        replace: false,
        data: {
          revealEffect: "softWipe",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts layout element fragment references", () => {
  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "fragment-1",
        replace: false,
        data: {
          type: "fragment-ref",
          name: "Fragment",
          fragmentLayoutId: "layout-fragment",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts layout element particle references", () => {
  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "particle-1",
        replace: false,
        data: {
          type: "particle",
          name: "Snow Overlay",
          particleId: "particle-snow",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload accepts line.update_actions preserve for dialogue.content", () => {
  expect(
    validatePayload({
      type: "line.update_actions",
      payload: {
        lineId: "line-1",
        data: {
          dialogue: {
            characterId: "character-1",
          },
        },
        preserve: ["dialogue.content"],
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validatePayload rejects unsupported line.update_actions preserve paths", () => {
  expect(
    validatePayload({
      type: "line.update_actions",
      payload: {
        lineId: "line-1",
        data: {
          dialogue: {
            characterId: "character-1",
          },
        },
        preserve: ["dialogue.characterId"],
      },
    }),
  ).toEqual({
    valid: false,
    error: expect.objectContaining({
      message:
        "payload.preserve[0] must be one of: dialogue.content",
    }),
  });
});

test("validatePayload accepts confirm dialog container refs", () => {
  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "confirm-ok",
        replace: false,
        data: {
          type: "container-ref-confirm-dialog-ok",
          name: "Container (Confirm OK)",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "confirm-cancel",
        replace: false,
        data: {
          type: "container-ref-confirm-dialog-cancel",
          name: "Container (Confirm Cancel)",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validateState accepts layout elements with rightClick interactions", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "button-1": {
          id: "button-1",
          type: "container",
          name: "Button",
          x: 0,
          y: 0,
          width: 200,
          height: 60,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          rightClick: {
            payload: {
              actions: {
                sectionTransition: {
                  sceneId: "scene-b",
                  sectionId: "section-b",
                },
              },
            },
          },
        },
      },
      tree: [
        {
          id: "button-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });
  state.scenes.items["scene-b"] = {
    id: "scene-b",
    type: "scene",
    name: "Scene B",
    sections: {
      items: {
        "section-b": {
          id: "section-b",
          name: "Section B",
          lines: {
            items: {},
            tree: [],
          },
        },
      },
      tree: [
        {
          id: "section-b",
          children: [],
        },
      ],
    },
  };
  state.scenes.tree.push({
    id: "scene-b",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts layout elements with aspectRatioLock", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "sprite-1": {
          id: "sprite-1",
          type: "sprite",
          name: "Sprite",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          aspectRatioLock: 2,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      },
      tree: [
        {
          id: "sprite-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("layout element containers use gapX and gapY", () => {
  expect(
    validatePayload({
      type: "layout.element.create",
      payload: {
        layoutId: "layout-ui",
        elementId: "container-root",
        data: {
          type: "container",
          name: "Root",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          gapX: 16,
          gapY: 12,
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-ui",
        elementId: "container-root",
        data: {
          direction: "absolute",
        },
      },
    }),
  ).toEqual({
    valid: true,
  });

  const state = createEmptyTestState();
  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "container-root": {
          id: "container-root",
          type: "container",
          name: "Root",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          gapX: 16,
          gapY: 12,
        },
      },
      tree: [
        {
          id: "container-root",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts layout elements with absolute direction", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "container-1": {
          id: "container-1",
          type: "container",
          name: "Container",
          x: 0,
          y: 0,
          width: 200,
          height: 60,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          direction: "absolute",
        },
      },
      tree: [
        {
          id: "container-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts layout elements with textStyle overrides", () => {
  const state = createEmptyTestState();

  state.files.items["file-font-ui"] = {
    id: "file-font-ui",
    type: "font",
    mimeType: "font/ttf",
    size: 1,
    sha256: "font-ui-sha256",
  };
  state.files.tree.push({
    id: "file-font-ui",
    children: [],
  });

  state.fonts.items["font-ui"] = {
    id: "font-ui",
    type: "font",
    name: "UI Font",
    fileId: "file-font-ui",
    fontFamily: "Suit",
  };
  state.fonts.tree.push({
    id: "font-ui",
    children: [],
  });

  state.colors.items["color-ui"] = {
    id: "color-ui",
    type: "color",
    name: "White",
    hex: "#ffffff",
  };
  state.colors.tree.push({
    id: "color-ui",
    children: [],
  });

  state.textStyles.items["text-style-ui"] = {
    id: "text-style-ui",
    type: "textStyle",
    name: "UI Text",
    fontId: "font-ui",
    colorId: "color-ui",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.tree.push({
    id: "text-style-ui",
    children: [],
  });

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "text-1": {
          id: "text-1",
          type: "text",
          name: "Label",
          x: 0,
          y: 0,
          width: 400,
          height: 80,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "text-style-ui",
          textStyle: {
            align: "center",
            wordWrapWidth: 480,
          },
        },
      },
      tree: [
        {
          id: "text-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts layout elements with revealEffect", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "dialogue-adv",
    elements: {
      items: {
        "text-1": {
          id: "text-1",
          type: "text-revealing-ref-dialogue-content",
          name: "Dialogue",
          x: 0,
          y: 0,
          width: 400,
          height: 80,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          revealEffect: "softWipe",
        },
      },
      tree: [
        {
          id: "text-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts history layout element references", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-history"] = {
    id: "layout-history",
    type: "layout",
    name: "History",
    layoutType: "history",
    elements: {
      items: {
        "history-item": {
          id: "history-item",
          type: "container-ref-history-line",
          name: "History Item",
          x: 0,
          y: 0,
          width: 800,
          height: 120,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        "history-character": {
          id: "history-character",
          type: "text-ref-history-line-character-name",
          name: "Character",
          x: 0,
          y: 0,
          width: 160,
          height: 32,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        "history-content": {
          id: "history-content",
          type: "text-ref-history-line-content",
          name: "Content",
          x: 0,
          y: 40,
          width: 760,
          height: 64,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      },
      tree: [
        {
          id: "history-item",
          children: [
            {
              id: "history-character",
              children: [],
            },
            {
              id: "history-content",
              children: [],
            },
          ],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-history",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts layout elements with fragment references", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-fragment"] = {
    id: "layout-fragment",
    type: "layout",
    name: "Fragment",
    layoutType: "general",
    isFragment: true,
    elements: {
      items: {
        "fragment-text": {
          id: "fragment-text",
          type: "text",
          name: "Fragment Text",
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
        },
      },
      tree: [
        {
          id: "fragment-text",
          children: [],
        },
      ],
    },
  };
  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "fragment-1": {
          id: "fragment-1",
          type: "fragment-ref",
          name: "Fragment Ref",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          fragmentLayoutId: "layout-fragment",
        },
      },
      tree: [
        {
          id: "fragment-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-fragment",
    children: [],
  });
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts layout slider variableId refs to project variables", () => {
  const state = createEmptyTestState();
  state.variables.items["variable-ui"] = {
    id: "variable-ui",
    type: "number",
    name: "UI Value",
    scope: "device",
    default: 50,
    value: 50,
  };
  state.variables.tree.push({
    id: "variable-ui",
    children: [],
  });

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "slider-1": {
          id: "slider-1",
          type: "slider",
          name: "Slider",
          x: 0,
          y: 0,
          width: 400,
          height: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          min: 0,
          max: 100,
          step: 1,
          variableId: "variable-ui",
        },
      },
      tree: [
        {
          id: "slider-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState rejects layout slider variableId refs to legacy system variables", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "slider-1": {
          id: "slider-1",
          type: "slider",
          name: "Slider",
          x: 0,
          y: 0,
          width: 400,
          height: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          min: 0,
          max: 100,
          step: 1,
          variableId: "_dialogueTextSpeed",
        },
      },
      tree: [
        {
          id: "slider-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: false,
    error: {
      kind: "invariant",
      code: "invariant_validation_failed",
      message:
        "layout element variableId must reference an existing non-folder variable",
      details: {
        elementId: "slider-1",
        layoutId: "layout-ui",
        variableId: "_dialogueTextSpeed",
      },
    },
  });
});

test("validateState accepts conditional text styles on layout elements", () => {
  const state = createEmptyTestState();

  state.files.items["file-image-a"] = {
    id: "file-image-a",
    type: "image",
    mimeType: "image/png",
    size: 1,
    sha256: "image-a-sha256",
  };
  state.files.items["file-image-a-thumb"] = {
    id: "file-image-a-thumb",
    type: "image",
    mimeType: "image/png",
    size: 1,
    sha256: "image-a-thumb-sha256",
  };
  state.files.tree.push({
    id: "file-image-a",
    children: [],
  });
  state.files.tree.push({
    id: "file-image-a-thumb",
    children: [],
  });

  state.images.items["image-a"] = {
    id: "image-a",
    type: "image",
    name: "Image A",
    fileId: "file-image-a",
    thumbnailFileId: "file-image-a-thumb",
  };
  state.images.tree.push({
    id: "image-a",
    children: [],
  });

  state.files.items["file-font-ui"] = {
    id: "file-font-ui",
    type: "font",
    mimeType: "font/ttf",
    size: 1,
    sha256: "font-ui-sha256",
  };
  state.files.tree.push({
    id: "file-font-ui",
    children: [],
  });

  state.fonts.items["font-ui"] = {
    id: "font-ui",
    type: "font",
    name: "UI Font",
    fileId: "file-font-ui",
    fontFamily: "Suit",
  };
  state.fonts.tree.push({
    id: "font-ui",
    children: [],
  });

  state.colors.items["color-ui"] = {
    id: "color-ui",
    type: "color",
    name: "White",
    hex: "#ffffff",
  };
  state.colors.tree.push({
    id: "color-ui",
    children: [],
  });

  state.textStyles.items["text-style-ui"] = {
    id: "text-style-ui",
    type: "textStyle",
    name: "UI Text",
    fontId: "font-ui",
    colorId: "color-ui",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.items["text-style-alert"] = {
    id: "text-style-alert",
    type: "textStyle",
    name: "Alert Text",
    fontId: "font-ui",
    colorId: "color-ui",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.tree.push({
    id: "text-style-ui",
    children: [],
  });
  state.textStyles.tree.push({
    id: "text-style-alert",
    children: [],
  });

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "text-1": {
          id: "text-1",
          type: "text",
          name: "Label",
          x: 0,
          y: 0,
          width: 400,
          height: 80,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "text-style-ui",
          conditionalOverrides: [
            {
              when: {
                target: "runtime.saveLoadPagination",
                op: "eq",
                value: 1,
              },
              set: {
                textStyleId: "text-style-alert",
                hoverTextStyleId: "text-style-alert",
                clickTextStyleId: "text-style-alert",
                opacity: 0.5,
                anchorX: 0.5,
                anchorY: 1,
                visible: false,
                textStyle: {
                  align: "center",
                },
              },
            },
            {
              when: {
                target: "runtime.isLineCompleted",
                op: "eq",
                value: true,
              },
              set: {
                textStyleId: "text-style-alert",
              },
            },
            {
              when: {
                target: "runtime.autoMode",
                op: "eq",
                value: false,
              },
              set: {
                textStyleId: "text-style-alert",
              },
            },
            {
              when: {
                target: "runtime.skipMode",
                op: "eq",
                value: true,
              },
              set: {
                textStyleId: "text-style-alert",
              },
            },
          ],
        },
        "sprite-1": {
          id: "sprite-1",
          type: "sprite",
          name: "Portrait",
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          imageId: "image-a",
          conditionalOverrides: [
            {
              when: {
                target: "runtime.autoMode",
                op: "eq",
                value: true,
              },
              set: {
                imageId: "image-a",
                hoverImageId: "image-a",
                clickImageId: "image-a",
                opacity: 0.25,
                visible: false,
              },
            },
          ],
        },
      },
      tree: [
        {
          id: "text-1",
          children: [],
        },
        {
          id: "sprite-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState rejects legacy runtime condition targets on layout elements", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "text-1": {
          id: "text-1",
          type: "text",
          name: "Label",
          x: 0,
          y: 0,
          width: 400,
          height: 80,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          conditionalOverrides: [
            {
              when: {
                target: "dialogue.characterId",
                op: "eq",
                value: "character-1",
              },
              set: {
                visible: false,
              },
            },
          ],
        },
      },
      tree: [
        {
          id: "text-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState accepts container child interaction inheritance flags", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "container-1": {
          id: "container-1",
          type: "container",
          name: "Container",
          x: 0,
          y: 0,
          width: 200,
          height: 60,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          hover: {
            inheritToChildren: true,
          },
          click: {
            inheritToChildren: true,
          },
          rightClick: {
            inheritToChildren: true,
          },
        },
      },
      tree: [
        {
          id: "container-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateState rejects legacy layout element style overrides", () => {
  const state = createEmptyTestState();

  state.files.items["file-font-ui"] = {
    id: "file-font-ui",
    type: "font",
    mimeType: "font/ttf",
    size: 1,
    sha256: "font-ui-sha256",
  };
  state.files.tree.push({
    id: "file-font-ui",
    children: [],
  });

  state.fonts.items["font-ui"] = {
    id: "font-ui",
    type: "font",
    name: "UI Font",
    fileId: "file-font-ui",
    fontFamily: "Suit",
  };
  state.fonts.tree.push({
    id: "font-ui",
    children: [],
  });

  state.colors.items["color-ui"] = {
    id: "color-ui",
    type: "color",
    name: "White",
    hex: "#ffffff",
  };
  state.colors.tree.push({
    id: "color-ui",
    children: [],
  });

  state.textStyles.items["text-style-ui"] = {
    id: "text-style-ui",
    type: "textStyle",
    name: "UI Text",
    fontId: "font-ui",
    colorId: "color-ui",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.tree.push({
    id: "text-style-ui",
    children: [],
  });

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "general",
    elements: {
      items: {
        "text-1": {
          id: "text-1",
          type: "text",
          name: "Label",
          x: 0,
          y: 0,
          width: 400,
          height: 80,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "text-style-ui",
          style: {
            align: "center",
          },
        },
      },
      tree: [
        {
          id: "text-1",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({
    id: "layout-ui",
    children: [],
  });

  expectValidation(() => validateState({ state })).toThrow(
    "state.layouts.items.layout-ui.elements.items.text-1.style is not allowed",
  );
});

test("validateState requires the files collection", () => {
  const state = createEmptyTestState();
  delete state.files;

  expect(validateState({ state })).toEqual({
    valid: false,
    error: {
      kind: "state",
      code: "state_validation_failed",
      message: "state.files is required",
    },
  });
});

test("processCommand rejects image creation when referenced files are missing", () => {
  const state = createEmptyTestState();

  expect(
    processCommand({
      state,
      command: {
        type: "image.create",
        payload: {
          imageId: "image-a",
          data: {
            type: "image",
            name: "Background",
            fileId: "file-image-a",
          },
        },
      },
    }),
  ).toEqual({
    valid: false,
    error: {
      kind: "precondition",
      code: "precondition_validation_failed",
      message: "payload.data.fileId must reference an existing non-folder file",
      details: {
        imageId: "image-a",
        field: "fileId",
        fileId: "file-image-a",
      },
    },
  });
});

test("validateState accepts file references without semantic file-kind checks", () => {
  const state = createEmptyTestState();

  state.files.items["file-audio"] = {
    id: "file-audio",
    mimeType: "audio/mpeg",
    size: 128,
    sha256: "file-audio-sha256",
  };
  state.files.tree = [
    {
      id: "file-audio",
      children: [],
    },
  ];
  state.images.items["image-a"] = {
    id: "image-a",
    type: "image",
    name: "Image A",
    fileId: "file-audio",
  };
  state.images.tree = [
    {
      id: "image-a",
      children: [],
    },
  ];

  expect(validateState({ state })).toEqual({
    valid: true,
  });
});

test("validateAgainstState accepts image creation without semantic file-kind checks", () => {
  const state = createEmptyTestState();

  state.files.items["file-audio"] = {
    id: "file-audio",
    mimeType: "audio/mpeg",
    size: 128,
    sha256: "file-audio-sha256",
  };
  state.files.tree = [
    {
      id: "file-audio",
      children: [],
    },
  ];

  expect(
    validateAgainstState({
      state,
      command: {
        type: "image.create",
        payload: {
          imageId: "image-a",
          data: {
            type: "image",
            name: "Image A",
            fileId: "file-audio",
          },
        },
      },
    }),
  ).toEqual({
    valid: true,
  });
});

test("validateAgainstState rejects missing transition mask image refs", () => {
  const state = createEmptyTestState();

  state.animations.items["animation-a"] = {
    id: "animation-a",
    type: "animation",
    name: "Animation A",
    animation: {
      type: "update",
      tween: {
        x: {
          initialValue: 0,
          keyframes: [{ duration: 100, value: 1 }],
        },
      },
    },
  };
  state.animations.tree = [
    {
      id: "animation-a",
      children: [],
    },
  ];

  expectValidation(() =>
    validateAgainstState({
      state,
      command: {
        type: "animation.update",
        payload: {
          animationId: "animation-a",
          data: {
            animation: {
              type: "transition",
              mask: {
                kind: "sequence",
                imageIds: ["image-missing"],
              },
            },
          },
        },
      },
    }),
  ).toThrow(
    "payload.data.animation.mask.imageIds[0] must reference an existing non-folder image",
  );
});

test("validateState rejects transition mask image refs to missing images", () => {
  const state = createEmptyTestState();

  state.animations.items["animation-a"] = {
    id: "animation-a",
    type: "animation",
    name: "Animation A",
    animation: {
      type: "transition",
      mask: {
        kind: "single",
        imageId: "image-missing",
      },
    },
  };
  state.animations.tree = [
    {
      id: "animation-a",
      children: [],
    },
  ];

  expectValidation(() => validateState({ state })).toThrow(
    "animation.mask.imageId must reference an existing non-folder image",
  );
});

test("validateAgainstState rejects deleting folders that contain referenced files", () => {
  const state = createEmptyTestState();

  state.files.items["folder-a"] = {
    id: "folder-a",
    type: "folder",
    name: "Folder A",
  };
  state.files.items["file-image"] = {
    id: "file-image",
    mimeType: "image/png",
    size: 128,
    sha256: "file-image-sha256",
  };
  state.files.tree = [
    {
      id: "folder-a",
      children: [
        {
          id: "file-image",
          children: [],
        },
      ],
    },
  ];
  state.images.items["image-a"] = {
    id: "image-a",
    type: "image",
    name: "Image A",
    fileId: "file-image",
  };
  state.images.tree = [
    {
      id: "image-a",
      children: [],
    },
  ];

  expect(
    validateAgainstState({
      state,
      command: {
        type: "file.delete",
        payload: {
          fileIds: ["folder-a"],
        },
      },
    }),
  ).toEqual({
    valid: false,
    error: {
      kind: "precondition",
      code: "precondition_validation_failed",
      message: "payload.fileIds cannot delete a referenced file",
      details: {
        fileId: "file-image",
        referenceKind: "image",
        referenceField: "fileId",
        referenceOwnerId: "image-a",
      },
    },
  });
});

test("registry exposes only fully implemented command types", () => {
  expect(listCommandTypes()).toEqual([
    "project.create",
    "file.create",
    "file.delete",
    "file.move",
    "spritesheet.create",
    "spritesheet.update",
    "spritesheet.delete",
    "spritesheet.move",
    "story.update",
    "scene.create",
    "scene.update",
    "scene.delete",
    "scene.move",
    "section.create",
    "section.update",
    "section.delete",
    "section.move",
    "line.create",
    "line.update_actions",
    "line.delete",
    "line.move",
    "image.create",
    "image.update",
    "image.delete",
    "image.move",
    "sound.create",
    "sound.update",
    "sound.delete",
    "sound.move",
    "video.create",
    "video.update",
    "video.delete",
    "video.move",
    "animation.create",
    "animation.update",
    "animation.delete",
    "animation.move",
    "font.create",
    "font.update",
    "font.delete",
    "font.move",
    "color.create",
    "color.update",
    "color.delete",
    "color.move",
    "particle.create",
    "particle.update",
    "particle.delete",
    "particle.move",
    "transform.create",
    "transform.update",
    "transform.delete",
    "transform.move",
    "variable.create",
    "variable.update",
    "variable.delete",
    "variable.move",
    "textStyle.create",
    "textStyle.update",
    "textStyle.delete",
    "textStyle.move",
    "character.create",
    "character.update",
    "character.delete",
    "character.move",
    "layout.create",
    "layout.update",
    "layout.delete",
    "layout.move",
    "control.create",
    "control.update",
    "control.delete",
    "control.move",
    "character.sprite.create",
    "character.sprite.update",
    "character.sprite.delete",
    "character.sprite.move",
    "tag.create",
    "tag.update",
    "tag.delete",
    "layout.element.create",
    "layout.element.update",
    "layout.element.delete",
    "control.element.create",
    "control.element.update",
    "control.element.delete",
    "control.element.move",
    "layout.element.move",
  ]);
});
