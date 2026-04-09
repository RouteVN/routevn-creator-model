import { expect, test } from "vitest";
import {
  SCHEMA_VERSION,
  processCommand,
  validatePayload,
  validateState,
} from "../src/index.js";
import {
  loadCompatibilityStateFixtures,
  loadCompatibilityStreamFixtures,
} from "./support/compatFixtures.js";

const stateFixtures = await loadCompatibilityStateFixtures();
const streamFixtures = await loadCompatibilityStreamFixtures();

const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const expectCompatibilitySubset = (actual, expected, path = "state") => {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path} must stay an array`).toBe(true);
    expect(actual.length, `${path} length changed`).toBe(expected.length);

    expected.forEach((expectedItem, index) => {
      expectCompatibilitySubset(
        actual[index],
        expectedItem,
        `${path}[${index}]`,
      );
    });

    return;
  }

  if (isPlainObject(expected)) {
    expect(isPlainObject(actual), `${path} must stay an object`).toBe(true);

    for (const [key, expectedValue] of Object.entries(expected)) {
      expect(key in actual, `${path}.${key} disappeared`).toBe(true);
      expectCompatibilitySubset(actual[key], expectedValue, `${path}.${key}`);
    }

    return;
  }

  expect(actual, `${path} changed`).toEqual(expected);
};

test("compatibility state fixtures exist for the current schema line", () => {
  expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  expect(stateFixtures.length).toBeGreaterThan(0);
});

for (const fixture of stateFixtures) {
  test(`compat state: ${fixture.fixtureName}`, () => {
    expect(validateState({ state: fixture.state })).toEqual({
      valid: true,
    });
  });
}

test("compatibility stream fixtures exist for the current schema line", () => {
  expect(streamFixtures.length).toBeGreaterThan(0);
});

for (const fixture of streamFixtures) {
  test(`compat stream: ${fixture.fixtureName}`, () => {
    expect(validateState({ state: fixture.initialState })).toEqual({
      valid: true,
    });

    let currentState = structuredClone(fixture.initialState);

    for (const command of fixture.commands) {
      expect(
        validatePayload({
          type: command.type,
          payload: command.payload,
        }),
      ).toEqual({
        valid: true,
      });

      const result = processCommand({
        state: currentState,
        command,
      });

      expect(result.valid).toBe(true);
      expect(validateState({ state: result.state })).toEqual({
        valid: true,
      });

      currentState = structuredClone(result.state);
    }

    if (fixture.expectedFinalState !== undefined) {
      expectCompatibilitySubset(currentState, fixture.expectedFinalState);
    }
  });
}
