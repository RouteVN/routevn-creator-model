import { describe, expect, it } from "vitest";

import {
  processCommand,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const createStateWithTextStyleReferences = () => {
  const state = createEmptyTestState();

  for (const suffix of ["primary", "fallback"]) {
    const fileId = `file-${suffix}`;
    const fontId = `font-${suffix}`;
    state.files.items[fileId] = {
      id: fileId,
      type: "font",
      mimeType: "font/woff2",
      size: 1,
      sha256: `${fileId}-sha256`,
    };
    state.files.tree.push({ id: fileId, children: [] });
    state.fonts.items[fontId] = {
      id: fontId,
      type: "font",
      name: `Font ${suffix}`,
      fileId,
      fontFamily: `Font ${suffix}`,
    };
    state.fonts.tree.push({ id: fontId, children: [] });
  }

  state.colors.items["color-primary"] = {
    id: "color-primary",
    type: "color",
    name: "Primary",
    hex: "#ffffff",
  };
  state.colors.tree.push({ id: "color-primary", children: [] });

  return state;
};

const createTextStyleCommand = (fontId) => ({
  type: "textStyle.create",
  payload: {
    textStyleId: "text-style-primary",
    data: {
      type: "textStyle",
      name: "Primary",
      fontId,
      colorId: "color-primary",
      fontSize: 32,
      lineHeight: 1.4,
      fontWeight: "700",
    },
  },
});

describe("text style font references", () => {
  it("accepts and persists string and array fontId values", () => {
    const fontIds = ["font-primary", "font-fallback"];
    const command = createTextStyleCommand(fontIds);

    expect(validatePayload(command)).toEqual({ valid: true });

    const created = processCommand({
      state: createStateWithTextStyleReferences(),
      command,
    });
    expect(created.valid).toBe(true);
    expect(created.state.textStyles.items["text-style-primary"].fontId).toEqual(
      fontIds,
    );
    expect(validateState({ state: created.state })).toEqual({ valid: true });

    const updated = processCommand({
      state: created.state,
      command: {
        type: "textStyle.update",
        payload: {
          textStyleId: "text-style-primary",
          data: { fontId: "font-primary" },
        },
      },
    });
    expect(updated.valid).toBe(true);
    expect(
      updated.state.textStyles.items["text-style-primary"].fontId,
    ).toBe("font-primary");

    const updatedToArray = processCommand({
      state: updated.state,
      command: {
        type: "textStyle.update",
        payload: {
          textStyleId: "text-style-primary",
          data: { fontId: fontIds },
        },
      },
    });
    expect(updatedToArray.valid).toBe(true);
    expect(
      updatedToArray.state.textStyles.items["text-style-primary"].fontId,
    ).toEqual(fontIds);
  });

  it("rejects empty, duplicate, and non-string array entries", () => {
    expect(validatePayload(createTextStyleCommand([]))).toMatchObject({
      valid: false,
      error: { message: "payload.data.draft.fontId must be a non-empty array" },
    });
    expect(
      validatePayload(
        createTextStyleCommand(["font-primary", "font-primary"]),
      ),
    ).toMatchObject({
      valid: false,
      error: { message: "payload.data.draft.fontId[1] must be unique" },
    });
    expect(
      validatePayload(createTextStyleCommand(["font-primary", ""])),
    ).toMatchObject({
      valid: false,
      error: {
        message: "payload.data.draft.fontId[1] must be a non-empty string",
      },
    });
  });

  it("requires every fontId array entry to reference a font", () => {
    const createResult = processCommand({
      state: createStateWithTextStyleReferences(),
      command: createTextStyleCommand(["font-primary", "font-missing"]),
    });

    expect(createResult).toMatchObject({
      valid: false,
      error: {
        message:
          "payload.data.fontId must reference an existing non-folder font",
      },
    });

    const state = createStateWithTextStyleReferences();
    state.textStyles.items["text-style-primary"] = {
      id: "text-style-primary",
      type: "textStyle",
      name: "Primary",
      fontId: ["font-primary", "font-missing"],
      colorId: "color-primary",
      fontSize: 32,
      lineHeight: 1.4,
      fontWeight: "700",
    };
    state.textStyles.tree.push({ id: "text-style-primary", children: [] });

    expect(validateState({ state })).toMatchObject({
      valid: false,
      error: {
        message:
          "textStyle.fontId must reference an existing non-folder font",
        details: { fontId: "font-missing" },
      },
    });
  });
});
