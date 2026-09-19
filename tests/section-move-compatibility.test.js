import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  processCommand,
  replayCommands,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";

const root = new URL(
  "./compat/section-move-legacy-preserved/",
  import.meta.url,
);
const read = (name) => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const manifest = read("manifest.json");
const initialState = read("initial-state.json");
const commands = read("commands.json");
const expectedState = read("expected-state.json");

describe("legacy section move compatibility", () => {
  it("retains the captured model-14 snapshots and provenance", () => {
    expect(manifest.observedModel.packageVersion).toBe("1.14.0");
    expect(manifest.observedModel.schemaVersion).toBe(14);
    for (const [name, expected] of Object.entries(manifest.files)) {
      const bytes = readFileSync(new URL(name, root));
      expect(bytes.length).toBe(expected.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        expected.sha256,
      );
    }
    const source = manifest.source.files;
    expect(manifest.files["initial-state.json"]).toEqual(
      source[
        "docs/validation-preparation/fixtures/seeds/project-one.state.json"
      ],
    );
    expect(manifest.files["expected-state.json"]).toEqual(
      source[
        "docs/validation-preparation/fixtures/observed/section-move-legacy-preserved.state.json"
      ],
    );
  });

  it("moves a section across scenes without recreating its legacy lines", () => {
    const initialBytes = JSON.stringify(initialState);
    const commandBytes = JSON.stringify(commands);
    let state = structuredClone(initialState);
    let sectionBeforeMove;
    for (const command of commands) {
      if (command.type === "section.move")
        sectionBeforeMove = structuredClone(
          state.scenes.items["scene-one"].sections.items["section-one"],
        );
      expect(validatePayload(command)).toEqual({ valid: true });
      expect(validateAgainstState({ state, command })).toEqual({ valid: true });
      const stateBeforeCommand = JSON.stringify(state);
      const result = processCommand({ state, command });
      expect(result.valid, JSON.stringify(result.error)).toBe(true);
      expect(JSON.stringify(state)).toBe(stateBeforeCommand);
      state = result.state;
    }
    expect(validateState({ state })).toEqual({ valid: true });
    expect(JSON.stringify(state)).toBe(JSON.stringify(expectedState));
    expect(
      state.scenes.items["scene-one"].sections.items["section-one"],
    ).toBeUndefined();
    const moved = state.scenes.items["scene-two"].sections.items["section-one"];
    expect(JSON.stringify(moved)).toBe(JSON.stringify(sectionBeforeMove));
    expect(moved.lines.tree.map(({ id }) => id)).toEqual([
      "line-one",
      "line-two",
    ]);
    expect(
      moved.lines.items["line-one"].actions.unrecognizedLegacyAction,
    ).toEqual({ oldValue: true });
    expect(
      moved.lines.items["line-one"].actions.dialogue.unusedLegacyField,
    ).toBe(true);
    expect(JSON.stringify(initialState)).toBe(initialBytes);
    expect(JSON.stringify(commands)).toBe(commandBytes);
  });

  it("replays the same complete state without mutating the seed or commands", () => {
    const input = {
      state: structuredClone(initialState),
      commands: structuredClone(commands),
    };
    const before = JSON.stringify(input);
    const result = replayCommands(input);
    expect(result.valid, JSON.stringify(result.error)).toBe(true);
    expect(JSON.stringify(result.state)).toBe(JSON.stringify(expectedState));
    expect(JSON.stringify(input)).toBe(before);
  });
});
