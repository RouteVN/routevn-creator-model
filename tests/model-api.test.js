import { expect, test } from "vitest";

import {
  SCHEMA_VERSION,
  processCommand,
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

test("public api exports functions only", () => {
  expect(SCHEMA_VERSION).toBe(2);
  expect(typeof validateState).toBe("function");
  expect(typeof validatePayload).toBe("function");
  expect(typeof validateAgainstState).toBe("function");
  expect(typeof processCommand).toBe("function");
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

test("validateState accepts legacy state without controls collection", () => {
  const state = createEmptyTestState();
  delete state.controls;

  expect(validateState({ state })).toEqual({
    valid: true,
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
            type: "live",
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

test("validatePayload rejects invalid replace mask textures", () => {
  expectValidation(() =>
    validatePayload({
      type: "animation.update",
      payload: {
        animationId: "animation-a",
        data: {
          animation: {
            type: "replace",
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

test("validateState accepts layout elements with rightClick interactions", () => {
  const state = createEmptyTestState();

  state.layouts.items["layout-ui"] = {
    id: "layout-ui",
    type: "layout",
    name: "UI",
    layoutType: "normal",
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
    layoutType: "normal",
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
    layoutType: "normal",
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
