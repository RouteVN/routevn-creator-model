import { expect, test } from "vitest";

import { processCommand, validatePayload } from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

// Commands are stored as JSON, which drops keys set to undefined, so these
// optional fields are cleared with null instead.

const createState = () => {
  const state = createEmptyTestState();
  state.files.items["file-font-one"] = {
    id: "file-font-one",
    type: "font",
    mimeType: "font/woff2",
    size: 1,
    sha256: "file-font-one-sha256",
  };
  state.files.items["file-sheet-one"] = {
    id: "file-sheet-one",
    type: "image",
    mimeType: "image/png",
    size: 1,
    sha256: "file-sheet-one-sha256",
  };
  state.files.tree.push(
    { id: "file-font-one", children: [] },
    { id: "file-sheet-one", children: [] },
  );
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
  state.colors.items["color-outline"] = {
    id: "color-outline",
    type: "color",
    name: "Outline Color",
    hex: "#000000",
  };
  state.colors.tree.push(
    { id: "color-one", children: [] },
    { id: "color-outline", children: [] },
  );
  return state;
};

// A command as it is stored and replayed.
const stored = (command) => JSON.parse(JSON.stringify(command));

const apply = (state, command) => {
  const before = structuredClone(state);
  const result = processCommand({ state, command });
  expect(result.valid).toBe(true);
  expect(state).toEqual(before);
  return result.state;
};

const createOutlinedTextStyle = () =>
  apply(createState(), {
    type: "textStyle.create",
    payload: {
      textStyleId: "text-style-one",
      data: {
        type: "textStyle",
        name: "Text Style One",
        fontId: "font-one",
        colorId: "color-one",
        fontSize: 32,
        lineHeight: 1.4,
        fontWeight: "700",
        strokeColorId: "color-outline",
        strokeWidth: 2,
      },
    },
  });

const createSizedSpritesheet = () =>
  apply(createState(), {
    type: "spritesheet.create",
    payload: {
      spritesheetId: "sheet-one",
      data: {
        type: "spritesheet",
        name: "Sheet One",
        fileId: "file-sheet-one",
        width: 256,
        height: 128,
        jsonData: { meta: { image: "sheet.png" } },
        animations: { idle: { frames: [0] } },
      },
    },
  });

const clearOutlineCommand = {
  type: "textStyle.update",
  payload: {
    textStyleId: "text-style-one",
    data: { strokeColorId: null, strokeWidth: 0 },
  },
};

test("textStyle.update removes the outline color when strokeColorId is null", () => {
  const state = apply(createOutlinedTextStyle(), clearOutlineCommand);

  expect(state.textStyles.items["text-style-one"]).toEqual({
    id: "text-style-one",
    type: "textStyle",
    name: "Text Style One",
    fontId: "font-one",
    colorId: "color-one",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
    strokeWidth: 0,
  });
});

test("an outline color cleared with null stays cleared once stored, unlike undefined", () => {
  const replayed = apply(
    createOutlinedTextStyle(),
    stored(clearOutlineCommand),
  );
  expect(replayed.textStyles.items["text-style-one"]).not.toHaveProperty(
    "strokeColorId",
  );

  const undefinedClear = stored({
    type: "textStyle.update",
    payload: {
      textStyleId: "text-style-one",
      data: { strokeColorId: undefined },
    },
  });
  expect(undefinedClear.payload.data).toEqual({});
  expect(validatePayload(undefinedClear)).toMatchObject({
    valid: false,
    error: {
      message: "payload.data must include at least one updatable field",
    },
  });
});

test("textStyle.update accepts null only for the outline color", () => {
  for (const strokeColorId of ["", 1]) {
    expect(
      validatePayload({
        type: "textStyle.update",
        payload: { textStyleId: "text-style-one", data: { strokeColorId } },
      }),
    ).toMatchObject({
      valid: false,
      error: {
        message:
          "payload.data.strokeColorId must be a non-empty string or null when provided",
      },
    });
  }

  expect(
    validatePayload({
      type: "textStyle.update",
      payload: { textStyleId: "text-style-one", data: { colorId: null } },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message: "payload.data.colorId must be a non-empty string when provided",
    },
  });
});

test("spritesheet.update removes the default frame size when it is null", () => {
  const withoutWidth = apply(createSizedSpritesheet(), {
    type: "spritesheet.update",
    payload: { spritesheetId: "sheet-one", data: { width: null } },
  });
  const expectedSheet = {
    id: "sheet-one",
    type: "spritesheet",
    name: "Sheet One",
    fileId: "file-sheet-one",
    height: 128,
    jsonData: { meta: { image: "sheet.png" } },
    animations: { idle: { frames: [0] } },
  };
  expect(withoutWidth.spritesheets.items["sheet-one"]).toEqual(expectedSheet);

  const withoutSize = apply(withoutWidth, {
    type: "spritesheet.update",
    payload: { spritesheetId: "sheet-one", data: { height: null } },
  });
  delete expectedSheet.height;
  expect(withoutSize.spritesheets.items["sheet-one"]).toEqual(expectedSheet);
});

test("a frame size cleared with null stays cleared once stored, unlike undefined", () => {
  const replayed = apply(
    createSizedSpritesheet(),
    stored({
      type: "spritesheet.update",
      payload: {
        spritesheetId: "sheet-one",
        data: { width: null, height: null },
      },
    }),
  );
  const sheet = replayed.spritesheets.items["sheet-one"];
  expect(sheet).not.toHaveProperty("width");
  expect(sheet).not.toHaveProperty("height");

  const undefinedClear = stored({
    type: "spritesheet.update",
    payload: {
      spritesheetId: "sheet-one",
      data: { width: undefined, height: undefined },
    },
  });
  expect(undefinedClear.payload.data).toEqual({});
  expect(validatePayload(undefinedClear)).toMatchObject({
    valid: false,
    error: {
      message: "payload.data must include at least one updatable field",
    },
  });
});

test("spritesheet.update rejects a frame size that is not a number or null", () => {
  for (const width of ["256", Number.NaN]) {
    expect(
      validatePayload({
        type: "spritesheet.update",
        payload: { spritesheetId: "sheet-one", data: { width } },
      }),
    ).toMatchObject({
      valid: false,
      error: {
        message: "payload.data.width must be a finite number or null",
      },
    });
  }

  expect(
    validatePayload({
      type: "spritesheet.update",
      payload: { spritesheetId: "sheet-one", data: { frameCount: null } },
    }),
  ).toMatchObject({
    valid: false,
    error: { message: "payload.data.frameCount must be a finite number" },
  });
});
