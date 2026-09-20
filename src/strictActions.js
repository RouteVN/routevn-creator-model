import { createPreconditionValidationError } from "./errors.js";
import { strictFailure as fail, scanStrictJson } from "./strictInput.js";
import { approvedFilters } from "./strictFilters.js";

const own = (value, key) => Object.hasOwn(value, key);
const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const id = (value, path) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    ["__proto__", "prototype", "constructor"].includes(value)
  )
    fail(path, "must be a nonempty safe identifier");
};
const text = (value, path) => {
  if (typeof value !== "string") fail(path, "must be a string");
};
const bool = (value, path) => {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
};
const number =
  (
    min = -Number.MAX_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
    integer = false,
  ) =>
  (value, path) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isSafeInteger(value))
    )
      fail(
        path,
        `must be ${integer ? "an integer" : "a number"} in [${min}, ${max}]`,
      );
  };
const num = number(),
  nonnegative = number(0),
  positive = (value, path) => {
    num(value, path);
    if (value <= 0) fail(path, "must be positive");
  };
const unit = number(0, 1),
  percent = number(0, 100),
  integer = number(0, Number.MAX_SAFE_INTEGER, true);
const choice =
  (...values) =>
  (value, path) => {
    if (!values.includes(value))
      fail(path, `must be one of ${values.join(", ")}`);
  };
export const object =
  (fields, required = []) =>
  (value, path, context) => {
    if (!plain(value)) fail(path, "must be an object");
    for (const key of Object.keys(value)) {
      if (!own(fields, key)) fail(`${path}.${key}`, "is not allowed");
      fields[key](value[key], `${path}.${key}`, context);
    }
    for (const key of required)
      if (!own(value, key)) fail(`${path}.${key}`, "is required");
  };
const array =
  (validate, max = 4096, min = 0, unique) =>
  (value, path, context) => {
    if (!Array.isArray(value) || value.length < min || value.length > max)
      fail(path, `must be an array with ${min}–${max} entries`);
    const ids = new Set();
    value.forEach((item, index) => {
      validate(item, `${path}.${index}`, context);
      if (unique && item[unique] !== undefined) {
        if (ids.has(item[unique]))
          fail(`${path}.${index}.${unique}`, "must be unique");
        ids.add(item[unique]);
      }
    });
  };
const empty = object({});
const precondition = (path, message) => {
  throw createPreconditionValidationError(`${path} ${message}`, { path });
};
export const reference =
  (collection, types) =>
  (value, path, context = {}) => {
    id(value, path);
    if (!context.state) return;
    const items = context.state[collection]?.items;
    const item = items && own(items, value) ? items[value] : undefined;
    const valid = Boolean(
      item &&
        item.type !== "folder" &&
        (!types || types.includes(item.type)) &&
        (collection !== "voices" || item.sceneId === context.sceneId),
    );
    if (context.references)
      context.references.set(path, { valid, value, collection });
    else if (!valid)
      precondition(
        path,
        `must reference an existing ${collection} item in the supported scope`,
      );
    return item;
  };
const ref = reference;
const runtimeTypes = Object.freeze({
  dialogueTextSpeed: "number",
  autoForwardDelay: "number",
  soundVolume: "number",
  musicVolume: "number",
  saveLoadPagination: "number",
  skipUnseenText: "boolean",
  skipTransitionsAndAnimations: "boolean",
  muteAll: "boolean",
  autoMode: "boolean",
  skipMode: "boolean",
  dialogueUIHidden: "boolean",
  isLineCompleted: "boolean",
  menuPage: "string",
  menuEntryPoint: "string",
});

function pathType(value, path, context) {
  text(value, path);
  if (new TextEncoder().encode(value).length > 16384) fail(path, "exceeds the expression byte limit");
  const root = /^(variables|runtime)/.exec(value);
  if (!root) fail(path, "must start with variables or runtime");
  let rest = value.slice(root[0].length);
  const parts = [];
  while (rest) {
    const token =
      /^(?:\.([A-Za-z_$][\w$]*)|\[("(?:[^"\\]|\\.)*"|0|[1-9][0-9]*)\])/.exec(
        rest,
      );
    if (!token) fail(path, "contains an unsupported path expression");
    const part = token[1] ?? JSON.parse(token[2]);
    if (typeof part === "string") id(part, path);
    parts.push(part);
    rest = rest.slice(token[0].length);
    if (parts.length > 32) fail(path, "exceeds the expression depth limit");
  }
  if (!parts.length) fail(path, "requires a declared field");
  if (root[1] === "runtime") {
    if (parts.length !== 1 || !own(runtimeTypes, parts[0]))
      fail(path, "uses an unsupported runtime field");
    return runtimeTypes[parts[0]];
  }
  const variable = ref("variables")(`${parts[0]}`, path, context);
  if (!variable) return undefined;
  if (parts.length > 1 && variable.variableType !== "object")
    precondition(path, "can traverse only an object variable");
  return parts.length === 1 ? variable.variableType : undefined;
}
const template = (value, path, context = {}) => {
  text(value, path);
  let offset = 0;
  while ((offset = value.indexOf("${", offset)) !== -1) {
    const end = value.indexOf("}", offset + 2);
    if (end < 0) fail(path, "contains an unclosed template binding");
    const type = pathType(value.slice(offset + 2, end), path, context);
    if (type === "object")
      precondition(path, "cannot interpolate an object variable");
    offset = end + 1;
  }
};
const typed =
  (type, validate) =>
  (value, path, context = {}) => {
    if (typeof value === "string" && value.startsWith("_event")) {
      if (
        value !== "_event.value" ||
        (!context.shapeOnly && context.eventType !== type)
      )
        fail(path, "has no compatible immediate event binding");
      if (type === "number" && context.eventRange) {
        validate(context.eventRange.min, path, context);
        validate(context.eventRange.max, path, context);
        const { min, max, step } = context.eventRange;
        if (step !== undefined && min + step <= max) validate(min + step, path, context);
      }
      return;
    }
    if (typeof value === "string" && /^\$\{[^}]+\}$/.test(value)) {
      const actual = pathType(value.slice(2, -1), path, context);
      if (actual && actual !== type)
        precondition(path, `must resolve to ${type}`);
      return;
    }
    validate(value, path, context);
  };
const transformations = Object.fromEntries(
  [
    "x",
    "y",
    "anchorX",
    "anchorY",
    "scaleX",
    "scaleY",
    "rotation",
    "originX",
    "originY",
  ].map((key) => [key, num]),
);
transformations.flipX = bool;
transformations.flipY = bool;
const opacity = { alpha: unit, opacity: unit };
const exclusive = (value, a, b, path) => {
  if (own(value, a) && own(value, b))
    fail(path, `cannot combine ${a} and ${b}`);
};
const animation = (value, path, context = {}) => {
  object(
    {
      resourceId: ref("animations"),
      playback: object({
        continuity: choice("render", "persistent"),
        speed: positive,
        loop: bool,
      }),
    },
    ["resourceId"],
  )(value, path, context);
  const resource = context.state?.animations?.items[value.resourceId];
  if (
    resource &&
    context.transition &&
    resource.animation?.type !== "transition"
  )
    precondition(path, "requires a transition animation");
  if (
    resource?.animation?.type === "transition" &&
    value.playback?.loop === true
  )
    fail(path, "cannot loop a transition animation");
};
const blur = (value, path, context) => {
  if (value !== null)
    object(
      {
        x: nonnegative,
        y: nonnegative,
        quality: positive,
        kernelSize: choice(5, 7, 9, 11, 13, 15),
        repeatEdgePixels: bool,
      },
      ["x", "y"],
    )(value, path, context);
};
const screen = (value, path, context) => {
  object({
    ...opacity,
    blur,
    animations: (v, p, c) => animation(v, p, { ...c, transition: true }),
  })(value, path, context);
  exclusive(value, "alpha", "opacity", path);
};
const color = (value, path) => {
  text(value, path);
  if (
    /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ||
    ["transparent", "black", "white"].includes(value)
  )
    return;
  const match =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(
      value,
    );
  if (!match || value.startsWith("rgba") !== (match[4] !== undefined))
    fail(path, "must be a supported color literal");
  match.slice(1, 4).forEach((channel) => number(0, 255)(Number(channel), path));
  if (match[4] !== undefined) unit(Number(match[4]), path);
};
const inlineStyle = object({
  fontWeight: choice("bold"),
  fontStyle: choice("italic"),
  textDecoration: choice("underline"),
  fill: color,
});
const richContent = (value, path, context) => {
  if (typeof value === "string") return template(value, path, context);
  array((segment, p, c) => {
    object({
      text: template,
      reference: object({ resourceId: ref("variables") }, ["resourceId"]),
      textStyleId: ref("textStyles"),
      textStyle: inlineStyle,
      furigana: object(
        {
          text: (v, q) => {
            text(v, q);
            if (!v || /[\r\n]/.test(v))
              fail(q, "must be nonempty single-line text");
          },
          textStyleId: ref("textStyles"),
        },
        ["text"],
      ),
    })(segment, p, c);
    if (own(segment, "text") === own(segment, "reference"))
      fail(p, "requires exactly one of text or reference");
  }, 65536)(value, path, context);
};
function sprite(value, path, context = {}) {
  object(
    {
      id,
      resourceId: id,
      animationName: id,
      animationSpeed: positive,
      loop: bool,
    },
    ["id", "resourceId"],
  )(value, path, context);
  if (!context.state) return;
  const owners = context.characterId
    ? [context.state.characters.items[context.characterId]]
    : Object.values(context.state.characters.items);
  const matches = owners.flatMap((owner) =>
    own(owner?.sprites?.items ?? {}, value.resourceId)
      ? [owner.sprites.items[value.resourceId]]
      : [],
  );
  if (
    matches.length !== 1 ||
    !["image", "spritesheet"].includes(matches[0]?.type)
  )
    precondition(
      `${path}.resourceId`,
      "must resolve to one character sprite in scope",
    );
  const target = matches[0];
  if (
    ["animationName", "animationSpeed", "loop"].some((key) =>
      own(value, key),
    ) &&
    target.type !== "spritesheet"
  )
    precondition(path, "requires spritesheet playback");
  if (
    value.animationName !== undefined &&
    !own(target.animations ?? {}, value.animationName)
  )
    precondition(`${path}.animationName`, "must name an existing clip");
}
const dialogueSprite = (value, path, context) => {
  object({
    transformId: ref("transforms"),
    items: array(sprite, 4096, 0, "id"),
    animations: animation,
  })(value, path, context);
  if (value.items?.length && !own(value, "transformId") && !context?.preview)
    fail(`${path}.transformId`, "is required for selected sprites");
};
const dialogueUi = (value, path, context = {}) => {
  object({ resourceId: ref("layouts"), animations: animation }, ["resourceId"])(
    value,
    path,
    context,
  );
  const type = context.state?.layouts.items[value.resourceId]?.layoutType;
  if (type && !["dialogue-adv", "dialogue-nvl"].includes(type))
    precondition(path, "requires a dialogue layout");
};
const dialogue = (value, path, context) => {
  object({
    ui: dialogueUi,
    gui: dialogueUi,
    mode: choice("adv", "nvl"),
    content: richContent,
    textSpeed: nonnegative,
    append: bool,
    characterId: ref("characters"),
    characterName: template,
    persistCharacter: bool,
    persistSprite: bool,
    character: object({ name: template, sprite: dialogueSprite }),
    clear: bool,
    clearPage: bool,
  })(value, path, context);
  exclusive(value, "ui", "gui", path);
  const layout =
    context?.state?.layouts.items[(value.ui ?? value.gui)?.resourceId];
  const mode = value.mode ?? layout?.layoutType?.replace("dialogue-", "");
  if (layout && value.mode && layout.layoutType !== `dialogue-${value.mode}`)
    precondition(`${path}.mode`, "must match its dialogue layout");
  if (
    value.clearPage === true &&
    mode !== "nvl" &&
    (context?.state || !(value.ui ?? value.gui))
  )
    fail(`${path}.clearPage`, "requires NVL dialogue");
  if (
    value.append === true &&
    mode !== "adv" &&
    (context?.state || !(value.ui ?? value.gui))
  )
    fail(`${path}.append`, "requires ADV dialogue");
  if (
    value.clear === true &&
    Object.keys(value).some((key) => !["clear", "content"].includes(key))
  )
    fail(path, "clear may coexist only with content");
};

const systemNames = [
  "nextLine",
  "setNextLineConfig",
  "toggleAutoMode",
  "startSkipMode",
  "stopSkipMode",
  "toggleSkipMode",
  "toggleDialogueUI",
  "pushOverlay",
  "popOverlay",
  "rollbackByOffset",
  "sectionTransition",
  "resetStoryAtSection",
  "saveSlot",
  "loadSlot",
  "updateVariable",
  "conditional",
  "showConfirmDialog",
  "hideConfirmDialog",
  "setDialogueTextSpeed",
  "setAutoForwardDelay",
  "setSkipUnseenText",
  "setSkipTransitionsAndAnimations",
  "setSoundVolume",
  "setMusicVolume",
  "setMuteAll",
  "setSaveLoadPagination",
  "incrementSaveLoadPagination",
  "decrementSaveLoadPagination",
  "setMenuPage",
  "setMenuEntryPoint",
];
export const SYSTEM_ACTION_NAMES = Object.freeze(systemNames);
const navigation = [
  "loadSlot",
  "rollbackByOffset",
  "resetStoryAtSection",
  "sectionTransition",
  "nextLine",
];
const nested = (value, path, context = {}) =>
  validateActions(value, {
    ...context,
    context: "system",
    path,
    depth: (context.depth ?? 1) + 1,
  });
const deferred = (value, path, context = {}) =>
  nested(value, path, {
    ...context,
    eventType: undefined,
    slot: false,
    shapeOnly: false,
  });
const slot = (value, path, context = {}) => {
  if (value === "_event.slotId") {
    if (!context.shapeOnly && !context.slot)
      fail(path, "requires a save/load-slot event");
    return;
  }
  if (typeof value === "number") return integer(value, path);
  id(value, path);
  if (value.startsWith("${")) {
    if (!/^\$\{[^}]+\}$/.test(value))
      fail(path, "requires a complete slot binding");
    const type = pathType(value.slice(2, -1), path, context);
    if (type && !["number", "string"].includes(type))
      precondition(path, "must resolve to a slot name or number");
  } else if (value.startsWith("_event"))
    fail(path, "uses an unsupported slot event binding");
};
const slotAction = (value, path, context = {}) => {
  object({ slotId: slot })(value, path, context);
  if (
    !own(value, "slotId") &&
    !context.shapeOnly &&
    (!context.slot || context.conditional)
  )
    fail(`${path}.slotId`, "is required outside an automatic slot context");
};
const transition = (value, path, context = {}) => {
  object({ sectionId: id, sceneId: id, screen }, ["sectionId"])(
    value,
    path,
    context,
  );
  if (!context.state) return;
  const owners = Object.values(context.state.scenes.items).filter((scene) =>
    own(scene.sections?.items ?? {}, value.sectionId),
  );
  if (
    owners.length !== 1 ||
    (value.sceneId !== undefined && owners[0].id !== value.sceneId)
  )
    precondition(path, "must reference a section and its actual scene owner");
};
export function validateCondition(
  value,
  path,
  context = {},
  depth = 1,
  budget = { nodes: 0 },
) {
  if (depth === 1) {
    const input = scanStrictJson(value, { path, maxBytes: 16384, maxDepth: 32 });
    if (input.nodes > 4096) fail(path, "exceeds the expression node limit");
  }
  if (++budget.nodes > 4096 || depth > 32)
    fail(path, "exceeds the expression budget");
  if (typeof value === "boolean") return "boolean";
  if (!plain(value) || Object.keys(value).length !== 1)
    fail(path, "must be a closed condition expression");
  const [operator] = Object.keys(value),
    operand = value[operator];
  if (operator === "var") return pathType(operand, path, context);
  if (operator === "literal")
    return Array.isArray(operand)
      ? "array"
      : operand === null
        ? "null"
        : typeof operand;
  if (operator === "not") {
    const type = validateCondition(
      operand,
      `${path}.not`,
      context,
      depth + 1,
      budget,
    );
    if (type && type !== "boolean")
      fail(path, "not requires a boolean condition");
    return "boolean";
  }
  const logical = ["all", "any"].includes(operator);
  if (
    !logical &&
    !["eq", "neq", "gt", "gte", "lt", "lte", "in", "add", "sub"].includes(
      operator,
    )
  )
    fail(path, "uses an unsupported condition operator");
  if (
    !Array.isArray(operand) ||
    (logical ? !operand.length : operand.length !== 2)
  )
    fail(path, "has invalid operator arity");
  const types = operand.map((item, index) =>
    plain(item)
      ? validateCondition(
          item,
          `${path}.${operator}.${index}`,
          context,
          depth + 1,
          budget,
        )
      : ["string", "number", "boolean"].includes(typeof item) || item === null
        ? item === null
          ? "null"
          : typeof item
        : fail(path, "has an invalid operand"),
  );
  if (logical && types.some((type) => type && type !== "boolean"))
    fail(path, "requires boolean conditions");
  if (["add", "sub"].includes(operator)) {
    if (types.some((type) => type && type !== "number"))
      fail(path, "requires numeric operands");
    return "number";
  }
  if (
    ["gt", "gte", "lt", "lte"].includes(operator) &&
    types.some((type) => type && !["number", "string"].includes(type))
  )
    fail(path, "requires numeric or string operands");
  if (operator === "in" && types[0] && Array.isArray(operand[1]?.literal)) {
    for (const member of operand[1].literal) {
      const memberType = member === null ? "null" : typeof member;
      if (["string", "number", "boolean", "null"].includes(memberType) && memberType !== types[0]) fail(path, "membership values must match the searched type");
    }
  }
  if (operator === "in" && types[1] === "string" && types[0] && types[0] !== "string") fail(path, "string membership requires a string search value");
  if (operator === "in" && types[1] && !["array", "string"].includes(types[1]))
    fail(path, "requires an array or string membership target");
  if (
    !logical &&
    operator !== "in" &&
    types[0] &&
    types[1] &&
    types[0] !== types[1]
  )
    fail(path, "requires operands of the same type");
  return "boolean";
}

const actions = {
  screen,
  dialogue,
  nextLine: object({ bypassChoice: bool }),
  setNextLineConfig: object({
    manual: object({ enabled: bool, requireLineCompleted: bool }),
    auto: object({
      enabled: bool,
      trigger: choice("fromStart", "fromComplete"),
      delay: nonnegative,
    }),
    applyMode: choice("singleLine", "persistent"),
  }),
  pushOverlay: object({ resourceId: ref("layouts") }, ["resourceId"]),
  rollbackByOffset: object({
    offset: number(-Number.MAX_SAFE_INTEGER, -1, true),
  }),
  sectionTransition: transition,
  resetStoryAtSection: transition,
  saveSlot: slotAction,
  loadSlot: slotAction,
  conditional: (value, path, context) => {
    object(
      {
        branches: array(
          (branch, p, c) => {
            object(
              {
                when: (v, q, cc) => {
                  const type = validateCondition(v, q, cc);
                  if (type && type !== "boolean") fail(q, "must be boolean");
                },
                actions: (v, q, cc) =>
                  nested(v, q, { ...cc, conditional: true }),
              },
              ["actions"],
            )(branch, p, c);
          },
          1024,
          1,
        ),
      },
      ["branches"],
    )(value, path, context);
    if (value.branches.slice(0, -1).some((branch) => !own(branch, "when")))
      fail(`${path}.branches`, "permits an else branch only at the end");
  },
  showConfirmDialog: (value, path, context) => {
    object(
      {
        resourceId: ref("layouts"),
        confirmActions: deferred,
        cancelActions: deferred,
      },
      ["resourceId", "confirmActions"],
    )(value, path, context);
    if (!Object.keys(value.confirmActions).length)
      fail(`${path}.confirmActions`, "must not be empty");
    const layout = context?.state?.layouts.items[value.resourceId];
    if (layout && layout.layoutType !== "confirmDialog")
      precondition(`${path}.resourceId`, "requires a confirmation layout");
  },
};
for (const name of [
  "toggleAutoMode",
  "startSkipMode",
  "stopSkipMode",
  "toggleSkipMode",
  "toggleDialogueUI",
  "popOverlay",
  "hideConfirmDialog",
  "incrementSaveLoadPagination",
  "decrementSaveLoadPagination",
])
  actions[name] = empty;
for (const name of ["setDialogueTextSpeed", "setAutoForwardDelay"])
  actions[name] = object({ value: typed("number", nonnegative) }, ["value"]);
for (const name of ["setSoundVolume", "setMusicVolume"])
  actions[name] = object({ value: typed("number", percent) }, ["value"]);
for (const name of [
  "setSkipUnseenText",
  "setSkipTransitionsAndAnimations",
  "setMuteAll",
])
  actions[name] = object({ value: typed("boolean", bool) }, ["value"]);
for (const name of ["setMenuPage", "setMenuEntryPoint"])
  actions[name] = object({ value: typed("string", template) }, ["value"]);
actions.setSaveLoadPagination = object(
  { value: typed("number", number(1, Number.MAX_SAFE_INTEGER, true)) },
  ["value"],
);

const filters = (value, path, context) => {
  let previous = -1;
  array((filter, p, c) => {
    const index = approvedFilters.findIndex(
      (entry) => entry.filterId === filter?.id,
    );
    if (index < 0 || index <= previous)
      fail(p, "requires a unique built-in filter in canonical order");
    previous = index;
    const approved = approvedFilters[index];
    object(
      {
        id: choice(approved.filterId),
        type: choice("shader"),
        parameters: object(
          { [approved.id]: number(approved.min, approved.max) },
          [approved.id],
        ),
        source: object(
          {
            webgl: object(
              { fragment: choice(approved.source.webgl.fragment) },
              ["fragment"],
            ),
            webgpu: object({ source: choice(approved.source.webgpu.source) }, [
              "source",
            ]),
          },
          ["webgl", "webgpu"],
        ),
      },
      ["id", "type", "parameters", "source"],
    )(filter, p, c);
  }, 7)(value, path, context);
};
function visualResource(value, path, context = {}) {
  if (!own(value, "resourceId")) {
    if (
      ["resourceType", "animationName", "animationSpeed", "loop"].some((key) =>
        own(value, key),
      )
    )
      fail(path, "playback fields require a resource");
    return;
  }
  id(value.resourceId, `${path}.resourceId`);
  if (!context.state) return;
  const kinds = {
    image: "images",
    video: "videos",
    spritesheet: "spritesheets",
    layout: "layouts",
  };
  const matching = Object.entries(kinds).filter(
    ([kind, collection]) =>
      (!value.resourceType || kind === value.resourceType) &&
      own(context.state[collection].items, value.resourceId) &&
      context.state[collection].items[value.resourceId].type === kind,
  );
  if (matching.length !== 1)
    precondition(
      `${path}.resourceId`,
      "must resolve to one supported visual resource",
    );
  const [kind, collection] = matching[0];
  const target = context.state[collection].items[value.resourceId];
  if (
    (value.animationName !== undefined || value.animationSpeed !== undefined) &&
    kind !== "spritesheet"
  )
    precondition(path, "clip playback requires a spritesheet");
  if (value.loop !== undefined && !["video", "spritesheet"].includes(kind))
    precondition(`${path}.loop`, "requires video or spritesheet playback");
  if (
    value.animationName !== undefined &&
    !own(target.animations ?? {}, value.animationName)
  )
    precondition(`${path}.animationName`, "must name a declared clip");
}
const visualFields = {
  resourceId: id,
  resourceType: choice("image", "video", "spritesheet", "layout"),
  animationName: id,
  animationSpeed: positive,
  transformId: ref("transforms"),
  ...transformations,
  ...opacity,
  blur,
  filters,
  animations: animation,
};
actions.background = (value, path, context) => {
  object({ ...visualFields, loop: bool, colorId: ref("colors") })(
    value,
    path,
    context,
  );
  exclusive(value, "alpha", "opacity", path);
  visualResource(value, path, context);
  if (
    value.transformId &&
    Object.keys(transformations).some(
      (key) => !["flipX", "flipY"].includes(key) && own(value, key),
    )
  )
    fail(
      path,
      "cannot combine transformId with inline numeric transform fields",
    );
  if (!value.resourceId && !value.colorId && Object.keys(value).length)
    fail(path, "effects require a resource or color target");
};
actions.visual = object({
  items: array(
    (value, path, context) => {
      object({ id, ...visualFields, layer: choice(10, 30, 50, 70, 90) }, [
        "id",
        "resourceId",
      ])(value, path, context);
      exclusive(value, "alpha", "opacity", path);
      visualResource(value, path, context);
    },
    4096,
    0,
    "id",
  ),
});
actions.character = object({
  items: array(
    (value, path, context) => {
      object(
        {
          id: ref("characters"),
          transformId: ref("transforms"),
          sprites: (v, p, c) =>
            array(sprite, 4096, 0, "id")(v, p, { ...c, characterId: value.id }),
          spriteName: text,
          ...transformations,
          ...opacity,
          blur,
          filters,
          animations: animation,
        },
        ["id"],
      )(value, path, context);
      exclusive(value, "alpha", "opacity", path);
      if (own(value, "sprites") && !value.transformId)
        fail(`${path}.transformId`, "is required with sprites");
    },
    4096,
    0,
    "id",
  ),
});
const requireLayout = (value, type, path, context) => {
  const layout = context?.state?.layouts.items[value];
  if (layout && layout.layoutType !== type)
    precondition(path, `requires a ${type} layout`);
};
actions.choice = (value, path, context) => {
  object({
    resourceId: ref("layouts"),
    items: array(
      object(
        {
          id,
          content: template,
          events: object({ click: object({ actions: deferred }, ["actions"]) }),
        },
        ["content"],
      ),
      1024,
      0,
      "id",
    ),
    animations: animation,
  })(value, path, context);
  if (value.items?.length && !value.resourceId)
    fail(`${path}.resourceId`, "is required with choices");
  requireLayout(value.resourceId, "choice", `${path}.resourceId`, context);
};
function writableVariable(value, path, context) {
  const variable = ref("variables")(value, path, context);
  if (
    variable &&
    (variable.computed !== undefined || variable.readOnly === true)
  )
    precondition(path, "must reference a writable non-computed variable");
  return variable;
}
actions.form = (value, path, context) => {
  object(
    {
      id,
      resourceId: ref("layouts"),
      fields: (fields, p, c) => {
        if (
          !plain(fields) ||
          !Object.keys(fields).length ||
          Object.keys(fields).length > 1024
        )
          fail(p, "requires 1–1024 named form fields");
        for (const [name, field] of Object.entries(fields)) {
          id(name, `${p}.${name}`);
          object(
            {
              variableId: (v, q, cc) => {
                const variable = writableVariable(v, q, cc);
                if (variable && variable.variableType !== "string")
                  precondition(q, "requires a string variable");
              },
              required: bool,
              trim: bool,
              placeholder: template,
              multiline: bool,
              maxLength: number(0, 1048576, true),
            },
            ["variableId"],
          )(field, `${p}.${name}`, c);
        }
      },
      submitActions: deferred,
      cancelActions: deferred,
      animations: animation,
    },
    ["resourceId", "fields"],
  )(value, path, context);
  requireLayout(value.resourceId, "input", `${path}.resourceId`, context);
  if (context?.state) {
    const fields = new Set();
    const visited = new Set();
    const visit = (layoutId) => {
      if (visited.has(layoutId)) return;
      visited.add(layoutId);
      for (const element of Object.values(
        context.state.layouts.items[layoutId]?.elements?.items ?? {},
      )) {
        if (element.type === "input") fields.add(element.field);
        if (element.fragmentLayoutId) visit(element.fragmentLayoutId);
      }
    };
    visit(value.resourceId);
    if (
      fields.size !== Object.keys(value.fields).length ||
      [...fields].some((name) => !own(value.fields, name))
    )
      precondition(
        `${path}.fields`,
        "must map every input field in the layout exactly once",
      );
  }
};
const audioEffect = object(
  { resourceId: ref("audioEffects"), playback: object({ speed: positive }) },
  ["resourceId"],
);
const audioSound = (value, path, context = {}) => {
  object(
    {
      id,
      resourceId: ref(context.voice ? "voices" : "sounds"),
      loop: bool,
      volume: percent,
      muted: bool,
      pan: number(-1, 1),
      startDelayMs: nonnegative,
      playbackRate: nonnegative,
      startAt: nonnegative,
      endAt: (v, p) => {
        if (v !== null) nonnegative(v, p);
      },
      beginEffect: audioEffect,
      endEffect: audioEffect,
    },
    ["id", "resourceId"],
  )(value, path, context);
  if (typeof value.endAt === "number" && value.endAt < (value.startAt ?? 0))
    fail(`${path}.endAt`, "must not precede startAt");
};
const channelFields = {
  sounds: array(audioSound, 4096, 0, "id"),
  loop: bool,
  interruption: choice("immediate", "loopEnd"),
  volume: percent,
  muted: bool,
  pan: number(-1, 1),
};
actions.sfx = (value, path, context) => {
  object({
    items: array(audioSound, 4096, 0, "id"),
    channels: array(
      object(
        { id, ...channelFields, applyMode: choice("singleLine", "persistent") },
        ["id", "sounds"],
      ),
      4096,
      0,
      "id",
    ),
  })(value, path, context);
  exclusive(value, "items", "channels", path);
};
const music = (voice) => (value, path, context) => {
  const fields = {
    ...channelFields,
    resourceId: ref(voice ? "voices" : "sounds"),
    startDelayMs: nonnegative,
  };
  if (!voice) fields.audioEffects = audioEffect;
  object(fields)(value, path, { ...context, voice });
  exclusive(value, "sounds", "resourceId", path);
  if (voice && !own(value, "sounds") && !own(value, "resourceId"))
    fail(path, "requires sounds or resourceId");
  if (own(value, "startDelayMs") && !own(value, "resourceId"))
    fail(path, "startDelayMs requires the single-resource form");
  if (own(value, "audioEffects") && !own(value, "sounds"))
    fail(path, "audioEffects requires scheduled sounds");
};
actions.bgm = music(false);
actions.voice = music(true);
actions.control = object(
  { resourceId: ref("controls"), resourceType: choice("control") },
  ["resourceId"],
);
// Object assignments retain the shipped runtime's recursive template handling.
// Data keys are not actions; only string values can contain runtime bindings.
const objectAssignment = (value, path, context) => {
  if (value === null || typeof value !== "object")
    fail(path, "must be an object or array");
  const pending = [{ value, path }];
  while (pending.length) {
    const entry = pending.pop();
    if (typeof entry.value === "string") {
      if (entry.value.startsWith("_event")) {
        if (entry.value !== "_event.value" || (!context.shapeOnly && !context.eventType))
          fail(entry.path, "has no compatible immediate event binding");
      } else if (/^\$\{[^}]+\}$/.test(entry.value)) {
        pathType(entry.value.slice(2, -1), entry.path, context);
      } else template(entry.value, entry.path, context);
    } else if (entry.value !== null && typeof entry.value === "object") {
      for (const [key, child] of Object.entries(entry.value))
        pending.push({ value: child, path: `${entry.path}.${key}` });
    }
  }
};
actions.updateVariable = (value, path, context) => {
  object(
    {
      id: (v, p) => {
        id(v, p);
        if (!/^[A-Za-z0-9]+$/.test(v)) fail(p, "must be alphanumeric");
      },
      operations: array(
        (operation, p, c) => {
          object(
            {
              variableId: id,
              op: choice(
                "set",
                "increment",
                "decrement",
                "multiply",
                "divide",
                "toggle",
              ),
              value: () => {},
              roundTo: number(0, 12, true),
            },
            ["variableId", "op"],
          )(operation, p, c);
          const variable = writableVariable(
            operation.variableId,
            `${p}.variableId`,
            c,
          );
          const kind = variable?.variableType;
          if (own(operation, "roundTo") && operation.op !== "divide")
            fail(`${p}.roundTo`, "is allowed only for division");
          if (
            ["set", "multiply", "divide"].includes(operation.op) &&
            !own(operation, "value")
          )
            fail(`${p}.value`, "is required");
          if (
            operation.op === "toggle" &&
            (own(operation, "value") || own(operation, "roundTo"))
          )
            fail(p, "toggle takes no value or rounding");
          if (
            kind === "object" ||
            (operation.value !== null && typeof operation.value === "object")
          ) {
            if (operation.op !== "set") fail(p, "object variables support only set");
            if (kind && kind !== "object")
              precondition(`${p}.value`, "requires an object variable");
            typed("object", objectAssignment)(operation.value, `${p}.value`, c);
          } else if (kind === "boolean") {
            if (!["set", "toggle"].includes(operation.op))
              fail(p, "boolean variables support set or toggle");
            if (operation.op === "set")
              typed("boolean", bool)(operation.value, `${p}.value`, c);
          } else if (kind === "string") {
            if (operation.op !== "set")
              fail(p, "string variables support only set");
            typed("string", template)(operation.value, `${p}.value`, c);
            if (
              variable.isEnum &&
              !operation.value.includes("${") &&
              !operation.value.startsWith("_event") &&
              !variable.enumValues.includes(operation.value)
            )
              precondition(`${p}.value`, "must be a declared enum value");
          } else if (
            kind === "number" ||
            ["increment", "decrement", "multiply", "divide"].includes(
              operation.op,
            )
          ) {
            if (operation.op === "toggle")
              fail(p, "number variables do not support toggle");
            if (own(operation, "value"))
              typed("number", num)(operation.value, `${p}.value`, c);
            if (operation.op === "divide" && operation.value === 0)
              fail(`${p}.value`, "cannot divide by zero");
          }
        },
        4096,
        1,
      ),
    },
    ["id", "operations"],
  )(value, path, context);
};

export const ACTION_NAMES = Object.freeze(Object.keys(actions).sort());
export {
  richContent,
  dialogueSprite,
  template,
  deferred,
  nested,
  bool,
  text,
  num,
  integer,
  array,
  choice,
  nonnegative,
  positive,
  percent,
};

export function validateActionCombinations(value, path) {
  for (const group of [
    navigation,
    ["choice", "form"],
    ["startSkipMode", "stopSkipMode", "toggleSkipMode"],
    ["showConfirmDialog", "hideConfirmDialog"],
  ]) {
    if (group.filter((name) => own(value, name)).length > 1)
      fail(path, `contains conflicting actions: ${group.join(", ")}`);
  }
  const navigates = (map) =>
    plain(map) &&
    (navigation.some((name) => own(map, name)) ||
      map.conditional?.branches?.some((branch) => navigates(branch.actions)));
  if (
    navigation.some((name) => own(value, name)) &&
    value.conditional?.branches?.some((branch) => navigates(branch.actions))
  )
    fail(path, "cannot combine direct and conditional navigation");
}

export function validateActions(value, context = {}) {
  const path = context.path ?? "actions";
  if (!plain(value)) fail(path, "must be an action map");
  if ((context.depth ?? 1) > 16) fail(path, "exceeds action nesting depth 16");
  for (const [name, payload] of Object.entries(value)) {
    if (
      !own(actions, name) ||
      (context.context === "system" && !systemNames.includes(name))
    )
      fail(`${path}.${name}`, "is not supported in this action context");
    actions[name](payload, `${path}.${name}`, context);
  }
  validateActionCombinations(value, path);
}
