import { expect, test } from "vitest";

import { processCommand, validatePayload } from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const createTextStyleState = () => {
  const state = createEmptyTestState();
  state.files.items["file-font-one"] = {
    id: "file-font-one",
    type: "font",
    mimeType: "font/woff2",
    size: 1,
    sha256: "file-font-one-sha256",
  };
  state.files.tree.push({ id: "file-font-one", children: [] });
  state.fonts.items["font-one"] = {
    id: "font-one",
    type: "font",
    name: "Font One",
    fileId: "file-font-one",
    fontFamily: "Font One",
  };
  state.fonts.tree.push({ id: "font-one", children: [] });
  state.colors.items["color-one"] = {
    id: "color-one",
    type: "color",
    name: "Color One",
    hex: "#ffffff",
  };
  state.colors.items["color-shadow"] = {
    id: "color-shadow",
    type: "color",
    name: "Shadow Color",
    hex: "#000000",
  };
  state.colors.tree.push(
    { id: "color-one", children: [] },
    { id: "color-shadow", children: [] },
  );
  return state;
};

const createTextStyleCommand = (shadow) => {
  const data = {
    type: "textStyle",
    name: "Text Style One",
    fontId: "font-one",
    colorId: "color-one",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };

  if (shadow !== undefined) {
    data.shadow = shadow;
  }

  return {
    type: "textStyle.create",
    payload: {
      textStyleId: "text-style-one",
      data,
    },
  };
};

test("textStyle.create validates and persists a shadow", () => {
  const shadow = {
    colorId: "color-shadow",
    alpha: 0.75,
    blur: 4,
    offsetX: 2,
    offsetY: 3,
  };
  const command = createTextStyleCommand(shadow);

  expect(validatePayload(command)).toEqual({ valid: true });

  const result = processCommand({
    state: createTextStyleState(),
    command,
  });

  expect(result.valid).toBe(true);
  expect(result.state.textStyles.items["text-style-one"].shadow).toEqual(
    shadow,
  );
});

test("textStyle.update adds and clears a shadow without persisting clearShadow", () => {
  const createResult = processCommand({
    state: createTextStyleState(),
    command: createTextStyleCommand(undefined),
  });
  expect(createResult.valid).toBe(true);

  const shadow = {
    colorId: "color-shadow",
    alpha: 0.6,
    blur: 6,
    offsetX: -2,
    offsetY: 4,
  };
  const updateResult = processCommand({
    state: createResult.state,
    command: {
      type: "textStyle.update",
      payload: {
        textStyleId: "text-style-one",
        data: { shadow },
      },
    },
  });
  expect(updateResult.valid).toBe(true);
  expect(updateResult.state.textStyles.items["text-style-one"].shadow).toEqual(
    shadow,
  );

  const clearResult = processCommand({
    state: updateResult.state,
    command: {
      type: "textStyle.update",
      payload: {
        textStyleId: "text-style-one",
        data: {
          name: "Text Style Updated",
          clearShadow: true,
        },
      },
    },
  });
  expect(clearResult.valid).toBe(true);
  const clearedTextStyle = clearResult.state.textStyles.items["text-style-one"];
  expect(clearedTextStyle).not.toHaveProperty("shadow");
  expect(clearedTextStyle).not.toHaveProperty("clearShadow");
});

test("text style shadow validation rejects invalid values", () => {
  const command = {
    type: "textStyle.update",
    payload: {
      textStyleId: "text-style-one",
      data: {
        shadow: {
          colorId: "color-shadow",
          alpha: 1.1,
        },
      },
    },
  };

  expect(validatePayload(command)).toMatchObject({
    valid: false,
    error: {
      message:
        "payload.data.shadow.alpha must be a finite number between 0 and 1 when provided",
    },
  });
});
