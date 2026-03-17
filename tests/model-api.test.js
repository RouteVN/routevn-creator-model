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
      message:
        "payload.data.fileId must reference an existing non-folder file with type 'image'",
      details: {
        imageId: "image-a",
        field: "fileId",
        fileId: "file-image-a",
        expectedFileTypes: ["image"],
      },
    },
  });
});

test("validateState rejects incompatible file kinds in asset references", () => {
  const state = createEmptyTestState();

  state.files.items["file-audio"] = {
    id: "file-audio",
    type: "audio",
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
    valid: false,
    error: {
      kind: "invariant",
      code: "invariant_validation_failed",
      message:
        "image.fileId must reference an existing non-folder file with type 'image'",
      details: {
        imageId: "image-a",
        fileId: "file-audio",
        expectedFileTypes: ["image"],
        actualFileType: "audio",
      },
    },
  });
});

test("validateAgainstState rejects image creation when file kinds are incompatible", () => {
  const state = createEmptyTestState();

  state.files.items["file-audio"] = {
    id: "file-audio",
    type: "audio",
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
    valid: false,
    error: {
      kind: "precondition",
      code: "precondition_validation_failed",
      message:
        "payload.data.fileId must reference an existing non-folder file with type 'image'",
      details: {
        imageId: "image-a",
        field: "fileId",
        fileId: "file-audio",
        expectedFileTypes: ["image"],
        actualFileType: "audio",
      },
    },
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
    type: "image",
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
    "character.sprite.create",
    "character.sprite.update",
    "character.sprite.delete",
    "character.sprite.move",
    "layout.element.create",
    "layout.element.update",
    "layout.element.delete",
    "layout.element.move",
  ]);
});
