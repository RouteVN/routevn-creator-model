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

  addFile(state, "file-smile");
  addFile(state, "file-angry");
  state.characters.items["character-one"] = {
    id: "character-one",
    type: "character",
    name: "Character One",
    sprites: {
      items: {
        "folder-sprites": {
          id: "folder-sprites",
          type: "folder",
          name: "Faces",
        },
        "sprite-smile": {
          id: "sprite-smile",
          type: "image",
          name: "Smile",
          fileId: "file-smile",
        },
        "sprite-angry": {
          id: "sprite-angry",
          type: "image",
          name: "Angry",
          fileId: "file-angry",
        },
      },
      tree: [
        {
          id: "folder-sprites",
          children: [{ id: "sprite-smile", children: [] }],
        },
        { id: "sprite-angry", children: [] },
      ],
    },
  };
  state.characters.tree.push({ id: "character-one", children: [] });
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

const createTransformData = (overrides = {}) => ({
  type: "transform",
  name: "Center",
  x: 960,
  y: 540,
  scaleX: 1,
  scaleY: 1,
  anchorX: 0.5,
  anchorY: 0.5,
  rotation: 0,
  ...overrides,
});

const characterTarget = {
  characterId: "character-one",
  sprites: [
    { id: "body", resourceId: "sprite-smile" },
    { id: "face", resourceId: "sprite-angry" },
  ],
};

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

describe("transform preview target", () => {
  it("persists a character target, and switches back to an image", () => {
    const created = run(createPreviewState(), "transform.create", {
      transformId: "transform-one",
      data: createTransformData({
        preview: {
          background: { imageId: "image-bg" },
          target: characterTarget,
        },
      }),
    });

    expect(created.valid).toBe(true);
    expect(created.state.transforms.items["transform-one"].preview).toEqual({
      background: { imageId: "image-bg" },
      target: characterTarget,
    });
    expect(validateState({ state: created.state }).valid).toBe(true);

    const image = run(created.state, "transform.update", {
      transformId: "transform-one",
      data: { preview: { target: { imageId: "image-bg" } } },
    });

    expect(image.valid).toBe(true);
    expect(image.state.transforms.items["transform-one"].preview).toEqual({
      target: { imageId: "image-bg" },
    });

    const character = run(image.state, "transform.update", {
      transformId: "transform-one",
      data: { preview: { target: characterTarget } },
    });

    expect(character.valid).toBe(true);
    expect(character.state.transforms.items["transform-one"].preview).toEqual({
      target: characterTarget,
    });
  });

  it("accepts a target of an image or a character with its sprites", () => {
    const validTarget = (target) =>
      validatePayload({
        type: "transform.update",
        payload: {
          transformId: "transform-one",
          data: { preview: { target } },
        },
      });

    expect(validTarget({ imageId: "image-bg" }).valid).toBe(true);
    expect(validTarget(characterTarget).valid).toBe(true);

    for (const [target, message] of [
      [
        { imageId: "image-bg", ...characterTarget },
        "payload.data.preview.target must hold either imageId or characterId, not both",
      ],
      [
        { sprites: characterTarget.sprites },
        "payload.data.preview.target.sprites requires payload.data.preview.target.characterId",
      ],
      [
        { characterId: "character-one" },
        "payload.data.preview.target.sprites must be a non-empty array when characterId is provided",
      ],
      [
        { characterId: "character-one", sprites: [] },
        "payload.data.preview.target.sprites must be a non-empty array when characterId is provided",
      ],
      [
        { characterId: "", sprites: characterTarget.sprites },
        "payload.data.preview.target.characterId must be a non-empty string when provided",
      ],
      [
        { characterId: "character-one", sprites: [{ id: "body" }] },
        "payload.data.preview.target.sprites[0].resourceId must be a non-empty string",
      ],
      [
        {
          characterId: "character-one",
          sprites: [{ id: "body", resourceId: "sprite-smile", x: 1 }],
        },
        "payload.data.preview.target.sprites[0].x is not allowed",
      ],
      [
        {
          characterId: "character-one",
          sprites: [
            { id: "body", resourceId: "sprite-smile" },
            { id: "body", resourceId: "sprite-angry" },
          ],
        },
        "payload.data.preview.target.sprites[1].id must be unique within payload.data.preview.target.sprites",
      ],
      [
        { characterId: "character-one", sprites: ["sprite-smile"] },
        "payload.data.preview.target.sprites[0] must be an object",
      ],
    ]) {
      const result = validTarget(target);
      expect(result.valid).toBe(false);
      expect(result.error.message).toContain(message);
    }

    // The background stays an image.
    expect(
      validatePayload({
        type: "transform.update",
        payload: {
          transformId: "transform-one",
          data: { preview: { background: characterTarget } },
        },
      }).valid,
    ).toBe(false);
  });

  it("requires the character and each sprite to exist", () => {
    const base = run(createPreviewState(), "transform.create", {
      transformId: "transform-one",
      data: createTransformData(),
    });

    for (const [target, message] of [
      [
        { characterId: "character-missing", sprites: characterTarget.sprites },
        "payload.data.preview.target.characterId must reference an existing character",
      ],
      [
        {
          characterId: "character-one",
          sprites: [{ id: "body", resourceId: "sprite-missing" }],
        },
        "payload.data.preview.target.sprites[0].resourceId must reference an existing non-folder sprite of the character",
      ],
      [
        {
          characterId: "character-one",
          sprites: [{ id: "body", resourceId: "folder-sprites" }],
        },
        "payload.data.preview.target.sprites[0].resourceId must reference an existing non-folder sprite of the character",
      ],
    ]) {
      const updated = run(base.state, "transform.update", {
        transformId: "transform-one",
        data: { preview: { target } },
      });
      expect(updated.valid).toBe(false);
      expect(updated.error.message).toContain(message);
    }
  });

  it("keeps a previewed character and its sprites from being deleted", () => {
    const created = run(createPreviewState(), "transform.create", {
      transformId: "transform-one",
      data: createTransformData({
        preview: {
          target: {
            characterId: "character-one",
            sprites: [{ id: "face", resourceId: "sprite-smile" }],
          },
        },
      }),
    });

    for (const [type, payload] of [
      [
        "character.sprite.delete",
        { characterId: "character-one", spriteIds: ["sprite-smile"] },
      ],
      // The folder holds the previewed sprite.
      [
        "character.sprite.delete",
        { characterId: "character-one", spriteIds: ["folder-sprites"] },
      ],
      ["character.delete", { characterIds: ["character-one"] }],
    ]) {
      const result = run(created.state, type, payload);
      expect(result.valid).toBe(false);
      expect(result.error.message).toContain("transform.preview.target");
    }

    // A sprite the preview does not use can still be deleted.
    expect(
      run(created.state, "character.sprite.delete", {
        characterId: "character-one",
        spriteIds: ["sprite-angry"],
      }).valid,
    ).toBe(true);
  });
});
