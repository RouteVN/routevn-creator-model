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
  addFile(state, "file-thumb-one");
  addFile(state, "file-thumb-two");
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

const run = (state, type, payload) =>
  processCommand({ state, command: { type, payload } });

describe.each(RESOURCES)(
  "$family thumbnail source hash",
  ({ family, collectionKey, idField, data }) => {
    const itemId = `${family}-one`;
    const create = (state, extraData = {}) =>
      run(state, `${family}.create`, {
        [idField]: itemId,
        data: { ...data, ...extraData },
      });
    const update = (state, nextData) =>
      run(state, `${family}.update`, { [idField]: itemId, data: nextData });
    const itemOf = (result) => result.state[collectionKey].items[itemId];

    it("stores the hash with its thumbnail on create and update", () => {
      const created = create(createThumbnailState(), thumbnailOne);

      expect(created.valid).toBe(true);
      expect(itemOf(created)).toMatchObject(thumbnailOne);

      const updated = update(created.state, {
        thumbnailFileId: "file-thumb-two",
        thumbnailSourceHash: "hash-two",
      });

      expect(updated.valid).toBe(true);
      expect(itemOf(updated)).toMatchObject({
        thumbnailFileId: "file-thumb-two",
        thumbnailSourceHash: "hash-two",
      });
      expect(itemOf(created)).toMatchObject(thumbnailOne);
    });

    it("keeps the hash through other edits and drops it with a new thumbnail sent without one", () => {
      const created = create(createThumbnailState(), thumbnailOne);
      const renamed = update(created.state, { name: "Renamed" });

      expect(renamed.valid).toBe(true);
      expect(itemOf(renamed)).toMatchObject(thumbnailOne);

      const replaced = update(renamed.state, {
        thumbnailFileId: "file-thumb-two",
      });

      expect(replaced.valid).toBe(true);
      expect(itemOf(replaced).thumbnailFileId).toBe("file-thumb-two");
      expect(itemOf(replaced)).not.toHaveProperty("thumbnailSourceHash");
      expect(itemOf(renamed)).toMatchObject(thumbnailOne);
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
      const created = create(createThumbnailState(), thumbnailOne);
      const state = structuredClone(created.state);
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
