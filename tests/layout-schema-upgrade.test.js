import { describe, expect, it } from "vitest";

import {
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const createTreeNode = (id, children = []) => ({
  id,
  children,
});

const createEmptyNestedCollection = () => ({
  items: {},
  tree: [],
});

const createLayoutElement = (id, data = {}) => ({
  id,
  type: "container",
  name: id,
  ...data,
});

const createLayoutElements = () => ({
  items: {
    "root-a": createLayoutElement("root-a"),
    "root-b": createLayoutElement("root-b"),
    flow: createLayoutElement("flow", {
      direction: "horizontal",
    }),
    "flow-a": createLayoutElement("flow-a"),
    "flow-b": createLayoutElement("flow-b"),
    "flow-stack": createLayoutElement("flow-stack"),
    "inner-a": createLayoutElement("inner-a"),
    "inner-b": createLayoutElement("inner-b"),
  },
  tree: [
    createTreeNode("root-a"),
    createTreeNode("flow", [
      createTreeNode("flow-a"),
      createTreeNode("flow-stack", [
        createTreeNode("inner-a"),
        createTreeNode("inner-b"),
      ]),
      createTreeNode("flow-b"),
    ]),
    createTreeNode("root-b"),
  ],
});

const createStateWithLayout = ({
  layoutSchemaVersion,
  layoutId = "layout-1",
  elements = createLayoutElements(),
} = {}) => {
  const state = createEmptyTestState();
  const layout = {
    id: layoutId,
    type: "layout",
    name: "Layout 1",
    layoutType: "general",
    elements,
  };

  if (layoutSchemaVersion !== undefined) {
    layout.layoutSchemaVersion = layoutSchemaVersion;
  }

  state.layouts.items[layoutId] = layout;
  state.layouts.tree = [createTreeNode(layoutId)];

  return state;
};

const selectNodeIds = (nodes) => nodes.map((node) => node.id);

describe("layout.schema.upgrade", () => {
  it("upgrades old layouts to schema version 2 and preserves directed container order", () => {
    const state = createStateWithLayout();
    const originalState = structuredClone(state);

    const result = processCommand({
      state,
      command: {
        type: "layout.schema.upgrade",
        payload: {
          layoutIds: ["layout-1"],
          targetSchemaVersion: 2,
        },
      },
    });

    expect(result.valid).toBe(true);
    expect(state).toEqual(originalState);

    const layout = result.state.layouts.items["layout-1"];
    expect(layout.layoutSchemaVersion).toBe(2);
    expect(selectNodeIds(layout.elements.tree)).toEqual([
      "root-b",
      "flow",
      "root-a",
    ]);

    const flowNode = layout.elements.tree[1];
    expect(selectNodeIds(flowNode.children)).toEqual([
      "flow-a",
      "flow-stack",
      "flow-b",
    ]);
    expect(selectNodeIds(flowNode.children[1].children)).toEqual([
      "inner-b",
      "inner-a",
    ]);
  });

  it("is idempotent for layouts already at schema version 2", () => {
    const firstResult = processCommand({
      state: createStateWithLayout(),
      command: {
        type: "layout.schema.upgrade",
        payload: {
          layoutIds: ["layout-1"],
          targetSchemaVersion: 2,
        },
      },
    });
    expect(firstResult.valid).toBe(true);

    const secondResult = processCommand({
      state: firstResult.state,
      command: {
        type: "layout.schema.upgrade",
        payload: {
          layoutIds: ["layout-1"],
          targetSchemaVersion: 2,
        },
      },
    });

    expect(secondResult.valid).toBe(true);
    expect(secondResult.state.layouts.items["layout-1"].elements.tree).toEqual(
      firstResult.state.layouts.items["layout-1"].elements.tree,
    );
  });

  it("rejects unsupported target schema versions", () => {
    const result = validatePayload({
      type: "layout.schema.upgrade",
      payload: {
        layoutIds: ["layout-1"],
        targetSchemaVersion: 3,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe("payload.targetSchemaVersion must be 2");
  });

  it("requires layout ids to reference existing layouts", () => {
    const state = createEmptyTestState();
    state.layouts.items["folder-1"] = {
      id: "folder-1",
      type: "folder",
      name: "Folder",
    };
    state.layouts.tree = [createTreeNode("folder-1")];

    const result = validateAgainstState({
      state,
      command: {
        type: "layout.schema.upgrade",
        payload: {
          layoutIds: ["folder-1"],
          targetSchemaVersion: 2,
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "payload.layoutIds must reference existing layouts",
    );
  });

  it("allows new layouts to be created with schema version 2", () => {
    const result = processCommand({
      state: createEmptyTestState(),
      command: {
        type: "layout.create",
        payload: {
          layoutId: "layout-1",
          data: {
            type: "layout",
            name: "Layout 1",
            layoutType: "general",
            layoutSchemaVersion: 2,
            elements: createEmptyNestedCollection(),
          },
        },
      },
    });

    expect(result.valid).toBe(true);
    expect(result.state.layouts.items["layout-1"].layoutSchemaVersion).toBe(2);
  });

  it("rejects unsupported future layout schema versions in state", () => {
    const result = validateState({
      state: createStateWithLayout({
        layoutSchemaVersion: 3,
      }),
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "state.layouts.items.layout-1.layoutSchemaVersion must be 2 when provided",
    );
  });

  it("rejects legacy explicit layout schema versions in state", () => {
    const result = validateState({
      state: createStateWithLayout({
        layoutSchemaVersion: 1,
      }),
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "state.layouts.items.layout-1.layoutSchemaVersion must be 2 when provided",
    );
  });
});
