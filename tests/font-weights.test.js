import { describe, expect, it } from "vitest";
import {
  processCommand,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";
import { expectValidation } from "./support/expectValidation.js";

const createStateWithFontFile = () => {
  const state = createEmptyTestState();
  state.files.items["file-font"] = {
    id: "file-font",
    type: "font",
    mimeType: "font/ttf",
    size: 1,
    sha256: "file-font-sha256",
  };
  state.files.tree.push({ id: "file-font", children: [] });
  return state;
};

const createFontPayload = (weights = {}) => ({
  fontId: "font-a",
  data: {
    type: "font",
    name: "Display",
    fileId: "file-font",
    fontFamily: "Fraunces",
    ...weights,
  },
});

describe("font weight metadata", () => {
  it("persists flat variable and static weight metadata", () => {
    const created = processCommand({
      state: createStateWithFontFile(),
      command: {
        type: "font.create",
        payload: createFontPayload({
          minWeight: 100,
          defaultWeight: 400,
          maxWeight: 900,
        }),
      },
    });

    expect(created.valid).toBe(true);
    expect(created.state.fonts.items["font-a"]).toMatchObject({
      minWeight: 100,
      defaultWeight: 400,
      maxWeight: 900,
    });

    const updated = processCommand({
      state: created.state,
      command: {
        type: "font.update",
        payload: {
          fontId: "font-a",
          data: {
            minWeight: 600,
            defaultWeight: 600,
            maxWeight: 600,
          },
        },
      },
    });

    expect(updated.valid).toBe(true);
    expect(updated.state.fonts.items["font-a"]).toMatchObject({
      minWeight: 600,
      defaultWeight: 600,
      maxWeight: 600,
    });
  });

  it("requires all three weight fields together", () => {
    expectValidation(() =>
      validatePayload({
        type: "font.create",
        payload: createFontPayload({ minWeight: 400 }),
      }),
    ).toThrow(
      "payload.data must include minWeight, defaultWeight, and maxWeight together",
    );
  });

  it("requires ordered weights between 1 and 1000", () => {
    expectValidation(() =>
      validatePayload({
        type: "font.create",
        payload: createFontPayload({
          minWeight: 700,
          defaultWeight: 400,
          maxWeight: 900,
        }),
      }),
    ).toThrow(
      "payload.data must satisfy minWeight <= defaultWeight <= maxWeight",
    );

    expectValidation(() =>
      validatePayload({
        type: "font.create",
        payload: createFontPayload({
          minWeight: 0,
          defaultWeight: 400,
          maxWeight: 900,
        }),
      }),
    ).toThrow(
      "payload.data.minWeight must be a finite number between 1 and 1000",
    );
  });

  it("rejects partially persisted weight metadata", () => {
    const state = createStateWithFontFile();
    state.fonts.items["font-a"] = {
      id: "font-a",
      type: "font",
      name: "Display",
      fileId: "file-font",
      fontFamily: "Fraunces",
      minWeight: 400,
    };
    state.fonts.tree.push({ id: "font-a", children: [] });

    expectValidation(() => validateState({ state })).toThrow(
      "state.fonts.items.font-a must include minWeight, defaultWeight, and maxWeight together",
    );
  });
});
