import { readdir } from "node:fs/promises";
import { SCHEMA_VERSION } from "../../src/index.js";
import { readYamlFixture } from "./readYamlFixture.js";

const COMPAT_ROOT_URL = new URL("../compat/", import.meta.url);

const compareByPath = (left, right) =>
  left.pathname.localeCompare(right.pathname, "en");

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

const parseSchemaVersionFromDirectory = (fileUrl) => {
  const match = fileUrl.pathname.match(/\/schema-(\d+)\//);
  if (!match) {
    throw new Error(
      `compat fixture path must include schema-<n>: ${fileUrl.pathname}`,
    );
  }

  return Number.parseInt(match[1], 10);
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

const upgradeFixtureForCurrentSchema = (fixture) => {
  switch (fixture.schemaVersion) {
    case 1:
      return fixture.kind === "state"
        ? upgradeSchema1StateFixture(fixture)
        : upgradeSchema1StreamFixture(fixture);
    default:
      throw new Error(
        `no compatibility upgrade adapter for schemaVersion ${fixture.schemaVersion}: ${fixture.fileUrl.pathname}`,
      );
  }
};

export const loadCompatibilityStateFixtures = async () => {
  const files = await listYamlFiles(
    new URL("./schema-1/states/", COMPAT_ROOT_URL),
  );

  return Promise.all(
    files.map(async (fileUrl) => {
      const fixture = await toCompatibilityFixture(fileUrl, "state");
      return {
        ...fixture,
        ...upgradeFixtureForCurrentSchema(fixture),
      };
    }),
  );
};

export const loadCompatibilityStreamFixtures = async () => {
  const files = await listYamlFiles(
    new URL("./schema-1/streams/", COMPAT_ROOT_URL),
  );

  return Promise.all(
    files.map(async (fileUrl) => {
      const fixture = await toCompatibilityFixture(fileUrl, "stream");
      return {
        ...fixture,
        ...upgradeFixtureForCurrentSchema(fixture),
      };
    }),
  );
};
