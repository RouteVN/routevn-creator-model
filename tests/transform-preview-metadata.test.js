import { describe, expect, it } from "vitest";

import { processCommand, validateState } from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const addFile = (state, fileId) => {
  state.files.items[fileId] = {
    id: fileId,
    type: "image",
    mimeType: "image/jpeg",
    size: 1,
    sha256: `${fileId}-sha256`,
  };
  state.files.tree.push({
    id: fileId,
    children: [],
  });
};

const addImage = (state, imageId, fileId) => {
  state.images.items[imageId] = {
    id: imageId,
    type: "image",
    name: imageId,
    fileId,
  };
  state.images.tree.push({
    id: imageId,
    children: [],
  });
};

const createStateWithPreviewResources = () => {
  const state = createEmptyTestState();
  addFile(state, "file-bg");
  addFile(state, "file-target");
  addFile(state, "file-preview");
  addFile(state, "file-thumb");
  addImage(state, "image-bg", "file-bg");
  addImage(state, "image-target", "file-target");
  return state;
};

const createTransformData = (overrides = {}) => ({
  type: "transform",
  name: "Camera",
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  anchorX: 0,
  anchorY: 0,
  rotation: 0,
  ...overrides,
});

describe("transform preview metadata", () => {
  it("persists thumbnail and preview images on create and update", () => {
    const createResult = processCommand({
      state: createStateWithPreviewResources(),
      command: {
        type: "transform.create",
        payload: {
          transformId: "transform-camera",
          data: createTransformData({
            thumbnailFileId: "file-thumb",
            previewFileId: "file-preview",
            preview: {
              background: {
                imageId: "image-bg",
              },
              target: {
                imageId: "image-target",
              },
            },
          }),
        },
      },
    });

    expect(createResult.valid).toBe(true);
    expect(
      createResult.state.transforms.items["transform-camera"],
    ).toMatchObject({
      thumbnailFileId: "file-thumb",
      previewFileId: "file-preview",
      preview: {
        background: {
          imageId: "image-bg",
        },
        target: {
          imageId: "image-target",
        },
      },
    });

    const updateResult = processCommand({
      state: createResult.state,
      command: {
        type: "transform.update",
        payload: {
          transformId: "transform-camera",
          data: {
            previewFileId: "file-bg",
            preview: {
              background: {
                imageId: "image-target",
              },
              target: {
                imageId: "image-bg",
              },
            },
          },
        },
      },
    });

    expect(updateResult.valid).toBe(true);
    expect(
      updateResult.state.transforms.items["transform-camera"].previewFileId,
    ).toBe("file-bg");
    expect(
      updateResult.state.transforms.items["transform-camera"].preview,
    ).toEqual({
      background: {
        imageId: "image-target",
      },
      target: {
        imageId: "image-bg",
      },
    });
  });

  it("rejects transform preview images that do not reference image resources", () => {
    const result = processCommand({
      state: createStateWithPreviewResources(),
      command: {
        type: "transform.create",
        payload: {
          transformId: "transform-camera",
          data: createTransformData({
            preview: {
              background: {
                imageId: "missing-image",
              },
            },
          }),
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "payload.data.preview.background.imageId must reference an existing non-folder image",
    );
  });

  it("rejects transform full preview files that do not reference file resources", () => {
    const result = processCommand({
      state: createStateWithPreviewResources(),
      command: {
        type: "transform.create",
        payload: {
          transformId: "transform-camera",
          data: createTransformData({
            previewFileId: "missing-file",
          }),
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "payload.data.previewFileId must reference an existing non-folder file",
    );
  });

  it("validates transform thumbnail and preview metadata in state", () => {
    const state = createStateWithPreviewResources();
    state.transforms.items["transform-camera"] = {
      id: "transform-camera",
      ...createTransformData({
        thumbnailFileId: "file-thumb",
        previewFileId: "file-preview",
        preview: {
          background: {
            imageId: "image-bg",
          },
          target: {
            imageId: "image-target",
          },
        },
      }),
    };
    state.transforms.tree.push({
      id: "transform-camera",
      children: [],
    });

    expect(validateState({ state })).toEqual({
      valid: true,
    });
  });
});
