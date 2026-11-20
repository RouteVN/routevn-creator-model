import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { expect, test } from "vitest";
import {
  processCommand,
  validatePayload,
  validateState,
} from "../src/index.js";

const state = () =>
  load(
    readFileSync(
      new URL(
        "./compat/schema-21/states/omitted-optionals-project.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  ).state;

const createElement = (data, { family = "layout" } = {}) => ({
  type: `${family}.element.create`,
  payload: {
    [`${family}Id`]: `${family}-main`,
    elementId: "new-element",
    data: { name: "Element", ...data },
  },
});

const updateElement = (elementId, data) => ({
  type: "layout.element.update",
  payload: { layoutId: "layout-main", elementId, data },
});

test("text elements take a writing mode and a reading direction", () => {
  const created = processCommand({
    state: state(),
    command: createElement({
      type: "text",
      text: "Vertical",
      writingMode: "vertical-rl",
      height: 480,
    }),
  });
  expect(created.valid).toBe(true);

  const updated = processCommand({
    state: created.state,
    command: updateElement("new-element", {
      writingMode: "horizontal-tb",
      direction: "rtl",
    }),
  });
  expect(updated.valid).toBe(true);
  expect(
    updated.state.layouts.items["layout-main"].elements.items["new-element"],
  ).toMatchObject({ writingMode: "horizontal-tb", direction: "rtl" });
  expect(validateState({ state: updated.state }).valid).toBe(true);
});

test.each([
  ["text-revealing-ref-dialogue-content", { writingMode: "vertical-lr" }],
  ["text-revealing", { direction: "ltr" }],
  ["text-ref-character-name", { direction: "rtl" }],
])("%s elements accept %j", (type, data) => {
  expect(
    processCommand({
      state: state(),
      command: createElement({ type, ...data }),
    }).valid,
  ).toBe(true);
});

test("control text elements take a writing mode and a reading direction", () => {
  const result = processCommand({
    state: state(),
    command: createElement(
      { type: "text", writingMode: "vertical-rl", direction: "rtl" },
      { family: "control" },
    ),
  });
  expect(result.valid).toBe(true);
});

test("containers and sliders keep their layout directions", () => {
  for (const [type, direction] of [
    ["container", "horizontal"],
    ["slider", "vertical"],
  ]) {
    expect(
      processCommand({
        state: state(),
        command: createElement({ type, direction }),
      }).valid,
    ).toBe(true);
  }
});

test.each([
  [{ type: "text", writingMode: "sideways" }, "writingMode must be one of"],
  [{ type: "text", writingMode: 1 }, "writingMode must be one of"],
  [{ type: "text", direction: "up" }, "direction must be 'absolute'"],
  [
    { type: "rect", writingMode: "vertical-rl" },
    "writingMode can only be provided for text elements",
  ],
  [
    { type: "input", field: "name", writingMode: "vertical-rl" },
    "writingMode can only be provided for text elements",
  ],
  [
    { type: "container", direction: "rtl" },
    "direction can be 'ltr' or 'rtl' only for text elements",
  ],
  [
    { type: "slider", direction: "ltr" },
    "direction can be 'ltr' or 'rtl' only for text elements",
  ],
])("rejects %j", (data, message) => {
  const result = validatePayload(createElement(data));
  expect(result.valid).toBe(false);
  expect(result.error.message).toContain(message);
});

test("an update cannot give a non-text element a writing mode or reading direction", () => {
  for (const [data, message] of [
    [
      { writingMode: "vertical-rl" },
      "layout element writingMode can only be provided for text elements",
    ],
    [
      { direction: "rtl" },
      "layout element direction can be 'ltr' or 'rtl' only for text elements",
    ],
  ]) {
    // The update does not name the element type, so the payload alone is
    // valid and the stored element is checked.
    const command = updateElement("video-element", data);
    expect(validatePayload(command).valid).toBe(true);

    const result = processCommand({ state: state(), command });
    expect(result.valid).toBe(false);
    expect(result.error.kind).toBe("precondition");
    expect(result.error.message).toContain(message);
  }
});

test("state with a writing mode or reading direction on a non-text element is invalid", () => {
  for (const [field, value] of [
    ["writingMode", "vertical-rl"],
    ["direction", "rtl"],
  ]) {
    const invalid = state();
    invalid.layouts.items["layout-main"].elements.items["video-element"][
      field
    ] = value;
    expect(validateState({ state: invalid }).valid).toBe(false);
  }
});
