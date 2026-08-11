import {
  processCommand as processCommandResult,
  validateAgainstState as validateAgainstStateResult,
  validatePayload as validatePayloadResult,
  validateState as validateStateResult,
} from "../../src/index.js";

const ERROR_NAME_BY_KIND = {
  payload: "PayloadValidationError",
  precondition: "PreconditionValidationError",
  state: "StateValidationError",
  invariant: "InvariantValidationError",
};
const OMITTABLE_EMPTY_COLLECTION_KEYS = [
  "controls",
  "audioEffects",
  "particles",
  "spritesheets",
  "voices",
];
const OMITTABLE_EMPTY_TAG_SCOPE_KEYS = [
  "images",
  "sounds",
  "videos",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "textStyles",
  "variables",
  "layouts",
  "controls",
  "animations",
  "audioEffects",
  "particles",
  "spritesheets",
];

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isEmptyCollectionState = (value) =>
  isPlainObject(value) &&
  Object.keys(value).length === 2 &&
  isPlainObject(value.items) &&
  Object.keys(value.items).length === 0 &&
  Array.isArray(value.tree) &&
  value.tree.length === 0;

const stripOmittableEmptyRoots = (state) => {
  const nextState = structuredClone(state);

  for (const key of OMITTABLE_EMPTY_COLLECTION_KEYS) {
    if (isEmptyCollectionState(nextState[key])) {
      delete nextState[key];
    }
  }

  if (isPlainObject(nextState.tags)) {
    const tagScopeKeys = Object.keys(nextState.tags);
    if (
      tagScopeKeys.length === OMITTABLE_EMPTY_TAG_SCOPE_KEYS.length &&
      OMITTABLE_EMPTY_TAG_SCOPE_KEYS.every((key) =>
        tagScopeKeys.includes(key),
      ) &&
      tagScopeKeys.every((key) => isEmptyCollectionState(nextState.tags[key]))
    ) {
      delete nextState.tags;
    }
  }

  return nextState;
};

const unwrapValidationResult = (result) => {
  if (result.valid) {
    return;
  }

  const error = new Error(result.error.message);
  error.name = ERROR_NAME_BY_KIND[result.error.kind] ?? "DomainValidationError";
  error.code = result.error.code;
  error.details = result.error.details ?? {};
  throw error;
};

export const validateState = (args) => {
  unwrapValidationResult(validateStateResult(args));
};

export const validatePayload = (args) => {
  unwrapValidationResult(validatePayloadResult(args));
};

export const validateAgainstState = (args) => {
  unwrapValidationResult(validateAgainstStateResult(args));
};

export const processCommand = (args) => {
  const result = processCommandResult(args);
  unwrapValidationResult(result);
  return {
    state: stripOmittableEmptyRoots(result.state),
  };
};
