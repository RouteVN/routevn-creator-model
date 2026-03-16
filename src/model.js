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
  "sections",
  "lines",
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
  "group",
];
export const SCHEMA_VERSION = 1;
const LAYOUT_CONTAINER_ELEMENT_TYPES = [
  "folder",
  "container",
  "container-ref-choice-item",
  "container-ref-dialogue-line",
];

const validateExactKeys = ({ value, expectedKeys, path, errorFactory }) => {
  if (!isPlainObject(value)) {
    throw errorFactory(`${path} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!expectedKeys.includes(key)) {
      throw errorFactory(`${path}.${key} is not allowed`);
    }
  }

  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      throw errorFactory(`${path}.${key} is required`);
    }
  }
};

const validateAllowedKeys = ({ value, allowedKeys, path, errorFactory }) => {
  if (!isPlainObject(value)) {
    throw errorFactory(`${path} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw errorFactory(`${path}.${key} is not allowed`);
    }
  }
};

const validateOptionalPosition = ({ value, path, errorFactory }) => {
  if (value === undefined) {
    return;
  }

  validateAllowedKeys({
    value,
    allowedKeys: ["x", "y"],
    path,
    errorFactory,
  });

  const hasX = value.x !== undefined;
  const hasY = value.y !== undefined;

  if (!hasX && !hasY) {
    throw errorFactory(`${path} must contain at least one of 'x' or 'y'`);
  }

  if (hasX && !isFiniteNumber(value.x)) {
    throw errorFactory(`${path}.x must be a finite number`);
  }

  if (hasY && !isFiniteNumber(value.y)) {
    throw errorFactory(`${path}.y must be a finite number`);
  }
};

const validateSceneItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    validateAllowedKeys({
      value: item,
      allowedKeys: ["id", "type", "name", "position"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (item.type !== "scene" && item.type !== "folder") {
      throw errorFactory(`${itemPath}.type must be 'scene' or 'folder'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    validateOptionalPosition({
      value: item.position,
      path: `${itemPath}.position`,
      errorFactory,
    });
  }
};

const validateSectionItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    validateAllowedKeys({
      value: item,
      allowedKeys: ["id", "sceneId", "name"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.sceneId)) {
      throw errorFactory(`${itemPath}.sceneId must be a non-empty string`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }
  }
};

const validateLineItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    validateAllowedKeys({
      value: item,
      allowedKeys: ["id", "sectionId", "actions"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.sectionId)) {
      throw errorFactory(`${itemPath}.sectionId must be a non-empty string`);
    }

    if (!isPlainObject(item.actions)) {
      throw errorFactory(`${itemPath}.actions must be an object`);
    }
  }
};

const validateImageItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "image") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'image'`);
    }

    validateAllowedKeys({
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
              "width",
              "height",
            ],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.description !== undefined && !isString(item.description)) {
      throw errorFactory(`${itemPath}.description must be a string when provided`);
    }

    if (item.type === "image") {
      if (!isNonEmptyString(item.fileId)) {
        throw errorFactory(`${itemPath}.fileId must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        throw errorFactory(`${itemPath}.fileType must be a string when provided`);
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        throw errorFactory(`${itemPath}.fileSize must be a finite number`);
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        throw errorFactory(`${itemPath}.width must be a finite number`);
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        throw errorFactory(`${itemPath}.height must be a finite number`);
      }
    }
  }
};

const validateSoundItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "sound") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'sound'`);
    }

    validateAllowedKeys({
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

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.description !== undefined && !isString(item.description)) {
      throw errorFactory(`${itemPath}.description must be a string when provided`);
    }

    if (item.type === "sound") {
      if (!isNonEmptyString(item.fileId)) {
        throw errorFactory(`${itemPath}.fileId must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        throw errorFactory(`${itemPath}.fileType must be a string when provided`);
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        throw errorFactory(`${itemPath}.fileSize must be a finite number`);
      }

      if (
        item.waveformDataFileId !== undefined &&
        item.waveformDataFileId !== null &&
        !isNonEmptyString(item.waveformDataFileId)
      ) {
        throw errorFactory(
          `${itemPath}.waveformDataFileId must be a non-empty string or null when provided`,
        );
      }

      if (item.duration !== undefined && !isFiniteNumber(item.duration)) {
        throw errorFactory(`${itemPath}.duration must be a finite number`);
      }
    }
  }
};

const validateVideoItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "video") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'video'`);
    }

    validateAllowedKeys({
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

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.description !== undefined && !isString(item.description)) {
      throw errorFactory(`${itemPath}.description must be a string when provided`);
    }

    if (item.type === "video") {
      if (!isNonEmptyString(item.fileId)) {
        throw errorFactory(`${itemPath}.fileId must be a non-empty string`);
      }

      if (!isNonEmptyString(item.thumbnailFileId)) {
        throw errorFactory(`${itemPath}.thumbnailFileId must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        throw errorFactory(`${itemPath}.fileType must be a string when provided`);
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        throw errorFactory(`${itemPath}.fileSize must be a finite number`);
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        throw errorFactory(`${itemPath}.width must be a finite number`);
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        throw errorFactory(`${itemPath}.height must be a finite number`);
      }
    }
  }
};

const validateAnimationKeyframes = ({ keyframes, path, errorFactory }) => {
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    throw errorFactory(`${path} must be a non-empty array`);
  }

  keyframes.forEach((keyframe, index) => {
    const keyframePath = `${path}[${index}]`;

    validateAllowedKeys({
      value: keyframe,
      allowedKeys: ["value", "duration", "easing", "relative"],
      path: keyframePath,
      errorFactory,
    });

    if (!("value" in keyframe)) {
      throw errorFactory(`${keyframePath}.value is required`);
    }

    if (!("duration" in keyframe)) {
      throw errorFactory(`${keyframePath}.duration is required`);
    }

    if (!isFiniteNumber(keyframe.value)) {
      throw errorFactory(`${keyframePath}.value must be a finite number`);
    }

    if (!isFiniteNumber(keyframe.duration) || keyframe.duration < 1) {
      throw errorFactory(`${keyframePath}.duration must be a finite number >= 1`);
    }

    if (
      keyframe.easing !== undefined &&
      !ANIMATION_EASING_KEYS.includes(keyframe.easing)
    ) {
      throw errorFactory(
        `${keyframePath}.easing must be a supported Route Graphics easing`,
      );
    }

    if (keyframe.relative !== undefined && typeof keyframe.relative !== "boolean") {
      throw errorFactory(`${keyframePath}.relative must be a boolean when provided`);
    }
  });
};

const validateTweenProperty = ({ config, path, errorFactory }) => {
  validateAllowedKeys({
    value: config,
    allowedKeys: ["initialValue", "keyframes"],
    path,
    errorFactory,
  });

  if (!("keyframes" in config)) {
    throw errorFactory(`${path}.keyframes is required`);
  }

  if (config.initialValue !== undefined && !isFiniteNumber(config.initialValue)) {
    throw errorFactory(`${path}.initialValue must be a finite number`);
  }

  validateAnimationKeyframes({
    keyframes: config.keyframes,
    path: `${path}.keyframes`,
    errorFactory,
  });
};

const validateTweenDefinition = ({
  tween,
  allowedProperties,
  path,
  unsupportedMessage,
  errorFactory,
}) => {
  if (!isPlainObject(tween)) {
    throw errorFactory(`${path} must be an object`);
  }

  if (Object.keys(tween).length === 0) {
    throw errorFactory(`${path} must include at least one tween property`);
  }

  for (const [propertyName, config] of Object.entries(tween)) {
    const propertyPath = `${path}.${propertyName}`;

    if (!allowedProperties.includes(propertyName)) {
      throw errorFactory(`${propertyPath} ${unsupportedMessage}`);
    }

    validateTweenProperty({
      config,
      path: propertyPath,
      errorFactory,
    });
  }
};

const validateMaskDefinition = ({ mask, path, errorFactory }) => {
  validateAllowedKeys({
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

  if (!isNonEmptyString(mask.kind)) {
    throw errorFactory(`${path}.kind must be a non-empty string`);
  }

  if (
    mask.kind !== "single" &&
    mask.kind !== "sequence" &&
    mask.kind !== "composite"
  ) {
    throw errorFactory(`${path}.kind must be 'single', 'sequence', or 'composite'`);
  }

  if (mask.texture !== undefined && !isNonEmptyString(mask.texture)) {
    throw errorFactory(`${path}.texture must be a non-empty string when provided`);
  }

  if (mask.textures !== undefined) {
    if (!Array.isArray(mask.textures) || mask.textures.length === 0) {
      throw errorFactory(`${path}.textures must be a non-empty array when provided`);
    }

    mask.textures.forEach((texture, index) => {
      if (!isNonEmptyString(texture)) {
        throw errorFactory(`${path}.textures[${index}] must be a non-empty string`);
      }
    });
  }

  if (mask.items !== undefined) {
    if (!Array.isArray(mask.items) || mask.items.length === 0) {
      throw errorFactory(`${path}.items must be a non-empty array when provided`);
    }

    mask.items.forEach((item, index) => {
      const itemPath = `${path}.items[${index}]`;

      validateAllowedKeys({
        value: item,
        allowedKeys: ["texture", "channel", "invert"],
        path: itemPath,
        errorFactory,
      });

      if (!isNonEmptyString(item.texture)) {
        throw errorFactory(`${itemPath}.texture must be a non-empty string`);
      }

      if (item.channel !== undefined && !MASK_CHANNEL_KEYS.includes(item.channel)) {
        throw errorFactory(`${itemPath}.channel must be a supported mask channel`);
      }

      if (item.invert !== undefined && typeof item.invert !== "boolean") {
        throw errorFactory(`${itemPath}.invert must be a boolean when provided`);
      }
    });
  }

  if (mask.combine !== undefined && !MASK_COMBINE_KEYS.includes(mask.combine)) {
    throw errorFactory(`${path}.combine must be a supported mask combine mode`);
  }

  if (mask.channel !== undefined && !MASK_CHANNEL_KEYS.includes(mask.channel)) {
    throw errorFactory(`${path}.channel must be a supported mask channel`);
  }

  if (mask.softness !== undefined && !isFiniteNumber(mask.softness)) {
    throw errorFactory(`${path}.softness must be a finite number when provided`);
  }

  if (mask.invert !== undefined && typeof mask.invert !== "boolean") {
    throw errorFactory(`${path}.invert must be a boolean when provided`);
  }

  if (mask.sample !== undefined && !isString(mask.sample)) {
    throw errorFactory(`${path}.sample must be a string when provided`);
  }

  if (mask.progress !== undefined) {
    validateTweenProperty({
      config: mask.progress,
      path: `${path}.progress`,
      errorFactory,
    });
  }

  if (mask.kind === "single" && !isNonEmptyString(mask.texture)) {
    throw errorFactory(`${path}.texture is required when ${path}.kind is 'single'`);
  }

  if (mask.kind === "sequence" && mask.textures === undefined) {
    throw errorFactory(`${path}.textures is required when ${path}.kind is 'sequence'`);
  }

  if (mask.kind === "composite" && mask.items === undefined) {
    throw errorFactory(`${path}.items is required when ${path}.kind is 'composite'`);
  }
};

const validateAnimationDefinition = ({ animation, path, errorFactory }) => {
  validateAllowedKeys({
    value: animation,
    allowedKeys: ["type", "tween", "prev", "next", "mask"],
    path,
    errorFactory,
  });

  if (!isNonEmptyString(animation.type)) {
    throw errorFactory(`${path}.type must be a non-empty string`);
  }

  if (animation.type !== "live" && animation.type !== "replace") {
    throw errorFactory(`${path}.type must be 'live' or 'replace'`);
  }

  if (animation.type === "live") {
    if (animation.prev !== undefined || animation.next !== undefined || animation.mask !== undefined) {
      throw errorFactory(`${path}.live animations cannot define prev, next, or mask`);
    }

    if (animation.tween === undefined) {
      throw errorFactory(`${path}.tween is required when ${path}.type is 'live'`);
    }

    validateTweenDefinition({
      tween: animation.tween,
      allowedProperties: LIVE_TWEEN_PROPERTY_KEYS,
      path: `${path}.tween`,
      unsupportedMessage: "is not a supported live tween property",
      errorFactory,
    });

    return;
  }

  if (animation.tween !== undefined) {
    throw errorFactory(`${path}.replace animations cannot define tween`);
  }

  if (
    animation.prev === undefined &&
    animation.next === undefined &&
    animation.mask === undefined
  ) {
    throw errorFactory(
      `${path} must define at least one of prev, next, or mask when ${path}.type is 'replace'`,
    );
  }

  for (const side of ["prev", "next"]) {
    if (animation[side] === undefined) {
      continue;
    }

    validateExactKeys({
      value: animation[side],
      expectedKeys: ["tween"],
      path: `${path}.${side}`,
      errorFactory,
    });

    validateTweenDefinition({
      tween: animation[side].tween,
      allowedProperties: REPLACE_TWEEN_PROPERTY_KEYS,
      path: `${path}.${side}.tween`,
      unsupportedMessage: "is not a supported replace tween property",
      errorFactory,
    });
  }

  if (animation.mask !== undefined) {
    validateMaskDefinition({
      mask: animation.mask,
      path: `${path}.mask`,
      errorFactory,
    });
  }
};

const validateAnimationItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "animation") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'animation'`);
    }

    validateAllowedKeys({
      value: item,
      allowedKeys:
        item.type === "folder"
          ? ["id", "type", "name"]
          : ["id", "type", "name", "animation"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "animation") {
      validateAnimationDefinition({
        animation: item.animation,
        path: `${itemPath}.animation`,
        errorFactory,
      });
    }
  }
};

const validateFontItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "font") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'font'`);
    }

    validateAllowedKeys({
      value: item,
      allowedKeys:
        item.type === "folder"
          ? ["id", "type", "name"]
          : ["id", "type", "name", "fileId", "fontFamily", "fileType", "fileSize"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "font") {
      if (!isNonEmptyString(item.fileId)) {
        throw errorFactory(`${itemPath}.fileId must be a non-empty string`);
      }

      if (!isNonEmptyString(item.fontFamily)) {
        throw errorFactory(`${itemPath}.fontFamily must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        throw errorFactory(`${itemPath}.fileType must be a string when provided`);
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        throw errorFactory(`${itemPath}.fileSize must be a finite number`);
      }
    }
  }
};

const validateColorItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "color") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'color'`);
    }

    validateAllowedKeys({
      value: item,
      allowedKeys:
        item.type === "folder"
          ? ["id", "type", "name"]
          : ["id", "type", "name", "hex"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "color" && !isHexColor(item.hex)) {
      throw errorFactory(`${itemPath}.hex must be a #RRGGBB string`);
    }
  }
};

const validateTransformItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "transform") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'transform'`);
    }

    validateAllowedKeys({
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

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
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
          throw errorFactory(`${itemPath}.${key} must be a finite number`);
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
    throw errorFactory(`${path} must be a string`);
  }

  if (variableType === "number" && !isFiniteNumber(value)) {
    throw errorFactory(`${path} must be a finite number`);
  }

  if (variableType === "boolean" && typeof value !== "boolean") {
    throw errorFactory(`${path} must be a boolean`);
  }
};

const validateVariableItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;
    const variableType = item?.type;

    if (variableType !== "folder" && !VARIABLE_TYPE_KEYS.includes(variableType)) {
      throw errorFactory(
        `${itemPath}.type must be 'folder', 'string', 'number', or 'boolean'`,
      );
    }

    validateAllowedKeys({
      value: item,
      allowedKeys:
        variableType === "folder"
          ? ["id", "type", "name"]
          : ["id", "type", "name", "scope", "default", "value"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (variableType !== "folder") {
      if (!VARIABLE_SCOPE_KEYS.includes(item.scope)) {
        throw errorFactory(
          `${itemPath}.scope must be 'context', 'global-device', or 'global-account'`,
        );
      }

      validateVariableTypedValue({
        value: item.default,
        variableType,
        path: `${itemPath}.default`,
        errorFactory,
      });
      validateVariableTypedValue({
        value: item.value,
        variableType,
        path: `${itemPath}.value`,
        errorFactory,
      });
    }
  }
};

const validateTextStyleItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "textStyle") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'textStyle'`);
    }

    validateAllowedKeys({
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

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "textStyle") {
      if (!isNonEmptyString(item.fontId)) {
        throw errorFactory(`${itemPath}.fontId must be a non-empty string`);
      }

      if (!isNonEmptyString(item.colorId)) {
        throw errorFactory(`${itemPath}.colorId must be a non-empty string`);
      }

      if (!isFiniteNumber(item.fontSize)) {
        throw errorFactory(`${itemPath}.fontSize must be a finite number`);
      }

      if (!isFiniteNumber(item.lineHeight)) {
        throw errorFactory(`${itemPath}.lineHeight must be a finite number`);
      }

      if (!isNonEmptyString(item.fontWeight)) {
        throw errorFactory(`${itemPath}.fontWeight must be a non-empty string`);
      }

      if (item.previewText !== undefined && !isString(item.previewText)) {
        throw errorFactory(`${itemPath}.previewText must be a string when provided`);
      }

      if (item.fontStyle !== undefined && !isString(item.fontStyle)) {
        throw errorFactory(`${itemPath}.fontStyle must be a string when provided`);
      }

      if (item.breakWords !== undefined && typeof item.breakWords !== "boolean") {
        throw errorFactory(`${itemPath}.breakWords must be a boolean when provided`);
      }

      if (item.align !== undefined && !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(item.align)) {
        throw errorFactory(`${itemPath}.align must be 'left', 'center', or 'right' when provided`);
      }

      if (item.wordWrap !== undefined && typeof item.wordWrap !== "boolean") {
        throw errorFactory(`${itemPath}.wordWrap must be a boolean when provided`);
      }

      if (item.wordWrapWidth !== undefined && !isFiniteNumber(item.wordWrapWidth)) {
        throw errorFactory(`${itemPath}.wordWrapWidth must be a finite number when provided`);
      }

      if (item.strokeColorId !== undefined && !isNonEmptyString(item.strokeColorId)) {
        throw errorFactory(`${itemPath}.strokeColorId must be a non-empty string when provided`);
      }

      if (item.strokeAlpha !== undefined && !isFiniteNumber(item.strokeAlpha)) {
        throw errorFactory(`${itemPath}.strokeAlpha must be a finite number when provided`);
      }

      if (item.strokeWidth !== undefined && !isFiniteNumber(item.strokeWidth)) {
        throw errorFactory(`${itemPath}.strokeWidth must be a finite number when provided`);
      }
    }
  }
};

const validateCharacterSpriteItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "image") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'image'`);
    }

    validateAllowedKeys({
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

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "image") {
      if (!isNonEmptyString(item.fileId)) {
        throw errorFactory(`${itemPath}.fileId must be a non-empty string`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        throw errorFactory(`${itemPath}.fileType must be a string when provided`);
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        throw errorFactory(`${itemPath}.fileSize must be a finite number when provided`);
      }

      if (item.width !== undefined && !isFiniteNumber(item.width)) {
        throw errorFactory(`${itemPath}.width must be a finite number when provided`);
      }

      if (item.height !== undefined && !isFiniteNumber(item.height)) {
        throw errorFactory(`${itemPath}.height must be a finite number when provided`);
      }
    }
  }
};

const validateLayoutElementStyle = ({ style, path, errorFactory }) => {
  validateAllowedKeys({
    value: style,
    allowedKeys: ["align", "wordWrapWidth"],
    path,
    errorFactory,
  });

  if (style.align !== undefined && !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(style.align)) {
    throw errorFactory(`${path}.align must be 'left', 'center', or 'right' when provided`);
  }

  if (style.wordWrapWidth !== undefined && !isFiniteNumber(style.wordWrapWidth)) {
    throw errorFactory(`${path}.wordWrapWidth must be a finite number when provided`);
  }
};

const validateLayoutElementData = ({
  data,
  path,
  errorFactory,
  allowPartial = false,
}) => {
  if (!isPlainObject(data)) {
    throw errorFactory(`${path} must be an object`);
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

  validateAllowedKeys({
    value: data,
    allowedKeys,
    path,
    errorFactory,
  });

  if (!allowPartial || data.type !== undefined) {
    if (!LAYOUT_ELEMENT_BASE_TYPES.includes(data.type)) {
      throw errorFactory(
        `${path}.type must be a supported layout element type`,
      );
    }
  }

  if (!allowPartial || data.name !== undefined) {
    if (!isNonEmptyString(data.name)) {
      throw errorFactory(`${path}.name must be a non-empty string`);
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
      throw errorFactory(`${path}.${key} must be a finite number when provided`);
    }
  }

  if (
    data.initialValue !== undefined &&
    !isFiniteNumber(data.initialValue) &&
    !isString(data.initialValue)
  ) {
    throw errorFactory(
      `${path}.initialValue must be a finite number or string when provided`,
    );
  }

  if (
    data.opacity !== undefined &&
    (!isFiniteNumber(data.opacity) || data.opacity < 0 || data.opacity > 1)
  ) {
    throw errorFactory(`${path}.opacity must be a finite number between 0 and 1 when provided`);
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
      throw errorFactory(`${path}.${key} must be a string when provided`);
    }
  }

  if (
    data.direction !== undefined &&
    data.direction !== "horizontal" &&
    data.direction !== "vertical"
  ) {
    throw errorFactory(`${path}.direction must be 'horizontal' or 'vertical' when provided`);
  }

  if (data.scroll !== undefined && typeof data.scroll !== "boolean") {
    throw errorFactory(`${path}.scroll must be a boolean when provided`);
  }

  if (
    data.anchorToBottom !== undefined &&
    typeof data.anchorToBottom !== "boolean"
  ) {
    throw errorFactory(`${path}.anchorToBottom must be a boolean when provided`);
  }

  if (data.style !== undefined) {
    validateLayoutElementStyle({
      style: data.style,
      path: `${path}.style`,
      errorFactory,
    });
  }

  if (data.click !== undefined && !isPlainObject(data.click)) {
    throw errorFactory(`${path}.click must be an object when provided`);
  }

  if (data.change !== undefined && !isPlainObject(data.change)) {
    throw errorFactory(`${path}.change must be an object when provided`);
  }
};

const validateLayoutElementItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    validateAllowedKeys({
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

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    validateLayoutElementData({
      data: Object.fromEntries(
        Object.entries(item).filter(([key]) => key !== "id"),
      ),
      path: itemPath,
      errorFactory,
    });
  }
};

const validateCharacterItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "character") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'character'`);
    }

    validateAllowedKeys({
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

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "character") {
      if (item.description !== undefined && !isString(item.description)) {
        throw errorFactory(`${itemPath}.description must be a string when provided`);
      }

      if (item.shortcut !== undefined && !isString(item.shortcut)) {
        throw errorFactory(`${itemPath}.shortcut must be a string when provided`);
      }

      if (item.fileId !== undefined && !isNonEmptyString(item.fileId)) {
        throw errorFactory(`${itemPath}.fileId must be a non-empty string when provided`);
      }

      if (item.fileType !== undefined && !isString(item.fileType)) {
        throw errorFactory(`${itemPath}.fileType must be a string when provided`);
      }

      if (item.fileSize !== undefined && !isFiniteNumber(item.fileSize)) {
        throw errorFactory(`${itemPath}.fileSize must be a finite number when provided`);
      }

      validateNestedCollection({
        collection: item.sprites,
        path: `${itemPath}.sprites`,
        itemValidator: validateCharacterSpriteItems,
        treeValidator: validateGenericFolderOwnership,
        treeNodeLabel: "sprite",
        folderLabel: "folder sprite item",
      });
    }
  }
};

const validateLayoutItems = ({ items, path, errorFactory }) => {
  for (const [itemId, item] of Object.entries(items)) {
    const itemPath = `${path}.${itemId}`;

    if (item?.type !== "folder" && item?.type !== "layout") {
      throw errorFactory(`${itemPath}.type must be 'folder' or 'layout'`);
    }

    validateAllowedKeys({
      value: item,
      allowedKeys:
        item.type === "folder"
          ? ["id", "type", "name"]
          : ["id", "type", "name", "layoutType", "elements"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.id)) {
      throw errorFactory(`${itemPath}.id must be a non-empty string`);
    }

    if (item.id !== itemId) {
      throw errorFactory(`${itemPath}.id must match item key '${itemId}'`);
    }

    if (!isNonEmptyString(item.name)) {
      throw errorFactory(`${itemPath}.name must be a non-empty string`);
    }

    if (item.type === "layout") {
      if (!LAYOUT_TYPE_KEYS.includes(item.layoutType)) {
        throw errorFactory(
          `${itemPath}.layoutType must be 'normal', 'dialogue', 'nvl', 'choice', or 'base'`,
        );
      }

      validateNestedCollection({
        collection: item.elements,
        path: `${itemPath}.elements`,
        itemValidator: validateLayoutElementItems,
        treeValidator: validateLayoutElementTreeOwnership,
        treeNodeLabel: "layout element",
      });
    }
  }
};

const validateSceneTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      throw createStateValidationError(
        `${nodePath}.children requires '${node.id}' to be a folder scene`,
      );
    }

    validateSceneTreeFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
  }
};

const validateSectionTreeSceneOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    for (const childNode of children) {
      if (items[childNode.id]?.sceneId !== items[node.id]?.sceneId) {
        throw createStateValidationError(
          `${nodePath}.children must stay within the same scene as '${node.id}'`,
        );
      }
    }

    validateSectionTreeSceneOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
  }
};

const validateLineTreeFlatShape = ({ nodes, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0) {
      throw createStateValidationError(`${nodePath}.children is not supported for lines`);
    }
  }
};

const validateImageTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      throw createStateValidationError(
        `${nodePath}.children requires '${node.id}' to be a folder image item`,
      );
    }

    validateImageTreeFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
  }
};

const validateSoundTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      throw createStateValidationError(
        `${nodePath}.children requires '${node.id}' to be a folder sound item`,
      );
    }

    validateSoundTreeFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
  }
};

const validateVideoTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      throw createStateValidationError(
        `${nodePath}.children requires '${node.id}' to be a folder video item`,
      );
    }

    validateVideoTreeFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
  }
};

const validateAnimationTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      throw createStateValidationError(
        `${nodePath}.children requires '${node.id}' to be a folder animation item`,
      );
    }

    validateAnimationTreeFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
  }
};

const validateFontTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      throw createStateValidationError(
        `${nodePath}.children requires '${node.id}' to be a folder font item`,
      );
    }

    validateFontTreeFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
  }
};

const validateColorTreeFolderOwnership = ({ nodes, items, path }) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;
    const children = Array.isArray(node.children) ? node.children : [];

    if (children.length > 0 && items[node.id]?.type !== "folder") {
      throw createStateValidationError(
        `${nodePath}.children requires '${node.id}' to be a folder color item`,
      );
    }

    validateColorTreeFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
    });
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
      throw errorFactory(
        `${nodePath}.children requires '${node.id}' to be a ${folderLabel}`,
      );
    }

    validateGenericFolderOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
      folderLabel,
      errorFactory,
    });
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
      throw errorFactory(
        `${nodePath}.children requires '${node.id}' to be a folder or container layout element`,
      );
    }

    validateLayoutElementTreeOwnership({
      nodes: children,
      items,
      path: `${nodePath}.children`,
      errorFactory,
    });
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
    throw errorFactory(`${path} must be an array`);
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nodePath = `${path}[${index}]`;

    validateAllowedKeys({
      value: node,
      allowedKeys: ["id", "children"],
      path: nodePath,
      errorFactory,
    });

    if (!isNonEmptyString(node.id)) {
      throw errorFactory(`${nodePath}.id must be a non-empty string`);
    }

    if (!Object.hasOwn(items, node.id)) {
      throw errorFactory(`${nodePath}.id must reference an existing item`);
    }

    if (seenIds.has(node.id)) {
      throw errorFactory(`${nodePath}.id is duplicated in tree`);
    }
    seenIds.add(node.id);

    if (Object.hasOwn(node, "children")) {
      validateTreeNodes({
        nodes: node.children,
        items,
        path: `${nodePath}.children`,
        seenIds,
        errorFactory,
      });
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
  validateExactKeys({
    value: collection,
    expectedKeys: ["items", "tree"],
    path,
    errorFactory,
  });

  if (!isPlainObject(collection.items)) {
    throw errorFactory(`${path}.items must be an object`);
  }

  itemValidator({
    items: collection.items,
    path: `${path}.items`,
    errorFactory,
  });

  const seenIds = new Set();
  validateTreeNodes({
    nodes: collection.tree,
    items: collection.items,
    path: `${path}.tree`,
    seenIds,
    errorFactory,
  });

  treeValidator({
    nodes: collection.tree,
    items: collection.items,
    path: `${path}.tree`,
    folderLabel,
    errorFactory,
  });

  for (const itemId of Object.keys(collection.items)) {
    if (!seenIds.has(itemId)) {
      throw errorFactory(`${path}.tree is missing item '${itemId}'`);
    }
  }
};

const validateCollection = ({ collection, path }) => {
  validateExactKeys({
    value: collection,
    expectedKeys: ["items", "tree"],
    path,
    errorFactory: createStateValidationError,
  });

  if (!isPlainObject(collection.items)) {
    throw createStateValidationError(`${path}.items must be an object`);
  }

  if (path === "state.scenes") {
    validateSceneItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.sections") {
    validateSectionItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.lines") {
    validateLineItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.images") {
    validateImageItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.sounds") {
    validateSoundItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.videos") {
    validateVideoItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.animations") {
    validateAnimationItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.fonts") {
    validateFontItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.colors") {
    validateColorItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.transforms") {
    validateTransformItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.variables") {
    validateVariableItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.textStyles") {
    validateTextStyleItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.characters") {
    validateCharacterItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  } else if (path === "state.layouts") {
    validateLayoutItems({
      items: collection.items,
      path: `${path}.items`,
      errorFactory: createStateValidationError,
    });
  }

  if (!Array.isArray(collection.tree)) {
    throw createStateValidationError(`${path}.tree must be an array`);
  }

  const seenIds = new Set();
  validateTreeNodes({
    nodes: collection.tree,
    items: collection.items,
    path: `${path}.tree`,
    seenIds,
  });

  if (path === "state.scenes") {
    validateSceneTreeFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (path === "state.sections") {
    validateSectionTreeSceneOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (path === "state.lines") {
    validateLineTreeFlatShape({
      nodes: collection.tree,
      path: `${path}.tree`,
    });
  } else if (path === "state.images") {
    validateImageTreeFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (path === "state.sounds") {
    validateSoundTreeFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (path === "state.videos") {
    validateVideoTreeFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (path === "state.animations") {
    validateAnimationTreeFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (path === "state.fonts") {
    validateFontTreeFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (path === "state.colors") {
    validateColorTreeFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
    });
  } else if (
    path === "state.transforms" ||
    path === "state.variables" ||
    path === "state.textStyles" ||
    path === "state.characters" ||
    path === "state.layouts"
  ) {
    validateGenericFolderOwnership({
      nodes: collection.tree,
      items: collection.items,
      path: `${path}.tree`,
      folderLabel: path === "state.layouts" ? "folder layout item" : "folder item",
    });
  }

  for (const itemId of Object.keys(collection.items)) {
    if (!seenIds.has(itemId)) {
      throw createStateValidationError(`${path}.tree is missing item '${itemId}'`);
    }
  }
};

export const assertInvariants = ({ state }) => {
  if (!isPlainObject(state)) {
    throw createInvariantValidationError("state must be an object");
  }

  const initialSceneId = state.story?.initialSceneId;
  const sceneItems = state?.scenes?.items;

  if (initialSceneId !== null && !isNonEmptyString(initialSceneId)) {
    throw createInvariantValidationError(
      "story.initialSceneId must be a non-empty string or null",
    );
  }

  if (initialSceneId !== null) {
    if (!isPlainObject(sceneItems) || !isPlainObject(sceneItems[initialSceneId])) {
      throw createInvariantValidationError(
        "story.initialSceneId must reference an existing scene",
        { initialSceneId },
      );
    }

    if (sceneItems[initialSceneId].type === "folder") {
      throw createInvariantValidationError(
        "story.initialSceneId must reference a non-folder scene",
        { initialSceneId },
      );
    }
  }

  for (const [sectionId, section] of Object.entries(state.sections.items)) {
    const scene = sceneItems[section.sceneId];
    if (!isPlainObject(scene)) {
      throw createInvariantValidationError(
        "section.sceneId must reference an existing scene",
        {
          sectionId,
          sceneId: section.sceneId,
        },
      );
    }

    if (scene.type === "folder") {
      throw createInvariantValidationError(
        "section.sceneId must reference a non-folder scene",
        {
          sectionId,
          sceneId: section.sceneId,
        },
      );
    }
  }

  for (const [lineId, line] of Object.entries(state.lines.items)) {
    if (!isPlainObject(state.sections.items[line.sectionId])) {
      throw createInvariantValidationError(
        "line.sectionId must reference an existing section",
        {
          lineId,
          sectionId: line.sectionId,
        },
      );
    }
  }

  for (const [textStyleId, textStyle] of Object.entries(state.textStyles.items)) {
    if (textStyle.type === "folder") {
      continue;
    }

    const font = state.fonts.items[textStyle.fontId];
    if (!isPlainObject(font) || font.type === "folder") {
      throw createInvariantValidationError(
        "textStyle.fontId must reference an existing non-folder font",
        {
          textStyleId,
          fontId: textStyle.fontId,
        },
      );
    }

    const color = state.colors.items[textStyle.colorId];
    if (!isPlainObject(color) || color.type === "folder") {
      throw createInvariantValidationError(
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
        throw createInvariantValidationError(
          "textStyle.strokeColorId must reference an existing non-folder color",
          {
            textStyleId,
            strokeColorId: textStyle.strokeColorId,
          },
        );
      }
    }
  }

  const assertImageReference = ({ layoutId, elementId, field, targetId }) => {
    const image = state.images.items[targetId];
    if (!isPlainObject(image) || image.type === "folder") {
      throw createInvariantValidationError(
        `layout element ${field} must reference an existing non-folder image`,
        {
          layoutId,
          elementId,
          field,
          targetId,
        },
      );
    }
  };

  const assertTextStyleReference = ({ layoutId, elementId, field, targetId }) => {
    const textStyle = state.textStyles.items[targetId];
    if (!isPlainObject(textStyle) || textStyle.type === "folder") {
      throw createInvariantValidationError(
        `layout element ${field} must reference an existing non-folder text style`,
        {
          layoutId,
          elementId,
          field,
          targetId,
        },
      );
    }
  };

  const assertVariableReference = ({ layoutId, elementId, targetId }) => {
    const variable = state.variables.items[targetId];
    if (!isPlainObject(variable) || variable.type === "folder") {
      throw createInvariantValidationError(
        "layout element variableId must reference an existing non-folder variable",
        {
          layoutId,
          elementId,
          variableId: targetId,
        },
      );
    }
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
          assertImageReference({
            layoutId,
            elementId,
            field,
            targetId: element[field],
          });
        }
      }

      for (const field of [
        "textStyleId",
        "hoverTextStyleId",
        "clickTextStyleId",
      ]) {
        if (element[field] !== undefined) {
          assertTextStyleReference({
            layoutId,
            elementId,
            field,
            targetId: element[field],
          });
        }
      }

      if (element.variableId !== undefined) {
        assertVariableReference({
          layoutId,
          elementId,
          targetId: element.variableId,
        });
      }
    }
  }
};

export const validateState = ({ state }) => {
  validateExactKeys({
    value: state,
    expectedKeys: ROOT_KEYS,
    path: "state",
    errorFactory: createStateValidationError,
  });

  validateAllowedKeys({
    value: state.project,
    allowedKeys: ["resolution"],
    path: "state.project",
    errorFactory: createStateValidationError,
  });

  if (state.project.resolution !== undefined) {
    validateExactKeys({
      value: state.project.resolution,
      expectedKeys: ["width", "height"],
      path: "state.project.resolution",
      errorFactory: createStateValidationError,
    });

    if (!isFiniteNumber(state.project.resolution.width)) {
      throw createStateValidationError(
        "state.project.resolution.width must be a finite number",
      );
    }

    if (!isFiniteNumber(state.project.resolution.height)) {
      throw createStateValidationError(
        "state.project.resolution.height must be a finite number",
      );
    }
  }

  validateExactKeys({
    value: state.story,
    expectedKeys: ["initialSceneId"],
    path: "state.story",
    errorFactory: createStateValidationError,
  });

  if (
    state.story.initialSceneId !== null &&
    !isNonEmptyString(state.story.initialSceneId)
  ) {
    throw createStateValidationError(
      "state.story.initialSceneId must be a non-empty string or null",
    );
  }

  for (const collectionKey of COLLECTION_KEYS) {
    validateCollection({
      collection: state[collectionKey],
      path: `state.${collectionKey}`,
    });
  }

  assertInvariants({ state });
};

const validatePlacementFields = ({ payload, errorFactory }) => {
  if (
    payload.index !== undefined &&
    (!Number.isInteger(payload.index) || payload.index < 0)
  ) {
    throw errorFactory("payload.index must be an integer greater than or equal to 0");
  }

  const hasPosition = payload.position !== undefined;
  const hasPositionTargetId = payload.positionTargetId !== undefined;

  if (payload.index !== undefined && hasPosition) {
    throw errorFactory("payload.index cannot be combined with payload.position");
  }

  if (!hasPosition) {
    if (hasPositionTargetId) {
      throw errorFactory("payload.positionTargetId requires payload.position");
    }
    return;
  }

  if (
    payload.position !== "first" &&
    payload.position !== "last" &&
    payload.position !== "before" &&
    payload.position !== "after"
  ) {
    throw errorFactory(
      "payload.position must be 'first', 'last', 'before', or 'after'",
    );
  }

  if (payload.position === "before" || payload.position === "after") {
    if (!isNonEmptyString(payload.positionTargetId)) {
      throw errorFactory(
        "payload.positionTargetId must be a non-empty string when payload.position is 'before' or 'after'",
      );
    }
    return;
  }

  if (hasPositionTargetId) {
    throw errorFactory(
      "payload.positionTargetId is allowed only when payload.position is 'before' or 'after'",
    );
  }
};

const validateSceneCreateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "type", "position"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type !== undefined && data.type !== "scene" && data.type !== "folder") {
    throw errorFactory("payload.data.type must be 'scene' or 'folder'");
  }

  validateOptionalPosition({
    value: data.position,
    path: "payload.data.position",
    errorFactory,
  });
};

const validateSceneUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "position"],
    path: "payload.data",
    errorFactory,
  });

  const hasName = data.name !== undefined;
  const hasPosition = data.position !== undefined;

  if (!hasName && !hasPosition) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (hasName && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (hasPosition) {
    validateOptionalPosition({
      value: data.position,
      path: "payload.data.position",
      errorFactory,
    });
  }
};

const validateRequiredUniqueIdArray = ({ value, path, errorFactory }) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw errorFactory(`${path} must be a non-empty array`);
  }

  const seen = new Set();

  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      throw errorFactory(`${path}[${index}] must be a non-empty string`);
    }

    if (seen.has(entry)) {
      throw errorFactory(`${path}[${index}] must be unique`);
    }

    seen.add(entry);
  });
};

const validateSectionCreateData = ({ data, errorFactory }) => {
  validateExactKeys({
    value: data,
    expectedKeys: ["name"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }
};

const validateSectionUpdateData = ({ data, errorFactory }) => {
  validateExactKeys({
    value: data,
    expectedKeys: ["name"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }
};

const validateLineCreatePayload = ({ payload, errorFactory }) => {
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw errorFactory("payload.lines must be a non-empty array");
  }

  const seenLineIds = new Set();

  payload.lines.forEach((item, index) => {
    const itemPath = `payload.lines[${index}]`;

    validateExactKeys({
      value: item,
      expectedKeys: ["lineId", "data"],
      path: itemPath,
      errorFactory,
    });

    if (!isNonEmptyString(item.lineId)) {
      throw errorFactory(`${itemPath}.lineId must be a non-empty string`);
    }

    if (seenLineIds.has(item.lineId)) {
      throw errorFactory(`${itemPath}.lineId must be unique`);
    }
    seenLineIds.add(item.lineId);

    validateAllowedKeys({
      value: item.data,
      allowedKeys: ["actions"],
      path: `${itemPath}.data`,
      errorFactory,
    });

    if (item.data.actions !== undefined && !isPlainObject(item.data.actions)) {
      throw errorFactory(`${itemPath}.data.actions must be an object`);
    }
  });
};

const validateLineUpdateActionsData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }
};

const validateImageCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "image") {
    throw errorFactory("payload.data.type must be 'folder' or 'image'");
  }

  validateAllowedKeys({
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
            "width",
            "height",
          ],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.description !== undefined && !isString(data.description)) {
    throw errorFactory("payload.data.description must be a string when provided");
  }

  if (data.type === "image") {
    if (!isNonEmptyString(data.fileId)) {
      throw errorFactory("payload.data.fileId must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      throw errorFactory("payload.data.fileType must be a string when provided");
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      throw errorFactory("payload.data.fileSize must be a finite number");
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      throw errorFactory("payload.data.width must be a finite number");
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      throw errorFactory("payload.data.height must be a finite number");
    }
  }
};

const validateImageUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "description", "fileId", "fileType", "fileSize", "width", "height"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.description !== undefined && !isString(data.description)) {
    throw errorFactory("payload.data.description must be a string when provided");
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    throw errorFactory("payload.data.fileId must be a non-empty string when provided");
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    throw errorFactory("payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    throw errorFactory("payload.data.fileSize must be a finite number");
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    throw errorFactory("payload.data.width must be a finite number");
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    throw errorFactory("payload.data.height must be a finite number");
  }
};

const validateSoundCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "sound") {
    throw errorFactory("payload.data.type must be 'folder' or 'sound'");
  }

  validateAllowedKeys({
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

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.description !== undefined && !isString(data.description)) {
    throw errorFactory("payload.data.description must be a string when provided");
  }

  if (data.type === "sound") {
    if (!isNonEmptyString(data.fileId)) {
      throw errorFactory("payload.data.fileId must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      throw errorFactory("payload.data.fileType must be a string when provided");
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      throw errorFactory("payload.data.fileSize must be a finite number");
    }

    if (
      data.waveformDataFileId !== undefined &&
      data.waveformDataFileId !== null &&
      !isNonEmptyString(data.waveformDataFileId)
    ) {
      throw errorFactory(
        "payload.data.waveformDataFileId must be a non-empty string or null when provided",
      );
    }

    if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
      throw errorFactory("payload.data.duration must be a finite number");
    }
  }
};

const validateSoundUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
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

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.description !== undefined && !isString(data.description)) {
    throw errorFactory("payload.data.description must be a string when provided");
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    throw errorFactory("payload.data.fileId must be a non-empty string when provided");
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    throw errorFactory("payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    throw errorFactory("payload.data.fileSize must be a finite number");
  }

  if (
    data.waveformDataFileId !== undefined &&
    data.waveformDataFileId !== null &&
    !isNonEmptyString(data.waveformDataFileId)
  ) {
    throw errorFactory(
      "payload.data.waveformDataFileId must be a non-empty string or null when provided",
    );
  }

  if (data.duration !== undefined && !isFiniteNumber(data.duration)) {
    throw errorFactory("payload.data.duration must be a finite number");
  }
};

const validateVideoCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "video") {
    throw errorFactory("payload.data.type must be 'folder' or 'video'");
  }

  validateAllowedKeys({
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

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.description !== undefined && !isString(data.description)) {
    throw errorFactory("payload.data.description must be a string when provided");
  }

  if (data.type === "video") {
    if (!isNonEmptyString(data.fileId)) {
      throw errorFactory("payload.data.fileId must be a non-empty string");
    }

    if (!isNonEmptyString(data.thumbnailFileId)) {
      throw errorFactory("payload.data.thumbnailFileId must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      throw errorFactory("payload.data.fileType must be a string when provided");
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      throw errorFactory("payload.data.fileSize must be a finite number");
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      throw errorFactory("payload.data.width must be a finite number");
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      throw errorFactory("payload.data.height must be a finite number");
    }
  }
};

const validateVideoUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
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

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.description !== undefined && !isString(data.description)) {
    throw errorFactory("payload.data.description must be a string when provided");
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    throw errorFactory("payload.data.fileId must be a non-empty string when provided");
  }

  if (
    data.thumbnailFileId !== undefined &&
    !isNonEmptyString(data.thumbnailFileId)
  ) {
    throw errorFactory(
      "payload.data.thumbnailFileId must be a non-empty string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    throw errorFactory("payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    throw errorFactory("payload.data.fileSize must be a finite number");
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    throw errorFactory("payload.data.width must be a finite number");
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    throw errorFactory("payload.data.height must be a finite number");
  }
};

const validateFontCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "font") {
    throw errorFactory("payload.data.type must be 'folder' or 'font'");
  }

  validateAllowedKeys({
    value: data,
    allowedKeys:
      data.type === "folder"
        ? ["type", "name"]
        : ["type", "name", "fileId", "fontFamily", "fileType", "fileSize"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type === "font") {
    if (!isNonEmptyString(data.fileId)) {
      throw errorFactory("payload.data.fileId must be a non-empty string");
    }

    if (!isNonEmptyString(data.fontFamily)) {
      throw errorFactory("payload.data.fontFamily must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      throw errorFactory("payload.data.fileType must be a string when provided");
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      throw errorFactory("payload.data.fileSize must be a finite number");
    }
  }
};

const validateFontUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "fileId", "fontFamily", "fileType", "fileSize"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    throw errorFactory("payload.data.fileId must be a non-empty string when provided");
  }

  if (data.fontFamily !== undefined && !isNonEmptyString(data.fontFamily)) {
    throw errorFactory(
      "payload.data.fontFamily must be a non-empty string when provided",
    );
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    throw errorFactory("payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    throw errorFactory("payload.data.fileSize must be a finite number");
  }
};

const validateColorCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "color") {
    throw errorFactory("payload.data.type must be 'folder' or 'color'");
  }

  validateAllowedKeys({
    value: data,
    allowedKeys: data.type === "folder" ? ["type", "name"] : ["type", "name", "hex"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type === "color" && !isHexColor(data.hex)) {
    throw errorFactory("payload.data.hex must be a #RRGGBB string");
  }
};

const validateColorUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "hex"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.hex !== undefined && !isHexColor(data.hex)) {
    throw errorFactory("payload.data.hex must be a #RRGGBB string when provided");
  }
};

const validateAnimationCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "animation") {
    throw errorFactory("payload.data.type must be 'folder' or 'animation'");
  }

  validateAllowedKeys({
    value: data,
    allowedKeys: data.type === "folder" ? ["type", "name"] : ["type", "name", "animation"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type === "animation") {
    validateAnimationDefinition({
      animation: data.animation,
      path: "payload.data.animation",
      errorFactory,
    });
  }
};

const validateAnimationUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "animation"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.animation !== undefined) {
    validateAnimationDefinition({
      animation: data.animation,
      path: "payload.data.animation",
      errorFactory,
    });
  }
};

const validateTransformCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "transform") {
    throw errorFactory("payload.data.type must be 'folder' or 'transform'");
  }

  validateAllowedKeys({
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

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
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
        throw errorFactory(`payload.data.${key} must be a finite number`);
      }
    }
  }
};

const validateTransformUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "x", "y", "scaleX", "scaleY", "anchorX", "anchorY", "rotation"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
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
      throw errorFactory(`payload.data.${key} must be a finite number when provided`);
    }
  }
};

const validateVariableCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && !VARIABLE_TYPE_KEYS.includes(data.type)) {
    throw errorFactory(
      "payload.data.type must be 'folder', 'string', 'number', or 'boolean'",
    );
  }

  validateAllowedKeys({
    value: data,
    allowedKeys:
      data.type === "folder"
        ? ["type", "name"]
        : ["type", "name", "scope", "default", "value"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type !== "folder") {
    if (!VARIABLE_SCOPE_KEYS.includes(data.scope)) {
      throw errorFactory(
        "payload.data.scope must be 'context', 'global-device', or 'global-account'",
      );
    }

    validateVariableTypedValue({
      value: data.default,
      variableType: data.type,
      path: "payload.data.default",
      errorFactory,
    });
    validateVariableTypedValue({
      value: data.value,
      variableType: data.type,
      path: "payload.data.value",
      errorFactory,
    });
  }
};

const validateVariableUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "scope", "default", "value"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.scope !== undefined && !VARIABLE_SCOPE_KEYS.includes(data.scope)) {
    throw errorFactory(
      "payload.data.scope must be 'context', 'global-device', or 'global-account' when provided",
    );
  }
};

const validateTextStyleCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "textStyle") {
    throw errorFactory("payload.data.type must be 'folder' or 'textStyle'");
  }

  validateAllowedKeys({
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

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type === "textStyle") {
    validateTextStyleItems({
      items: {
        draft: {
          id: "draft",
          ...structuredClone(data),
        },
      },
      path: "payload.data",
      errorFactory,
    });
  }
};

const validateTextStyleUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
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

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  for (const key of ["fontId", "colorId", "strokeColorId"]) {
    if (data[key] !== undefined && !isNonEmptyString(data[key])) {
      throw errorFactory(`payload.data.${key} must be a non-empty string when provided`);
    }
  }

  for (const key of ["fontSize", "lineHeight", "strokeAlpha", "strokeWidth"]) {
    if (data[key] !== undefined && !isFiniteNumber(data[key])) {
      throw errorFactory(`payload.data.${key} must be a finite number when provided`);
    }
  }

  for (const key of ["fontWeight", "previewText", "fontStyle"]) {
    if (data[key] !== undefined && !isString(data[key])) {
      throw errorFactory(`payload.data.${key} must be a string when provided`);
    }
  }

  if (data.breakWords !== undefined && typeof data.breakWords !== "boolean") {
    throw errorFactory("payload.data.breakWords must be a boolean when provided");
  }

  if (data.wordWrap !== undefined && typeof data.wordWrap !== "boolean") {
    throw errorFactory("payload.data.wordWrap must be a boolean when provided");
  }

  if (data.wordWrapWidth !== undefined && !isFiniteNumber(data.wordWrapWidth)) {
    throw errorFactory("payload.data.wordWrapWidth must be a finite number when provided");
  }

  if (
    data.align !== undefined &&
    !LAYOUT_ELEMENT_TEXT_STYLE_ALIGN_KEYS.includes(data.align)
  ) {
    throw errorFactory("payload.data.align must be 'left', 'center', or 'right' when provided");
  }
};

const validateCharacterSpriteCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "image") {
    throw errorFactory("payload.data.type must be 'folder' or 'image'");
  }

  validateAllowedKeys({
    value: data,
    allowedKeys:
      data.type === "folder"
        ? ["type", "name"]
        : ["type", "name", "fileId", "fileType", "fileSize", "width", "height"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type === "image") {
    if (!isNonEmptyString(data.fileId)) {
      throw errorFactory("payload.data.fileId must be a non-empty string");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      throw errorFactory("payload.data.fileType must be a string when provided");
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      throw errorFactory("payload.data.fileSize must be a finite number when provided");
    }

    if (data.width !== undefined && !isFiniteNumber(data.width)) {
      throw errorFactory("payload.data.width must be a finite number when provided");
    }

    if (data.height !== undefined && !isFiniteNumber(data.height)) {
      throw errorFactory("payload.data.height must be a finite number when provided");
    }
  }
};

const validateCharacterSpriteUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "fileId", "fileType", "fileSize", "width", "height"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    throw errorFactory("payload.data.fileId must be a non-empty string when provided");
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    throw errorFactory("payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    throw errorFactory("payload.data.fileSize must be a finite number when provided");
  }

  if (data.width !== undefined && !isFiniteNumber(data.width)) {
    throw errorFactory("payload.data.width must be a finite number when provided");
  }

  if (data.height !== undefined && !isFiniteNumber(data.height)) {
    throw errorFactory("payload.data.height must be a finite number when provided");
  }
};

const validateCharacterCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "character") {
    throw errorFactory("payload.data.type must be 'folder' or 'character'");
  }

  validateAllowedKeys({
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

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type === "character") {
    if (data.description !== undefined && !isString(data.description)) {
      throw errorFactory("payload.data.description must be a string when provided");
    }

    if (data.shortcut !== undefined && !isString(data.shortcut)) {
      throw errorFactory("payload.data.shortcut must be a string when provided");
    }

    if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
      throw errorFactory("payload.data.fileId must be a non-empty string when provided");
    }

    if (data.fileType !== undefined && !isString(data.fileType)) {
      throw errorFactory("payload.data.fileType must be a string when provided");
    }

    if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
      throw errorFactory("payload.data.fileSize must be a finite number when provided");
    }

    if (data.sprites !== undefined) {
      validateNestedCollection({
        collection: data.sprites,
        path: "payload.data.sprites",
        itemValidator: validateCharacterSpriteItems,
        treeValidator: validateGenericFolderOwnership,
        folderLabel: "folder sprite item",
        errorFactory,
      });
    }
  }
};

const validateCharacterUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "description", "shortcut", "fileId", "fileType", "fileSize"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.description !== undefined && !isString(data.description)) {
    throw errorFactory("payload.data.description must be a string when provided");
  }

  if (data.shortcut !== undefined && !isString(data.shortcut)) {
    throw errorFactory("payload.data.shortcut must be a string when provided");
  }

  if (data.fileId !== undefined && !isNonEmptyString(data.fileId)) {
    throw errorFactory("payload.data.fileId must be a non-empty string when provided");
  }

  if (data.fileType !== undefined && !isString(data.fileType)) {
    throw errorFactory("payload.data.fileType must be a string when provided");
  }

  if (data.fileSize !== undefined && !isFiniteNumber(data.fileSize)) {
    throw errorFactory("payload.data.fileSize must be a finite number when provided");
  }
};

const validateLayoutCreateData = ({ data, errorFactory }) => {
  if (!isPlainObject(data)) {
    throw errorFactory("payload.data must be an object");
  }

  if (data.type !== "folder" && data.type !== "layout") {
    throw errorFactory("payload.data.type must be 'folder' or 'layout'");
  }

  validateAllowedKeys({
    value: data,
    allowedKeys:
      data.type === "folder"
        ? ["type", "name"]
        : ["type", "name", "layoutType", "elements"],
    path: "payload.data",
    errorFactory,
  });

  if (!isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string");
  }

  if (data.type === "layout") {
    if (!LAYOUT_TYPE_KEYS.includes(data.layoutType)) {
      throw errorFactory(
        "payload.data.layoutType must be 'normal', 'dialogue', 'nvl', 'choice', or 'base'",
      );
    }

    validateNestedCollection({
      collection: data.elements,
      path: "payload.data.elements",
      itemValidator: validateLayoutElementItems,
      treeValidator: validateLayoutElementTreeOwnership,
      errorFactory,
    });
  }
};

const validateLayoutUpdateData = ({ data, errorFactory }) => {
  validateAllowedKeys({
    value: data,
    allowedKeys: ["name", "layoutType"],
    path: "payload.data",
    errorFactory,
  });

  if (Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
  }

  if (data.name !== undefined && !isNonEmptyString(data.name)) {
    throw errorFactory("payload.data.name must be a non-empty string when provided");
  }

  if (data.layoutType !== undefined && !LAYOUT_TYPE_KEYS.includes(data.layoutType)) {
    throw errorFactory(
      "payload.data.layoutType must be 'normal', 'dialogue', 'nvl', 'choice', or 'base' when provided",
    );
  }
};

const validateLayoutElementCreateData = ({ data, errorFactory }) => {
  validateLayoutElementData({
    data,
    path: "payload.data",
    errorFactory,
  });
};

const validateLayoutElementUpdateData = ({ data, errorFactory, replace }) => {
  validateLayoutElementData({
    data,
    path: "payload.data",
    errorFactory,
    allowPartial: replace !== true,
  });

  if (replace !== true && Object.keys(data).length === 0) {
    throw errorFactory("payload.data must include at least one updatable field");
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

const removeNodeOrThrow = ({ tree, nodeId, errorMessage }) => {
  const node = removeTreeNode({
    nodes: tree,
    nodeId,
  });

  if (!node) {
    throw createInvariantValidationError(errorMessage, {
      nodeId,
    });
  }

  return node;
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
}) => {
  const existingMessage = `payload.${idField} must reference an existing ${itemLabel}`;
  const duplicateMessage = `payload.${idField} must not already exist`;
  const parentMessage = `payload.parentId must reference a folder ${itemLabel}`;
  const targetMessage = `payload.positionTargetId must reference an existing ${itemLabel}`;
  const siblingMessage =
    "payload.positionTargetId must reference a sibling under payload.parentId";
  const moveTargetMessage =
    `payload.positionTargetId must not reference the moved ${itemLabel}`;
  const moveParentMessage =
    `payload.parentId must not target the moved ${itemLabel} or its descendants`;
  const deleteArrayField = `${idField}s`;

  return [
    {
      type: `${familyName}.create`,
      validatePayload: ({ payload }) => {
        validateAllowedKeys({
          value: payload,
          allowedKeys: [idField, "parentId", "data", "index", "position", "positionTargetId"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });

        if (!isNonEmptyString(payload[idField])) {
          throw createPayloadValidationError(`payload.${idField} must be a non-empty string`);
        }

        if (
          payload.parentId !== undefined &&
          payload.parentId !== null &&
          !isNonEmptyString(payload.parentId)
        ) {
          throw createPayloadValidationError(
            "payload.parentId must be a non-empty string when provided",
          );
        }

        createDataValidator({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });

        validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
      },
      validateAgainstState: ({ state, payload }) => {
        const collection = state[collectionKey];
        if (isPlainObject(collection.items[payload[idField]])) {
          throw createPreconditionValidationError(duplicateMessage);
        }

        const parentId = payload.parentId ?? null;
        if (parentId !== null) {
          const parentItem = collection.items[parentId];
          if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
            throw createPreconditionValidationError(parentMessage);
          }
        }

        if (payload.positionTargetId !== undefined) {
          if (!isPlainObject(collection.items[payload.positionTargetId])) {
            throw createPreconditionValidationError(targetMessage);
          }

          const targetParentId = getNodeParentId({
            tree: collection.tree,
            nodeId: payload.positionTargetId,
          });

          if (targetParentId !== parentId) {
            throw createPreconditionValidationError(siblingMessage);
          }
        }

        validateCreateState({ state, payload });
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
    {
      type: `${familyName}.update`,
      validatePayload: ({ payload }) => {
        validateExactKeys({
          value: payload,
          expectedKeys: [idField, "data"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });

        if (!isNonEmptyString(payload[idField])) {
          throw createPayloadValidationError(`payload.${idField} must be a non-empty string`);
        }

        updateDataValidator({
          data: payload.data,
          errorFactory: createPayloadValidationError,
        });
      },
      validateAgainstState: ({ state, payload }) => {
        const currentItem = state[collectionKey].items[payload[idField]];
        if (!isPlainObject(currentItem)) {
          throw createPreconditionValidationError(existingMessage);
        }

        validateUpdateState({
          state,
          payload,
          currentItem,
        });
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
    {
      type: `${familyName}.delete`,
      validatePayload: ({ payload }) => {
        validateExactKeys({
          value: payload,
          expectedKeys: [deleteArrayField],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });

        validateRequiredUniqueIdArray({
          value: payload[deleteArrayField],
          path: `payload.${deleteArrayField}`,
          errorFactory: createPayloadValidationError,
        });
      },
      validateAgainstState: ({ state, payload }) => {
        for (const itemId of payload[deleteArrayField]) {
          if (!isPlainObject(state[collectionKey].items[itemId])) {
            throw createPreconditionValidationError(
              `payload.${deleteArrayField} must reference existing ${itemLabel}s`,
              { itemId },
            );
          }
        }
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

          for (const descendantId of collectTreeDescendantIds({ node: removedNode })) {
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
        validateAllowedKeys({
          value: payload,
          allowedKeys: [idField, "parentId", "index", "position", "positionTargetId"],
          path: "payload",
          errorFactory: createPayloadValidationError,
        });

        if (!isNonEmptyString(payload[idField])) {
          throw createPayloadValidationError(`payload.${idField} must be a non-empty string`);
        }

        if (
          payload.parentId !== undefined &&
          payload.parentId !== null &&
          !isNonEmptyString(payload.parentId)
        ) {
          throw createPayloadValidationError(
            "payload.parentId must be a non-empty string when provided",
          );
        }

        validatePlacementFields({
          payload,
          errorFactory: createPayloadValidationError,
        });
      },
      validateAgainstState: ({ state, payload }) => {
        const collection = state[collectionKey];
        const currentItem = collection.items[payload[idField]];
        if (!isPlainObject(currentItem)) {
          throw createPreconditionValidationError(existingMessage);
        }

        const currentNode = findTreeNode({
          nodes: collection.tree,
          nodeId: payload[idField],
        });

        if (payload.parentId !== undefined && payload.parentId !== null) {
          const parentItem = collection.items[payload.parentId];
          if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
            throw createPreconditionValidationError(parentMessage);
          }

          const descendantIds = new Set(
            collectTreeDescendantIds({
              node: currentNode,
            }),
          );

          if (descendantIds.has(payload.parentId)) {
            throw createPreconditionValidationError(moveParentMessage);
          }
        }

        if (payload.positionTargetId !== undefined) {
          if (payload.positionTargetId === payload[idField]) {
            throw createPreconditionValidationError(moveTargetMessage);
          }

          if (!isPlainObject(collection.items[payload.positionTargetId])) {
            throw createPreconditionValidationError(targetMessage);
          }

          const targetParentId = getNodeParentId({
            tree: collection.tree,
            nodeId: payload.positionTargetId,
          });

          if (targetParentId !== (payload.parentId ?? null)) {
            throw createPreconditionValidationError(siblingMessage);
          }
        }
      },
      reduce: ({ state, payload }) => {
        const node = removeNodeOrThrow({
          tree: state[collectionKey].tree,
          nodeId: payload[idField],
          errorMessage: `${familyName} move target missing from tree`,
        });

        insertTreeNode({
          tree: state[collectionKey].tree,
          node,
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

const COMMAND_DEFINITIONS = [
  {
    type: "project.create",
    validatePayload: ({ payload }) => {
      validateExactKeys({
        value: payload,
        expectedKeys: ["state"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateState({ state: payload.state });
    },
    validateAgainstState: () => {},
    reduce: ({ payload }) => structuredClone(payload.state),
  },
  {
    type: "story.update",
    validatePayload: ({ payload }) => {
      validateExactKeys({
        value: payload,
        expectedKeys: ["data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateExactKeys({
        value: payload.data,
        expectedKeys: ["initialSceneId"],
        path: "payload.data",
        errorFactory: createPayloadValidationError,
      });

      if (
        payload.data.initialSceneId !== null &&
        !isNonEmptyString(payload.data.initialSceneId)
      ) {
        throw createPayloadValidationError(
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
        throw createPreconditionValidationError(
          "payload.data.initialSceneId must reference an existing scene",
        );
      }

      if (scene.type === "folder") {
        throw createPreconditionValidationError(
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
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.sceneId)) {
        throw createPayloadValidationError("payload.sceneId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateSceneCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (Object.hasOwn(state.scenes.items, payload.sceneId)) {
        throw createPreconditionValidationError(
          "payload.sceneId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;

      if (parentId !== null) {
        const parentScene = state.scenes.items[parentId];
        if (!isPlainObject(parentScene)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing scene",
          );
        }

        if (parentScene.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder scene",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.scenes.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing scene",
          );
        }

        const targetParentId =
          findTreeParentId({
            nodes: state.scenes.tree,
            nodeId: payload.positionTargetId,
          }) ?? null;

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["sceneId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.sceneId)) {
        throw createPayloadValidationError("payload.sceneId must be a non-empty string");
      }

      validateSceneUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (!isPlainObject(state.scenes.items[payload.sceneId])) {
        throw createPreconditionValidationError(
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["sceneIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.sceneIds,
        path: "payload.sceneIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const sceneId of payload.sceneIds) {
        if (!isPlainObject(state.scenes.items[sceneId])) {
          throw createPreconditionValidationError(
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

      const deletedSectionIds = [];
      for (const [sectionId, section] of Object.entries(state.sections.items)) {
        if (deletedSceneIds.has(section.sceneId)) {
          deletedSectionIds.push(sectionId);
        }
      }

      const deletedLineIds = [];
      for (const [lineId, line] of Object.entries(state.lines.items)) {
        if (deletedSectionIds.includes(line.sectionId)) {
          deletedLineIds.push(lineId);
        }
      }

      for (const lineId of deletedLineIds) {
        delete state.lines.items[lineId];
        removeTreeNode({
          nodes: state.lines.tree,
          nodeId: lineId,
        });
      }

      for (const sectionId of deletedSectionIds) {
        delete state.sections.items[sectionId];
        removeTreeNode({
          nodes: state.sections.tree,
          nodeId: sectionId,
        });
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["sceneId", "parentId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.sceneId)) {
        throw createPayloadValidationError("payload.sceneId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const scene = state.scenes.items[payload.sceneId];
      if (!isPlainObject(scene)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing scene",
          );
        }

        if (parentScene.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder scene",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: sceneNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved scene or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.sceneId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved scene",
          );
        }

        if (!isPlainObject(state.scenes.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing scene",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.scenes.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const sceneNode = removeNodeOrThrow({
        tree: state.scenes.tree,
        nodeId: payload.sceneId,
        errorMessage: "scene move target missing from tree",
      });

      insertTreeNode({
        tree: state.scenes.tree,
        node: sceneNode,
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
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.sectionId)) {
        throw createPayloadValidationError("payload.sectionId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.sceneId)) {
        throw createPayloadValidationError("payload.sceneId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateSectionCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const scene = state.scenes.items[payload.sceneId];
      if (!isPlainObject(scene)) {
        throw createPreconditionValidationError(
          "payload.sceneId must reference an existing scene",
        );
      }

      if (scene.type === "folder") {
        throw createPreconditionValidationError(
          "payload.sceneId must reference a non-folder scene",
        );
      }

      if (isPlainObject(state.sections.items[payload.sectionId])) {
        throw createPreconditionValidationError(
          "payload.sectionId must not already exist",
        );
      }

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentSection = state.sections.items[payload.parentId];
        if (!isPlainObject(parentSection)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing section",
          );
        }

        if (parentSection.sceneId !== payload.sceneId) {
          throw createPreconditionValidationError(
            "payload.parentId must reference a section in the same scene",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        const targetSection = state.sections.items[payload.positionTargetId];
        if (!isPlainObject(targetSection)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing section",
          );
        }

        if (targetSection.sceneId !== payload.sceneId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a section in the same scene",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.sections.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      state.sections.items[payload.sectionId] = {
        id: payload.sectionId,
        sceneId: payload.sceneId,
        name: payload.data.name,
      };

      insertScopedTreeNode({
        tree: state.sections.tree,
        node: {
          id: payload.sectionId,
          children: [],
        },
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        isSibling: (entry) =>
          state.sections.items[entry.id]?.sceneId === payload.sceneId,
      });

      return state;
    },
  },
  {
    type: "section.update",
    validatePayload: ({ payload }) => {
      validateExactKeys({
        value: payload,
        expectedKeys: ["sectionId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.sectionId)) {
        throw createPayloadValidationError("payload.sectionId must be a non-empty string");
      }

      validateSectionUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (!isPlainObject(state.sections.items[payload.sectionId])) {
        throw createPreconditionValidationError(
          "payload.sectionId must reference an existing section",
        );
      }
    },
    reduce: ({ state, payload }) => {
      const section = state.sections.items[payload.sectionId];
      state.sections.items[payload.sectionId] = {
        ...section,
        name: payload.data.name,
      };
      return state;
    },
  },
  {
    type: "section.delete",
    validatePayload: ({ payload }) => {
      validateExactKeys({
        value: payload,
        expectedKeys: ["sectionIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.sectionIds,
        path: "payload.sectionIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const sectionId of payload.sectionIds) {
        if (!isPlainObject(state.sections.items[sectionId])) {
          throw createPreconditionValidationError(
            "payload.sectionIds must reference existing sections",
            { sectionId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const deletedSectionIds = new Set();

      for (const sectionId of payload.sectionIds) {
        const removedNode = removeTreeNode({
          nodes: state.sections.tree,
          nodeId: sectionId,
        });

        if (!removedNode) {
          continue;
        }

        for (const id of collectTreeDescendantIds({ node: removedNode })) {
          deletedSectionIds.add(id);
        }
      }

      const deletedLineIds = [];
      for (const [lineId, line] of Object.entries(state.lines.items)) {
        if (deletedSectionIds.has(line.sectionId)) {
          deletedLineIds.push(lineId);
        }
      }

      for (const lineId of deletedLineIds) {
        delete state.lines.items[lineId];
        removeTreeNode({
          nodes: state.lines.tree,
          nodeId: lineId,
        });
      }

      for (const sectionId of deletedSectionIds) {
        delete state.sections.items[sectionId];
      }

      return state;
    },
  },
  {
    type: "section.move",
    validatePayload: ({ payload }) => {
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["sectionId", "parentId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.sectionId)) {
        throw createPayloadValidationError("payload.sectionId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const section = state.sections.items[payload.sectionId];
      if (!isPlainObject(section)) {
        throw createPreconditionValidationError(
          "payload.sectionId must reference an existing section",
        );
      }

      const sectionNode = findTreeNode({
        nodes: state.sections.tree,
        nodeId: payload.sectionId,
      });

      if (payload.parentId !== undefined && payload.parentId !== null) {
        const parentSection = state.sections.items[payload.parentId];
        if (!isPlainObject(parentSection)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing section",
          );
        }

        if (parentSection.sceneId !== section.sceneId) {
          throw createPreconditionValidationError(
            "payload.parentId must reference a section in the same scene",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: sectionNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved section or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.sectionId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved section",
          );
        }

        const targetSection = state.sections.items[payload.positionTargetId];
        if (!isPlainObject(targetSection)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing section",
          );
        }

        if (targetSection.sceneId !== section.sceneId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a section in the same scene",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.sections.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const section = state.sections.items[payload.sectionId];
      const sectionNode = removeNodeOrThrow({
        tree: state.sections.tree,
        nodeId: payload.sectionId,
        errorMessage: "section move target missing from tree",
      });

      insertScopedTreeNode({
        tree: state.sections.tree,
        node: sectionNode,
        parentId: payload.parentId ?? null,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        isSibling: (entry) =>
          state.sections.items[entry.id]?.sceneId === section.sceneId,
      });

      return state;
    },
  },
  {
    type: "line.create",
    validatePayload: ({ payload }) => {
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["sectionId", "lines", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.sectionId)) {
        throw createPayloadValidationError("payload.sectionId must be a non-empty string");
      }

      validateLineCreatePayload({
        payload,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (!isPlainObject(state.sections.items[payload.sectionId])) {
        throw createPreconditionValidationError(
          "payload.sectionId must reference an existing section",
        );
      }

      for (const item of payload.lines) {
        if (isPlainObject(state.lines.items[item.lineId])) {
          throw createPreconditionValidationError(
            "payload.lines.lineId must not already exist",
            { lineId: item.lineId },
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        const targetLine = state.lines.items[payload.positionTargetId];
        if (!isPlainObject(targetLine)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing line",
          );
        }

        if (targetLine.sectionId !== payload.sectionId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a line in the target section",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      let previousLineId = payload.positionTargetId;

      payload.lines.forEach((item, index) => {
        state.lines.items[item.lineId] = {
          id: item.lineId,
          sectionId: payload.sectionId,
          actions: structuredClone(item.data.actions || {}),
        };

        insertScopedTreeNode({
          tree: state.lines.tree,
          node: {
            id: item.lineId,
          },
          index:
            Number.isInteger(payload.index) ? payload.index + index : undefined,
          position: index === 0 ? payload.position : "after",
          positionTargetId: index === 0 ? payload.positionTargetId : previousLineId,
          isSibling: (entry) =>
            state.lines.items[entry.id]?.sectionId === payload.sectionId,
        });

        previousLineId = item.lineId;
      });

      return state;
    },
  },
  {
    type: "line.update_actions",
    validatePayload: ({ payload }) => {
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["lineId", "data", "replace"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.lineId)) {
        throw createPayloadValidationError("payload.lineId must be a non-empty string");
      }

      validateLineUpdateActionsData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      if (
        payload.replace !== undefined &&
        typeof payload.replace !== "boolean"
      ) {
        throw createPayloadValidationError(
          "payload.replace must be a boolean when provided",
        );
      }
    },
    validateAgainstState: ({ state, payload }) => {
      if (!isPlainObject(state.lines.items[payload.lineId])) {
        throw createPreconditionValidationError(
          "payload.lineId must reference an existing line",
        );
      }
    },
    reduce: ({ state, payload }) => {
      const line = state.lines.items[payload.lineId];
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["lineIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.lineIds,
        path: "payload.lineIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const lineId of payload.lineIds) {
        if (!isPlainObject(state.lines.items[lineId])) {
          throw createPreconditionValidationError(
            "payload.lineIds must reference existing lines",
            { lineId },
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      for (const lineId of payload.lineIds) {
        delete state.lines.items[lineId];
        removeTreeNode({
          nodes: state.lines.tree,
          nodeId: lineId,
        });
      }

      return state;
    },
  },
  {
    type: "line.move",
    validatePayload: ({ payload }) => {
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["lineId", "toSectionId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.lineId)) {
        throw createPayloadValidationError("payload.lineId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.toSectionId)) {
        throw createPayloadValidationError(
          "payload.toSectionId must be a non-empty string",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const line = state.lines.items[payload.lineId];
      if (!isPlainObject(line)) {
        throw createPreconditionValidationError(
          "payload.lineId must reference an existing line",
        );
      }

      if (!isPlainObject(state.sections.items[payload.toSectionId])) {
        throw createPreconditionValidationError(
          "payload.toSectionId must reference an existing section",
        );
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.lineId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved line",
          );
        }

        const targetLine = state.lines.items[payload.positionTargetId];
        if (!isPlainObject(targetLine)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing line",
          );
        }

        if (targetLine.sectionId !== payload.toSectionId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a line in the target section",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const lineNode = removeNodeOrThrow({
        tree: state.lines.tree,
        nodeId: payload.lineId,
        errorMessage: "line move target missing from tree",
      });

      state.lines.items[payload.lineId].sectionId = payload.toSectionId;

      insertScopedTreeNode({
        tree: state.lines.tree,
        node: lineNode,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        isSibling: (entry) =>
          state.lines.items[entry.id]?.sectionId === payload.toSectionId,
      });

      return state;
    },
  },
  {
    type: "image.create",
    validatePayload: ({ payload }) => {
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["imageId", "parentId", "data", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.imageId)) {
        throw createPayloadValidationError("payload.imageId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateImageCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.images.items[payload.imageId])) {
        throw createPreconditionValidationError(
          "payload.imageId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentImage = state.images.items[parentId];
        if (!isPlainObject(parentImage)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing image item",
          );
        }

        if (parentImage.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder image item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.images.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing image item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.images.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["imageId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.imageId)) {
        throw createPayloadValidationError("payload.imageId must be a non-empty string");
      }

      validateImageUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const currentImage = state.images.items[payload.imageId];
      if (!isPlainObject(currentImage)) {
        throw createPreconditionValidationError(
          "payload.imageId must reference an existing image item",
        );
      }

      if (
        currentImage.type === "folder" &&
        (payload.data.fileId !== undefined ||
          payload.data.fileType !== undefined ||
          payload.data.fileSize !== undefined ||
          payload.data.width !== undefined ||
          payload.data.height !== undefined)
      ) {
        throw createPreconditionValidationError(
          "folder image items cannot update file fields",
        );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["imageIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.imageIds,
        path: "payload.imageIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const imageId of payload.imageIds) {
        if (!isPlainObject(state.images.items[imageId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["imageId", "parentId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.imageId)) {
        throw createPayloadValidationError("payload.imageId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const image = state.images.items[payload.imageId];
      if (!isPlainObject(image)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing image item",
          );
        }

        if (parentImage.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder image item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: imageNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved image item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.imageId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved image item",
          );
        }

        if (!isPlainObject(state.images.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing image item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.images.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const imageNode = removeNodeOrThrow({
        tree: state.images.tree,
        nodeId: payload.imageId,
        errorMessage: "image move target missing from tree",
      });

      insertTreeNode({
        tree: state.images.tree,
        node: imageNode,
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["soundId", "parentId", "data", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.soundId)) {
        throw createPayloadValidationError("payload.soundId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateSoundCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.sounds.items[payload.soundId])) {
        throw createPreconditionValidationError(
          "payload.soundId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentSound = state.sounds.items[parentId];
        if (!isPlainObject(parentSound)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing sound item",
          );
        }

        if (parentSound.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder sound item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.sounds.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing sound item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.sounds.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["soundId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.soundId)) {
        throw createPayloadValidationError("payload.soundId must be a non-empty string");
      }

      validateSoundUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const currentSound = state.sounds.items[payload.soundId];
      if (!isPlainObject(currentSound)) {
        throw createPreconditionValidationError(
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
        throw createPreconditionValidationError(
          "folder sound items cannot update file fields",
        );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["soundIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.soundIds,
        path: "payload.soundIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const soundId of payload.soundIds) {
        if (!isPlainObject(state.sounds.items[soundId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["soundId", "parentId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.soundId)) {
        throw createPayloadValidationError("payload.soundId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const sound = state.sounds.items[payload.soundId];
      if (!isPlainObject(sound)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing sound item",
          );
        }

        if (parentSound.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder sound item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: soundNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved sound item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.soundId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved sound item",
          );
        }

        if (!isPlainObject(state.sounds.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing sound item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.sounds.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const soundNode = removeNodeOrThrow({
        tree: state.sounds.tree,
        nodeId: payload.soundId,
        errorMessage: "sound move target missing from tree",
      });

      insertTreeNode({
        tree: state.sounds.tree,
        node: soundNode,
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["videoId", "parentId", "data", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.videoId)) {
        throw createPayloadValidationError("payload.videoId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateVideoCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.videos.items[payload.videoId])) {
        throw createPreconditionValidationError(
          "payload.videoId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentVideo = state.videos.items[parentId];
        if (!isPlainObject(parentVideo)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing video item",
          );
        }

        if (parentVideo.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder video item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.videos.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing video item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.videos.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["videoId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.videoId)) {
        throw createPayloadValidationError("payload.videoId must be a non-empty string");
      }

      validateVideoUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const currentVideo = state.videos.items[payload.videoId];
      if (!isPlainObject(currentVideo)) {
        throw createPreconditionValidationError(
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
        throw createPreconditionValidationError(
          "folder video items cannot update file fields",
        );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["videoIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.videoIds,
        path: "payload.videoIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const videoId of payload.videoIds) {
        if (!isPlainObject(state.videos.items[videoId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["videoId", "parentId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.videoId)) {
        throw createPayloadValidationError("payload.videoId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const video = state.videos.items[payload.videoId];
      if (!isPlainObject(video)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing video item",
          );
        }

        if (parentVideo.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder video item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: videoNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved video item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.videoId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved video item",
          );
        }

        if (!isPlainObject(state.videos.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing video item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.videos.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const videoNode = removeNodeOrThrow({
        tree: state.videos.tree,
        nodeId: payload.videoId,
        errorMessage: "video move target missing from tree",
      });

      insertTreeNode({
        tree: state.videos.tree,
        node: videoNode,
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
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.animationId)) {
        throw createPayloadValidationError(
          "payload.animationId must be a non-empty string",
        );
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateAnimationCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.animations.items[payload.animationId])) {
        throw createPreconditionValidationError(
          "payload.animationId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentAnimation = state.animations.items[parentId];
        if (!isPlainObject(parentAnimation)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing animation item",
          );
        }

        if (parentAnimation.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder animation item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.animations.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing animation item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.animations.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["animationId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.animationId)) {
        throw createPayloadValidationError(
          "payload.animationId must be a non-empty string",
        );
      }

      validateAnimationUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const currentAnimation = state.animations.items[payload.animationId];
      if (!isPlainObject(currentAnimation)) {
        throw createPreconditionValidationError(
          "payload.animationId must reference an existing animation item",
        );
      }

      if (currentAnimation.type === "folder" && payload.data.animation !== undefined) {
        throw createPreconditionValidationError(
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["animationIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.animationIds,
        path: "payload.animationIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const animationId of payload.animationIds) {
        if (!isPlainObject(state.animations.items[animationId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.animationId)) {
        throw createPayloadValidationError(
          "payload.animationId must be a non-empty string",
        );
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const animation = state.animations.items[payload.animationId];
      if (!isPlainObject(animation)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing animation item",
          );
        }

        if (parentAnimation.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder animation item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: animationNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved animation item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.animationId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved animation item",
          );
        }

        if (!isPlainObject(state.animations.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing animation item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.animations.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const animationNode = removeNodeOrThrow({
        tree: state.animations.tree,
        nodeId: payload.animationId,
        errorMessage: "animation move target missing from tree",
      });

      insertTreeNode({
        tree: state.animations.tree,
        node: animationNode,
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["fontId", "parentId", "data", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.fontId)) {
        throw createPayloadValidationError("payload.fontId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateFontCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.fonts.items[payload.fontId])) {
        throw createPreconditionValidationError("payload.fontId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentFont = state.fonts.items[parentId];
        if (!isPlainObject(parentFont)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing font item",
          );
        }

        if (parentFont.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder font item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.fonts.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing font item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.fonts.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["fontId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.fontId)) {
        throw createPayloadValidationError("payload.fontId must be a non-empty string");
      }

      validateFontUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const currentFont = state.fonts.items[payload.fontId];
      if (!isPlainObject(currentFont)) {
        throw createPreconditionValidationError(
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
        throw createPreconditionValidationError(
          "folder font items cannot update font fields",
        );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["fontIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.fontIds,
        path: "payload.fontIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const fontId of payload.fontIds) {
        if (!isPlainObject(state.fonts.items[fontId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["fontId", "parentId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.fontId)) {
        throw createPayloadValidationError("payload.fontId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const font = state.fonts.items[payload.fontId];
      if (!isPlainObject(font)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing font item",
          );
        }

        if (parentFont.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder font item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: fontNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved font item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.fontId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved font item",
          );
        }

        if (!isPlainObject(state.fonts.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing font item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.fonts.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const fontNode = removeNodeOrThrow({
        tree: state.fonts.tree,
        nodeId: payload.fontId,
        errorMessage: "font move target missing from tree",
      });

      insertTreeNode({
        tree: state.fonts.tree,
        node: fontNode,
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["colorId", "parentId", "data", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.colorId)) {
        throw createPayloadValidationError("payload.colorId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateColorCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      if (isPlainObject(state.colors.items[payload.colorId])) {
        throw createPreconditionValidationError("payload.colorId must not already exist");
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentColor = state.colors.items[parentId];
        if (!isPlainObject(parentColor)) {
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing color item",
          );
        }

        if (parentColor.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder color item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(state.colors.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing color item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.colors.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["colorId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.colorId)) {
        throw createPayloadValidationError("payload.colorId must be a non-empty string");
      }

      validateColorUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const currentColor = state.colors.items[payload.colorId];
      if (!isPlainObject(currentColor)) {
        throw createPreconditionValidationError(
          "payload.colorId must reference an existing color item",
        );
      }

      if (currentColor.type === "folder" && payload.data.hex !== undefined) {
        throw createPreconditionValidationError(
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["colorIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      validateRequiredUniqueIdArray({
        value: payload.colorIds,
        path: "payload.colorIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      for (const colorId of payload.colorIds) {
        if (!isPlainObject(state.colors.items[colorId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["colorId", "parentId", "index", "position", "positionTargetId"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.colorId)) {
        throw createPayloadValidationError("payload.colorId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const color = state.colors.items[payload.colorId];
      if (!isPlainObject(color)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference an existing color item",
          );
        }

        if (parentColor.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder color item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: colorNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved color item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.colorId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved color item",
          );
        }

        if (!isPlainObject(state.colors.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing color item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: state.colors.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference a sibling under payload.parentId",
          );
        }
      }
    },
    reduce: ({ state, payload }) => {
      const colorNode = removeNodeOrThrow({
        tree: state.colors.tree,
        nodeId: payload.colorId,
        errorMessage: "color move target missing from tree",
      });

      insertTreeNode({
        tree: state.colors.tree,
        node: colorNode,
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
        throw createPreconditionValidationError(
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
        throw createPreconditionValidationError(
          "folder variable items cannot update variable fields",
        );
      }

      if (currentItem.type !== "folder") {
        if (payload.data.default !== undefined) {
          validateVariableTypedValue({
            value: payload.data.default,
            variableType: currentItem.type,
            path: "payload.data.default",
            errorFactory: createPreconditionValidationError,
          });
        }

        if (payload.data.value !== undefined) {
          validateVariableTypedValue({
            value: payload.data.value,
            variableType: currentItem.type,
            path: "payload.data.value",
            errorFactory: createPreconditionValidationError,
          });
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
          throw createPreconditionValidationError(
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
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
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
    createItem: ({ payload }) => ({
      id: payload.characterId,
      type: payload.data.type,
      name: payload.data.name,
      ...(payload.data.type === "character"
        ? {
            ...(payload.data.description !== undefined
              ? { description: payload.data.description }
              : {}),
            ...(payload.data.shortcut !== undefined
              ? { shortcut: payload.data.shortcut }
              : {}),
            ...(payload.data.fileId !== undefined ? { fileId: payload.data.fileId } : {}),
            ...(payload.data.fileType !== undefined
              ? { fileType: payload.data.fileType }
              : {}),
            ...(payload.data.fileSize !== undefined
              ? { fileSize: payload.data.fileSize }
              : {}),
            sprites:
              payload.data.sprites === undefined
                ? { items: {}, tree: [] }
                : structuredClone(payload.data.sprites),
          }
        : {}),
    }),
    validateUpdateState: ({ payload, currentItem }) => {
      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        throw createPreconditionValidationError(
          "folder character items cannot update character fields",
        );
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
        throw createPreconditionValidationError(
          "folder layout items cannot update layout fields",
        );
      }
    },
  }),
  {
    type: "character.sprite.create",
    validatePayload: ({ payload }) => {
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.characterId)) {
        throw createPayloadValidationError("payload.characterId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.spriteId)) {
        throw createPayloadValidationError("payload.spriteId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateCharacterSpriteCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        throw createPreconditionValidationError(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });

      if (isPlainObject(collection.items[payload.spriteId])) {
        throw createPreconditionValidationError(
          "payload.spriteId must not already exist",
        );
      }

      const parentId = payload.parentId ?? null;
      if (parentId !== null) {
        const parentItem = collection.items[parentId];
        if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder sprite item",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing sprite item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["characterId", "spriteId", "data"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.characterId)) {
        throw createPayloadValidationError("payload.characterId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.spriteId)) {
        throw createPayloadValidationError("payload.spriteId must be a non-empty string");
      }

      validateCharacterSpriteUpdateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        throw createPreconditionValidationError(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const currentItem = collection.items[payload.spriteId];

      if (!isPlainObject(currentItem)) {
        throw createPreconditionValidationError(
          "payload.spriteId must reference an existing sprite item",
        );
      }

      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        throw createPreconditionValidationError(
          "folder sprite items cannot update image fields",
        );
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["characterId", "spriteIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.characterId)) {
        throw createPayloadValidationError("payload.characterId must be a non-empty string");
      }

      validateRequiredUniqueIdArray({
        value: payload.spriteIds,
        path: "payload.spriteIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        throw createPreconditionValidationError(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      for (const spriteId of payload.spriteIds) {
        if (!isPlainObject(collection.items[spriteId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.characterId)) {
        throw createPayloadValidationError("payload.characterId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.spriteId)) {
        throw createPayloadValidationError("payload.spriteId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const character = state.characters.items[payload.characterId];
      if (!isPlainObject(character) || character.type !== "character") {
        throw createPreconditionValidationError(
          "payload.characterId must reference an existing character",
        );
      }

      const collection = getCharacterSpriteCollection({
        state,
        characterId: payload.characterId,
      });
      const currentItem = collection.items[payload.spriteId];

      if (!isPlainObject(currentItem)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder sprite item",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: currentNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved sprite item or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.spriteId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved sprite item",
          );
        }

        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing sprite item",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
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
      const node = removeNodeOrThrow({
        tree: collection.tree,
        nodeId: payload.spriteId,
        errorMessage: "character sprite move target missing from tree",
      });

      insertTreeNode({
        tree: collection.tree,
        node,
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
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.layoutId)) {
        throw createPayloadValidationError("payload.layoutId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        throw createPayloadValidationError("payload.elementId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validateLayoutElementCreateData({
        data: payload.data,
        errorFactory: createPayloadValidationError,
      });

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        throw createPreconditionValidationError(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });

      if (isPlainObject(collection.items[payload.elementId])) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder or container layout element",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing layout element",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== parentId) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
        value: payload,
        allowedKeys: ["layoutId", "elementId", "data", "replace"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.layoutId)) {
        throw createPayloadValidationError("payload.layoutId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        throw createPayloadValidationError("payload.elementId must be a non-empty string");
      }

      if (payload.replace !== undefined && typeof payload.replace !== "boolean") {
        throw createPayloadValidationError("payload.replace must be a boolean when provided");
      }

      validateLayoutElementUpdateData({
        data: payload.data,
        replace: payload.replace,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        throw createPreconditionValidationError(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });
      const currentItem = collection.items[payload.elementId];
      if (!isPlainObject(currentItem)) {
        throw createPreconditionValidationError(
          "payload.elementId must reference an existing layout element",
        );
      }

      if (
        payload.data.type !== undefined &&
        payload.data.type !== currentItem.type
      ) {
        throw createPreconditionValidationError(
          "layout element type cannot be changed",
        );
      }

      if (
        currentItem.type === "folder" &&
        Object.keys(payload.data).some((key) => key !== "name")
      ) {
        throw createPreconditionValidationError(
          "folder layout elements cannot update non-name fields",
        );
      }
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
      validateExactKeys({
        value: payload,
        expectedKeys: ["layoutId", "elementIds"],
        path: "payload",
        errorFactory: createPayloadValidationError,
      });

      if (!isNonEmptyString(payload.layoutId)) {
        throw createPayloadValidationError("payload.layoutId must be a non-empty string");
      }

      validateRequiredUniqueIdArray({
        value: payload.elementIds,
        path: "payload.elementIds",
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        throw createPreconditionValidationError(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });

      for (const elementId of payload.elementIds) {
        if (!isPlainObject(collection.items[elementId])) {
          throw createPreconditionValidationError(
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
      validateAllowedKeys({
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

      if (!isNonEmptyString(payload.layoutId)) {
        throw createPayloadValidationError("payload.layoutId must be a non-empty string");
      }

      if (!isNonEmptyString(payload.elementId)) {
        throw createPayloadValidationError("payload.elementId must be a non-empty string");
      }

      if (
        payload.parentId !== undefined &&
        payload.parentId !== null &&
        !isNonEmptyString(payload.parentId)
      ) {
        throw createPayloadValidationError(
          "payload.parentId must be a non-empty string when provided",
        );
      }

      validatePlacementFields({
        payload,
        errorFactory: createPayloadValidationError,
      });
    },
    validateAgainstState: ({ state, payload }) => {
      const layout = state.layouts.items[payload.layoutId];
      if (!isPlainObject(layout) || layout.type !== "layout") {
        throw createPreconditionValidationError(
          "payload.layoutId must reference an existing layout",
        );
      }

      const collection = getLayoutElementCollection({
        state,
        layoutId: payload.layoutId,
      });
      const currentItem = collection.items[payload.elementId];

      if (!isPlainObject(currentItem)) {
        throw createPreconditionValidationError(
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
          throw createPreconditionValidationError(
            "payload.parentId must reference a folder or container layout element",
          );
        }

        const descendantIds = new Set(
          collectTreeDescendantIds({
            node: currentNode,
          }),
        );

        if (descendantIds.has(payload.parentId)) {
          throw createPreconditionValidationError(
            "payload.parentId must not target the moved layout element or its descendants",
          );
        }
      }

      if (payload.positionTargetId !== undefined) {
        if (payload.positionTargetId === payload.elementId) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must not reference the moved layout element",
          );
        }

        if (!isPlainObject(collection.items[payload.positionTargetId])) {
          throw createPreconditionValidationError(
            "payload.positionTargetId must reference an existing layout element",
          );
        }

        const targetParentId = getNodeParentId({
          tree: collection.tree,
          nodeId: payload.positionTargetId,
        });

        if (targetParentId !== (payload.parentId ?? null)) {
          throw createPreconditionValidationError(
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
      const node = removeNodeOrThrow({
        tree: collection.tree,
        nodeId: payload.elementId,
        errorMessage: "layout element move target missing from tree",
      });

      insertTreeNode({
        tree: collection.tree,
        node,
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
  if (typeof type !== "string" || type.length === 0) {
    throw createPayloadValidationError("type must be a non-empty string");
  }

  if (!isPlainObject(payload)) {
    throw createPayloadValidationError("payload must be an object", {
      type,
    });
  }

  const definition = getCommandDefinition({ type });
  if (!definition) {
    throw createPayloadValidationError(`unknown command type '${type}'`);
  }

  definition.validatePayload({ payload });
};

export const validateAgainstState = ({ state, command }) => {
  if (!isPlainObject(command)) {
    throw createPreconditionValidationError("command must be an object");
  }

  validatePayload(command);
  validateState({ state });

  const definition = getCommandDefinition({ type: command.type });
  definition.validateAgainstState({
    state,
    payload: command.payload,
  });
};

export const processCommand = ({ state, command }) => {
  if (!isPlainObject(command)) {
    throw createPreconditionValidationError("command must be an object");
  }

  validatePayload(command);
  validateState({ state });

  const definition = getCommandDefinition({ type: command.type });
  definition.validateAgainstState({
    state,
    payload: command.payload,
  });
  const nextState = definition.reduce({
    state: structuredClone(state),
    payload: command.payload,
  });

  validateState({
    state: nextState === undefined ? state : nextState,
  });

  return {
    state: nextState === undefined ? state : nextState,
  };
};
