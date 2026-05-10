import { readdir } from "node:fs/promises";
import { SCHEMA_VERSION } from "../../src/index.js";
import { readYamlFixture } from "./readYamlFixture.js";

const COMPAT_ROOT_URL = new URL("../compat/", import.meta.url);

const compareByPath = (left, right) =>
  left.pathname.localeCompare(right.pathname, "en");

const toSchemaDirectoryName = (schemaVersion) => `schema-${schemaVersion}`;

const listYamlFiles = async (directoryUrl) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}`, directoryUrl);
    if (entry.isDirectory()) {
      files.push(
        ...(await listYamlFiles(new URL(`${entry.name}/`, directoryUrl))),
      );
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".yaml")) {
      files.push(entryUrl);
    }
  }

  return files.sort(compareByPath);
};

const ensurePlainObject = (value, message) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
};

const ensureArray = (value, message) => {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
};

const parseSchemaVersionFromDirectory = (fileUrl) => {
  const match = fileUrl.pathname.match(/\/schema-(\d+)\//);
  if (!match) {
    throw new Error(
      `compat fixture path must include schema-<n>: ${fileUrl.pathname}`,
    );
  }

  return Number.parseInt(match[1], 10);
};

const parseFixtureCommandType = (fileUrl) => {
  const match = fileUrl.pathname.match(/\/payloads\/([^/]+)\//);
  return match?.[1];
};

const toCompatibilityFixture = async (fileUrl, kind) => {
  const rawFixture = ensurePlainObject(
    await readYamlFixture(fileUrl),
    `compat fixture must be an object: ${fileUrl.pathname}`,
  );
  const schemaVersion = Number.parseInt(
    String(rawFixture.schemaVersion ?? ""),
    10,
  );
  const pathSchemaVersion = parseSchemaVersionFromDirectory(fileUrl);

  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    throw new Error(
      `compat fixture schemaVersion must be a positive integer: ${fileUrl.pathname}`,
    );
  }

  if (schemaVersion !== pathSchemaVersion) {
    throw new Error(
      `compat fixture schemaVersion ${schemaVersion} must match directory schema-${pathSchemaVersion}: ${fileUrl.pathname}`,
    );
  }

  if (schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `compat fixture schemaVersion ${schemaVersion} is newer than current SCHEMA_VERSION ${SCHEMA_VERSION}: ${fileUrl.pathname}`,
    );
  }

  return {
    fileUrl,
    fixtureName:
      fileUrl.pathname
        .split("/")
        .at(-1)
        ?.replace(/\.yaml$/, "") ?? "unknown",
    kind,
    schemaVersion,
    rawFixture,
  };
};

const LEGACY_VARIABLE_TYPE_KEYS = ["string", "number", "boolean"];

const upgradeVariableItemToSchema4 = (item) => {
  const nextItem = structuredClone(item);

  if (LEGACY_VARIABLE_TYPE_KEYS.includes(nextItem?.type)) {
    nextItem.variableType = nextItem.type;
    nextItem.type = "variable";
  }

  return nextItem;
};

const upgradeVariablesCollectionToSchema4 = (variables) => {
  const nextVariables = structuredClone(
    ensurePlainObject(variables, "state.variables must be an object"),
  );
  const items = ensurePlainObject(
    nextVariables.items,
    "state.variables.items must be an object",
  );

  for (const [variableId, item] of Object.entries(items)) {
    items[variableId] = upgradeVariableItemToSchema4(item);
  }

  return nextVariables;
};

const upgradeStateToSchema4 = (state) => {
  const nextState = structuredClone(state);

  if (nextState.variables !== undefined) {
    nextState.variables = upgradeVariablesCollectionToSchema4(
      nextState.variables,
    );
  }

  return nextState;
};

const upgradePayloadToSchema4 = ({ type, payload }) => {
  const nextPayload = structuredClone(payload);

  if (type === "project.create" && nextPayload.state !== undefined) {
    nextPayload.state = upgradeStateToSchema4(nextPayload.state);
  }

  if (type === "variable.create" && nextPayload.data !== undefined) {
    nextPayload.data = upgradeVariableItemToSchema4(nextPayload.data);
  }

  return nextPayload;
};

const upgradeCommandToSchema4 = (command) => {
  const nextCommand = structuredClone(command);
  nextCommand.payload = upgradePayloadToSchema4({
    type: nextCommand.type,
    payload: nextCommand.payload,
  });
  return nextCommand;
};

const upgradeStreamFixtureToSchema4 = (fixture) => {
  return {
    initialState: upgradeStateToSchema4(fixture.rawFixture.initialState),
    commands: structuredClone(fixture.rawFixture.commands ?? []).map(
      (command) => upgradeCommandToSchema4(command),
    ),
    expectedFinalState:
      fixture.rawFixture.expectedFinalState === undefined
        ? undefined
        : upgradeStateToSchema4(fixture.rawFixture.expectedFinalState),
  };
};

const upgradePayloadFixtureToSchema4 = (fixture) => {
  if (typeof fixture.rawFixture.type !== "string" || !fixture.rawFixture.type) {
    throw new Error(
      `compat payload fixture type must be a non-empty string: ${fixture.fileUrl.pathname}`,
    );
  }

  const pathCommandType = parseFixtureCommandType(fixture.fileUrl);
  if (!pathCommandType) {
    throw new Error(
      `compat payload fixture path must include payload command type directory: ${fixture.fileUrl.pathname}`,
    );
  }

  if (fixture.rawFixture.type !== pathCommandType) {
    throw new Error(
      `compat payload fixture type ${fixture.rawFixture.type} must match directory ${pathCommandType}: ${fixture.fileUrl.pathname}`,
    );
  }

  return {
    type: fixture.rawFixture.type,
    payload: upgradePayloadToSchema4({
      type: fixture.rawFixture.type,
      payload: fixture.rawFixture.payload,
    }),
  };
};

const upgradeSchema1StateFixture = (fixture) => {
  return {
    state: upgradeStateToSchema4(fixture.rawFixture.state),
  };
};

const upgradeSchema1StreamFixture = (fixture) => {
  return upgradeStreamFixtureToSchema4(fixture);
};

const upgradeSchema1PayloadFixture = (fixture) => {
  return upgradePayloadFixtureToSchema4(fixture);
};

const upgradeSchema2StateFixture = (fixture) => {
  return {
    state: upgradeStateToSchema4(fixture.rawFixture.state),
  };
};

const upgradeSchema2StreamFixture = (fixture) => {
  return upgradeStreamFixtureToSchema4(fixture);
};

const upgradeSchema2PayloadFixture = (fixture) => {
  return upgradePayloadFixtureToSchema4(fixture);
};

const upgradeSchema3StateFixture = (fixture) => {
  return {
    state: upgradeStateToSchema4(fixture.rawFixture.state),
  };
};

const upgradeSchema3StreamFixture = (fixture) => {
  return upgradeStreamFixtureToSchema4(fixture);
};

const upgradeSchema3PayloadFixture = (fixture) => {
  return upgradePayloadFixtureToSchema4(fixture);
};

const upgradeSchema4StateFixture = (fixture) => {
  return {
    state: structuredClone(fixture.rawFixture.state),
  };
};

const upgradeSchema4StreamFixture = (fixture) => {
  return {
    initialState: structuredClone(fixture.rawFixture.initialState),
    commands: structuredClone(fixture.rawFixture.commands ?? []),
    expectedFinalState:
      fixture.rawFixture.expectedFinalState === undefined
        ? undefined
        : structuredClone(fixture.rawFixture.expectedFinalState),
  };
};

const upgradeSchema4PayloadFixture = (fixture) => {
  if (typeof fixture.rawFixture.type !== "string" || !fixture.rawFixture.type) {
    throw new Error(
      `compat payload fixture type must be a non-empty string: ${fixture.fileUrl.pathname}`,
    );
  }

  const pathCommandType = parseFixtureCommandType(fixture.fileUrl);
  if (!pathCommandType) {
    throw new Error(
      `compat payload fixture path must include payload command type directory: ${fixture.fileUrl.pathname}`,
    );
  }

  if (fixture.rawFixture.type !== pathCommandType) {
    throw new Error(
      `compat payload fixture type ${fixture.rawFixture.type} must match directory ${pathCommandType}: ${fixture.fileUrl.pathname}`,
    );
  }

  return {
    type: fixture.rawFixture.type,
    payload: structuredClone(fixture.rawFixture.payload),
  };
};

const upgradeFixtureForCurrentSchema = (fixture) => {
  switch (fixture.schemaVersion) {
    case 1:
      if (fixture.kind === "state") {
        return upgradeSchema1StateFixture(fixture);
      }

      if (fixture.kind === "stream") {
        return upgradeSchema1StreamFixture(fixture);
      }

      if (fixture.kind === "payload") {
        return upgradeSchema1PayloadFixture(fixture);
      }

      throw new Error(
        `unsupported compatibility fixture kind: ${fixture.kind}`,
      );
    case 2:
      if (fixture.kind === "state") {
        return upgradeSchema2StateFixture(fixture);
      }

      if (fixture.kind === "stream") {
        return upgradeSchema2StreamFixture(fixture);
      }

      if (fixture.kind === "payload") {
        return upgradeSchema2PayloadFixture(fixture);
      }

      throw new Error(
        `unsupported compatibility fixture kind: ${fixture.kind}`,
      );
    case 3:
      if (fixture.kind === "state") {
        return upgradeSchema3StateFixture(fixture);
      }

      if (fixture.kind === "stream") {
        return upgradeSchema3StreamFixture(fixture);
      }

      if (fixture.kind === "payload") {
        return upgradeSchema3PayloadFixture(fixture);
      }

      throw new Error(
        `unsupported compatibility fixture kind: ${fixture.kind}`,
      );
    case 4:
      if (fixture.kind === "state") {
        return upgradeSchema4StateFixture(fixture);
      }

      if (fixture.kind === "stream") {
        return upgradeSchema4StreamFixture(fixture);
      }

      if (fixture.kind === "payload") {
        return upgradeSchema4PayloadFixture(fixture);
      }

      throw new Error(
        `unsupported compatibility fixture kind: ${fixture.kind}`,
      );
    case 5:
      if (fixture.kind === "state") {
        return upgradeSchema4StateFixture(fixture);
      }

      if (fixture.kind === "stream") {
        return upgradeSchema4StreamFixture(fixture);
      }

      if (fixture.kind === "payload") {
        return upgradeSchema4PayloadFixture(fixture);
      }

      throw new Error(
        `unsupported compatibility fixture kind: ${fixture.kind}`,
      );
    default:
      throw new Error(
        `no compatibility upgrade adapter for schemaVersion ${fixture.schemaVersion}: ${fixture.fileUrl.pathname}`,
      );
  }
};

const listSchemaVersions = async () => {
  const entries = await readdir(COMPAT_ROOT_URL, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = entry.name.match(/^schema-(\d+)$/);
      return match ? Number.parseInt(match[1], 10) : undefined;
    })
    .filter(
      (value) =>
        Number.isInteger(value) && value > 0 && value <= SCHEMA_VERSION,
    )
    .sort((left, right) => left - right);
};

export const listCompatibilitySchemaVersions = async () => listSchemaVersions();

const loadCompatibilityFixturesByKind = async (kind) => {
  const schemaVersions = await listSchemaVersions();
  const filesBySchema = await Promise.all(
    schemaVersions.map((schemaVersion) =>
      listYamlFiles(
        new URL(
          `./${toSchemaDirectoryName(schemaVersion)}/${kind}s/`,
          COMPAT_ROOT_URL,
        ),
      ),
    ),
  );
  const files = filesBySchema.flat();

  return Promise.all(
    files.map(async (fileUrl) => {
      const fixture = await toCompatibilityFixture(fileUrl, kind);
      return {
        ...fixture,
        ...upgradeFixtureForCurrentSchema(fixture),
      };
    }),
  );
};

export const loadCompatibilityStateFixtures = async () =>
  loadCompatibilityFixturesByKind("state");

export const loadCompatibilityStreamFixtures = async () => {
  return loadCompatibilityFixturesByKind("stream");
};

export const loadCompatibilityPayloadFixtures = async () => {
  return loadCompatibilityFixturesByKind("payload");
};

export const getCurrentSchemaPayloadCoverage = async () => {
  const currentSchemaFixtures = (
    await loadCompatibilityPayloadFixtures()
  ).filter((fixture) => fixture.schemaVersion === SCHEMA_VERSION);
  const coverage = new Map();

  for (const fixture of currentSchemaFixtures) {
    const fixtureSet = coverage.get(fixture.type) ?? new Set();
    fixtureSet.add(fixture.fixtureName);
    coverage.set(fixture.type, fixtureSet);
  }

  return coverage;
};
