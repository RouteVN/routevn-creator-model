import {
  createInvariantValidationError,
  createPayloadValidationError,
  createPreconditionValidationError,
  createStateValidationError,
} from "./errors.js";
import {
  collectTreeDescendantIds,
  findTreeNode,
  findTreeParentId,
  insertScopedTreeNode,
  insertTreeNode,
  isFiniteNumber,
  isNonEmptyString,
  isPlainObject,
  removeTreeNode,
} from "./helpers.js";
import { isRuntimeFieldId } from "./runtimeFields.js";

const COLLECTION_KEYS = [
  "scenes",
  "files",
  "images",
  "spritesheets",
  "sounds",
  "voices",
  "videos",
  "animations",
  "particles",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "textStyles",
  "variables",
  "layouts",
  "controls",
];
const ROOT_KEYS = ["project", "story", "tags", ...COLLECTION_KEYS];
const LINE_UPDATE_ACTIONS_PRESERVE_PATHS = ["dialogue.content"];
const LINE_UPDATE_ACTIONS_PRESERVE_PATHS_SET = new Set(
  LINE_UPDATE_ACTIONS_PRESERVE_PATHS,
);
const CURRENT_LAYOUT_SCHEMA_VERSION = 2;
const FONT_WEIGHT_KEYS = ["minWeight", "defaultWeight", "maxWeight"];
const isPositiveFiniteNumber = (value) => isFiniteNumber(value) && value > 0;
const normalizeLayoutSchemaVersion = (value) =>
  Number.isInteger(value) && value >= 1 ? value : 1;
const isSupportedLayoutSchemaVersion = (value) =>
  value === CURRENT_LAYOUT_SCHEMA_VERSION;
const createEmptyCollectionState = () => ({
  items: {},
  tree: [],
});
const VALID_VARIABLE_ITEM_TYPES = new Set(["folder", "variable"]);
const TAG_SCOPE_BASE_KEYS = [
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
  "particles",
  "spritesheets",
];
const CHARACTER_SPRITE_TAG_SCOPE_PREFIX = "characterSprites:";
const createEmptyTagsState = () => ({
  images: createEmptyCollectionState(),
  sounds: createEmptyCollectionState(),
  videos: createEmptyCollectionState(),
  characters: createEmptyCollectionState(),
  fonts: createEmptyCollectionState(),
  transforms: createEmptyCollectionState(),
  colors: createEmptyCollectionState(),
  textStyles: createEmptyCollectionState(),
  variables: createEmptyCollectionState(),
  layouts: createEmptyCollectionState(),
  controls: createEmptyCollectionState(),
  animations: createEmptyCollectionState(),
  particles: createEmptyCollectionState(),
  spritesheets: createEmptyCollectionState(),
});
const isCharacterSpriteTagScopeKey = (value) =>
  isNonEmptyString(value) &&
  value.startsWith(CHARACTER_SPRITE_TAG_SCOPE_PREFIX) &&
  value.length > CHARACTER_SPRITE_TAG_SCOPE_PREFIX.length;
const getCharacterSpriteTagScopeCharacterId = (scopeKey) =>
  isCharacterSpriteTagScopeKey(scopeKey)
    ? scopeKey.slice(CHARACTER_SPRITE_TAG_SCOPE_PREFIX.length)
    : undefined;
const isBaseTagScopeKey = (scopeKey) => TAG_SCOPE_BASE_KEYS.includes(scopeKey);
const normalizeTagsState = (tags) => {
  if (tags === undefined) {
    return createEmptyTagsState();
  }

  if (!isPlainObject(tags)) {
    return tags;
  }

  const missingBaseScopeKeys = TAG_SCOPE_BASE_KEYS.filter(
    (scopeKey) => tags[scopeKey] === undefined,
  );
  if (missingBaseScopeKeys.length === 0) {
    return tags;
  }

  const nextTags = {
    ...tags,
  };
  for (const scopeKey of missingBaseScopeKeys) {
    nextTags[scopeKey] = createEmptyCollectionState();
  }

  return nextTags;
};

const filterVariableTreeNodes = ({ nodes, unsupportedItemIds }) => {
  if (!Array.isArray(nodes)) {
    return {
      nodes,
      changed: false,
      removedIds: new Set(),
    };
  }

  const filteredNodes = [];
  const removedIds = new Set();
  let changed = false;

  for (const node of nodes) {
    if (!isPlainObject(node)) {
      filteredNodes.push(node);
      continue;
    }

    if (unsupportedItemIds.has(node.id)) {
      changed = true;
      collectVariableTreeIds([node], removedIds);
      continue;
    }

    const childrenResult = filterVariableTreeNodes({
      nodes: node.children,
      unsupportedItemIds,
    });
    for (const removedId of childrenResult.removedIds) {
      removedIds.add(removedId);
    }

    if (childrenResult.changed) {
      changed = true;
      filteredNodes.push({
        ...node,
        children: childrenResult.nodes,
      });
      continue;
    }

    filteredNodes.push(node);
  }

  if (filteredNodes.length !== nodes.length) {
    changed = true;
  }

  return {
    nodes: changed ? filteredNodes : nodes,
    changed,
    removedIds,
  };
};

const collectVariableTreeIds = (nodes, ids = new Set()) => {
  if (!Array.isArray(nodes)) {
    return ids;
  }

  for (const node of nodes) {
    if (!isPlainObject(node) || !isNonEmptyString(node.id)) {
      continue;
    }

    ids.add(node.id);
    collectVariableTreeIds(node.children, ids);
  }

  return ids;
};

const normalizeVariablesCollection = (variables) => {
  if (!isPlainObject(variables) || !isPlainObject(variables.items)) {
    return variables;
  }

  const unsupportedItemIds = new Set();
  const nextItems = {};
  let didFilterItems = false;

  for (const [itemId, item] of Object.entries(variables.items)) {
    if (!VALID_VARIABLE_ITEM_TYPES.has(item?.type)) {
      unsupportedItemIds.add(itemId);
      didFilterItems = true;
      continue;
    }

    nextItems[itemId] = item;
  }

  const treeResult = filterVariableTreeNodes({
    nodes: variables.tree,
    unsupportedItemIds,
  });
  const nextTree = treeResult.nodes;
  const didFilterTree = treeResult.changed;

  for (const removedId of treeResult.removedIds) {
    if (Object.hasOwn(nextItems, removedId)) {
      delete nextItems[removedId];
      didFilterItems = true;
    }
  }

  if (!didFilterItems && !didFilterTree) {
    return variables;
  }

  return {
    ...variables,
    items: nextItems,
    tree: nextTree,
  };
};

const normalizeStateCollections = (state) => {
  if (!isPlainObject(state)) {
    return state;
  }

  const missingCollectionKeys = [
    "spritesheets",
    "particles",
    "controls",
    "voices",
  ].filter((key) => state[key] === undefined);
  const normalizedTags = normalizeTagsState(state.tags);
  const hasNormalizedTags = normalizedTags !== state.tags;
  const normalizedVariables = normalizeVariablesCollection(state.variables);
  const hasNormalizedVariables = normalizedVariables !== state.variables;

  if (
    missingCollectionKeys.length === 0 &&
    !hasNormalizedTags &&
    !hasNormalizedVariables
  ) {
    return state;
  }

  const nextState = {
    ...state,
  };

  missingCollectionKeys.forEach((key) => {
    nextState[key] = createEmptyCollectionState();
  });

  if (hasNormalizedTags) {
    nextState.tags = normalizedTags;
  }
  if (hasNormalizedVariables) {
    nextState.variables = normalizedVariables;
  }

  return nextState;
};
const isString = (value) => typeof value === "string";
const isHexColor = (value) =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
const UPDATE_TWEEN_PROPERTY_KEYS = [
  "alpha",
  "x",
  "y",
  "translateX",
  "translateY",
  "scaleX",
  "scaleY",
  "rotation",
  "blurX",
  "blurY",
  "uProgress",
];
const TRANSITION_TWEEN_PROPERTY_KEYS = [
  "x",
  "y",
  "translateX",
  "translateY",
  "alpha",
  "scaleX",
  "scaleY",
  "rotation",
];
const MASK_CHANNEL_KEYS = ["red", "green", "blue", "alpha"];
const MASK_COMBINE_KEYS = ["max", "min", "multiply", "add"];
const ANIMATION_EASING_KEYS = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
];
const VARIABLE_SCOPE_KEYS = ["context", "device", "account"];
const VARIABLE_TYPE_KEYS = ["string", "number", "boolean", "object"];
const LAYOUT_TYPE_KEYS = [
  "general",
  "save-load",
  "confirmDialog",
  "dialogue-adv",
  "dialogue-nvl",
  "choice",
  "history",
  "input",
];
const LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS = ["left", "center", "right"];
const LAYOUT_TEXT_REVEAL_EFFECT_KEYS = ["typewriter", "softWipe", "none"];
const LAYOUT_TEXT_REVEAL_SOUND_STOP_TIMING_KEYS = ["loopEnd", "immediate"];
const LAYOUT_ELEMENT_BLUR_KERNEL_SIZE_OPTIONS = [5, 7, 9, 11, 13, 15];
const CONTROL_KEYBOARD_KEYS = [
  "enter",
  "space",
  "esc",
  "ctrl",
  "left",
  "right",
  "up",
  "down",
];
const CONTROL_KEYBOARD_KEY_SET = new Set(CONTROL_KEYBOARD_KEYS);
const LAYOUT_ELEMENT_BASE_TYPES = [
  "folder",
  "container",
  "rect",
  "sprite",
  "particle",
  "spritesheet-animation",
  "text",
  "text-revealing",
  "input",
  "slider",
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "text-ref-choice-item-content",
  "text-ref-save-load-slot-date",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
  "text-ref-history-line-character-name",
  "text-ref-history-line-content",
  "sprite-ref-save-load-slot-image",
  "fragment-ref",
  "container-ref-choice-item",
  "container-ref-choice-single-item",
  "container-ref-save-load-slot",
  "container-ref-dialogue-line",
  "container-ref-history-line",
  "container-ref-confirm-dialog-ok",
  "container-ref-confirm-dialog-cancel",
];
const SAVE_LOAD_DATE_FORMATS = new Set([
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "DD MMM YYYY",
  "YYYY年MM月DD日",
]);
export const SCHEMA_VERSION = 12;
const LAYOUT_CONTAINER_ELEMENT_TYPES = [
  "folder",
  "container",
  "container-ref-choice-item",
  "container-ref-choice-single-item",
  "container-ref-save-load-slot",
  "container-ref-dialogue-line",
  "container-ref-history-line",
  "container-ref-confirm-dialog-ok",
  "container-ref-confirm-dialog-cancel",
];
const LAYOUT_TEXT_CONTENT_ELEMENT_TYPES = [
  "text",
  "text-revealing",
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "text-ref-choice-item-content",
  "text-ref-save-load-slot-date",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
  "text-ref-history-line-character-name",
  "text-ref-history-line-content",
];
const DOMAIN_ERROR_KIND_BY_NAME = {
  PayloadValidationError: "payload",
  PreconditionValidationError: "precondition",
  StateValidationError: "state",
  InvariantValidationError: "invariant",
};

const toPublicValidationError = (error) => {
  const details = isPlainObject(error?.details) ? error.details : {};
  const publicError = {
    kind: DOMAIN_ERROR_KIND_BY_NAME[error.name],
    code: error.code,
    message: error.message,
  };

  if (isNonEmptyString(details.path)) {
    publicError.path = details.path;
  }

  if (Object.keys(details).length > 0) {
    publicError.details = details;
  }

  return publicError;
};

const VALID_RESULT = Object.freeze({
  valid: true,
});

const createInvalidResult = ({ kind, code, message, path, details }) => {
  const error = {
    kind,
    code,
    message,
  };

  if (isNonEmptyString(path)) {
    error.path = path;
  }

  if (isPlainObject(details) && Object.keys(details).length > 0) {
    error.details = details;
  }

  return {
    valid: false,
    error,
  };
};

const invalidPayload = (message, details = {}) =>
  createInvalidResult({
    kind: "payload",
    code: "payload_validation_failed",
    message,
    path: details.path,
    details,
  });

const invalidPrecondition = (message, details = {}) =>
  createInvalidResult({
    kind: "precondition",
    code: "precondition_validation_failed",
    message,
    path: details.path,
    details,
  });

const invalidState = (message, details = {}) =>
  createInvalidResult({
    kind: "state",
    code: "state_validation_failed",
    message,
    path: details.path,
    details,
  });

const invalidInvariant = (message, details = {}) =>
  createInvalidResult({
    kind: "invariant",
    code: "invariant_validation_failed",
    message,
    path: details.path,
    details,
  });

const isVariableReferenceTarget = (state, variableId) => {
  const variable = state.variables.items[variableId];
  return isPlainObject(variable) && variable.type !== "folder";
};

const isStringVariableReferenceTarget = (state, variableId) => {
  const variable = state.variables.items[variableId];
  return (
    isPlainObject(variable) &&
    variable.type === "variable" &&
    variable.variableType === "string"
  );
};

const LAYOUT_ITEM_TARGET_SET = new Set(["item.savedAt"]);
const LAYOUT_DIALOGUE_TARGET_SET = new Set(["dialogue.characterId"]);
const RUNTIME_TARGET_DOT_PATTERN = /^runtime\.([A-Za-z_$][A-Za-z0-9_$]*)$/;
const VARIABLE_TARGET_DOT_PATTERN = /^variables\.([A-Za-z_$][A-Za-z0-9_$]*)$/;
const VARIABLE_TARGET_BRACKET_PATTERN = /^variables\[(.+)\]$/;

const parseLayoutConditionTarget = (target) => {
  if (!isNonEmptyString(target)) {
    return undefined;
  }

  if (LAYOUT_ITEM_TARGET_SET.has(target)) {
    return {
      kind: "item",
      target,
    };
  }

  if (LAYOUT_DIALOGUE_TARGET_SET.has(target)) {
    return {
      kind: "dialogue",
      target,
    };
  }

  const runtimeMatch = target.match(RUNTIME_TARGET_DOT_PATTERN);
  if (runtimeMatch && isRuntimeFieldId(runtimeMatch[1])) {
    return {
      kind: "runtime",
      target,
      runtimeId: runtimeMatch[1],
    };
  }

  const dotMatch = target.match(VARIABLE_TARGET_DOT_PATTERN);
  if (dotMatch) {
    return {
      kind: "variable",
      target,
      variableId: dotMatch[1],
    };
  }

  const bracketMatch = target.match(VARIABLE_TARGET_BRACKET_PATTERN);
  if (!bracketMatch) {
    return undefined;
  }

  const rawValue = bracketMatch[1].trim();

  try {
    const variableId = JSON.parse(rawValue);
    if (isNonEmptyString(variableId)) {
      return {
        kind: "variable",
        target,
        variableId,
      };
    }
  } catch {}

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    const variableId = rawValue.slice(1, -1);
    if (isNonEmptyString(variableId)) {
      return {
        kind: "variable",
        target,
        variableId,
      };
    }
  }

  return undefined;
};

const isLayoutConditionTarget = (state, target) => {
  const parsedTarget = parseLayoutConditionTarget(target);
  if (!parsedTarget) {
    return false;
  }

  if (parsedTarget.kind !== "variable") {
    return true;
  }

  return isVariableReferenceTarget(state, parsedTarget.variableId);
};

const toDomainErrorDetails = (publicError) => {
  const details = isPlainObject(publicError?.details)
    ? { ...publicError.details }
    : {};

  if (isNonEmptyString(publicError?.path)) {
    details.path = publicError.path;
  }

  return details;
};

const captureValidation = (callback) =>
  toPublicResult({
    run: callback,
    mapValue: (value) => {
      if (value?.valid === false || value?.valid === true) {
        return value;
      }

      return VALID_RESULT;
    },
  });

const normalizePayloadResult = (result) => {
  if (!result.valid) {
    if (result.error && result.error.kind === "payload") {
      return result;
    }

    if (!result.error) {
      return invalidPayload("payload validation failed");
    }

    return invalidPayload(
      result.error.message,
      toDomainErrorDetails(result.error),
    );
  }

  if (result.error && result.error.kind === "payload") {
    return result;
  }

  return result;
};

const normalizeStateResult = (result) => {
  if (!result.valid) {
    return result;
  }

  return VALID_RESULT;
};

const toPublicResult = ({ run, mapValue }) => {
  try {
    const value = run();
    return mapValue ? mapValue(value) : { valid: true };
  } catch (error) {
    if (DOMAIN_ERROR_KIND_BY_NAME[error?.name]) {
      return {
        valid: false,
        error: toPublicValidationError(error),
      };
    }

    throw error;
  }
};

const invalidFromDomainError = (error) => ({
  valid: false,
  error: toPublicValidationError(error),
});

const invalidFromErrorFactory = (errorFactory, message, details) =>
  invalidFromDomainError(errorFactory(message, details));

const validateExactKeys = ({ value, expectedKeys, path, errorFactory }) => {
  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!expectedKeys.includes(key)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} is not allowed`,
      );
    }
  }

  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} is required`,
      );
    }
  }
};

const validateAllowedKeys = ({ value, allowedKeys, path, errorFactory }) => {
  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} is not allowed`,
      );
    }
  }
};

const validateOptionalPosition = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return;
  }

  {
    const result = validateAllowedKeys({
      value,
      allowedKeys: ["x", "y"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  const hasX = value.x !== undefined;
  const hasY = value.y !== undefined;

  if (!hasX && !hasY) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must contain at least one of 'x' or 'y'`,
    );
  }

  if (hasX && !isFiniteNumber(value.x)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.x must be a finite number`,
    );
  }

  if (hasY && !isFiniteNumber(value.y)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.y must be a finite number`,
    );
  }
};

const validateSceneItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item?.type === "scene"
            ? ["id", "type", "name", "description", "position", "sections"]
            : ["id", "type", "name", "description", "position"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (item.type !== "scene" && item.type !== "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'scene' or 'folder'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    {
      const result = validateOptionalPosition({
        value: item.position,
        path: `${itemPath}.position`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (item.type === "scene" && item.sections !== undefined) {
      {
        const result = validateNestedCollection({
          collection: item.sections,
          path: `${itemPath}.sections`,
          itemValidator: validateSectionItems,
          treeValidator: validateSectionTreeShape,
          treeNodeLabel: "section",
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateSectionItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys: ["id", "name", "lines"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.lines !== undefined) {
      if (item.lines !== undefined) {
        {
          const result = validateNestedCollection({
            collection: item.lines,
            path: `${itemPath}.lines`,
            itemValidator: validateLineItems,
            treeValidator: validateLineTreeFlatShape,
            treeNodeLabel: "line",
            errorFactory,
          });
          if (result?.valid === false) {
            return result;
          }
        }
      }
    }
  }
};

const validateLineItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys: ["id", "actions"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isPlainObject(item.actions)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.actions must be an object`,
      );
    }
  }
};

const validateFileItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== undefined && !isNonEmptyString(item.type)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be a non-empty string when provided`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : ["id", "type", "mimeType", "size", "sha256"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (item.type === "folder") {
      if (!isNonEmptyString(item.name)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.name must be a non-empty string`,
        );
      }
      continue;
    }

    if (!isNonEmptyString(item.mimeType)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.mimeType must be a non-empty string`,
      );
    }

    if (!isFiniteNumber(item.size)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.size must be a finite number`,
      );
    }

    if (!isNonEmptyString(item.sha256)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.sha256 must be a non-empty string`,
      );
    }
  }
};

const validateImageItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "image") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'image'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "thumbnailFileId",
                "fileId",
                "width",
                "height",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "image") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (
        item.thumbnailFileId !== undefined &&
        !isNonEmptyString(item.thumbnailFileId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.thumbnailFileId must be a non-empty string when provided`,
        );
      }

      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string`,
        );
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.width must be a finite number`,
        );
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.height must be a finite number`,
        );
      }
    }
  }
};

const validateSpritesheetAnimationMap = ({
  animations,
  path,
  errorFactory,
}) => {
  if (!isPlainObject(animations)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  for (const [animationName, animation] of Object.entries(animations)) {
    const animationPath = `${path}.${animationName}`;

    if (!isNonEmptyString(animationName)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${animationPath} must use a non-empty animation name`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: animation,
        allowedKeys: ["frames", "animationSpeed", "fps", "loop"],
        path: animationPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!Array.isArray(animation.frames)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${animationPath}.frames must be an array`,
      );
    }

    for (let index = 0; index < animation.frames.length; index += 1) {
      const frame = animation.frames[index];
      if (!Number.isInteger(frame) || frame < 0) {
        return invalidFromErrorFactory(
          errorFactory,
          `${animationPath}.frames.${index} must be an integer greater than or equal to 0`,
        );
      }
    }

    if (
      animation.animationSpeed !== undefined &&
      !isFiniteNumber(animation.animationSpeed)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${animationPath}.animationSpeed must be a finite number when provided`,
      );
    }

    if (animation.fps !== undefined && !isPositiveFiniteNumber(animation.fps)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${animationPath}.fps must be a positive finite number when provided`,
      );
    }

    if (animation.loop !== undefined && typeof animation.loop !== "boolean") {
      return invalidFromErrorFactory(
        errorFactory,
        `${animationPath}.loop must be a boolean when provided`,
      );
    }
  }

  return VALID_RESULT;
};

const validateSpritesheetItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "spritesheet") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'spritesheet'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "thumbnailFileId",
                "fileId",
                "sheetWidth",
                "sheetHeight",
                "frameCount",
                "width",
                "height",
                "jsonData",
                "animations",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "spritesheet") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (
        item.thumbnailFileId !== undefined &&
        !isNonEmptyString(item.thumbnailFileId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.thumbnailFileId must be a non-empty string when provided`,
        );
      }

      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string`,
        );
      }

      for (const key of [
        "sheetWidth",
        "sheetHeight",
        "frameCount",
        "width",
        "height",
      ]) {
        if (item[key] !== undefined && !isFiniteNumber(item[key])) {
          return invalidFromErrorFactory(
            errorFactory,
            `${itemPath}.${key} must be a finite number when provided`,
          );
        }
      }

      if (!isPlainObject(item.jsonData)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.jsonData must be an object`,
        );
      }

      {
        const result = validateSpritesheetAnimationMap({
          animations: item.animations,
          path: `${itemPath}.animations`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateSoundItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "sound") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'sound'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "fileId",
                "waveformDataFileId",
                "duration",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "sound") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string`,
        );
      }

      if (
        item.waveformDataFileId !== undefined &&
        item.waveformDataFileId !== null &&
        !isNonEmptyString(item.waveformDataFileId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.waveformDataFileId must be a non-empty string or null when provided`,
        );
      }

      if (item.duration !== undefined && !isFiniteNumber(item.duration)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.duration must be a finite number`,
        );
      }
    }
  }
};

const validateVoiceItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "voice") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'voice'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "sceneId",
                "fileId",
                "waveformDataFileId",
                "duration",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "voice") {
      if (!isNonEmptyString(item.sceneId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.sceneId must be a non-empty string`,
        );
      }

      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string`,
        );
      }

      if (
        item.waveformDataFileId !== undefined &&
        item.waveformDataFileId !== null &&
        !isNonEmptyString(item.waveformDataFileId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.waveformDataFileId must be a non-empty string or null when provided`,
        );
      }

      if (item.duration !== undefined && !isFiniteNumber(item.duration)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.duration must be a finite number`,
        );
      }
    }
  }
};

const validateVideoItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "video") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'video'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "fileId",
                "thumbnailFileId",
                "duration",
                "width",
                "height",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "video") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string`,
        );
      }

      if (!isNonEmptyString(item.thumbnailFileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.thumbnailFileId must be a non-empty string`,
        );
      }

      if (item.duration !== undefined && !isFiniteNumber(item.duration)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.duration must be a finite number`,
        );
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.width must be a finite number`,
        );
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.height must be a finite number`,
        );
      }
    }
  }
};

const validateAnimationKeyframes = ({ keyframes, path, errorFactory }) => {
  if (!Array.isArray(keyframes)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an array`);
  }

  for (const [index, keyframe] of keyframes.entries()) {
    const keyframePath = `${path}[${index}]`;

    {
      const result = validateAllowedKeys({
        value: keyframe,
        allowedKeys: ["value", "duration", "delay", "easing", "relative"],
        path: keyframePath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!("value" in keyframe)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${keyframePath}.value is required`,
      );
    }

    if (!("duration" in keyframe)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${keyframePath}.duration is required`,
      );
    }

    if (!isFiniteNumber(keyframe.value)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${keyframePath}.value must be a finite number`,
      );
    }

    if (!isFiniteNumber(keyframe.duration) || keyframe.duration < 1) {
      return invalidFromErrorFactory(
        errorFactory,
        `${keyframePath}.duration must be a finite number >= 1`,
      );
    }

    if (
      keyframe.delay !== undefined &&
      (!isFiniteNumber(keyframe.delay) || keyframe.delay < 0)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${keyframePath}.delay must be a finite number >= 0 when provided`,
      );
    }

    if (
      keyframe.easing !== undefined &&
      !ANIMATION_EASING_KEYS.includes(keyframe.easing)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${keyframePath}.easing must be a supported Route Graphics easing`,
      );
    }

    if (
      keyframe.relative !== undefined &&
      typeof keyframe.relative !== "boolean"
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${keyframePath}.relative must be a boolean when provided`,
      );
    }
  }
};

const validateAutoTweenProperty = ({ auto, path, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: auto,
      allowedKeys: ["duration", "easing"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!("duration" in auto)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.duration is required`,
    );
  }

  if (!isFiniteNumber(auto.duration) || auto.duration < 1) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.duration must be a finite number >= 1`,
    );
  }

  if (
    auto.easing !== undefined &&
    !ANIMATION_EASING_KEYS.includes(auto.easing)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.easing must be a supported Route Graphics easing`,
    );
  }
};

const validateTweenProperty = ({
  config,
  path,
  allowEmptyKeyframes = false,
  allowAuto = false,
  errorFactory,
}) => {
  {
    const result = validateAllowedKeys({
      value: config,
      allowedKeys: allowAuto
        ? ["initialValue", "keyframes", "auto"]
        : ["initialValue", "keyframes"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  const hasKeyframes = "keyframes" in config;
  const hasAuto = "auto" in config;

  if (!hasKeyframes && !hasAuto) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.keyframes or ${path}.auto is required`,
    );
  }

  if (hasKeyframes && hasAuto) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.keyframes and ${path}.auto cannot both be defined`,
    );
  }

  if (
    config.initialValue !== undefined &&
    !isFiniteNumber(config.initialValue)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.initialValue must be a finite number`,
    );
  }

  if (hasAuto) {
    if (config.initialValue !== undefined) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.initialValue is not supported when ${path}.auto is defined`,
      );
    }

    {
      const result = validateAutoTweenProperty({
        auto: config.auto,
        path: `${path}.auto`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    return;
  }

  {
    const result = validateAnimationKeyframes({
      keyframes: config.keyframes,
      path: `${path}.keyframes`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!allowEmptyKeyframes && config.keyframes.length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.keyframes must contain at least one keyframe`,
    );
  }
};

const validateTweenDefinition = ({
  tween,
  allowedProperties,
  path,
  unsupportedMessage,
  allowEmptyKeyframes = false,
  allowAuto = false,
  errorFactory,
}) => {
  if (!isPlainObject(tween)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  for (const [propertyName, config] of Object.entries(tween)) {
    const propertyPath = `${path}.${propertyName}`;

    if (!allowedProperties.includes(propertyName)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${propertyPath} ${unsupportedMessage}`,
      );
    }

    {
      const result = validateTweenProperty({
        config,
        path: propertyPath,
        allowEmptyKeyframes,
        allowAuto,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateMaskDefinition = ({ mask, path, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: mask,
      allowedKeys: [
        "kind",
        "imageId",
        "imageIds",
        "texture",
        "textures",
        "items",
        "combine",
        "channel",
        "softness",
        "invert",
        "sample",
        "delay",
        "progress",
        "progressDuration",
        "progressEasing",
      ],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(mask.kind)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.kind must be a non-empty string`,
    );
  }

  if (
    mask.kind !== "single" &&
    mask.kind !== "sequence" &&
    mask.kind !== "composite"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.kind must be 'single', 'sequence', or 'composite'`,
    );
  }

  if (mask.texture !== undefined && !isNonEmptyString(mask.texture)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.texture must be a non-empty string when provided`,
    );
  }

  if (mask.imageId !== undefined && !isNonEmptyString(mask.imageId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.imageId must be a non-empty string when provided`,
    );
  }

  if (mask.textures !== undefined) {
    if (!Array.isArray(mask.textures) || mask.textures.length === 0) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.textures must be a non-empty array when provided`,
      );
    }

    for (const [index, texture] of mask.textures.entries()) {
      if (!isNonEmptyString(texture)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${path}.textures[${index}] must be a non-empty string`,
        );
      }
    }
  }

  if (mask.imageIds !== undefined) {
    if (!Array.isArray(mask.imageIds) || mask.imageIds.length === 0) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.imageIds must be a non-empty array when provided`,
      );
    }

    for (const [index, imageId] of mask.imageIds.entries()) {
      if (!isNonEmptyString(imageId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${path}.imageIds[${index}] must be a non-empty string`,
        );
      }
    }
  }

  if (mask.items !== undefined) {
    if (!Array.isArray(mask.items) || mask.items.length === 0) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.items must be a non-empty array when provided`,
      );
    }

    for (const [index, item] of mask.items.entries()) {
      const itemPath = `${path}.items[${index}]`;

      {
        const result = validateAllowedKeys({
          value: item,
          allowedKeys: ["texture", "imageId", "channel", "invert"],
          path: itemPath,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (item.texture !== undefined && !isNonEmptyString(item.texture)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.texture must be a non-empty string when provided`,
        );
      }

      if (item.imageId !== undefined && !isNonEmptyString(item.imageId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.imageId must be a non-empty string when provided`,
        );
      }

      if (!isNonEmptyString(item.texture) && !isNonEmptyString(item.imageId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath} must define texture or imageId`,
        );
      }

      if (
        item.channel !== undefined &&
        !MASK_CHANNEL_KEYS.includes(item.channel)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.channel must be a supported mask channel`,
        );
      }

      if (item.invert !== undefined && typeof item.invert !== "boolean") {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.invert must be a boolean when provided`,
        );
      }
    }
  }

  if (mask.combine !== undefined && !MASK_COMBINE_KEYS.includes(mask.combine)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.combine must be a supported mask combine mode`,
    );
  }

  if (mask.channel !== undefined && !MASK_CHANNEL_KEYS.includes(mask.channel)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.channel must be a supported mask channel`,
    );
  }

  if (mask.softness !== undefined && !isFiniteNumber(mask.softness)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.softness must be a finite number when provided`,
    );
  }

  if (mask.invert !== undefined && typeof mask.invert !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.invert must be a boolean when provided`,
    );
  }

  if (mask.sample !== undefined && !isString(mask.sample)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.sample must be a string when provided`,
    );
  }

  if (
    mask.delay !== undefined &&
    (!Number.isSafeInteger(mask.delay) || mask.delay < 0)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.delay must be a non-negative safe integer when provided`,
    );
  }

  if (mask.progress !== undefined) {
    {
      const result = validateTweenProperty({
        config: mask.progress,
        path: `${path}.progress`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (
    mask.progressDuration !== undefined &&
    (!isFiniteNumber(mask.progressDuration) || mask.progressDuration < 1)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.progressDuration must be a finite number greater than or equal to 1 when provided`,
    );
  }

  if (
    mask.progressEasing !== undefined &&
    !ANIMATION_EASING_KEYS.includes(mask.progressEasing)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.progressEasing must be a supported Route Graphics easing`,
    );
  }

  if (
    mask.kind === "single" &&
    !isNonEmptyString(mask.texture) &&
    !isNonEmptyString(mask.imageId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.texture or ${path}.imageId is required when ${path}.kind is 'single'`,
    );
  }

  if (
    mask.kind === "sequence" &&
    mask.textures === undefined &&
    mask.imageIds === undefined
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.textures or ${path}.imageIds is required when ${path}.kind is 'sequence'`,
    );
  }

  if (mask.kind === "composite" && mask.items === undefined) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.items is required when ${path}.kind is 'composite'`,
    );
  }
};

const validateAnimationMasks = ({ mask, path, errorFactory }) => {
  if (!Array.isArray(mask)) {
    return validateMaskDefinition({ mask, path, errorFactory });
  }

  if (mask.length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be a non-empty array when provided`,
    );
  }

  for (const [index, maskDefinition] of mask.entries()) {
    const result = validateMaskDefinition({
      mask: maskDefinition,
      path: `${path}[${index}]`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateAnimationDefinition = ({ animation, path, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: animation,
      allowedKeys: ["type", "tween", "prev", "next", "mask"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(animation.type)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.type must be a non-empty string`,
    );
  }

  if (animation.type !== "update" && animation.type !== "transition") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.type must be 'update' or 'transition'`,
    );
  }

  if (animation.type === "update") {
    if (
      animation.prev !== undefined ||
      animation.next !== undefined ||
      animation.mask !== undefined
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.update animations cannot define prev, next, or mask`,
      );
    }

    if (animation.tween === undefined) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.tween is required when ${path}.type is 'update'`,
      );
    }

    {
      const result = validateTweenDefinition({
        tween: animation.tween,
        allowedProperties: UPDATE_TWEEN_PROPERTY_KEYS,
        path: `${path}.tween`,
        unsupportedMessage: "is not a supported update tween property",
        allowEmptyKeyframes: true,
        allowAuto: true,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    return;
  }

  if (animation.tween !== undefined) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.transition animations cannot define tween`,
    );
  }

  for (const side of ["prev", "next"]) {
    if (animation[side] === undefined) {
      continue;
    }

    {
      const result = validateExactKeys({
        value: animation[side],
        expectedKeys: ["tween"],
        path: `${path}.${side}`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateTweenDefinition({
        tween: animation[side].tween,
        allowedProperties: TRANSITION_TWEEN_PROPERTY_KEYS,
        path: `${path}.${side}.tween`,
        unsupportedMessage: "is not a supported transition tween property",
        allowEmptyKeyframes: true,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (animation.mask !== undefined) {
    {
      const result = validateAnimationMasks({
        mask: animation.mask,
        path: `${path}.mask`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateAnimationItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "animation") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'animation'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "thumbnailFileId",
                "preview",
                "animation",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "animation") {
      if (
        item.thumbnailFileId !== undefined &&
        !isNonEmptyString(item.thumbnailFileId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.thumbnailFileId must be a non-empty string when provided`,
        );
      }

      {
        const result = validateAnimationPreviewObject({
          value: item.preview,
          path: `${itemPath}.preview`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateAnimationDefinition({
          animation: item.animation,
          path: `${itemPath}.animation`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateFontWeightFields = ({ value, path, errorFactory }) => {
  const presentKeys = FONT_WEIGHT_KEYS.filter((key) =>
    Object.hasOwn(value, key),
  );
  if (presentKeys.length === 0) {
    return;
  }

  if (presentKeys.length !== FONT_WEIGHT_KEYS.length) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must include minWeight, defaultWeight, and maxWeight together`,
    );
  }

  for (const key of FONT_WEIGHT_KEYS) {
    if (!isFiniteNumber(value[key]) || value[key] < 1 || value[key] > 1000) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a finite number between 1 and 1000`,
      );
    }
  }

  if (
    value.minWeight > value.defaultWeight ||
    value.defaultWeight > value.maxWeight
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must satisfy minWeight <= defaultWeight <= maxWeight`,
    );
  }
};

const validateFontItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "font") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'font'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "fileId",
                "fontFamily",
                ...FONT_WEIGHT_KEYS,
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "font") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string`,
        );
      }

      if (!isNonEmptyString(item.fontFamily)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fontFamily must be a non-empty string`,
        );
      }

      {
        const result = validateFontWeightFields({
          value: item,
          path: itemPath,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateColorItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "color") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'color'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : ["id", "type", "name", "description", "tagIds", "hex"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "color") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isHexColor(item.hex)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.hex must be a #RRGGBB string`,
        );
      }
    }
  }
};

const validateTransformItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "transform") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'transform'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "x",
                "y",
                "scaleX",
                "scaleY",
                "anchorX",
                "anchorY",
                "rotation",
                "thumbnailFileId",
                "previewFileId",
                "preview",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "transform") {
      for (const fieldName of ["thumbnailFileId", "previewFileId"]) {
        const fileId = item[fieldName];
        if (fileId !== undefined && !isNonEmptyString(fileId)) {
          return invalidFromErrorFactory(
            errorFactory,
            `${itemPath}.${fieldName} must be a non-empty string when provided`,
          );
        }
      }

      {
        const result = validateTransformPreviewObject({
          value: item.preview,
          path: `${itemPath}.preview`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      for (const key of [
        "x",
        "y",
        "scaleX",
        "scaleY",
        "anchorX",
        "anchorY",
        "rotation",
      ]) {
        if (!isFiniteNumber(item[key])) {
          return invalidFromErrorFactory(
            errorFactory,
            `${itemPath}.${key} must be a finite number`,
          );
        }
      }
    }
  }
};

const validateParticleModules = ({ modules, path, errorFactory }) => {
  if (!isPlainObject(modules)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  if (!isPlainObject(modules.emission)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.emission must be an object`,
    );
  }

  if (!isPlainObject(modules.appearance)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.appearance must be an object`,
    );
  }

  if (modules.movement !== undefined && !isPlainObject(modules.movement)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.movement must be an object when provided`,
    );
  }

  if (modules.bounds !== undefined && !isPlainObject(modules.bounds)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.bounds must be an object when provided`,
    );
  }
};

const validateParticleItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "particle") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'particle'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "width",
                "height",
                "seed",
                "modules",
                "thumbnailFileId",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type !== "particle") {
      continue;
    }

    {
      const result = validateOptionalUniqueIdArray({
        value: item.tagIds,
        path: `${itemPath}.tagIds`,
        errorFactory,
        allowEmpty: false,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isFiniteNumber(item.width) || item.width <= 0) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.width must be a positive finite number`,
      );
    }

    if (!isFiniteNumber(item.height) || item.height <= 0) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.height must be a positive finite number`,
      );
    }

    if (item.seed !== undefined && !isFiniteNumber(item.seed)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.seed must be a finite number when provided`,
      );
    }

    if (
      item.thumbnailFileId !== undefined &&
      !isNonEmptyString(item.thumbnailFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.thumbnailFileId must be a non-empty string when provided`,
      );
    }

    {
      const result = validateParticleModules({
        modules: item.modules,
        path: `${itemPath}.modules`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateVariableTypedValue = ({
  value,
  variableType,
  path,
  errorFactory,
}) => {
  if (variableType === "string" && !isString(value)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be a string`);
  }

  if (variableType === "number" && !isFiniteNumber(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be a finite number`,
    );
  }

  if (variableType === "boolean" && typeof value !== "boolean") {
    return invalidFromErrorFactory(errorFactory, `${path} must be a boolean`);
  }

  if (
    variableType === "object" &&
    (value === null || typeof value !== "object")
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be a non-null object or array`,
    );
  }

  if (variableType === "object") {
    return validateComputedDataValue({
      value,
      path,
      errorFactory,
    });
  }
};

const COMPUTED_EXPRESSION_FIXED_OPERAND_COUNTS = Object.freeze({
  add: 2,
  sub: 2,
  mul: 2,
  div: 2,
  mod: 2,
  neg: 1,
  round: 1,
  floor: 1,
  ceil: 1,
  min: 2,
  max: 2,
  clamp: 3,
  eq: 2,
  neq: 2,
  gt: 2,
  gte: 2,
  lt: 2,
  lte: 2,
  in: 2,
  not: 1,
  length: 1,
  includes: 2,
});
const COMPUTED_EXPRESSION_VARIADIC_OPERATORS = new Set([
  "and",
  "or",
  "all",
  "any",
]);
const COMPUTED_EXPRESSION_NUMERIC_OPERAND_OPERATORS = new Set([
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "neg",
  "round",
  "floor",
  "ceil",
  "min",
  "max",
  "clamp",
]);
const COMPUTED_EXPRESSION_NUMERIC_RESULT_OPERATORS = new Set([
  ...COMPUTED_EXPRESSION_NUMERIC_OPERAND_OPERATORS,
  "length",
]);
const COMPUTED_EXPRESSION_BOOLEAN_RESULT_OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "and",
  "or",
  "all",
  "any",
  "not",
  "includes",
]);
const COMPUTED_CONDITION_FIXED_OPERAND_COUNTS = Object.freeze({
  eq: 2,
  neq: 2,
  gt: 2,
  gte: 2,
  lt: 2,
  lte: 2,
  in: 2,
  add: 2,
  sub: 2,
});
const COMPUTED_CONDITION_VARIADIC_OPERATORS = new Set(["all", "any"]);

const getComputedValueType = (value) => {
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return "object";
  }
  return typeof value;
};

const validComputedResult = (valueType) => ({
  valid: true,
  valueType,
});

const validateComputedDataValue = ({
  value,
  path,
  errorFactory,
  ancestors = new Set(),
}) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return VALID_RESULT;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return VALID_RESULT;
    }
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must use finite numeric values`,
    );
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path} must not contain cyclic data`,
      );
    }
    ancestors.add(value);

    for (const [index, item] of value.entries()) {
      const result = validateComputedDataValue({
        value: item,
        path: `${path}[${index}]`,
        errorFactory,
        ancestors,
      });
      if (result?.valid === false) {
        return result;
      }
    }
    ancestors.delete(value);
    return VALID_RESULT;
  }

  if (
    !isPlainObject(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must contain JSON-compatible data`,
    );
  }

  if (ancestors.has(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must not contain cyclic data`,
    );
  }
  ancestors.add(value);

  for (const [key, item] of Object.entries(value)) {
    const result = validateComputedDataValue({
      value: item,
      path: `${path}.${key}`,
      errorFactory,
      ancestors,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  ancestors.delete(value);
  return VALID_RESULT;
};

const invalidComputedReferenceParseResult = Object.freeze({
  valid: false,
});

const decodeComputedReferenceQuotedPart = (rawValue) => {
  if (rawValue[0] === '"') {
    try {
      return {
        valid: true,
        value: JSON.parse(rawValue),
      };
    } catch {
      return invalidComputedReferenceParseResult;
    }
  }

  let value = "";
  const escapedValues = {
    "\\": "\\",
    '"': '"',
    "'": "'",
    "/": "/",
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
  };

  for (let index = 1; index < rawValue.length - 1; index += 1) {
    const character = rawValue[index];
    if (character !== "\\") {
      if (character.charCodeAt(0) < 0x20) {
        return invalidComputedReferenceParseResult;
      }
      value += character;
      continue;
    }

    index += 1;
    if (index >= rawValue.length - 1) {
      return invalidComputedReferenceParseResult;
    }

    const escapedCharacter = rawValue[index];
    if (escapedCharacter === "u") {
      const hexValue = rawValue.slice(index + 1, index + 5);
      if (hexValue.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hexValue)) {
        return invalidComputedReferenceParseResult;
      }
      value += String.fromCharCode(Number.parseInt(hexValue, 16));
      index += 4;
      continue;
    }

    if (!Object.hasOwn(escapedValues, escapedCharacter)) {
      return invalidComputedReferenceParseResult;
    }
    value += escapedValues[escapedCharacter];
  }

  return {
    valid: true,
    value,
  };
};

const parseComputedReferencePath = (value) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return invalidComputedReferenceParseResult;
  }

  const parts = [];
  let index = 0;

  const readBarePart = () => {
    const startIndex = index;
    while (
      index < value.length &&
      value[index] !== "." &&
      value[index] !== "[" &&
      value[index] !== "]"
    ) {
      index += 1;
    }

    const part = value.slice(startIndex, index);
    if (part.length === 0 || part.trim() !== part || /\s/.test(part)) {
      return false;
    }
    parts.push(part);
    return true;
  };

  const readBracketPart = () => {
    index += 1;
    while (index < value.length && /\s/.test(value[index])) {
      index += 1;
    }

    const firstCharacter = value[index];
    if (/\d/.test(firstCharacter ?? "")) {
      const startIndex = index;
      while (index < value.length && /\d/.test(value[index])) {
        index += 1;
      }
      const rawPart = value.slice(startIndex, index);
      while (index < value.length && /\s/.test(value[index])) {
        index += 1;
      }
      if (
        value[index] !== "]" ||
        (rawPart.length > 1 && rawPart.startsWith("0"))
      ) {
        return false;
      }
      index += 1;
      parts.push(rawPart);
      return true;
    }

    if (firstCharacter !== '"' && firstCharacter !== "'") {
      return false;
    }

    const quote = firstCharacter;
    const startIndex = index;
    index += 1;
    let escaped = false;
    while (index < value.length) {
      const character = value[index];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        const decodedPart = decodeComputedReferenceQuotedPart(
          value.slice(startIndex, index + 1),
        );
        if (!decodedPart.valid) {
          return false;
        }

        index += 1;
        while (index < value.length && /\s/.test(value[index])) {
          index += 1;
        }
        if (value[index] !== "]") {
          return false;
        }
        index += 1;
        parts.push(decodedPart.value);
        return true;
      }
      index += 1;
    }

    return false;
  };

  if (!readBarePart()) {
    return invalidComputedReferenceParseResult;
  }

  while (index < value.length) {
    if (value[index] === ".") {
      index += 1;
      if (!readBarePart()) {
        return invalidComputedReferenceParseResult;
      }
      continue;
    }

    if (value[index] === "[") {
      if (!readBracketPart()) {
        return invalidComputedReferenceParseResult;
      }
      continue;
    }

    return invalidComputedReferenceParseResult;
  }

  return {
    valid: true,
    parts,
  };
};

const validateComputedReferencePath = ({
  value,
  path,
  errorFactory,
  variables,
  dependencies,
}) => {
  if (!isNonEmptyString(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be a non-empty string path`,
    );
  }

  const parsedPath = parseComputedReferencePath(value);
  if (!parsedPath.valid) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} has an invalid reference path`,
    );
  }

  const [root, referencedId, ...nestedPath] = parsedPath.parts;
  if (root !== "variables" && root !== "runtime") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must reference a concrete variables.* or runtime.* path`,
    );
  }

  if (!isNonEmptyString(referencedId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must reference a concrete ${root} member`,
    );
  }

  if (root === "runtime" || variables === undefined) {
    return validComputedResult(undefined);
  }

  const referencedVariable = Object.hasOwn(variables, referencedId)
    ? variables[referencedId]
    : undefined;
  if (
    !isPlainObject(referencedVariable) ||
    referencedVariable.type !== "variable"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} references unknown variable '${referencedId}'`,
    );
  }

  if (Object.hasOwn(referencedVariable, "computed")) {
    dependencies?.add(referencedId);
  }

  return validComputedResult(
    nestedPath.length === 0 ? referencedVariable.variableType : undefined,
  );
};

const validateComputedExpression = ({
  expression,
  path,
  errorFactory,
  variables,
  dependencies,
  ancestors = new Set(),
}) => {
  if (expression === null) {
    return validComputedResult("null");
  }

  if (typeof expression !== "object") {
    if (typeof expression === "number") {
      if (Number.isFinite(expression)) {
        return validComputedResult("number");
      }
      return invalidFromErrorFactory(
        errorFactory,
        `${path} must use finite numeric literals`,
      );
    }

    if (typeof expression === "string" || typeof expression === "boolean") {
      return validComputedResult(typeof expression);
    }

    return invalidFromErrorFactory(
      errorFactory,
      `${path} must use JSON-compatible primitive literals`,
    );
  }

  if (Array.isArray(expression)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} arrays must be wrapped in a literal operator or authored as value`,
    );
  }

  if (ancestors.has(expression)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must not contain cyclic expression data`,
    );
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(expression);

  const entries = Object.entries(expression);
  if (entries.length !== 1) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must contain exactly one expression operator`,
    );
  }

  const [[operator, operands]] = entries;
  if (operator === "var") {
    const result = validateComputedReferencePath({
      value: operands,
      path: `${path}.var`,
      errorFactory,
      variables,
      dependencies,
    });
    return result;
  }

  if (operator === "literal") {
    const result = validateComputedDataValue({
      value: operands,
      path: `${path}.literal`,
      errorFactory,
    });
    return result?.valid === false
      ? result
      : validComputedResult(getComputedValueType(operands));
  }

  const fixedOperandCount = COMPUTED_EXPRESSION_FIXED_OPERAND_COUNTS[operator];
  const isVariadic = COMPUTED_EXPRESSION_VARIADIC_OPERATORS.has(operator);
  if (fixedOperandCount === undefined && !isVariadic) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} contains unsupported expression operator '${operator}'`,
    );
  }

  if (!Array.isArray(operands)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.${operator} must be an operand array`,
    );
  }

  if (
    (fixedOperandCount !== undefined &&
      operands.length !== fixedOperandCount) ||
    (isVariadic && operands.length === 0)
  ) {
    const operandRequirement = isVariadic
      ? "at least one operand"
      : `exactly ${fixedOperandCount} operands`;
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.${operator} requires ${operandRequirement}`,
    );
  }

  const operandTypes = [];
  for (const [index, operand] of operands.entries()) {
    const result = validateComputedExpression({
      expression: operand,
      path: `${path}.${operator}[${index}]`,
      errorFactory,
      variables,
      dependencies,
      ancestors: nextAncestors,
    });
    if (result?.valid === false) {
      return result;
    }
    operandTypes.push(result.valueType);
  }

  if (
    COMPUTED_EXPRESSION_NUMERIC_OPERAND_OPERATORS.has(operator) &&
    operandTypes.some(
      (operandType) => operandType !== undefined && operandType !== "number",
    )
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.${operator} requires numeric operands`,
    );
  }

  if (COMPUTED_EXPRESSION_NUMERIC_RESULT_OPERATORS.has(operator)) {
    return validComputedResult("number");
  }
  if (COMPUTED_EXPRESSION_BOOLEAN_RESULT_OPERATORS.has(operator)) {
    return validComputedResult("boolean");
  }
  return validComputedResult(undefined);
};

const validateComputedCondition = ({
  condition,
  path,
  errorFactory,
  variables,
  dependencies,
  isRoot = true,
  ancestors = new Set(),
}) => {
  if (isRoot && typeof condition === "string") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} string conditions are not supported`,
    );
  }

  if (condition === null) {
    return validComputedResult("null");
  }

  if (typeof condition !== "object") {
    if (typeof condition === "number") {
      if (Number.isFinite(condition)) {
        return validComputedResult("number");
      }
      return invalidFromErrorFactory(
        errorFactory,
        `${path} must use finite numeric literals`,
      );
    }

    if (typeof condition === "string" || typeof condition === "boolean") {
      return validComputedResult(typeof condition);
    }

    return invalidFromErrorFactory(
      errorFactory,
      `${path} must use JSON-compatible primitive literals`,
    );
  }

  if (Array.isArray(condition)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} arrays must be wrapped in a condition operator or literal`,
    );
  }

  if (ancestors.has(condition)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must not contain cyclic condition data`,
    );
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(condition);

  const entries = Object.entries(condition);
  if (entries.length !== 1) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must contain exactly one condition operator`,
    );
  }

  const [[operator, operands]] = entries;
  if (operator === "var") {
    const result = validateComputedReferencePath({
      value: operands,
      path: `${path}.var`,
      errorFactory,
      variables,
      dependencies,
    });
    return result;
  }
  if (operator === "literal") {
    const result = validateComputedDataValue({
      value: operands,
      path: `${path}.literal`,
      errorFactory,
    });
    return result?.valid === false
      ? result
      : validComputedResult(getComputedValueType(operands));
  }
  if (operator === "call") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} function calls are not supported`,
    );
  }
  if (operator === "not") {
    const result = validateComputedCondition({
      condition: operands,
      path: `${path}.not`,
      errorFactory,
      variables,
      dependencies,
      isRoot: false,
      ancestors: nextAncestors,
    });
    return result?.valid === false ? result : validComputedResult("boolean");
  }

  const fixedOperandCount = COMPUTED_CONDITION_FIXED_OPERAND_COUNTS[operator];
  const isVariadic = COMPUTED_CONDITION_VARIADIC_OPERATORS.has(operator);
  if (fixedOperandCount === undefined && !isVariadic) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} contains unsupported condition operator '${operator}'`,
    );
  }
  if (!Array.isArray(operands)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.${operator} must be an operand array`,
    );
  }
  if (
    (fixedOperandCount !== undefined &&
      operands.length !== fixedOperandCount) ||
    (isVariadic && operands.length === 0)
  ) {
    const operandRequirement = isVariadic
      ? "at least one operand"
      : `exactly ${fixedOperandCount} operands`;
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.${operator} requires ${operandRequirement}`,
    );
  }

  const operandTypes = [];
  for (const [index, operand] of operands.entries()) {
    const result = validateComputedCondition({
      condition: operand,
      path: `${path}.${operator}[${index}]`,
      errorFactory,
      variables,
      dependencies,
      isRoot: false,
      ancestors: nextAncestors,
    });
    if (result?.valid === false) {
      return result;
    }
    operandTypes.push(result.valueType);
  }

  if (
    (operator === "add" || operator === "sub") &&
    operandTypes.some(
      (operandType) => operandType !== undefined && operandType !== "number",
    )
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.${operator} requires numeric operands`,
    );
  }

  return validComputedResult(
    operator === "add" || operator === "sub" ? "number" : "boolean",
  );
};

const validateComputedResultConfig = ({
  resultConfig,
  variableType,
  path,
  errorFactory,
  variables,
  dependencies,
  allowedKeys = ["expr", "value"],
}) => {
  if (!isPlainObject(resultConfig)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  {
    const result = validateAllowedKeys({
      value: resultConfig,
      allowedKeys,
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  const hasExpression = Object.hasOwn(resultConfig, "expr");
  const hasValue = Object.hasOwn(resultConfig, "value");
  if (hasExpression === hasValue) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must contain exactly one of expr or value`,
    );
  }

  if (hasValue) {
    const dataResult = validateComputedDataValue({
      value: resultConfig.value,
      path: `${path}.value`,
      errorFactory,
    });
    if (dataResult?.valid === false) {
      return dataResult;
    }
    return validateVariableTypedValue({
      value: resultConfig.value,
      variableType,
      path: `${path}.value`,
      errorFactory,
    });
  }

  const expressionResult = validateComputedExpression({
    expression: resultConfig.expr,
    path: `${path}.expr`,
    errorFactory,
    variables,
    dependencies,
  });
  if (expressionResult?.valid === false) {
    return expressionResult;
  }
  if (
    expressionResult.valueType !== undefined &&
    expressionResult.valueType !== variableType
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.expr must resolve to ${variableType}`,
    );
  }
  return VALID_RESULT;
};

const validateComputedExamples = ({ examples, path, errorFactory }) => {
  if (!Array.isArray(examples)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an array`);
  }

  const exampleIds = new Set();
  for (const [index, example] of examples.entries()) {
    const examplePath = `${path}[${index}]`;
    {
      const result = validateAllowedKeys({
        value: example,
        allowedKeys: ["id", "name", "input"],
        path: examplePath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(example.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${examplePath}.id must be a non-empty string`,
      );
    }
    if (exampleIds.has(example.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${examplePath}.id must be unique within examples`,
      );
    }
    exampleIds.add(example.id);

    if (Object.hasOwn(example, "name") && !isNonEmptyString(example.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${examplePath}.name must be a non-empty string`,
      );
    }

    if (!Object.hasOwn(example, "input")) {
      return invalidFromErrorFactory(
        errorFactory,
        `${examplePath}.input is required`,
      );
    }
    if (
      !isPlainObject(example.input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(example.input))
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${examplePath}.input must be an object`,
      );
    }
    {
      const result = validateAllowedKeys({
        value: example.input,
        allowedKeys: ["variables", "runtime"],
        path: `${examplePath}.input`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    for (const namespace of ["variables", "runtime"]) {
      if (!Object.hasOwn(example.input, namespace)) {
        continue;
      }
      const namespacePath = `${examplePath}.input.${namespace}`;
      if (!isPlainObject(example.input[namespace])) {
        return invalidFromErrorFactory(
          errorFactory,
          `${namespacePath} must be an object`,
        );
      }
      const result = validateComputedDataValue({
        value: example.input[namespace],
        path: namespacePath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  return VALID_RESULT;
};

const validateVariableComputedConfig = ({
  computed,
  variableType,
  path,
  errorFactory,
  variables,
  dependencies,
}) => {
  if (!isPlainObject(computed)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  if (Object.hasOwn(computed, "examples")) {
    const result = validateComputedExamples({
      examples: computed.examples,
      path: `${path}.examples`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.hasOwn(computed, "branches")) {
    {
      const result = validateAllowedKeys({
        value: computed,
        allowedKeys: ["branches", "default", "examples"],
        path,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
    if (!Array.isArray(computed.branches) || computed.branches.length === 0) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.branches must be a non-empty array`,
      );
    }
    if (!isPlainObject(computed.default)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.default must be an object`,
      );
    }

    for (const [index, branch] of computed.branches.entries()) {
      const branchPath = `${path}.branches[${index}]`;
      if (!isPlainObject(branch)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${branchPath} must be an object`,
        );
      }
      if (!Object.hasOwn(branch, "when")) {
        return invalidFromErrorFactory(
          errorFactory,
          `${branchPath}.when is required`,
        );
      }
      const conditionResult = validateComputedCondition({
        condition: branch.when,
        path: `${branchPath}.when`,
        errorFactory,
        variables,
        dependencies,
      });
      if (conditionResult?.valid === false) {
        return conditionResult;
      }
      const branchResult = validateComputedResultConfig({
        resultConfig: branch,
        variableType,
        path: branchPath,
        errorFactory,
        variables,
        dependencies,
        allowedKeys: ["when", "expr", "value"],
      });
      if (branchResult?.valid === false) {
        return branchResult;
      }
    }

    return validateComputedResultConfig({
      resultConfig: computed.default,
      variableType,
      path: `${path}.default`,
      errorFactory,
      variables,
      dependencies,
    });
  }

  return validateComputedResultConfig({
    resultConfig: computed,
    variableType,
    path,
    errorFactory,
    variables,
    dependencies,
    allowedKeys: ["expr", "value", "examples"],
  });
};

const validateComputedVariableGraph = ({ items, path, errorFactory }) => {
  const dependencyGraph = new Map();

  for (const [variableId, variable] of Object.entries(items)) {
    if (variable?.type !== "variable" || !Object.hasOwn(variable, "computed")) {
      continue;
    }

    const dependencies = new Set();
    const result = validateVariableComputedConfig({
      computed: variable.computed,
      variableType: variable.variableType,
      path: `${path}.${variableId}.computed`,
      errorFactory,
      variables: items,
      dependencies,
    });
    if (result?.valid === false) {
      return result;
    }
    dependencyGraph.set(variableId, dependencies);
  }

  const visited = new Set();
  for (const startVariableId of dependencyGraph.keys()) {
    if (visited.has(startVariableId)) {
      continue;
    }

    const frames = [
      {
        variableId: startVariableId,
        dependencies: [...(dependencyGraph.get(startVariableId) ?? [])],
        nextDependencyIndex: 0,
      },
    ];
    const activeIndexes = new Map([[startVariableId, 0]]);

    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame.nextDependencyIndex >= frame.dependencies.length) {
        frames.pop();
        activeIndexes.delete(frame.variableId);
        visited.add(frame.variableId);
        continue;
      }

      const dependencyId = frame.dependencies[frame.nextDependencyIndex];
      frame.nextDependencyIndex += 1;
      if (visited.has(dependencyId)) {
        continue;
      }

      const cycleStartIndex = activeIndexes.get(dependencyId);
      if (cycleStartIndex !== undefined) {
        const cycle = [
          ...frames.slice(cycleStartIndex).map(({ variableId }) => variableId),
          dependencyId,
        ].join(" -> ");
        return invalidFromErrorFactory(
          errorFactory,
          `${path} contains computed variable cycle: ${cycle}`,
        );
      }

      if (!dependencyGraph.has(dependencyId)) {
        visited.add(dependencyId);
        continue;
      }

      activeIndexes.set(dependencyId, frames.length);
      frames.push({
        variableId: dependencyId,
        dependencies: [...(dependencyGraph.get(dependencyId) ?? [])],
        nextDependencyIndex: 0,
      });
    }
  }

  return VALID_RESULT;
};

const validateVariableStoredOrComputedData = ({
  data,
  variableType,
  path,
  errorFactory,
}) => {
  const isComputed = Object.hasOwn(data, "computed");
  if (isComputed) {
    if (Object.hasOwn(data, "default") || Object.hasOwn(data, "value")) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path} computed variables must not contain default or value`,
      );
    }
    if (data.isEnum !== undefined || data.enumValues !== undefined) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path} computed variables must not contain enum metadata`,
      );
    }
    return validateVariableComputedConfig({
      computed: data.computed,
      variableType,
      path: `${path}.computed`,
      errorFactory,
    });
  }

  {
    const result = validateVariableTypedValue({
      value: data.default,
      variableType,
      path: `${path}.default`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
  return validateVariableTypedValue({
    value: data.value,
    variableType,
    path: `${path}.value`,
    errorFactory,
  });
};

const normalizeVariableEnumValues = (values = []) => {
  const normalizedValues = Array.isArray(values) ? values : [];
  const seen = new Set();
  const result = [];

  for (const value of normalizedValues) {
    const stringValue = String(value ?? "").trim();
    if (!stringValue || seen.has(stringValue)) {
      continue;
    }

    seen.add(stringValue);
    result.push(stringValue);
  }

  return result;
};

const validateVariableEnumValues = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!Array.isArray(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an array when provided`,
    );
  }

  for (const [index, enumValue] of value.entries()) {
    if (!isString(enumValue)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}[${index}] must be a string`,
      );
    }
  }

  return VALID_RESULT;
};

const validateVariableEnumMetadata = ({
  data,
  variableType,
  path,
  errorFactory,
}) => {
  if (data.isEnum !== undefined && typeof data.isEnum !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.isEnum must be a boolean when provided`,
    );
  }

  {
    const result = validateVariableEnumValues({
      value: data.enumValues,
      path: `${path}.enumValues`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    variableType !== "string" &&
    (data.isEnum !== undefined || data.enumValues !== undefined)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.isEnum and ${path}.enumValues are only supported for string variables`,
    );
  }

  return VALID_RESULT;
};

const validateVariableItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;
    const itemType = item?.type;
    const variableType = item?.variableType;

    if (itemId === "__proto__") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath} uses reserved variable id '__proto__'`,
      );
    }

    if (itemType !== "folder" && itemType !== "variable") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'variable'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          itemType === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "variableType",
                "name",
                "description",
                "tagIds",
                "scope",
                "default",
                "value",
                "isEnum",
                "enumValues",
                "computed",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (itemType === "variable") {
      if (!VARIABLE_TYPE_KEYS.includes(variableType)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.variableType must be 'string', 'number', 'boolean', or 'object'`,
        );
      }

      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateVariableEnumMetadata({
          data: item,
          variableType,
          path: itemPath,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (item.computed !== undefined) {
        if (item.scope !== undefined) {
          return invalidFromErrorFactory(
            errorFactory,
            `${itemPath}.scope must be omitted for computed variables`,
          );
        }
      } else if (!VARIABLE_SCOPE_KEYS.includes(item.scope)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.scope must be 'context', 'device', or 'account'`,
        );
      }

      {
        const result = validateVariableStoredOrComputedData({
          data: item,
          variableType,
          path: itemPath,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }

  return validateComputedVariableGraph({
    items,
    path,
    errorFactory,
  });
};

const validateTextStyleShadow = ({ shadow, path, errorFactory }) => {
  if (!isPlainObject(shadow)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  {
    const result = validateAllowedKeys({
      value: shadow,
      allowedKeys: ["colorId", "alpha", "blur", "offsetX", "offsetY"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(shadow.colorId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.colorId must be a non-empty string`,
    );
  }

  if (
    shadow.alpha !== undefined &&
    (!isFiniteNumber(shadow.alpha) || shadow.alpha < 0 || shadow.alpha > 1)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.alpha must be a finite number between 0 and 1 when provided`,
    );
  }

  if (
    shadow.blur !== undefined &&
    (!isFiniteNumber(shadow.blur) || shadow.blur < 0)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.blur must be a non-negative finite number when provided`,
    );
  }

  for (const key of ["offsetX", "offsetY"]) {
    if (shadow[key] !== undefined && !isFiniteNumber(shadow[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a finite number when provided`,
      );
    }
  }
};

const validateTextStyleItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "textStyle") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'textStyle'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "fontId",
                "colorId",
                "fontSize",
                "lineHeight",
                "fontWeight",
                "previewText",
                "fontStyle",
                "breakWords",
                "align",
                "wordWrap",
                "wordWrapWidth",
                "strokeColorId",
                "strokeAlpha",
                "strokeWidth",
                "shadow",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "textStyle") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredStringOrUniqueIdArray({
          value: item.fontId,
          path: `${itemPath}.fontId`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(item.colorId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.colorId must be a non-empty string`,
        );
      }

      if (!isFiniteNumber(item.fontSize)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fontSize must be a finite number`,
        );
      }

      if (!isFiniteNumber(item.lineHeight)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.lineHeight must be a finite number`,
        );
      }

      if (!isNonEmptyString(item.fontWeight)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fontWeight must be a non-empty string`,
        );
      }

      if (item.previewText !== undefined && !isString(item.previewText)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.previewText must be a string when provided`,
        );
      }

      if (item.fontStyle !== undefined && !isString(item.fontStyle)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fontStyle must be a string when provided`,
        );
      }

      if (
        item.breakWords !== undefined &&
        typeof item.breakWords !== "boolean"
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.breakWords must be a boolean when provided`,
        );
      }

      if (
        item.align !== undefined &&
        !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(item.align)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.align must be 'left', 'center', or 'right' when provided`,
        );
      }

      if (item.wordWrap !== undefined && typeof item.wordWrap !== "boolean") {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.wordWrap must be a boolean when provided`,
        );
      }

      if (
        item.wordWrapWidth !== undefined &&
        !isFiniteNumber(item.wordWrapWidth)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.wordWrapWidth must be a finite number when provided`,
        );
      }

      if (
        item.strokeColorId !== undefined &&
        !isNonEmptyString(item.strokeColorId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.strokeColorId must be a non-empty string when provided`,
        );
      }

      if (item.strokeAlpha !== undefined && !isFiniteNumber(item.strokeAlpha)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.strokeAlpha must be a finite number when provided`,
        );
      }

      if (item.strokeWidth !== undefined && !isFiniteNumber(item.strokeWidth)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.strokeWidth must be a finite number when provided`,
        );
      }

      if (item.shadow !== undefined) {
        const result = validateTextStyleShadow({
          shadow: item.shadow,
          path: `${itemPath}.shadow`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateCharacterSpriteItems = ({
  items,
  path,
  errorFactory,
  allowTagIds = true,
}) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "image") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'image'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                ...(allowTagIds ? ["tagIds"] : []),
                "thumbnailFileId",
                "fileId",
                "width",
                "height",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "image") {
      if (allowTagIds) {
        {
          const result = validateOptionalUniqueIdArray({
            value: item.tagIds,
            path: `${itemPath}.tagIds`,
            errorFactory,
            allowEmpty: false,
          });
          if (result?.valid === false) {
            return result;
          }
        }
      }

      if (
        item.thumbnailFileId !== undefined &&
        !isNonEmptyString(item.thumbnailFileId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.thumbnailFileId must be a non-empty string when provided`,
        );
      }

      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string`,
        );
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.width must be a finite number when provided`,
        );
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.height must be a finite number when provided`,
        );
      }
    }
  }
};

const validateLayoutElementTextStyle = ({ textStyle, path, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: textStyle,
      allowedKeys: ["align", "wordWrapWidth"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    textStyle.align !== undefined &&
    !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(textStyle.align)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.align must be 'left', 'center', or 'right' when provided`,
    );
  }

  if (
    textStyle.wordWrapWidth !== undefined &&
    !isFiniteNumber(textStyle.wordWrapWidth)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.wordWrapWidth must be a finite number when provided`,
    );
  }
};

const validateLayoutElementBorder = ({ border, path, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: border,
      allowedKeys: ["color", "alpha", "width"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (border.color !== undefined && !isString(border.color)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.color must be a string when provided`,
    );
  }

  if (
    border.alpha !== undefined &&
    (!isFiniteNumber(border.alpha) || border.alpha < 0 || border.alpha > 1)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.alpha must be a finite number between 0 and 1 when provided`,
    );
  }

  if (
    border.width !== undefined &&
    (!isFiniteNumber(border.width) || border.width < 0)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.width must be a finite number greater than or equal to 0 when provided`,
    );
  }
};

const validateLayoutElementInteraction = ({
  interaction,
  path,
  errorFactory,
}) => {
  if (!isPlainObject(interaction)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  if (
    interaction.inheritToChildren !== undefined &&
    typeof interaction.inheritToChildren !== "boolean"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.inheritToChildren must be a boolean when provided`,
    );
  }
};

const validateLayoutElementBlur = ({ blur, path, errorFactory }) => {
  if (!isPlainObject(blur)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  {
    const result = validateAllowedKeys({
      value: blur,
      allowedKeys: ["x", "y", "quality", "kernelSize", "repeatEdgePixels"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  for (const key of ["x", "y", "quality"]) {
    if (blur[key] !== undefined && !isFiniteNumber(blur[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a finite number when provided`,
      );
    }
  }

  if (
    blur.kernelSize !== undefined &&
    !LAYOUT_ELEMENT_BLUR_KERNEL_SIZE_OPTIONS.includes(blur.kernelSize)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.kernelSize must be one of ${LAYOUT_ELEMENT_BLUR_KERNEL_SIZE_OPTIONS.join(", ")} when provided`,
    );
  }

  if (
    blur.repeatEdgePixels !== undefined &&
    typeof blur.repeatEdgePixels !== "boolean"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.repeatEdgePixels must be a boolean when provided`,
    );
  }
};

const LAYOUT_TEXT_REVEAL_INDICATOR_ELEMENT_TYPES = [
  "text-revealing",
  "text-revealing-ref-dialogue-content",
];

const validateLayoutTextRevealIndicatorVisual = ({
  visual,
  path,
  errorFactory,
}) => {
  if (!isPlainObject(visual)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  {
    const result = validateAllowedKeys({
      value: visual,
      allowedKeys: [
        "kind",
        "imageId",
        "resourceId",
        "animationName",
        "width",
        "height",
        "offsetX",
        "offsetY",
      ],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  const kind =
    visual.kind === "spritesheet" ||
    visual.resourceId !== undefined ||
    visual.animationName !== undefined
      ? "spritesheet"
      : "image";

  if (
    visual.kind !== undefined &&
    visual.kind !== "image" &&
    visual.kind !== "spritesheet"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.kind must be 'image' or 'spritesheet' when provided`,
    );
  }

  if (kind === "image" && !isNonEmptyString(visual.imageId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.imageId must be a non-empty string`,
    );
  }

  if (kind === "spritesheet") {
    if (!isNonEmptyString(visual.resourceId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.resourceId must be a non-empty string`,
      );
    }

    if (!isNonEmptyString(visual.animationName)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.animationName must be a non-empty string`,
      );
    }
  }

  for (const key of ["width", "height"]) {
    if (
      visual[key] !== undefined &&
      (!isFiniteNumber(visual[key]) || visual[key] <= 0)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a finite number greater than 0 when provided`,
      );
    }
  }

  for (const key of ["offsetX", "offsetY"]) {
    if (visual[key] !== undefined && !isFiniteNumber(visual[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a finite number when provided`,
      );
    }
  }
};

const validateLayoutTextRevealIndicator = ({
  indicator,
  path,
  errorFactory,
}) => {
  if (!isPlainObject(indicator)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  {
    const result = validateAllowedKeys({
      value: indicator,
      allowedKeys: ["revealing", "complete", "offsetX", "offsetY"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  for (const key of ["revealing", "complete"]) {
    if (indicator[key] !== undefined) {
      const result = validateLayoutTextRevealIndicatorVisual({
        visual: indicator[key],
        path: `${path}.${key}`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  for (const key of ["offsetX", "offsetY"]) {
    if (indicator[key] !== undefined && !isFiniteNumber(indicator[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a finite number when provided`,
      );
    }
  }
};

const validateLayoutTextContent = ({ content, path, errorFactory }) => {
  if (!Array.isArray(content)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an array when provided`,
    );
  }

  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    const itemPath = `${path}[${index}]`;

    if (!isPlainObject(item)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath} must be an object`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys: ["text", "reference"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    const hasText = Object.hasOwn(item, "text");
    const hasReference = Object.hasOwn(item, "reference");

    if (hasText === hasReference) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath} must include exactly one of text or reference`,
      );
    }

    if (hasText) {
      if (!isString(item.text)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.text must be a string`,
        );
      }
      continue;
    }

    if (!isPlainObject(item.reference)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.reference must be an object`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item.reference,
        allowedKeys: ["resourceId"],
        path: `${itemPath}.reference`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.reference.resourceId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.reference.resourceId must be a non-empty string`,
      );
    }
  }
};

const getLayoutTextContentReferenceEntries = (content) => {
  if (!Array.isArray(content)) {
    return [];
  }

  const entries = [];
  for (let index = 0; index < content.length; index += 1) {
    const resourceId = content[index]?.reference?.resourceId;
    if (resourceId !== undefined) {
      entries.push({
        index,
        resourceId,
      });
    }
  }
  return entries;
};

const validateLayoutElementData = ({
  data,
  path,
  errorFactory,
  allowPartial = false,
}) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  const allowedKeys = [
    "type",
    "name",
    "x",
    "y",
    "width",
    "height",
    "aspectRatioLock",
    "anchorX",
    "anchorY",
    "scaleX",
    "scaleY",
    "rotation",
    "hidden",
    "opacity",
    "blur",
    "fill",
    "border",
    "text",
    "content",
    "dateFormat",
    "textStyle",
    "displaySpeed",
    "revealEffect",
    "indicator",
    "resourceId",
    "animationName",
    "imageId",
    "hoverImageId",
    "clickImageId",
    "hoverSoundId",
    "clickSoundId",
    "revealSoundId",
    "revealSoundStopTiming",
    "textStyleId",
    "hoverTextStyleId",
    "clickTextStyleId",
    "field",
    "value",
    "placeholder",
    "multiline",
    "disabled",
    "maxLength",
    "formRole",
    "padding",
    "conditionalOverrides",
    "direction",
    "gapX",
    "gapY",
    "containerType",
    "scroll",
    "hover",
    "click",
    "rightClick",
    "scrollUp",
    "scrollDown",
    "submit",
    "focusEvent",
    "blurEvent",
    "selectionChange",
    "compositionStart",
    "compositionUpdate",
    "compositionEnd",
    "anchorToBottom",
    "thumbImageId",
    "barImageId",
    "hoverThumbImageId",
    "hoverBarImageId",
    "min",
    "max",
    "step",
    "initialValue",
    "variableId",
    "particleId",
    "fragmentLayoutId",
    "paginationMode",
    "paginationVariableId",
    "paginationSize",
    "choiceItemIndex",
    "$when",
    "change",
  ];

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys,
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!allowPartial || data.type !== undefined) {
    if (!LAYOUT_ELEMENT_BASE_TYPES.includes(data.type)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.type must be a supported layout element type`,
      );
    }
  }

  if (!allowPartial || data.name !== undefined) {
    if (!isNonEmptyString(data.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.name must be a non-empty string`,
      );
    }
  }

  if (
    data.dateFormat !== undefined &&
    !SAVE_LOAD_DATE_FORMATS.has(data.dateFormat)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.dateFormat must be one of ${Array.from(SAVE_LOAD_DATE_FORMATS).join(", ")} when provided`,
    );
  }

  if (
    data.dateFormat !== undefined &&
    data.type !== undefined &&
    data.type !== "text-ref-save-load-slot-date"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.dateFormat can only be provided for save/load date elements`,
    );
  }

  if (data.hidden !== undefined && typeof data.hidden !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.hidden must be a boolean when provided`,
    );
  }

  for (const key of [
    "x",
    "y",
    "width",
    "height",
    "anchorX",
    "anchorY",
    "scaleX",
    "scaleY",
    "rotation",
    "displaySpeed",
    "gapX",
    "gapY",
    "min",
    "max",
    "step",
    "paginationSize",
    "choiceItemIndex",
    "opacity",
    "maxLength",
  ]) {
    if (data[key] !== undefined && !isFiniteNumber(data[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a finite number when provided`,
      );
    }
  }

  if (
    data.choiceItemIndex !== undefined &&
    (!Number.isInteger(data.choiceItemIndex) ||
      data.choiceItemIndex < 0 ||
      data.choiceItemIndex > 19)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.choiceItemIndex must be an integer between 0 and 19 when provided`,
    );
  }

  if (
    data.aspectRatioLock !== undefined &&
    (!isFiniteNumber(data.aspectRatioLock) || data.aspectRatioLock <= 0)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.aspectRatioLock must be a finite number greater than 0 when provided`,
    );
  }

  if (
    data.initialValue !== undefined &&
    !isFiniteNumber(data.initialValue) &&
    !isString(data.initialValue)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.initialValue must be a finite number or string when provided`,
    );
  }

  if (
    data.opacity !== undefined &&
    (!isFiniteNumber(data.opacity) || data.opacity < 0 || data.opacity > 1)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.opacity must be a finite number between 0 and 1 when provided`,
    );
  }

  if (data.blur !== undefined) {
    {
      const result = validateLayoutElementBlur({
        blur: data.blur,
        path: `${path}.blur`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (data.type !== undefined && data.type !== "sprite") {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.blur can only be provided for sprite elements`,
      );
    }
  }

  if (data.content !== undefined) {
    {
      const result = validateLayoutTextContent({
        content: data.content,
        path: `${path}.content`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (
      data.type !== undefined &&
      !LAYOUT_TEXT_CONTENT_ELEMENT_TYPES.includes(data.type)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.content can only be provided for text elements`,
      );
    }
  }

  if (data.indicator !== undefined) {
    {
      const result = validateLayoutTextRevealIndicator({
        indicator: data.indicator,
        path: `${path}.indicator`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (
      data.type !== undefined &&
      !LAYOUT_TEXT_REVEAL_INDICATOR_ELEMENT_TYPES.includes(data.type)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.indicator can only be provided for text revealing elements`,
      );
    }
  }

  for (const key of [
    "text",
    "resourceId",
    "animationName",
    "particleId",
    "imageId",
    "hoverImageId",
    "clickImageId",
    "hoverSoundId",
    "clickSoundId",
    "revealSoundId",
    "revealSoundStopTiming",
    "textStyleId",
    "hoverTextStyleId",
    "clickTextStyleId",
    "field",
    "value",
    "placeholder",
    "containerType",
    "variableId",
    "fragmentLayoutId",
    "paginationMode",
    "paginationVariableId",
    "revealEffect",
    "thumbImageId",
    "barImageId",
    "hoverThumbImageId",
    "hoverBarImageId",
    "$when",
  ]) {
    if (data[key] !== undefined && !isString(data[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a string when provided`,
      );
    }
  }

  if (data.type === "spritesheet-animation") {
    if (
      (!allowPartial || data.resourceId !== undefined) &&
      !isNonEmptyString(data.resourceId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.resourceId must be a non-empty string`,
      );
    }

    if (
      (!allowPartial || data.animationName !== undefined) &&
      !isNonEmptyString(data.animationName)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.animationName must be a non-empty string`,
      );
    }
  }

  if (data.type === "particle") {
    if (
      (!allowPartial || data.particleId !== undefined) &&
      !isNonEmptyString(data.particleId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.particleId must be a non-empty string`,
      );
    }
  }

  if (data.type === "input") {
    if (
      (!allowPartial || data.field !== undefined) &&
      !isNonEmptyString(data.field)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.field must be a non-empty string`,
      );
    }
  }

  if (data.conditionalOverrides !== undefined) {
    if (!Array.isArray(data.conditionalOverrides)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.conditionalOverrides must be an array when provided`,
      );
    }

    for (let index = 0; index < data.conditionalOverrides.length; index += 1) {
      const rule = data.conditionalOverrides[index];
      const rulePath = `${path}.conditionalOverrides.${index}`;

      if (!isPlainObject(rule)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath} must be an object`,
        );
      }

      {
        const result = validateAllowedKeys({
          value: rule,
          allowedKeys: ["when", "set"],
          path: rulePath,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isPlainObject(rule.when)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.when must be an object`,
        );
      }

      {
        const result = validateAllowedKeys({
          value: rule.when,
          allowedKeys: ["target", "op", "value"],
          path: `${rulePath}.when`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(rule.when.target)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.when.target must be a non-empty string`,
        );
      }

      if (!parseLayoutConditionTarget(rule.when.target)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.when.target must be a supported layout condition target`,
        );
      }

      if (
        !isString(rule.when.value) &&
        typeof rule.when.value !== "boolean" &&
        !isFiniteNumber(rule.when.value)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.when.value must be a string, boolean, or finite number`,
        );
      }

      if (rule.when.op !== "eq") {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.when.op must be "eq"`,
        );
      }

      if (!isPlainObject(rule.set)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.set must be an object`,
        );
      }

      {
        const result = validateAllowedKeys({
          value: rule.set,
          allowedKeys: [
            "textStyleId",
            "hoverTextStyleId",
            "clickTextStyleId",
            "imageId",
            "hoverImageId",
            "clickImageId",
            "hoverSoundId",
            "clickSoundId",
            "opacity",
            "anchorX",
            "anchorY",
            "visible",
            "textStyle",
          ],
          path: `${rulePath}.set`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      for (const field of [
        "textStyleId",
        "hoverTextStyleId",
        "clickTextStyleId",
        "imageId",
        "hoverImageId",
        "clickImageId",
        "hoverSoundId",
        "clickSoundId",
      ]) {
        if (
          rule.set[field] !== undefined &&
          !isNonEmptyString(rule.set[field])
        ) {
          return invalidFromErrorFactory(
            errorFactory,
            `${rulePath}.set.${field} must be a non-empty string when provided`,
          );
        }
      }

      if (
        rule.set.opacity !== undefined &&
        (!isFiniteNumber(rule.set.opacity) ||
          rule.set.opacity < 0 ||
          rule.set.opacity > 1)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.set.opacity must be a finite number between 0 and 1 when provided`,
        );
      }

      for (const field of ["anchorX", "anchorY"]) {
        if (rule.set[field] !== undefined && !isFiniteNumber(rule.set[field])) {
          return invalidFromErrorFactory(
            errorFactory,
            `${rulePath}.set.${field} must be a finite number when provided`,
          );
        }
      }

      if (
        rule.set.visible !== undefined &&
        typeof rule.set.visible !== "boolean"
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${rulePath}.set.visible must be a boolean when provided`,
        );
      }

      if (rule.set.textStyle !== undefined) {
        if (!isPlainObject(rule.set.textStyle)) {
          return invalidFromErrorFactory(
            errorFactory,
            `${rulePath}.set.textStyle must be an object when provided`,
          );
        }

        {
          const result = validateLayoutElementTextStyle({
            textStyle: rule.set.textStyle,
            path: `${rulePath}.set.textStyle`,
            errorFactory,
          });
          if (result?.valid === false) {
            return result;
          }
        }
      }
    }
  }

  if (data.fill !== undefined && !isString(data.fill)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.fill must be a string when provided`,
    );
  }

  if (
    data.revealEffect !== undefined &&
    !LAYOUT_TEXT_REVEAL_EFFECT_KEYS.includes(data.revealEffect)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.revealEffect must be one of ${LAYOUT_TEXT_REVEAL_EFFECT_KEYS.join(", ")} when provided`,
    );
  }

  if (
    data.revealSoundStopTiming !== undefined &&
    !LAYOUT_TEXT_REVEAL_SOUND_STOP_TIMING_KEYS.includes(
      data.revealSoundStopTiming,
    )
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.revealSoundStopTiming must be one of ${LAYOUT_TEXT_REVEAL_SOUND_STOP_TIMING_KEYS.join(", ")} when provided`,
    );
  }

  if (data.formRole !== undefined && data.formRole !== "submit") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.formRole must be 'submit' when provided`,
    );
  }

  if (
    data.direction !== undefined &&
    data.direction !== "absolute" &&
    data.direction !== "horizontal" &&
    data.direction !== "vertical"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.direction must be 'absolute', 'horizontal' or 'vertical' when provided`,
    );
  }

  if (
    data.paginationMode !== undefined &&
    data.paginationMode !== "continuous" &&
    data.paginationMode !== "paginated"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.paginationMode must be 'continuous' or 'paginated' when provided`,
    );
  }

  if (data.scroll !== undefined && typeof data.scroll !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.scroll must be a boolean when provided`,
    );
  }

  if (data.hover !== undefined) {
    {
      const result = validateLayoutElementInteraction({
        interaction: data.hover,
        path: `${path}.hover`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (data.click !== undefined) {
    {
      const result = validateLayoutElementInteraction({
        interaction: data.click,
        path: `${path}.click`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (data.rightClick !== undefined) {
    {
      const result = validateLayoutElementInteraction({
        interaction: data.rightClick,
        path: `${path}.rightClick`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (data.scrollUp !== undefined) {
    {
      const result = validateLayoutElementInteraction({
        interaction: data.scrollUp,
        path: `${path}.scrollUp`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (data.scrollDown !== undefined) {
    {
      const result = validateLayoutElementInteraction({
        interaction: data.scrollDown,
        path: `${path}.scrollDown`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  for (const key of [
    "submit",
    "focusEvent",
    "blurEvent",
    "selectionChange",
    "compositionStart",
    "compositionUpdate",
    "compositionEnd",
  ]) {
    if (data[key] !== undefined) {
      const result = validateLayoutElementInteraction({
        interaction: data[key],
        path: `${path}.${key}`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (
    data.anchorToBottom !== undefined &&
    typeof data.anchorToBottom !== "boolean"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.anchorToBottom must be a boolean when provided`,
    );
  }

  for (const key of ["multiline", "disabled"]) {
    if (data[key] !== undefined && typeof data[key] !== "boolean") {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be a boolean when provided`,
      );
    }
  }

  if (data.maxLength !== undefined && data.maxLength < 0) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.maxLength must be a finite number greater than or equal to 0 when provided`,
    );
  }

  if (
    data.padding !== undefined &&
    !isFiniteNumber(data.padding) &&
    !isPlainObject(data.padding)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.padding must be a finite number or object when provided`,
    );
  }

  if (data.textStyle !== undefined) {
    {
      const result = validateLayoutElementTextStyle({
        textStyle: data.textStyle,
        path: `${path}.textStyle`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (data.border !== undefined) {
    if (!isPlainObject(data.border)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.border must be an object when provided`,
      );
    }

    {
      const result = validateLayoutElementBorder({
        border: data.border,
        path: `${path}.border`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (data.change !== undefined && !isPlainObject(data.change)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.change must be an object when provided`,
    );
  }
};

const validateLayoutElementItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys: [
          "id",
          "type",
          "name",
          "x",
          "y",
          "width",
          "height",
          "aspectRatioLock",
          "anchorX",
          "anchorY",
          "scaleX",
          "scaleY",
          "rotation",
          "hidden",
          "opacity",
          "blur",
          "fill",
          "border",
          "text",
          "content",
          "dateFormat",
          "textStyle",
          "displaySpeed",
          "revealEffect",
          "indicator",
          "resourceId",
          "animationName",
          "particleId",
          "imageId",
          "hoverImageId",
          "clickImageId",
          "hoverSoundId",
          "clickSoundId",
          "revealSoundId",
          "revealSoundStopTiming",
          "textStyleId",
          "hoverTextStyleId",
          "clickTextStyleId",
          "field",
          "value",
          "placeholder",
          "multiline",
          "disabled",
          "maxLength",
          "formRole",
          "padding",
          "conditionalOverrides",
          "direction",
          "gapX",
          "gapY",
          "containerType",
          "scroll",
          "hover",
          "click",
          "rightClick",
          "scrollUp",
          "scrollDown",
          "submit",
          "focusEvent",
          "blurEvent",
          "selectionChange",
          "compositionStart",
          "compositionUpdate",
          "compositionEnd",
          "anchorToBottom",
          "thumbImageId",
          "barImageId",
          "hoverThumbImageId",
          "hoverBarImageId",
          "min",
          "max",
          "step",
          "initialValue",
          "variableId",
          "fragmentLayoutId",
          "paginationMode",
          "paginationVariableId",
          "paginationSize",
          "choiceItemIndex",
          "$when",
          "change",
        ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    {
      const result = validateLayoutElementData({
        data: Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== "id"),
        ),
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateCharacterItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "character") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'character'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "spriteGroups",
                "shortcut",
                "nameVariableId",
                "fileId",
                "sprites",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "character") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateCharacterSpriteGroups({
          value: item.spriteGroups,
          path: `${itemPath}.spriteGroups`,
          errorFactory,
          allowEmpty: false,
          allowMissingId: true,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (item.shortcut !== undefined && !isString(item.shortcut)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.shortcut must be a string when provided`,
        );
      }

      if (
        item.nameVariableId !== undefined &&
        !isNonEmptyString(item.nameVariableId)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.nameVariableId must be a non-empty string when provided`,
        );
      }

      if (item.fileId !== undefined && !isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.fileId must be a non-empty string when provided`,
        );
      }

      {
        const result = validateNestedCollection({
          collection: item.sprites,
          path: `${itemPath}.sprites`,
          itemValidator: validateCharacterSpriteItems,
          treeValidator: validateGenericFolderOwnership,
          treeNodeLabel: "sprite",
          folderLabel: "folder sprite item",
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateTagItems = ({ items, path, errorFactory }) => {
  const seenNames = new Set();

  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "tag") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'tag'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys: ["id", "type", "name", "color"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.color !== undefined && !isHexColor(item.color)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.color must be a hex color when provided`,
      );
    }

    const normalizedName = item.name.trim().toLowerCase();
    if (seenNames.has(normalizedName)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be unique within its tag scope`,
      );
    }

    seenNames.add(normalizedName);
  }
};

const validateFlatTagTree = ({ nodes, path, errorFactory }) => {
  const visitNodes = (entries, entryPath) => {
    if (!Array.isArray(entries)) {
      return VALID_RESULT;
    }

    for (const [index, node] of entries.entries()) {
      if (Object.hasOwn(node, "children")) {
        return invalidFromErrorFactory(
          errorFactory,
          `${entryPath}[${index}].children is not allowed`,
        );
      }
    }

    return VALID_RESULT;
  };

  return visitNodes(nodes, path);
};

const validateTagCreateData = ({
  data,
  path = "payload.data",
  errorFactory = createPayloadValidationError,
}) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["type", "name", "color"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data?.type !== "tag") {
    return invalidFromErrorFactory(errorFactory, `${path}.type must be 'tag'`);
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.name must be a non-empty string`,
    );
  }

  if (data.color !== undefined && !isHexColor(data.color)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.color must be a hex color when provided`,
    );
  }
};

const validateTagUpdateData = ({
  data,
  path = "payload.data",
  errorFactory = createPayloadValidationError,
}) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["name", "color"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must include at least one field`,
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.name must be a non-empty string when provided`,
    );
  }

  if (
    data.color !== undefined &&
    data.color !== null &&
    !isHexColor(data.color)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.color must be a hex color or null when provided`,
    );
  }
};

const validateTagsRoot = ({ state, tags, path, errorFactory }) => {
  if (!isPlainObject(tags)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  for (const scopeKey of Object.keys(tags)) {
    if (
      !isBaseTagScopeKey(scopeKey) &&
      !isCharacterSpriteTagScopeKey(scopeKey)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${scopeKey} is not allowed`,
      );
    }
  }

  for (const scopeKey of TAG_SCOPE_BASE_KEYS) {
    if (!Object.hasOwn(tags, scopeKey)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${scopeKey} is required`,
      );
    }
  }

  for (const [scopeKey, collection] of Object.entries(tags)) {
    {
      const result = validateNestedCollection({
        collection,
        path: `${path}.${scopeKey}`,
        itemValidator: validateTagItems,
        treeValidator: validateFlatTagTree,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isCharacterSpriteTagScopeKey(scopeKey)) {
      continue;
    }

    const characterId = getCharacterSpriteTagScopeCharacterId(scopeKey);
    const character = state.characters?.items?.[characterId];
    if (!isPlainObject(character) || character.type !== "character") {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${scopeKey} must reference an existing character`,
      );
    }
  }
};

const getTagScopeCollection = ({ state, scopeKey }) => state.tags?.[scopeKey];

const validateTagScopeKey = ({ scopeKey, path, errorFactory }) => {
  if (!isNonEmptyString(scopeKey)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be a non-empty string`,
    );
  }

  if (isBaseTagScopeKey(scopeKey) || isCharacterSpriteTagScopeKey(scopeKey)) {
    return VALID_RESULT;
  }

  return invalidFromErrorFactory(
    errorFactory,
    `${path} must be a supported tag scope key`,
  );
};

const validateTagScopeAgainstState = ({
  state,
  scopeKey,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  const scopeKeyResult = validateTagScopeKey({
    scopeKey,
    path,
    errorFactory,
  });
  if (!scopeKeyResult.valid) {
    return scopeKeyResult;
  }

  if (!isCharacterSpriteTagScopeKey(scopeKey)) {
    return VALID_RESULT;
  }

  const characterId = getCharacterSpriteTagScopeCharacterId(scopeKey);
  const character = state.characters?.items?.[characterId];
  if (!isPlainObject(character) || character.type !== "character") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must reference an existing character sprite tag scope`,
      {
        ...details,
        characterId,
        scopeKey,
      },
    );
  }

  return VALID_RESULT;
};

const validateTagIdsAgainstScope = ({
  state,
  tagIds,
  scopeKey,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (tagIds === undefined) {
    return VALID_RESULT;
  }

  const scopeResult = validateTagScopeAgainstState({
    state,
    scopeKey,
    path,
    details,
    errorFactory,
  });
  if (!scopeResult.valid) {
    return scopeResult;
  }

  const collection = getTagScopeCollection({ state, scopeKey });
  for (const [index, tagId] of tagIds.entries()) {
    const tag = collection?.items?.[tagId];
    if (!isPlainObject(tag) || tag.type !== "tag") {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}[${index}] must reference an existing tag in scope '${scopeKey}'`,
        {
          ...details,
          scopeKey,
          tagId,
        },
      );
    }
  }

  return VALID_RESULT;
};

const validateCharacterSpriteGroupsAgainstScope = ({
  state,
  spriteGroups,
  scopeKey,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (spriteGroups === undefined) {
    return VALID_RESULT;
  }

  for (const [index, spriteGroup] of spriteGroups.entries()) {
    const result = validateTagIdsAgainstScope({
      state,
      tagIds: spriteGroup.tags,
      scopeKey,
      path: `${path}[${index}].tags`,
      details: {
        ...details,
        spriteGroupIndex: index,
        spriteGroupName: spriteGroup.name,
      },
      errorFactory,
    });
    if (!result.valid) {
      return result;
    }
  }

  return VALID_RESULT;
};

const validateUniqueTagNameInScope = ({
  collection,
  name,
  path,
  excludeTagId,
  errorFactory = createPreconditionValidationError,
}) => {
  const normalizedName = name.trim().toLowerCase();

  for (const [tagId, tag] of Object.entries(collection?.items || {})) {
    if (tagId === excludeTagId || tag?.type !== "tag") {
      continue;
    }

    if (tag.name?.trim?.().toLowerCase?.() === normalizedName) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path} must be unique within its tag scope`,
      );
    }
  }

  return VALID_RESULT;
};

const ensureTagScopeCollection = ({ state, scopeKey }) => {
  state.tags ??= createEmptyTagsState();
  state.tags[scopeKey] ??= createEmptyCollectionState();
  return state.tags[scopeKey];
};

const assignOptionalTagIds = ({ target, tagIds }) => {
  if (Array.isArray(tagIds) && tagIds.length > 0) {
    target.tagIds = structuredClone(tagIds);
  }
};

const assignOptionalCharacterSpriteGroups = ({ target, spriteGroups }) => {
  if (Array.isArray(spriteGroups) && spriteGroups.length > 0) {
    target.spriteGroups = structuredClone(spriteGroups);
  }
};

const applyTagIdsUpdate = ({ currentItem, data }) => {
  const nextData = structuredClone(data);
  if (nextData.tagIds === undefined) {
    delete nextData.tagIds;
  }

  const nextItem = {
    ...structuredClone(currentItem),
    ...nextData,
  };

  if (data.tagIds !== undefined) {
    if (Array.isArray(data.tagIds) && data.tagIds.length > 0) {
      nextItem.tagIds = structuredClone(data.tagIds);
    } else {
      delete nextItem.tagIds;
    }
  }

  return nextItem;
};

const applyTextStyleUpdate = ({ currentItem, data }) => {
  const nextData = structuredClone(data);
  delete nextData.clearShadow;

  const nextItem = applyTagIdsUpdate({
    currentItem,
    data: nextData,
  });

  if (data.clearShadow === true) {
    delete nextItem.shadow;
  }

  return nextItem;
};

const applyCharacterUpdate = ({ currentItem, data }) => {
  const nextItem = applyTagIdsUpdate({
    currentItem,
    data,
  });

  if (data.spriteGroups !== undefined) {
    if (Array.isArray(data.spriteGroups) && data.spriteGroups.length > 0) {
      nextItem.spriteGroups = structuredClone(data.spriteGroups);
    } else {
      delete nextItem.spriteGroups;
    }
  }

  if (
    Object.hasOwn(data, "nameVariableId") &&
    (data.nameVariableId === undefined || data.nameVariableId === "")
  ) {
    delete nextItem.nameVariableId;
  }

  return nextItem;
};

const applyVariableEnumMetadata = ({ item, data }) => {
  if (!isPlainObject(item)) {
    return item;
  }

  const enumEnabled =
    item.variableType === "string" &&
    data.isEnum !== false &&
    (data.isEnum === true ||
      data.enumValues !== undefined ||
      (data.isEnum === undefined && item.isEnum === true));

  if (!enumEnabled) {
    delete item.isEnum;
    delete item.enumValues;
    return item;
  }

  item.isEnum = true;
  item.enumValues = normalizeVariableEnumValues(
    data.enumValues ?? item.enumValues,
  );

  return item;
};

const applyVariableUpdate = ({ currentItem, data }) => {
  const nextItem = applyTagIdsUpdate({
    currentItem,
    data,
  });

  return applyVariableEnumMetadata({
    item: nextItem,
    data,
  });
};

const stripDeletedTagIdsFromItem = ({ item, deletedTagIds }) => {
  if (!Array.isArray(item?.tagIds) || item.tagIds.length === 0) {
    return;
  }

  const remainingTagIds = item.tagIds.filter(
    (tagId) => !deletedTagIds.has(tagId),
  );
  if (remainingTagIds.length === item.tagIds.length) {
    return;
  }

  if (remainingTagIds.length === 0) {
    delete item.tagIds;
    return;
  }

  item.tagIds = remainingTagIds;
};

const stripDeletedTagIdsFromCharacterSpriteGroups = ({
  item,
  deletedTagIds,
}) => {
  if (!Array.isArray(item?.spriteGroups) || item.spriteGroups.length === 0) {
    return;
  }

  const nextSpriteGroups = [];
  let didChange = false;

  for (const spriteGroup of item.spriteGroups) {
    const currentTags = Array.isArray(spriteGroup?.tags)
      ? spriteGroup.tags
      : [];
    const remainingTags = currentTags.filter(
      (tagId) => !deletedTagIds.has(tagId),
    );

    if (remainingTags.length !== currentTags.length) {
      didChange = true;
    }

    if (remainingTags.length === 0) {
      didChange = true;
      continue;
    }

    if (remainingTags.length === currentTags.length) {
      nextSpriteGroups.push(spriteGroup);
      continue;
    }

    nextSpriteGroups.push({
      ...spriteGroup,
      tags: remainingTags,
    });
  }

  if (!didChange) {
    return;
  }

  if (nextSpriteGroups.length === 0) {
    delete item.spriteGroups;
    return;
  }

  item.spriteGroups = nextSpriteGroups;
};

const stripDeletedTagIdsFromScopeItems = ({
  state,
  scopeKey,
  deletedTagIds,
}) => {
  if (deletedTagIds.size === 0) {
    return;
  }

  if (scopeKey === "images") {
    for (const item of Object.values(state.images.items)) {
      if (item?.type === "image") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "sounds") {
    for (const item of Object.values(state.sounds.items)) {
      if (item?.type === "sound") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "videos") {
    for (const item of Object.values(state.videos.items)) {
      if (item?.type === "video") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "characters") {
    for (const item of Object.values(state.characters.items)) {
      if (item?.type === "character") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "transforms") {
    for (const item of Object.values(state.transforms.items)) {
      if (item?.type === "transform") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "fonts") {
    for (const item of Object.values(state.fonts.items)) {
      if (item?.type === "font") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "colors") {
    for (const item of Object.values(state.colors.items)) {
      if (item?.type === "color") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "textStyles") {
    for (const item of Object.values(state.textStyles.items)) {
      if (item?.type === "textStyle") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "variables") {
    for (const item of Object.values(state.variables.items)) {
      if (item?.type !== "folder") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "layouts") {
    for (const item of Object.values(state.layouts.items)) {
      if (item?.type === "layout") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "controls") {
    for (const item of Object.values(state.controls.items)) {
      if (item?.type === "control") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "animations") {
    for (const item of Object.values(state.animations.items)) {
      if (item?.type === "animation") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "particles") {
    for (const item of Object.values(state.particles.items)) {
      if (item?.type === "particle") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (scopeKey === "spritesheets") {
    for (const item of Object.values(state.spritesheets.items)) {
      if (item?.type === "spritesheet") {
        stripDeletedTagIdsFromItem({ item, deletedTagIds });
      }
    }
    return;
  }

  if (!isCharacterSpriteTagScopeKey(scopeKey)) {
    return;
  }

  const characterId = getCharacterSpriteTagScopeCharacterId(scopeKey);
  const characterItem = state.characters?.items?.[characterId];
  const collection = getCharacterSpriteCollection({
    state,
    characterId,
  });

  if (characterItem?.type === "character") {
    stripDeletedTagIdsFromCharacterSpriteGroups({
      item: characterItem,
      deletedTagIds,
    });
  }

  for (const item of Object.values(collection?.items || {})) {
    if (item?.type === "image") {
      stripDeletedTagIdsFromItem({ item, deletedTagIds });
    }
  }
};

const validateKeyboardMap = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  for (const [key, interaction] of Object.entries(value)) {
    if (!isNonEmptyString(key)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path} keys must be non-empty strings`,
      );
    }

    if (!CONTROL_KEYBOARD_KEY_SET.has(key)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be one of: ${CONTROL_KEYBOARD_KEYS.map((value) => `'${value}'`).join(", ")}`,
      );
    }

    if (!isPlainObject(interaction)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.${key} must be an object`,
      );
    }
  }

  return VALID_RESULT;
};

const validatePreviewObject = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  return VALID_RESULT;
};

const validateAnimationPreviewSlot = ({
  value,
  path,
  allowTransform = false,
  errorFactory,
}) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  {
    const result = validateAllowedKeys({
      value,
      allowedKeys: allowTransform ? ["imageId", "transformId"] : ["imageId"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (value.imageId !== undefined && !isNonEmptyString(value.imageId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.imageId must be a non-empty string when provided`,
    );
  }

  if (value.transformId !== undefined && !isNonEmptyString(value.transformId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.transformId must be a non-empty string when provided`,
    );
  }

  return VALID_RESULT;
};

const validateAnimationPreviewObject = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  {
    const result = validateAllowedKeys({
      value,
      allowedKeys: ["background", "target", "outgoing", "incoming"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = validateAnimationPreviewSlot({
      value: value.background,
      path: `${path}.background`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  for (const key of ["target", "outgoing", "incoming"]) {
    const result = validateAnimationPreviewSlot({
      value: value[key],
      path: `${path}.${key}`,
      allowTransform: true,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  return VALID_RESULT;
};

const validateTransformPreviewSlot = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  {
    const result = validateAllowedKeys({
      value,
      allowedKeys: ["imageId"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (value.imageId !== undefined && !isNonEmptyString(value.imageId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.imageId must be a non-empty string when provided`,
    );
  }

  return VALID_RESULT;
};

const validateTransformPreviewObject = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be an object when provided`,
    );
  }

  {
    const result = validateAllowedKeys({
      value,
      allowedKeys: ["background", "target"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  for (const key of ["background", "target"]) {
    const result = validateTransformPreviewSlot({
      value: value[key],
      path: `${path}.${key}`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  return VALID_RESULT;
};

const validateLayoutItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "layout") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'layout'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "layoutType",
                "layoutSchemaVersion",
                "isFragment",
                "thumbnailFileId",
                "preview",
                "elements",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (
      item.thumbnailFileId !== undefined &&
      !isNonEmptyString(item.thumbnailFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.thumbnailFileId must be a non-empty string when provided`,
      );
    }

    {
      const result = validatePreviewObject({
        value: item.preview,
        path: `${itemPath}.preview`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (item.type === "layout") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!LAYOUT_TYPE_KEYS.includes(item.layoutType)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.layoutType must be 'general', 'save-load', 'confirmDialog', 'dialogue-adv', 'dialogue-nvl', 'choice', 'history', or 'input'`,
        );
      }

      if (
        item.layoutSchemaVersion !== undefined &&
        !isSupportedLayoutSchemaVersion(item.layoutSchemaVersion)
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.layoutSchemaVersion must be ${CURRENT_LAYOUT_SCHEMA_VERSION} when provided`,
        );
      }

      if (
        item.isFragment !== undefined &&
        typeof item.isFragment !== "boolean"
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.isFragment must be a boolean when provided`,
        );
      }

      {
        const result = validateNestedCollection({
          collection: item.elements,
          path: `${itemPath}.elements`,
          itemValidator: validateLayoutElementItems,
          treeValidator: validateLayoutElementTreeOwnership,
          treeNodeLabel: "layout element",
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateControlItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "control") {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or 'control'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name", "description"]
            : [
                "id",
                "type",
                "name",
                "description",
                "tagIds",
                "thumbnailFileId",
                "preview",
                "elements",
                "keyboard",
                "keyup",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must be a non-empty string`,
      );
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.id must match item key '${itemId}'`,
      );
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (
      item.thumbnailFileId !== undefined &&
      !isNonEmptyString(item.thumbnailFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.thumbnailFileId must be a non-empty string when provided`,
      );
    }

    {
      const result = validatePreviewObject({
        value: item.preview,
        path: `${itemPath}.preview`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (item.type === "control") {
      {
        const result = validateOptionalUniqueIdArray({
          value: item.tagIds,
          path: `${itemPath}.tagIds`,
          errorFactory,
          allowEmpty: false,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateNestedCollection({
          collection: item.elements,
          path: `${itemPath}.elements`,
          itemValidator: validateLayoutElementItems,
          treeValidator: validateLayoutElementTreeOwnership,
          treeNodeLabel: "control element",
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateKeyboardMap({
          value: item.keyboard,
          path: `${itemPath}.keyboard`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateKeyboardMap({
          value: item.keyup,
          path: `${itemPath}.keyup`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateSceneTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidState(
        `${nodePath}.children requires '${node.id}' to be a folder scene`,
      );
    }

    {
      const result = validateSceneTreeFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateSectionTreeSceneOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    for (const childNode of children) {
      if (items[childNode.id]?.sceneId !== items[node.id]?.sceneId) {
        return invalidState(
          `${nodePath}.children must stay within the same scene as '${node.id}'`,
        );
      }
    }

    {
      const result = validateSectionTreeSceneOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateSectionTreeShape = ({ nodes, items, path, errorFactory }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (!Object.hasOwn(items, node.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${nodePath}.id must reference an existing section`,
      );
    }

    {
      const result = validateSectionTreeShape({
        nodes: children,
        items,
        path: `${nodePath}.children`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateLineTreeFlatShape = ({ nodes, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0) {
      return invalidState(`${nodePath}.children is not supported for lines`);
    }
  }
};

const validateImageTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidState(
        `${nodePath}.children requires '${node.id}' to be a folder image item`,
      );
    }

    {
      const result = validateImageTreeFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateSoundTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidState(
        `${nodePath}.children requires '${node.id}' to be a folder sound item`,
      );
    }

    {
      const result = validateSoundTreeFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateVideoTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidState(
        `${nodePath}.children requires '${node.id}' to be a folder video item`,
      );
    }

    {
      const result = validateVideoTreeFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateAnimationTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidState(
        `${nodePath}.children requires '${node.id}' to be a folder animation item`,
      );
    }

    {
      const result = validateAnimationTreeFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateFontTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidState(
        `${nodePath}.children requires '${node.id}' to be a folder font item`,
      );
    }

    {
      const result = validateFontTreeFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateColorTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidState(
        `${nodePath}.children requires '${node.id}' to be a folder color item`,
      );
    }

    {
      const result = validateColorTreeFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateGenericFolderOwnership = ({
  nodes,
  items,
  path,
  folderLabel = "folder item",
  errorFactory = createStateValidationError,
}) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${nodePath}.children requires '${node.id}' to be a ${folderLabel}`,
      );
    }

    {
      const result = validateGenericFolderOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
        folderLabel,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateLayoutElementTreeOwnership = ({
  nodes,
  items,
  path,
  errorFactory = createStateValidationError,
}) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (
      children.length > 0 &&
      !LAYOUT_CONTAINER_ELEMENT_TYPES.includes(items[node.id]?.type)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${nodePath}.children requires '${node.id}' to be a folder or container layout element`,
      );
    }

    {
      const result = validateLayoutElementTreeOwnership({
        nodes: children,
        items,
        path: `${nodePath}.children`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateTreeNodes = ({
  nodes,
  items,
  path,
  seenIds,
  errorFactory = createStateValidationError,
}) => {
  if (!Array.isArray(nodes)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an array`);
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;

    {
      const result = validateAllowedKeys({
        value: node,
        allowedKeys: ["id", "children"],
        path: nodePath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(node.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${nodePath}.id must be a non-empty string`,
      );
    }

    if (!Object.hasOwn(items, node.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${nodePath}.id must reference an existing item`,
      );
    }

    if (seenIds.has(node.id)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${nodePath}.id is duplicated in tree`,
      );
    }
    seenIds.add(node.id);

    if (Object.hasOwn(node, "children")) {
      {
        const result = validateTreeNodes({
          nodes: node.children,
          items,
          path: `${nodePath}.children`,
          seenIds,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateNestedCollection = ({
  collection,
  path,
  itemValidator,
  treeValidator,
  folderLabel,
  errorFactory = createStateValidationError,
}) => {
  {
    const result = validateExactKeys({
      value: collection,
      expectedKeys: ["items", "tree"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isPlainObject(collection.items)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path}.items must be an object`,
    );
  }

  {
    const result = itemValidator({
      items: collection.items,
      path: `${path}.items`,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  const seenIds = new Set();
  {
    const result = validateTreeNodes({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
      seenIds,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = treeValidator({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
      folderLabel,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  for (const itemId of Object.keys(collection.items)) {
    if (!seenIds.has(itemId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}.tree is missing item '${itemId}'`,
      );
    }
  }
};

const validateCollection = ({ collection, path }) => {
  {
    const result = validateExactKeys({
      value: collection,
      expectedKeys: ["items", "tree"],
      path,
      errorFactory: createStateValidationError,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isPlainObject(collection.items)) {
    return invalidState(`${path}.items must be an object`);
  }

  if (path === "state.scenes") {
    {
      const result = validateSceneItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.images") {
    {
      const result = validateImageItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.spritesheets") {
    {
      const result = validateSpritesheetItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.files") {
    {
      const result = validateFileItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.sounds") {
    {
      const result = validateSoundItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.voices") {
    {
      const result = validateVoiceItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.videos") {
    {
      const result = validateVideoItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.animations") {
    {
      const result = validateAnimationItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.fonts") {
    {
      const result = validateFontItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.colors") {
    {
      const result = validateColorItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.transforms") {
    {
      const result = validateTransformItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.particles") {
    {
      const result = validateParticleItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.variables") {
    {
      const result = validateVariableItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.textStyles") {
    {
      const result = validateTextStyleItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.characters") {
    {
      const result = validateCharacterItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.layouts") {
    {
      const result = validateLayoutItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.controls") {
    {
      const result = validateControlItems({
        items: collection.items,
        path: `${path}.items`,
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (!Array.isArray(collection.tree)) {
    return invalidState(`${path}.tree must be an array`);
  }

  const seenIds = new Set();
  {
    const result = validateTreeNodes({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
      seenIds,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (path === "state.scenes") {
    {
      const result = validateSceneTreeFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.images") {
    {
      const result = validateImageTreeFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.spritesheets") {
    {
      const result = validateGenericFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
        folderLabel: "folder spritesheet item",
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.sounds") {
    {
      const result = validateSoundTreeFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.voices") {
    {
      const result = validateGenericFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
        folderLabel: "folder voice item",
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.videos") {
    {
      const result = validateVideoTreeFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.animations") {
    {
      const result = validateAnimationTreeFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.fonts") {
    {
      const result = validateFontTreeFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (path === "state.colors") {
    {
      const result = validateColorTreeFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  } else if (
    path === "state.files" ||
    path === "state.particles" ||
    path === "state.transforms" ||
    path === "state.variables" ||
    path === "state.textStyles" ||
    path === "state.characters" ||
    path === "state.layouts" ||
    path === "state.controls"
  ) {
    {
      const result = validateGenericFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
        folderLabel:
          path === "state.layouts"
            ? "folder layout item"
            : path === "state.controls"
              ? "folder control item"
              : "folder item",
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  for (const itemId of Object.keys(collection.items)) {
    if (!seenIds.has(itemId)) {
      return invalidState(`${path}.tree is missing item '${itemId}'`);
    }
  }
};

const validateFileReference = ({
  state,
  fileId,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (fileId === undefined || fileId === null) {
    return VALID_RESULT;
  }

  const expectedTypeMessage = `${path} must reference an existing non-folder file`;
  const file = state.files?.items?.[fileId];
  if (!isPlainObject(file) || file.type === "folder") {
    return invalidFromErrorFactory(errorFactory, expectedTypeMessage, details);
  }

  return VALID_RESULT;
};

const validateImageReference = ({
  state,
  imageId,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (imageId === undefined || imageId === null) {
    return VALID_RESULT;
  }

  const image = state.images?.items?.[imageId];
  if (!isPlainObject(image) || image.type === "folder") {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must reference an existing non-folder image`,
      details,
    );
  }

  return VALID_RESULT;
};

const validateAnimationMaskImageReferences = ({
  state,
  animation,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (!isPlainObject(animation) || animation.type !== "transition") {
    return VALID_RESULT;
  }

  const maskDefinitions = Array.isArray(animation.mask)
    ? animation.mask.map((mask, index) => ({
        mask,
        path: `${path}.mask[${index}]`,
        fieldPrefix: `mask[${index}].`,
      }))
    : isPlainObject(animation.mask)
      ? [
          {
            mask: animation.mask,
            path: `${path}.mask`,
            fieldPrefix: "",
          },
        ]
      : [];

  for (const maskDefinition of maskDefinitions) {
    const { mask, path: maskPath, fieldPrefix } = maskDefinition;
    if (!isPlainObject(mask)) {
      continue;
    }

    if (mask.imageId !== undefined) {
      const result = validateImageReference({
        state,
        imageId: mask.imageId,
        path: `${maskPath}.imageId`,
        details: {
          ...details,
          field: `${fieldPrefix}imageId`,
          imageId: mask.imageId,
        },
        errorFactory,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (Array.isArray(mask.imageIds)) {
      for (const [index, imageId] of mask.imageIds.entries()) {
        const result = validateImageReference({
          state,
          imageId,
          path: `${maskPath}.imageIds[${index}]`,
          details: {
            ...details,
            field: `${fieldPrefix}imageIds[${index}]`,
            imageId,
          },
          errorFactory,
        });
        if (!result.valid) {
          return result;
        }
      }
    }

    if (Array.isArray(mask.items)) {
      for (const [index, item] of mask.items.entries()) {
        if (item?.imageId === undefined) {
          continue;
        }

        const result = validateImageReference({
          state,
          imageId: item.imageId,
          path: `${maskPath}.items[${index}].imageId`,
          details: {
            ...details,
            field: `${fieldPrefix}items[${index}].imageId`,
            imageId: item.imageId,
          },
          errorFactory,
        });
        if (!result.valid) {
          return result;
        }
      }
    }
  }

  return VALID_RESULT;
};

const validateTransformPreviewImageReferences = ({
  state,
  preview,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (!isPlainObject(preview)) {
    return VALID_RESULT;
  }

  for (const slotKey of ["background", "target"]) {
    const imageId = preview[slotKey]?.imageId;
    const result = validateImageReference({
      state,
      imageId,
      path: `${path}.${slotKey}.imageId`,
      details: {
        ...details,
        slot: slotKey,
        imageId,
      },
      errorFactory,
    });
    if (!result.valid) {
      return result;
    }
  }

  return VALID_RESULT;
};

const validateStringVariableReference = ({
  state,
  variableId,
  path,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (variableId === undefined || variableId === null || variableId === "") {
    return VALID_RESULT;
  }

  if (!isStringVariableReferenceTarget(state, variableId)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must reference an existing string variable`,
      details,
    );
  }

  return VALID_RESULT;
};

export const assertInvariants = ({ state }) => {
  if (!isPlainObject(state)) {
    return invalidInvariant("state must be an object");
  }

  const initialSceneId = state.story?.initialSceneId;
  const sceneItems = state?.scenes?.items;

  if (initialSceneId !== null && !isNonEmptyString(initialSceneId)) {
    return invalidInvariant(
      "story.initialSceneId must be a non-empty string or null",
    );
  }

  if (initialSceneId !== null) {
    if (
      !isPlainObject(sceneItems) ||
      !isPlainObject(sceneItems[initialSceneId])
    ) {
      return invalidInvariant(
        "story.initialSceneId must reference an existing scene",
        { initialSceneId },
      );
    }

    if (sceneItems[initialSceneId].type === "folder") {
      return invalidInvariant(
        "story.initialSceneId must reference a non-folder scene",
        { initialSceneId },
      );
    }
  }

  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    if (scene.type === "folder") {
      continue;
    }

    const sections = scene.sections ?? createEmptyNestedCollection();

    for (const [sectionId, section] of Object.entries(sections.items)) {
      if (!isNonEmptyString(section.id) || section.id !== sectionId) {
        return invalidInvariant("section.id must match the section key", {
          sceneId,
          sectionId,
        });
      }

      const lines = section.lines ?? createEmptyNestedCollection();

      for (const [lineId, line] of Object.entries(lines.items)) {
        if (!isNonEmptyString(line.id) || line.id !== lineId) {
          return invalidInvariant("line.id must match the line key", {
            sceneId,
            sectionId,
            lineId,
          });
        }

        if (!isPlainObject(line.actions)) {
          return invalidInvariant("line.actions must be an object", {
            sceneId,
            sectionId,
            lineId,
          });
        }
      }
    }
  }

  for (const [textStyleId, textStyle] of Object.entries(
    state.textStyles.items,
  )) {
    if (textStyle.type === "folder") {
      continue;
    }

    for (const fontId of toIdArray(textStyle.fontId)) {
      const font = state.fonts.items[fontId];
      if (!isPlainObject(font) || font.type === "folder") {
        return invalidInvariant(
          "textStyle.fontId must reference an existing non-folder font",
          {
            textStyleId,
            fontId,
          },
        );
      }
    }

    const color = state.colors.items[textStyle.colorId];
    if (!isPlainObject(color) || color.type === "folder") {
      return invalidInvariant(
        "textStyle.colorId must reference an existing non-folder color",
        {
          textStyleId,
          colorId: textStyle.colorId,
        },
      );
    }

    if (textStyle.strokeColorId !== undefined) {
      const strokeColor = state.colors.items[textStyle.strokeColorId];
      if (!isPlainObject(strokeColor) || strokeColor.type === "folder") {
        return invalidInvariant(
          "textStyle.strokeColorId must reference an existing non-folder color",
          {
            textStyleId,
            strokeColorId: textStyle.strokeColorId,
          },
        );
      }
    }

    if (textStyle.shadow !== undefined) {
      const shadowColor = state.colors.items[textStyle.shadow.colorId];
      if (!isPlainObject(shadowColor) || shadowColor.type === "folder") {
        return invalidInvariant(
          "textStyle.shadow.colorId must reference an existing non-folder color",
          {
            textStyleId,
            colorId: textStyle.shadow.colorId,
          },
        );
      }
    }
  }

  for (const [imageId, image] of Object.entries(state.images.items)) {
    if (image.type !== "image") {
      continue;
    }

    {
      const result = validateFileReference({
        state,
        fileId: image.fileId,
        path: "image.fileId",
        details: { imageId, fileId: image.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (image.thumbnailFileId !== undefined) {
      const result = validateFileReference({
        state,
        fileId: image.thumbnailFileId,
        path: "image.thumbnailFileId",
        details: { imageId, thumbnailFileId: image.thumbnailFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: image.tagIds,
        scopeKey: "images",
        path: "image.tagIds",
        details: {
          imageId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [spritesheetId, spritesheet] of Object.entries(
    state.spritesheets.items,
  )) {
    if (spritesheet.type !== "spritesheet") {
      continue;
    }

    const result = validateFileReference({
      state,
      fileId: spritesheet.fileId,
      path: "spritesheet.fileId",
      details: { spritesheetId, fileId: spritesheet.fileId },
      errorFactory: createInvariantValidationError,
    });
    if (!result.valid) {
      return result;
    }

    {
      const tagResult = validateTagIdsAgainstScope({
        state,
        tagIds: spritesheet.tagIds,
        scopeKey: "spritesheets",
        path: "spritesheet.tagIds",
        details: {
          spritesheetId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!tagResult.valid) {
        return tagResult;
      }
    }

    if (spritesheet.thumbnailFileId === undefined) {
      continue;
    }

    const thumbnailResult = validateFileReference({
      state,
      fileId: spritesheet.thumbnailFileId,
      path: "spritesheet.thumbnailFileId",
      details: {
        spritesheetId,
        thumbnailFileId: spritesheet.thumbnailFileId,
      },
      errorFactory: createInvariantValidationError,
    });
    if (!thumbnailResult.valid) {
      return thumbnailResult;
    }
  }

  for (const [soundId, sound] of Object.entries(state.sounds.items)) {
    if (sound.type !== "sound") {
      continue;
    }

    {
      const result = validateFileReference({
        state,
        fileId: sound.fileId,
        path: "sound.fileId",
        details: { soundId, fileId: sound.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (
      sound.waveformDataFileId !== undefined &&
      sound.waveformDataFileId !== null
    ) {
      const result = validateFileReference({
        state,
        fileId: sound.waveformDataFileId,
        path: "sound.waveformDataFileId",
        details: { soundId, waveformDataFileId: sound.waveformDataFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: sound.tagIds,
        scopeKey: "sounds",
        path: "sound.tagIds",
        details: {
          soundId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [voiceId, voice] of Object.entries(state.voices.items)) {
    if (voice.type !== "voice") {
      continue;
    }

    if (!isPlainObject(sceneItems[voice.sceneId])) {
      return invalidInvariant(
        "voice.sceneId must reference an existing scene",
        { voiceId, sceneId: voice.sceneId },
      );
    }

    if (sceneItems[voice.sceneId].type === "folder") {
      return invalidInvariant(
        "voice.sceneId must reference a non-folder scene",
        { voiceId, sceneId: voice.sceneId },
      );
    }

    {
      const result = validateFileReference({
        state,
        fileId: voice.fileId,
        path: "voice.fileId",
        details: { voiceId, fileId: voice.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (
      voice.waveformDataFileId !== undefined &&
      voice.waveformDataFileId !== null
    ) {
      const result = validateFileReference({
        state,
        fileId: voice.waveformDataFileId,
        path: "voice.waveformDataFileId",
        details: { voiceId, waveformDataFileId: voice.waveformDataFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [videoId, video] of Object.entries(state.videos.items)) {
    if (video.type !== "video") {
      continue;
    }

    {
      const result = validateFileReference({
        state,
        fileId: video.fileId,
        path: "video.fileId",
        details: { videoId, fileId: video.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    {
      const result = validateFileReference({
        state,
        fileId: video.thumbnailFileId,
        path: "video.thumbnailFileId",
        details: { videoId, thumbnailFileId: video.thumbnailFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: video.tagIds,
        scopeKey: "videos",
        path: "video.tagIds",
        details: {
          videoId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [fontId, font] of Object.entries(state.fonts.items)) {
    if (font.type !== "font") {
      continue;
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: font.tagIds,
        scopeKey: "fonts",
        path: "font.tagIds",
        details: {
          fontId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    const result = validateFileReference({
      state,
      fileId: font.fileId,
      path: "font.fileId",
      details: { fontId, fileId: font.fileId },
      errorFactory: createInvariantValidationError,
    });
    if (!result.valid) {
      return result;
    }
  }

  for (const [animationId, animation] of Object.entries(
    state.animations.items,
  )) {
    if (animation.type !== "animation") {
      continue;
    }

    {
      const tagResult = validateTagIdsAgainstScope({
        state,
        tagIds: animation.tagIds,
        scopeKey: "animations",
        path: "animation.tagIds",
        details: {
          animationId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!tagResult.valid) {
        return tagResult;
      }
    }

    if (animation.thumbnailFileId !== undefined) {
      const fileResult = validateFileReference({
        state,
        fileId: animation.thumbnailFileId,
        path: "animation.thumbnailFileId",
        details: { animationId, thumbnailFileId: animation.thumbnailFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!fileResult.valid) {
        return fileResult;
      }
    }

    const result = validateAnimationMaskImageReferences({
      state,
      animation: animation.animation,
      path: "animation",
      details: { animationId },
      errorFactory: createInvariantValidationError,
    });
    if (!result.valid) {
      return result;
    }
  }

  for (const [characterId, character] of Object.entries(
    state.characters.items,
  )) {
    if (character.type !== "character") {
      continue;
    }

    if (character.fileId !== undefined) {
      const result = validateFileReference({
        state,
        fileId: character.fileId,
        path: "character.fileId",
        details: { characterId, fileId: character.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (character.nameVariableId !== undefined) {
      const result = validateStringVariableReference({
        state,
        variableId: character.nameVariableId,
        path: "character.nameVariableId",
        details: { characterId, variableId: character.nameVariableId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: character.tagIds,
        scopeKey: "characters",
        path: "character.tagIds",
        details: {
          characterId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    {
      const result = validateCharacterSpriteGroupsAgainstScope({
        state,
        spriteGroups: character.spriteGroups,
        scopeKey: `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${characterId}`,
        path: "character.spriteGroups",
        details: {
          characterId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    for (const [spriteId, sprite] of Object.entries(
      character.sprites?.items || {},
    )) {
      if (sprite.type !== "image") {
        continue;
      }

      const result = validateFileReference({
        state,
        fileId: sprite.fileId,
        path: "character.sprite.fileId",
        details: { characterId, spriteId, fileId: sprite.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }

      {
        const tagResult = validateTagIdsAgainstScope({
          state,
          tagIds: sprite.tagIds,
          scopeKey: `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${characterId}`,
          path: "character.sprite.tagIds",
          details: {
            characterId,
            spriteId,
          },
          errorFactory: createInvariantValidationError,
        });
        if (!tagResult.valid) {
          return tagResult;
        }
      }

      if (sprite.thumbnailFileId === undefined) {
        continue;
      }

      const thumbnailResult = validateFileReference({
        state,
        fileId: sprite.thumbnailFileId,
        path: "character.sprite.thumbnailFileId",
        details: {
          characterId,
          spriteId,
          thumbnailFileId: sprite.thumbnailFileId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!thumbnailResult.valid) {
        return thumbnailResult;
      }
    }
  }

  for (const [transformId, transform] of Object.entries(
    state.transforms.items,
  )) {
    if (transform.type !== "transform") {
      continue;
    }

    for (const fieldName of ["thumbnailFileId", "previewFileId"]) {
      const fileId = transform[fieldName];
      if (fileId === undefined) {
        continue;
      }

      const fileResult = validateFileReference({
        state,
        fileId,
        path: `transform.${fieldName}`,
        details: {
          transformId,
          [fieldName]: fileId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!fileResult.valid) {
        return fileResult;
      }
    }

    {
      const previewResult = validateTransformPreviewImageReferences({
        state,
        preview: transform.preview,
        path: "transform.preview",
        details: {
          transformId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!previewResult.valid) {
        return previewResult;
      }
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: transform.tagIds,
        scopeKey: "transforms",
        path: "transform.tagIds",
        details: {
          transformId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [particleId, particle] of Object.entries(state.particles.items)) {
    if (particle.type !== "particle") {
      continue;
    }

    if (particle.thumbnailFileId !== undefined) {
      const result = validateFileReference({
        state,
        fileId: particle.thumbnailFileId,
        path: "particle.thumbnailFileId",
        details: { particleId, thumbnailFileId: particle.thumbnailFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: particle.tagIds,
        scopeKey: "particles",
        path: "particle.tagIds",
        details: {
          particleId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [colorId, color] of Object.entries(state.colors.items)) {
    if (color.type !== "color") {
      continue;
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: color.tagIds,
        scopeKey: "colors",
        path: "color.tagIds",
        details: {
          colorId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [textStyleId, textStyle] of Object.entries(
    state.textStyles.items,
  )) {
    if (textStyle.type !== "textStyle") {
      continue;
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: textStyle.tagIds,
        scopeKey: "textStyles",
        path: "textStyle.tagIds",
        details: {
          textStyleId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [layoutId, layout] of Object.entries(state.layouts.items)) {
    if (layout.type !== "layout") {
      continue;
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: layout.tagIds,
        scopeKey: "layouts",
        path: "layout.tagIds",
        details: {
          layoutId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (layout.thumbnailFileId !== undefined) {
      const result = validateFileReference({
        state,
        fileId: layout.thumbnailFileId,
        path: "layout.thumbnailFileId",
        details: { layoutId, thumbnailFileId: layout.thumbnailFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [variableId, variable] of Object.entries(state.variables.items)) {
    if (variable.type === "folder") {
      continue;
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: variable.tagIds,
        scopeKey: "variables",
        path: "variable.tagIds",
        details: {
          variableId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  for (const [controlId, control] of Object.entries(state.controls.items)) {
    if (control.type !== "control") {
      continue;
    }

    {
      const result = validateTagIdsAgainstScope({
        state,
        tagIds: control.tagIds,
        scopeKey: "controls",
        path: "control.tagIds",
        details: {
          controlId,
        },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (control.thumbnailFileId === undefined) {
      continue;
    }

    const result = validateFileReference({
      state,
      fileId: control.thumbnailFileId,
      path: "control.thumbnailFileId",
      details: { controlId, thumbnailFileId: control.thumbnailFileId },
      errorFactory: createInvariantValidationError,
    });
    if (!result.valid) {
      return result;
    }
  }

  const assertImageReference = ({
    ownerIdField,
    ownerId,
    ownerLabel,
    elementId,
    field,
    targetId,
  }) => {
    const image = state.images.items[targetId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidInvariant(
        `${ownerLabel} element ${field} must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field,
          targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertTextStyleReference = ({
    ownerIdField,
    ownerId,
    ownerLabel,
    elementId,
    field,
    targetId,
  }) => {
    const textStyle = state.textStyles.items[targetId];
    if (!isPlainObject(textStyle) || textStyle.type === "folder") {
      return invalidInvariant(
        `${ownerLabel} element ${field} must reference an existing non-folder text style`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field,
          targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertSoundReference = ({
    ownerIdField,
    ownerId,
    ownerLabel,
    elementId,
    field,
    targetId,
  }) => {
    const sound = state.sounds.items[targetId];
    if (!isPlainObject(sound) || sound.type === "folder") {
      return invalidInvariant(
        `${ownerLabel} element ${field} must reference an existing non-folder sound`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field,
          targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertVariableReference = ({
    ownerIdField,
    ownerId,
    ownerLabel,
    elementId,
    targetId,
  }) => {
    if (!isVariableReferenceTarget(state, targetId)) {
      return invalidInvariant(
        `${ownerLabel} element variableId must reference an existing non-folder variable`,
        {
          [ownerIdField]: ownerId,
          elementId,
          variableId: targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertFragmentLayoutReference = ({
    ownerIdField,
    ownerId,
    ownerLabel,
    elementId,
    targetId,
  }) => {
    const layout = state.layouts.items[targetId];
    if (
      !isPlainObject(layout) ||
      layout.type !== "layout" ||
      layout.isFragment !== true
    ) {
      return invalidInvariant(
        `${ownerLabel} element fragmentLayoutId must reference an existing fragment layout`,
        {
          [ownerIdField]: ownerId,
          elementId,
          fragmentLayoutId: targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertSpritesheetAnimationReference = ({
    ownerIdField,
    ownerId,
    ownerLabel,
    elementId,
    targetId,
    animationName,
    fieldPrefix = "",
  }) => {
    const spritesheet = state.spritesheets?.items?.[targetId];
    if (!isPlainObject(spritesheet) || spritesheet.type === "folder") {
      return invalidInvariant(
        `${ownerLabel} element ${fieldPrefix}resourceId must reference an existing non-folder spritesheet`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: `${fieldPrefix}resourceId`,
          targetId,
        },
      );
    }

    if (
      !isNonEmptyString(animationName) ||
      !isPlainObject(spritesheet.animations?.[animationName])
    ) {
      return invalidInvariant(
        `${ownerLabel} element ${fieldPrefix}animationName must reference an existing spritesheet animation`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: `${fieldPrefix}animationName`,
          targetId: animationName,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertParticleReference = ({
    ownerIdField,
    ownerId,
    ownerLabel,
    elementId,
    targetId,
  }) => {
    const particle = state.particles?.items?.[targetId];
    if (!isPlainObject(particle) || particle.type === "folder") {
      return invalidInvariant(
        `${ownerLabel} element particleId must reference an existing non-folder particle`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "particleId",
          targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertElementReferencesForCollection = ({
    items,
    ownerIdField,
    ownerLabel,
    ownerType,
  }) => {
    for (const [ownerId, owner] of Object.entries(items)) {
      if (owner.type !== ownerType) {
        continue;
      }

      for (const [elementId, element] of Object.entries(owner.elements.items)) {
        if (
          element.type === "spritesheet-animation" ||
          element.resourceId !== undefined ||
          element.animationName !== undefined
        ) {
          const result = assertSpritesheetAnimationReference({
            ownerIdField,
            ownerId,
            ownerLabel,
            elementId,
            targetId: element.resourceId,
            animationName: element.animationName,
          });
          if (!result.valid) {
            return result;
          }
        }

        if (element.type === "particle" || element.particleId !== undefined) {
          const result = assertParticleReference({
            ownerIdField,
            ownerId,
            ownerLabel,
            elementId,
            targetId: element.particleId,
          });
          if (!result.valid) {
            return result;
          }
        }

        for (const field of [
          "imageId",
          "hoverImageId",
          "clickImageId",
          "thumbImageId",
          "barImageId",
          "hoverThumbImageId",
          "hoverBarImageId",
        ]) {
          if (element[field] !== undefined) {
            const result = assertImageReference({
              ownerIdField,
              ownerId,
              ownerLabel,
              elementId,
              field,
              targetId: element[field],
            });
            if (!result.valid) {
              return result;
            }
          }
        }

        for (const stateName of ["revealing", "complete"]) {
          const visual = element.indicator?.[stateName];
          if (
            visual?.kind === "spritesheet" ||
            visual?.resourceId !== undefined ||
            visual?.animationName !== undefined
          ) {
            const result = assertSpritesheetAnimationReference({
              ownerIdField,
              ownerId,
              ownerLabel,
              elementId,
              targetId: visual.resourceId,
              animationName: visual.animationName,
              fieldPrefix: `indicator.${stateName}.`,
            });
            if (!result.valid) {
              return result;
            }
            continue;
          }

          if (visual?.imageId !== undefined) {
            const result = assertImageReference({
              ownerIdField,
              ownerId,
              ownerLabel,
              elementId,
              field: `indicator.${stateName}.imageId`,
              targetId: visual.imageId,
            });
            if (!result.valid) {
              return result;
            }
          }
        }

        for (const field of ["hoverSoundId", "clickSoundId", "revealSoundId"]) {
          if (element[field] !== undefined) {
            const result = assertSoundReference({
              ownerIdField,
              ownerId,
              ownerLabel,
              elementId,
              field,
              targetId: element[field],
            });
            if (!result.valid) {
              return result;
            }
          }
        }

        for (const field of [
          "textStyleId",
          "hoverTextStyleId",
          "clickTextStyleId",
        ]) {
          if (element[field] !== undefined) {
            const result = assertTextStyleReference({
              ownerIdField,
              ownerId,
              ownerLabel,
              elementId,
              field,
              targetId: element[field],
            });
            if (!result.valid) {
              return result;
            }
          }
        }

        if (Array.isArray(element.conditionalOverrides)) {
          for (
            let index = 0;
            index < element.conditionalOverrides.length;
            index += 1
          ) {
            const rule = element.conditionalOverrides[index];

            for (const field of ["hoverSoundId", "clickSoundId"]) {
              if (rule?.set?.[field] !== undefined) {
                const result = assertSoundReference({
                  ownerIdField,
                  ownerId,
                  ownerLabel,
                  elementId,
                  field: `conditionalOverrides.${index}.set.${field}`,
                  targetId: rule.set[field],
                });
                if (!result.valid) {
                  return result;
                }
              }
            }

            for (const field of [
              "textStyleId",
              "hoverTextStyleId",
              "clickTextStyleId",
            ]) {
              if (rule?.set?.[field] !== undefined) {
                const result = assertTextStyleReference({
                  ownerIdField,
                  ownerId,
                  ownerLabel,
                  elementId,
                  field: `conditionalOverrides.${index}.set.${field}`,
                  targetId: rule.set[field],
                });
                if (!result.valid) {
                  return result;
                }
              }
            }

            if (
              rule?.when?.target !== undefined &&
              !isLayoutConditionTarget(state, rule.when.target)
            ) {
              return invalidInvariant(
                `${ownerLabel} element conditionalOverrides when target must reference an existing variable or supported layout condition`,
                {
                  [ownerIdField]: ownerId,
                  elementId,
                  field: `conditionalOverrides.${index}.when.target`,
                  targetId: rule.when.target,
                },
              );
            }
          }
        }

        for (const {
          index,
          resourceId,
        } of getLayoutTextContentReferenceEntries(element.content)) {
          if (!isVariableReferenceTarget(state, resourceId)) {
            return invalidInvariant(
              `${ownerLabel} element content.${index}.reference.resourceId must reference an existing non-folder variable`,
              {
                [ownerIdField]: ownerId,
                elementId,
                field: `content.${index}.reference.resourceId`,
                targetId: resourceId,
              },
            );
          }
        }

        if (element.variableId !== undefined) {
          const result = assertVariableReference({
            ownerIdField,
            ownerId,
            ownerLabel,
            elementId,
            targetId: element.variableId,
          });
          if (!result.valid) {
            return result;
          }
        }

        if (element.fragmentLayoutId !== undefined) {
          const result = assertFragmentLayoutReference({
            ownerIdField,
            ownerId,
            ownerLabel,
            elementId,
            targetId: element.fragmentLayoutId,
          });
          if (!result.valid) {
            return result;
          }
        }
      }
    }

    return VALID_RESULT;
  };

  {
    const result = assertElementReferencesForCollection({
      items: state.layouts.items,
      ownerIdField: "layoutId",
      ownerLabel: "layout",
      ownerType: "layout",
    });
    if (!result.valid) {
      return result;
    }
  }

  {
    const result = assertElementReferencesForCollection({
      items: state.controls.items,
      ownerIdField: "controlId",
      ownerLabel: "control",
      ownerType: "control",
    });
    if (!result.valid) {
      return result;
    }
  }

  return VALID_RESULT;
};

const runValidateState = ({ state }) => {
  return captureValidation(() => {
    const normalizedState = normalizeStateCollections(state);

    {
      const result = validateExactKeys({
        value: normalizedState,
        expectedKeys: ROOT_KEYS,
        path: "state",
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateAllowedKeys({
        value: normalizedState.project,
        allowedKeys: ["resolution"],
        path: "state.project",
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (normalizedState.project.resolution !== undefined) {
      {
        const result = validateExactKeys({
          value: normalizedState.project.resolution,
          expectedKeys: ["width", "height"],
          path: "state.project.resolution",
          errorFactory: createStateValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isFiniteNumber(normalizedState.project.resolution.width)) {
        return invalidState(
          "state.project.resolution.width must be a finite number",
        );
      }

      if (!isFiniteNumber(normalizedState.project.resolution.height)) {
        return invalidState(
          "state.project.resolution.height must be a finite number",
        );
      }
    }

    {
      const result = validateExactKeys({
        value: normalizedState.story,
        expectedKeys: ["initialSceneId"],
        path: "state.story",
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (
      normalizedState.story.initialSceneId !== null &&
      !isNonEmptyString(normalizedState.story.initialSceneId)
    ) {
      return invalidState(
        "state.story.initialSceneId must be a non-empty string or null",
      );
    }

    {
      const result = validateTagsRoot({
        state: normalizedState,
        tags: normalizedState.tags,
        path: "state.tags",
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    for (const collectionKey of COLLECTION_KEYS) {
      {
        const result = validateCollection({
          collection: normalizedState[collectionKey],
          path: `state.${collectionKey}`,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }

    const invariantResult = assertInvariants({ state: normalizedState });
    if (!invariantResult.valid) {
      return invariantResult;
    }

    return VALID_RESULT;
  });
};

export const validateState = ({ state }) => runValidateState({ state });

export const normalizeState = ({ state }) => normalizeStateCollections(state);

const validatePlacementFields = ({ payload, errorFactory }) => {
  if (
    payload.index !== undefined &&
    (!Number.isInteger(payload.index) || payload.index < 0)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.index must be an integer greater than or equal to 0",
    );
  }

  const hasPosition = payload.position !== undefined;
  const hasPositionTargetId = payload.positionTargetId !== undefined;

  if (payload.index !== undefined && hasPosition) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.index cannot be combined with payload.position",
    );
  }

  if (!hasPosition) {
    if (hasPositionTargetId) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.positionTargetId requires payload.position",
      );
    }
    return;
  }

  if (
    payload.position !== "first" &&
    payload.position !== "last" &&
    payload.position !== "before" &&
    payload.position !== "after"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.position must be 'first', 'last', 'before', or 'after'",
    );
  }

  if (payload.position === "before" || payload.position === "after") {
    if (!isNonEmptyString(payload.positionTargetId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.positionTargetId must be a non-empty string when payload.position is 'before' or 'after'",
      );
    }
    return;
  }

  if (hasPositionTargetId) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.positionTargetId is allowed only when payload.position is 'before' or 'after'",
    );
  }
};

const validateSceneCreateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["name", "description", "type", "position"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (
    data.type !== undefined &&
    data.type !== "scene" &&
    data.type !== "folder"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'scene' or 'folder'",
    );
  }

  {
    const result = validateOptionalPosition({
      value: data.position,
      path: "payload.data.position",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateSceneUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["name", "description", "position"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  const hasName = data.name !== undefined;
  const hasDescription = data.description !== undefined;
  const hasPosition = data.position !== undefined;

  if (!hasName && !hasDescription && !hasPosition) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (hasName && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (hasDescription && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (hasPosition) {
    {
      const result = validateOptionalPosition({
        value: data.position,
        path: "payload.data.position",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateRequiredUniqueIdArray = ({ value, path, errorFactory }) => {
  if (!Array.isArray(value) || value.length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be a non-empty array`,
    );
  }

  const seen = new Set();

  for (const [index, entry] of value.entries()) {
    if (!isNonEmptyString(entry)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}[${index}] must be a non-empty string`,
      );
    }

    if (seen.has(entry)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}[${index}] must be unique`,
      );
    }

    seen.add(entry);
  }
};

const validateRequiredStringOrUniqueIdArray = ({
  value,
  path,
  errorFactory,
}) => {
  if (isNonEmptyString(value)) {
    return VALID_RESULT;
  }

  if (!Array.isArray(value)) {
    return invalidFromErrorFactory(
      errorFactory,
      `${path} must be a non-empty string or a non-empty array of strings`,
    );
  }

  return validateRequiredUniqueIdArray({ value, path, errorFactory });
};

const toIdArray = (value) => (Array.isArray(value) ? value : [value]);

const validateOptionalUniqueIdArray = ({
  value,
  path,
  errorFactory,
  allowEmpty = true,
}) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return invalidFromErrorFactory(
      errorFactory,
      allowEmpty
        ? `${path} must be an array when provided`
        : `${path} must be a non-empty array when provided`,
    );
  }

  const seen = new Set();

  for (const [index, entry] of value.entries()) {
    if (!isNonEmptyString(entry)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}[${index}] must be a non-empty string`,
      );
    }

    if (seen.has(entry)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${path}[${index}] must be unique`,
      );
    }

    seen.add(entry);
  }
};

const validateCharacterSpriteGroups = ({
  value,
  path,
  errorFactory,
  allowEmpty = true,
  allowMissingId = false,
}) => {
  if (value === undefined) {
    return VALID_RESULT;
  }

  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return invalidFromErrorFactory(
      errorFactory,
      allowEmpty
        ? `${path} must be an array when provided`
        : `${path} must be a non-empty array when provided`,
    );
  }

  const seenIds = new Set();

  for (const [index, spriteGroup] of value.entries()) {
    const itemPath = `${path}[${index}]`;

    if (!isPlainObject(spriteGroup)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath} must be an object`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: spriteGroup,
        allowedKeys: ["id", "name", "tags"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (spriteGroup.id === undefined) {
      if (!allowMissingId) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.id must be a non-empty string`,
        );
      }
    } else {
      if (!isNonEmptyString(spriteGroup.id)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.id must be a non-empty string`,
        );
      }

      if (seenIds.has(spriteGroup.id)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${itemPath}.id must be unique within spriteGroups`,
        );
      }

      seenIds.add(spriteGroup.id);
    }

    if (!isNonEmptyString(spriteGroup.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.name must be a non-empty string`,
      );
    }

    {
      const result = validateRequiredUniqueIdArray({
        value: spriteGroup.tags,
        path: `${itemPath}.tags`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  return VALID_RESULT;
};

const validateSectionCreateData = ({ data, errorFactory }) => {
  {
    const result = validateExactKeys({
      value: data,
      expectedKeys: ["name"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }
};

const validateSectionUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateExactKeys({
      value: data,
      expectedKeys: ["name"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }
};

const validateLineCreatePayload = ({ payload, errorFactory }) => {
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.lines must be a non-empty array",
    );
  }

  const seenLineIds = new Set();

  for (const [index, item] of payload.lines.entries()) {
    const itemPath = `payload.lines[${index}]`;

    {
      const result = validateExactKeys({
        value: item,
        expectedKeys: ["lineId", "data"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.lineId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.lineId must be a non-empty string`,
      );
    }

    if (seenLineIds.has(item.lineId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.lineId must be unique`,
      );
    }
    seenLineIds.add(item.lineId);

    {
      const result = validateAllowedKeys({
        value: item.data,
        allowedKeys: ["actions"],
        path: `${itemPath}.data`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (item.data.actions !== undefined && !isPlainObject(item.data.actions)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.data.actions must be an object`,
      );
    }
  }
};

const validateLineUpdateActionsData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }
};

const validateLineUpdateActionsPreserve = ({
  preserve,
  data,
  replace,
  errorFactory,
}) => {
  if (preserve === undefined) {
    return VALID_RESULT;
  }

  if (replace === true) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.preserve is only supported when payload.replace is not true",
    );
  }

  if (!Array.isArray(preserve)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.preserve must be an array when provided",
    );
  }

  const seen = new Set();
  for (let index = 0; index < preserve.length; index += 1) {
    const path = preserve[index];
    const preservePath = `payload.preserve[${index}]`;

    if (!isNonEmptyString(path)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${preservePath} must be a non-empty string`,
      );
    }

    if (!LINE_UPDATE_ACTIONS_PRESERVE_PATHS_SET.has(path)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${preservePath} must be one of: ${LINE_UPDATE_ACTIONS_PRESERVE_PATHS.join(", ")}`,
      );
    }

    if (seen.has(path)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${preservePath} must not duplicate another preserve path`,
      );
    }
    seen.add(path);

    if (path === "dialogue.content" && !isPlainObject(data?.dialogue)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.dialogue must be an object when preserving dialogue.content",
      );
    }
  }

  return VALID_RESULT;
};

const applyLineUpdateActionsPreserve = ({ currentActions, data, preserve }) => {
  const nextData = structuredClone(data || {});
  if (!Array.isArray(preserve) || preserve.length === 0) {
    return nextData;
  }

  if (
    preserve.includes("dialogue.content") &&
    isPlainObject(nextData.dialogue) &&
    !Object.hasOwn(nextData.dialogue, "content")
  ) {
    const currentContent = currentActions?.dialogue?.content;
    if (currentContent !== undefined) {
      nextData.dialogue = {
        ...structuredClone(nextData.dialogue),
        content: structuredClone(currentContent),
      };
    }
  }

  return nextData;
};

const validateImageCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "image") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'image'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "thumbnailFileId",
              "fileId",
              "width",
              "height",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "image") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (
      data.thumbnailFileId !== undefined &&
      !isNonEmptyString(data.thumbnailFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.thumbnailFileId must be a non-empty string when provided",
      );
    }

    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string",
      );
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.width must be a finite number",
      );
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.height must be a finite number",
      );
    }
  }
};

const validateImageUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "thumbnailFileId",
        "fileId",
        "width",
        "height",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.width must be a finite number",
    );
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.height must be a finite number",
    );
  }
};

const validateSpritesheetCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "spritesheet") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'spritesheet'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "thumbnailFileId",
              "fileId",
              "sheetWidth",
              "sheetHeight",
              "frameCount",
              "width",
              "height",
              "jsonData",
              "animations",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "spritesheet") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (
      data.thumbnailFileId !== undefined &&
      !isNonEmptyString(data.thumbnailFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.thumbnailFileId must be a non-empty string when provided",
      );
    }

    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string",
      );
    }

    for (const key of [
      "sheetWidth",
      "sheetHeight",
      "frameCount",
      "width",
      "height",
    ]) {
      if (data[key] !== undefined && !isFiniteNumber(data[key])) {
        return invalidFromErrorFactory(
          errorFactory,
          `payload.data.${key} must be a finite number`,
        );
      }
    }

    if (!isPlainObject(data.jsonData)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.jsonData must be an object",
      );
    }

    {
      const result = validateSpritesheetAnimationMap({
        animations: data.animations,
        path: "payload.data.animations",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateSpritesheetUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "thumbnailFileId",
        "fileId",
        "sheetWidth",
        "sheetHeight",
        "frameCount",
        "width",
        "height",
        "jsonData",
        "animations",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  for (const key of [
    "sheetWidth",
    "sheetHeight",
    "frameCount",
    "width",
    "height",
  ]) {
    if (data[key] !== undefined && !isFiniteNumber(data[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `payload.data.${key} must be a finite number`,
      );
    }
  }

  if (data.jsonData !== undefined && !isPlainObject(data.jsonData)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.jsonData must be an object when provided",
    );
  }

  if (data.animations !== undefined) {
    const result = validateSpritesheetAnimationMap({
      animations: data.animations,
      path: "payload.data.animations",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateSoundCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "sound") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'sound'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "fileId",
              "waveformDataFileId",
              "duration",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "sound") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string",
      );
    }

    if (
      data.waveformDataFileId !== undefined &&
      data.waveformDataFileId !== null &&
      !isNonEmptyString(data.waveformDataFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.waveformDataFileId must be a non-empty string or null when provided",
      );
    }

    if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.duration must be a finite number",
      );
    }
  }
};

const validateSoundUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "fileId",
        "waveformDataFileId",
        "duration",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (
    data.waveformDataFileId !== undefined &&
    data.waveformDataFileId !== null &&
    !isNonEmptyString(data.waveformDataFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.waveformDataFileId must be a non-empty string or null when provided",
    );
  }

  if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.duration must be a finite number",
    );
  }
};

const validateVoiceCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "voice") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'voice'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "sceneId",
              "fileId",
              "waveformDataFileId",
              "duration",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "voice") {
    if (!isNonEmptyString(data.sceneId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.sceneId must be a non-empty string",
      );
    }

    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string",
      );
    }

    if (
      data.waveformDataFileId !== undefined &&
      data.waveformDataFileId !== null &&
      !isNonEmptyString(data.waveformDataFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.waveformDataFileId must be a non-empty string or null when provided",
      );
    }

    if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.duration must be a finite number",
      );
    }
  }
};

const validateVoiceUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "sceneId",
        "fileId",
        "waveformDataFileId",
        "duration",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.sceneId !== undefined && !isNonEmptyString(data.sceneId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.sceneId must be a non-empty string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (
    data.waveformDataFileId !== undefined &&
    data.waveformDataFileId !== null &&
    !isNonEmptyString(data.waveformDataFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.waveformDataFileId must be a non-empty string or null when provided",
    );
  }

  if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.duration must be a finite number",
    );
  }
};

const validateVideoCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "video") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'video'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "fileId",
              "thumbnailFileId",
              "duration",
              "width",
              "height",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "video") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string",
      );
    }

    if (!isNonEmptyString(data.thumbnailFileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.thumbnailFileId must be a non-empty string",
      );
    }

    if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.duration must be a finite number",
      );
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.width must be a finite number",
      );
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.height must be a finite number",
      );
    }
  }
};

const validateVideoUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "fileId",
        "thumbnailFileId",
        "duration",
        "width",
        "height",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.duration must be a finite number",
    );
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.width must be a finite number",
    );
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.height must be a finite number",
    );
  }
};

const validateFontCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "font") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'font'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "fileId",
              "fontFamily",
              ...FONT_WEIGHT_KEYS,
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "font") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string",
      );
    }

    if (!isNonEmptyString(data.fontFamily)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fontFamily must be a non-empty string",
      );
    }

    {
      const result = validateFontWeightFields({
        value: data,
        path: "payload.data",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateFontUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "fileId",
        "fontFamily",
        ...FONT_WEIGHT_KEYS,
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (data.fontFamily !== undefined && !isNonEmptyString(data.fontFamily)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fontFamily must be a non-empty string when provided",
    );
  }

  {
    const result = validateFontWeightFields({
      value: data,
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateFileCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== undefined && !isNonEmptyString(data.type)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be a non-empty string when provided",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name"]
          : ["type", "mimeType", "size", "sha256"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.type === "folder") {
    if (!isNonEmptyString(data.name)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.name must be a non-empty string",
      );
    }
    return;
  }

  if (!isNonEmptyString(data.mimeType)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.mimeType must be a non-empty string",
    );
  }

  if (!isFiniteNumber(data.size)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.size must be a finite number",
    );
  }

  if (!isNonEmptyString(data.sha256)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.sha256 must be a non-empty string",
    );
  }
};

const validateReferencedFilesInData = ({
  state,
  data,
  fields,
  nullableFields = [],
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  for (const field of fields) {
    const fileId = data[field];

    if (fileId === undefined) {
      continue;
    }

    if (fileId === null && nullableFields.includes(field)) {
      continue;
    }

    const result = validateFileReference({
      state,
      fileId,
      path: `payload.data.${field}`,
      details: {
        ...details,
        field,
        fileId,
      },
      errorFactory,
    });
    if (!result.valid) {
      return result;
    }
  }

  return VALID_RESULT;
};

const validateColorCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "color") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'color'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : ["type", "name", "description", "tagIds", "hex"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "color") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isHexColor(data.hex)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.hex must be a #RRGGBB string",
      );
    }
  }
};

const validateColorUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["name", "description", "tagIds", "hex"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.hex !== undefined && !isHexColor(data.hex)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.hex must be a #RRGGBB string when provided",
    );
  }
};

const validateAnimationCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "animation") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'animation'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "thumbnailFileId",
              "preview",
              "animation",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "animation") {
    if (
      data.thumbnailFileId !== undefined &&
      !isNonEmptyString(data.thumbnailFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.thumbnailFileId must be a non-empty string when provided",
      );
    }

    {
      const result = validateAnimationPreviewObject({
        value: data.preview,
        path: "payload.data.preview",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateAnimationDefinition({
        animation: data.animation,
        path: "payload.data.animation",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateAnimationUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "thumbnailFileId",
        "preview",
        "animation",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  {
    const result = validateAnimationPreviewObject({
      value: data.preview,
      path: "payload.data.preview",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.animation !== undefined) {
    {
      const result = validateAnimationDefinition({
        animation: data.animation,
        path: "payload.data.animation",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateTransformCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "transform") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'transform'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "x",
              "y",
              "scaleX",
              "scaleY",
              "anchorX",
              "anchorY",
              "rotation",
              "thumbnailFileId",
              "previewFileId",
              "preview",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "transform") {
    for (const fieldName of ["thumbnailFileId", "previewFileId"]) {
      const fileId = data[fieldName];
      if (fileId !== undefined && !isNonEmptyString(fileId)) {
        return invalidFromErrorFactory(
          errorFactory,
          `payload.data.${fieldName} must be a non-empty string when provided`,
        );
      }
    }

    {
      const result = validateTransformPreviewObject({
        value: data.preview,
        path: "payload.data.preview",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    for (const key of [
      "x",
      "y",
      "scaleX",
      "scaleY",
      "anchorX",
      "anchorY",
      "rotation",
    ]) {
      if (!isFiniteNumber(data[key])) {
        return invalidFromErrorFactory(
          errorFactory,
          `payload.data.${key} must be a finite number`,
        );
      }
    }
  }
};

const validateParticleCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "particle") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'particle'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "width",
              "height",
              "seed",
              "modules",
              "thumbnailFileId",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type !== "particle") {
    return;
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isFiniteNumber(data.width) || data.width <= 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.width must be a positive finite number",
    );
  }

  if (!isFiniteNumber(data.height) || data.height <= 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.height must be a positive finite number",
    );
  }

  if (
    data.seed !== undefined &&
    data.seed !== null &&
    !isFiniteNumber(data.seed)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.seed must be a finite number when provided",
    );
  }

  {
    const result = validateParticleModules({
      modules: data.modules,
      path: "payload.data.modules",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateParticleUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "width",
        "height",
        "seed",
        "modules",
        "thumbnailFileId",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    data.width !== undefined &&
    (!isFiniteNumber(data.width) || data.width <= 0)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.width must be a positive finite number when provided",
    );
  }

  if (
    data.height !== undefined &&
    (!isFiniteNumber(data.height) || data.height <= 0)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.height must be a positive finite number when provided",
    );
  }

  if (
    data.seed !== undefined &&
    data.seed !== null &&
    !isFiniteNumber(data.seed)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.seed must be a finite number when provided",
    );
  }

  if (data.modules !== undefined) {
    {
      const result = validateParticleModules({
        modules: data.modules,
        path: "payload.data.modules",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateTransformUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "x",
        "y",
        "scaleX",
        "scaleY",
        "anchorX",
        "anchorY",
        "rotation",
        "thumbnailFileId",
        "previewFileId",
        "preview",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  for (const fieldName of ["thumbnailFileId", "previewFileId"]) {
    const fileId = data[fieldName];
    if (fileId !== undefined && !isNonEmptyString(fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `payload.data.${fieldName} must be a non-empty string when provided`,
      );
    }
  }

  {
    const result = validateTransformPreviewObject({
      value: data.preview,
      path: "payload.data.preview",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  for (const key of [
    "x",
    "y",
    "scaleX",
    "scaleY",
    "anchorX",
    "anchorY",
    "rotation",
  ]) {
    if (data[key] !== undefined && !isFiniteNumber(data[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `payload.data.${key} must be a finite number when provided`,
      );
    }
  }
};

const validateVariableCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "variable") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'variable'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "variableType",
              "name",
              "description",
              "tagIds",
              "scope",
              "default",
              "value",
              "isEnum",
              "enumValues",
              "computed",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "variable") {
    if (!VARIABLE_TYPE_KEYS.includes(data.variableType)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.variableType must be 'string', 'number', 'boolean', or 'object'",
      );
    }

    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateVariableEnumMetadata({
        data,
        variableType: data.variableType,
        path: "payload.data",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (data.computed !== undefined) {
      if (data.scope !== undefined) {
        return invalidFromErrorFactory(
          errorFactory,
          "payload.data.scope must be omitted for computed variables",
        );
      }
    } else if (!VARIABLE_SCOPE_KEYS.includes(data.scope)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.scope must be 'context', 'device', or 'account'",
      );
    }

    {
      const result = validateVariableStoredOrComputedData({
        data,
        variableType: data.variableType,
        path: "payload.data",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateVariableUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "scope",
        "default",
        "value",
        "isEnum",
        "enumValues",
        "computed",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.isEnum !== undefined && typeof data.isEnum !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.isEnum must be a boolean when provided",
    );
  }

  {
    const result = validateVariableEnumValues({
      value: data.enumValues,
      path: "payload.data.enumValues",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.computed !== undefined) {
    if (!isPlainObject(data.computed)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.computed must be an object when provided",
      );
    }
  }

  if (data.scope !== undefined && !VARIABLE_SCOPE_KEYS.includes(data.scope)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.scope must be 'context', 'device', or 'account' when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateTextStyleCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "textStyle") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'textStyle'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "fontId",
              "colorId",
              "fontSize",
              "lineHeight",
              "fontWeight",
              "previewText",
              "fontStyle",
              "breakWords",
              "align",
              "wordWrap",
              "wordWrapWidth",
              "strokeColorId",
              "strokeAlpha",
              "strokeWidth",
              "shadow",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "textStyle") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateTextStyleItems({
        items: {
          draft: {
            id: "draft",
            ...structuredClone(data),
          },
        },
        path: "payload.data",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateTextStyleUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "fontId",
        "colorId",
        "fontSize",
        "lineHeight",
        "fontWeight",
        "previewText",
        "fontStyle",
        "breakWords",
        "align",
        "wordWrap",
        "wordWrapWidth",
        "strokeColorId",
        "strokeAlpha",
        "strokeWidth",
        "shadow",
        "clearShadow",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.fontId !== undefined) {
    const result = validateRequiredStringOrUniqueIdArray({
      value: data.fontId,
      path: "payload.data.fontId",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  for (const key of ["colorId", "strokeColorId"]) {
    if (data[key] !== undefined && !isNonEmptyString(data[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `payload.data.${key} must be a non-empty string when provided`,
      );
    }
  }

  for (const key of ["fontSize", "lineHeight", "strokeAlpha", "strokeWidth"]) {
    if (data[key] !== undefined && !isFiniteNumber(data[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `payload.data.${key} must be a finite number when provided`,
      );
    }
  }

  for (const key of ["fontWeight", "previewText", "fontStyle"]) {
    if (data[key] !== undefined && !isString(data[key])) {
      return invalidFromErrorFactory(
        errorFactory,
        `payload.data.${key} must be a string when provided`,
      );
    }
  }

  if (data.shadow !== undefined) {
    const result = validateTextStyleShadow({
      shadow: data.shadow,
      path: "payload.data.shadow",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.clearShadow !== undefined && data.clearShadow !== true) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.clearShadow must be true when provided",
    );
  }

  if (data.shadow !== undefined && data.clearShadow === true) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.shadow and payload.data.clearShadow cannot both be provided",
    );
  }

  if (data.breakWords !== undefined && typeof data.breakWords !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.breakWords must be a boolean when provided",
    );
  }

  if (data.wordWrap !== undefined && typeof data.wordWrap !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.wordWrap must be a boolean when provided",
    );
  }

  if (data.wordWrapWidth !== undefined && !isFiniteNumber(data.wordWrapWidth)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.wordWrapWidth must be a finite number when provided",
    );
  }

  if (
    data.align !== undefined &&
    !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(data.align)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.align must be 'left', 'center', or 'right' when provided",
    );
  }
};

const validateCharacterSpriteCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "image") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'image'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "fileId",
              "thumbnailFileId",
              "width",
              "height",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "image") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string",
      );
    }

    if (
      data.thumbnailFileId !== undefined &&
      !isNonEmptyString(data.thumbnailFileId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.thumbnailFileId must be a non-empty string when provided",
      );
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.width must be a finite number when provided",
      );
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.height must be a finite number when provided",
      );
    }
  }
};

const validateCharacterSpriteUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "fileId",
        "thumbnailFileId",
        "width",
        "height",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.width must be a finite number when provided",
    );
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.height must be a finite number when provided",
    );
  }
};

const validateCharacterCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "character") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'character'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "spriteGroups",
              "shortcut",
              "nameVariableId",
              "fileId",
              "sprites",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "character") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateCharacterSpriteGroups({
        value: data.spriteGroups,
        path: "payload.data.spriteGroups",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (data.shortcut !== undefined && !isString(data.shortcut)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.shortcut must be a string when provided",
      );
    }

    if (
      data.nameVariableId !== undefined &&
      !isNonEmptyString(data.nameVariableId)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.nameVariableId must be a non-empty string when provided",
      );
    }

    if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.fileId must be a non-empty string when provided",
      );
    }

    if (data.sprites !== undefined) {
      {
        const result = validateNestedCollection({
          collection: data.sprites,
          path: "payload.data.sprites",
          itemValidator: ({ items, path, errorFactory }) =>
            validateCharacterSpriteItems({
              items,
              path,
              errorFactory,
              allowTagIds: false,
            }),
          treeValidator: validateGenericFolderOwnership,
          folderLabel: "folder sprite item",
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateCharacterUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "spriteGroups",
        "shortcut",
        "nameVariableId",
        "fileId",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (data.shortcut !== undefined && !isString(data.shortcut)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.shortcut must be a string when provided",
    );
  }

  if (
    data.nameVariableId !== undefined &&
    data.nameVariableId !== "" &&
    !isNonEmptyString(data.nameVariableId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.nameVariableId must be a non-empty string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteGroups({
      value: data.spriteGroups,
      path: "payload.data.spriteGroups",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.fileId must be a non-empty string when provided",
    );
  }
};

const validateLayoutCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "layout") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'layout'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "layoutType",
              "layoutSchemaVersion",
              "isFragment",
              "thumbnailFileId",
              "preview",
              "elements",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  {
    const result = validatePreviewObject({
      value: data.preview,
      path: "payload.data.preview",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.type === "layout") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!LAYOUT_TYPE_KEYS.includes(data.layoutType)) {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.layoutType must be 'general', 'save-load', 'confirmDialog', 'dialogue-adv', 'dialogue-nvl', 'choice', 'history', or 'input'",
      );
    }

    if (
      data.layoutSchemaVersion !== undefined &&
      !isSupportedLayoutSchemaVersion(data.layoutSchemaVersion)
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `payload.data.layoutSchemaVersion must be ${CURRENT_LAYOUT_SCHEMA_VERSION} when provided`,
      );
    }

    if (data.isFragment !== undefined && typeof data.isFragment !== "boolean") {
      return invalidFromErrorFactory(
        errorFactory,
        "payload.data.isFragment must be a boolean when provided",
      );
    }

    {
      const result = validateNestedCollection({
        collection: data.elements,
        path: "payload.data.elements",
        itemValidator: validateLayoutElementItems,
        treeValidator: validateLayoutElementTreeOwnership,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateLayoutUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "layoutType",
        "isFragment",
        "thumbnailFileId",
        "preview",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  {
    const result = validatePreviewObject({
      value: data.preview,
      path: "payload.data.preview",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    data.layoutType !== undefined &&
    !LAYOUT_TYPE_KEYS.includes(data.layoutType)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.layoutType must be 'general', 'save-load', 'confirmDialog', 'dialogue-adv', 'dialogue-nvl', 'choice', 'history', or 'input' when provided",
    );
  }

  if (data.isFragment !== undefined && typeof data.isFragment !== "boolean") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.isFragment must be a boolean when provided",
    );
  }
};

const validateControlCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && data.type !== "control") {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or 'control'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : [
              "type",
              "name",
              "description",
              "tagIds",
              "thumbnailFileId",
              "preview",
              "elements",
              "keyboard",
              "keyup",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  {
    const result = validatePreviewObject({
      value: data.preview,
      path: "payload.data.preview",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (data.type === "control") {
    {
      const result = validateOptionalUniqueIdArray({
        value: data.tagIds,
        path: "payload.data.tagIds",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateNestedCollection({
        collection: data.elements,
        path: "payload.data.elements",
        itemValidator: validateLayoutElementItems,
        treeValidator: validateLayoutElementTreeOwnership,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateKeyboardMap({
        value: data.keyboard,
        path: "payload.data.keyboard",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    {
      const result = validateKeyboardMap({
        value: data.keyup,
        path: "payload.data.keyup",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }
};

const validateControlUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: [
        "name",
        "description",
        "tagIds",
        "keyboard",
        "keyup",
        "thumbnailFileId",
        "preview",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.description must be a string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  {
    const result = validatePreviewObject({
      value: data.preview,
      path: "payload.data.preview",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = validateKeyboardMap({
      value: data.keyboard,
      path: "payload.data.keyboard",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = validateKeyboardMap({
      value: data.keyup,
      path: "payload.data.keyup",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  {
    const result = validateOptionalUniqueIdArray({
      value: data.tagIds,
      path: "payload.data.tagIds",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateLayoutElementCreateData = ({ data, errorFactory }) => {
  {
    const result = validateLayoutElementData({
      data,
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }
};

const validateLayoutElementUpdateData = ({ data, errorFactory, replace }) => {
  {
    const result = validateLayoutElementData({
      data,
      path: "payload.data",
      errorFactory,
      allowPartial: replace !== true,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (replace !== true && Object.keys(data).length === 0) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must include at least one updatable field",
    );
  }
};

const validateVisualElementReferenceTargets = ({
  ownerIdField,
  ownerId,
  ownerLabel,
  elementId,
  data,
  state,
  errorFactory,
}) => {
  if (
    data.dateFormat !== undefined &&
    data.type !== "text-ref-save-load-slot-date"
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${ownerLabel} element dateFormat can only be provided for save/load date elements`,
      {
        [ownerIdField]: ownerId,
        elementId,
        field: "dateFormat",
      },
    );
  }

  if (data.blur !== undefined && data.type !== "sprite") {
    return invalidFromErrorFactory(
      errorFactory,
      `${ownerLabel} element blur can only be provided for sprite elements`,
      {
        [ownerIdField]: ownerId,
        elementId,
        field: "blur",
      },
    );
  }

  if (
    data.indicator !== undefined &&
    !LAYOUT_TEXT_REVEAL_INDICATOR_ELEMENT_TYPES.includes(data.type)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${ownerLabel} element indicator can only be provided for text revealing elements`,
      {
        [ownerIdField]: ownerId,
        elementId,
        field: "indicator",
      },
    );
  }

  if (
    data.content !== undefined &&
    !LAYOUT_TEXT_CONTENT_ELEMENT_TYPES.includes(data.type)
  ) {
    return invalidFromErrorFactory(
      errorFactory,
      `${ownerLabel} element content can only be provided for text elements`,
      {
        [ownerIdField]: ownerId,
        elementId,
        field: "content",
      },
    );
  }

  if (
    data.type === "spritesheet-animation" ||
    data.resourceId !== undefined ||
    data.animationName !== undefined
  ) {
    const spritesheet = state.spritesheets?.items?.[data.resourceId];
    if (!isPlainObject(spritesheet) || spritesheet.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element resourceId must reference an existing non-folder spritesheet`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "resourceId",
          targetId: data.resourceId,
        },
      );
    }

    if (
      !isNonEmptyString(data.animationName) ||
      !isPlainObject(spritesheet.animations?.[data.animationName])
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element animationName must reference an existing spritesheet animation`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "animationName",
          targetId: data.animationName,
        },
      );
    }
  }

  if (data.type === "particle" || data.particleId !== undefined) {
    const particle = state.particles?.items?.[data.particleId];
    if (!isPlainObject(particle) || particle.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element particleId must reference an existing non-folder particle`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "particleId",
          targetId: data.particleId,
        },
      );
    }
  }

  if (data.imageId !== undefined) {
    const image = state.images.items[data.imageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element imageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "imageId",
          targetId: data.imageId,
        },
      );
    }
  }

  if (data.hoverImageId !== undefined) {
    const image = state.images.items[data.hoverImageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element hoverImageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "hoverImageId",
          targetId: data.hoverImageId,
        },
      );
    }
  }

  if (data.clickImageId !== undefined) {
    const image = state.images.items[data.clickImageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element clickImageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "clickImageId",
          targetId: data.clickImageId,
        },
      );
    }
  }

  for (const stateName of ["revealing", "complete"]) {
    const visual = data.indicator?.[stateName];
    if (
      visual?.kind === "spritesheet" ||
      visual?.resourceId !== undefined ||
      visual?.animationName !== undefined
    ) {
      const spritesheet = state.spritesheets?.items?.[visual.resourceId];
      if (!isPlainObject(spritesheet) || spritesheet.type === "folder") {
        return invalidFromErrorFactory(
          errorFactory,
          `${ownerLabel} element indicator.${stateName}.resourceId must reference an existing non-folder spritesheet`,
          {
            [ownerIdField]: ownerId,
            elementId,
            field: `indicator.${stateName}.resourceId`,
            targetId: visual.resourceId,
          },
        );
      }

      if (
        !isNonEmptyString(visual.animationName) ||
        !isPlainObject(spritesheet.animations?.[visual.animationName])
      ) {
        return invalidFromErrorFactory(
          errorFactory,
          `${ownerLabel} element indicator.${stateName}.animationName must reference an existing spritesheet animation`,
          {
            [ownerIdField]: ownerId,
            elementId,
            field: `indicator.${stateName}.animationName`,
            targetId: visual.animationName,
          },
        );
      }

      continue;
    }

    const imageId = visual?.imageId;
    if (imageId === undefined) {
      continue;
    }

    const image = state.images.items[imageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element indicator.${stateName}.imageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: `indicator.${stateName}.imageId`,
          targetId: imageId,
        },
      );
    }
  }

  if (data.hoverSoundId !== undefined) {
    const sound = state.sounds.items[data.hoverSoundId];
    if (!isPlainObject(sound) || sound.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element hoverSoundId must reference an existing non-folder sound`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "hoverSoundId",
          targetId: data.hoverSoundId,
        },
      );
    }
  }

  if (data.clickSoundId !== undefined) {
    const sound = state.sounds.items[data.clickSoundId];
    if (!isPlainObject(sound) || sound.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element clickSoundId must reference an existing non-folder sound`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "clickSoundId",
          targetId: data.clickSoundId,
        },
      );
    }
  }

  if (data.revealSoundId !== undefined) {
    const sound = state.sounds.items[data.revealSoundId];
    if (!isPlainObject(sound) || sound.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element revealSoundId must reference an existing non-folder sound`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "revealSoundId",
          targetId: data.revealSoundId,
        },
      );
    }
  }

  if (data.thumbImageId !== undefined) {
    const image = state.images.items[data.thumbImageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element thumbImageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "thumbImageId",
          targetId: data.thumbImageId,
        },
      );
    }
  }

  if (data.hoverThumbImageId !== undefined) {
    const image = state.images.items[data.hoverThumbImageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element hoverThumbImageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "hoverThumbImageId",
          targetId: data.hoverThumbImageId,
        },
      );
    }
  }

  if (data.barImageId !== undefined) {
    const image = state.images.items[data.barImageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element barImageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "barImageId",
          targetId: data.barImageId,
        },
      );
    }
  }

  if (data.hoverBarImageId !== undefined) {
    const image = state.images.items[data.hoverBarImageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element hoverBarImageId must reference an existing non-folder image`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "hoverBarImageId",
          targetId: data.hoverBarImageId,
        },
      );
    }
  }

  if (data.textStyleId !== undefined) {
    const textStyle = state.textStyles.items[data.textStyleId];
    if (!isPlainObject(textStyle) || textStyle.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element textStyleId must reference an existing non-folder text style`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "textStyleId",
          targetId: data.textStyleId,
        },
      );
    }
  }

  if (data.hoverTextStyleId !== undefined) {
    const textStyle = state.textStyles.items[data.hoverTextStyleId];
    if (!isPlainObject(textStyle) || textStyle.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element hoverTextStyleId must reference an existing non-folder text style`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "hoverTextStyleId",
          targetId: data.hoverTextStyleId,
        },
      );
    }
  }

  if (data.clickTextStyleId !== undefined) {
    const textStyle = state.textStyles.items[data.clickTextStyleId];
    if (!isPlainObject(textStyle) || textStyle.type === "folder") {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element clickTextStyleId must reference an existing non-folder text style`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: "clickTextStyleId",
          targetId: data.clickTextStyleId,
        },
      );
    }
  }

  if (Array.isArray(data.conditionalOverrides)) {
    for (let index = 0; index < data.conditionalOverrides.length; index += 1) {
      const rule = data.conditionalOverrides[index];

      for (const field of [
        "textStyleId",
        "hoverTextStyleId",
        "clickTextStyleId",
      ]) {
        if (rule?.set?.[field] === undefined) {
          continue;
        }

        const textStyle = state.textStyles.items[rule.set[field]];
        if (!isPlainObject(textStyle) || textStyle.type === "folder") {
          return invalidFromErrorFactory(
            errorFactory,
            `${ownerLabel} element conditionalOverrides.${index}.set.${field} must reference an existing non-folder text style`,
            {
              [ownerIdField]: ownerId,
              elementId,
              field: `conditionalOverrides.${index}.set.${field}`,
              targetId: rule.set[field],
            },
          );
        }
      }

      for (const field of ["hoverSoundId", "clickSoundId"]) {
        if (rule?.set?.[field] === undefined) {
          continue;
        }

        const sound = state.sounds.items[rule.set[field]];
        if (!isPlainObject(sound) || sound.type === "folder") {
          return invalidFromErrorFactory(
            errorFactory,
            `${ownerLabel} element conditionalOverrides.${index}.set.${field} must reference an existing non-folder sound`,
            {
              [ownerIdField]: ownerId,
              elementId,
              field: `conditionalOverrides.${index}.set.${field}`,
              targetId: rule.set[field],
            },
          );
        }
      }

      for (const field of ["imageId", "hoverImageId", "clickImageId"]) {
        if (rule?.set?.[field] === undefined) {
          continue;
        }

        const image = state.images.items[rule.set[field]];
        if (!isPlainObject(image) || image.type === "folder") {
          return invalidFromErrorFactory(
            errorFactory,
            `${ownerLabel} element conditionalOverrides.${index}.set.${field} must reference an existing non-folder image`,
            {
              [ownerIdField]: ownerId,
              elementId,
              field: `conditionalOverrides.${index}.set.${field}`,
              targetId: rule.set[field],
            },
          );
        }
      }

      if (!isLayoutConditionTarget(state, rule?.when?.target)) {
        return invalidFromErrorFactory(
          errorFactory,
          `${ownerLabel} element conditionalOverrides.${index}.when.target must reference an existing variable or supported layout condition`,
          {
            [ownerIdField]: ownerId,
            elementId,
            field: `conditionalOverrides.${index}.when.target`,
            targetId: rule?.when?.target,
          },
        );
      }
    }
  }

  for (const { index, resourceId } of getLayoutTextContentReferenceEntries(
    data.content,
  )) {
    if (!isVariableReferenceTarget(state, resourceId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element content.${index}.reference.resourceId must reference an existing non-folder variable`,
        {
          [ownerIdField]: ownerId,
          elementId,
          field: `content.${index}.reference.resourceId`,
          targetId: resourceId,
        },
      );
    }
  }

  if (data.variableId !== undefined) {
    if (!isVariableReferenceTarget(state, data.variableId)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element variableId must reference an existing non-folder variable`,
        {
          [ownerIdField]: ownerId,
          elementId,
          variableId: data.variableId,
        },
      );
    }
  }

  if (data.fragmentLayoutId !== undefined) {
    const fragmentLayout = state.layouts.items[data.fragmentLayoutId];
    if (
      !isPlainObject(fragmentLayout) ||
      fragmentLayout.type !== "layout" ||
      fragmentLayout.isFragment !== true
    ) {
      return invalidFromErrorFactory(
        errorFactory,
        `${ownerLabel} element fragmentLayoutId must reference an existing fragment layout`,
        {
          [ownerIdField]: ownerId,
          elementId,
          fragmentLayoutId: data.fragmentLayoutId,
        },
      );
    }
  }
};

const getTreeIdsInOrder = ({ nodes }) => {
  const ids = [];

  const walk = (entries) => {
    if (!Array.isArray(entries)) {
      return;
    }

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      ids.push(entry.id);
      walk(entry.children);
    }
  };

  walk(nodes);
  return ids;
};

const findFirstNonFolderSceneId = ({ state }) => {
  const orderedSceneIds = getTreeIdsInOrder({
    nodes: state.scenes.tree,
  });

  for (const sceneId of orderedSceneIds) {
    if (state.scenes.items[sceneId]?.type !== "folder") {
      return sceneId;
    }
  }

  return null;
};

const getNodeParentId = ({ tree, nodeId }) =>
  findTreeParentId({
    nodes: tree,
    nodeId,
  }) ?? null;

const removeNodeOrResult = ({ tree, nodeId, errorMessage }) => {
  const node = removeTreeNode({
    nodes: tree,
    nodeId,
  });

  if (!node) {
    return invalidInvariant(errorMessage, {
      nodeId,
    });
  }

  return {
    valid: true,
    node,
  };
};

const createEmptyNestedCollection = () => ({
  items: {},
  tree: [],
});

const isDirectedLayoutContainer = (item) =>
  item?.direction === "horizontal" || item?.direction === "vertical";

const upgradeLayoutTreeOrder = ({ nodes, items, parentItem } = {}) => {
  const sourceNodes = Array.isArray(nodes) ? nodes : [];
  const orderedNodes = isDirectedLayoutContainer(parentItem)
    ? sourceNodes
    : [...sourceNodes].reverse();

  return orderedNodes.map((node) => {
    const nextNode = {
      ...node,
    };

    if (Array.isArray(node?.children) && node.children.length > 0) {
      nextNode.children = upgradeLayoutTreeOrder({
        nodes: node.children,
        items,
        parentItem: items?.[node.id],
      });
    }

    return nextNode;
  });
};

const findSectionLocation = ({ state, sectionId }) => {
  for (const [sceneId, scene] of Object.entries(state.scenes.items)) {
    if (scene?.type !== "scene") {
      continue;
    }

    const sections = scene.sections ?? createEmptyNestedCollection();
    if (isPlainObject(sections?.items?.[sectionId])) {
      const section = sections.items[sectionId];
      return {
        sceneId,
        scene,
        sections,
        section,
        lines: section.lines ?? createEmptyNestedCollection(),
      };
    }
  }

  return undefined;
};

const findLineLocation = ({ state, lineId }) => {
  for (const [sceneId, scene] of Object.entries(state.scenes.items)) {
    if (scene?.type !== "scene") {
      continue;
    }

    const sections = scene.sections ?? createEmptyNestedCollection();

    for (const [sectionId, section] of Object.entries(sections.items)) {
      const lines = section.lines ?? createEmptyNestedCollection();
      if (isPlainObject(lines.items?.[lineId])) {
        return {
          sceneId,
          scene,
          sectionId,
          section,
          lines,
          line: lines.items[lineId],
        };
      }
    }
  }

  return undefined;
};

const createFolderedCollectionCommandDefinitions = ({
  familyName,
  collectionKey,
  idField,
  itemLabel,
  createDataValidator,
  updateDataValidator,
  createItem,
  updateItem = ({ currentItem, payload }) => ({
    ...structuredClone(currentItem),
    ...structuredClone(payload.data),
  }),
  validateCreateState = () => {},
  validateUpdateState = () => {},
  validateDeleteState = () => {},
  afterDelete = () => {},
  includeUpdate = true,
  reservedItemIds = [],
}) => {
  const existingMessage = `payload.${idField} must reference an existing ${itemLabel}`;
  const duplicateMessage = `payload.${idField} must not already exist`;
  const parentMessage = `payload.parentId must reference a folder ${itemLabel}`;
  const targetMessage = `payload.positionTargetId must reference an existing ${itemLabel}`;
  const siblingMessage =
    "payload.positionTargetId must reference a sibling under payload.parentId";
  const moveTargetMessage = `payload.positionTargetId must not reference the moved ${itemLabel}`;
  const moveParentMessage = `payload.parentId must not target the moved ${itemLabel} or its descendants`;
  const deleteArrayField = `${idField}s`;

  return [
    {
      type: `${familyName}.create`,
      validatePayload: ({ payload }) => {
        let result = captureValidation(() =>
          validateAllowedKeys({
            value: payload,
            allowedKeys: [
              idField,
              "parentId",
              "data",
              "index",
              "position",
              "positionTargetId",
            ],
            path: "payload",
            errorFactory: createPayloadValidationError,
          }),
        );
        if (!result.valid) {
          return result;
        }

        if (!isNonEmptyString(payload[idField])) {
          return invalidPayload(
            `payload.${idField} must be a non-empty string`,
          );
        }

        if (reservedItemIds.includes(payload[idField])) {
          return invalidPayload(
            `payload.${idField} must not use reserved id '${payload[idField]}'`,
          );
        }

        if (
          payload.parentId !== undefined &&
          payload.parentId !== null &&
          !isNonEmptyString(payload.parentId)
        ) {
          return invalidPayload(
            "payload.parentId must be a non-empty string when provided",
          );
        }

        result = captureValidation(() =>
          createDataValidator({
            data: payload.data,
            errorFactory: createPayloadValidationError,
          }),
        );
        if (!result.valid) {
          return result;
        }

        result = captureValidation(() =>
          validatePlacementFields({
            payload,
            errorFactory: createPayloadValidationError,
          }),
        );
        if (!result.valid) {
          return result;
        }

        return VALID_RESULT;
      },
      validateAgainstState: ({ state, payload }) => {
        const collection = state[collectionKey];
        if (isPlainObject(collection.items[payload[idField]])) {
          return invalidPrecondition(duplicateMessage);
        }

        const parentId = payload.parentId ?? null;
        if (parentId !== null) {
          const parentItem = collection.items[parentId];
          if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
            return invalidPrecondition(parentMessage);
          }
        }

        if (payload.positionTargetId !== undefined) {
          if (!isPlainObject(collection.items[payload.positionTargetId])) {
            return invalidPrecondition(targetMessage);
          }

          const targetParentId = getNodeParentId({
            tree: collection.tree,
            nodeId: payload.positionTargetId,
          });

          if (targetParentId !== parentId) {
            return invalidPrecondition(siblingMessage);
          }
        }

        const result = captureValidation(() =>
          validateCreateState({ state, payload }),
        );
        if (!result.valid) {
          return result;
        }

        return VALID_RESULT;
      },
      reduce: ({ state, payload }) => {
        state[collectionKey].items[payload[idField]] = createItem({ payload });

        insertTreeNode({
          tree: state[collectionKey].tree,
          node: {
            id: payload[idField],
            children: [],
          },
          parentId: payload.parentId ?? null,
          index: payload.index,
          position: payload.position,
          positionTargetId: payload.positionTargetId,
        });

        return state;
      },
    },
    ...(includeUpdate
      ? [
          {
            type: `${familyName}.update`,
            validatePayload: ({ payload }) => {
              let result = captureValidation(() =>
                validateExactKeys({
                  value: payload,
                  expectedKeys: [idField, "data"],
                  path: "payload",
                  errorFactory: createPayloadValidationError,
                }),
              );
              if (!result.valid) {
                return result;
              }

              if (!isNonEmptyString(payload[idField])) {
                return invalidPayload(
                  `payload.${idField} must be a non-empty string`,
                );
              }

              result = captureValidation(() =>
                updateDataValidator({
                  data: payload.data,
                  errorFactory: createPayloadValidationError,
                }),
              );
              if (!result.valid) {
                return result;
              }

              return VALID_RESULT;
            },
            validateAgainstState: ({ state, payload }) => {
              const currentItem = state[collectionKey].items[payload[idField]];
              if (!isPlainObject(currentItem)) {
                return invalidPrecondition(existingMessage);
              }

              const result = captureValidation(() =>
                validateUpdateState({
                  state,
                  payload,
                  currentItem,
                }),
              );
              if (!result.valid) {
                return result;
              }

              return VALID_RESULT;
            },
            reduce: ({ state, payload }) => {
              const currentItem = state[collectionKey].items[payload[idField]];
              state[collectionKey].items[payload[idField]] = updateItem({
                state,
                payload,
                currentItem,
              });
              return state;
            },
          },
        ]
      : []),
    {
      type: `${familyName}.delete`,
      validatePayload: ({ payload }) => {
        let result = captureValidation(() =>
          validateExactKeys({
            value: payload,
            expectedKeys: [deleteArrayField],
            path: "payload",
            errorFactory: createPayloadValidationError,
          }),
        );
        if (!result.valid) {
          return result;
        }

        result = captureValidation(() =>
          validateRequiredUniqueIdArray({
            value: payload[deleteArrayField],
            path: `payload.${deleteArrayField}`,
            errorFactory: createPayloadValidationError,
          }),
        );
        if (!result.valid) {
          return result;
        }

        return VALID_RESULT;
      },
      validateAgainstState: ({ state, payload }) => {
        for (const itemId of payload[deleteArrayField]) {
          if (!isPlainObject(state[collectionKey].items[itemId])) {
            return invalidPrecondition(
              `payload.${deleteArrayField} must reference existing ${itemLabel}s`,
              { itemId },
            );
          }
        }

        const result = captureValidation(() =>
          validateDeleteState({
            state,
            payload,
          }),
        );
        if (!result.valid) {
          return result;
        }

        return VALID_RESULT;
      },
      reduce: ({ state, payload }) => {
        const deletedIds = new Set();
        const deletedItemsById = new Map();

        for (const itemId of payload[deleteArrayField]) {
          const removedNode = removeTreeNode({
            nodes: state[collectionKey].tree,
            nodeId: itemId,
          });

          if (!removedNode) {
            continue;
          }

          for (const descendantId of collectTreeDescendantIds({
            node: removedNode,
          })) {
            deletedIds.add(descendantId);
            deletedItemsById.set(
              descendantId,
              state[collectionKey].items[descendantId],
            );
          }
        }

        for (const itemId of deletedIds) {
          delete state[collectionKey].items[itemId];
        }

        afterDelete({
          state,
          payload,
          deletedIds,
          deletedItemsById,
        });

        return state;
      },
    },
    {
      type: `${familyName}.move`,
      validatePayload: ({ payload }) => {
        let result = captureValidation(() =>
          validateAllowedKeys({
            value: payload,
            allowedKeys: [
              idField,
              "parentId",
              "index",
              "position",
              "positionTargetId",
            ],
            path: "payload",
            errorFactory: createPayloadValidationError,
          }),
        );
        if (!result.valid) {
          return result;
        }

        if (!isNonEmptyString(payload[idField])) {
          return invalidPayload(
            `payload.${idField} must be a non-empty string`,
          );
        }

        if (
          payload.parentId !== undefined &&
          payload.parentId !== null &&
          !isNonEmptyString(payload.parentId)
        ) {
          return invalidPayload(
            "payload.parentId must be a non-empty string when provided",
          );
        }

        result = captureValidation(() =>
          validatePlacementFields({
            payload,
            errorFactory: createPayloadValidationError,
          }),
        );
        if (!result.valid) {
          return result;
        }

        return VALID_RESULT;
      },
      validateAgainstState: ({ state, payload }) => {
        const collection = state[collectionKey];
        const currentItem = collection.items[payload[idField]];
        if (!isPlainObject(currentItem)) {
          return invalidPrecondition(existingMessage);
        }

        const currentNode = findTreeNode({
          nodes: collection.tree,
          nodeId: payload[idField],
        });

        if (payload.parentId !== undefined && payload.parentId !== null) {
          const parentItem = collection.items[payload.parentId];
          if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
            return invalidPrecondition(parentMessage);
          }

          const descendantIds = new Set(
            collectTreeDescendantIds({
              node: currentNode,
            }),
          );

          if (descendantIds.has(payload.parentId)) {
            return invalidPrecondition(moveParentMessage);
          }
        }

        if (payload.positionTargetId !== undefined) {
          if (payload.positionTargetId === payload[idField]) {
            return invalidPrecondition(moveTargetMessage);
          }

          if (!isPlainObject(collection.items[payload.positionTargetId])) {
            return invalidPrecondition(targetMessage);
          }

          const targetParentId = getNodeParentId({
            tree: collection.tree,
            nodeId: payload.positionTargetId,
          });

          if (targetParentId !== (payload.parentId ?? null)) {
            return invalidPrecondition(siblingMessage);
          }
        }

        return VALID_RESULT;
      },
      reduce: ({ state, payload }) => {
        const nodeResult = removeNodeOrResult({
          tree: state[collectionKey].tree,
          nodeId: payload[idField],
          errorMessage: `${familyName} move target missing from tree`,
        });
        if (!nodeResult.valid) {
          return nodeResult;
        }

        insertTreeNode({
          tree: state[collectionKey].tree,
          node: nodeResult.node,
          parentId: payload.parentId ?? null,
          index: payload.index,
          position: payload.position,
          positionTargetId: payload.positionTargetId,
        });

        return state;
      },
    },
  ];
};

const getCharacterSpriteCollection = ({ state, characterId }) =>
  state.characters.items[characterId]?.sprites;

const getLayoutElementCollection = ({ state, layoutId }) =>
  state.layouts.items[layoutId]?.elements;

const getControlElementCollection = ({ state, controlId }) =>
  state.controls.items[controlId]?.elements;

const findReferencedFileUsage = ({ state, fileId }) => {
  for (const [imageId, image] of Object.entries(state.images.items)) {
    if (image.type !== "image") {
      continue;
    }

    if (image.fileId === fileId) {
      return {
        kind: "image",
        field: "fileId",
        ownerId: imageId,
      };
    }

    if (image.thumbnailFileId === fileId) {
      return {
        kind: "image",
        field: "thumbnailFileId",
        ownerId: imageId,
      };
    }
  }

  for (const [spritesheetId, spritesheet] of Object.entries(
    state.spritesheets.items,
  )) {
    if (spritesheet.type !== "spritesheet") {
      continue;
    }

    if (spritesheet.fileId === fileId) {
      return {
        kind: "spritesheet",
        field: "fileId",
        ownerId: spritesheetId,
      };
    }

    if (spritesheet.thumbnailFileId === fileId) {
      return {
        kind: "spritesheet",
        field: "thumbnailFileId",
        ownerId: spritesheetId,
      };
    }
  }

  for (const [soundId, sound] of Object.entries(state.sounds.items)) {
    if (sound.type !== "sound") {
      continue;
    }

    if (sound.fileId === fileId) {
      return {
        kind: "sound",
        field: "fileId",
        ownerId: soundId,
      };
    }

    if (sound.waveformDataFileId === fileId) {
      return {
        kind: "sound",
        field: "waveformDataFileId",
        ownerId: soundId,
      };
    }
  }

  for (const [voiceId, voice] of Object.entries(state.voices.items)) {
    if (voice.type !== "voice") {
      continue;
    }

    if (voice.fileId === fileId) {
      return {
        kind: "voice",
        field: "fileId",
        ownerId: voiceId,
      };
    }

    if (voice.waveformDataFileId === fileId) {
      return {
        kind: "voice",
        field: "waveformDataFileId",
        ownerId: voiceId,
      };
    }
  }

  for (const [videoId, video] of Object.entries(state.videos.items)) {
    if (video.type !== "video") {
      continue;
    }

    if (video.fileId === fileId) {
      return {
        kind: "video",
        field: "fileId",
        ownerId: videoId,
      };
    }

    if (video.thumbnailFileId === fileId) {
      return {
        kind: "video",
        field: "thumbnailFileId",
        ownerId: videoId,
      };
    }
  }

  for (const [fontId, font] of Object.entries(state.fonts.items)) {
    if (font.type !== "font") {
      continue;
    }

    if (font.fileId === fileId) {
      return {
        kind: "font",
        field: "fileId",
        ownerId: fontId,
      };
    }
  }

  for (const [animationId, animation] of Object.entries(
    state.animations.items,
  )) {
    if (animation.type !== "animation") {
      continue;
    }

    if (animation.thumbnailFileId === fileId) {
      return {
        kind: "animation",
        field: "thumbnailFileId",
        ownerId: animationId,
      };
    }
  }

  for (const [transformId, transform] of Object.entries(
    state.transforms.items,
  )) {
    if (transform.type !== "transform") {
      continue;
    }

    for (const fieldName of ["thumbnailFileId", "previewFileId"]) {
      if (transform[fieldName] === fileId) {
        return {
          kind: "transform",
          field: fieldName,
          ownerId: transformId,
        };
      }
    }
  }

  for (const [characterId, character] of Object.entries(
    state.characters.items,
  )) {
    if (character.type !== "character") {
      continue;
    }

    if (character.fileId === fileId) {
      return {
        kind: "character",
        field: "fileId",
        ownerId: characterId,
      };
    }

    for (const [spriteId, sprite] of Object.entries(
      character.sprites?.items || {},
    )) {
      if (sprite.type !== "image") {
        continue;
      }

      if (sprite.fileId === fileId) {
        return {
          kind: "character.sprite",
          field: "fileId",
          ownerId: spriteId,
          characterId,
        };
      }

      if (sprite.thumbnailFileId === fileId) {
        return {
          kind: "character.sprite",
          field: "thumbnailFileId",
          ownerId: spriteId,
          characterId,
        };
      }
    }
  }

  for (const [particleId, particle] of Object.entries(state.particles.items)) {
    if (particle.type !== "particle") {
      continue;
    }

    if (particle.thumbnailFileId === fileId) {
      return {
        kind: "particle",
        field: "thumbnailFileId",
        ownerId: particleId,
      };
    }
  }

  return null;
};

const collectDeletedFileIds = ({ state, fileIds }) => {
  const deletedIds = new Set();

  for (const fileId of fileIds) {
    const node = findTreeNode({
      nodes: state.files.tree,
      nodeId: fileId,
    });

    if (!node) {
      deletedIds.add(fileId);
      continue;
    }

    for (const deletedId of collectTreeDescendantIds({ node })) {
      deletedIds.add(deletedId);
    }
  }

  return deletedIds;
};

const COMMAND_DEFINITIONS = [
  {
    type: "project.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["state"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      const stateResult = runValidateState({ state: payload.state });
      if (!stateResult.valid) {
        return stateResult;
      }
    },
    validateAgainstState: () => {},
    reduce: ({ payload }) =>
      structuredClone(normalizeStateCollections(payload.state)),
  },
  ...createFolderedCollectionCommandDefinitions({
    familyName: "file",
    collectionKey: "files",
    idField: "fileId",
    itemLabel: "file item",
    createDataValidator: validateFileCreateData,
    updateDataValidator: () => VALID_RESULT,
    includeUpdate: false,
    createItem: ({ payload }) =>
      payload.data.type === "folder"
        ? {
            id: payload.fileId,
            type: "folder",
            name: payload.data.name,
          }
        : {
            id: payload.fileId,
            mimeType: payload.data.mimeType,
            size: payload.data.size,
            sha256: payload.data.sha256,
          },
    validateDeleteState: ({ state, payload }) => {
      for (const fileId of collectDeletedFileIds({
        state,
        fileIds: payload.fileIds,
      })) {
        const usage = findReferencedFileUsage({ state, fileId });
        if (!usage) {
          continue;
        }

        return invalidPrecondition(
          `payload.fileIds cannot delete a referenced file`,
          {
            fileId,
            referenceKind: usage.kind,
            referenceField: usage.field,
            referenceOwnerId: usage.ownerId,
            ...(usage.characterId ? { characterId: usage.characterId } : {}),
          },
        );
      }
    },
  }),
  ...createFolderedCollectionCommandDefinitions({
    familyName: "spritesheet",
    collectionKey: "spritesheets",
    idField: "spritesheetId",
    itemLabel: "spritesheet item",
    createDataValidator: validateSpritesheetCreateData,
    updateDataValidator: validateSpritesheetUpdateData,
    createItem: ({ payload }) => {
      const item = {
        id: payload.spritesheetId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        item.description = payload.data.description;
      }

      if (payload.data.type !== "spritesheet") {
        return item;
      }

      item.fileId = payload.data.fileId;

      if (payload.data.thumbnailFileId !== undefined) {
        item.thumbnailFileId = payload.data.thumbnailFileId;
      }

      if (payload.data.sheetWidth !== undefined) {
        item.sheetWidth = payload.data.sheetWidth;
      }

      if (payload.data.sheetHeight !== undefined) {
        item.sheetHeight = payload.data.sheetHeight;
      }

      if (payload.data.frameCount !== undefined) {
        item.frameCount = payload.data.frameCount;
      }

      if (payload.data.width !== undefined) {
        item.width = payload.data.width;
      }

      if (payload.data.height !== undefined) {
        item.height = payload.data.height;
      }

      assignOptionalTagIds({
        target: item,
        tagIds: payload.data.tagIds,
      });

      item.jsonData = structuredClone(payload.data.jsonData);
      item.animations = structuredClone(payload.data.animations);

      return item;
    },
    updateItem: ({ currentItem, payload }) =>
      applyTagIdsUpdate({
        currentItem,
        data: payload.data,
      }),
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type !== "spritesheet") {
        return;
      }

      const fileResult = validateReferencedFilesInData({
        state,
        data: payload.data,
        fields: ["fileId", "thumbnailFileId"],
        details: {
          spritesheetId: payload.spritesheetId,
        },
      });
      if (!fileResult.valid) {
        return fileResult;
      }

      return validateTagIdsAgainstScope({
        state,
        tagIds: payload.data.tagIds,
        scopeKey: "spritesheets",
        path: "payload.data.tagIds",
        details: {
          spritesheetId: payload.spritesheetId,
        },
      });
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder spritesheet items cannot update spritesheet fields",
        );
      }

      if (currentItem.type === "spritesheet") {
        const fileResult = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "thumbnailFileId"],
          details: {
            spritesheetId: payload.spritesheetId,
          },
        });
        if (!fileResult.valid) {
          return fileResult;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "spritesheets",
          path: "payload.data.tagIds",
          details: {
            spritesheetId: payload.spritesheetId,
          },
        });
      }
    },
  }),
  {
    type: "story.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateExactKeys({
          value: payload.data,
          expectedKeys: ["initialSceneId"],
          path: "payload.data",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (
        payload.data.initialSceneId !== null &&
        !isNonEmptyString(payload.data.initialSceneId)
      ) {
        return invalidPayload(
          "payload.data.initialSceneId must be a non-empty string or null",
        );
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const initialSceneId = payload.data.initialSceneId;

      if (initialSceneId === null) {
        return;
      }

      const scene = state.scenes.items[initialSceneId];
      if (!isPlainObject(scene)) {
        return invalidPrecondition(
          "payload.data.initialSceneId must reference an existing scene",
        );
      }

      if (scene.type === "folder") {
        return invalidPrecondition(
          "payload.data.initialSceneId must reference a non-folder scene",
        );
      }
    },
    reduce: ({ state, payload }) => {
      state.story.initialSceneId = payload.data.initialSceneId;
      return state;
    },
  },
  {
    type: "scene.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "sceneId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.sceneId)) {
        return invalidPayload("payload.sceneId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateSceneCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (Object.hasOwn(state.scenes.items, payload.sceneId)) {
        return invalidPrecondition("payload.sceneId must not already exist");
      }

      const parentId = payload.parentId ?? null;

      if (parentId !== null) {
        const parentScene = state.scenes.items[parentId];
        if (!isPlainObject(parentScene)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing scene",
          );
        }

        if (parentScene.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder scene",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.scenes.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing scene",
          );
        }

        const targetParentId =
          findTreeParentId({
            nodes: state.scenes.tree,
            nodeId: payload.positionTargetId,
          }) ?? null;

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const nextScene = {
        id: payload.sceneId,
        type: payload.data.type ?? "scene",
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextScene.description = payload.data.description;
      }

      if (nextScene.type === "scene") {
        nextScene.sections = createEmptyNestedCollection();
      }

      if (payload.data.position !== undefined) {
        nextScene.position = structuredClone(payload.data.position);
      }

      state.scenes.items[payload.sceneId] = nextScene;

      insertTreeNode({
        tree: state.scenes.tree,
        node: {
          id: payload.sceneId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "scene.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["sceneId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.sceneId)) {
        return invalidPayload("payload.sceneId must be a non-empty string");
      }

      {
        const result = validateSceneUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (!isPlainObject(state.scenes.items[payload.sceneId])) {
        return invalidPrecondition(
          "payload.sceneId must reference an existing scene",
        );
      }
    },
    reduce: ({ state, payload }) => {
      const currentScene = state.scenes.items[payload.sceneId];
      const nextScene = structuredClone(currentScene);

      if (payload.data.name !== undefined) {
        nextScene.name = payload.data.name;
      }

      if (payload.data.description !== undefined) {
        nextScene.description = payload.data.description;
      }

      if (payload.data.position !== undefined) {
        nextScene.position = {
          ...(isPlainObject(nextScene.position) ? nextScene.position : {}),
          ...structuredClone(payload.data.position),
        };
      }

      state.scenes.items[payload.sceneId] = nextScene;
      return state;
    },
  },
  {
    type: "scene.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["sceneIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.sceneIds,
          path: "payload.sceneIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const sceneId of payload.sceneIds) {
        if (!isPlainObject(state.scenes.items[sceneId])) {
          return invalidPrecondition(
            "payload.sceneIds must reference existing scenes",
            { sceneId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedSceneIds = new Set();

      for (const sceneId of payload.sceneIds) {
        const removedNode = removeTreeNode({
          nodes: state.scenes.tree,
          nodeId: sceneId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedSceneIds.add(id);
        }
      }

      for (const sceneId of deletedSceneIds) {
        delete state.scenes.items[sceneId];
      }

      if (
        state.story.initialSceneId !== null &&
        !isPlainObject(state.scenes.items[state.story.initialSceneId])
      ) {
        state.story.initialSceneId = findFirstNonFolderSceneId({ state });
      }

      return state;
    },
  },
  {
    type: "scene.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "sceneId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.sceneId)) {
        return invalidPayload("payload.sceneId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const scene = state.scenes.items[payload.sceneId];
      if (!isPlainObject(scene)) {
        return invalidPrecondition(
          "payload.sceneId must reference an existing scene",
        );
      }

      const sceneNode = findTreeNode({
        nodes: state.scenes.tree,
        nodeId: payload.sceneId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentScene = state.scenes.items[payload.parentId];
        if (!isPlainObject(parentScene)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing scene",
          );
        }

        if (parentScene.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder scene",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: sceneNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved scene or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.sceneId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved scene",
          );
        }

        if (!isPlainObject(state.scenes.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing scene",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.scenes.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const sceneNodeResult = removeNodeOrResult({
        tree: state.scenes.tree,
        nodeId: payload.sceneId,
        errorMessage: "scene move target missing from tree",
      });
      if (!sceneNodeResult.valid) {
        return sceneNodeResult;
      }

      insertTreeNode({
        tree: state.scenes.tree,
        node: sceneNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "section.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "sectionId",
            "sceneId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.sectionId)) {
        return invalidPayload("payload.sectionId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.sceneId)) {
        return invalidPayload("payload.sceneId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateSectionCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const scene = state.scenes.items[payload.sceneId];
      if (!isPlainObject(scene)) {
        return invalidPrecondition(
          "payload.sceneId must reference an existing scene",
        );
      }

      if (scene.type === "folder") {
        return invalidPrecondition(
          "payload.sceneId must reference a non-folder scene",
        );
      }

      if (findSectionLocation({ state, sectionId: payload.sectionId })) {
        return invalidPrecondition("payload.sectionId must not already exist");
      }

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentLocation = findSectionLocation({
          state,
          sectionId: payload.parentId,
        });
        if (!parentLocation) {
          return invalidPrecondition(
            "payload.parentId must reference an existing section",
          );
        }

        if (parentLocation.sceneId !== payload.sceneId) {
          return invalidPrecondition(
            "payload.parentId must reference a section in the same scene",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        const targetLocation = findSectionLocation({
          state,
          sectionId: payload.positionTargetId,
        });
        if (!targetLocation) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing section",
          );
        }

        if (targetLocation.sceneId !== payload.sceneId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a section in the same scene",
          );
        }

        const sections = scene.sections ?? createEmptyNestedCollection();
        const targetParentId = getNodeParentId({
          tree: sections.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const scene = state.scenes.items[payload.sceneId];
      scene.sections ??= createEmptyNestedCollection();
      const sections = scene.sections;
      sections.items[payload.sectionId] = {
        id: payload.sectionId,
        name: payload.data.name,
        lines: createEmptyNestedCollection(),
      };

      insertTreeNode({
        tree: sections.tree,
        node: {
          id: payload.sectionId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "section.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["sectionId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.sectionId)) {
        return invalidPayload("payload.sectionId must be a non-empty string");
      }

      {
        const result = validateSectionUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (!findSectionLocation({ state, sectionId: payload.sectionId })) {
        return invalidPrecondition(
          "payload.sectionId must reference an existing section",
        );
      }
    },
    reduce: ({ state, payload }) => {
      const location = findSectionLocation({
        state,
        sectionId: payload.sectionId,
      });
      const section = location.section;
      location.sections.items[payload.sectionId] = {
        ...section,
        name: payload.data.name,
      };
      return state;
    },
  },
  {
    type: "section.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["sectionIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.sectionIds,
          path: "payload.sectionIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const sectionId of payload.sectionIds) {
        if (!findSectionLocation({ state, sectionId })) {
          return invalidPrecondition(
            "payload.sectionIds must reference existing sections",
            { sectionId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedSectionIdsByScene = new Map();

      for (const sectionId of payload.sectionIds) {
        const location = findSectionLocation({ state, sectionId });
        if (!location) {
          continue;
        }

        const removedNode = removeTreeNode({
          nodes: location.sections.tree,
          nodeId: sectionId,
        });

        if (!removedNode) {
          continue;
        }

        let deletedSectionIds = deletedSectionIdsByScene.get(location.sceneId);
        if (!deletedSectionIds) {
          deletedSectionIds = new Set();
          deletedSectionIdsByScene.set(location.sceneId, deletedSectionIds);
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedSectionIds.add(id);
        }
      }

      for (const [sceneId, deletedSectionIds] of deletedSectionIdsByScene) {
        const sections = state.scenes.items[sceneId]?.sections;
        if (!sections) {
          continue;
        }

        for (const sectionId of deletedSectionIds) {
          delete sections.items[sectionId];
        }
      }

      return state;
    },
  },
  {
    type: "section.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "sectionId",
            "sceneId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.sectionId)) {
        return invalidPayload("payload.sectionId must be a non-empty string");
      }

      if (payload.sceneId !== undefined && !isNonEmptyString(payload.sceneId)) {
        return invalidPayload(
          "payload.sceneId must be a non-empty string when provided",
        );
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const location = findSectionLocation({
        state,
        sectionId: payload.sectionId,
      });
      if (!location) {
        return invalidPrecondition(
          "payload.sectionId must reference an existing section",
        );
      }

      const targetSceneId = payload.sceneId ?? location.sceneId;
      const targetScene = state.scenes.items[targetSceneId];
      if (!isPlainObject(targetScene)) {
        return invalidPrecondition(
          "payload.sceneId must reference an existing scene",
        );
      }

      if (targetScene.type !== "scene") {
        return invalidPrecondition(
          "payload.sceneId must reference a non-folder scene",
        );
      }

      const targetSections =
        targetScene.sections ?? createEmptyNestedCollection();
      const sectionNode = findTreeNode({
        nodes: location.sections.tree,
        nodeId: payload.sectionId,
      });
      const isCrossSceneMove = targetSceneId !== location.sceneId;

      if (isCrossSceneMove) {
        const sourceSectionCount = Object.keys(
          location.sections?.items ?? {},
        ).length;
        const movedSectionCount = collectTreeDescendantIds({
          node: sectionNode,
        }).length;

        if (sourceSectionCount <= movedSectionCount) {
          return invalidPrecondition(
            "payload.sectionId must not move the last section out of a scene",
          );
        }
      }

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentLocation = findSectionLocation({
          state,
          sectionId: payload.parentId,
        });
        if (!parentLocation) {
          return invalidPrecondition(
            "payload.parentId must reference an existing section",
          );
        }

        if (parentLocation.sceneId !== targetSceneId) {
          return invalidPrecondition(
            "payload.parentId must reference a section in the target scene",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: sectionNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved section or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.sectionId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved section",
          );
        }

        const targetLocation = findSectionLocation({
          state,
          sectionId: payload.positionTargetId,
        });
        if (!targetLocation) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing section",
          );
        }

        if (targetLocation.sceneId !== targetSceneId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a section in the target scene",
          );
        }

        const targetParentId = getNodeParentId({
          tree: targetSections.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const location = findSectionLocation({
        state,
        sectionId: payload.sectionId,
      });
      const targetSceneId = payload.sceneId ?? location.sceneId;
      const targetScene = state.scenes.items[targetSceneId];
      targetScene.sections ??= createEmptyNestedCollection();
      const targetSections = targetScene.sections;
      const sectionNodeResult = removeNodeOrResult({
        tree: location.sections.tree,
        nodeId: payload.sectionId,
        errorMessage: "section move target missing from tree",
      });
      if (!sectionNodeResult.valid) {
        return sectionNodeResult;
      }

      if (targetSections !== location.sections) {
        const movedSectionIds = collectTreeDescendantIds({
          node: sectionNodeResult.node,
        });

        for (const movedSectionId of movedSectionIds) {
          targetSections.items[movedSectionId] =
            location.sections.items[movedSectionId];
          delete location.sections.items[movedSectionId];
        }
      }

      insertTreeNode({
        tree: targetSections.tree,
        node: sectionNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "line.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "sectionId",
            "lines",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.sectionId)) {
        return invalidPayload("payload.sectionId must be a non-empty string");
      }

      {
        const result = validateLineCreatePayload({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const sectionLocation = findSectionLocation({
        state,
        sectionId: payload.sectionId,
      });
      if (!sectionLocation) {
        return invalidPrecondition(
          "payload.sectionId must reference an existing section",
        );
      }

      for (const item of payload.lines) {
        if (findLineLocation({ state, lineId: item.lineId })) {
          return invalidPrecondition(
            "payload.lines.lineId must not already exist",
            { lineId: item.lineId },
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        const targetLocation = findLineLocation({
          state,
          lineId: payload.positionTargetId,
        });
        if (!targetLocation) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing line",
          );
        }

        if (targetLocation.sectionId !== payload.sectionId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a line in the target section",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const sectionLocation = findSectionLocation({
        state,
        sectionId: payload.sectionId,
      });
      sectionLocation.section.lines ??= createEmptyNestedCollection();
      const lines = sectionLocation.section.lines;
      let previousLineId = payload.positionTargetId;

      payload.lines.forEach((item, index) => {
        lines.items[item.lineId] = {
          id: item.lineId,
          actions: structuredClone(item.data.actions || {}),
        };

        insertTreeNode({
          tree: lines.tree,
          node: { id: item.lineId },
          index: Number.isInteger(payload.index)
            ? payload.index + index
            : undefined,
          position: index === 0 ? payload.position : "after",
          positionTargetId:
            index === 0 ? payload.positionTargetId : previousLineId,
        });

        previousLineId = item.lineId;
      });

      return state;
    },
  },
  {
    type: "line.update_actions",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: ["lineId", "data", "replace", "preserve"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.lineId)) {
        return invalidPayload("payload.lineId must be a non-empty string");
      }

      {
        const result = validateLineUpdateActionsData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (
        payload.replace !== undefined &&
        typeof payload.replace !== "boolean"
      ) {
        return invalidPayload(
          "payload.replace must be a boolean when provided",
        );
      }

      {
        const result = validateLineUpdateActionsPreserve({
          preserve: payload.preserve,
          data: payload.data,
          replace: payload.replace,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (!findLineLocation({ state, lineId: payload.lineId })) {
        return invalidPrecondition(
          "payload.lineId must reference an existing line",
        );
      }
    },
    reduce: ({ state, payload }) => {
      const location = findLineLocation({ state, lineId: payload.lineId });
      const line = location.line;
      const nextData = applyLineUpdateActionsPreserve({
        currentActions: line.actions,
        data: payload.data,
        preserve: payload.preserve,
      });
      line.actions =
        payload.replace === true
          ? structuredClone(nextData)
          : {
              ...structuredClone(line.actions),
              ...structuredClone(nextData),
            };
      return state;
    },
  },
  {
    type: "line.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["lineIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.lineIds,
          path: "payload.lineIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const lineId of payload.lineIds) {
        if (!findLineLocation({ state, lineId })) {
          return invalidPrecondition(
            "payload.lineIds must reference existing lines",
            { lineId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      for (const lineId of payload.lineIds) {
        const location = findLineLocation({ state, lineId });
        location.section.lines ??= createEmptyNestedCollection();
        delete location.section.lines.items[lineId];
        removeTreeNode({
          nodes: location.section.lines.tree,
          nodeId: lineId,
        });
      }

      return state;
    },
  },
  {
    type: "line.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "lineId",
            "toSectionId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.lineId)) {
        return invalidPayload("payload.lineId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.toSectionId)) {
        return invalidPayload("payload.toSectionId must be a non-empty string");
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const lineLocation = findLineLocation({
        state,
        lineId: payload.lineId,
      });
      if (!lineLocation) {
        return invalidPrecondition(
          "payload.lineId must reference an existing line",
        );
      }

      const targetSectionLocation = findSectionLocation({
        state,
        sectionId: payload.toSectionId,
      });
      if (!targetSectionLocation) {
        return invalidPrecondition(
          "payload.toSectionId must reference an existing section",
        );
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.lineId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved line",
          );
        }

        const targetLocation = findLineLocation({
          state,
          lineId: payload.positionTargetId,
        });
        if (!targetLocation) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing line",
          );
        }

        if (targetLocation.sectionId !== payload.toSectionId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a line in the target section",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const lineLocation = findLineLocation({
        state,
        lineId: payload.lineId,
      });
      lineLocation.section.lines ??= createEmptyNestedCollection();
      const lineNodeResult = removeNodeOrResult({
        tree: lineLocation.section.lines.tree,
        nodeId: payload.lineId,
        errorMessage: "line move target missing from tree",
      });
      if (!lineNodeResult.valid) {
        return lineNodeResult;
      }
      const lineValue = lineLocation.line;

      delete lineLocation.section.lines.items[payload.lineId];

      const targetSectionLocation = findSectionLocation({
        state,
        sectionId: payload.toSectionId,
      });
      targetSectionLocation.section.lines ??= createEmptyNestedCollection();
      targetSectionLocation.section.lines.items[payload.lineId] = lineValue;

      insertTreeNode({
        tree: targetSectionLocation.section.lines.tree,
        node: lineNodeResult.node,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "image.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "imageId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.imageId)) {
        return invalidPayload("payload.imageId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateImageCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.images.items[payload.imageId])) {
        return invalidPrecondition("payload.imageId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentImage = state.images.items[parentId];
        if (!isPlainObject(parentImage)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing image item",
          );
        }

        if (parentImage.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder image item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.images.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing image item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.images.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "image") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "thumbnailFileId"],
          details: {
            imageId: payload.imageId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "images",
          path: "payload.data.tagIds",
          details: {
            imageId: payload.imageId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const nextImage = {
        id: payload.imageId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextImage.description = payload.data.description;
      }

      if (payload.data.type === "image") {
        nextImage.fileId = payload.data.fileId;
        if (payload.data.thumbnailFileId !== undefined) {
          nextImage.thumbnailFileId = payload.data.thumbnailFileId;
        }
        if (payload.data.width !== undefined) {
          nextImage.width = payload.data.width;
        }
        if (payload.data.height !== undefined) {
          nextImage.height = payload.data.height;
        }

        assignOptionalTagIds({
          target: nextImage,
          tagIds: payload.data.tagIds,
        });
      }

      state.images.items[payload.imageId] = nextImage;

      insertTreeNode({
        tree: state.images.tree,
        node: {
          id: payload.imageId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "image.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["imageId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.imageId)) {
        return invalidPayload("payload.imageId must be a non-empty string");
      }

      {
        const result = validateImageUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const currentImage = state.images.items[payload.imageId];
      if (!isPlainObject(currentImage)) {
        return invalidPrecondition(
          "payload.imageId must reference an existing image item",
        );
      }

      if (
        currentImage.type === "folder" &&
        (payload.data.fileId !== undefined ||
          payload.data.thumbnailFileId !== undefined ||
          payload.data.width !== undefined ||
          payload.data.height !== undefined ||
          payload.data.tagIds !== undefined)
      ) {
        return invalidPrecondition(
          "folder image items cannot update file fields",
        );
      }

      if (currentImage.type === "image") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "thumbnailFileId"],
          details: {
            imageId: payload.imageId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "images",
          path: "payload.data.tagIds",
          details: {
            imageId: payload.imageId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const currentImage = state.images.items[payload.imageId];
      state.images.items[payload.imageId] = applyTagIdsUpdate({
        currentItem: currentImage,
        data: payload.data,
      });
      return state;
    },
  },
  {
    type: "image.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["imageIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.imageIds,
          path: "payload.imageIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const imageId of payload.imageIds) {
        if (!isPlainObject(state.images.items[imageId])) {
          return invalidPrecondition(
            "payload.imageIds must reference existing image items",
            { imageId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedImageIds = new Set();

      for (const imageId of payload.imageIds) {
        const removedNode = removeTreeNode({
          nodes: state.images.tree,
          nodeId: imageId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedImageIds.add(id);
        }
      }

      for (const imageId of deletedImageIds) {
        delete state.images.items[imageId];
      }

      return state;
    },
  },
  {
    type: "image.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "imageId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.imageId)) {
        return invalidPayload("payload.imageId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const image = state.images.items[payload.imageId];
      if (!isPlainObject(image)) {
        return invalidPrecondition(
          "payload.imageId must reference an existing image item",
        );
      }

      const imageNode = findTreeNode({
        nodes: state.images.tree,
        nodeId: payload.imageId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentImage = state.images.items[payload.parentId];
        if (!isPlainObject(parentImage)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing image item",
          );
        }

        if (parentImage.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder image item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: imageNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved image item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.imageId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved image item",
          );
        }

        if (!isPlainObject(state.images.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing image item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.images.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const imageNodeResult = removeNodeOrResult({
        tree: state.images.tree,
        nodeId: payload.imageId,
        errorMessage: "image move target missing from tree",
      });
      if (!imageNodeResult.valid) {
        return imageNodeResult;
      }

      insertTreeNode({
        tree: state.images.tree,
        node: imageNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "sound.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "soundId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.soundId)) {
        return invalidPayload("payload.soundId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateSoundCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.sounds.items[payload.soundId])) {
        return invalidPrecondition("payload.soundId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentSound = state.sounds.items[parentId];
        if (!isPlainObject(parentSound)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing sound item",
          );
        }

        if (parentSound.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder sound item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.sounds.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing sound item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.sounds.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "sound") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "waveformDataFileId"],
          nullableFields: ["waveformDataFileId"],
          details: {
            soundId: payload.soundId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "sounds",
          path: "payload.data.tagIds",
          details: {
            soundId: payload.soundId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const nextSound = {
        id: payload.soundId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextSound.description = payload.data.description;
      }

      if (payload.data.type === "sound") {
        nextSound.fileId = payload.data.fileId;
        if (payload.data.waveformDataFileId !== undefined) {
          nextSound.waveformDataFileId = payload.data.waveformDataFileId;
        }
        if (payload.data.duration !== undefined) {
          nextSound.duration = payload.data.duration;
        }

        assignOptionalTagIds({
          target: nextSound,
          tagIds: payload.data.tagIds,
        });
      }

      state.sounds.items[payload.soundId] = nextSound;

      insertTreeNode({
        tree: state.sounds.tree,
        node: {
          id: payload.soundId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "sound.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["soundId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.soundId)) {
        return invalidPayload("payload.soundId must be a non-empty string");
      }

      {
        const result = validateSoundUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const currentSound = state.sounds.items[payload.soundId];
      if (!isPlainObject(currentSound)) {
        return invalidPrecondition(
          "payload.soundId must reference an existing sound item",
        );
      }

      if (
        currentSound.type === "folder" &&
        (payload.data.fileId !== undefined ||
          payload.data.waveformDataFileId !== undefined ||
          payload.data.duration !== undefined ||
          payload.data.tagIds !== undefined)
      ) {
        return invalidPrecondition(
          "folder sound items cannot update file fields",
        );
      }

      if (currentSound.type === "sound") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "waveformDataFileId"],
          nullableFields: ["waveformDataFileId"],
          details: {
            soundId: payload.soundId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "sounds",
          path: "payload.data.tagIds",
          details: {
            soundId: payload.soundId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const currentSound = state.sounds.items[payload.soundId];
      state.sounds.items[payload.soundId] = applyTagIdsUpdate({
        currentItem: currentSound,
        data: payload.data,
      });
      return state;
    },
  },
  {
    type: "sound.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["soundIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.soundIds,
          path: "payload.soundIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const soundId of payload.soundIds) {
        if (!isPlainObject(state.sounds.items[soundId])) {
          return invalidPrecondition(
            "payload.soundIds must reference existing sound items",
            { soundId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedSoundIds = new Set();

      for (const soundId of payload.soundIds) {
        const removedNode = removeTreeNode({
          nodes: state.sounds.tree,
          nodeId: soundId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedSoundIds.add(id);
        }
      }

      for (const soundId of deletedSoundIds) {
        delete state.sounds.items[soundId];
      }

      return state;
    },
  },
  {
    type: "sound.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "soundId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.soundId)) {
        return invalidPayload("payload.soundId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const sound = state.sounds.items[payload.soundId];
      if (!isPlainObject(sound)) {
        return invalidPrecondition(
          "payload.soundId must reference an existing sound item",
        );
      }

      const soundNode = findTreeNode({
        nodes: state.sounds.tree,
        nodeId: payload.soundId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentSound = state.sounds.items[payload.parentId];
        if (!isPlainObject(parentSound)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing sound item",
          );
        }

        if (parentSound.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder sound item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: soundNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved sound item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.soundId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved sound item",
          );
        }

        if (!isPlainObject(state.sounds.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing sound item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.sounds.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const soundNodeResult = removeNodeOrResult({
        tree: state.sounds.tree,
        nodeId: payload.soundId,
        errorMessage: "sound move target missing from tree",
      });
      if (!soundNodeResult.valid) {
        return soundNodeResult;
      }

      insertTreeNode({
        tree: state.sounds.tree,
        node: soundNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "voice.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "voiceId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.voiceId)) {
        return invalidPayload("payload.voiceId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateVoiceCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.voices.items[payload.voiceId])) {
        return invalidPrecondition("payload.voiceId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentVoice = state.voices.items[parentId];
        if (!isPlainObject(parentVoice)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing voice item",
          );
        }

        if (parentVoice.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder voice item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.voices.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing voice item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.voices.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "voice") {
        const scene = state.scenes.items[payload.data.sceneId];
        if (!isPlainObject(scene) || scene.type === "folder") {
          return invalidPrecondition(
            "payload.data.sceneId must reference an existing non-folder scene",
          );
        }

        return validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "waveformDataFileId"],
          nullableFields: ["waveformDataFileId"],
          details: {
            voiceId: payload.voiceId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const nextVoice = {
        id: payload.voiceId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextVoice.description = payload.data.description;
      }

      if (payload.data.type === "voice") {
        nextVoice.sceneId = payload.data.sceneId;
        nextVoice.fileId = payload.data.fileId;
        if (payload.data.waveformDataFileId !== undefined) {
          nextVoice.waveformDataFileId = payload.data.waveformDataFileId;
        }
        if (payload.data.duration !== undefined) {
          nextVoice.duration = payload.data.duration;
        }
      }

      state.voices.items[payload.voiceId] = nextVoice;

      insertTreeNode({
        tree: state.voices.tree,
        node: {
          id: payload.voiceId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "voice.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["voiceId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.voiceId)) {
        return invalidPayload("payload.voiceId must be a non-empty string");
      }

      {
        const result = validateVoiceUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const currentVoice = state.voices.items[payload.voiceId];
      if (!isPlainObject(currentVoice)) {
        return invalidPrecondition(
          "payload.voiceId must reference an existing voice item",
        );
      }

      if (
        currentVoice.type === "folder" &&
        (payload.data.sceneId !== undefined ||
          payload.data.fileId !== undefined ||
          payload.data.waveformDataFileId !== undefined ||
          payload.data.duration !== undefined)
      ) {
        return invalidPrecondition(
          "folder voice items cannot update file fields",
        );
      }

      if (currentVoice.type === "voice") {
        if (payload.data.sceneId !== undefined) {
          const scene = state.scenes.items[payload.data.sceneId];
          if (!isPlainObject(scene) || scene.type === "folder") {
            return invalidPrecondition(
              "payload.data.sceneId must reference an existing non-folder scene",
            );
          }
        }

        return validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "waveformDataFileId"],
          nullableFields: ["waveformDataFileId"],
          details: {
            voiceId: payload.voiceId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      state.voices.items[payload.voiceId] = {
        ...structuredClone(state.voices.items[payload.voiceId]),
        ...structuredClone(payload.data),
      };
      return state;
    },
  },
  {
    type: "voice.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["voiceIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.voiceIds,
          path: "payload.voiceIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const voiceId of payload.voiceIds) {
        if (!isPlainObject(state.voices.items[voiceId])) {
          return invalidPrecondition(
            "payload.voiceIds must reference existing voice items",
            { voiceId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedVoiceIds = new Set();

      for (const voiceId of payload.voiceIds) {
        const removedNode = removeTreeNode({
          nodes: state.voices.tree,
          nodeId: voiceId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedVoiceIds.add(id);
        }
      }

      for (const voiceId of deletedVoiceIds) {
        delete state.voices.items[voiceId];
      }

      return state;
    },
  },
  {
    type: "voice.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "voiceId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.voiceId)) {
        return invalidPayload("payload.voiceId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const voice = state.voices.items[payload.voiceId];
      if (!isPlainObject(voice)) {
        return invalidPrecondition(
          "payload.voiceId must reference an existing voice item",
        );
      }

      const voiceNode = findTreeNode({
        nodes: state.voices.tree,
        nodeId: payload.voiceId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentVoice = state.voices.items[payload.parentId];
        if (!isPlainObject(parentVoice)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing voice item",
          );
        }

        if (parentVoice.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder voice item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: voiceNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved voice item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.voiceId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved voice item",
          );
        }

        if (!isPlainObject(state.voices.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing voice item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.voices.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const voiceNodeResult = removeNodeOrResult({
        tree: state.voices.tree,
        nodeId: payload.voiceId,
        errorMessage: "voice move target missing from tree",
      });
      if (!voiceNodeResult.valid) {
        return voiceNodeResult;
      }

      insertTreeNode({
        tree: state.voices.tree,
        node: voiceNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "video.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "videoId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.videoId)) {
        return invalidPayload("payload.videoId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateVideoCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.videos.items[payload.videoId])) {
        return invalidPrecondition("payload.videoId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentVideo = state.videos.items[parentId];
        if (!isPlainObject(parentVideo)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing video item",
          );
        }

        if (parentVideo.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder video item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.videos.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing video item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.videos.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "video") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "thumbnailFileId"],
          details: {
            videoId: payload.videoId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "videos",
          path: "payload.data.tagIds",
          details: {
            videoId: payload.videoId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const nextVideo = {
        id: payload.videoId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextVideo.description = payload.data.description;
      }

      if (payload.data.type === "video") {
        nextVideo.fileId = payload.data.fileId;
        nextVideo.thumbnailFileId = payload.data.thumbnailFileId;
        if (payload.data.duration !== undefined) {
          nextVideo.duration = payload.data.duration;
        }
        if (payload.data.width !== undefined) {
          nextVideo.width = payload.data.width;
        }
        if (payload.data.height !== undefined) {
          nextVideo.height = payload.data.height;
        }

        assignOptionalTagIds({
          target: nextVideo,
          tagIds: payload.data.tagIds,
        });
      }

      state.videos.items[payload.videoId] = nextVideo;

      insertTreeNode({
        tree: state.videos.tree,
        node: {
          id: payload.videoId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "video.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["videoId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.videoId)) {
        return invalidPayload("payload.videoId must be a non-empty string");
      }

      {
        const result = validateVideoUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const currentVideo = state.videos.items[payload.videoId];
      if (!isPlainObject(currentVideo)) {
        return invalidPrecondition(
          "payload.videoId must reference an existing video item",
        );
      }

      if (
        currentVideo.type === "folder" &&
        (payload.data.fileId !== undefined ||
          payload.data.thumbnailFileId !== undefined ||
          payload.data.duration !== undefined ||
          payload.data.width !== undefined ||
          payload.data.height !== undefined ||
          payload.data.tagIds !== undefined)
      ) {
        return invalidPrecondition(
          "folder video items cannot update file fields",
        );
      }

      if (currentVideo.type === "video") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "thumbnailFileId"],
          details: {
            videoId: payload.videoId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "videos",
          path: "payload.data.tagIds",
          details: {
            videoId: payload.videoId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const currentVideo = state.videos.items[payload.videoId];
      state.videos.items[payload.videoId] = applyTagIdsUpdate({
        currentItem: currentVideo,
        data: payload.data,
      });
      return state;
    },
  },
  {
    type: "video.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["videoIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.videoIds,
          path: "payload.videoIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const videoId of payload.videoIds) {
        if (!isPlainObject(state.videos.items[videoId])) {
          return invalidPrecondition(
            "payload.videoIds must reference existing video items",
            { videoId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedVideoIds = new Set();

      for (const videoId of payload.videoIds) {
        const removedNode = removeTreeNode({
          nodes: state.videos.tree,
          nodeId: videoId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedVideoIds.add(id);
        }
      }

      for (const videoId of deletedVideoIds) {
        delete state.videos.items[videoId];
      }

      return state;
    },
  },
  {
    type: "video.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "videoId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.videoId)) {
        return invalidPayload("payload.videoId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const video = state.videos.items[payload.videoId];
      if (!isPlainObject(video)) {
        return invalidPrecondition(
          "payload.videoId must reference an existing video item",
        );
      }

      const videoNode = findTreeNode({
        nodes: state.videos.tree,
        nodeId: payload.videoId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentVideo = state.videos.items[payload.parentId];
        if (!isPlainObject(parentVideo)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing video item",
          );
        }

        if (parentVideo.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder video item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: videoNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved video item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.videoId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved video item",
          );
        }

        if (!isPlainObject(state.videos.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing video item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.videos.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const videoNodeResult = removeNodeOrResult({
        tree: state.videos.tree,
        nodeId: payload.videoId,
        errorMessage: "video move target missing from tree",
      });
      if (!videoNodeResult.valid) {
        return videoNodeResult;
      }

      insertTreeNode({
        tree: state.videos.tree,
        node: videoNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "animation.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "animationId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.animationId)) {
        return invalidPayload("payload.animationId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateAnimationCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.animations.items[payload.animationId])) {
        return invalidPrecondition(
          "payload.animationId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentAnimation = state.animations.items[parentId];
        if (!isPlainObject(parentAnimation)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing animation item",
          );
        }

        if (parentAnimation.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder animation item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.animations.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing animation item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.animations.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "animation") {
        const result = validateAnimationMaskImageReferences({
          state,
          animation: payload.data.animation,
          path: "payload.data.animation",
          details: { animationId: payload.animationId },
          errorFactory: createPreconditionValidationError,
        });
        if (!result.valid) {
          return result;
        }

        const fileResult = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["thumbnailFileId"],
          details: { animationId: payload.animationId },
        });
        if (!fileResult.valid) {
          return fileResult;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "animations",
          path: "payload.data.tagIds",
          details: {
            animationId: payload.animationId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const nextAnimation = {
        id: payload.animationId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextAnimation.description = payload.data.description;
      }

      if (payload.data.type === "animation") {
        assignOptionalTagIds({
          target: nextAnimation,
          tagIds: payload.data.tagIds,
        });
        if (payload.data.thumbnailFileId !== undefined) {
          nextAnimation.thumbnailFileId = payload.data.thumbnailFileId;
        }
        if (payload.data.preview !== undefined) {
          nextAnimation.preview = structuredClone(payload.data.preview);
        }
        nextAnimation.animation = structuredClone(payload.data.animation);
      }

      state.animations.items[payload.animationId] = nextAnimation;

      insertTreeNode({
        tree: state.animations.tree,
        node: {
          id: payload.animationId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "animation.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["animationId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.animationId)) {
        return invalidPayload("payload.animationId must be a non-empty string");
      }

      {
        const result = validateAnimationUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const currentAnimation = state.animations.items[payload.animationId];
      if (!isPlainObject(currentAnimation)) {
        return invalidPrecondition(
          "payload.animationId must reference an existing animation item",
        );
      }

      if (
        currentAnimation.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder animation items cannot update animation fields",
        );
      }

      if (currentAnimation.type === "animation") {
        if (payload.data.animation !== undefined) {
          const result = validateAnimationMaskImageReferences({
            state,
            animation: payload.data.animation,
            path: "payload.data.animation",
            details: { animationId: payload.animationId },
            errorFactory: createPreconditionValidationError,
          });
          if (!result.valid) {
            return result;
          }
        }

        const fileResult = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["thumbnailFileId"],
          details: { animationId: payload.animationId },
        });
        if (!fileResult.valid) {
          return fileResult;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "animations",
          path: "payload.data.tagIds",
          details: { animationId: payload.animationId },
          errorFactory: createPreconditionValidationError,
        });
      }
    },
    reduce: ({ state, payload }) => {
      const currentAnimation = state.animations.items[payload.animationId];
      state.animations.items[payload.animationId] = applyTagIdsUpdate({
        currentItem: currentAnimation,
        data: payload.data,
      });
      return state;
    },
  },
  {
    type: "animation.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["animationIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.animationIds,
          path: "payload.animationIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const animationId of payload.animationIds) {
        if (!isPlainObject(state.animations.items[animationId])) {
          return invalidPrecondition(
            "payload.animationIds must reference existing animation items",
            { animationId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedAnimationIds = new Set();

      for (const animationId of payload.animationIds) {
        const removedNode = removeTreeNode({
          nodes: state.animations.tree,
          nodeId: animationId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedAnimationIds.add(id);
        }
      }

      for (const animationId of deletedAnimationIds) {
        delete state.animations.items[animationId];
      }

      return state;
    },
  },
  {
    type: "animation.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "animationId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.animationId)) {
        return invalidPayload("payload.animationId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const animation = state.animations.items[payload.animationId];
      if (!isPlainObject(animation)) {
        return invalidPrecondition(
          "payload.animationId must reference an existing animation item",
        );
      }

      const animationNode = findTreeNode({
        nodes: state.animations.tree,
        nodeId: payload.animationId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentAnimation = state.animations.items[payload.parentId];
        if (!isPlainObject(parentAnimation)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing animation item",
          );
        }

        if (parentAnimation.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder animation item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: animationNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved animation item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.animationId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved animation item",
          );
        }

        if (!isPlainObject(state.animations.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing animation item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.animations.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const animationNodeResult = removeNodeOrResult({
        tree: state.animations.tree,
        nodeId: payload.animationId,
        errorMessage: "animation move target missing from tree",
      });
      if (!animationNodeResult.valid) {
        return animationNodeResult;
      }

      insertTreeNode({
        tree: state.animations.tree,
        node: animationNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "font.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "fontId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.fontId)) {
        return invalidPayload("payload.fontId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateFontCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.fonts.items[payload.fontId])) {
        return invalidPrecondition("payload.fontId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentFont = state.fonts.items[parentId];
        if (!isPlainObject(parentFont)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing font item",
          );
        }

        if (parentFont.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder font item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.fonts.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing font item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.fonts.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "font") {
        {
          const result = validateTagIdsAgainstScope({
            state,
            tagIds: payload.data.tagIds,
            scopeKey: "fonts",
            path: "payload.data.tagIds",
            details: {
              fontId: payload.fontId,
            },
          });
          if (!result.valid) {
            return result;
          }
        }

        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          details: {
            fontId: payload.fontId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const nextFont = {
        id: payload.fontId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextFont.description = payload.data.description;
      }

      if (payload.data.type === "font") {
        assignOptionalTagIds({
          target: nextFont,
          tagIds: payload.data.tagIds,
        });
        nextFont.fileId = payload.data.fileId;
        nextFont.fontFamily = payload.data.fontFamily;
        for (const key of FONT_WEIGHT_KEYS) {
          if (payload.data[key] !== undefined) {
            nextFont[key] = payload.data[key];
          }
        }
      }

      state.fonts.items[payload.fontId] = nextFont;

      insertTreeNode({
        tree: state.fonts.tree,
        node: {
          id: payload.fontId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "font.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["fontId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.fontId)) {
        return invalidPayload("payload.fontId must be a non-empty string");
      }

      {
        const result = validateFontUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const currentFont = state.fonts.items[payload.fontId];
      if (!isPlainObject(currentFont)) {
        return invalidPrecondition(
          "payload.fontId must reference an existing font item",
        );
      }

      if (
        currentFont.type === "folder" &&
        (payload.data.tagIds !== undefined ||
          payload.data.fileId !== undefined ||
          payload.data.fontFamily !== undefined ||
          FONT_WEIGHT_KEYS.some((key) => payload.data[key] !== undefined))
      ) {
        return invalidPrecondition(
          "folder font items cannot update font fields",
        );
      }

      if (currentFont.type === "font") {
        {
          const result = validateTagIdsAgainstScope({
            state,
            tagIds: payload.data.tagIds,
            scopeKey: "fonts",
            path: "payload.data.tagIds",
            details: {
              fontId: payload.fontId,
            },
          });
          if (!result.valid) {
            return result;
          }
        }

        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          details: {
            fontId: payload.fontId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const currentFont = state.fonts.items[payload.fontId];
      state.fonts.items[payload.fontId] = applyTagIdsUpdate({
        currentItem: currentFont,
        data: payload.data,
      });
      return state;
    },
  },
  {
    type: "font.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["fontIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.fontIds,
          path: "payload.fontIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const fontId of payload.fontIds) {
        if (!isPlainObject(state.fonts.items[fontId])) {
          return invalidPrecondition(
            "payload.fontIds must reference existing font items",
            { fontId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedFontIds = new Set();

      for (const fontId of payload.fontIds) {
        const removedNode = removeTreeNode({
          nodes: state.fonts.tree,
          nodeId: fontId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedFontIds.add(id);
        }
      }

      for (const fontId of deletedFontIds) {
        delete state.fonts.items[fontId];
      }

      return state;
    },
  },
  {
    type: "font.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "fontId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.fontId)) {
        return invalidPayload("payload.fontId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const font = state.fonts.items[payload.fontId];
      if (!isPlainObject(font)) {
        return invalidPrecondition(
          "payload.fontId must reference an existing font item",
        );
      }

      const fontNode = findTreeNode({
        nodes: state.fonts.tree,
        nodeId: payload.fontId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentFont = state.fonts.items[payload.parentId];
        if (!isPlainObject(parentFont)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing font item",
          );
        }

        if (parentFont.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder font item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: fontNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved font item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.fontId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved font item",
          );
        }

        if (!isPlainObject(state.fonts.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing font item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.fonts.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const fontNodeResult = removeNodeOrResult({
        tree: state.fonts.tree,
        nodeId: payload.fontId,
        errorMessage: "font move target missing from tree",
      });
      if (!fontNodeResult.valid) {
        return fontNodeResult;
      }

      insertTreeNode({
        tree: state.fonts.tree,
        node: fontNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "color.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "colorId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.colorId)) {
        return invalidPayload("payload.colorId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateColorCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.colors.items[payload.colorId])) {
        return invalidPrecondition("payload.colorId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentColor = state.colors.items[parentId];
        if (!isPlainObject(parentColor)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing color item",
          );
        }

        if (parentColor.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder color item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.colors.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing color item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.colors.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "color") {
        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "colors",
          path: "payload.data.tagIds",
          details: {
            colorId: payload.colorId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const nextColor = {
        id: payload.colorId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        nextColor.description = payload.data.description;
      }

      if (payload.data.type === "color") {
        nextColor.hex = payload.data.hex;
        assignOptionalTagIds({
          target: nextColor,
          tagIds: payload.data.tagIds,
        });
      }

      state.colors.items[payload.colorId] = nextColor;

      insertTreeNode({
        tree: state.colors.tree,
        node: {
          id: payload.colorId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "color.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["colorId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.colorId)) {
        return invalidPayload("payload.colorId must be a non-empty string");
      }

      {
        const result = validateColorUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const currentColor = state.colors.items[payload.colorId];
      if (!isPlainObject(currentColor)) {
        return invalidPrecondition(
          "payload.colorId must reference an existing color item",
        );
      }

      if (
        currentColor.type === "folder" &&
        (payload.data.tagIds !== undefined || payload.data.hex !== undefined)
      ) {
        return invalidPrecondition(
          "folder color items cannot update color fields",
        );
      }

      if (currentColor.type === "color") {
        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "colors",
          path: "payload.data.tagIds",
          details: {
            colorId: payload.colorId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const currentColor = state.colors.items[payload.colorId];
      state.colors.items[payload.colorId] = applyTagIdsUpdate({
        currentItem: currentColor,
        data: payload.data,
      });
      return state;
    },
  },
  {
    type: "color.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["colorIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.colorIds,
          path: "payload.colorIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      for (const colorId of payload.colorIds) {
        if (!isPlainObject(state.colors.items[colorId])) {
          return invalidPrecondition(
            "payload.colorIds must reference existing color items",
            { colorId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedColorIds = new Set();

      for (const colorId of payload.colorIds) {
        const removedNode = removeTreeNode({
          nodes: state.colors.tree,
          nodeId: colorId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedColorIds.add(id);
        }
      }

      for (const colorId of deletedColorIds) {
        delete state.colors.items[colorId];
      }

      return state;
    },
  },
  {
    type: "color.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "colorId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.colorId)) {
        return invalidPayload("payload.colorId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const color = state.colors.items[payload.colorId];
      if (!isPlainObject(color)) {
        return invalidPrecondition(
          "payload.colorId must reference an existing color item",
        );
      }

      const colorNode = findTreeNode({
        nodes: state.colors.tree,
        nodeId: payload.colorId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentColor = state.colors.items[payload.parentId];
        if (!isPlainObject(parentColor)) {
          return invalidPrecondition(
            "payload.parentId must reference an existing color item",
          );
        }

        if (parentColor.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder color item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: colorNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved color item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.colorId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved color item",
          );
        }

        if (!isPlainObject(state.colors.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing color item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.colors.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const colorNodeResult = removeNodeOrResult({
        tree: state.colors.tree,
        nodeId: payload.colorId,
        errorMessage: "color move target missing from tree",
      });
      if (!colorNodeResult.valid) {
        return colorNodeResult;
      }

      insertTreeNode({
        tree: state.colors.tree,
        node: colorNodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  ...createFolderedCollectionCommandDefinitions({
    familyName: "particle",
    collectionKey: "particles",
    idField: "particleId",
    itemLabel: "particle item",
    createDataValidator: validateParticleCreateData,
    updateDataValidator: validateParticleUpdateData,
    createItem: ({ payload }) => {
      const item = {
        id: payload.particleId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        item.description = payload.data.description;
      }

      if (payload.data.type !== "particle") {
        return item;
      }

      item.width = payload.data.width;
      item.height = payload.data.height;
      item.modules = structuredClone(payload.data.modules);
      assignOptionalTagIds({
        target: item,
        tagIds: payload.data.tagIds,
      });

      if (payload.data.seed !== undefined && payload.data.seed !== null) {
        item.seed = payload.data.seed;
      }

      if (payload.data.thumbnailFileId !== undefined) {
        item.thumbnailFileId = payload.data.thumbnailFileId;
      }

      return item;
    },
    updateItem: ({ currentItem, payload }) => {
      const nextItem = applyTagIdsUpdate({
        currentItem,
        data: payload.data,
      });

      if (payload.data.seed === null) {
        delete nextItem.seed;
      }

      return nextItem;
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder particle items cannot update particle fields",
        );
      }

      if (currentItem.type === "particle") {
        const fileResult = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["thumbnailFileId"],
          details: {
            particleId: payload.particleId,
          },
        });
        if (!fileResult.valid) {
          return fileResult;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "particles",
          path: "payload.data.tagIds",
          details: {
            particleId: payload.particleId,
          },
        });
      }
    },
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type !== "particle") {
        return;
      }

      const fileResult = validateReferencedFilesInData({
        state,
        data: payload.data,
        fields: ["thumbnailFileId"],
        details: {
          particleId: payload.particleId,
        },
      });
      if (!fileResult.valid) {
        return fileResult;
      }

      return validateTagIdsAgainstScope({
        state,
        tagIds: payload.data.tagIds,
        scopeKey: "particles",
        path: "payload.data.tagIds",
        details: {
          particleId: payload.particleId,
        },
      });
    },
  }),
  ...createFolderedCollectionCommandDefinitions({
    familyName: "transform",
    collectionKey: "transforms",
    idField: "transformId",
    itemLabel: "transform item",
    createDataValidator: validateTransformCreateData,
    updateDataValidator: validateTransformUpdateData,
    createItem: ({ payload }) => {
      const item = {
        id: payload.transformId,
        type: payload.data.type,
        name: payload.data.name,
        ...(payload.data.description !== undefined
          ? {
              description: payload.data.description,
            }
          : {}),
      };

      if (payload.data.type !== "transform") {
        return item;
      }

      item.x = payload.data.x;
      item.y = payload.data.y;
      item.scaleX = payload.data.scaleX;
      item.scaleY = payload.data.scaleY;
      item.anchorX = payload.data.anchorX;
      item.anchorY = payload.data.anchorY;
      item.rotation = payload.data.rotation;
      assignOptionalTagIds({
        target: item,
        tagIds: payload.data.tagIds,
      });
      if (payload.data.thumbnailFileId !== undefined) {
        item.thumbnailFileId = payload.data.thumbnailFileId;
      }
      if (payload.data.previewFileId !== undefined) {
        item.previewFileId = payload.data.previewFileId;
      }
      if (payload.data.preview !== undefined) {
        item.preview = structuredClone(payload.data.preview);
      }

      return item;
    },
    updateItem: ({ currentItem, payload }) =>
      applyTagIdsUpdate({
        currentItem,
        data: payload.data,
      }),
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type !== "transform") {
        return;
      }

      const fileResult = validateReferencedFilesInData({
        state,
        data: payload.data,
        fields: ["thumbnailFileId", "previewFileId"],
        details: {
          transformId: payload.transformId,
        },
      });
      if (!fileResult.valid) {
        return fileResult;
      }

      const previewResult = validateTransformPreviewImageReferences({
        state,
        preview: payload.data.preview,
        path: "payload.data.preview",
        details: {
          transformId: payload.transformId,
        },
      });
      if (!previewResult.valid) {
        return previewResult;
      }

      return validateTagIdsAgainstScope({
        state,
        tagIds: payload.data.tagIds,
        scopeKey: "transforms",
        path: "payload.data.tagIds",
        details: {
          transformId: payload.transformId,
        },
      });
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder transform items cannot update transform fields",
        );
      }

      if (currentItem.type === "transform") {
        const fileResult = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["thumbnailFileId", "previewFileId"],
          details: {
            transformId: payload.transformId,
          },
        });
        if (!fileResult.valid) {
          return fileResult;
        }

        const previewResult = validateTransformPreviewImageReferences({
          state,
          preview: payload.data.preview,
          path: "payload.data.preview",
          details: {
            transformId: payload.transformId,
          },
        });
        if (!previewResult.valid) {
          return previewResult;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "transforms",
          path: "payload.data.tagIds",
          details: {
            transformId: payload.transformId,
          },
        });
      }
    },
  }),
  ...createFolderedCollectionCommandDefinitions({
    familyName: "variable",
    collectionKey: "variables",
    idField: "variableId",
    itemLabel: "variable item",
    createDataValidator: validateVariableCreateData,
    updateDataValidator: validateVariableUpdateData,
    reservedItemIds: ["__proto__"],
    createItem: ({ payload }) => {
      const data = structuredClone(payload.data);
      if (!Array.isArray(data.tagIds) || data.tagIds.length === 0) {
        delete data.tagIds;
      }

      return applyVariableEnumMetadata({
        item: {
          id: payload.variableId,
          ...data,
        },
        data,
      });
    },
    updateItem: ({ currentItem, payload }) =>
      applyVariableUpdate({
        currentItem,
        data: payload.data,
      }),
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type === "folder") {
        return;
      }

      const tagResult = validateTagIdsAgainstScope({
        state,
        tagIds: payload.data.tagIds,
        scopeKey: "variables",
        path: "payload.data.tagIds",
        details: {
          variableId: payload.variableId,
        },
      });
      if (!tagResult.valid) {
        return tagResult;
      }

      if (!Object.hasOwn(payload.data, "computed")) {
        return VALID_RESULT;
      }

      return validateComputedVariableGraph({
        items: {
          ...state.variables.items,
          [payload.variableId]: {
            id: payload.variableId,
            ...payload.data,
          },
        },
        path: "state.variables.items",
        errorFactory: createPreconditionValidationError,
      });
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder variable items cannot update variable fields",
        );
      }

      if (
        currentItem.variableType !== "string" &&
        (payload.data.isEnum !== undefined ||
          payload.data.enumValues !== undefined)
      ) {
        return invalidPrecondition(
          "variable enum fields can only update string variables",
        );
      }

      const currentItemIsComputed = Object.hasOwn(currentItem, "computed");
      if (
        currentItemIsComputed &&
        ["scope", "default", "value", "isEnum", "enumValues"].some((key) =>
          Object.hasOwn(payload.data, key),
        )
      ) {
        return invalidPrecondition(
          "computed variables cannot update scope, stored value, or enum fields",
        );
      }

      if (!currentItemIsComputed && Object.hasOwn(payload.data, "computed")) {
        return invalidPrecondition(
          "stored variables cannot be converted to computed variables",
        );
      }

      if (currentItemIsComputed && Object.hasOwn(payload.data, "computed")) {
        const result = validateVariableComputedConfig({
          computed: payload.data.computed,
          variableType: currentItem.variableType,
          path: "payload.data.computed",
          errorFactory: createPreconditionValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (currentItem.type !== "folder") {
        {
          const result = validateTagIdsAgainstScope({
            state,
            tagIds: payload.data.tagIds,
            scopeKey: "variables",
            path: "payload.data.tagIds",
            details: {
              variableId: payload.variableId,
            },
          });
          if (!result.valid) {
            return result;
          }
        }

        if (payload.data.default !== undefined) {
          {
            const result = validateVariableTypedValue({
              value: payload.data.default,
              variableType: currentItem.variableType,
              path: "payload.data.default",
              errorFactory: createPreconditionValidationError,
            });
            if (result?.valid === false) {
              return result;
            }
          }
        }

        if (payload.data.value !== undefined) {
          {
            const result = validateVariableTypedValue({
              value: payload.data.value,
              variableType: currentItem.variableType,
              path: "payload.data.value",
              errorFactory: createPreconditionValidationError,
            });
            if (result?.valid === false) {
              return result;
            }
          }
        }
      }

      if (currentItemIsComputed && Object.hasOwn(payload.data, "computed")) {
        return validateComputedVariableGraph({
          items: {
            ...state.variables.items,
            [payload.variableId]: applyVariableUpdate({
              currentItem,
              data: payload.data,
            }),
          },
          path: "state.variables.items",
          errorFactory: createPreconditionValidationError,
        });
      }

      return VALID_RESULT;
    },
    validateDeleteState: ({ state, payload }) => {
      const deletedIds = new Set();
      for (const variableId of payload.variableIds) {
        const node = findTreeNode({
          nodes: state.variables.tree,
          nodeId: variableId,
        });
        if (!node) {
          deletedIds.add(variableId);
          continue;
        }
        for (const descendantId of collectTreeDescendantIds({ node })) {
          deletedIds.add(descendantId);
        }
      }

      const remainingItems = Object.fromEntries(
        Object.entries(state.variables.items).filter(
          ([variableId]) => !deletedIds.has(variableId),
        ),
      );
      return validateComputedVariableGraph({
        items: remainingItems,
        path: "state.variables.items",
        errorFactory: createPreconditionValidationError,
      });
    },
  }),
  ...createFolderedCollectionCommandDefinitions({
    familyName: "textStyle",
    collectionKey: "textStyles",
    idField: "textStyleId",
    itemLabel: "text style item",
    createDataValidator: validateTextStyleCreateData,
    updateDataValidator: validateTextStyleUpdateData,
    createItem: ({ payload }) => {
      const data = structuredClone(payload.data);
      if (!Array.isArray(data.tagIds) || data.tagIds.length === 0) {
        delete data.tagIds;
      }

      return {
        id: payload.textStyleId,
        ...data,
      };
    },
    updateItem: ({ currentItem, payload }) =>
      applyTextStyleUpdate({
        currentItem,
        data: payload.data,
      }),
    validateCreateState: ({ state, payload }) => {
      const data = payload.data;
      if (data.type !== "textStyle") {
        return;
      }

      {
        const result = validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "textStyles",
          path: "payload.data.tagIds",
          details: {
            textStyleId: payload.textStyleId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }

      for (const fontId of toIdArray(data.fontId)) {
        const item = state.fonts.items[fontId];
        if (!isPlainObject(item) || item.type === "folder") {
          return invalidPrecondition(
            "payload.data.fontId must reference an existing non-folder font",
          );
        }
      }

      for (const field of ["colorId", "strokeColorId"]) {
        if (data[field] === undefined) {
          continue;
        }

        const item = state.colors.items[data[field]];
        if (!isPlainObject(item) || item.type === "folder") {
          return invalidPrecondition(
            `payload.data.${field} must reference an existing non-folder color`,
          );
        }
      }

      if (data.shadow !== undefined) {
        const shadowColor = state.colors.items[data.shadow.colorId];
        if (!isPlainObject(shadowColor) || shadowColor.type === "folder") {
          return invalidPrecondition(
            "payload.data.shadow.colorId must reference an existing non-folder color",
          );
        }
      }
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder text style items cannot update text style fields",
        );
      }

      if (currentItem.type === "textStyle") {
        {
          const result = validateTagIdsAgainstScope({
            state,
            tagIds: payload.data.tagIds,
            scopeKey: "textStyles",
            path: "payload.data.tagIds",
            details: {
              textStyleId: payload.textStyleId,
            },
          });
          if (!result.valid) {
            return result;
          }
        }
      }

      if (payload.data.fontId !== undefined) {
        for (const fontId of toIdArray(payload.data.fontId)) {
          const item = state.fonts.items[fontId];
          if (!isPlainObject(item) || item.type === "folder") {
            return invalidPrecondition(
              "payload.data.fontId must reference an existing non-folder font",
            );
          }
        }
      }

      for (const field of ["colorId", "strokeColorId"]) {
        if (payload.data[field] === undefined) {
          continue;
        }

        const item = state.colors.items[payload.data[field]];
        if (!isPlainObject(item) || item.type === "folder") {
          return invalidPrecondition(
            `payload.data.${field} must reference an existing non-folder color`,
          );
        }
      }

      if (payload.data.shadow !== undefined) {
        const shadowColor = state.colors.items[payload.data.shadow.colorId];
        if (!isPlainObject(shadowColor) || shadowColor.type === "folder") {
          return invalidPrecondition(
            "payload.data.shadow.colorId must reference an existing non-folder color",
          );
        }
      }
    },
  }),
  ...createFolderedCollectionCommandDefinitions({
    familyName: "character",
    collectionKey: "characters",
    idField: "characterId",
    itemLabel: "character item",
    createDataValidator: validateCharacterCreateData,
    updateDataValidator: validateCharacterUpdateData,
    createItem: ({ payload }) => {
      const item = {
        id: payload.characterId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.description !== undefined) {
        item.description = payload.data.description;
      }

      if (item.type !== "character") {
        return item;
      }

      if (payload.data.shortcut !== undefined) {
        item.shortcut = payload.data.shortcut;
      }

      if (payload.data.fileId !== undefined) {
        item.fileId = payload.data.fileId;
      }

      if (payload.data.nameVariableId !== undefined) {
        item.nameVariableId = payload.data.nameVariableId;
      }

      assignOptionalTagIds({
        target: item,
        tagIds: payload.data.tagIds,
      });
      assignOptionalCharacterSpriteGroups({
        target: item,
        spriteGroups: payload.data.spriteGroups,
      });

      item.sprites =
        payload.data.sprites === undefined
          ? { items: {}, tree: [] }
          : structuredClone(payload.data.sprites);

      return item;
    },
    updateItem: ({ currentItem, payload }) =>
      applyCharacterUpdate({
        currentItem,
        data: payload.data,
      }),
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type !== "character") {
        return;
      }

      if (payload.data.fileId !== undefined) {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          details: {
            characterId: payload.characterId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }

      {
        const result = validateStringVariableReference({
          state,
          variableId: payload.data.nameVariableId,
          path: "payload.data.nameVariableId",
          details: {
            characterId: payload.characterId,
            variableId: payload.data.nameVariableId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }

      {
        const result = validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "characters",
          path: "payload.data.tagIds",
          details: {
            characterId: payload.characterId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }

      {
        const result = validateCharacterSpriteGroupsAgainstScope({
          state,
          spriteGroups: payload.data.spriteGroups,
          scopeKey: `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${payload.characterId}`,
          path: "payload.data.spriteGroups",
          details: {
            characterId: payload.characterId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }

      for (const [spriteId, sprite] of Object.entries(
        payload.data.sprites?.items || {},
      )) {
        if (sprite.type !== "image") {
          continue;
        }

        if (sprite.tagIds !== undefined) {
          return invalidPrecondition(
            "payload.data.sprites.items.*.tagIds are not supported during character.create",
            {
              characterId: payload.characterId,
              spriteId,
            },
          );
        }

        const result = validateFileReference({
          state,
          fileId: sprite.fileId,
          path: "payload.data.sprites.items.*.fileId",
          details: {
            characterId: payload.characterId,
            spriteId,
            fileId: sprite.fileId,
          },
        });
        if (!result.valid) {
          return result;
        }

        if (sprite.thumbnailFileId === undefined) {
          continue;
        }

        const thumbnailResult = validateFileReference({
          state,
          fileId: sprite.thumbnailFileId,
          path: "payload.data.sprites.items.*.thumbnailFileId",
          details: {
            characterId: payload.characterId,
            spriteId,
            thumbnailFileId: sprite.thumbnailFileId,
          },
        });
        if (!thumbnailResult.valid) {
          return thumbnailResult;
        }
      }
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder character items cannot update character fields",
        );
      }

      if (currentItem.type === "character") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          details: {
            characterId: payload.characterId,
          },
        });
        if (!result.valid) {
          return result;
        }

        if (Object.hasOwn(payload.data, "nameVariableId")) {
          const variableResult = validateStringVariableReference({
            state,
            variableId: payload.data.nameVariableId,
            path: "payload.data.nameVariableId",
            details: {
              characterId: payload.characterId,
              variableId: payload.data.nameVariableId,
            },
          });
          if (!variableResult.valid) {
            return variableResult;
          }
        }

        {
          const tagResult = validateTagIdsAgainstScope({
            state,
            tagIds: payload.data.tagIds,
            scopeKey: "characters",
            path: "payload.data.tagIds",
            details: {
              characterId: payload.characterId,
            },
          });
          if (!tagResult.valid) {
            return tagResult;
          }
        }

        return validateCharacterSpriteGroupsAgainstScope({
          state,
          spriteGroups: payload.data.spriteGroups,
          scopeKey: `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${payload.characterId}`,
          path: "payload.data.spriteGroups",
          details: {
            characterId: payload.characterId,
          },
        });
      }
    },
    afterDelete: ({ state, deletedItemsById }) => {
      for (const [characterId, item] of deletedItemsById.entries()) {
        if (item?.type !== "character") {
          continue;
        }

        delete state.tags[`${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${characterId}`];
      }
    },
  }),
  ...createFolderedCollectionCommandDefinitions({
    familyName: "layout",
    collectionKey: "layouts",
    idField: "layoutId",
    itemLabel: "layout item",
    createDataValidator: validateLayoutCreateData,
    updateDataValidator: validateLayoutUpdateData,
    createItem: ({ payload }) => ({
      id: payload.layoutId,
      type: payload.data.type,
      name: payload.data.name,
      ...(payload.data.description !== undefined
        ? {
            description: payload.data.description,
          }
        : {}),
      ...(payload.data.type === "layout"
        ? {
            ...(Array.isArray(payload.data.tagIds) &&
            payload.data.tagIds.length > 0
              ? {
                  tagIds: structuredClone(payload.data.tagIds),
                }
              : {}),
            layoutType: payload.data.layoutType,
            ...(payload.data.layoutSchemaVersion !== undefined
              ? {
                  layoutSchemaVersion: payload.data.layoutSchemaVersion,
                }
              : {}),
            isFragment: payload.data.isFragment,
            ...(payload.data.thumbnailFileId !== undefined
              ? {
                  thumbnailFileId: payload.data.thumbnailFileId,
                }
              : {}),
            ...(payload.data.preview !== undefined
              ? {
                  preview: structuredClone(payload.data.preview),
                }
              : {}),
            elements: structuredClone(payload.data.elements),
          }
        : {}),
    }),
    updateItem: ({ currentItem, payload }) =>
      applyTagIdsUpdate({
        currentItem,
        data: payload.data,
      }),
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type !== "layout") {
        return;
      }

      {
        const result = validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "layouts",
          path: "payload.data.tagIds",
          details: {
            layoutId: payload.layoutId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }

      return validateReferencedFilesInData({
        state,
        data: payload.data,
        fields: ["thumbnailFileId"],
        details: {
          layoutId: payload.layoutId,
        },
      });
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder layout items cannot update layout fields",
        );
      }

      if (currentItem.type === "layout") {
        {
          const result = validateTagIdsAgainstScope({
            state,
            tagIds: payload.data.tagIds,
            scopeKey: "layouts",
            path: "payload.data.tagIds",
            details: {
              layoutId: payload.layoutId,
            },
          });
          if (!result.valid) {
            return result;
          }
        }

        return validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["thumbnailFileId"],
          details: {
            layoutId: payload.layoutId,
          },
        });
      }
    },
  }),
  {
    type: "layout.schema.upgrade",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["layoutIds", "targetSchemaVersion"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.layoutIds,
          path: "payload.layoutIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (payload.targetSchemaVersion !== CURRENT_LAYOUT_SCHEMA_VERSION) {
        return invalidPayload(
          `payload.targetSchemaVersion must be ${CURRENT_LAYOUT_SCHEMA_VERSION}`,
        );
      }

      return VALID_RESULT;
    },
    validateAgainstState: ({ state, payload }) => {
      for (const layoutId of payload.layoutIds) {
        const layout = state.layouts.items[layoutId];
        if (!isPlainObject(layout) || layout.type !== "layout") {
          return invalidPrecondition(
            "payload.layoutIds must reference existing layouts",
            {
              layoutId,
            },
          );
        }
      }

      return VALID_RESULT;
    },
    reduce: ({ state, payload }) => {
      for (const layoutId of payload.layoutIds) {
        const layout = state.layouts.items[layoutId];
        if (
          normalizeLayoutSchemaVersion(layout.layoutSchemaVersion) >=
          payload.targetSchemaVersion
        ) {
          continue;
        }

        layout.elements.tree = upgradeLayoutTreeOrder({
          nodes: layout.elements.tree,
          items: layout.elements.items,
        });
        layout.layoutSchemaVersion = payload.targetSchemaVersion;
      }

      return state;
    },
  },
  ...createFolderedCollectionCommandDefinitions({
    familyName: "control",
    collectionKey: "controls",
    idField: "controlId",
    itemLabel: "control item",
    createDataValidator: validateControlCreateData,
    updateDataValidator: validateControlUpdateData,
    createItem: ({ payload }) => {
      const data = structuredClone(payload.data);
      if (!Array.isArray(data.tagIds) || data.tagIds.length === 0) {
        delete data.tagIds;
      }

      return {
        id: payload.controlId,
        ...data,
      };
    },
    updateItem: ({ currentItem, payload }) =>
      applyTagIdsUpdate({
        currentItem,
        data: payload.data,
      }),
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type !== "control") {
        return;
      }

      {
        const result = validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: "controls",
          path: "payload.data.tagIds",
          details: {
            controlId: payload.controlId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }

      return validateReferencedFilesInData({
        state,
        data: payload.data,
        fields: ["thumbnailFileId"],
        details: {
          controlId: payload.controlId,
        },
      });
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder control items cannot update control fields",
        );
      }

      if (currentItem.type === "control") {
        {
          const result = validateTagIdsAgainstScope({
            state,
            tagIds: payload.data.tagIds,
            scopeKey: "controls",
            path: "payload.data.tagIds",
            details: {
              controlId: payload.controlId,
            },
          });
          if (!result.valid) {
            return result;
          }
        }

        return validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["thumbnailFileId"],
          details: {
            controlId: payload.controlId,
          },
        });
      }
    },
  }),
  {
    type: "character.sprite.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "characterId",
            "spriteId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.characterId)) {
        return invalidPayload("payload.characterId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.spriteId)) {
        return invalidPayload("payload.spriteId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateCharacterSpriteCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        return invalidPrecondition(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });

      if (isPlainObject(collection.items[payload.spriteId])) {
        return invalidPrecondition("payload.spriteId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentItem = collection.items[parentId];
        if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder sprite item",
          );
        }

        const parentNode = findTreeNode({
          nodes: collection.tree,
          nodeId: parentId,
        });
        if (!parentNode) {
          return invalidPrecondition(
            "payload.parentId must reference a folder sprite item in the tree",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing sprite item",
          );
        }

        const targetNode = findTreeNode({
          nodes: collection.tree,
          nodeId: payload.positionTargetId,
        });
        if (!targetNode) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing sprite item in the tree",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      if (payload.data.type === "image") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "thumbnailFileId"],
          details: {
            characterId: payload.characterId,
            spriteId: payload.spriteId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${payload.characterId}`,
          path: "payload.data.tagIds",
          details: {
            characterId: payload.characterId,
            spriteId: payload.spriteId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });

      const nextSprite = {
        id: payload.spriteId,
        ...structuredClone(payload.data),
      };
      if (
        payload.data.tagIds !== undefined &&
        payload.data.tagIds.length === 0
      ) {
        delete nextSprite.tagIds;
      }

      collection.items[payload.spriteId] = nextSprite;

      insertTreeNode({
        tree: collection.tree,
        node: {
          id: payload.spriteId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "character.sprite.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["characterId", "spriteId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.characterId)) {
        return invalidPayload("payload.characterId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.spriteId)) {
        return invalidPayload("payload.spriteId must be a non-empty string");
      }

      {
        const result = validateCharacterSpriteUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        return invalidPrecondition(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const currentItem = collection.items[payload.spriteId];

      if (!isPlainObject(currentItem)) {
        return invalidPrecondition(
          "payload.spriteId must reference an existing sprite item",
        );
      }

      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "description",
        )
      ) {
        return invalidPrecondition(
          "folder sprite items cannot update image fields",
        );
      }

      if (currentItem.type === "image") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId", "thumbnailFileId"],
          details: {
            characterId: payload.characterId,
            spriteId: payload.spriteId,
          },
        });
        if (!result.valid) {
          return result;
        }

        return validateTagIdsAgainstScope({
          state,
          tagIds: payload.data.tagIds,
          scopeKey: `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${payload.characterId}`,
          path: "payload.data.tagIds",
          details: {
            characterId: payload.characterId,
            spriteId: payload.spriteId,
          },
        });
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const currentItem = collection.items[payload.spriteId];

      collection.items[payload.spriteId] = applyTagIdsUpdate({
        currentItem,
        data: payload.data,
      });

      return state;
    },
  },
  {
    type: "character.sprite.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["characterId", "spriteIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.characterId)) {
        return invalidPayload("payload.characterId must be a non-empty string");
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.spriteIds,
          path: "payload.spriteIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        return invalidPrecondition(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      for (const spriteId of payload.spriteIds) {
        if (!isPlainObject(collection.items[spriteId])) {
          return invalidPrecondition(
            "payload.spriteIds must reference existing sprite items",
            { spriteId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const deletedIds = new Set();

      for (const spriteId of payload.spriteIds) {
        const removedNode = removeTreeNode({
          nodes: collection.tree,
          nodeId: spriteId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedIds.add(id);
        }
      }

      for (const spriteId of deletedIds) {
        delete collection.items[spriteId];
      }

      return state;
    },
  },
  {
    type: "character.sprite.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "characterId",
            "spriteId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.characterId)) {
        return invalidPayload("payload.characterId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.spriteId)) {
        return invalidPayload("payload.spriteId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        return invalidPrecondition(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const currentItem = collection.items[payload.spriteId];

      if (!isPlainObject(currentItem)) {
        return invalidPrecondition(
          "payload.spriteId must reference an existing sprite item",
        );
      }

      const currentNode = findTreeNode({
        nodes: collection.tree,
        nodeId: payload.spriteId,
      });
      if (!currentNode) {
        return invalidPrecondition(
          "payload.spriteId must reference an existing sprite item in the tree",
        );
      }

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentItem = collection.items[payload.parentId];
        if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder sprite item",
          );
        }

        const parentNode = findTreeNode({
          nodes: collection.tree,
          nodeId: payload.parentId,
        });
        if (!parentNode) {
          return invalidPrecondition(
            "payload.parentId must reference a folder sprite item in the tree",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: currentNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved sprite item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.spriteId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved sprite item",
          );
        }

        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing sprite item",
          );
        }

        const targetNode = findTreeNode({
          nodes: collection.tree,
          nodeId: payload.positionTargetId,
        });
        if (!targetNode) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing sprite item in the tree",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const nodeResult = removeNodeOrResult({
        tree: collection.tree,
        nodeId: payload.spriteId,
        errorMessage: "character sprite move target missing from tree",
      });
      if (!nodeResult.valid) {
        return nodeResult;
      }

      insertTreeNode({
        tree: collection.tree,
        node: nodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "tag.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["scopeKey", "tagId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateTagScopeKey({
          scopeKey: payload.scopeKey,
          path: "payload.scopeKey",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.tagId)) {
        return invalidPayload("payload.tagId must be a non-empty string");
      }

      {
        const result = validateTagCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      {
        const result = validateTagScopeAgainstState({
          state,
          scopeKey: payload.scopeKey,
          path: "payload.scopeKey",
        });
        if (!result.valid) {
          return result;
        }
      }

      const collection = getTagScopeCollection({
        state,
        scopeKey: payload.scopeKey,
      });
      if (isPlainObject(collection?.items?.[payload.tagId])) {
        return invalidPrecondition("payload.tagId must not already exist");
      }

      return validateUniqueTagNameInScope({
        collection,
        name: payload.data.name,
        path: "payload.data.name",
      });
    },
    reduce: ({ state, payload }) => {
      const collection = ensureTagScopeCollection({
        state,
        scopeKey: payload.scopeKey,
      });
      const nextTag = {
        id: payload.tagId,
        type: "tag",
        name: payload.data.name,
      };

      if (payload.data.color !== undefined) {
        nextTag.color = payload.data.color;
      }

      collection.items[payload.tagId] = nextTag;
      collection.tree.push({
        id: payload.tagId,
      });

      return state;
    },
  },
  {
    type: "tag.update",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["scopeKey", "tagId", "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateTagScopeKey({
          scopeKey: payload.scopeKey,
          path: "payload.scopeKey",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.tagId)) {
        return invalidPayload("payload.tagId must be a non-empty string");
      }

      {
        const result = validateTagUpdateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      {
        const result = validateTagScopeAgainstState({
          state,
          scopeKey: payload.scopeKey,
          path: "payload.scopeKey",
        });
        if (!result.valid) {
          return result;
        }
      }

      const collection = getTagScopeCollection({
        state,
        scopeKey: payload.scopeKey,
      });
      const currentTag = collection?.items?.[payload.tagId];
      if (!isPlainObject(currentTag) || currentTag.type !== "tag") {
        return invalidPrecondition(
          "payload.tagId must reference an existing tag in payload.scopeKey",
        );
      }

      if (payload.data.name === undefined) {
        return VALID_RESULT;
      }

      return validateUniqueTagNameInScope({
        collection,
        name: payload.data.name,
        path: "payload.data.name",
        excludeTagId: payload.tagId,
      });
    },
    reduce: ({ state, payload }) => {
      const collection = ensureTagScopeCollection({
        state,
        scopeKey: payload.scopeKey,
      });
      const currentTag = collection.items[payload.tagId];
      const nextTag = {
        ...structuredClone(currentTag),
      };

      if (payload.data.name !== undefined) {
        nextTag.name = payload.data.name;
      }

      if (payload.data.color === null) {
        delete nextTag.color;
      } else if (payload.data.color !== undefined) {
        nextTag.color = payload.data.color;
      }

      collection.items[payload.tagId] = nextTag;
      return state;
    },
  },
  {
    type: "tag.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["scopeKey", "tagIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateTagScopeKey({
          scopeKey: payload.scopeKey,
          path: "payload.scopeKey",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.tagIds,
          path: "payload.tagIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      {
        const result = validateTagScopeAgainstState({
          state,
          scopeKey: payload.scopeKey,
          path: "payload.scopeKey",
        });
        if (!result.valid) {
          return result;
        }
      }

      const collection = getTagScopeCollection({
        state,
        scopeKey: payload.scopeKey,
      });
      for (const tagId of payload.tagIds) {
        const tag = collection?.items?.[tagId];
        if (!isPlainObject(tag) || tag.type !== "tag") {
          return invalidPrecondition(
            "payload.tagIds must reference existing tags in payload.scopeKey",
            {
              scopeKey: payload.scopeKey,
              tagId,
            },
          );
        }
      }

      return VALID_RESULT;
    },
    reduce: ({ state, payload }) => {
      const collection = ensureTagScopeCollection({
        state,
        scopeKey: payload.scopeKey,
      });
      const deletedTagIds = new Set();

      for (const tagId of payload.tagIds) {
        const removedNode = removeTreeNode({
          nodes: collection.tree,
          nodeId: tagId,
        });
        if (!removedNode) {
          continue;
        }

        for (const deletedTagId of collectTreeDescendantIds({
          node: removedNode,
        })) {
          deletedTagIds.add(deletedTagId);
        }
      }

      for (const tagId of deletedTagIds) {
        delete collection.items[tagId];
      }

      stripDeletedTagIdsFromScopeItems({
        state,
        scopeKey: payload.scopeKey,
        deletedTagIds,
      });

      return state;
    },
  },
  {
    type: "layout.element.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "layoutId",
            "elementId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.layoutId)) {
        return invalidPayload("payload.layoutId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload("payload.elementId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateLayoutElementCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        return invalidPrecondition(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });

      if (isPlainObject(collection.items[payload.elementId])) {
        return invalidPrecondition("payload.elementId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentItem = collection.items[parentId];
        if (
          !isPlainObject(parentItem) ||
          !LAYOUT_CONTAINER_ELEMENT_TYPES.includes(parentItem.type)
        ) {
          return invalidPrecondition(
            "payload.parentId must reference a folder or container layout element",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing layout element",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      {
        const result = validateVisualElementReferenceTargets({
          ownerIdField: "layoutId",
          ownerId: payload.layoutId,
          ownerLabel: "layout",
          elementId: payload.elementId,
          data: payload.data,
          state,
          errorFactory: createPreconditionValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });

      collection.items[payload.elementId] = {
        id: payload.elementId,
        ...structuredClone(payload.data),
      };

      insertTreeNode({
        tree: collection.tree,
        node: {
          id: payload.elementId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "layout.element.update",
    validatePayload: ({ payload }) => {
      let result = captureValidation(() =>
        validateAllowedKeys({
          value: payload,
          allowedKeys: ["layoutId", "elementId", "data", "replace"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        }),
      );
      if (!result.valid) {
        return result;
      }

      if (!isNonEmptyString(payload.layoutId)) {
        return invalidPayload("payload.layoutId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload("payload.elementId must be a non-empty string");
      }

      if (
        payload.replace !== undefined &&
        typeof payload.replace !== "boolean"
      ) {
        return invalidPayload(
          "payload.replace must be a boolean when provided",
        );
      }

      result = captureValidation(() =>
        validateLayoutElementUpdateData({
          data: payload.data,
          replace: payload.replace,
          errorFactory: createPayloadValidationError,
        }),
      );
      if (!result.valid) {
        return result;
      }

      return VALID_RESULT;
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        return invalidPrecondition(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });
      const currentItem = collection.items[payload.elementId];
      if (!isPlainObject(currentItem)) {
        return invalidPrecondition(
          "payload.elementId must reference an existing layout element",
        );
      }

      if (
        payload.data.type !== undefined &&
        payload.data.type !== currentItem.type
      ) {
        return invalidPrecondition("layout element type cannot be changed");
      }

      if (currentItem.type !== "folder") {
        const mergedData = payload.replace
          ? { ...structuredClone(payload.data) }
          : {
              ...structuredClone(currentItem),
              ...structuredClone(payload.data),
            };

        {
          const result = validateVisualElementReferenceTargets({
            ownerIdField: "layoutId",
            ownerId: payload.layoutId,
            ownerLabel: "layout",
            elementId: payload.elementId,
            data: mergedData,
            state,
            errorFactory: createPreconditionValidationError,
          });
          if (result?.valid === false) {
            return result;
          }
        }
      }

      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "hidden",
        )
      ) {
        return invalidPrecondition(
          "folder layout elements can only update name and hidden fields",
        );
      }

      return VALID_RESULT;
    },
    reduce: ({ state, payload }) => {
      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });
      const currentItem = collection.items[payload.elementId];

      collection.items[payload.elementId] =
        payload.replace === true
          ? {
              id: payload.elementId,
              ...structuredClone(payload.data),
            }
          : {
              ...structuredClone(currentItem),
              ...structuredClone(payload.data),
            };

      return state;
    },
  },
  {
    type: "layout.element.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["layoutId", "elementIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.layoutId)) {
        return invalidPayload("payload.layoutId must be a non-empty string");
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.elementIds,
          path: "payload.elementIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        return invalidPrecondition(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });

      for (const elementId of payload.elementIds) {
        if (!isPlainObject(collection.items[elementId])) {
          return invalidPrecondition(
            "payload.elementIds must reference existing layout elements",
            { elementId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });
      const deletedIds = new Set();

      for (const elementId of payload.elementIds) {
        const removedNode = removeTreeNode({
          nodes: collection.tree,
          nodeId: elementId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedIds.add(id);
        }
      }

      for (const elementId of deletedIds) {
        delete collection.items[elementId];
      }

      return state;
    },
  },
  {
    type: "control.element.create",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "controlId",
            "elementId",
            "parentId",
            "data",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.controlId)) {
        return invalidPayload("payload.controlId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload("payload.elementId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validateLayoutElementCreateData({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const control = state.controls.items[payload.controlId];
      if (!isPlainObject(control) || control.type !== "control") {
        return invalidPrecondition(
          "payload.controlId must reference an existing control",
        );
      }

      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });

      if (isPlainObject(collection.items[payload.elementId])) {
        return invalidPrecondition("payload.elementId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentItem = collection.items[parentId];
        if (
          !isPlainObject(parentItem) ||
          !LAYOUT_CONTAINER_ELEMENT_TYPES.includes(parentItem.type)
        ) {
          return invalidPrecondition(
            "payload.parentId must reference a folder or container control element",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing control element",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }

      {
        const result = validateVisualElementReferenceTargets({
          ownerIdField: "controlId",
          ownerId: payload.controlId,
          ownerLabel: "control",
          elementId: payload.elementId,
          data: payload.data,
          state,
          errorFactory: createPreconditionValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });

      collection.items[payload.elementId] = {
        id: payload.elementId,
        ...structuredClone(payload.data),
      };

      insertTreeNode({
        tree: collection.tree,
        node: {
          id: payload.elementId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "control.element.update",
    validatePayload: ({ payload }) => {
      let result = captureValidation(() =>
        validateAllowedKeys({
          value: payload,
          allowedKeys: ["controlId", "elementId", "data", "replace"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        }),
      );
      if (!result.valid) {
        return result;
      }

      if (!isNonEmptyString(payload.controlId)) {
        return invalidPayload("payload.controlId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload("payload.elementId must be a non-empty string");
      }

      if (
        payload.replace !== undefined &&
        typeof payload.replace !== "boolean"
      ) {
        return invalidPayload(
          "payload.replace must be a boolean when provided",
        );
      }

      result = captureValidation(() =>
        validateLayoutElementUpdateData({
          data: payload.data,
          replace: payload.replace,
          errorFactory: createPayloadValidationError,
        }),
      );
      if (!result.valid) {
        return result;
      }

      return VALID_RESULT;
    },
    validateAgainstState: ({ state, payload }) => {
      const control = state.controls.items[payload.controlId];
      if (!isPlainObject(control) || control.type !== "control") {
        return invalidPrecondition(
          "payload.controlId must reference an existing control",
        );
      }

      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });
      const currentItem = collection.items[payload.elementId];
      if (!isPlainObject(currentItem)) {
        return invalidPrecondition(
          "payload.elementId must reference an existing control element",
        );
      }

      if (
        payload.data.type !== undefined &&
        payload.data.type !== currentItem.type
      ) {
        return invalidPrecondition("control element type cannot be changed");
      }

      if (currentItem.type !== "folder") {
        const mergedData = payload.replace
          ? { ...structuredClone(payload.data) }
          : {
              ...structuredClone(currentItem),
              ...structuredClone(payload.data),
            };

        {
          const result = validateVisualElementReferenceTargets({
            ownerIdField: "controlId",
            ownerId: payload.controlId,
            ownerLabel: "control",
            elementId: payload.elementId,
            data: mergedData,
            state,
            errorFactory: createPreconditionValidationError,
          });
          if (result?.valid === false) {
            return result;
          }
        }
      }

      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some(
          (key) => key !== "name" && key !== "hidden",
        )
      ) {
        return invalidPrecondition(
          "folder control elements can only update name and hidden fields",
        );
      }

      return VALID_RESULT;
    },
    reduce: ({ state, payload }) => {
      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });
      const currentItem = collection.items[payload.elementId];

      collection.items[payload.elementId] =
        payload.replace === true
          ? {
              id: payload.elementId,
              ...structuredClone(payload.data),
            }
          : {
              ...structuredClone(currentItem),
              ...structuredClone(payload.data),
            };

      return state;
    },
  },
  {
    type: "control.element.delete",
    validatePayload: ({ payload }) => {
      {
        const result = validateExactKeys({
          value: payload,
          expectedKeys: ["controlId", "elementIds"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.controlId)) {
        return invalidPayload("payload.controlId must be a non-empty string");
      }

      {
        const result = validateRequiredUniqueIdArray({
          value: payload.elementIds,
          path: "payload.elementIds",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const control = state.controls.items[payload.controlId];
      if (!isPlainObject(control) || control.type !== "control") {
        return invalidPrecondition(
          "payload.controlId must reference an existing control",
        );
      }

      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });

      for (const elementId of payload.elementIds) {
        if (!isPlainObject(collection.items[elementId])) {
          return invalidPrecondition(
            "payload.elementIds must reference existing control elements",
            { elementId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });
      const deletedIds = new Set();

      for (const elementId of payload.elementIds) {
        const removedNode = removeTreeNode({
          nodes: collection.tree,
          nodeId: elementId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedIds.add(id);
        }
      }

      for (const elementId of deletedIds) {
        delete collection.items[elementId];
      }

      return state;
    },
  },
  {
    type: "control.element.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "controlId",
            "elementId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.controlId)) {
        return invalidPayload("payload.controlId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload("payload.elementId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const control = state.controls.items[payload.controlId];
      if (!isPlainObject(control) || control.type !== "control") {
        return invalidPrecondition(
          "payload.controlId must reference an existing control",
        );
      }

      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });
      const currentItem = collection.items[payload.elementId];

      if (!isPlainObject(currentItem)) {
        return invalidPrecondition(
          "payload.elementId must reference an existing control element",
        );
      }

      const currentNode = findTreeNode({
        nodes: collection.tree,
        nodeId: payload.elementId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentItem = collection.items[payload.parentId];
        if (
          !isPlainObject(parentItem) ||
          !LAYOUT_CONTAINER_ELEMENT_TYPES.includes(parentItem.type)
        ) {
          return invalidPrecondition(
            "payload.parentId must reference a folder or container control element",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: currentNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved control element or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.elementId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved control element",
          );
        }

        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing control element",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getControlElementCollection({
        state,
        controlId: payload.controlId,
      });
      const nodeResult = removeNodeOrResult({
        tree: collection.tree,
        nodeId: payload.elementId,
        errorMessage: "control element move target missing from tree",
      });
      if (!nodeResult.valid) {
        return nodeResult;
      }

      insertTreeNode({
        tree: collection.tree,
        node: nodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
  {
    type: "layout.element.move",
    validatePayload: ({ payload }) => {
      {
        const result = validateAllowedKeys({
          value: payload,
          allowedKeys: [
            "layoutId",
            "elementId",
            "parentId",
            "index",
            "position",
            "positionTargetId",
          ],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.layoutId)) {
        return invalidPayload("payload.layoutId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload("payload.elementId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        return invalidPayload(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      {
        const result = validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        return invalidPrecondition(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });
      const currentItem = collection.items[payload.elementId];

      if (!isPlainObject(currentItem)) {
        return invalidPrecondition(
          "payload.elementId must reference an existing layout element",
        );
      }

      const currentNode = findTreeNode({
        nodes: collection.tree,
        nodeId: payload.elementId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentItem = collection.items[payload.parentId];
        if (
          !isPlainObject(parentItem) ||
          !LAYOUT_CONTAINER_ELEMENT_TYPES.includes(parentItem.type)
        ) {
          return invalidPrecondition(
            "payload.parentId must reference a folder or container layout element",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: currentNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          return invalidPrecondition(
            "payload.parentId must not target the moved layout element or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.elementId) {
          return invalidPrecondition(
            "payload.positionTargetId must not reference the moved layout element",
          );
        }

        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing layout element",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });
      const nodeResult = removeNodeOrResult({
        tree: collection.tree,
        nodeId: payload.elementId,
        errorMessage: "layout element move target missing from tree",
      });
      if (!nodeResult.valid) {
        return nodeResult;
      }

      insertTreeNode({
        tree: collection.tree,
        node: nodeResult.node,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      });

      return state;
    },
  },
];

const definitionsByType = new Map(
  COMMAND_DEFINITIONS.map((definition) => [definition.type, definition]),
);

export const getCommandDefinition = ({ type }) => {
  return definitionsByType.get(type);
};

export const listCommandTypes = () =>
  COMMAND_DEFINITIONS.map((definition) => definition.type);

export const validatePayload = ({ type, payload }) => {
  return captureValidation(() => {
    if (typeof type !== "string" || type.length === 0) {
      return invalidPayload("type must be a non-empty string");
    }

    if (!isPlainObject(payload)) {
      return invalidPayload("payload must be an object", { type });
    }

    const definition = getCommandDefinition({ type });
    if (!definition) {
      return invalidPayload(`unknown command type '${type}'`);
    }

    const validationResult = captureValidation(() =>
      definition.validatePayload({ payload }),
    );

    return normalizePayloadResult(validationResult);
  });
};

const normalizeCurrentStateValidationResult = (stateResult) => {
  if (stateResult.valid) {
    return stateResult;
  }

  if (stateResult.error.kind === "invariant") {
    return invalidInvariant(
      stateResult.error.message,
      toDomainErrorDetails(stateResult.error),
    );
  }

  return invalidState(
    stateResult.error.message,
    toDomainErrorDetails(stateResult.error),
  );
};

const validateCommandDefinitionAgainstState = ({ state, command }) => {
  if (!isPlainObject(command)) {
    return invalidPrecondition("command must be an object");
  }

  const payloadResult = validatePayload(command);
  if (!payloadResult.valid) {
    return invalidPayload(
      payloadResult.error.message,
      toDomainErrorDetails(payloadResult.error),
    );
  }

  const definition = getCommandDefinition({ type: command.type });
  if (!definition) {
    return invalidPrecondition(`unknown command type '${command.type}'`);
  }

  const validationResult = captureValidation(() =>
    definition.validateAgainstState({
      state,
      payload: command.payload,
    }),
  );
  const normalizedValidationResult = normalizeStateResult(validationResult);
  if (!normalizedValidationResult.valid) {
    return normalizedValidationResult;
  }

  return {
    valid: true,
    definition,
  };
};

const applyCommandDefinition = ({ state, definition, payload }) => {
  const nextState = definition.reduce({
    state,
    payload,
  });
  if (nextState?.valid === false) {
    return nextState;
  }

  return {
    valid: true,
    state: nextState === undefined ? state : nextState,
  };
};

const appendReplayCommandContext = (result, { commandIndex, command } = {}) => {
  if (result?.valid !== false || !result.error) {
    return result;
  }

  const details = isPlainObject(result.error.details)
    ? structuredClone(result.error.details)
    : {};

  if (Number.isInteger(commandIndex) && commandIndex >= 0) {
    details.commandIndex = commandIndex;
  }

  if (isNonEmptyString(command?.type)) {
    details.commandType = command.type;
  }

  return {
    valid: false,
    error: {
      ...result.error,
      details,
    },
  };
};

export const validateAgainstState = ({ state, command }) => {
  return captureValidation(() => {
    const normalizedState = normalizeStateCollections(state);

    const stateResult = validateState({ state: normalizedState });
    if (!stateResult.valid) {
      return normalizeCurrentStateValidationResult(stateResult);
    }

    const validationResult = validateCommandDefinitionAgainstState({
      state: normalizedState,
      command,
    });
    if (!validationResult.valid) {
      return validationResult;
    }

    return VALID_RESULT;
  });
};

export const processCommand = ({ state, command }) => {
  return captureValidation(() => {
    const normalizedState = normalizeStateCollections(state);
    const shouldMaterializeNormalizedState = normalizedState !== state;

    const stateResult = validateState({ state: normalizedState });
    if (!stateResult.valid) {
      return normalizeCurrentStateValidationResult(stateResult);
    }

    const validationResult = validateCommandDefinitionAgainstState({
      state: normalizedState,
      command,
    });
    if (!validationResult.valid) {
      return validationResult;
    }

    const applyResult = applyCommandDefinition({
      state: structuredClone(
        shouldMaterializeNormalizedState ? normalizedState : state,
      ),
      definition: validationResult.definition,
      payload: command.payload,
    });
    if (!applyResult.valid) {
      return applyResult;
    }

    const stateResultAfterCommand = validateState({
      state: applyResult.state,
    });
    if (!stateResultAfterCommand.valid) {
      return stateResultAfterCommand;
    }

    return {
      valid: true,
      state: applyResult.state,
    };
  });
};

export const replayCommands = ({ state, commands }) => {
  return captureValidation(() => {
    if (!Array.isArray(commands)) {
      return invalidPrecondition("commands must be an array");
    }

    const normalizedState = normalizeStateCollections(state);
    const stateResult = validateState({
      state: normalizedState,
    });
    if (!stateResult.valid) {
      return normalizeCurrentStateValidationResult(stateResult);
    }

    let workingState = structuredClone(normalizedState);
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      const validationResult = validateCommandDefinitionAgainstState({
        state: workingState,
        command,
      });
      if (!validationResult.valid) {
        return appendReplayCommandContext(validationResult, {
          commandIndex: index,
          command,
        });
      }

      const applyResult = applyCommandDefinition({
        state: workingState,
        definition: validationResult.definition,
        payload: command.payload,
      });
      if (!applyResult.valid) {
        return appendReplayCommandContext(applyResult, {
          commandIndex: index,
          command,
        });
      }

      workingState = applyResult.state;
    }

    const finalStateResult = validateState({
      state: workingState,
    });
    if (!finalStateResult.valid) {
      return finalStateResult;
    }

    return {
      valid: true,
      state: workingState,
    };
  });
};
