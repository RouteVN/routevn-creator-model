import { describe, expect, test } from "vitest";

import {
  normalizeState,
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

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

const createTreeNode = (id, children = []) => ({ id, children });

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

// folder-packs holds pack-a and folder-nested, which holds pack-b; pack-c is
// at the root.
const createPacksState = () => {
  const state = createEmptyTestState();
  state.assetPacks = {
    items: {
      "folder-packs": { id: "folder-packs", type: "folder", name: "Packs" },
      "folder-nested": {
        id: "folder-nested",
        type: "folder",
        name: "Nested",
      },
      "pack-a": {
        id: "pack-a",
        type: "assetPack",
        name: "Starter",
        description: "Opening chapter",
        resources: [
          { resourceType: "images", folderIds: ["folder-cg", "folder-bg"] },
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

describe("assetPack payload validation", () => {
  test.each([
    [
      "an empty pack",
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
      "a resource with no folders",
      createCommand({
        data: createPackData({
          resources: [{ resourceType: "sounds", folderIds: [] }],
        }),
      }),
    ],
    ["a folder", createCommand({ data: { type: "folder", name: "Packs" } })],
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
    ["clearing resources", updateCommand({ resources: [] })],
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
      "tag ids",
      createCommand({ data: createPackData({ tagIds: ["tag-a"] }) }),
      "payload.data.tagIds is not allowed",
    ],
    [
      "missing resources",
      createCommand({
        data: { type: "assetPack", name: "Starter" },
      }),
      "payload.data.resources must be an array",
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
            { resourceType: "images", folderIds: [], imageIds: ["image-a"] },
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
      "payload.data.resources[0].folderIds must be an array",
    ],
    [
      "an unknown resource type",
      createCommand({
        data: createPackData({
          resources: [{ resourceType: "files", folderIds: [] }],
        }),
      }),
      `payload.data.resources[0].resourceType must be one of: ${RESOURCE_TYPES.map((key) => `'${key}'`).join(", ")}`,
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
      "a folder with a description",
      createCommand({
        data: { type: "folder", name: "Packs", description: "" },
      }),
      "payload.data.description is not allowed",
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
      "tag ids",
      updateCommand({ tagIds: [] }),
      "payload.data.tagIds is not allowed",
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
      "null resources",
      updateCommand({ resources: null }),
      "payload.data.resources must be an array",
    ],
    [
      "a resource type listed twice",
      updateCommand({
        resources: [
          { resourceType: "layouts", folderIds: [] },
          { resourceType: "layouts", folderIds: [] },
        ],
      }),
      "payload.data.resources[1].resourceType must be unique within payload.data.resources",
    ],
    [
      "a folder id listed twice",
      updateCommand({
        resources: [
          { resourceType: "layouts", folderIds: ["folder-ui", "folder-ui"] },
        ],
      }),
      "payload.data.resources[0].folderIds[1] must be unique",
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

  test("processCommand reports payload errors before touching state", () => {
    const state = createPacksState();
    const command = updateCommand({
      resources: [
        { resourceType: "images", folderIds: ["folder-cg"] },
        { resourceType: "images", folderIds: ["folder-bg"] },
      ],
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
      "an update of a missing pack",
      updateCommand({ name: "Renamed" }, "pack-missing"),
      "payload.assetPackId must reference an existing asset pack item",
    ],
    [
      "resources on a folder",
      updateCommand({ resources: [] }, "folder-packs"),
      "folder asset pack items cannot update asset pack fields",
    ],
    [
      "a description on a folder",
      updateCommand({ name: "Packs", description: "" }, "folder-packs"),
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
  ])("rejects %s", (_label, command, message) => {
    const state = createPacksState();

    expect(validatePayload(command)).toEqual({ valid: true });
    expectPreconditionError(validateAgainstState({ state, command }), message);
    expectPreconditionError(processCommand({ state, command }), message);
  });

  test("folder ids are not checked against their collections", () => {
    const state = createPacksState();
    const command = createCommand({
      assetPackId: "pack-d",
      data: createPackData({
        resources: [
          { resourceType: "images", folderIds: ["folder-missing"] },
          { resourceType: "controls", folderIds: ["pack-a"] },
        ],
      }),
    });

    expect(validateAgainstState({ state, command })).toEqual({ valid: true });
  });
});

describe("assetPack reducers", () => {
  test("assetPack.create stores a pack as given, keeping resource order", () => {
    const resources = [
      { resourceType: "sounds", folderIds: ["folder-se", "folder-bgm"] },
      { resourceType: "images", folderIds: ["folder-cg"] },
    ];
    const result = processCommand({
      state: createPacksState(),
      command: createCommand({
        assetPackId: "pack-d",
        parentId: "folder-packs",
        position: "after",
        positionTargetId: "pack-a",
        data: createPackData({ name: "Chapter", resources }),
      }),
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks.items["pack-d"]).toEqual({
      id: "pack-d",
      type: "assetPack",
      name: "Chapter",
      resources,
    });
    expect(
      Object.hasOwn(result.state.assetPacks.items["pack-d"], "description"),
    ).toBe(false);
    expect(
      result.state.assetPacks.tree[0].children.map(({ id }) => id),
    ).toEqual(["pack-a", "pack-d", "folder-nested"]);
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

  test("assetPack.update replaces resources and keeps the other fields", () => {
    const resources = [
      { resourceType: "layouts", folderIds: ["folder-menu"] },
      { resourceType: "images", folderIds: ["folder-bg", "folder-cg"] },
    ];
    const result = processCommand({
      state: createPacksState(),
      command: updateCommand({ resources }),
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks.items["pack-a"]).toEqual({
      id: "pack-a",
      type: "assetPack",
      name: "Starter",
      description: "Opening chapter",
      resources,
    });
  });

  test("assetPack.update renames a folder", () => {
    const result = processCommand({
      state: createPacksState(),
      command: updateCommand({ name: "Chapter Packs" }, "folder-packs"),
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks.items["folder-packs"]).toEqual({
      id: "folder-packs",
      type: "folder",
      name: "Chapter Packs",
    });
  });

  test("assetPack.delete removes a folder with everything inside it", () => {
    const result = processCommand({
      state: createPacksState(),
      command: {
        type: "assetPack.delete",
        payload: { assetPackIds: ["folder-packs"] },
      },
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks).toEqual({
      items: {
        "pack-c": createPacksState().assetPacks.items["pack-c"],
      },
      tree: [createTreeNode("pack-c")],
    });
  });

  test("assetPack.move moves a folder with its contents", () => {
    const result = processCommand({
      state: createPacksState(),
      command: {
        type: "assetPack.move",
        payload: {
          assetPackId: "folder-nested",
          parentId: null,
          position: "first",
        },
      },
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks.tree).toEqual([
      createTreeNode("folder-nested", [createTreeNode("pack-b")]),
      createTreeNode("folder-packs", [createTreeNode("pack-a")]),
      createTreeNode("pack-c"),
    ]);
    expect(result.state.assetPacks.items).toEqual(
      createPacksState().assetPacks.items,
    );
  });

  test("deleting a folder a pack lists leaves the pack unchanged", () => {
    const state = createPacksState();
    state.images.items["folder-cg"] = {
      id: "folder-cg",
      type: "folder",
      name: "CG",
    };
    state.images.tree = [createTreeNode("folder-cg")];

    const result = processCommand({
      state,
      command: { type: "image.delete", payload: { imageIds: ["folder-cg"] } },
    });

    expect(result.valid).toBe(true);
    expect(result.state.images).toEqual({ items: {}, tree: [] });
    expect(result.state.assetPacks).toEqual(state.assetPacks);
    expect(validateState({ state: result.state })).toEqual({ valid: true });
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

    const result = processCommand({
      state: createEmptyTestState(),
      command: { type: "project.create", payload: { state: projectState } },
    });

    expect(result.valid).toBe(true);
    expect(result.state.assetPacks).toEqual({ items: {}, tree: [] });
  });

  test("accepts packs, folders, and ids of folders that do not exist", () => {
    expect(validateState({ state: createPacksState() })).toEqual({
      valid: true,
    });
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
      "tag ids",
      (state) => {
        state.assetPacks.items["pack-c"].tagIds = ["tag-a"];
      },
      "state.assetPacks.items.pack-c.tagIds is not allowed",
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
      `state.assetPacks.items.pack-c.resources[0].resourceType must be one of: ${RESOURCE_TYPES.map((key) => `'${key}'`).join(", ")}`,
    ],
    [
      "a resource type listed twice",
      (state) => {
        state.assetPacks.items["pack-c"].resources.push({
          resourceType: "layouts",
          folderIds: ["folder-menu"],
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
      "a folder with a description",
      (state) => {
        state.assetPacks.items["folder-packs"].description = "";
      },
      "state.assetPacks.items.folder-packs.description is not allowed",
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
