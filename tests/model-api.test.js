import { expect, test } from "vitest";

import {
  SCHEMA_VERSION,
  createInvariantValidationError,
  createPayloadValidationError,
  createPreconditionValidationError,
  createStateValidationError,
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { listCommandTypes } from "../src/model.js";

test("public api exports functions only", () => {
  expect(SCHEMA_VERSION).toBe(1);
  expect(typeof validateState).toBe("function");
  expect(typeof validatePayload).toBe("function");
  expect(typeof validateAgainstState).toBe("function");
  expect(typeof processCommand).toBe("function");
  expect(typeof createPayloadValidationError).toBe("function");
  expect(typeof createPreconditionValidationError).toBe("function");
  expect(typeof createStateValidationError).toBe("function");
  expect(typeof createInvariantValidationError).toBe("function");
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
  expect(createPayloadValidationError("x").code).toBe("payload_validation_failed");
  expect(createPreconditionValidationError("x").code).toBe(
    "precondition_validation_failed",
  );
  expect(createStateValidationError("x").code).toBe("state_validation_failed");
  expect(createInvariantValidationError("x").code).toBe(
    "invariant_validation_failed",
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
