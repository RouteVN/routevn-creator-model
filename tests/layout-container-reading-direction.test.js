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
        "./compat/schema-22/states/omitted-optionals-project.yaml",
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

test("a container takes a reading direction and can change it", () => {
  const created = processCommand({
    state: state(),
    command: createElement({
      type: "container",
      direction: "horizontal",
      readingDirection: "rtl",
    }),
  });
  expect(created.valid).toBe(true);

  const updated = processCommand({
    state: created.state,
    command: updateElement("new-element", { readingDirection: "ltr" }),
  });
  expect(updated.valid).toBe(true);
  expect(
    updated.state.layouts.items["layout-main"].elements.items["new-element"],
  ).toMatchObject({ direction: "horizontal", readingDirection: "ltr" });
  expect(validateState({ state: updated.state }).valid).toBe(true);
});

test.each([
  ["container", "vertical"],
  ["container", "absolute"],
  ["container-ref-choice-item", "horizontal"],
  ["container-ref-dialogue-line", "vertical"],
  ["container-ref-history-line", "horizontal"],
])("%s elements with direction %s accept rtl", (type, direction) => {
  expect(
    processCommand({
      state: state(),
      command: createElement({ type, direction, readingDirection: "rtl" }),
    }).valid,
  ).toBe(true);
});

test("control containers take a reading direction", () => {
  const result = processCommand({
    state: state(),
    command: createElement(
      { type: "container", direction: "vertical", readingDirection: "rtl" },
      { family: "control" },
    ),
  });
  expect(result.valid).toBe(true);
});

test.each([
  [
    { type: "container", readingDirection: "right" },
    "readingDirection must be one of ltr, rtl",
  ],
  [
    { type: "container", readingDirection: true },
    "readingDirection must be one of ltr, rtl",
  ],
  [
    { type: "text", readingDirection: "rtl" },
    "readingDirection can only be provided for container elements",
  ],
  [
    { type: "folder", readingDirection: "rtl" },
    "readingDirection can only be provided for container elements",
  ],
  [
    { type: "slider", direction: "horizontal", readingDirection: "rtl" },
    "readingDirection can only be provided for container elements",
  ],
])("rejects %j", (data, message) => {
  const result = validatePayload(createElement(data));
  expect(result.valid).toBe(false);
  expect(result.error.message).toContain(message);
});

test("an update cannot give a non-container element a reading direction", () => {
  // The update does not name the element type, so the payload alone is valid
  // and the stored element is checked.
  const command = updateElement("video-element", { readingDirection: "rtl" });
  expect(validatePayload(command).valid).toBe(true);

  const result = processCommand({ state: state(), command });
  expect(result.valid).toBe(false);
  expect(result.error.kind).toBe("precondition");
  expect(result.error.message).toContain(
    "layout element readingDirection can only be provided for container elements",
  );
});

test("state with a reading direction on a non-container element is invalid", () => {
  const invalid = state();
  invalid.layouts.items["layout-main"].elements.items[
    "video-element"
  ].readingDirection = "rtl";
  expect(validateState({ state: invalid }).valid).toBe(false);
});
