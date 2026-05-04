import { expect, test } from "vitest";
import {
  SCHEMA_VERSION,
  processCommand,
  validatePayload,
  validateState,
} from "../src/index.js";
import { listCommandTypes } from "../src/model.js";
import {
  getCurrentSchemaPayloadCoverage,
  listCompatibilitySchemaVersions,
  loadCompatibilityPayloadFixtures,
  loadCompatibilityStateFixtures,
  loadCompatibilityStreamFixtures,
} from "./support/compatFixtures.js";

const payloadFixtures = await loadCompatibilityPayloadFixtures();
const stateFixtures = await loadCompatibilityStateFixtures();
const streamFixtures = await loadCompatibilityStreamFixtures();
const currentSchemaPayloadCoverage = await getCurrentSchemaPayloadCoverage();
const archivedSchemaVersions = await listCompatibilitySchemaVersions();

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
  expect(
    stateFixtures.some((fixture) => fixture.schemaVersion === SCHEMA_VERSION),
  ).toBe(true);
});

test("compatibility payload fixtures exist for the current schema line", () => {
  expect(
    payloadFixtures.some((fixture) => fixture.schemaVersion === SCHEMA_VERSION),
  ).toBe(true);
});

test("compatibility schema archives stay contiguous", () => {
  expect(archivedSchemaVersions).toEqual(
    Array.from({ length: SCHEMA_VERSION }, (_, index) => index + 1),
  );
});

test("archived variable fixtures upgrade legacy schema variable types", () => {
  const fixture = payloadFixtures.find(
    (candidate) =>
      candidate.schemaVersion === 3 &&
      candidate.type === "variable.create" &&
      candidate.fixtureName === "minimal",
  );

  expect(fixture).toBeDefined();
  expect(fixture.rawFixture.payload.data.type).toBe("number");
  expect(fixture.payload.data).toMatchObject({
    type: "variable",
    variableType: "number",
  });
});

test("current variable fixtures use the schema 4 variable discriminator", () => {
  const fixture = payloadFixtures.find(
    (candidate) =>
      candidate.schemaVersion === SCHEMA_VERSION &&
      candidate.type === "variable.create" &&
      candidate.fixtureName === "minimal",
  );

  expect(fixture).toBeDefined();
  expect(fixture.rawFixture.payload.data).toMatchObject({
    type: "variable",
    variableType: "number",
  });
});

test("current schema payload fixture coverage stays aligned with command types", () => {
  const commandTypes = listCommandTypes().slice().sort();
  const coveredCommandTypes = Array.from(
    currentSchemaPayloadCoverage.keys(),
  ).sort();

  expect(coveredCommandTypes).toEqual(commandTypes);

  for (const commandType of commandTypes) {
    const coverage = currentSchemaPayloadCoverage.get(commandType) ?? new Set();
    expect(
      coverage.has("minimal"),
      `${commandType} is missing payload fixture minimal.yaml`,
    ).toBe(true);
    expect(
      coverage.has("full"),
      `${commandType} is missing payload fixture full.yaml`,
    ).toBe(true);
  }
});

for (const fixture of payloadFixtures) {
  test(`compat payload: schema-${fixture.schemaVersion}/${fixture.type}/${fixture.fixtureName}`, () => {
    expect(
      validatePayload({
        type: fixture.type,
        payload: fixture.payload,
      }),
    ).toEqual({
      valid: true,
    });
  });
}

for (const fixture of stateFixtures) {
  test(`compat state: schema-${fixture.schemaVersion}/${fixture.fixtureName}`, () => {
    expect(validateState({ state: fixture.state })).toEqual({
      valid: true,
    });
  });
}

test("compatibility stream fixtures exist for the current schema line", () => {
  expect(
    streamFixtures.some((fixture) => fixture.schemaVersion === SCHEMA_VERSION),
  ).toBe(true);
});

for (const fixture of streamFixtures) {
  test(`compat stream: schema-${fixture.schemaVersion}/${fixture.fixtureName}`, () => {
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
