import { createPreconditionValidationError } from "./errors.js";
import {
  scanStrictJson,
  strictFailure as fail,
  STRICT_LIMITS,
} from "./strictInput.js";
import {
  validateActions,
  validateActionCombinations,
  object,
  reference as ref,
  id,
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
} from "./strictActions.js";

import { validateReferenceImpact } from "./strictReferences.js";

const own = (value, key) => Object.hasOwn(value, key);
const interactions = [
  "hover",
  "click",
  "rightClick",
  "scrollUp",
  "scrollDown",
  "change",
  "submit",
  "focusEvent",
  "blurEvent",
  "selectionChange",
  "compositionStart",
  "compositionUpdate",
  "compositionEnd",
];
const precondition = (path, message) => {
  throw createPreconditionValidationError(`${path} ${message}`, { path });
};
const interaction = object({
  inheritToChildren: bool,
  payload: object({ actions: nested }),
});
const optionalSpeaker = (value, path, context) => {
  if (value !== "") ref("characters")(value, path, context);
};
const previewSprite = (value, path, context) => {
  if (own(value, "animations"))
    fail(`${path}.animations`, "is not supported in previews");
  dialogueSprite(value, path, { ...context, preview: true });
};
const previewLineFields = {
  characterId: optionalSpeaker,
  characterName: text,
  character: object({ name: text, sprite: previewSprite }),
  content: richContent,
};
const previewLine = object(previewLineFields, ["content"]);
const previewRuntime = object({
  dialogueTextSpeed: nonnegative,
  autoForwardDelay: nonnegative,
  soundVolume: percent,
  musicVolume: percent,
  saveLoadPagination: (value, path) => {
    integer(value, path);
    if (value < 1) fail(path, "must be positive");
  },
  skipUnseenText: bool,
  skipTransitionsAndAnimations: bool,
  muteAll: bool,
  autoMode: bool,
  skipMode: bool,
  dialogueUIHidden: bool,
  isLineCompleted: bool,
  menuPage: text,
  menuEntryPoint: text,
});
export function validatePreview(value, path, context = {}) {
  object({
    backgroundImageId: ref("images"),
    variables: (variables, p, c) => {
      if (
        !variables ||
        typeof variables !== "object" ||
        Array.isArray(variables)
      )
        fail(p, "must be a variable dictionary");
      for (const [key, sample] of Object.entries(variables)) {
        const variable = ref("variables")(key, `${p}.${key}`, c);
        if (!variable) continue;
        const type = Array.isArray(sample) ? "object" : typeof sample;
        if (sample === null || type !== variable.variableType)
          precondition(`${p}.${key}`, "must match its declared variable type");
        if (variable.isEnum && !variable.enumValues.includes(sample))
          precondition(`${p}.${key}`, "must be a declared enum value");
      }
    },
    runtime: previewRuntime,
    dialogue: (dialogue, p, c) => {
      object({ ...previewLineFields, lines: array(previewLine, 1024) })(
        dialogue,
        p,
        c,
      );
      if (!own(dialogue, "content") && !own(dialogue, "lines"))
        fail(p, "requires content or lines");
    },
    dialogueLines: array(previewLine, 1024),
    historyDialogue: array(
      object({ characterName: text, text }, ["text"]),
      1024,
    ),
    choice: object(
      {
        items: array(
          object(
            {
              content: text,
              events: object({
                click: object({ actions: deferred }, ["actions"]),
              }),
            },
            ["content"],
          ),
          1024,
        ),
      },
      ["items"],
    ),
    confirmDialog: object({
      resourceId: (v, p, c) => {
        if (v !== "") {
          const layout = ref("layouts")(v, p, c);
          if (layout && layout.layoutType !== "confirmDialog")
            precondition(p, "requires a confirmation layout");
        }
      },
      confirmActions: deferred,
      cancelActions: deferred,
    }),
    saveSlots: array(
      object(
        {
          slotId: (v, p) => {
            integer(v, p);
            if (!v) fail(p, "must be positive");
          },
          image: ref("images"),
          savedAt: integer,
          isAvailable: bool,
        },
        ["slotId"],
      ),
      1024,
    ),
    form: object(
      {
        values: (values, p) => {
          if (!values || typeof values !== "object" || Array.isArray(values))
            fail(p, "must be a field dictionary");
          for (const [key, item] of Object.entries(values)) {
            id(key, `${p}.${key}`);
            text(item, `${p}.${key}`);
          }
        },
      },
      ["values"],
    ),
  })(value, path, { ...context, context: "system", preview: true });
  if (
    value.dialogue?.lines &&
    value.dialogueLines &&
    JSON.stringify(value.dialogue.lines) !== JSON.stringify(value.dialogueLines)
  )
    fail(path, "dialogue line samples must agree");
}

function elementContexts(owner) {
  const contexts = new Map();
  const visit = (nodes, parent = {}) => {
    for (const node of nodes ?? []) {
      const element = owner.elements?.items?.[node.id];
      if (!element) continue;
      const current = { ...parent };
      if (element.type === "container-ref-save-load-slot") current.slot = true;
      contexts.set(node.id, current);
      visit(node.children, current);
    }
  };
  visit(owner.elements?.tree);
  return contexts;
}
function validateElement(element, path, context, fields = interactions) {
  for (const key of fields) {
    if (!own(element, key) || !interactions.includes(key)) continue;
    const current = { ...context };
    if (key === "change" && element.type === "slider") {
      current.eventType = "number";
      current.eventRange = { min: element.min ?? 0, max: element.max ?? 100, step: element.step ?? 1 };
    } else if (["change", "submit"].includes(key) && element.type === "input")
      current.eventType = "string";
    interaction(element[key], `${path}.${key}`, current);
  }
}

// Element geometry/type and tree moves can change the meaning of unchanged
// bindings. Check previously supported action entries individually so an
// unrelated legacy action does not prevent preserving the rest of the element.
function validateElementContextImpact(before, after, inspect) {
  for (const collection of ["layouts", "controls"]) {
    for (const [ownerId, owner] of Object.entries(after[collection].items)) {
      const oldOwner = before[collection].items[ownerId];
      if (!oldOwner?.elements || !owner.elements) continue;
      const oldContexts = elementContexts(oldOwner), contexts = elementContexts(owner);
      for (const [elementId, element] of Object.entries(owner.elements.items)) {
        const old = oldOwner.elements.items[elementId];
        if (!old) continue;
        const oldContext = { state: before, context: "system", ...oldContexts.get(elementId) };
        const context = { state: after, context: "system", ...contexts.get(elementId) };
        if (old.type === element.type && old.min === element.min && old.max === element.max &&
          old.step === element.step && oldContext.slot === context.slot) continue;
        for (const field of interactions) {
          const previous = old[field]?.payload?.actions;
          const current = element[field]?.payload?.actions;
          for (const [name, action] of Object.entries(previous ?? {})) {
            if (JSON.stringify(action) !== JSON.stringify(current?.[name])) continue;
            const single = (entry) => ({ ...entry, [field]: { payload: { actions: { [name]: action } } } });
            try { validateElement(single(old), "state", oldContext, [field]); }
            catch { continue; }
            const path = `state.${collection}.items.${ownerId}.elements.items.${elementId}.${field}.payload.actions.${name}`;
            inspect(action, path, () => validateElement(single(element), path, context, [field]));
          }
        }
      }
    }
  }
}
function validateOwner(owner, path, state, fields) {
  const context = { state, context: "system" };
  if (own(owner, "preview") && (!fields || fields.includes("preview")))
    validatePreview(owner.preview, `${path}.preview`, context);
  if (owner.elements && (!fields || fields.includes("elements"))) {
    const contexts = elementContexts(owner);
    for (const [key, element] of Object.entries(owner.elements.items))
      validateElement(element, `${path}.elements.items.${key}`, {
        ...context,
        ...contexts.get(key),
      });
  }
  for (const field of ["keyboard", "keyup"]) {
    if (!own(owner, field) || (fields && !fields.includes(field))) continue;
    object(
      Object.fromEntries(
        ["enter", "space", "esc", "ctrl", "left", "right", "up", "down"].map(
          (key) => [key, interaction],
        ),
      ),
    )(owner[field], `${path}.${field}`, context);
  }
}

function* lines(state) {
  for (const [sceneId, scene] of Object.entries(state.scenes?.items ?? {})) {
    for (const [sectionId, section] of Object.entries(
      scene.sections?.items ?? {},
    )) {
      for (const [lineId, line] of Object.entries(section.lines?.items ?? {}))
        yield {
          sceneId,
          sectionId,
          lineId,
          line,
          path: `state.scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions`,
        };
    }
  }
}

export function validateStrictState(state, path = "state") {
  for (const [key, variable] of Object.entries(state.variables?.items ?? {})) {
    id(key, `${path}.variables.items.${key}`);
    if (!["variable", "folder"].includes(variable?.type))
      fail(`${path}.variables.items.${key}.type`, "must be variable or folder");
  }
  for (const location of lines(state))
    validateActions(location.line.actions, {
      state,
      sceneId: location.sceneId,
      path: location.path.replace(/^state/, path),
    });
  for (const collection of ["layouts", "controls"])
    for (const [key, owner] of Object.entries(state[collection]?.items ?? {}))
      if (owner.type !== "folder")
        validateOwner(owner, `${path}.${collection}.items.${key}`, state);
  for (const [key, sprite] of Object.entries(state.spritesheets?.items ?? {}))
    if (sprite.type !== "folder")
      validateAtlasSprite(sprite, `${path}.spritesheets.items.${key}`, state);
  for (const [characterId, character] of Object.entries(
    state.characters?.items ?? {},
  ))
    for (const [key, sprite] of Object.entries(character.sprites?.items ?? {}))
      if (sprite.type === "spritesheet")
        validateAtlasSprite(
          sprite,
          `${path}.characters.items.${characterId}.sprites.items.${key}`,
          state,
        );
}

export function validateStrictPayload(type, payload) {
  if (["spritesheet.create", "character.sprite.create"].includes(type) && payload.data.type === "spritesheet") validateAtlasSprite(payload.data, "payload.data");
  if (type === "character.create" && payload.data.sprites) {
    for (const [key, sprite] of Object.entries(payload.data.sprites.items)) if (sprite.type === "spritesheet") validateAtlasSprite(sprite, `payload.data.sprites.items.${key}`);
  }
  if (type === "project.create")
    validateStrictState(payload.state, "payload.state");
  if (type === "line.create")
    payload.lines.forEach(({ data }, index) => {
      if (own(data, "actions"))
        validateActions(data.actions, {
          path: `payload.lines.${index}.data.actions`,
        });
    });
  if (type === "line.update_actions")
    validateActions(payload.data, { path: "payload.data" });
  if (/^(layout|control)\.(create|update)$/.test(type))
    validateOwner(payload.data, "payload.data");
  if (/^(layout|control)\.element\.(create|update)$/.test(type)) {
    // The final element type and inherited context are known only against state.
    for (const key of interactions)
      if (own(payload.data, key))
        object({
          inheritToChildren: bool,
          payload: object({
            actions: (value, path) => {
              validateActions(value, {
                path,
                context: "system",
                shapeOnly: true,
              });
            },
          }),
        })(payload.data[key], `payload.data.${key}`);
  }
}

export function validateStrictTransition(before, after, command) {
  const { type, payload } = command;
  let work = scanStrictJson(payload, {
    project: type === "project.create",
  }).work;
  const inspect = (value, path, validate) => {
    work += scanStrictJson(value, {
      path,
      project: type === "project.create",
    }).work;
    if (
      work >
      (type === "project.create"
        ? STRICT_LIMITS.projectWork
        : STRICT_LIMITS.work)
    )
      fail(path, "exceeds the affected-result work limit");
    validate();
  };
  if (type === "project.create") {
    inspect(after, "state", () => validateStrictState(after));
    return work;
  }
  work += validateReferenceImpact(before, after, work);
  if (type.startsWith("layout.") || type.startsWith("control.")) {
    validateElementContextImpact(before, after, inspect);
  }
  const created = new Set(
    type === "line.create" ? payload.lines.map((line) => line.lineId) : [],
  );
  for (const location of lines(after)) {
    if (created.has(location.lineId))
      inspect(location.line.actions, location.path, () =>
        validateActions(location.line.actions, {
          state: after,
          sceneId: location.sceneId,
          path: location.path,
        }),
      );
    if (type === "line.update_actions" && location.lineId === payload.lineId) {
      const affected =
        payload.replace === true
          ? location.line.actions
          : Object.fromEntries(
              Object.keys(payload.data).map((name) => [
                name,
                location.line.actions[name],
              ]),
            );
      inspect(affected, "payload.data", () =>
        validateActions(affected, {
          state: after,
          sceneId: location.sceneId,
          path: "payload.data",
        }),
      );
      validateActionCombinations(location.line.actions, "payload.data");
    }
  }
  for (const collection of ["layouts", "controls"]) {
    const family = collection.slice(0, -1);
    if (!type.startsWith(`${family}.`)) continue;
    const owner = after[collection].items[payload[`${family}Id`]];
    if (!owner || owner.type === "folder") continue;
    const fields =
      type.endsWith(".create") || type === "layout.schema.upgrade"
        ? undefined
        : Object.keys(payload.data ?? {});
    if (type.includes(".element.")) {
      const element = owner.elements.items[payload.elementId];
      if (element && ["create", "update"].includes(type.split(".").at(-1))) {
        const context = {
          state: after,
          context: "system",
          ...elementContexts(owner).get(payload.elementId),
        };
        inspect(payload.data, "payload.data", () =>
          validateElement(element, "payload.data", context, fields),
        );
      }
    } else if (
      [
        `${family}.create`,
        `${family}.update`,
        "layout.schema.upgrade",
      ].includes(type)
    )
      inspect(payload.data ?? owner, "payload.data", () =>
        validateOwner(owner, "payload.data", after, fields),
      );
  }
  if (type.startsWith("character.sprite.")) {
    const sprite =
      after.characters.items[payload.characterId]?.sprites?.items[
        payload.spriteId
      ];
    if (
      sprite?.type === "spritesheet" &&
      (type.endsWith("create") ||
        Object.keys(payload.data ?? {}).some((key) =>
          [
            "jsonData",
            "animations",
            "fileId",
            "width",
            "height",
            "sheetWidth",
            "sheetHeight",
            "frameCount",
          ].includes(key),
        ))
    )
      inspect(sprite, "payload.data", () =>
        validateAtlasSprite(sprite, "payload.data", after),
      );
  }
  if (["spritesheet.create", "spritesheet.update"].includes(type)) {
    const sprite = after.spritesheets.items[payload.spritesheetId];
    if (
      sprite?.type !== "folder" &&
      (type.endsWith("create") ||
        Object.keys(payload.data).some((key) =>
          [
            "jsonData",
            "animations",
            "fileId",
            "width",
            "height",
            "sheetWidth",
            "sheetHeight",
            "frameCount",
          ].includes(key),
        ))
    )
      inspect(sprite, "payload.data", () =>
        validateAtlasSprite(sprite, "payload.data", after),
      );
  }
  if (["character.create", "character.update"].includes(type) && payload.data.sprites) {
    const character = after.characters.items[payload.characterId];
    inspect(character.sprites, "payload.data.sprites", () => {
      for (const [key, sprite] of Object.entries(character.sprites.items)) {
        if (sprite.type === "spritesheet") validateAtlasSprite(sprite, `payload.data.sprites.items.${key}`, after);
      }
    });
  }
  return work;
}

const rect = object(
  { x: nonnegative, y: nonnegative, w: positive, h: positive },
  ["x", "y", "w", "h"],
);
const size = object({ w: positive, h: positive }, ["w", "h"]);
export function validateAtlasSprite(sprite, path, state) {
  const context = { state };
  const file = ref("files")(sprite.fileId, `${path}.fileId`, context);
  if (file && !file.mimeType.startsWith("image/"))
    precondition(`${path}.fileId`, "requires an image file");
  for (const field of ["sheetWidth", "sheetHeight", "width", "height"])
    if (own(sprite, field)) positive(sprite[field], `${path}.${field}`);
  const frames = sprite.jsonData?.frames;
  object(
    {
      frames: (value, p) => {
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !Object.keys(value).length
        )
          fail(p, "requires a nonempty frame dictionary");
        for (const [name, frame] of Object.entries(value)) {
          id(name, `${p}.${name}`);
          object(
            {
              frame: rect,
              rotated: bool,
              trimmed: bool,
              spriteSourceSize: rect,
              sourceSize: size,
              anchor: object({ x: num, y: num }, ["x", "y"]),
              borders: object({
                left: nonnegative,
                right: nonnegative,
                top: nonnegative,
                bottom: nonnegative,
              }),
            },
            ["frame"],
          )(frame, `${p}.${name}`);
          const dimensions = sprite.jsonData.meta?.size;
          const width = sprite.sheetWidth ?? dimensions?.w,
            height = sprite.sheetHeight ?? dimensions?.h;
          if (
            (width !== undefined && frame.frame.x + frame.frame.w > width) ||
            (height !== undefined && frame.frame.y + frame.frame.h > height)
          )
            fail(`${p}.${name}.frame`, "must fit the sheet dimensions");
          if (
            frame.spriteSourceSize &&
            frame.sourceSize &&
            (frame.spriteSourceSize.x + frame.spriteSourceSize.w >
              frame.sourceSize.w ||
              frame.spriteSourceSize.y + frame.spriteSourceSize.h >
                frame.sourceSize.h)
          )
            fail(`${p}.${name}.spriteSourceSize`, "must fit sourceSize");
        }
      },
      animations: (value, p) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          fail(p, "must be a clip dictionary");
        for (const [name, sequence] of Object.entries(value)) {
          id(name, `${p}.${name}`);
          array(
            (frame, q) => {
              id(frame, q);
              if (!own(frames ?? {}, frame))
                fail(q, "must name an atlas frame");
            },
            65536,
            1,
          )(sequence, `${p}.${name}`);
        }
      },
      meta: object({
        app: text,
        version: text,
        image: text,
        format: text,
        scale: (value, p) => {
          if (
            typeof value !== "string" ||
            !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) ||
            !Number.isFinite(Number(value)) ||
            Number(value) <= 0
          )
            fail(p, "must be a positive decimal string");
        },
        size,
        frameTags: array(
          object(
            {
              name: id,
              from: integer,
              to: integer,
              direction: choice(
                "forward",
                "reverse",
                "backward",
                "pingpong",
                "pingpong_reverse",
              ),
              repeat: (v, p) => {
                if (typeof v === "string" && /^\d+$/.test(v)) return;
                integer(v, p);
              },
              color: text,
            },
            ["name", "from", "to"],
          ),
          65536,
        ),
        layers: array(() => {}, 65536),
        slices: array(() => {}, 65536),
        related_multi_packs: array(text, 65536),
      }),
    },
    ["frames"],
  )(sprite.jsonData, `${path}.jsonData`, context);
  const count = Object.keys(frames).length;
  if (sprite.frameCount !== undefined && sprite.frameCount !== count)
    fail(`${path}.frameCount`, "must equal the number of frames");
  for (const tag of sprite.jsonData.meta?.frameTags ?? [])
    if (tag.from > tag.to || tag.to >= count)
      fail(
        `${path}.jsonData.meta.frameTags`,
        "must stay within the frame range",
      );
  if (
    !sprite.animations ||
    typeof sprite.animations !== "object" ||
    Array.isArray(sprite.animations) ||
    !Object.keys(sprite.animations).length
  )
    fail(`${path}.animations`, "requires at least one clip");
  for (const [name, clip] of Object.entries(sprite.animations)) {
    id(name, `${path}.animations.${name}`);
    object(
      {
        frames: array(
          (value, p) => {
            integer(value, p);
            if (value >= count) fail(p, "must reference an atlas frame index");
          },
          65536,
          1,
        ),
        fps: positive,
        animationSpeed: positive,
        loop: bool,
      },
      ["frames"],
    )(clip, `${path}.animations.${name}`);
    if (
      clip.fps !== undefined &&
      clip.animationSpeed !== undefined &&
      clip.fps !== clip.animationSpeed * 60
    )
      fail(`${path}.animations.${name}`, "has conflicting playback speeds");
  }
}
