import { describe, expect, it } from "vitest";

import {
  processCommand,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const addFile = (state, fileId) => {
  state.files.items[fileId] = {
    id: fileId,
    type: "image",
    mimeType: "image/jpeg",
    size: 1,
    sha256: `${fileId}-sha256`,
  };
  state.files.tree.push({ id: fileId, children: [] });
};

const createThumbnailState = () => {
  const state = createEmptyTestState();
  for (const fileId of [
    "file-thumb-one",
    "file-thumb-two",
    "file-preview-one",
    "file-preview-two",
  ]) {
    addFile(state, fileId);
  }
  return state;
};

const RESOURCES = [
  {
    family: "transform",
    collectionKey: "transforms",
    idField: "transformId",
    data: {
      type: "transform",
      name: "Center",
      x: 960,
      y: 540,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: 0,
    },
  },
  {
    family: "particle",
    collectionKey: "particles",
    idField: "particleId",
    data: {
      type: "particle",
      name: "Snow",
      width: 1280,
      height: 720,
      modules: {
        emission: {},
        appearance: {},
      },
    },
  },
  {
    family: "layout",
    collectionKey: "layouts",
    idField: "layoutId",
    data: {
      type: "layout",
      name: "Layout One",
      layoutType: "general",
      isFragment: false,
      elements: {
        items: {},
        tree: [],
      },
    },
  },
  {
    family: "control",
    collectionKey: "controls",
    idField: "controlId",
    data: {
      type: "control",
      name: "Control One",
      elements: {
        items: {},
        tree: [],
      },
    },
  },
];

const thumbnailOne = {
  thumbnailFileId: "file-thumb-one",
  thumbnailSourceHash: "hash-one",
};

// Runs a command and checks it left the state it was given unchanged.
const run = (state, type, payload) => {
  const before = structuredClone(state);
  const result = processCommand({ state, command: { type, payload } });
  expect(state).toStrictEqual(before);
  return result;
};

// The whole state after a command: the previous state with only this item
// replaced (and, for a create, added to the tree).
const expectStateWithItem = (
  result,
  previousState,
  collectionKey,
  item,
  { created = false } = {},
) => {
  const expected = structuredClone(previousState);
  expected[collectionKey].items[item.id] = item;
  if (created) {
    expected[collectionKey].tree.push({ id: item.id, children: [] });
  }

  expect(result.valid).toBe(true);
  expect(result.state).toStrictEqual(expected);
};

describe.each(RESOURCES)(
  "$family thumbnail source hash",
  ({ family, collectionKey, idField, data }) => {
    const itemId = `${family}-one`;
    const createdItem = { id: itemId, ...data, ...thumbnailOne };
    const create = (state = createThumbnailState()) =>
      run(state, `${family}.create`, {
        [idField]: itemId,
        data: { ...data, ...thumbnailOne },
      });
    const update = (state, nextData) =>
      run(state, `${family}.update`, { [idField]: itemId, data: nextData });

    it("stores the hash with its thumbnail on create", () => {
      const state = createThumbnailState();

      expectStateWithItem(create(state), state, collectionKey, createdItem, {
        created: true,
      });
    });

    it("replaces the hash with a new thumbnail", () => {
      const created = create();
      const updated = update(created.state, {
        thumbnailFileId: "file-thumb-two",
        thumbnailSourceHash: "hash-two",
      });

      expectStateWithItem(updated, created.state, collectionKey, {
        ...createdItem,
        thumbnailFileId: "file-thumb-two",
        thumbnailSourceHash: "hash-two",
      });
    });

    it("keeps the hash through other edits and when the same thumbnail is sent again", () => {
      const created = create();
      const renamed = update(created.state, { name: "Renamed" });
      const renamedItem = { ...createdItem, name: "Renamed" };

      expectStateWithItem(renamed, created.state, collectionKey, renamedItem);

      const resent = update(renamed.state, {
        thumbnailFileId: "file-thumb-one",
      });

      expectStateWithItem(resent, renamed.state, collectionKey, renamedItem);
    });

    it("drops the hash when a new thumbnail comes without one", () => {
      const created = create();
      const replaced = update(created.state, {
        thumbnailFileId: "file-thumb-two",
      });
      const { thumbnailSourceHash, ...itemWithoutHash } = createdItem;

      expect(thumbnailSourceHash).toBe("hash-one");
      expectStateWithItem(replaced, created.state, collectionKey, {
        ...itemWithoutHash,
        thumbnailFileId: "file-thumb-two",
      });
    });

    it("treats a hash sent as undefined as not sent", () => {
      const created = create();
      const updated = update(created.state, {
        name: "Renamed",
        thumbnailSourceHash: undefined,
      });

      expectStateWithItem(updated, created.state, collectionKey, {
        ...createdItem,
        name: "Renamed",
      });
    });

    it("drops the hash with a thumbnail sent as undefined", () => {
      const created = create();
      const updated = update(created.state, {
        name: "Renamed",
        thumbnailFileId: undefined,
      });
      const { thumbnailSourceHash, ...itemWithoutHash } = createdItem;

      expect(thumbnailSourceHash).toBe("hash-one");
      // As with any field, an update spreads a key sent as undefined.
      expectStateWithItem(updated, created.state, collectionKey, {
        ...itemWithoutHash,
        name: "Renamed",
        thumbnailFileId: undefined,
      });
    });

    it("rejects a hash that is empty, not a string, or sent without its thumbnail", () => {
      for (const [type, payloadData, message] of [
        [
          `${family}.create`,
          {
            ...data,
            thumbnailFileId: "file-thumb-one",
            thumbnailSourceHash: "",
          },
          "payload.data.thumbnailSourceHash must be a non-empty string when provided",
        ],
        [
          `${family}.update`,
          { thumbnailFileId: "file-thumb-one", thumbnailSourceHash: 7 },
          "payload.data.thumbnailSourceHash must be a non-empty string when provided",
        ],
        [
          `${family}.create`,
          { ...data, thumbnailSourceHash: "hash-one" },
          "payload.data.thumbnailSourceHash requires payload.data.thumbnailFileId",
        ],
        [
          `${family}.update`,
          { thumbnailSourceHash: "hash-one" },
          "payload.data.thumbnailSourceHash requires payload.data.thumbnailFileId",
        ],
      ]) {
        const result = validatePayload({
          type,
          payload: { [idField]: itemId, data: payloadData },
        });

        expect(result.valid).toBe(false);
        expect(result.error.message).toContain(message);
      }
    });

    it("keeps folders free of a thumbnail source hash", () => {
      expect(
        validatePayload({
          type: `${family}.create`,
          payload: {
            [idField]: "folder-one",
            data: { type: "folder", name: "Folder", ...thumbnailOne },
          },
        }).valid,
      ).toBe(false);

      const folder = run(createThumbnailState(), `${family}.create`, {
        [idField]: "folder-one",
        data: { type: "folder", name: "Folder" },
      });
      const updated = run(folder.state, `${family}.update`, {
        [idField]: "folder-one",
        data: thumbnailOne,
      });

      expect(folder.valid).toBe(true);
      expect(updated.valid).toBe(false);
    });

    it("validates the hash in state", () => {
      const state = structuredClone(create().state);
      const item = state[collectionKey].items[itemId];

      expect(validateState({ state }).valid).toBe(true);

      item.thumbnailSourceHash = "";
      expect(validateState({ state }).valid).toBe(false);

      item.thumbnailSourceHash = "hash-one";
      delete item.thumbnailFileId;
      const result = validateState({ state });

      expect(result.valid).toBe(false);
      expect(result.error.message).toContain(
        `.${itemId}.thumbnailSourceHash requires`,
      );
    });
  },
);

describe("transform thumbnail source hash with its preview image", () => {
  const { collectionKey, idField, data } = RESOURCES[0];
  const createdItem = {
    id: "transform-one",
    ...data,
    ...thumbnailOne,
    previewFileId: "file-preview-one",
  };
  const create = () =>
    run(createThumbnailState(), "transform.create", {
      [idField]: "transform-one",
      data: {
        ...data,
        ...thumbnailOne,
        previewFileId: "file-preview-one",
      },
    });
  const update = (state, nextData) =>
    run(state, "transform.update", {
      [idField]: "transform-one",
      data: nextData,
    });

  it("keeps the hash while the preview image stays the same", () => {
    const created = create();
    const resent = update(created.state, {
      thumbnailFileId: "file-thumb-one",
      previewFileId: "file-preview-one",
    });

    expectStateWithItem(resent, created.state, collectionKey, createdItem);
  });

  it("drops the hash when a new preview image comes without one", () => {
    const created = create();
    const replaced = update(created.state, {
      previewFileId: "file-preview-two",
    });
    const { thumbnailSourceHash, ...itemWithoutHash } = createdItem;

    expect(thumbnailSourceHash).toBe("hash-one");
    expectStateWithItem(replaced, created.state, collectionKey, {
      ...itemWithoutHash,
      previewFileId: "file-preview-two",
    });
  });

  it("stores a new hash sent with both new images", () => {
    const created = create();
    const recaptured = update(created.state, {
      thumbnailFileId: "file-thumb-two",
      previewFileId: "file-preview-two",
      thumbnailSourceHash: "hash-two",
    });

    expectStateWithItem(recaptured, created.state, collectionKey, {
      ...createdItem,
      thumbnailFileId: "file-thumb-two",
      previewFileId: "file-preview-two",
      thumbnailSourceHash: "hash-two",
    });
  });
});
