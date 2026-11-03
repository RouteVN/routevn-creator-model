import { describe, expect, test } from "vitest";

import {
  normalizeState,
  processCommand,
  replayCommands,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";
import { deepFreeze } from "./support/deepFreeze.js";

const RESOURCE_TYPES = [
  "images",
  "sounds",
  "videos",
  "characters",
  "transforms",
  "animations",
  "audioEffects",
  "particles",
  "spritesheets",
  "colors",
  "fonts",
  "textStyles",
  "layouts",
  "variables",
  "controls",
];
const RESOURCE_TYPES_LIST = RESOURCE_TYPES.map((key) => `'${key}'`).join(", ");
const FOLDER_REFERENCE_MESSAGE =
  "assetPack.resources.folderIds must reference an existing folder in the resourceType collection";

const createTreeNode = (id, children = []) => ({ id, children });

const createFolder = (id, name) => ({ id, type: "folder", name });

const createTag = (id, name) => ({ id, type: "tag", name });

const createPackData = (data = {}) => ({
  type: "assetPack",
  name: "Starter",
  resources: [{ resourceType: "images", folderIds: ["folder-cg"] }],
  ...data,
});

const createCommand = (payload) => ({
  type: "assetPack.create",
  payload: {
    assetPackId: "pack-a",
    data: createPackData(),
    ...payload,
  },
});

const updateCommand = (data, assetPackId = "pack-a") => ({
  type: "assetPack.update",
  payload: { assetPackId, data },
});

const resourceCreateCommand = (payload) => ({
  type: "assetPack.resource.create",
  payload: {
    assetPackId: "pack-a",
    resourceType: "layouts",
    data: { folderIds: ["folder-ui"] },
    ...payload,
  },
});

const resourceUpdateCommand = (payload) => ({
  type: "assetPack.resource.update",
  payload: {
    assetPackId: "pack-a",
    resourceType: "images",
    data: { folderIds: ["folder-bg"] },
    ...payload,
  },
});

const resourceDeleteCommand = (payload) => ({
  type: "assetPack.resource.delete",
  payload: {
    assetPackId: "pack-a",
    resourceTypes: ["sounds"],
    ...payload,
  },
});

// Without an index, a move is placed first unless the case overrides it.
const resourceMoveCommand = (payload) => {
  const command = {
    type: "assetPack.resource.move",
    payload: {
      assetPackId: "pack-a",
      resourceType: "sounds",
      position: "first",
      ...payload,
    },
  };
  for (const [key, value] of Object.entries(command.payload)) {
    if (value === undefined) {
      delete command.payload[key];
    }
  }
  return command;
};

// Folders the packs pick from: folder-cg sits inside folder-bg, and the colors
// collection holds color-red, an item that is not a folder. The assetPacks tag
// scope holds tag-chapter and tag-audio; tag-warm is a colors tag.
//
// Packs: folder-packs holds pack-a and folder-nested, which holds pack-b;
// pack-c is at the root.
const createPacksState = () => {
  const state = createEmptyTestState();
  state.images = {
    items: {
      "folder-bg": createFolder("folder-bg", "Backgrounds"),
      "folder-cg": createFolder("folder-cg", "CG"),
      "folder-ev": createFolder("folder-ev", "Events"),
    },
    tree: [
      createTreeNode("folder-bg", [createTreeNode("folder-cg")]),
      createTreeNode("folder-ev"),
    ],
  };
  state.sounds = {
    items: {
      "folder-bgm": createFolder("folder-bgm", "BGM"),
      "folder-se": createFolder("folder-se", "SE"),
    },
    tree: [createTreeNode("folder-bgm"), createTreeNode("folder-se")],
  };
  state.layouts = {
    items: {
      "folder-ui": createFolder("folder-ui", "UI"),
    },
    tree: [createTreeNode("folder-ui")],
  };
  state.colors = {
    items: {
      "folder-palette": createFolder("folder-palette", "Palette"),
      "color-red": {
        id: "color-red",
        type: "color",
        name: "Red",
        hex: "#ff0000",
      },
    },
    tree: [createTreeNode("folder-palette", [createTreeNode("color-red")])],
  };
  state.tags.assetPacks = {
    items: {
      "tag-chapter": createTag("tag-chapter", "Chapter"),
      "tag-audio": createTag("tag-audio", "Audio"),
    },
    tree: [{ id: "tag-chapter" }, { id: "tag-audio" }],
  };
  state.tags.colors = {
    items: {
      "tag-warm": createTag("tag-warm", "Warm"),
    },
    tree: [{ id: "tag-warm" }],
  };
  state.assetPacks = {
    items: {
      "folder-packs": createFolder("folder-packs", "Packs"),
      "folder-nested": createFolder("folder-nested", "Nested"),
      "pack-a": {
        id: "pack-a",
        type: "assetPack",
        name: "Starter",
        description: "Opening chapter",
        tagIds: ["tag-chapter"],
        resources: [
          { resourceType: "images", folderIds: ["folder-cg", "folder-bg"] },
          { resourceType: "sounds", folderIds: ["folder-bgm"] },
        ],
      },
      "pack-b": {
        id: "pack-b",
        type: "assetPack",
        name: "Audio",
        resources: [],
      },
      "pack-c": {
        id: "pack-c",
        type: "assetPack",
        name: "UI",
        resources: [{ resourceType: "layouts", folderIds: ["folder-ui"] }],
      },
    },
    tree: [
      createTreeNode("folder-packs", [
        createTreeNode("pack-a"),
        createTreeNode("folder-nested", [createTreeNode("pack-b")]),
      ]),
      createTreeNode("pack-c"),
    ],
  };
  return state;
};

const resourceTypesOf = (state, assetPackId = "pack-a") =>
  state.assetPacks.items[assetPackId].resources.map(
    ({ resourceType }) => resourceType,
  );

const expectPayloadError = (result, message) => {
  expect(result.valid).toBe(false);
  expect(result.error.kind).toBe("payload");
  expect(result.error.message).toBe(message);
};

const expectPreconditionError = (result, message) => {
  expect(result.valid).toBe(false);
  expect(result.error.kind).toBe("precondition");
  expect(result.error.message).toBe(message);
};

const expectProcessed = (command, state = createPacksState()) => {
  const result = processCommand({ state, command });
  expect(result.valid, JSON.stringify(result.error)).toBe(true);
  expect(validateState({ state: result.state })).toEqual({ valid: true });
  return result.state;
};

describe("assetPack payload validation", () => {
  test.each([
    [
      "a pack without resources",
      createCommand({ data: { type: "assetPack", name: "Starter" } }),
    ],
    [
      "an empty resources list",
      createCommand({ data: createPackData({ resources: [] }) }),
    ],
    [
      "a pack taking folders from every resource type",
      createCommand({
        data: createPackData({
          description: "",
          resources: RESOURCE_TYPES.map((resourceType) => ({
            resourceType,
            folderIds: [`folder-${resourceType}`],
          })),
        }),
      }),
    ],
    [
      "tag ids",
      createCommand({ data: createPackData({ tagIds: ["tag-chapter"] }) }),
    ],
    ["empty tag ids", createCommand({ data: createPackData({ tagIds: [] }) })],
    ["a folder", createCommand({ data: { type: "folder", name: "Packs" } })],
    [
      "a folder with a description",
      createCommand({
        data: { type: "folder", name: "Packs", description: "Chapter packs" },
      }),
    ],
    [
      "placement fields",
      createCommand({
        parentId: "folder-packs",
        position: "after",
        positionTargetId: "pack-b",
      }),
    ],
    ["an index", createCommand({ parentId: null, index: 0 })],
    ["a name update", updateCommand({ name: "Renamed" })],
    ["a description update", updateCommand({ description: "" })],
    ["a tag update", updateCommand({ tagIds: ["tag-audio"] })],
    ["a tag removal", updateCommand({ tagIds: [] })],
    [
      "a delete",
      { type: "assetPack.delete", payload: { assetPackIds: ["pack-a"] } },
    ],
    [
      "a move",
      {
        type: "assetPack.move",
        payload: {
          assetPackId: "pack-a",
          parentId: "folder-packs",
          position: "before",
          positionTargetId: "pack-b",
        },
      },
    ],
    ["a resource create placed last by default", resourceCreateCommand()],
    ["a resource create at an index", resourceCreateCommand({ index: 1 })],
    [
      "a resource create placed first",
      resourceCreateCommand({ position: "first" }),
    ],
    [
      "a resource create placed before another type",
      resourceCreateCommand({
        position: "before",
        positionTargetResourceType: "sounds",
      }),
    ],
    ["a resource update", resourceUpdateCommand()],
    [
      "a resource delete of several types",
      resourceDeleteCommand({ resourceTypes: ["images", "sounds"] }),
    ],
    [
      "a resource move to an index",
      resourceMoveCommand({ position: undefined, index: 0 }),
    ],
    ["a resource move placed last", resourceMoveCommand({ position: "last" })],
    [
      "a resource move placed after another type",
      resourceMoveCommand({
        position: "after",
        positionTargetResourceType: "images",
      }),
    ],
  ])("accepts %s", (_label, command) => {
    expect(validatePayload(command)).toEqual({ valid: true });
  });

  test.each([
    [
      "an empty id",
      createCommand({ assetPackId: "" }),
      "payload.assetPackId must be a non-empty string",
    ],
    [
      "an unknown payload field",
      createCommand({ tagIds: [] }),
      "payload.tagIds is not allowed",
    ],
    [
      "an unknown item type",
      createCommand({ data: createPackData({ type: "pack" }) }),
      "payload.data.type must be 'folder' or 'assetPack'",
    ],
    [
      "an empty name",
      createCommand({ data: createPackData({ name: " " }) }),
      "payload.data.name must be a non-empty string",
    ],
    [
      "a non-string description",
      createCommand({ data: createPackData({ description: 1 }) }),
      "payload.data.description must be a string when provided",
    ],
    [
      "tag ids that are not an array",
      createCommand({ data: createPackData({ tagIds: "tag-chapter" }) }),
      "payload.data.tagIds must be an array when provided",
    ],
    [
      "a tag id listed twice",
      createCommand({
        data: createPackData({ tagIds: ["tag-chapter", "tag-chapter"] }),
      }),
      "payload.data.tagIds[1] must be unique",
    ],
    [
      "a folder with tag ids",
      createCommand({
        data: { type: "folder", name: "Packs", tagIds: ["tag-chapter"] },
      }),
      "payload.data.tagIds is not allowed",
    ],
    [
      "resources that are not an array",
      createCommand({ data: createPackData({ resources: {} }) }),
      "payload.data.resources must be an array",
    ],
    [
      "a resource that is not an object",
      createCommand({ data: createPackData({ resources: ["images"] }) }),
      "payload.data.resources[0] must be an object",
    ],
    [
      "an unknown resource field",
      createCommand({
        data: createPackData({
          resources: [
            {
              resourceType: "images",
              folderIds: ["folder-cg"],
              imageIds: ["image-a"],
            },
          ],
        }),
      }),
      "payload.data.resources[0].imageIds is not allowed",
    ],
    [
      "a resource without folder ids",
      createCommand({
        data: createPackData({ resources: [{ resourceType: "images" }] }),
      }),
      "payload.data.resources[0].folderIds is required",
    ],
    [
      "folder ids that are not an array",
      createCommand({
        data: createPackData({
          resources: [{ resourceType: "images", folderIds: "folder-cg" }],
        }),
      }),
      "payload.data.resources[0].folderIds must be a non-empty array",
    ],
    [
      "a resource with no folders",
      createCommand({
        data: createPackData({
          resources: [{ resourceType: "sounds", folderIds: [] }],
        }),
      }),
      "payload.data.resources[0].folderIds must be a non-empty array",
    ],
    [
      "an unknown resource type",
      createCommand({
        data: createPackData({
          resources: [{ resourceType: "files", folderIds: ["folder-a"] }],
        }),
      }),
      `payload.data.resources[0].resourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
    [
      "a resource type listed twice",
      createCommand({
        data: createPackData({
          resources: [
            { resourceType: "sounds", folderIds: ["folder-bgm"] },
            { resourceType: "sounds", folderIds: ["folder-se"] },
          ],
        }),
      }),
      "payload.data.resources[1].resourceType must be unique within payload.data.resources",
    ],
    [
      "a folder id listed twice",
      createCommand({
        data: createPackData({
          resources: [
            {
              resourceType: "images",
              folderIds: ["folder-cg", "folder-bg", "folder-cg"],
            },
          ],
        }),
      }),
      "payload.data.resources[0].folderIds[2] must be unique",
    ],
    [
      "an empty folder id",
      createCommand({
        data: createPackData({
          resources: [{ resourceType: "images", folderIds: [""] }],
        }),
      }),
      "payload.data.resources[0].folderIds[0] must be a non-empty string",
    ],
    [
      "a folder with a non-string description",
      createCommand({
        data: { type: "folder", name: "Packs", description: 1 },
      }),
      "payload.data.description must be a string when provided",
    ],
    [
      "a folder with resources",
      createCommand({
        data: { type: "folder", name: "Packs", resources: [] },
      }),
      "payload.data.resources is not allowed",
    ],
    [
      "a position target without a position",
      createCommand({ positionTargetId: "pack-b" }),
      "payload.positionTargetId requires payload.position",
    ],
  ])("assetPack.create rejects %s", (_label, command, message) => {
    expectPayloadError(validatePayload(command), message);
  });

  test.each([
    [
      "an empty data object",
      updateCommand({}),
      "payload.data must include at least one updatable field",
    ],
    [
      "a type change",
      updateCommand({ type: "folder" }),
      "payload.data.type is not allowed",
    ],
    [
      "resources",
      updateCommand({
        resources: [{ resourceType: "images", folderIds: ["folder-cg"] }],
      }),
      "payload.data.resources is not allowed",
    ],
    [
      "an explicitly undefined name",
      updateCommand({ name: undefined }),
      "payload.data.name must be a non-empty string when provided",
    ],
    [
      "an explicitly undefined description",
      updateCommand({ description: undefined }),
      "payload.data.description must be a string when provided",
    ],
    [
      "tag ids that are not an array",
      updateCommand({ tagIds: null }),
      "payload.data.tagIds must be an array when provided",
    ],
    [
      "an empty tag id",
      updateCommand({ tagIds: [""] }),
      "payload.data.tagIds[0] must be a non-empty string",
    ],
    [
      "an unknown payload field",
      {
        type: "assetPack.update",
        payload: { assetPackId: "pack-a", data: { name: "A" }, parentId: null },
      },
      "payload.parentId is not allowed",
    ],
  ])("assetPack.update rejects %s", (_label, command, message) => {
    expectPayloadError(validatePayload(command), message);
  });

  test.each([
    [
      "an empty id list",
      { assetPackIds: [] },
      "payload.assetPackIds must be a non-empty array",
    ],
    [
      "a repeated id",
      { assetPackIds: ["pack-a", "pack-a"] },
      "payload.assetPackIds[1] must be unique",
    ],
    [
      "the singular id field",
      { assetPackId: "pack-a" },
      "payload.assetPackId is not allowed",
    ],
  ])("assetPack.delete rejects %s", (_label, payload, message) => {
    expectPayloadError(
      validatePayload({ type: "assetPack.delete", payload }),
      message,
    );
  });

  test.each([
    [
      "data",
      { assetPackId: "pack-a", data: { name: "A" } },
      "payload.data is not allowed",
    ],
    [
      "an unknown position",
      { assetPackId: "pack-a", position: "middle" },
      "payload.position must be 'first', 'last', 'before', or 'after'",
    ],
    [
      "an index with a position",
      { assetPackId: "pack-a", index: 0, position: "first" },
      "payload.index cannot be combined with payload.position",
    ],
    [
      "an empty parent id",
      { assetPackId: "pack-a", parentId: "" },
      "payload.parentId must be a non-empty string when provided",
    ],
  ])("assetPack.move rejects %s", (_label, payload, message) => {
    expectPayloadError(
      validatePayload({ type: "assetPack.move", payload }),
      message,
    );
  });

  test.each([
    [
      "a tree position target",
      resourceCreateCommand({
        position: "before",
        positionTargetId: "sounds",
      }),
      "payload.positionTargetId is not allowed",
    ],
    [
      "a parent id",
      resourceCreateCommand({ parentId: null }),
      "payload.parentId is not allowed",
    ],
    [
      "an empty pack id",
      resourceCreateCommand({ assetPackId: "" }),
      "payload.assetPackId must be a non-empty string",
    ],
    [
      "a missing resource type",
      resourceCreateCommand({ resourceType: undefined }),
      `payload.resourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
    [
      "an unknown resource type",
      resourceCreateCommand({ resourceType: "voices" }),
      `payload.resourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
    [
      "missing data",
      resourceCreateCommand({ data: undefined }),
      "payload.data must be an object",
    ],
    [
      "an unknown data field",
      resourceCreateCommand({
        data: { folderIds: ["folder-ui"], resourceType: "layouts" },
      }),
      "payload.data.resourceType is not allowed",
    ],
    [
      "data without folder ids",
      resourceCreateCommand({ data: {} }),
      "payload.data.folderIds is required",
    ],
    [
      "no folders",
      resourceCreateCommand({ data: { folderIds: [] } }),
      "payload.data.folderIds must be a non-empty array",
    ],
    [
      "a folder id listed twice",
      resourceCreateCommand({
        data: { folderIds: ["folder-ui", "folder-ui"] },
      }),
      "payload.data.folderIds[1] must be unique",
    ],
    [
      "a negative index",
      resourceCreateCommand({ index: -1 }),
      "payload.index must be an integer greater than or equal to 0",
    ],
    [
      "an index with a position",
      resourceCreateCommand({ index: 0, position: "first" }),
      "payload.index cannot be combined with payload.position",
    ],
    [
      "an unknown position",
      resourceCreateCommand({ position: "middle" }),
      "payload.position must be 'first', 'last', 'before', or 'after'",
    ],
    [
      "a position target without a position",
      resourceCreateCommand({ positionTargetResourceType: "sounds" }),
      "payload.positionTargetResourceType requires payload.position",
    ],
    [
      "a before position without a target",
      resourceCreateCommand({ position: "before" }),
      "payload.positionTargetResourceType must be a non-empty string when payload.position is 'before' or 'after'",
    ],
    [
      "a position target with a first position",
      resourceCreateCommand({
        position: "first",
        positionTargetResourceType: "sounds",
      }),
      "payload.positionTargetResourceType is allowed only when payload.position is 'before' or 'after'",
    ],
    [
      "an unknown position target type",
      resourceCreateCommand({
        position: "after",
        positionTargetResourceType: "files",
      }),
      `payload.positionTargetResourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
  ])("assetPack.resource.create rejects %s", (_label, command, message) => {
    expectPayloadError(validatePayload(command), message);
  });

  test.each([
    [
      "a placement",
      resourceUpdateCommand({ index: 0 }),
      "payload.index is not allowed",
    ],
    [
      "missing data",
      {
        type: "assetPack.resource.update",
        payload: { assetPackId: "pack-a", resourceType: "images" },
      },
      "payload.data is required",
    ],
    [
      "an empty pack id",
      resourceUpdateCommand({ assetPackId: " " }),
      "payload.assetPackId must be a non-empty string",
    ],
    [
      "an unknown resource type",
      resourceUpdateCommand({ resourceType: "scenes" }),
      `payload.resourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
    [
      "no folders",
      resourceUpdateCommand({ data: { folderIds: [] } }),
      "payload.data.folderIds must be a non-empty array",
    ],
    [
      "an empty folder id",
      resourceUpdateCommand({ data: { folderIds: ["folder-bg", ""] } }),
      "payload.data.folderIds[1] must be a non-empty string",
    ],
    [
      "an unknown data field",
      resourceUpdateCommand({ data: { folderIds: ["folder-bg"], name: "A" } }),
      "payload.data.name is not allowed",
    ],
  ])("assetPack.resource.update rejects %s", (_label, command, message) => {
    expectPayloadError(validatePayload(command), message);
  });

  test.each([
    [
      "the singular resource type field",
      {
        type: "assetPack.resource.delete",
        payload: { assetPackId: "pack-a", resourceType: "sounds" },
      },
      "payload.resourceType is not allowed",
    ],
    [
      "an empty pack id",
      resourceDeleteCommand({ assetPackId: "" }),
      "payload.assetPackId must be a non-empty string",
    ],
    [
      "an empty list",
      resourceDeleteCommand({ resourceTypes: [] }),
      "payload.resourceTypes must be a non-empty array",
    ],
    [
      "a type that is not a string",
      resourceDeleteCommand({ resourceTypes: [1] }),
      "payload.resourceTypes[0] must be a non-empty string",
    ],
    [
      "a repeated type",
      resourceDeleteCommand({ resourceTypes: ["sounds", "sounds"] }),
      "payload.resourceTypes[1] must be unique",
    ],
    [
      "an unknown type",
      resourceDeleteCommand({ resourceTypes: ["sounds", "voices"] }),
      `payload.resourceTypes[1] must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
  ])("assetPack.resource.delete rejects %s", (_label, command, message) => {
    expectPayloadError(validatePayload(command), message);
  });

  test.each([
    [
      "data",
      resourceMoveCommand({ data: { folderIds: ["folder-bgm"] } }),
      "payload.data is not allowed",
    ],
    [
      "an empty pack id",
      resourceMoveCommand({ assetPackId: "" }),
      "payload.assetPackId must be a non-empty string",
    ],
    [
      "an unknown resource type",
      resourceMoveCommand({ resourceType: "files" }),
      `payload.resourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
    [
      "no placement",
      resourceMoveCommand({ position: undefined }),
      "payload.index or payload.position is required",
    ],
    [
      "an index with a position",
      resourceMoveCommand({ index: 1 }),
      "payload.index cannot be combined with payload.position",
    ],
    [
      "an index that is not an integer",
      resourceMoveCommand({ position: undefined, index: 0.5 }),
      "payload.index must be an integer greater than or equal to 0",
    ],
    [
      "a position target with an index",
      resourceMoveCommand({
        position: undefined,
        index: 0,
        positionTargetResourceType: "images",
      }),
      "payload.positionTargetResourceType requires payload.position",
    ],
    [
      "an after position without a target",
      resourceMoveCommand({ position: "after" }),
      "payload.positionTargetResourceType must be a non-empty string when payload.position is 'before' or 'after'",
    ],
    [
      "a position target with a last position",
      resourceMoveCommand({
        position: "last",
        positionTargetResourceType: "images",
      }),
      "payload.positionTargetResourceType is allowed only when payload.position is 'before' or 'after'",
    ],
    [
      "an unknown position target type",
      resourceMoveCommand({
        position: "before",
        positionTargetResourceType: "scenes",
      }),
      `payload.positionTargetResourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
  ])("assetPack.resource.move rejects %s", (_label, command, message) => {
    expectPayloadError(validatePayload(command), message);
  });

  test("processCommand reports payload errors before touching state", () => {
    const state = createPacksState();
    const command = resourceCreateCommand({
      data: { folderIds: ["folder-ui", "folder-ui"] },
    });

    expect(validateAgainstState({ state, command }).error.kind).toBe("payload");
    expect(processCommand({ state, command }).error.kind).toBe("payload");
    expect(state).toEqual(createPacksState());
  });
});

describe("assetPack preconditions", () => {
  test.each([
    [
      "an id that already exists",
      createCommand({ assetPackId: "pack-b" }),
      "payload.assetPackId must not already exist",
    ],
    [
      "a folder id that already exists",
      createCommand({
        assetPackId: "folder-packs",
        data: { type: "folder", name: "Packs" },
      }),
      "payload.assetPackId must not already exist",
    ],
    [
      "an unknown parent",
      createCommand({ assetPackId: "pack-d", parentId: "folder-missing" }),
      "payload.parentId must reference a folder asset pack item",
    ],
    [
      "a pack as parent",
      createCommand({ assetPackId: "pack-d", parentId: "pack-c" }),
      "payload.parentId must reference a folder asset pack item",
    ],
    [
      "an unknown position target",
      createCommand({
        assetPackId: "pack-d",
        position: "before",
        positionTargetId: "pack-missing",
      }),
      "payload.positionTargetId must reference an existing asset pack item",
    ],
    [
      "a position target under another parent",
      createCommand({
        assetPackId: "pack-d",
        position: "before",
        positionTargetId: "pack-a",
      }),
      "payload.positionTargetId must reference a sibling under payload.parentId",
    ],
    [
      "a tag that does not exist",
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({ tagIds: ["tag-chapter", "tag-missing"] }),
      }),
      "payload.data.tagIds[1] must reference an existing tag in scope 'assetPacks'",
    ],
    [
      "a tag from another scope",
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({ tagIds: ["tag-warm"] }),
      }),
      "payload.data.tagIds[0] must reference an existing tag in scope 'assetPacks'",
    ],
    [
      "a folder that does not exist",
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({
          resources: [
            { resourceType: "images", folderIds: ["folder-cg"] },
            { resourceType: "sounds", folderIds: ["folder-se", "folder-x"] },
          ],
        }),
      }),
      "payload.data.resources[1].folderIds[1] must reference an existing folder in 'sounds'",
    ],
    [
      "an item that is not a folder",
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({
          resources: [{ resourceType: "colors", folderIds: ["color-red"] }],
        }),
      }),
      "payload.data.resources[0].folderIds[0] must reference an existing folder in 'colors'",
    ],
    [
      "a folder of another collection",
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({
          resources: [{ resourceType: "images", folderIds: ["folder-bgm"] }],
        }),
      }),
      "payload.data.resources[0].folderIds[0] must reference an existing folder in 'images'",
    ],
    [
      "an update of a missing pack",
      updateCommand({ name: "Renamed" }, "pack-missing"),
      "payload.assetPackId must reference an existing asset pack item",
    ],
    [
      "an update with a tag that does not exist",
      updateCommand({ tagIds: ["tag-missing"] }),
      "payload.data.tagIds[0] must reference an existing tag in scope 'assetPacks'",
    ],
    [
      "tag ids on a folder",
      updateCommand({ tagIds: ["tag-chapter"] }, "folder-packs"),
      "folder asset pack items cannot update asset pack fields",
    ],
    [
      "a delete of a missing pack",
      {
        type: "assetPack.delete",
        payload: { assetPackIds: ["pack-a", "pack-missing"] },
      },
      "payload.assetPackIds must reference existing asset pack items",
    ],
    [
      "a move of a missing pack",
      {
        type: "assetPack.move",
        payload: { assetPackId: "pack-missing", position: "first" },
      },
      "payload.assetPackId must reference an existing asset pack item",
    ],
    [
      "a move into a pack",
      {
        type: "assetPack.move",
        payload: { assetPackId: "pack-a", parentId: "pack-c" },
      },
      "payload.parentId must reference a folder asset pack item",
    ],
    [
      "a move of a folder into itself",
      {
        type: "assetPack.move",
        payload: { assetPackId: "folder-packs", parentId: "folder-packs" },
      },
      "payload.parentId must not target the moved asset pack item or its descendants",
    ],
    [
      "a move of a folder into its descendant",
      {
        type: "assetPack.move",
        payload: { assetPackId: "folder-packs", parentId: "folder-nested" },
      },
      "payload.parentId must not target the moved asset pack item or its descendants",
    ],
    [
      "a move next to itself",
      {
        type: "assetPack.move",
        payload: {
          assetPackId: "pack-c",
          position: "after",
          positionTargetId: "pack-c",
        },
      },
      "payload.positionTargetId must not reference the moved asset pack item",
    ],
    [
      "a resource create in a missing pack",
      resourceCreateCommand({ assetPackId: "pack-missing" }),
      "payload.assetPackId must reference an existing asset pack",
    ],
    [
      "a resource create in a folder",
      resourceCreateCommand({ assetPackId: "folder-packs" }),
      "payload.assetPackId must reference an existing asset pack",
    ],
    [
      "a resource create of a type the pack has",
      resourceCreateCommand({
        resourceType: "sounds",
        data: { folderIds: ["folder-se"] },
      }),
      "payload.resourceType must not already exist in the asset pack",
    ],
    [
      "a resource create next to a type the pack lacks",
      resourceCreateCommand({
        position: "before",
        positionTargetResourceType: "videos",
      }),
      "payload.positionTargetResourceType must reference an existing asset pack resource",
    ],
    [
      "a resource create next to itself",
      resourceCreateCommand({
        position: "after",
        positionTargetResourceType: "layouts",
      }),
      "payload.positionTargetResourceType must reference an existing asset pack resource",
    ],
    [
      "a resource create with a folder that does not exist",
      resourceCreateCommand({ data: { folderIds: ["folder-ui", "folder-x"] } }),
      "payload.data.folderIds[1] must reference an existing folder in 'layouts'",
    ],
    [
      "a resource create with an item that is not a folder",
      resourceCreateCommand({
        resourceType: "colors",
        data: { folderIds: ["color-red"] },
      }),
      "payload.data.folderIds[0] must reference an existing folder in 'colors'",
    ],
    [
      "a resource create with a folder of another collection",
      resourceCreateCommand({ data: { folderIds: ["folder-bg"] } }),
      "payload.data.folderIds[0] must reference an existing folder in 'layouts'",
    ],
    [
      "a resource update in a missing pack",
      resourceUpdateCommand({ assetPackId: "pack-missing" }),
      "payload.assetPackId must reference an existing asset pack",
    ],
    [
      "a resource update of a type the pack lacks",
      resourceUpdateCommand({
        resourceType: "layouts",
        data: { folderIds: ["folder-ui"] },
      }),
      "payload.resourceType must reference an existing asset pack resource",
    ],
    [
      "a resource update with a folder that does not exist",
      resourceUpdateCommand({ data: { folderIds: ["folder-x"] } }),
      "payload.data.folderIds[0] must reference an existing folder in 'images'",
    ],
    [
      "a resource update with a folder of another collection",
      resourceUpdateCommand({
        data: { folderIds: ["folder-bg", "folder-se"] },
      }),
      "payload.data.folderIds[1] must reference an existing folder in 'images'",
    ],
    [
      "a resource delete in a folder",
      resourceDeleteCommand({ assetPackId: "folder-nested" }),
      "payload.assetPackId must reference an existing asset pack",
    ],
    [
      "a resource delete of a type the pack lacks",
      resourceDeleteCommand({ resourceTypes: ["sounds", "videos"] }),
      "payload.resourceTypes must reference existing asset pack resources",
    ],
    [
      "a resource move in a missing pack",
      resourceMoveCommand({ assetPackId: "pack-missing" }),
      "payload.assetPackId must reference an existing asset pack",
    ],
    [
      "a resource move of a type the pack lacks",
      resourceMoveCommand({ resourceType: "videos" }),
      "payload.resourceType must reference an existing asset pack resource",
    ],
    [
      "a resource move next to itself",
      resourceMoveCommand({
        position: "before",
        positionTargetResourceType: "sounds",
      }),
      "payload.positionTargetResourceType must not reference the moved asset pack resource",
    ],
    [
      "a resource move next to a type the pack lacks",
      resourceMoveCommand({
        position: "after",
        positionTargetResourceType: "layouts",
      }),
      "payload.positionTargetResourceType must reference an existing asset pack resource",
    ],
  ])("rejects %s", (_label, command, message) => {
    const state = createPacksState();

    expect(validatePayload(command)).toEqual({ valid: true });
    expectPreconditionError(validateAgainstState({ state, command }), message);
    expectPreconditionError(processCommand({ state, command }), message);
    expect(state).toEqual(createPacksState());
  });

  test("folder reference errors name the pack, resource type and folder", () => {
    const state = createPacksState();

    expect(
      validateAgainstState({
        state,
        command: createCommand({
          assetPackId: "pack-d",
          data: createPackData({
            resources: [{ resourceType: "images", folderIds: ["folder-x"] }],
          }),
        }),
      }).error.details,
    ).toEqual({
      assetPackId: "pack-d",
      resourceType: "images",
      folderId: "folder-x",
    });
    expect(
      validateAgainstState({
        state,
        command: resourceUpdateCommand({ data: { folderIds: ["folder-bgm"] } }),
      }).error.details,
    ).toEqual({
      assetPackId: "pack-a",
      resourceType: "images",
      folderId: "folder-bgm",
    });
  });

  test("a resource delete names the type the pack lacks", () => {
    expect(
      validateAgainstState({
        state: createPacksState(),
        command: resourceDeleteCommand({ resourceTypes: ["sounds", "videos"] }),
      }).error.details,
    ).toEqual({ resourceType: "videos" });
  });
});

describe("assetPack folder references", () => {
  test("a pack may list folders at any depth", () => {
    const state = expectProcessed(
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({
          resources: [
            { resourceType: "images", folderIds: ["folder-cg", "folder-ev"] },
          ],
        }),
      }),
    );

    expect(state.assetPacks.items["pack-d"].resources).toEqual([
      { resourceType: "images", folderIds: ["folder-cg", "folder-ev"] },
    ]);
  });

  test("moving a folder a pack lists keeps the pack valid", () => {
    const state = expectProcessed({
      type: "image.move",
      payload: { imageId: "folder-cg", parentId: "folder-ev" },
    });

    expect(state.assetPacks).toEqual(createPacksState().assetPacks);
  });

  test("deleting a folder a pack lists is rejected", () => {
    const state = createPacksState();
    const result = processCommand({
      state,
      command: { type: "image.delete", payload: { imageIds: ["folder-cg"] } },
    });

    expect(result).toEqual({
      valid: false,
      error: {
        kind: "invariant",
        code: "invariant_validation_failed",
        message: FOLDER_REFERENCE_MESSAGE,
        details: {
          assetPackId: "pack-a",
          assetPackName: "Starter",
          resourceType: "images",
          folderId: "folder-cg",
        },
      },
    });
    expect(state).toEqual(createPacksState());
  });

  test("deleting the parent of a folder a pack lists is rejected", () => {
    const state = createPacksState();
    state.assetPacks.items["pack-a"].resources[0].folderIds = ["folder-cg"];

    const result = processCommand({
      state,
      command: { type: "image.delete", payload: { imageIds: ["folder-bg"] } },
    });

    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("invariant");
    expect(result.error.message).toBe(FOLDER_REFERENCE_MESSAGE);
    expect(result.error.details).toEqual({
      assetPackId: "pack-a",
      assetPackName: "Starter",
      resourceType: "images",
      folderId: "folder-cg",
    });
  });

  test("a folder can be deleted once no pack lists it", () => {
    const result = replayCommands({
      state: createPacksState(),
      commands: [
        resourceUpdateCommand({ data: { folderIds: ["folder-bg"] } }),
        { type: "sound.delete", payload: { soundIds: ["folder-se"] } },
        { type: "image.delete", payload: { imageIds: ["folder-cg"] } },
        resourceDeleteCommand({ resourceTypes: ["sounds"] }),
        { type: "sound.delete", payload: { soundIds: ["folder-bgm"] } },
      ],
    });

    expect(result.valid, JSON.stringify(result.error)).toBe(true);
    expect(result.state.images.tree).toEqual([
      createTreeNode("folder-bg"),
      createTreeNode("folder-ev"),
    ]);
    expect(result.state.sounds).toEqual({ items: {}, tree: [] });
    expect(result.state.assetPacks.items["pack-a"].resources).toEqual([
      { resourceType: "images", folderIds: ["folder-bg"] },
    ]);
  });

  test.each([
    [
      "a folder that does not exist",
      (state) => {
        state.assetPacks.items["pack-c"].resources[0].folderIds.push(
          "folder-deleted",
        );
      },
      {
        assetPackId: "pack-c",
        assetPackName: "UI",
        resourceType: "layouts",
        folderId: "folder-deleted",
      },
    ],
    [
      "an item that is not a folder",
      (state) => {
        state.assetPacks.items["pack-c"].resources.push({
          resourceType: "colors",
          folderIds: ["folder-palette", "color-red"],
        });
      },
      {
        assetPackId: "pack-c",
        assetPackName: "UI",
        resourceType: "colors",
        folderId: "color-red",
      },
    ],
    [
      "a folder of another collection",
      (state) => {
        state.assetPacks.items["pack-c"].resources[0].folderIds = [
          "folder-bgm",
        ];
      },
      {
        assetPackId: "pack-c",
        assetPackName: "UI",
        resourceType: "layouts",
        folderId: "folder-bgm",
      },
    ],
  ])("validateState rejects a pack listing %s", (_label, mutate, details) => {
    const state = createPacksState();
    mutate(state);

    const result = validateState({ state });
    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("invariant");
    expect(result.error.message).toBe(FOLDER_REFERENCE_MESSAGE);
    expect(result.error.details).toEqual(details);
  });
});

describe("assetPack tags", () => {
  test("assetPack.create stores tag ids and leaves out an empty list", () => {
    const state = expectProcessed(
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({ tagIds: ["tag-audio", "tag-chapter"] }),
      }),
    );
    expect(state.assetPacks.items["pack-d"].tagIds).toEqual([
      "tag-audio",
      "tag-chapter",
    ]);

    const untagged = expectProcessed(
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({ tagIds: [] }),
      }),
    );
    expect(Object.hasOwn(untagged.assetPacks.items["pack-d"], "tagIds")).toBe(
      false,
    );
  });

  test.each([
    ["replaces tag ids", ["tag-audio"], ["tag-audio"]],
    ["removes tag ids with an empty list", [], undefined],
    ["keeps tag ids when they are undefined", undefined, ["tag-chapter"]],
  ])("assetPack.update %s", (_label, tagIds, expected) => {
    const state = expectProcessed(updateCommand({ name: "Opening", tagIds }));
    const pack = state.assetPacks.items["pack-a"];

    expect(pack.name).toBe("Opening");
    expect(pack.tagIds).toEqual(expected);
    expect(Object.hasOwn(pack, "tagIds")).toBe(expected !== undefined);
    expect(pack.resources).toEqual(
      createPacksState().assetPacks.items["pack-a"].resources,
    );
  });

  test("deleting a tag removes it from packs", () => {
    const state = createPacksState();
    state.assetPacks.items["pack-b"].tagIds = ["tag-audio", "tag-chapter"];

    const result = expectProcessed(
      {
        type: "tag.delete",
        payload: { scopeKey: "assetPacks", tagIds: ["tag-chapter"] },
      },
      state,
    );

    expect(result.tags.assetPacks).toEqual({
      items: { "tag-audio": createTag("tag-audio", "Audio") },
      tree: [{ id: "tag-audio" }],
    });
    expect(Object.hasOwn(result.assetPacks.items["pack-a"], "tagIds")).toBe(
      false,
    );
    expect(result.assetPacks.items["pack-b"].tagIds).toEqual(["tag-audio"]);
  });

  test("a tag can be created in the assetPacks scope", () => {
    const state = expectProcessed({
      type: "tag.create",
      payload: {
        scopeKey: "assetPacks",
        tagId: "tag-ui",
        data: { type: "tag", name: "UI" },
      },
    });

    expect(state.tags.assetPacks.items["tag-ui"]).toEqual(
      createTag("tag-ui", "UI"),
    );
  });

  test("older states without the assetPacks tag scope get an empty one", () => {
    const state = createEmptyTestState();
    delete state.tags.assetPacks;

    expect(validateState({ state })).toEqual({ valid: true });
    expect(normalizeState({ state }).tags.assetPacks).toEqual({
      items: {},
      tree: [],
    });
    expect(Object.hasOwn(state.tags, "assetPacks")).toBe(false);

    const result = processCommand({
      state,
      command: {
        type: "tag.create",
        payload: {
          scopeKey: "assetPacks",
          tagId: "tag-ui",
          data: { type: "tag", name: "UI" },
        },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.state.tags.assetPacks.tree).toEqual([{ id: "tag-ui" }]);
    expect(Object.hasOwn(state.tags, "assetPacks")).toBe(false);
  });

  test.each([
    [
      "a tag that does not exist",
      ["tag-chapter", "tag-missing"],
      "assetPack.tagIds[1] must reference an existing tag in scope 'assetPacks'",
      "tag-missing",
    ],
    [
      "a tag from another scope",
      ["tag-warm"],
      "assetPack.tagIds[0] must reference an existing tag in scope 'assetPacks'",
      "tag-warm",
    ],
  ])("validateState rejects %s", (_label, tagIds, message, tagId) => {
    const state = createPacksState();
    state.assetPacks.items["pack-c"].tagIds = tagIds;

    const result = validateState({ state });
    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("invariant");
    expect(result.error.message).toBe(message);
    expect(result.error.details).toEqual({
      assetPackId: "pack-c",
      scopeKey: "assetPacks",
      tagId,
    });
  });
});

describe("assetPack reducers", () => {
  test("assetPack.create stores a pack as given, keeping resource order", () => {
    const resources = [
      { resourceType: "sounds", folderIds: ["folder-se", "folder-bgm"] },
      { resourceType: "images", folderIds: ["folder-cg"] },
    ];
    const state = expectProcessed(
      createCommand({
        assetPackId: "pack-d",
        parentId: "folder-packs",
        position: "after",
        positionTargetId: "pack-a",
        data: createPackData({
          name: "Chapter",
          tagIds: ["tag-chapter"],
          resources,
        }),
      }),
    );

    expect(state.assetPacks.items["pack-d"]).toEqual({
      id: "pack-d",
      type: "assetPack",
      name: "Chapter",
      tagIds: ["tag-chapter"],
      resources,
    });
    expect(Object.hasOwn(state.assetPacks.items["pack-d"], "description")).toBe(
      false,
    );
    expect(state.assetPacks.tree[0].children.map(({ id }) => id)).toEqual([
      "pack-a",
      "pack-d",
      "folder-nested",
    ]);
  });

  test("assetPack.create gives a pack without resources an empty list", () => {
    const state = expectProcessed(
      createCommand({
        assetPackId: "pack-d",
        data: { type: "assetPack", name: "Later" },
      }),
    );

    expect(state.assetPacks.items["pack-d"]).toEqual({
      id: "pack-d",
      type: "assetPack",
      name: "Later",
      resources: [],
    });
  });

  test("assetPack.create stores a folder with its name only", () => {
    const result = processCommand({
      state: createEmptyTestState(),
      command: createCommand({
        assetPackId: "folder-new",
        data: { type: "folder", name: "New" },
      }),
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks).toEqual({
      items: {
        "folder-new": { id: "folder-new", type: "folder", name: "New" },
      },
      tree: [createTreeNode("folder-new")],
    });
  });

  test("assetPack.create stores a folder's description", () => {
    const result = processCommand({
      state: createEmptyTestState(),
      command: createCommand({
        assetPackId: "folder-new",
        data: { type: "folder", name: "New", description: "Chapter packs" },
      }),
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks.items["folder-new"]).toEqual({
      id: "folder-new",
      type: "folder",
      name: "New",
      description: "Chapter packs",
    });
  });

  test("assetPack.update changes the fields it names and keeps resources", () => {
    const state = expectProcessed(
      updateCommand({ name: "Opening", description: "" }),
    );

    expect(state.assetPacks.items["pack-a"]).toEqual({
      ...createPacksState().assetPacks.items["pack-a"],
      name: "Opening",
      description: "",
    });
  });

  test("assetPack.update gives a folder a description", () => {
    const state = expectProcessed(
      updateCommand({ description: "Chapter packs" }, "folder-packs"),
    );

    expect(state.assetPacks.items["folder-packs"]).toEqual({
      id: "folder-packs",
      type: "folder",
      name: "Packs",
      description: "Chapter packs",
    });
  });

  test("assetPack.update renames a folder", () => {
    const state = expectProcessed(
      updateCommand({ name: "Chapter Packs" }, "folder-packs"),
    );

    expect(state.assetPacks.items["folder-packs"]).toEqual({
      id: "folder-packs",
      type: "folder",
      name: "Chapter Packs",
    });
  });

  test("assetPack.delete removes a folder with everything inside it", () => {
    const state = expectProcessed({
      type: "assetPack.delete",
      payload: { assetPackIds: ["folder-packs"] },
    });

    expect(state.assetPacks).toEqual({
      items: {
        "pack-c": createPacksState().assetPacks.items["pack-c"],
      },
      tree: [createTreeNode("pack-c")],
    });
  });

  test("assetPack.move moves a folder with its contents", () => {
    const state = expectProcessed({
      type: "assetPack.move",
      payload: {
        assetPackId: "folder-nested",
        parentId: null,
        position: "first",
      },
    });

    expect(state.assetPacks.tree).toEqual([
      createTreeNode("folder-nested", [createTreeNode("pack-b")]),
      createTreeNode("folder-packs", [createTreeNode("pack-a")]),
      createTreeNode("pack-c"),
    ]);
    expect(state.assetPacks.items).toEqual(createPacksState().assetPacks.items);
  });

  test.each([
    ["last by default", {}, ["images", "sounds", "layouts"]],
    ["first", { position: "first" }, ["layouts", "images", "sounds"]],
    ["last", { position: "last" }, ["images", "sounds", "layouts"]],
    [
      "before a type",
      { position: "before", positionTargetResourceType: "sounds" },
      ["images", "layouts", "sounds"],
    ],
    [
      "before the first type",
      { position: "before", positionTargetResourceType: "images" },
      ["layouts", "images", "sounds"],
    ],
    [
      "after a type",
      { position: "after", positionTargetResourceType: "images" },
      ["images", "layouts", "sounds"],
    ],
    [
      "after the last type",
      { position: "after", positionTargetResourceType: "sounds" },
      ["images", "sounds", "layouts"],
    ],
    ["at index 0", { index: 0 }, ["layouts", "images", "sounds"]],
    ["at index 1", { index: 1 }, ["images", "layouts", "sounds"]],
    ["at an index past the end", { index: 9 }, ["images", "sounds", "layouts"]],
  ])(
    "assetPack.resource.create places a type %s",
    (_label, placement, expected) => {
      const state = expectProcessed(resourceCreateCommand(placement));

      expect(resourceTypesOf(state)).toEqual(expected);
      expect(state.assetPacks.items["pack-a"].resources).toContainEqual({
        resourceType: "layouts",
        folderIds: ["folder-ui"],
      });
    },
  );

  test("assetPack.resource.create adds the first type of an empty pack", () => {
    const state = expectProcessed(
      resourceCreateCommand({
        assetPackId: "pack-b",
        resourceType: "sounds",
        data: { folderIds: ["folder-se", "folder-bgm"] },
      }),
    );

    expect(state.assetPacks.items["pack-b"].resources).toEqual([
      { resourceType: "sounds", folderIds: ["folder-se", "folder-bgm"] },
    ]);
  });

  test("assetPack.resource.update replaces a type's folders in place", () => {
    const state = expectProcessed(
      resourceUpdateCommand({
        data: { folderIds: ["folder-ev", "folder-cg"] },
      }),
    );

    expect(state.assetPacks.items["pack-a"]).toEqual({
      ...createPacksState().assetPacks.items["pack-a"],
      resources: [
        { resourceType: "images", folderIds: ["folder-ev", "folder-cg"] },
        { resourceType: "sounds", folderIds: ["folder-bgm"] },
      ],
    });
  });

  test("assetPack.resource.delete removes the listed types", () => {
    const state = createPacksState();
    state.assetPacks.items["pack-a"].resources.push({
      resourceType: "layouts",
      folderIds: ["folder-ui"],
    });

    const partial = expectProcessed(
      resourceDeleteCommand({ resourceTypes: ["sounds"] }),
      state,
    );
    expect(partial.assetPacks.items["pack-a"].resources).toEqual([
      { resourceType: "images", folderIds: ["folder-cg", "folder-bg"] },
      { resourceType: "layouts", folderIds: ["folder-ui"] },
    ]);

    const empty = expectProcessed(
      resourceDeleteCommand({
        resourceTypes: ["layouts", "images", "sounds"],
      }),
      state,
    );
    expect(empty.assetPacks.items["pack-a"].resources).toEqual([]);
  });

  test.each([
    [
      "first",
      "layouts",
      { position: "first" },
      ["layouts", "images", "sounds"],
    ],
    ["last", "images", { position: "last" }, ["sounds", "layouts", "images"]],
    [
      "before a type",
      "layouts",
      { position: "before", positionTargetResourceType: "sounds" },
      ["images", "layouts", "sounds"],
    ],
    [
      "before the first type",
      "sounds",
      { position: "before", positionTargetResourceType: "images" },
      ["sounds", "images", "layouts"],
    ],
    [
      "after a type",
      "images",
      { position: "after", positionTargetResourceType: "sounds" },
      ["sounds", "images", "layouts"],
    ],
    [
      "after the last type",
      "images",
      { position: "after", positionTargetResourceType: "layouts" },
      ["sounds", "layouts", "images"],
    ],
    ["to index 0", "layouts", { index: 0 }, ["layouts", "images", "sounds"]],
    ["to index 1", "images", { index: 1 }, ["sounds", "images", "layouts"]],
    [
      "to an index past the end",
      "images",
      { index: 9 },
      ["sounds", "layouts", "images"],
    ],
    ["to where it is", "sounds", { index: 1 }, ["images", "sounds", "layouts"]],
  ])(
    "assetPack.resource.move places a type %s",
    (_label, resourceType, placement, expected) => {
      const state = createPacksState();
      state.assetPacks.items["pack-a"].resources.push({
        resourceType: "layouts",
        folderIds: ["folder-ui"],
      });

      const result = expectProcessed(
        resourceMoveCommand({
          resourceType,
          position: undefined,
          ...placement,
        }),
        state,
      );

      expect(resourceTypesOf(result)).toEqual(expected);
      expect(
        Object.fromEntries(
          result.assetPacks.items["pack-a"].resources.map((entry) => [
            entry.resourceType,
            entry.folderIds,
          ]),
        ),
      ).toEqual({
        images: ["folder-cg", "folder-bg"],
        sounds: ["folder-bgm"],
        layouts: ["folder-ui"],
      });
    },
  );

  test("asset pack commands do not mutate their inputs", () => {
    const state = deepFreeze(createPacksState());
    const commands = deepFreeze([
      resourceCreateCommand({ position: "first" }),
      resourceUpdateCommand({ data: { folderIds: ["folder-ev"] } }),
      resourceMoveCommand({ position: "last", resourceType: "layouts" }),
      resourceUpdateCommand({ data: { folderIds: ["folder-bg"] } }),
      resourceDeleteCommand(),
      updateCommand({ tagIds: ["tag-audio"] }),
      createCommand({
        assetPackId: "pack-d",
        data: createPackData({ tagIds: ["tag-chapter"] }),
      }),
      resourceCreateCommand({
        assetPackId: "pack-d",
        resourceType: "sounds",
        data: { folderIds: ["folder-se"] },
      }),
      resourceUpdateCommand({
        assetPackId: "pack-d",
        data: { folderIds: ["folder-cg", "folder-ev"] },
      }),
    ]);

    let current = state;
    for (const command of commands) {
      const result = processCommand({ state: current, command });
      expect(result.valid, JSON.stringify(result.error)).toBe(true);
      expect(result.state).not.toBe(current);
      current = deepFreeze(result.state);
    }

    const replayed = replayCommands({ state, commands });
    expect(replayed.valid, JSON.stringify(replayed.error)).toBe(true);
    expect(replayed.state).toEqual(current);
    expect(current.assetPacks.items["pack-a"].resources).toEqual([
      { resourceType: "images", folderIds: ["folder-bg"] },
      { resourceType: "layouts", folderIds: ["folder-ui"] },
    ]);
    expect(current.assetPacks.items["pack-d"].resources).toEqual([
      { resourceType: "images", folderIds: ["folder-cg", "folder-ev"] },
      { resourceType: "sounds", folderIds: ["folder-se"] },
    ]);
    expect(state).toEqual(createPacksState());
  });
});

describe("assetPack persisted state", () => {
  test("older states without the collection validate and get an empty one", () => {
    const state = createEmptyTestState();
    delete state.assetPacks;

    expect(validateState({ state })).toEqual({ valid: true });
    expect(normalizeState({ state }).assetPacks).toEqual({
      items: {},
      tree: [],
    });
    expect(state.assetPacks).toBeUndefined();

    const result = processCommand({
      state,
      command: createCommand({ data: createPackData({ resources: [] }) }),
    });
    expect(result.valid).toBe(true);
    expect(result.state.assetPacks).toEqual({
      items: {
        "pack-a": {
          id: "pack-a",
          type: "assetPack",
          name: "Starter",
          resources: [],
        },
      },
      tree: [createTreeNode("pack-a")],
    });
    expect(state.assetPacks).toBeUndefined();
  });

  test("project.create gives a project without packs an empty collection", () => {
    const projectState = createEmptyTestState();
    delete projectState.assetPacks;
    delete projectState.tags.assetPacks;

    const result = processCommand({
      state: createEmptyTestState(),
      command: { type: "project.create", payload: { state: projectState } },
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks).toEqual({ items: {}, tree: [] });
    expect(result.state.tags.assetPacks).toEqual({ items: {}, tree: [] });
  });

  test("accepts packs with tags and folders with descriptions", () => {
    const state = createPacksState();
    state.assetPacks.items["folder-packs"].description = "Chapter packs";

    expect(validateState({ state })).toEqual({ valid: true });
  });

  test.each([
    [
      "a collection that is not an object",
      (state) => {
        state.assetPacks = [];
      },
      "state.assetPacks must be an object",
    ],
    [
      "an unknown collection field",
      (state) => {
        state.assetPacks.order = [];
      },
      "state.assetPacks.order is not allowed",
    ],
    [
      "an unknown item type",
      (state) => {
        state.assetPacks.items["pack-c"].type = "pack";
      },
      "state.assetPacks.items.pack-c.type must be 'folder' or 'assetPack'",
    ],
    [
      "an id that does not match its key",
      (state) => {
        state.assetPacks.items["pack-c"].id = "pack-z";
      },
      "state.assetPacks.items.pack-c.id must match item key 'pack-c'",
    ],
    [
      "an empty name",
      (state) => {
        state.assetPacks.items["pack-c"].name = "";
      },
      "state.assetPacks.items.pack-c.name must be a non-empty string",
    ],
    [
      "a non-string description",
      (state) => {
        state.assetPacks.items["pack-c"].description = null;
      },
      "state.assetPacks.items.pack-c.description must be a string when provided",
    ],
    [
      "empty tag ids",
      (state) => {
        state.assetPacks.items["pack-c"].tagIds = [];
      },
      "state.assetPacks.items.pack-c.tagIds must be a non-empty array when provided",
    ],
    [
      "a tag id listed twice",
      (state) => {
        state.assetPacks.items["pack-a"].tagIds.push("tag-chapter");
      },
      "state.assetPacks.items.pack-a.tagIds[1] must be unique",
    ],
    [
      "a folder with tag ids",
      (state) => {
        state.assetPacks.items["folder-packs"].tagIds = ["tag-chapter"];
      },
      "state.assetPacks.items.folder-packs.tagIds is not allowed",
    ],
    [
      "missing resources",
      (state) => {
        delete state.assetPacks.items["pack-c"].resources;
      },
      "state.assetPacks.items.pack-c.resources must be an array",
    ],
    [
      "an unknown resource type",
      (state) => {
        state.assetPacks.items["pack-c"].resources[0].resourceType = "voices";
      },
      `state.assetPacks.items.pack-c.resources[0].resourceType must be one of: ${RESOURCE_TYPES_LIST}`,
    ],
    [
      "a resource type listed twice",
      (state) => {
        state.assetPacks.items["pack-c"].resources.push({
          resourceType: "layouts",
          folderIds: ["folder-ui"],
        });
      },
      "state.assetPacks.items.pack-c.resources[1].resourceType must be unique within state.assetPacks.items.pack-c.resources",
    ],
    [
      "a folder id listed twice",
      (state) => {
        state.assetPacks.items["pack-c"].resources[0].folderIds.push(
          "folder-ui",
        );
      },
      "state.assetPacks.items.pack-c.resources[0].folderIds[1] must be unique",
    ],
    [
      "a resource with no folders",
      (state) => {
        state.assetPacks.items["pack-c"].resources[0].folderIds = [];
      },
      "state.assetPacks.items.pack-c.resources[0].folderIds must be a non-empty array",
    ],
    [
      "a folder with a non-string description",
      (state) => {
        state.assetPacks.items["folder-packs"].description = 1;
      },
      "state.assetPacks.items.folder-packs.description must be a string when provided",
    ],
    [
      "a folder with resources",
      (state) => {
        state.assetPacks.items["folder-packs"].resources = [];
      },
      "state.assetPacks.items.folder-packs.resources is not allowed",
    ],
    [
      "a pack with children",
      (state) => {
        state.assetPacks.tree = [
          createTreeNode("folder-packs", [
            createTreeNode("pack-a", [createTreeNode("pack-c")]),
            createTreeNode("folder-nested", [createTreeNode("pack-b")]),
          ]),
        ];
      },
      "state.assetPacks.tree[0].children[0].children requires 'pack-a' to be a folder asset pack item",
    ],
    [
      "an item missing from the tree",
      (state) => {
        state.assetPacks.tree.pop();
      },
      "state.assetPacks.tree is missing item 'pack-c'",
    ],
    [
      "a tree node without an item",
      (state) => {
        state.assetPacks.tree.push(createTreeNode("pack-missing"));
      },
      "state.assetPacks.tree[2].id must reference an existing item",
    ],
  ])("rejects %s", (_label, mutate, message) => {
    const state = createPacksState();
    mutate(state);

    const result = validateState({ state });
    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("state");
    expect(result.error.message).toBe(message);
  });
});
