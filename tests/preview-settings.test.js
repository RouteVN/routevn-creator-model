import { describe, expect, it } from "vitest";

import {
  processCommand,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const addFile = (state, fileId, type = "image") => {
  state.files.items[fileId] = {
    id: fileId,
    type,
    mimeType: type === "font" ? "font/woff2" : "image/png",
    size: 1,
    sha256: `${fileId}-sha256`,
  };
  state.files.tree.push({ id: fileId, children: [] });
};

const createPreviewState = () => {
  const state = createEmptyTestState();
  addFile(state, "file-bg");
  state.images.items["image-bg"] = {
    id: "image-bg",
    type: "image",
    name: "Background",
    fileId: "file-bg",
  };
  state.images.tree.push({ id: "image-bg", children: [] });

  addFile(state, "file-font-one", "font");
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
  state.colors.tree.push({ id: "color-one", children: [] });
  return state;
};

const createTextStyleData = (overrides = {}) => ({
  type: "textStyle",
  name: "Text Style One",
  fontId: "font-one",
  colorId: "color-one",
  fontSize: 32,
  lineHeight: 1.4,
  fontWeight: "700",
  ...overrides,
});

const createParticleData = (overrides = {}) => ({
  type: "particle",
  name: "Snow",
  width: 1280,
  height: 720,
  modules: {
    emission: {},
    appearance: {},
  },
  ...overrides,
});

const run = (state, type, payload) =>
  processCommand({ state, command: { type, payload } });

describe("text style preview alignment", () => {
  it("persists previewAlign on create and update", () => {
    const created = run(createPreviewState(), "textStyle.create", {
      textStyleId: "text-style-one",
      data: createTextStyleData({ previewText: "Hello", previewAlign: "left" }),
    });

    expect(created.valid).toBe(true);
    expect(created.state.textStyles.items["text-style-one"]).toMatchObject({
      previewText: "Hello",
      previewAlign: "left",
    });

    const updated = run(created.state, "textStyle.update", {
      textStyleId: "text-style-one",
      data: { previewAlign: "right" },
    });

    expect(updated.valid).toBe(true);
    // previewAlign is only for editor previews; align is unchanged.
    expect(updated.state.textStyles.items["text-style-one"].previewAlign).toBe(
      "right",
    );
    expect(
      updated.state.textStyles.items["text-style-one"].align,
    ).toBeUndefined();
  });

  it("rejects a previewAlign other than left, center, or right", () => {
    expect(
      validatePayload({
        type: "textStyle.create",
        payload: {
          textStyleId: "text-style-one",
          data: createTextStyleData({ previewAlign: "justify" }),
        },
      }).valid,
    ).toBe(false);

    const result = validatePayload({
      type: "textStyle.update",
      payload: {
        textStyleId: "text-style-one",
        data: { previewAlign: "justify" },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.error.message).toContain(
      "payload.data.previewAlign must be 'left', 'center', or 'right' when provided",
    );
  });

  it("validates previewAlign in state", () => {
    const state = createPreviewState();
    state.textStyles.items["text-style-one"] = {
      id: "text-style-one",
      ...createTextStyleData({ previewAlign: "center" }),
    };
    state.textStyles.tree.push({ id: "text-style-one", children: [] });
    expect(validateState({ state }).valid).toBe(true);

    state.textStyles.items["text-style-one"].previewAlign = "middle";
    expect(validateState({ state }).valid).toBe(false);
  });
});

describe("particle preview background", () => {
  it("persists, replaces, and clears the preview background", () => {
    const created = run(createPreviewState(), "particle.create", {
      particleId: "particle-one",
      data: createParticleData({
        preview: { background: { imageId: "image-bg" } },
      }),
    });

    expect(created.valid).toBe(true);
    expect(created.state.particles.items["particle-one"].preview).toEqual({
      background: { imageId: "image-bg" },
    });

    const cleared = run(created.state, "particle.update", {
      particleId: "particle-one",
      data: { preview: {} },
    });

    expect(cleared.valid).toBe(true);
    expect(cleared.state.particles.items["particle-one"].preview).toEqual({});

    const restored = run(cleared.state, "particle.update", {
      particleId: "particle-one",
      data: { preview: { background: { imageId: "image-bg" } } },
    });

    expect(restored.valid).toBe(true);
    expect(restored.state.particles.items["particle-one"].preview).toEqual({
      background: { imageId: "image-bg" },
    });
  });

  it("rejects preview backgrounds that do not reference image items", () => {
    const created = run(createPreviewState(), "particle.create", {
      particleId: "particle-one",
      data: createParticleData({
        preview: { background: { imageId: "image-missing" } },
      }),
    });
    expect(created.valid).toBe(false);

    const base = run(createPreviewState(), "particle.create", {
      particleId: "particle-one",
      data: createParticleData(),
    });
    const updated = run(base.state, "particle.update", {
      particleId: "particle-one",
      data: { preview: { background: { imageId: "image-missing" } } },
    });
    expect(updated.valid).toBe(false);
  });

  it("accepts only a background slot holding an imageId", () => {
    for (const preview of [
      { target: { imageId: "image-bg" } },
      { background: { imageId: "image-bg", transformId: "transform-one" } },
      { background: "image-bg" },
      "image-bg",
    ]) {
      expect(
        validatePayload({
          type: "particle.update",
          payload: { particleId: "particle-one", data: { preview } },
        }).valid,
      ).toBe(false);
    }
  });

  it("keeps folders free of particle preview settings", () => {
    expect(
      validatePayload({
        type: "particle.create",
        payload: {
          particleId: "folder-one",
          data: { type: "folder", name: "Folder", preview: {} },
        },
      }).valid,
    ).toBe(false);

    const folder = run(createPreviewState(), "particle.create", {
      particleId: "folder-one",
      data: { type: "folder", name: "Folder" },
    });
    const updated = run(folder.state, "particle.update", {
      particleId: "folder-one",
      data: { preview: {} },
    });
    expect(updated.valid).toBe(false);
  });

  it("validates the preview background reference in state", () => {
    const state = createPreviewState();
    state.particles.items["particle-one"] = {
      id: "particle-one",
      ...createParticleData({
        preview: { background: { imageId: "image-bg" } },
      }),
    };
    state.particles.tree.push({ id: "particle-one", children: [] });
    expect(validateState({ state }).valid).toBe(true);

    state.particles.items["particle-one"].preview.background.imageId =
      "image-missing";
    expect(validateState({ state }).valid).toBe(false);
  });
});
