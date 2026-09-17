import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  processCommand,
  replayCommands,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
const directory = fileURLToPath(
  new URL("./compat/client-projects/", import.meta.url),
);
for (const name of readdirSync(directory).filter((name) =>
  name.endsWith(".json"),
)) {
  const bytes = readFileSync(join(directory, name));
  const fixture = JSON.parse(bytes);
  describe(`frozen old-client domain ${fixture.id}`, () => {
    it("retains the captured source bytes and provenance", () => {
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        readFileSync(join(directory, `${name}.sha256`), "utf8").trim(),
      );
      expect(fixture.provenance.modelVersion).toBe("1.15.0");
      expect(fixture.provenance.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    });
    it("preserves exact state through unversioned legacy entry points and batch replay", () => {
      const initialBytes = JSON.stringify(fixture.initialState);
      const commandBytes = JSON.stringify(fixture.commands);
      let state = fixture.initialState;
      for (const command of fixture.commands) {
        expect(validateState({ state }).valid).toBe(true);
        expect(validatePayload(command).valid).toBe(true);
        expect(validateAgainstState({ state, command }).valid).toBe(true);
        const result = processCommand({ state, command });
        expect(result.valid, JSON.stringify(result.error)).toBe(true);
        state = result.state;
      }
      expect(JSON.stringify(state)).toBe(JSON.stringify(fixture.expectedState));
      const batch = replayCommands({
        state: fixture.initialState,
        commands: fixture.commands,
      });
      expect(batch.valid, JSON.stringify(batch.error)).toBe(true);
      expect(JSON.stringify(batch.state)).toBe(
        JSON.stringify(fixture.expectedState),
      );
      expect(JSON.stringify(fixture.initialState)).toBe(initialBytes);
      expect(JSON.stringify(fixture.commands)).toBe(commandBytes);
    });
  });
}
