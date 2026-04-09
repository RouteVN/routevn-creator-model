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

const upgradeSchema1StateFixture = (fixture) => {
  return {
    state: structuredClone(fixture.rawFixture.state),
  };
};

const upgradeSchema1StreamFixture = (fixture) => {
  return {
    initialState: structuredClone(fixture.rawFixture.initialState),
    commands: structuredClone(fixture.rawFixture.commands ?? []),
    expectedFinalState:
      fixture.rawFixture.expectedFinalState === undefined
        ? undefined
        : structuredClone(fixture.rawFixture.expectedFinalState),
  };
};

const upgradeSchema1PayloadFixture = (fixture) => {
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
    case 2:
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
