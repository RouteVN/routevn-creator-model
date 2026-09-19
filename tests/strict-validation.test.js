import { describe, expect, test } from "vitest";
import {
  processCommand,
  replayCommands,
  validateAgainstState,
  validatePayload,
  validateState,
  SCHEMA_VERSION,
} from "../src/index.js";
import { ACTION_NAMES } from "../src/strictActions.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const strict = (type, payload) => ({
  type,
  payload,
  modelSchemaVersion: SCHEMA_VERSION,
});
const lineCommand = (data, options = {}) =>
  strict("line.update_actions", { lineId: "line-one", data, ...options });
function stateWith(actions = {}) {
  const result = replayCommands({
    state: createEmptyTestState(),
    commands: [
      {
        type: "scene.create",
        payload: { sceneId: "scene-one", data: { name: "Scene One" } },
      },
      {
        type: "section.create",
        payload: {
          sceneId: "scene-one",
          sectionId: "section-one",
          data: { name: "Section One" },
        },
      },
      {
        type: "line.create",
        payload: {
          sectionId: "section-one",
          lines: [{ lineId: "line-one", data: { actions } }],
        },
      },
    ],
  });
  expect(result.valid).toBe(true);
  return result.state;
}
const getActions = (state) =>
  state.scenes.items["scene-one"].sections.items["section-one"].lines.items[
    "line-one"
  ].actions;

test("the first strict schema has an explicit contract; omission alone selects historical replay", () => {
  const command = lineCommand({ unknownLegacyAction: { arbitrary: true } });
  expect(validatePayload(command).valid).toBe(false);
  delete command.modelSchemaVersion;
  expect(validatePayload(command)).toEqual({ valid: true });
  expect(processCommand({ state: stateWith(), command }).valid).toBe(true);
});

test.each([undefined, null, 0, 1, 15, 17, 16.1, "16", NaN, Infinity])(
  "unsupported explicit version %s fails every public boundary",
  (version) => {
    const state = stateWith();
    const command = {
      ...lineCommand({ dialogue: { content: "Hello" } }),
      modelSchemaVersion: version,
    };
    const results = [
      validatePayload(command),
      validateAgainstState({ state, command }),
      processCommand({ state, command }),
      replayCommands({ state, commands: [command] }),
      validateState({ state, modelSchemaVersion: version }),
    ];
    for (const result of results)
      expect(result).toMatchObject({
        valid: false,
        error: { code: "unsupported_model_schema_version" },
      });
  },
);

const minimalActions = {
  background: {},
  bgm: {},
  character: {},
  choice: {},
  control: { resourceId: "control-one" },
  dialogue: { content: "Hello" },
  form: { resourceId: "input-one", fields: { name: { variableId: "name" } } },
  screen: {},
  sfx: {},
  visual: {},
  voice: { sounds: [] },
  nextLine: {},
  setNextLineConfig: {},
  toggleAutoMode: {},
  startSkipMode: {},
  stopSkipMode: {},
  toggleSkipMode: {},
  toggleDialogueUI: {},
  pushOverlay: { resourceId: "overlay-one" },
  popOverlay: {},
  rollbackByOffset: {},
  sectionTransition: { sectionId: "section-one" },
  resetStoryAtSection: { sectionId: "section-one" },
  saveSlot: { slotId: 1 },
  loadSlot: { slotId: 1 },
  updateVariable: {
    id: "operation1",
    operations: [{ variableId: "score", op: "set", value: 1 }],
  },
  conditional: { branches: [{ when: true, actions: { nextLine: {} } }] },
  showConfirmDialog: {
    resourceId: "confirm-one",
    confirmActions: { nextLine: {} },
  },
  hideConfirmDialog: {},
  setDialogueTextSpeed: { value: 1 },
  setAutoForwardDelay: { value: 1 },
  setSkipUnseenText: { value: true },
  setSkipTransitionsAndAnimations: { value: true },
  setSoundVolume: { value: 50 },
  setMusicVolume: { value: 50 },
  setMuteAll: { value: true },
  setSaveLoadPagination: { value: 1 },
  incrementSaveLoadPagination: {},
  decrementSaveLoadPagination: {},
  setMenuPage: { value: "one" },
  setMenuEntryPoint: { value: "one" },
};
test("the strict action test matrix covers the entire action registry", () => {
  expect(Object.keys(minimalActions).sort()).toEqual(ACTION_NAMES);
  expect(ACTION_NAMES).toHaveLength(41);
});
describe.each(Object.entries(minimalActions))("%s", (name, value) => {
  test("accepts its minimal closed shape", () =>
    expect(validatePayload(lineCommand({ [name]: value }))).toEqual({
      valid: true,
    }));
  test("rejects an unknown structural field", () =>
    expect(
      validatePayload(lineCommand({ [name]: { ...value, unrecognized: true } }))
        .valid,
    ).toBe(false));
});

test("strict patches retain unrelated historical actions but replacement validates all new content", () => {
  const state = stateWith({
    unknownLegacyAction: { arbitrary: true },
    dialogue: { content: "Old" },
  });
  const command = lineCommand({ dialogue: { content: "New" } });
  const result = processCommand({ state, command });
  expect(result.valid).toBe(true);
  expect(getActions(result.state)).toEqual({
    unknownLegacyAction: { arbitrary: true },
    dialogue: { content: "New" },
  });
  expect(
    validateState({ state: result.state, modelSchemaVersion: SCHEMA_VERSION })
      .valid,
  ).toBe(false);
  expect(
    processCommand({
      state,
      command: lineCommand(getActions(state), { replace: true }),
    }).valid,
  ).toBe(false);
  expect(getActions(state).dialogue.content).toBe("Old");
});

test("preserved dialogue content is part of the affected strict result", () => {
  const state = stateWith({
    dialogue: { content: [{ legacyField: "invalid" }] },
  });
  const command = lineCommand(
    { dialogue: { textSpeed: 20 } },
    { preserve: ["dialogue.content"] },
  );
  expect(processCommand({ state, command }).valid).toBe(false);
  expect(validateAgainstState({ state, command }).valid).toBe(false);
});

test("mixed sequential and batch replay agree and retain the strict failing command index", () => {
  const state = stateWith();
  const commands = [
    {
      type: "line.update_actions",
      payload: { lineId: "line-one", data: { legacy: {} } },
    },
    lineCommand({ dialogue: { content: "New" } }),
  ];
  let sequential = state;
  for (const command of commands) {
    const result = processCommand({ state: sequential, command });
    expect(result.valid).toBe(true);
    sequential = result.state;
  }
  expect(replayCommands({ state, commands })).toEqual({
    valid: true,
    state: sequential,
  });
  commands.push(
    lineCommand({ setMusicVolume: { value: 101 } }),
    lineCommand({}, { replace: true }),
  );
  expect(replayCommands({ state, commands })).toMatchObject({
    valid: false,
    error: { details: { commandIndex: 2 } },
  });
});

test.each([
  { setSoundVolume: { value: 101 } },
  { setSaveLoadPagination: { value: 1.5 } },
  { setMuteAll: { value: 1 } },
  { nextLine: {}, sectionTransition: { sectionId: "section-one" } },
  { nextLine: {}, conditional: { branches: [{ actions: { nextLine: {} } }] } },
  { conditional: { branches: [{ actions: { dialogue: { content: "No" } } }] } },
  { conditional: { branches: [{ when: { evil: [] }, actions: {} }] } },
  {
    showConfirmDialog: {
      resourceId: "one",
      confirmActions: { setSoundVolume: { value: "_event.value" } },
    },
  },
  { dialogue: { content: "${variables.__proto__}" } },
  {
    updateVariable: {
      id: "op1",
      operations: [
        { variableId: "object-one", op: "set", value: { arbitrary: true } },
      ],
    },
  },
])("rejects invalid action contracts %#", (actions) =>
  expect(validatePayload(lineCommand(actions)).valid).toBe(false),
);

test("literal object values retain inert templates and prototype-like data keys", () => {
  const value = JSON.parse(
    '{"__proto__":{"safe":true},"template":"${variables.any}","event":"_event.value"}',
  );
  const command = lineCommand({
    updateVariable: {
      id: "op1",
      operations: [
        { variableId: "object-one", op: "set", value, valueMode: "literal" },
      ],
    },
  });
  expect(validatePayload(command)).toEqual({ valid: true });
  expect(
    Object.hasOwn(
      command.payload.data.updateVariable.operations[0].value,
      "__proto__",
    ),
  ).toBe(true);
});

test.each([
  undefined,
  NaN,
  Infinity,
  1n,
  () => {},
  Symbol("x"),
  new Date(),
  new Map(),
  new Uint8Array([1]),
])("rejects non-JSON input before normalization or cloning: %s", (value) => {
  expect(
    validatePayload(lineCommand({ dialogue: { content: value } })).valid,
  ).toBe(false);
});
test("does not invoke accessors, and rejects cycles and sparse arrays", () => {
  let read = false;
  const value = {
    get content() {
      read = true;
      throw Error("must not execute");
    },
  };
  expect(validatePayload(lineCommand({ dialogue: value })).valid).toBe(false);
  expect(read).toBe(false);
  const cycle = {};
  cycle.child = cycle;
  for (const item of [cycle, Array(2)])
    expect(
      validatePayload(lineCommand({ dialogue: { content: item } })).valid,
    ).toBe(false);
});

function apply(state, type, payload, versioned = true) {
  const command = versioned ? strict(type, payload) : { type, payload };
  const result = processCommand({ state, command });
  expect(result.valid, JSON.stringify(result.error)).toBe(true);
  return result.state;
}
function withImage(state) {
  state = apply(state, "file.create", {
    fileId: "file-one",
    data: { mimeType: "image/png", size: 1, sha256: "one" },
  });
  return apply(state, "image.create", {
    imageId: "image-one",
    data: { type: "image", name: "Image One", fileId: "file-one" },
  });
}
test("resource deletion rejects newly dangling legacy references, including beside invalid historical fields", () => {
  let state = withImage(stateWith());
  state = apply(
    state,
    "line.update_actions",
    {
      lineId: "line-one",
      data: {
        background: { obsolete: true, resourceId: "image-one" },
        dialogue: { content: "${variables.already-missing}" },
      },
    },
    false,
  );
  const snapshot = structuredClone(state);
  const command = strict("image.delete", { imageIds: ["image-one"] });
  expect(processCommand({ state, command })).toMatchObject({
    valid: false,
    error: { kind: "precondition", details: { referenceId: "image-one" } },
  });
  expect(validateAgainstState({ state, command }).valid).toBe(false);
  expect(state).toEqual(snapshot);
  state = apply(state, "line.update_actions", {
    lineId: "line-one",
    data: { background: {} },
  });
  state = apply(state, "image.delete", { imageIds: ["image-one"] });
  expect(getActions(state).dialogue.content).toBe(
    "${variables.already-missing}",
  );
});
test("same-identity moves preserve old lines and reject a voice that would leave its scene scope", () => {
  let state = stateWith({ unknownLegacyAction: true });
  state = apply(state, "scene.create", {
    sceneId: "scene-two",
    data: { name: "Scene Two" },
  });
  state = apply(state, "section.create", {
    sceneId: "scene-one",
    sectionId: "section-stays",
    data: { name: "Section Two" },
  });
  const command = strict("section.move", {
    sectionId: "section-one",
    sceneId: "scene-two",
    parentId: null,
    position: "last",
  });
  expect(
    processCommand({ state, command }).state.scenes.items["scene-two"].sections
      .items["section-one"].lines.items["line-one"].actions,
  ).toEqual({ unknownLegacyAction: true });
  state = apply(state, "file.create", {
    fileId: "voice-file",
    data: { mimeType: "audio/mpeg", size: 1, sha256: "voice" },
  });
  state = apply(state, "voice.create", {
    voiceId: "voice-one",
    data: {
      type: "voice",
      name: "Voice One",
      sceneId: "scene-one",
      fileId: "voice-file",
    },
  });
  state = apply(state, "line.update_actions", {
    lineId: "line-one",
    data: { voice: { resourceId: "voice-one" } },
  });
  expect(processCommand({ state, command })).toMatchObject({
    valid: false,
    error: { kind: "precondition" },
  });
});
test("literal object keys never create reference dependencies", () => {
  let state = withImage(stateWith());
  state = apply(state, "variable.create", {
    variableId: "object-one",
    data: {
      type: "variable",
      variableType: "object",
      name: "Data",
      scope: "context",
      default: {},
      value: {},
    },
  });
  state = apply(state, "line.update_actions", {
    lineId: "line-one",
    data: {
      updateVariable: {
        id: "op1",
        operations: [
          {
            variableId: "object-one",
            op: "set",
            valueMode: "literal",
            value: {
              background: { resourceId: "image-one" },
              text: "${variables.missing}",
            },
          },
        ],
      },
    },
  });
  expect(
    processCommand({
      state,
      command: strict("image.delete", { imageIds: ["image-one"] }),
    }).valid,
  ).toBe(true);
});
test("a strict project rejects unsupported variable shapes instead of filtering them", () => {
  const state = stateWith();
  state.variables.items.bad = { id: "bad", type: "obsolete", name: "Bad" };
  state.variables.tree.push({ id: "bad", children: [] });
  expect(validateState({ state })).toEqual({ valid: true });
  expect(
    validateState({ state, modelSchemaVersion: SCHEMA_VERSION }).valid,
  ).toBe(false);
  expect(validatePayload(strict("project.create", { state })).valid).toBe(
    false,
  );
});

test("explicit schema and payload accessors are rejected without invoking them", () => {
  let calls = 0;
  const command = lineCommand({ dialogue: { content: "Hello" } });
  Object.defineProperty(command, "modelSchemaVersion", { enumerable: true, get() { calls++; return SCHEMA_VERSION; } });
  expect(validatePayload(command).error.code).toBe("unsupported_model_schema_version");
  expect(processCommand({ state: stateWith(), command }).valid).toBe(false);
  expect(validateAgainstState({ state: stateWith(), command }).valid).toBe(false);
  const payloadAccessor = { type: "line.update_actions", modelSchemaVersion: SCHEMA_VERSION };
  Object.defineProperty(payloadAccessor, "payload", { enumerable: true, get() { calls++; return {}; } });
  expect(validatePayload(payloadAccessor).valid).toBe(false);
  expect(calls).toBe(0);
});

test("condition budgets include primitive operands and literal data", () => {
  const conditional = (when) => lineCommand({ conditional: { branches: [{ when, actions: { nextLine: {} } }] } });
  expect(validatePayload(conditional({ all: Array(4096).fill(true) })).valid).toBe(false);
  expect(validatePayload(conditional({ eq: [{ literal: "x".repeat(16384) }, "x"] })).valid).toBe(false);
  expect(validatePayload(conditional({ in: [1, { literal: [1, "two"] }] })).valid).toBe(false);
  expect(validatePayload(conditional({ in: [1, { literal: [1, 2] }] })).valid).toBe(true);
  const legacy = conditional({ all: Array(4096).fill(true) });
  delete legacy.modelSchemaVersion;
  expect(validatePayload(legacy).valid).toBe(true);
});

test("changing a slider range cannot break an unchanged supported event binding", () => {
  const state = stateWith();
  const slider = { id: "slider-one", type: "slider", name: "Slider One", x: 0, y: 0, width: 100, height: 20, anchorX: 0, anchorY: 0, scaleX: 1, scaleY: 1, rotation: 0, min: 0, max: 100, step: 1,
    change: { payload: { actions: { setSoundVolume: { value: "_event.value" }, oldAction: { arbitrary: true } } } } };
  state.layouts.items["layout-one"] = { id: "layout-one", type: "layout", name: "Layout One", layoutType: "dialogue-adv", elements: { items: { "slider-one": slider }, tree: [{ id: "slider-one", children: [] }] } };
  state.layouts.tree.push({ id: "layout-one", children: [] });
  const update = (data) => processCommand({ state, command: strict("layout.element.update", { layoutId: "layout-one", elementId: "slider-one", data }) });
  expect(update({ name: "Renamed" }).valid).toBe(true);
  expect(update({ max: 101 }).valid).toBe(false);
  expect(update({ min: -1 }).valid).toBe(false);
  expect(update({ max: 90 }).valid).toBe(true);
});

test("enum changes cannot invalidate supported legacy operations", () => {
  let state = apply(stateWith(), "variable.create", {
    variableId: "color", data: { type: "variable", variableType: "string", name: "Color", scope: "context", default: "red", value: "red" },
  });
  state = apply(state, "line.update_actions", {
    lineId: "line-one", data: { updateVariable: { id: "op1", operations: [{ variableId: "color", op: "set", value: "blue" }] }, unknownLegacyAction: true },
  }, false);
  const command = strict("variable.update", { variableId: "color", data: { isEnum: true, enumValues: ["red"] } });
  expect(processCommand({ state, command })).toMatchObject({ valid: false, error: { kind: "precondition" } });
  state = apply(state, "line.update_actions", { lineId: "line-one", data: { updateVariable: { id: "op1", operations: [{ variableId: "color", op: "set", value: "red" }] } } });
  expect(processCommand({ state, command }).valid).toBe(true);
});
