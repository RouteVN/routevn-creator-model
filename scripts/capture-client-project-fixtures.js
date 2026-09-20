// One-time adoption from immutable old-client packs. Runtime tests only read JSON.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const [clientRoot, previousModelRoot] = process.argv.slice(2);
if (!clientRoot || !previousModelRoot)
  throw new Error(
    "Usage: node scripts/capture-client-project-fixtures.js <client checkout> <pinned previous model package>",
  );
const previousPackage = JSON.parse(
  readFileSync(join(previousModelRoot, "package.json")),
);
if (previousPackage.version !== "1.15.0")
  throw new Error("Capture requires the released previous model 1.15.0");
const previous = await import(
  pathToFileURL(resolve(previousModelRoot, "src/index.js"))
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const id of ["P01-draft", "P02-media-draft", "P03-draft", "P09-draft"]) {
  const target = `tests/compat/client-projects/${id}.json`;
  if (existsSync(target))
    throw new Error(`Refusing to overwrite frozen fixture ${target}`);
  const sourcePath = `tests/fixtures/legacy-projects/${id}/source/project.db`;
  const db = new DatabaseSync(join(clientRoot, sourcePath), { readOnly: true });
  let records;
  try {
    records = db
      .prepare("SELECT type, payload FROM local_drafts ORDER BY draft_clock")
      .all()
      .map((row) => ({
        type: row.type,
        payload: JSON.parse(Buffer.from(row.payload).toString()),
      }));
  } finally {
    db.close();
  }
  const bootstrap = records.shift();
  if (bootstrap.type !== "project.create")
    throw new Error("Expected complete draft-only fixture");
  const initialState = bootstrap.payload.state;
  let state = structuredClone(initialState);
  for (const command of records) {
    const result = previous.processCommand({ state, command });
    if (!result.valid)
      throw new Error(`${id} ${command.type}: ${JSON.stringify(result.error)}`);
    state = result.state;
  }
  const manifest = JSON.parse(
    readFileSync(
      join(clientRoot, `tests/fixtures/legacy-projects/${id}/manifest.json`),
    ),
  );
  const fixture = {
    protocol: 1,
    id,
    provenance: {
      sourcePath,
      sourceSha256: hash(readFileSync(join(clientRoot, sourcePath))),
      writer: manifest.writer,
      previousReader: manifest.previousReader,
      modelVersion: previousPackage.version,
    },
    initialState,
    commands: records,
    expectedState: state,
  };
  const bytes = JSON.stringify(fixture, null, 2) + "\n";
  writeFileSync(target, bytes);
  writeFileSync(`${target}.sha256`, hash(bytes) + "\n");
  console.log(`Adopted ${id} from model ${previousPackage.version}`);
}
