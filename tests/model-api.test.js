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

test("public api exports functions only", () => {
  expect(SCHEMA_VERSION).toBe(1);
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

test("registry exposes only fully implemented command types", () => {
  expect(listCommandTypes()).toEqual([
    "project.create",
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
