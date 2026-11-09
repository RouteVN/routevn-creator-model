import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { expect, test } from "vitest";
import {
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";

const state = () =>
  load(
    readFileSync(
      new URL(
        "./compat/schema-19/states/omitted-optionals-project.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  ).state;
const command = (data) => ({
  type: "layout.element.create",
  payload: {
    layoutId: "layout-main",
    elementId: "new-video",
    data: { type: "video", name: "Video", videoId: "video-main", ...data },
  },
});

test("video elements create and update with valid references and boundaries", () => {
  const created = processCommand({
    state: state(),
    command: command({ loop: true, volume: 0 }),
  });
  expect(created.valid).toBe(true);
  const updated = processCommand({
    state: created.state,
    command: {
      type: "layout.element.update",
      payload: {
        layoutId: "layout-main",
        elementId: "new-video",
        data: { loop: false, volume: 100 },
      },
    },
  });
  expect(updated.valid).toBe(true);
  expect(
    updated.state.layouts.items["layout-main"].elements.items["new-video"],
  ).toMatchObject({ videoId: "video-main", loop: false, volume: 100 });
  expect(validateState({ state: updated.state }).valid).toBe(true);
  expect(
    validatePayload({
      type: "layout.element.update",
      payload: {
        layoutId: "layout-main",
        elementId: "new-video",
        data: { type: "video" },
      },
    }).valid,
  ).toBe(true);
});

test.each([
  [{ videoId: undefined }, "videoId must be a non-empty string"],
  [{ videoId: "" }, "videoId must be a non-empty string"],
  [{ videoId: 7 }, "videoId must be a string when provided"],
  [{ loop: "true" }, "loop must be a boolean when provided"],
  [{ volume: -1 }, "volume must be a finite number between 0 and 100"],
  [{ volume: 101 }, "volume must be a finite number between 0 and 100"],
  [{ volume: "50" }, "volume must be a finite number between 0 and 100"],
  [{ volume: Infinity }, "volume must be a finite number between 0 and 100"],
])("rejects invalid video element data %j", (data, message) => {
  const result = validatePayload(command(data));
  expect(result.valid).toBe(false);
  expect(result.error.message).toContain(message);
});

test("missing and folder videos fail preconditions and state invariants; referenced videos cannot be deleted", () => {
  const current = state();
  current.videos.items.folder = {
    id: "folder",
    type: "folder",
    name: "Folder",
  };
  current.videos.tree.push({ id: "folder", children: [] });
  for (const videoId of ["missing", "folder"]) {
    const result = validateAgainstState({
      state: current,
      command: command({ videoId }),
    });
    expect(result.valid).toBe(false);
    expect(result.error.message).toContain(
      "videoId must reference an existing non-folder video",
    );
    const invalid = structuredClone(current);
    invalid.layouts.items["layout-main"].elements.items[
      "video-element"
    ].videoId = videoId;
    expect(validateState({ state: invalid }).valid).toBe(false);
  }
  const deleted = processCommand({
    state: current,
    command: { type: "video.delete", payload: { videoIds: ["video-main"] } },
  });
  expect(deleted.valid).toBe(false);
  expect(deleted.error.message).toContain(
    "videoId must reference an existing non-folder video",
  );
});
