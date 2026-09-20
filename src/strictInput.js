import { createPayloadValidationError } from "./errors.js";

// These limits are part of schema 16. Historical unversioned input does not
// pass through this scanner. Count input before cloning or serializing it.
export const STRICT_SCHEMA_VERSION = 16;
export const STRICT_LIMITS = Object.freeze({
  payloadBytes: 8_388_544,
  projectBytes: 67_108_800,
  stringBytes: 1_048_576,
  keyBytes: 1_024,
  depth: 127,
  entries: 65_536,
  work: 2_000_000,
  projectWork: 16_000_000,
});
const encoder = new TextEncoder();
export const strictFailure = (path, message) => {
  throw createPayloadValidationError(`${path} ${message}`, { path });
};

export function modelContract(input) {
  if (!Object.hasOwn(input, "modelSchemaVersion")) return "legacy";
  const descriptor = Object.getOwnPropertyDescriptor(input, "modelSchemaVersion");
  const version = descriptor?.value;
  if (descriptor?.enumerable && Object.hasOwn(descriptor, "value") && version === STRICT_SCHEMA_VERSION) {
    for (const field of ["type", "payload", "state"]) {
      if (!Object.hasOwn(input, field)) continue;
      const property = Object.getOwnPropertyDescriptor(input, field);
      if (!property.enumerable || !Object.hasOwn(property, "value"))
        return { valid: false, error: { kind: "payload", code: "payload_validation_failed", message: `${field} must be an enumerable data property`, path: field } };
    }
    return "strict";
  }
  return {
    valid: false,
    error: {
      kind: "payload",
      code: "unsupported_model_schema_version",
      message: "Unsupported model schema version",
      path: "modelSchemaVersion",
      details: {
        received: version,
        supported: [STRICT_SCHEMA_VERSION],
      },
    },
  };
}

export function scanStrictJson(
  value,
  { project = false, path = "payload", maxBytes, maxDepth = STRICT_LIMITS.depth } = {},
) {
  const byteLimit = Math.min(maxBytes ?? Infinity, project ? STRICT_LIMITS.projectBytes : STRICT_LIMITS.payloadBytes);
  const workLimit = project ? STRICT_LIMITS.projectWork : STRICT_LIMITS.work;
  const pending = [{ value, path, depth: 1 }];
  const ancestors = new Set();
  let bytes = 0;
  let work = 0;
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop();
    if (entry.leave) {
      ancestors.delete(entry.value);
      continue;
    }
    const item = entry.value;
    nodes++;
    if (++work > workLimit)
      strictFailure(entry.path, "exceeds the validation work limit");
    if (item === null || typeof item === "boolean") {
      bytes += item === null || item === true ? 4 : 5;
    } else if (typeof item === "number") {
      if (!Number.isFinite(item))
        strictFailure(entry.path, "must be a finite JSON number");
      bytes += String(item).length;
    } else if (typeof item === "string") {
      if (encoder.encode(item).length > STRICT_LIMITS.stringBytes)
        strictFailure(entry.path, "exceeds the string byte limit");
      bytes += encoder.encode(JSON.stringify(item)).length;
    } else if (typeof item === "object") {
      const array = Array.isArray(item);
      if (
        array
          ? Object.getPrototypeOf(item) !== Array.prototype
          : ![Object.prototype, null].includes(Object.getPrototypeOf(item))
      )
        strictFailure(entry.path, "must be a plain JSON object");
      if (entry.depth > maxDepth)
        strictFailure(entry.path, "exceeds the JSON depth limit");
      if (ancestors.has(item))
        strictFailure(entry.path, "must not contain a cycle");
      const keys = Reflect.ownKeys(item).filter(
        (key) => !(array && key === "length"),
      );
      if (
        keys.length > STRICT_LIMITS.entries ||
        (array && item.length > STRICT_LIMITS.entries)
      )
        strictFailure(entry.path, "exceeds the container entry limit");
      if (array && keys.length !== item.length)
        strictFailure(
          entry.path,
          "must not contain array holes or extra properties",
        );
      ancestors.add(item);
      pending.push({ value: item, leave: true });
      bytes += 2 + Math.max(0, keys.length - 1);
      for (let index = keys.length - 1; index >= 0; index--) {
        const key = keys[index];
        if (typeof key !== "string")
          strictFailure(entry.path, "must not contain symbol keys");
        if (array && key !== String(index))
          strictFailure(entry.path, "must contain only indexed array entries");
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
          strictFailure(
            `${entry.path}.${key}`,
            "must be an enumerable data property",
          );
        if (encoder.encode(key).length > STRICT_LIMITS.keyBytes)
          strictFailure(`${entry.path}.${key}`, "exceeds the key byte limit");
        if (!array) {
          bytes += encoder.encode(JSON.stringify(key)).length + 1;
          if (++work > workLimit)
            strictFailure(entry.path, "exceeds the validation work limit");
        }
        pending.push({
          value: descriptor.value,
          path: `${entry.path}.${key}`,
          depth: entry.depth + 1,
        });
      }
    } else {
      strictFailure(entry.path, "must be JSON data");
    }
    if (bytes > byteLimit)
      strictFailure(entry.path, "exceeds the payload byte limit");
  }
  return { bytes, work, nodes };
}
