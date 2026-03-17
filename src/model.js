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

const COLLECTION_KEYS = [
  "scenes",
  "files",
  "images",
  "sounds",
  "videos",
  "animations",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "textStyles",
  "variables",
  "layouts",
];
const ROOT_KEYS = ["project", "story", ...COLLECTION_KEYS];
const isString = (value) => typeof value === "string";
const FILE_ITEM_TYPES = [
  "image",
  "image-thumbnail",
  "audio",
  "audio-waveform",
  "video",
  "video-thumbnail",
  "font",
];
const IMAGE_FILE_REFERENCE_TYPES = {
  fileId: ["image"],
  thumbnailFileId: ["image-thumbnail"],
};
const SOUND_FILE_REFERENCE_TYPES = {
  fileId: ["audio"],
  waveformDataFileId: ["audio-waveform"],
};
const VIDEO_FILE_REFERENCE_TYPES = {
  fileId: ["video"],
  thumbnailFileId: ["video-thumbnail"],
};
const FONT_FILE_REFERENCE_TYPES = {
  fileId: ["font"],
};
const CHARACTER_FILE_REFERENCE_TYPES = {
  fileId: ["image"],
};
const isHexColor = (value) =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
const LIVE_TWEEN_PROPERTY_KEYS = [
  "alpha",
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
];
const REPLACE_TWEEN_PROPERTY_KEYS = [
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
const VARIABLE_SCOPE_KEYS = ["context", "global-device", "global-account"];
const VARIABLE_TYPE_KEYS = ["string", "number", "boolean"];
const LAYOUT_TYPE_KEYS = ["normal", "dialogue", "nvl", "choice", "base"];
const LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS = ["left", "center", "right"];
const LAYOUT_ELEMENT_BASE_TYPES = [
  "folder",
  "container",
  "sprite",
  "text",
  "text-revealing",
  "slider",
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "text-ref-choice-item-content",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
  "container-ref-choice-item",
  "container-ref-dialogue-line",
];
export const SCHEMA_VERSION = 2;
const LAYOUT_CONTAINER_ELEMENT_TYPES = [
  "folder",
  "container",
  "container-ref-choice-item",
  "container-ref-dialogue-line",
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
      return invalidFromErrorFactory(errorFactory, `${path}.${key} is not allowed`);
    }
  }

  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      return invalidFromErrorFactory(errorFactory, `${path}.${key} is required`);
    }
  }
};

const validateAllowedKeys = ({ value, allowedKeys, path, errorFactory }) => {
  if (!isPlainObject(value)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      return invalidFromErrorFactory(errorFactory, `${path}.${key} is not allowed`);
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
    return invalidFromErrorFactory(errorFactory, `${path} must contain at least one of 'x' or 'y'`);
  }

  if (hasX && !isFiniteNumber(value.x)) {
    return invalidFromErrorFactory(errorFactory, `${path}.x must be a finite number`);
  }

  if (hasY && !isFiniteNumber(value.y)) {
    return invalidFromErrorFactory(errorFactory, `${path}.y must be a finite number`);
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
            ? ["id", "type", "name", "position", "sections"]
            : ["id", "type", "name", "position"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (item.type !== "scene" && item.type !== "folder") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'scene' or 'folder'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isPlainObject(item.actions)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.actions must be an object`);
    }
  }
};

const validateFileItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && !FILE_ITEM_TYPES.includes(item?.type)) {
      return invalidFromErrorFactory(
        errorFactory,
        `${itemPath}.type must be 'folder' or a supported file type`,
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'image'`);
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
                "thumbnailFileId",
                "fileId",
                "fileType",
                "fileSize",
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(errorFactory, 
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "image") {
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
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileId must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileType must be a string when provided`,
        );
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileSize must be a finite number`);
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.width must be a finite number`);
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.height must be a finite number`);
      }
    }
  }
};

const validateSoundItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "sound") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'sound'`);
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
                "fileId",
                "fileType",
                "fileSize",
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(errorFactory, 
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "sound") {
      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileId must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileType must be a string when provided`,
        );
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileSize must be a finite number`);
      }

      if (
        item.waveformDataFileId !== undefined &&
        item.waveformDataFileId !== null &&
        !isNonEmptyString(item.waveformDataFileId)
      ) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.waveformDataFileId must be a non-empty string or null when provided`,
        );
      }

      if (item.duration !== undefined && !isFiniteNumber(item.duration)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.duration must be a finite number`);
      }
    }
  }
};

const validateVideoItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "video") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'video'`);
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
                "fileId",
                "thumbnailFileId",
                "fileType",
                "fileSize",
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.description !== undefined && !isString(item.description)) {
      return invalidFromErrorFactory(errorFactory, 
        `${itemPath}.description must be a string when provided`,
      );
    }

    if (item.type === "video") {
      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileId must be a non-empty string`);
      }

      if (!isNonEmptyString(item.thumbnailFileId)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.thumbnailFileId must be a non-empty string`,
        );
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileType must be a string when provided`,
        );
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileSize must be a finite number`);
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.width must be a finite number`);
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.height must be a finite number`);
      }
    }
  }
};

const validateAnimationKeyframes = ({ keyframes, path, errorFactory }) => {
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    return invalidFromErrorFactory(errorFactory, `${path} must be a non-empty array`);
  }

  for (const [index, keyframe] of keyframes.entries()) {
    const keyframePath = `${path}[${index}]`;

    {
      const result = validateAllowedKeys({
        value: keyframe,
        allowedKeys: ["value", "duration", "easing", "relative"],
        path: keyframePath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!("value" in keyframe)) {
      return invalidFromErrorFactory(errorFactory, `${keyframePath}.value is required`);
    }

    if (!("duration" in keyframe)) {
      return invalidFromErrorFactory(errorFactory, `${keyframePath}.duration is required`);
    }

    if (!isFiniteNumber(keyframe.value)) {
      return invalidFromErrorFactory(errorFactory, `${keyframePath}.value must be a finite number`);
    }

    if (!isFiniteNumber(keyframe.duration) || keyframe.duration < 1) {
      return invalidFromErrorFactory(errorFactory, 
        `${keyframePath}.duration must be a finite number >= 1`,
      );
    }

    if (
      keyframe.easing !== undefined &&
      !ANIMATION_EASING_KEYS.includes(keyframe.easing)
    ) {
      return invalidFromErrorFactory(errorFactory, 
        `${keyframePath}.easing must be a supported Route Graphics easing`,
      );
    }

    if (
      keyframe.relative !== undefined &&
      typeof keyframe.relative !== "boolean"
    ) {
      return invalidFromErrorFactory(errorFactory, 
        `${keyframePath}.relative must be a boolean when provided`,
      );
    }
  }
};

const validateTweenProperty = ({ config, path, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: config,
      allowedKeys: ["initialValue", "keyframes"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!("keyframes" in config)) {
    return invalidFromErrorFactory(errorFactory, `${path}.keyframes is required`);
  }

  if (
    config.initialValue !== undefined &&
    !isFiniteNumber(config.initialValue)
  ) {
    return invalidFromErrorFactory(errorFactory, `${path}.initialValue must be a finite number`);
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
};

const validateTweenDefinition = ({
  tween,
  allowedProperties,
  path,
  unsupportedMessage,
  errorFactory,
}) => {
  if (!isPlainObject(tween)) {
    return invalidFromErrorFactory(errorFactory, `${path} must be an object`);
  }

  if (Object.keys(tween).length === 0) {
    return invalidFromErrorFactory(errorFactory, `${path} must include at least one tween property`);
  }

  for (const [propertyName, config] of Object.entries(tween)) {
    const propertyPath = `${path}.${propertyName}`;

    if (!allowedProperties.includes(propertyName)) {
      return invalidFromErrorFactory(errorFactory, `${propertyPath} ${unsupportedMessage}`);
    }

    {
      const result = validateTweenProperty({
        config,
        path: propertyPath,
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
        "texture",
        "textures",
        "items",
        "combine",
        "channel",
        "softness",
        "invert",
        "sample",
        "progress",
      ],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(mask.kind)) {
    return invalidFromErrorFactory(errorFactory, `${path}.kind must be a non-empty string`);
  }

  if (
    mask.kind !== "single" &&
    mask.kind !== "sequence" &&
    mask.kind !== "composite"
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.kind must be 'single', 'sequence', or 'composite'`,
    );
  }

  if (mask.texture !== undefined && !isNonEmptyString(mask.texture)) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.texture must be a non-empty string when provided`,
    );
  }

  if (mask.textures !== undefined) {
    if (!Array.isArray(mask.textures) || mask.textures.length === 0) {
      return invalidFromErrorFactory(errorFactory, 
        `${path}.textures must be a non-empty array when provided`,
      );
    }

    for (const [index, texture] of mask.textures.entries()) {
      if (!isNonEmptyString(texture)) {
        return invalidFromErrorFactory(errorFactory, 
          `${path}.textures[${index}] must be a non-empty string`,
        );
      }
    }
  }

  if (mask.items !== undefined) {
    if (!Array.isArray(mask.items) || mask.items.length === 0) {
      return invalidFromErrorFactory(errorFactory, 
        `${path}.items must be a non-empty array when provided`,
      );
    }

    for (const [index, item] of mask.items.entries()) {
      const itemPath = `${path}.items[${index}]`;

      {
        const result = validateAllowedKeys({
          value: item,
          allowedKeys: ["texture", "channel", "invert"],
          path: itemPath,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(item.texture)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.texture must be a non-empty string`);
      }

      if (
        item.channel !== undefined &&
        !MASK_CHANNEL_KEYS.includes(item.channel)
      ) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.channel must be a supported mask channel`,
        );
      }

      if (item.invert !== undefined && typeof item.invert !== "boolean") {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.invert must be a boolean when provided`,
        );
      }
    }
  }

  if (mask.combine !== undefined && !MASK_COMBINE_KEYS.includes(mask.combine)) {
    return invalidFromErrorFactory(errorFactory, `${path}.combine must be a supported mask combine mode`);
  }

  if (mask.channel !== undefined && !MASK_CHANNEL_KEYS.includes(mask.channel)) {
    return invalidFromErrorFactory(errorFactory, `${path}.channel must be a supported mask channel`);
  }

  if (mask.softness !== undefined && !isFiniteNumber(mask.softness)) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.softness must be a finite number when provided`,
    );
  }

  if (mask.invert !== undefined && typeof mask.invert !== "boolean") {
    return invalidFromErrorFactory(errorFactory, `${path}.invert must be a boolean when provided`);
  }

  if (mask.sample !== undefined && !isString(mask.sample)) {
    return invalidFromErrorFactory(errorFactory, `${path}.sample must be a string when provided`);
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

  if (mask.kind === "single" && !isNonEmptyString(mask.texture)) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.texture is required when ${path}.kind is 'single'`,
    );
  }

  if (mask.kind === "sequence" && mask.textures === undefined) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.textures is required when ${path}.kind is 'sequence'`,
    );
  }

  if (mask.kind === "composite" && mask.items === undefined) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.items is required when ${path}.kind is 'composite'`,
    );
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
    return invalidFromErrorFactory(errorFactory, `${path}.type must be a non-empty string`);
  }

  if (animation.type !== "live" && animation.type !== "replace") {
    return invalidFromErrorFactory(errorFactory, `${path}.type must be 'live' or 'replace'`);
  }

  if (animation.type === "live") {
    if (
      animation.prev !== undefined ||
      animation.next !== undefined ||
      animation.mask !== undefined
    ) {
      return invalidFromErrorFactory(errorFactory, 
        `${path}.live animations cannot define prev, next, or mask`,
      );
    }

    if (animation.tween === undefined) {
      return invalidFromErrorFactory(errorFactory, 
        `${path}.tween is required when ${path}.type is 'live'`,
      );
    }

    {
      const result = validateTweenDefinition({
        tween: animation.tween,
        allowedProperties: LIVE_TWEEN_PROPERTY_KEYS,
        path: `${path}.tween`,
        unsupportedMessage: "is not a supported live tween property",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    return;
  }

  if (animation.tween !== undefined) {
    return invalidFromErrorFactory(errorFactory, `${path}.replace animations cannot define tween`);
  }

  if (
    animation.prev === undefined &&
    animation.next === undefined &&
    animation.mask === undefined
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path} must define at least one of prev, next, or mask when ${path}.type is 'replace'`,
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
        allowedProperties: REPLACE_TWEEN_PROPERTY_KEYS,
        path: `${path}.${side}.tween`,
        unsupportedMessage: "is not a supported replace tween property",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (animation.mask !== undefined) {
    {
      const result = validateMaskDefinition({
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'animation'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : ["id", "type", "name", "animation"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "animation") {
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

const validateFontItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "font") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'font'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : [
                "id",
                "type",
                "name",
                "fileId",
                "fontFamily",
                "fileType",
                "fileSize",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "font") {
      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileId must be a non-empty string`);
      }

      if (!isNonEmptyString(item.fontFamily)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fontFamily must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileType must be a string when provided`,
        );
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileSize must be a finite number`);
      }
    }
  }
};

const validateColorItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "color") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'color'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : ["id", "type", "name", "hex"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "color" && !isHexColor(item.hex)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.hex must be a #RRGGBB string`);
    }
  }
};

const validateTransformItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "transform") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'transform'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : [
                "id",
                "type",
                "name",
                "x",
                "y",
                "scaleX",
                "scaleY",
                "anchorX",
                "anchorY",
                "rotation",
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "transform") {
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
          return invalidFromErrorFactory(errorFactory, `${itemPath}.${key} must be a finite number`);
        }
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
    return invalidFromErrorFactory(errorFactory, `${path} must be a finite number`);
  }

  if (variableType === "boolean" && typeof value !== "boolean") {
    return invalidFromErrorFactory(errorFactory, `${path} must be a boolean`);
  }
};

const validateVariableItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;
    const variableType = item?.type;

    if (
      variableType !== "folder" &&
      !VARIABLE_TYPE_KEYS.includes(variableType)
    ) {
      return invalidFromErrorFactory(errorFactory, 
        `${itemPath}.type must be 'folder', 'string', 'number', or 'boolean'`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          variableType === "folder"
            ? ["id", "type", "name"]
            : ["id", "type", "name", "scope", "default", "value"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (variableType !== "folder") {
      if (!VARIABLE_SCOPE_KEYS.includes(item.scope)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.scope must be 'context', 'global-device', or 'global-account'`,
        );
      }

      {
        const result = validateVariableTypedValue({
          value: item.default,
          variableType,
          path: `${itemPath}.default`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
      {
        const result = validateVariableTypedValue({
          value: item.value,
          variableType,
          path: `${itemPath}.value`,
          errorFactory,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }
  }
};

const validateTextStyleItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "textStyle") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'textStyle'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : [
                "id",
                "type",
                "name",
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
              ],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "textStyle") {
      if (!isNonEmptyString(item.fontId)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fontId must be a non-empty string`);
      }

      if (!isNonEmptyString(item.colorId)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.colorId must be a non-empty string`);
      }

      if (!isFiniteNumber(item.fontSize)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fontSize must be a finite number`);
      }

      if (!isFiniteNumber(item.lineHeight)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.lineHeight must be a finite number`);
      }

      if (!isNonEmptyString(item.fontWeight)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fontWeight must be a non-empty string`);
      }

      if (item.previewText !== undefined && !isString(item.previewText)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.previewText must be a string when provided`,
        );
      }

      if (item.fontStyle !== undefined && !isString(item.fontStyle)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fontStyle must be a string when provided`,
        );
      }

      if (
        item.breakWords !== undefined &&
        typeof item.breakWords !== "boolean"
      ) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.breakWords must be a boolean when provided`,
        );
      }

      if (
        item.align !== undefined &&
        !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(item.align)
      ) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.align must be 'left', 'center', or 'right' when provided`,
        );
      }

      if (item.wordWrap !== undefined && typeof item.wordWrap !== "boolean") {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.wordWrap must be a boolean when provided`,
        );
      }

      if (
        item.wordWrapWidth !== undefined &&
        !isFiniteNumber(item.wordWrapWidth)
      ) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.wordWrapWidth must be a finite number when provided`,
        );
      }

      if (
        item.strokeColorId !== undefined &&
        !isNonEmptyString(item.strokeColorId)
      ) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.strokeColorId must be a non-empty string when provided`,
        );
      }

      if (item.strokeAlpha !== undefined && !isFiniteNumber(item.strokeAlpha)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.strokeAlpha must be a finite number when provided`,
        );
      }

      if (item.strokeWidth !== undefined && !isFiniteNumber(item.strokeWidth)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.strokeWidth must be a finite number when provided`,
        );
      }
    }
  }
};

const validateCharacterSpriteItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "image") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'image'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : [
                "id",
                "type",
                "name",
                "fileId",
                "fileType",
                "fileSize",
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "image") {
      if (!isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(errorFactory, `${itemPath}.fileId must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileType must be a string when provided`,
        );
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileSize must be a finite number when provided`,
        );
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.width must be a finite number when provided`,
        );
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.height must be a finite number when provided`,
        );
      }
    }
  }
};

const validateLayoutElementStyle = ({ style, path, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: style,
      allowedKeys: ["align", "wordWrapWidth"],
      path,
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (
    style.align !== undefined &&
    !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(style.align)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.align must be 'left', 'center', or 'right' when provided`,
    );
  }

  if (
    style.wordWrapWidth !== undefined &&
    !isFiniteNumber(style.wordWrapWidth)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.wordWrapWidth must be a finite number when provided`,
    );
  }
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
    "anchorX",
    "anchorY",
    "scaleX",
    "scaleY",
    "rotation",
    "opacity",
    "text",
    "style",
    "displaySpeed",
    "imageId",
    "hoverImageId",
    "clickImageId",
    "textStyleId",
    "hoverTextStyleId",
    "clickTextStyleId",
    "direction",
    "gap",
    "containerType",
    "scroll",
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
    "$when",
    "click",
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
      return invalidFromErrorFactory(errorFactory, 
        `${path}.type must be a supported layout element type`,
      );
    }
  }

  if (!allowPartial || data.name !== undefined) {
    if (!isNonEmptyString(data.name)) {
      return invalidFromErrorFactory(errorFactory, `${path}.name must be a non-empty string`);
    }
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
    "gap",
    "min",
    "max",
    "step",
    "opacity",
  ]) {
    if (data[key] !== undefined && !isFiniteNumber(data[key])) {
      return invalidFromErrorFactory(errorFactory, 
        `${path}.${key} must be a finite number when provided`,
      );
    }
  }

  if (
    data.initialValue !== undefined &&
    !isFiniteNumber(data.initialValue) &&
    !isString(data.initialValue)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.initialValue must be a finite number or string when provided`,
    );
  }

  if (
    data.opacity !== undefined &&
    (!isFiniteNumber(data.opacity) || data.opacity < 0 || data.opacity > 1)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.opacity must be a finite number between 0 and 1 when provided`,
    );
  }

  for (const key of [
    "text",
    "imageId",
    "hoverImageId",
    "clickImageId",
    "textStyleId",
    "hoverTextStyleId",
    "clickTextStyleId",
    "containerType",
    "variableId",
    "thumbImageId",
    "barImageId",
    "hoverThumbImageId",
    "hoverBarImageId",
    "$when",
  ]) {
    if (data[key] !== undefined && !isString(data[key])) {
      return invalidFromErrorFactory(errorFactory, `${path}.${key} must be a string when provided`);
    }
  }

  if (
    data.direction !== undefined &&
    data.direction !== "horizontal" &&
    data.direction !== "vertical"
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.direction must be 'horizontal' or 'vertical' when provided`,
    );
  }

  if (data.scroll !== undefined && typeof data.scroll !== "boolean") {
    return invalidFromErrorFactory(errorFactory, `${path}.scroll must be a boolean when provided`);
  }

  if (
    data.anchorToBottom !== undefined &&
    typeof data.anchorToBottom !== "boolean"
  ) {
    return invalidFromErrorFactory(errorFactory, 
      `${path}.anchorToBottom must be a boolean when provided`,
    );
  }

  if (data.style !== undefined) {
    {
      const result = validateLayoutElementStyle({
        style: data.style,
        path: `${path}.style`,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  if (data.click !== undefined && !isPlainObject(data.click)) {
    return invalidFromErrorFactory(errorFactory, `${path}.click must be an object when provided`);
  }

  if (data.change !== undefined && !isPlainObject(data.change)) {
    return invalidFromErrorFactory(errorFactory, `${path}.change must be an object when provided`);
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
          "anchorX",
          "anchorY",
          "scaleX",
          "scaleY",
          "rotation",
          "opacity",
          "text",
          "style",
          "displaySpeed",
          "imageId",
          "hoverImageId",
          "clickImageId",
          "textStyleId",
          "hoverTextStyleId",
          "clickTextStyleId",
          "direction",
          "gap",
          "containerType",
          "scroll",
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
          "$when",
          "click",
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'character'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : [
                "id",
                "type",
                "name",
                "description",
                "shortcut",
                "fileId",
                "fileType",
                "fileSize",
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "character") {
      if (item.description !== undefined && !isString(item.description)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.description must be a string when provided`,
        );
      }

      if (item.shortcut !== undefined && !isString(item.shortcut)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.shortcut must be a string when provided`,
        );
      }

      if (item.fileId !== undefined && !isNonEmptyString(item.fileId)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileId must be a non-empty string when provided`,
        );
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileType must be a string when provided`,
        );
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.fileSize must be a finite number when provided`,
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

const validateLayoutItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "layout") {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.type must be 'folder' or 'layout'`);
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys:
          item.type === "folder"
            ? ["id", "type", "name"]
            : ["id", "type", "name", "layoutType", "elements"],
        path: itemPath,
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (!isNonEmptyString(item.id)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "layout") {
      if (!LAYOUT_TYPE_KEYS.includes(item.layoutType)) {
        return invalidFromErrorFactory(errorFactory, 
          `${itemPath}.layoutType must be 'normal', 'dialogue', 'nvl', 'choice', or 'base'`,
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
      return invalidFromErrorFactory(errorFactory, `${nodePath}.id must reference an existing section`);
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
      return invalidState(
        `${nodePath}.children is not supported for lines`,
      );
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
      return invalidFromErrorFactory(errorFactory, 
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
      return invalidFromErrorFactory(errorFactory, 
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
      return invalidFromErrorFactory(errorFactory, `${nodePath}.id must be a non-empty string`);
    }

    if (!Object.hasOwn(items, node.id)) {
      return invalidFromErrorFactory(errorFactory, `${nodePath}.id must reference an existing item`);
    }

    if (seenIds.has(node.id)) {
      return invalidFromErrorFactory(errorFactory, `${nodePath}.id is duplicated in tree`);
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
    return invalidFromErrorFactory(errorFactory, `${path}.items must be an object`);
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
      return invalidFromErrorFactory(errorFactory, `${path}.tree is missing item '${itemId}'`);
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
    path === "state.transforms" ||
    path === "state.variables" ||
    path === "state.textStyles" ||
    path === "state.characters" ||
    path === "state.layouts"
  ) {
    {
      const result = validateGenericFolderOwnership({
        nodes: collection.tree,
        items: collection.items,
        path: `${path}.tree`,
        folderLabel:
          path === "state.layouts" ? "folder layout item" : "folder item",
      });
      if (result?.valid === false) {
        return result;
      }
    }
  }

  for (const itemId of Object.keys(collection.items)) {
    if (!seenIds.has(itemId)) {
      return invalidState(
        `${path}.tree is missing item '${itemId}'`,
      );
    }
  }
};

const validateFileReference = ({
  state,
  fileId,
  path,
  allowedTypes,
  details = {},
  errorFactory = createPreconditionValidationError,
}) => {
  if (fileId === undefined || fileId === null) {
    return VALID_RESULT;
  }

  const expectedTypeMessage =
    Array.isArray(allowedTypes) && allowedTypes.length > 0
      ? `${path} must reference an existing non-folder file with type ${allowedTypes
          .map((type) => `'${type}'`)
          .join(" or ")}`
      : `${path} must reference an existing non-folder file`;
  const file = state.files?.items?.[fileId];
  if (!isPlainObject(file) || file.type === "folder") {
    return invalidFromErrorFactory(
      errorFactory,
      expectedTypeMessage,
      Array.isArray(allowedTypes) && allowedTypes.length > 0
        ? {
            ...details,
            expectedFileTypes: [...allowedTypes],
          }
        : details,
    );
  }

  if (Array.isArray(allowedTypes) && allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return invalidFromErrorFactory(
      errorFactory,
      expectedTypeMessage,
      {
        ...details,
        expectedFileTypes: [...allowedTypes],
        actualFileType: file.type,
      },
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
        return invalidInvariant(
          "section.id must match the section key",
          { sceneId, sectionId },
        );
      }

      const lines = section.lines ?? createEmptyNestedCollection();

      for (const [lineId, line] of Object.entries(lines.items)) {
        if (!isNonEmptyString(line.id) || line.id !== lineId) {
          return invalidInvariant(
            "line.id must match the line key",
            { sceneId, sectionId, lineId },
          );
        }

        if (!isPlainObject(line.actions)) {
          return invalidInvariant(
            "line.actions must be an object",
            { sceneId, sectionId, lineId },
          );
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

    const font = state.fonts.items[textStyle.fontId];
    if (!isPlainObject(font) || font.type === "folder") {
      return invalidInvariant(
        "textStyle.fontId must reference an existing non-folder font",
        {
          textStyleId,
          fontId: textStyle.fontId,
        },
      );
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
        allowedTypes: IMAGE_FILE_REFERENCE_TYPES.fileId,
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
        allowedTypes: IMAGE_FILE_REFERENCE_TYPES.thumbnailFileId,
        details: { imageId, thumbnailFileId: image.thumbnailFileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
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
        allowedTypes: SOUND_FILE_REFERENCE_TYPES.fileId,
        details: { soundId, fileId: sound.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }

    if (sound.waveformDataFileId !== undefined && sound.waveformDataFileId !== null) {
      const result = validateFileReference({
        state,
        fileId: sound.waveformDataFileId,
        path: "sound.waveformDataFileId",
        allowedTypes: SOUND_FILE_REFERENCE_TYPES.waveformDataFileId,
        details: { soundId, waveformDataFileId: sound.waveformDataFileId },
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
        allowedTypes: VIDEO_FILE_REFERENCE_TYPES.fileId,
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
        allowedTypes: VIDEO_FILE_REFERENCE_TYPES.thumbnailFileId,
        details: { videoId, thumbnailFileId: video.thumbnailFileId },
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

    const result = validateFileReference({
      state,
      fileId: font.fileId,
      path: "font.fileId",
      allowedTypes: FONT_FILE_REFERENCE_TYPES.fileId,
      details: { fontId, fileId: font.fileId },
      errorFactory: createInvariantValidationError,
    });
    if (!result.valid) {
      return result;
    }
  }

  for (const [characterId, character] of Object.entries(state.characters.items)) {
    if (character.type !== "character") {
      continue;
    }

    if (character.fileId !== undefined) {
      const result = validateFileReference({
        state,
        fileId: character.fileId,
        path: "character.fileId",
        allowedTypes: CHARACTER_FILE_REFERENCE_TYPES.fileId,
        details: { characterId, fileId: character.fileId },
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
        allowedTypes: CHARACTER_FILE_REFERENCE_TYPES.fileId,
        details: { characterId, spriteId, fileId: sprite.fileId },
        errorFactory: createInvariantValidationError,
      });
      if (!result.valid) {
        return result;
      }
    }
  }

  const assertImageReference = ({ layoutId, elementId, field, targetId }) => {
    const image = state.images.items[targetId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidInvariant(
        `layout element ${field} must reference an existing non-folder image`,
        {
          layoutId,
          elementId,
          field,
          targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertTextStyleReference = ({
    layoutId,
    elementId,
    field,
    targetId,
  }) => {
    const textStyle = state.textStyles.items[targetId];
    if (!isPlainObject(textStyle) || textStyle.type === "folder") {
      return invalidInvariant(
        `layout element ${field} must reference an existing non-folder text style`,
        {
          layoutId,
          elementId,
          field,
          targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  const assertVariableReference = ({ layoutId, elementId, targetId }) => {
    const variable = state.variables.items[targetId];
    if (!isPlainObject(variable) || variable.type === "folder") {
      return invalidInvariant(
        "layout element variableId must reference an existing non-folder variable",
        {
          layoutId,
          elementId,
          variableId: targetId,
        },
      );
    }

    return VALID_RESULT;
  };

  for (const [layoutId, layout] of Object.entries(state.layouts.items)) {
    if (layout.type === "folder") {
      continue;
    }

    for (const [elementId, element] of Object.entries(layout.elements.items)) {
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
            layoutId,
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
            layoutId,
            elementId,
            field,
            targetId: element[field],
          });
          if (!result.valid) {
            return result;
          }
        }
      }

      if (element.variableId !== undefined) {
        const result = assertVariableReference({
          layoutId,
          elementId,
          targetId: element.variableId,
        });
        if (!result.valid) {
          return result;
        }
      }
    }
  }

  return VALID_RESULT;
};

const runValidateState = ({ state }) => {
  return captureValidation(() => {
    {
      const result = validateExactKeys({
        value: state,
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
        value: state.project,
        allowedKeys: ["resolution"],
        path: "state.project",
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (state.project.resolution !== undefined) {
      {
        const result = validateExactKeys({
          value: state.project.resolution,
          expectedKeys: ["width", "height"],
          path: "state.project.resolution",
          errorFactory: createStateValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isFiniteNumber(state.project.resolution.width)) {
        return invalidState(
          "state.project.resolution.width must be a finite number",
        );
      }

      if (!isFiniteNumber(state.project.resolution.height)) {
        return invalidState(
          "state.project.resolution.height must be a finite number",
        );
      }
    }

    {
      const result = validateExactKeys({
        value: state.story,
        expectedKeys: ["initialSceneId"],
        path: "state.story",
        errorFactory: createStateValidationError,
      });
      if (result?.valid === false) {
        return result;
      }
    }

    if (
      state.story.initialSceneId !== null &&
      !isNonEmptyString(state.story.initialSceneId)
    ) {
      return invalidState(
        "state.story.initialSceneId must be a non-empty string or null",
      );
    }

    for (const collectionKey of COLLECTION_KEYS) {
      {
        const result = validateCollection({
          collection: state[collectionKey],
          path: `state.${collectionKey}`,
        });
        if (result?.valid === false) {
          return result;
        }
      }
    }

    const invariantResult = assertInvariants({ state });
    if (!invariantResult.valid) {
      return invariantResult;
    }

    return VALID_RESULT;
  });
};

export const validateState = ({ state }) => runValidateState({ state });

const validatePlacementFields = ({ payload, errorFactory }) => {
  if (
    payload.index !== undefined &&
    (!Number.isInteger(payload.index) || payload.index < 0)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.index must be an integer greater than or equal to 0",
    );
  }

  const hasPosition = payload.position !== undefined;
  const hasPositionTargetId = payload.positionTargetId !== undefined;

  if (payload.index !== undefined && hasPosition) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.index cannot be combined with payload.position",
    );
  }

  if (!hasPosition) {
    if (hasPositionTargetId) {
      return invalidFromErrorFactory(errorFactory, "payload.positionTargetId requires payload.position");
    }
    return;
  }

  if (
    payload.position !== "first" &&
    payload.position !== "last" &&
    payload.position !== "before" &&
    payload.position !== "after"
  ) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.position must be 'first', 'last', 'before', or 'after'",
    );
  }

  if (payload.position === "before" || payload.position === "after") {
    if (!isNonEmptyString(payload.positionTargetId)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.positionTargetId must be a non-empty string when payload.position is 'before' or 'after'",
      );
    }
    return;
  }

  if (hasPositionTargetId) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.positionTargetId is allowed only when payload.position is 'before' or 'after'",
    );
  }
};

const validateSceneCreateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["name", "type", "position"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (
    data.type !== undefined &&
    data.type !== "scene" &&
    data.type !== "folder"
  ) {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'scene' or 'folder'");
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
      allowedKeys: ["name", "position"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  const hasName = data.name !== undefined;
  const hasPosition = data.position !== undefined;

  if (!hasName && !hasPosition) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (hasName && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
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
    return invalidFromErrorFactory(errorFactory, `${path} must be a non-empty array`);
  }

  const seen = new Set();

  for (const [index, entry] of value.entries()) {
    if (!isNonEmptyString(entry)) {
      return invalidFromErrorFactory(errorFactory, `${path}[${index}] must be a non-empty string`);
    }

    if (seen.has(entry)) {
      return invalidFromErrorFactory(errorFactory, `${path}[${index}] must be unique`);
    }

    seen.add(entry);
  }
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
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
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
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }
};

const validateLineCreatePayload = ({ payload, errorFactory }) => {
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return invalidFromErrorFactory(errorFactory, "payload.lines must be a non-empty array");
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.lineId must be a non-empty string`);
    }

    if (seenLineIds.has(item.lineId)) {
      return invalidFromErrorFactory(errorFactory, `${itemPath}.lineId must be unique`);
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
      return invalidFromErrorFactory(errorFactory, `${itemPath}.data.actions must be an object`);
    }
  }
};

const validateLineUpdateActionsData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }
};

const validateImageCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "image") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'image'");
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
              "thumbnailFileId",
              "fileId",
              "fileType",
              "fileSize",
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
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "image") {
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
      return invalidFromErrorFactory(errorFactory, "payload.data.fileId must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileType must be a string when provided",
      );
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.width must be a finite number");
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.height must be a finite number");
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
        "thumbnailFileId",
        "fileId",
        "fileType",
        "fileSize",
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
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.width must be a finite number");
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.height must be a finite number");
  }
};

const validateSoundCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "sound") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'sound'");
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
              "fileId",
              "fileType",
              "fileSize",
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
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "sound") {
    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileId must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileType must be a string when provided",
      );
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
    }

    if (
      data.waveformDataFileId !== undefined &&
      data.waveformDataFileId !== null &&
      !isNonEmptyString(data.waveformDataFileId)
    ) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.waveformDataFileId must be a non-empty string or null when provided",
      );
    }

    if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.duration must be a finite number");
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
        "fileId",
        "fileType",
        "fileSize",
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
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
  }

  if (
    data.waveformDataFileId !== undefined &&
    data.waveformDataFileId !== null &&
    !isNonEmptyString(data.waveformDataFileId)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.waveformDataFileId must be a non-empty string or null when provided",
    );
  }

  if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.duration must be a finite number");
  }
};

const validateVideoCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "video") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'video'");
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
              "fileId",
              "thumbnailFileId",
              "fileType",
              "fileSize",
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
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (data.type === "video") {
    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileId must be a non-empty string");
    }

    if (!isNonEmptyString(data.thumbnailFileId)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.thumbnailFileId must be a non-empty string",
      );
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileType must be a string when provided",
      );
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.width must be a finite number");
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.height must be a finite number");
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
        "fileId",
        "thumbnailFileId",
        "fileType",
        "fileSize",
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
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.width must be a finite number");
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.height must be a finite number");
  }
};

const validateFontCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "font") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'font'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name"]
          : ["type", "name", "fileId", "fontFamily", "fileType", "fileSize"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "font") {
    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileId must be a non-empty string");
    }

    if (!isNonEmptyString(data.fontFamily)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fontFamily must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileType must be a string when provided",
      );
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
    }
  }
};

const validateFontUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["name", "fileId", "fontFamily", "fileType", "fileSize"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (data.fontFamily !== undefined && !isNonEmptyString(data.fontFamily)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fontFamily must be a non-empty string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileSize must be a finite number");
  }
};

const validateFileCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data must be an object",
    );
  }

  if (data.type !== "folder" && !FILE_ITEM_TYPES.includes(data.type)) {
    return invalidFromErrorFactory(
      errorFactory,
      "payload.data.type must be 'folder' or a supported file type",
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
  fieldTypes = {},
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
      allowedTypes: fieldTypes[field],
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
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "color") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'color'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder" ? ["type", "name"] : ["type", "name", "hex"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "color" && !isHexColor(data.hex)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.hex must be a #RRGGBB string");
  }
};

const validateColorUpdateData = ({ data, errorFactory }) => {
  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys: ["name", "hex"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.hex !== undefined && !isHexColor(data.hex)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.hex must be a #RRGGBB string when provided",
    );
  }
};

const validateAnimationCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "animation") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'animation'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder" ? ["type", "name"] : ["type", "name", "animation"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "animation") {
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
      allowedKeys: ["name", "animation"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
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
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "transform") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'transform'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name"]
          : [
              "type",
              "name",
              "x",
              "y",
              "scaleX",
              "scaleY",
              "anchorX",
              "anchorY",
              "rotation",
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "transform") {
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
        return invalidFromErrorFactory(errorFactory, `payload.data.${key} must be a finite number`);
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
        "x",
        "y",
        "scaleX",
        "scaleY",
        "anchorX",
        "anchorY",
        "rotation",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
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
      return invalidFromErrorFactory(errorFactory, 
        `payload.data.${key} must be a finite number when provided`,
      );
    }
  }
};

const validateVariableCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && !VARIABLE_TYPE_KEYS.includes(data.type)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.type must be 'folder', 'string', 'number', or 'boolean'",
    );
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name"]
          : ["type", "name", "scope", "default", "value"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type !== "folder") {
    if (!VARIABLE_SCOPE_KEYS.includes(data.scope)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.scope must be 'context', 'global-device', or 'global-account'",
      );
    }

    {
      const result = validateVariableTypedValue({
        value: data.default,
        variableType: data.type,
        path: "payload.data.default",
        errorFactory,
      });
      if (result?.valid === false) {
        return result;
      }
    }
    {
      const result = validateVariableTypedValue({
        value: data.value,
        variableType: data.type,
        path: "payload.data.value",
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
      allowedKeys: ["name", "scope", "default", "value"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.scope !== undefined && !VARIABLE_SCOPE_KEYS.includes(data.scope)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.scope must be 'context', 'global-device', or 'global-account' when provided",
    );
  }
};

const validateTextStyleCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "textStyle") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'textStyle'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name"]
          : [
              "type",
              "name",
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
            ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "textStyle") {
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
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  for (const key of ["fontId", "colorId", "strokeColorId"]) {
    if (data[key] !== undefined && !isNonEmptyString(data[key])) {
      return invalidFromErrorFactory(errorFactory, 
        `payload.data.${key} must be a non-empty string when provided`,
      );
    }
  }

  for (const key of ["fontSize", "lineHeight", "strokeAlpha", "strokeWidth"]) {
    if (data[key] !== undefined && !isFiniteNumber(data[key])) {
      return invalidFromErrorFactory(errorFactory, 
        `payload.data.${key} must be a finite number when provided`,
      );
    }
  }

  for (const key of ["fontWeight", "previewText", "fontStyle"]) {
    if (data[key] !== undefined && !isString(data[key])) {
      return invalidFromErrorFactory(errorFactory, `payload.data.${key} must be a string when provided`);
    }
  }

  if (data.breakWords !== undefined && typeof data.breakWords !== "boolean") {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.breakWords must be a boolean when provided",
    );
  }

  if (data.wordWrap !== undefined && typeof data.wordWrap !== "boolean") {
    return invalidFromErrorFactory(errorFactory, "payload.data.wordWrap must be a boolean when provided");
  }

  if (data.wordWrapWidth !== undefined && !isFiniteNumber(data.wordWrapWidth)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.wordWrapWidth must be a finite number when provided",
    );
  }

  if (
    data.align !== undefined &&
    !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(data.align)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.align must be 'left', 'center', or 'right' when provided",
    );
  }
};

const validateCharacterSpriteCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "image") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'image'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name", "description"]
          : ["type", "name", "fileId", "fileType", "fileSize", "width", "height"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "image") {
    if (!isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(errorFactory, "payload.data.fileId must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileType must be a string when provided",
      );
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileSize must be a finite number when provided",
      );
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.width must be a finite number when provided",
      );
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.height must be a finite number when provided",
      );
    }

    if (data.description !== undefined && !isString(data.description)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.description must be a string when provided",
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
        "fileId",
        "fileType",
        "fileSize",
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
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileSize must be a finite number when provided",
    );
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.width must be a finite number when provided",
    );
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.height must be a finite number when provided",
    );
  }
};

const validateCharacterCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "character") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'character'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name"]
          : [
              "type",
              "name",
              "description",
              "shortcut",
              "fileId",
              "fileType",
              "fileSize",
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
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "character") {
    if (data.description !== undefined && !isString(data.description)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.description must be a string when provided",
      );
    }

    if (data.shortcut !== undefined && !isString(data.shortcut)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.shortcut must be a string when provided",
      );
    }

    if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileId must be a non-empty string when provided",
      );
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileType must be a string when provided",
      );
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.fileSize must be a finite number when provided",
      );
    }

    if (data.sprites !== undefined) {
      {
        const result = validateNestedCollection({
          collection: data.sprites,
          path: "payload.data.sprites",
          itemValidator: validateCharacterSpriteItems,
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
        "shortcut",
        "fileId",
        "fileType",
        "fileSize",
      ],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (data.description !== undefined && !isString(data.description)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.description must be a string when provided",
    );
  }

  if (data.shortcut !== undefined && !isString(data.shortcut)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.shortcut must be a string when provided");
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileId must be a non-empty string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.fileSize must be a finite number when provided",
    );
  }
};

const validateLayoutCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    return invalidFromErrorFactory(errorFactory, "payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "layout") {
    return invalidFromErrorFactory(errorFactory, "payload.data.type must be 'folder' or 'layout'");
  }

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys:
        data.type === "folder"
          ? ["type", "name"]
          : ["type", "name", "layoutType", "elements"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, "payload.data.name must be a non-empty string");
  }

  if (data.type === "layout") {
    if (!LAYOUT_TYPE_KEYS.includes(data.layoutType)) {
      return invalidFromErrorFactory(errorFactory, 
        "payload.data.layoutType must be 'normal', 'dialogue', 'nvl', 'choice', or 'base'",
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
      allowedKeys: ["name", "layoutType"],
      path: "payload.data",
      errorFactory,
    });
    if (result?.valid === false) {
      return result;
    }
  }

  if (Object.keys(data).length === 0) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.name must be a non-empty string when provided",
    );
  }

  if (
    data.layoutType !== undefined &&
    !LAYOUT_TYPE_KEYS.includes(data.layoutType)
  ) {
    return invalidFromErrorFactory(errorFactory, 
      "payload.data.layoutType must be 'normal', 'dialogue', 'nvl', 'choice', or 'base' when provided",
    );
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
    return invalidFromErrorFactory(errorFactory, 
      "payload.data must include at least one updatable field",
    );
  }
};

const validateLayoutElementReferenceTargets = ({
  layoutId,
  elementId,
  data,
  state,
  errorFactory,
}) => {
  if (data.imageId !== undefined) {
    const image = state.images.items[data.imageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(errorFactory, 
        "layout element imageId must reference an existing non-folder image",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element hoverImageId must reference an existing non-folder image",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element clickImageId must reference an existing non-folder image",
        {
          layoutId,
          elementId,
          field: "clickImageId",
          targetId: data.clickImageId,
        },
      );
    }
  }

  if (data.thumbImageId !== undefined) {
    const image = state.images.items[data.thumbImageId];
    if (!isPlainObject(image) || image.type === "folder") {
      return invalidFromErrorFactory(errorFactory, 
        "layout element thumbImageId must reference an existing non-folder image",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element hoverThumbImageId must reference an existing non-folder image",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element barImageId must reference an existing non-folder image",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element hoverBarImageId must reference an existing non-folder image",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element textStyleId must reference an existing non-folder text style",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element hoverTextStyleId must reference an existing non-folder text style",
        {
          layoutId,
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
      return invalidFromErrorFactory(errorFactory, 
        "layout element clickTextStyleId must reference an existing non-folder text style",
        {
          layoutId,
          elementId,
          field: "clickTextStyleId",
          targetId: data.clickTextStyleId,
        },
      );
    }
  }

  if (data.variableId !== undefined) {
    const variable = state.variables.items[data.variableId];
    if (!isPlainObject(variable) || variable.type === "folder") {
      return invalidFromErrorFactory(errorFactory, 
        "layout element variableId must reference an existing non-folder variable",
        {
          layoutId,
          elementId,
          variableId: data.variableId,
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
  includeUpdate = true,
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
          }
        }

        for (const itemId of deletedIds) {
          delete state[collectionKey].items[itemId];
        }

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

  for (const [characterId, character] of Object.entries(state.characters.items)) {
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
    reduce: ({ payload }) => structuredClone(payload.state),
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
            type: payload.data.type,
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
        return invalidPayload(
          "payload.sceneId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.sceneId must not already exist",
        );
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
        return invalidPayload(
          "payload.sceneId must be a non-empty string",
        );
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
        return invalidPayload(
          "payload.sceneId must be a non-empty string",
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
        return invalidPayload(
          "payload.sectionId must be a non-empty string",
        );
      }

      if (!isNonEmptyString(payload.sceneId)) {
        return invalidPayload(
          "payload.sceneId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.sectionId must not already exist",
        );
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
        return invalidPayload(
          "payload.sectionId must be a non-empty string",
        );
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
        return invalidPayload(
          "payload.sectionId must be a non-empty string",
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

      const sectionNode = findTreeNode({
        nodes: location.sections.tree,
        nodeId: payload.sectionId,
      });

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

        if (parentLocation.sceneId !== location.sceneId) {
          return invalidPrecondition(
            "payload.parentId must reference a section in the same scene",
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

        if (targetLocation.sceneId !== location.sceneId) {
          return invalidPrecondition(
            "payload.positionTargetId must reference a section in the same scene",
          );
        }

        const targetParentId = getNodeParentId({
          tree: location.sections.tree,
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
      const sectionNodeResult = removeNodeOrResult({
        tree: location.sections.tree,
        nodeId: payload.sectionId,
        errorMessage: "section move target missing from tree",
      });
      if (!sectionNodeResult.valid) {
        return sectionNodeResult;
      }

      insertTreeNode({
        tree: location.sections.tree,
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
        return invalidPayload(
          "payload.sectionId must be a non-empty string",
        );
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
          allowedKeys: ["lineId", "data", "replace"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });
        if (result?.valid === false) {
          return result;
        }
      }

      if (!isNonEmptyString(payload.lineId)) {
        return invalidPayload(
          "payload.lineId must be a non-empty string",
        );
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
      line.actions =
        payload.replace === true
          ? structuredClone(payload.data)
          : {
              ...structuredClone(line.actions),
              ...structuredClone(payload.data),
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
        return invalidPayload(
          "payload.lineId must be a non-empty string",
        );
      }

      if (!isNonEmptyString(payload.toSectionId)) {
        return invalidPayload(
          "payload.toSectionId must be a non-empty string",
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
        return invalidPayload(
          "payload.imageId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.imageId must not already exist",
        );
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
          fieldTypes: IMAGE_FILE_REFERENCE_TYPES,
          details: {
            imageId: payload.imageId,
          },
        });
        if (!result.valid) {
          return result;
        }
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
        if (payload.data.fileType !== undefined) {
          nextImage.fileType = payload.data.fileType;
        }
        if (payload.data.fileSize !== undefined) {
          nextImage.fileSize = payload.data.fileSize;
        }
        if (payload.data.width !== undefined) {
          nextImage.width = payload.data.width;
        }
        if (payload.data.height !== undefined) {
          nextImage.height = payload.data.height;
        }
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
        return invalidPayload(
          "payload.imageId must be a non-empty string",
        );
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
          payload.data.fileType !== undefined ||
          payload.data.fileSize !== undefined ||
          payload.data.width !== undefined ||
          payload.data.height !== undefined)
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
          fieldTypes: IMAGE_FILE_REFERENCE_TYPES,
          details: {
            imageId: payload.imageId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const currentImage = state.images.items[payload.imageId];
      state.images.items[payload.imageId] = {
        ...structuredClone(currentImage),
        ...structuredClone(payload.data),
      };
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
        return invalidPayload(
          "payload.imageId must be a non-empty string",
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
        return invalidPayload(
          "payload.soundId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.soundId must not already exist",
        );
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
          fieldTypes: SOUND_FILE_REFERENCE_TYPES,
          nullableFields: ["waveformDataFileId"],
          details: {
            soundId: payload.soundId,
          },
        });
        if (!result.valid) {
          return result;
        }
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
        if (payload.data.fileType !== undefined) {
          nextSound.fileType = payload.data.fileType;
        }
        if (payload.data.fileSize !== undefined) {
          nextSound.fileSize = payload.data.fileSize;
        }
        if (payload.data.waveformDataFileId !== undefined) {
          nextSound.waveformDataFileId = payload.data.waveformDataFileId;
        }
        if (payload.data.duration !== undefined) {
          nextSound.duration = payload.data.duration;
        }
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
        return invalidPayload(
          "payload.soundId must be a non-empty string",
        );
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
          payload.data.fileType !== undefined ||
          payload.data.fileSize !== undefined ||
          payload.data.waveformDataFileId !== undefined ||
          payload.data.duration !== undefined)
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
          fieldTypes: SOUND_FILE_REFERENCE_TYPES,
          nullableFields: ["waveformDataFileId"],
          details: {
            soundId: payload.soundId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const currentSound = state.sounds.items[payload.soundId];
      state.sounds.items[payload.soundId] = {
        ...structuredClone(currentSound),
        ...structuredClone(payload.data),
      };
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
        return invalidPayload(
          "payload.soundId must be a non-empty string",
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
        return invalidPayload(
          "payload.videoId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.videoId must not already exist",
        );
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
          fieldTypes: VIDEO_FILE_REFERENCE_TYPES,
          details: {
            videoId: payload.videoId,
          },
        });
        if (!result.valid) {
          return result;
        }
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
        if (payload.data.fileType !== undefined) {
          nextVideo.fileType = payload.data.fileType;
        }
        if (payload.data.fileSize !== undefined) {
          nextVideo.fileSize = payload.data.fileSize;
        }
        if (payload.data.width !== undefined) {
          nextVideo.width = payload.data.width;
        }
        if (payload.data.height !== undefined) {
          nextVideo.height = payload.data.height;
        }
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
        return invalidPayload(
          "payload.videoId must be a non-empty string",
        );
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
          payload.data.fileType !== undefined ||
          payload.data.fileSize !== undefined ||
          payload.data.width !== undefined ||
          payload.data.height !== undefined)
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
          fieldTypes: VIDEO_FILE_REFERENCE_TYPES,
          details: {
            videoId: payload.videoId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const currentVideo = state.videos.items[payload.videoId];
      state.videos.items[payload.videoId] = {
        ...structuredClone(currentVideo),
        ...structuredClone(payload.data),
      };
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
        return invalidPayload(
          "payload.videoId must be a non-empty string",
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
        return invalidPayload(
          "payload.animationId must be a non-empty string",
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
    },
    reduce: ({ state, payload }) => {
      const nextAnimation = {
        id: payload.animationId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.type === "animation") {
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
        return invalidPayload(
          "payload.animationId must be a non-empty string",
        );
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
        payload.data.animation !== undefined
      ) {
        return invalidPrecondition(
          "folder animation items cannot update animation fields",
        );
      }
    },
    reduce: ({ state, payload }) => {
      const currentAnimation = state.animations.items[payload.animationId];
      state.animations.items[payload.animationId] = {
        ...structuredClone(currentAnimation),
        ...structuredClone(payload.data),
      };
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
        return invalidPayload(
          "payload.animationId must be a non-empty string",
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
        return invalidPayload(
          "payload.fontId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.fontId must not already exist",
        );
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
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          fieldTypes: FONT_FILE_REFERENCE_TYPES,
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

      if (payload.data.type === "font") {
        nextFont.fileId = payload.data.fileId;
        nextFont.fontFamily = payload.data.fontFamily;
        if (payload.data.fileType !== undefined) {
          nextFont.fileType = payload.data.fileType;
        }
        if (payload.data.fileSize !== undefined) {
          nextFont.fileSize = payload.data.fileSize;
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
        return invalidPayload(
          "payload.fontId must be a non-empty string",
        );
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
        (payload.data.fileId !== undefined ||
          payload.data.fontFamily !== undefined ||
          payload.data.fileType !== undefined ||
          payload.data.fileSize !== undefined)
      ) {
        return invalidPrecondition(
          "folder font items cannot update font fields",
        );
      }

      if (currentFont.type === "font") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          fieldTypes: FONT_FILE_REFERENCE_TYPES,
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
      state.fonts.items[payload.fontId] = {
        ...structuredClone(currentFont),
        ...structuredClone(payload.data),
      };
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
        return invalidPayload(
          "payload.fontId must be a non-empty string",
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
        return invalidPayload(
          "payload.colorId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.colorId must not already exist",
        );
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
    },
    reduce: ({ state, payload }) => {
      const nextColor = {
        id: payload.colorId,
        type: payload.data.type,
        name: payload.data.name,
      };

      if (payload.data.type === "color") {
        nextColor.hex = payload.data.hex;
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
        return invalidPayload(
          "payload.colorId must be a non-empty string",
        );
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

      if (currentColor.type === "folder" && payload.data.hex !== undefined) {
        return invalidPrecondition(
          "folder color items cannot update color fields",
        );
      }
    },
    reduce: ({ state, payload }) => {
      const currentColor = state.colors.items[payload.colorId];
      state.colors.items[payload.colorId] = {
        ...structuredClone(currentColor),
        ...structuredClone(payload.data),
      };
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
        return invalidPayload(
          "payload.colorId must be a non-empty string",
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
    familyName: "transform",
    collectionKey: "transforms",
    idField: "transformId",
    itemLabel: "transform item",
    createDataValidator: validateTransformCreateData,
    updateDataValidator: validateTransformUpdateData,
    createItem: ({ payload }) => ({
      id: payload.transformId,
      type: payload.data.type,
      name: payload.data.name,
      ...(payload.data.type === "transform"
        ? {
            x: payload.data.x,
            y: payload.data.y,
            scaleX: payload.data.scaleX,
            scaleY: payload.data.scaleY,
            anchorX: payload.data.anchorX,
            anchorY: payload.data.anchorY,
            rotation: payload.data.rotation,
          }
        : {}),
    }),
    validateUpdateState: ({ payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        return invalidPrecondition(
          "folder transform items cannot update transform fields",
        );
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
    createItem: ({ payload }) => ({
      id: payload.variableId,
      type: payload.data.type,
      name: payload.data.name,
      ...(payload.data.type === "folder"
        ? {}
        : {
            scope: payload.data.scope,
            default: payload.data.default,
            value: payload.data.value,
          }),
    }),
    validateUpdateState: ({ payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        return invalidPrecondition(
          "folder variable items cannot update variable fields",
        );
      }

      if (currentItem.type !== "folder") {
        if (payload.data.default !== undefined) {
          {
            const result = validateVariableTypedValue({
              value: payload.data.default,
              variableType: currentItem.type,
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
              variableType: currentItem.type,
              path: "payload.data.value",
              errorFactory: createPreconditionValidationError,
            });
            if (result?.valid === false) {
              return result;
            }
          }
        }
      }
    },
  }),
  ...createFolderedCollectionCommandDefinitions({
    familyName: "textStyle",
    collectionKey: "textStyles",
    idField: "textStyleId",
    itemLabel: "text style item",
    createDataValidator: validateTextStyleCreateData,
    updateDataValidator: validateTextStyleUpdateData,
    createItem: ({ payload }) => ({
      id: payload.textStyleId,
      ...structuredClone(payload.data),
    }),
    validateCreateState: ({ state, payload }) => {
      const data = payload.data;
      if (data.type !== "textStyle") {
        return;
      }

      for (const field of ["fontId", "colorId", "strokeColorId"]) {
        if (data[field] === undefined) {
          continue;
        }

        const collectionKey = field === "fontId" ? "fonts" : "colors";
        const item = state[collectionKey].items[data[field]];
        if (!isPlainObject(item) || item.type === "folder") {
          return invalidPrecondition(
            `payload.data.${field} must reference an existing non-folder ${collectionKey.slice(0, -1)}`,
          );
        }
      }
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        return invalidPrecondition(
          "folder text style items cannot update text style fields",
        );
      }

      for (const field of ["fontId", "colorId", "strokeColorId"]) {
        if (payload.data[field] === undefined) {
          continue;
        }

        const collectionKey = field === "fontId" ? "fonts" : "colors";
        const item = state[collectionKey].items[payload.data[field]];
        if (!isPlainObject(item) || item.type === "folder") {
          return invalidPrecondition(
            `payload.data.${field} must reference an existing non-folder ${collectionKey.slice(0, -1)}`,
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

      if (item.type !== "character") {
        return item;
      }

      if (payload.data.description !== undefined) {
        item.description = payload.data.description;
      }

      if (payload.data.shortcut !== undefined) {
        item.shortcut = payload.data.shortcut;
      }

      if (payload.data.fileId !== undefined) {
        item.fileId = payload.data.fileId;
      }

      if (payload.data.fileType !== undefined) {
        item.fileType = payload.data.fileType;
      }

      if (payload.data.fileSize !== undefined) {
        item.fileSize = payload.data.fileSize;
      }

      item.sprites =
        payload.data.sprites === undefined
          ? { items: {}, tree: [] }
          : structuredClone(payload.data.sprites);

      return item;
    },
    validateCreateState: ({ state, payload }) => {
      if (payload.data.type !== "character") {
        return;
      }

      if (payload.data.fileId !== undefined) {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          fieldTypes: CHARACTER_FILE_REFERENCE_TYPES,
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

        const result = validateFileReference({
          state,
          fileId: sprite.fileId,
          path: "payload.data.sprites.items.*.fileId",
          allowedTypes: CHARACTER_FILE_REFERENCE_TYPES.fileId,
          details: {
            characterId: payload.characterId,
            spriteId,
            fileId: sprite.fileId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    validateUpdateState: ({ state, payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
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
          fieldTypes: CHARACTER_FILE_REFERENCE_TYPES,
          details: {
            characterId: payload.characterId,
          },
        });
        if (!result.valid) {
          return result;
        }
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
      ...(payload.data.type === "layout"
        ? {
            layoutType: payload.data.layoutType,
            elements: structuredClone(payload.data.elements),
          }
        : {}),
    }),
    validateUpdateState: ({ payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        return invalidPrecondition(
          "folder layout items cannot update layout fields",
        );
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
        return invalidPayload(
          "payload.characterId must be a non-empty string",
        );
      }

      if (!isNonEmptyString(payload.spriteId)) {
        return invalidPayload(
          "payload.spriteId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.spriteId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentItem = collection.items[parentId];
        if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder sprite item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          return invalidPrecondition(
            "payload.positionTargetId must reference an existing sprite item",
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
          fields: ["fileId"],
          fieldTypes: CHARACTER_FILE_REFERENCE_TYPES,
          details: {
            characterId: payload.characterId,
            spriteId: payload.spriteId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });

      collection.items[payload.spriteId] = {
        id: payload.spriteId,
        ...structuredClone(payload.data),
      };

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
        return invalidPayload(
          "payload.characterId must be a non-empty string",
        );
      }

      if (!isNonEmptyString(payload.spriteId)) {
        return invalidPayload(
          "payload.spriteId must be a non-empty string",
        );
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
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        return invalidPrecondition(
          "folder sprite items cannot update image fields",
        );
      }

      if (currentItem.type === "image") {
        const result = validateReferencedFilesInData({
          state,
          data: payload.data,
          fields: ["fileId"],
          fieldTypes: CHARACTER_FILE_REFERENCE_TYPES,
          details: {
            characterId: payload.characterId,
            spriteId: payload.spriteId,
          },
        });
        if (!result.valid) {
          return result;
        }
      }
    },
    reduce: ({ state, payload }) => {
      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const currentItem = collection.items[payload.spriteId];

      collection.items[payload.spriteId] = {
        ...structuredClone(currentItem),
        ...structuredClone(payload.data),
      };

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
        return invalidPayload(
          "payload.characterId must be a non-empty string",
        );
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
        return invalidPayload(
          "payload.characterId must be a non-empty string",
        );
      }

      if (!isNonEmptyString(payload.spriteId)) {
        return invalidPayload(
          "payload.spriteId must be a non-empty string",
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

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentItem = collection.items[payload.parentId];
        if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
          return invalidPrecondition(
            "payload.parentId must reference a folder sprite item",
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
        return invalidPayload(
          "payload.layoutId must be a non-empty string",
        );
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload(
          "payload.elementId must be a non-empty string",
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
        return invalidPrecondition(
          "payload.elementId must not already exist",
        );
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
        const result = validateLayoutElementReferenceTargets({
          layoutId: payload.layoutId,
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
          const result = validateLayoutElementReferenceTargets({
            layoutId: payload.layoutId,
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
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        return invalidPrecondition(
          "folder layout elements cannot update non-name fields",
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
        return invalidPayload(
          "payload.layoutId must be a non-empty string",
        );
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
        return invalidPayload(
          "payload.layoutId must be a non-empty string",
        );
      }

      if (!isNonEmptyString(payload.elementId)) {
        return invalidPayload(
          "payload.elementId must be a non-empty string",
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

export const validateAgainstState = ({ state, command }) => {
  return captureValidation(() => {
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

    const stateResult = validateState({ state });
    if (!stateResult.valid) {
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

    return normalizeStateResult(validationResult);
  });
};

export const processCommand = ({ state, command }) => {
  return captureValidation(() => {
    if (!isPlainObject(command)) {
      return invalidPrecondition("command must be an object");
    }

    const preconditionResult = validateAgainstState({
      state,
      command,
    });
    if (!preconditionResult.valid) {
      return preconditionResult;
    }

    const definition = getCommandDefinition({ type: command.type });
    if (!definition) {
      return invalidPrecondition(`unknown command type '${command.type}'`);
    }

    const nextState = definition.reduce({
      state: structuredClone(state),
      payload: command.payload,
    });
    if (nextState?.valid === false) {
      return nextState;
    }

    const finalState = nextState === undefined ? state : nextState;
    const stateResult = validateState({
      state: finalState,
    });
    if (!stateResult.valid) {
      return stateResult;
    }

    return {
      valid: true,
      state: finalState,
    };
  });
};
