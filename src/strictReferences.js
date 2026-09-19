import { createPreconditionValidationError } from "./errors.js";
import { strictFailure, STRICT_LIMITS } from "./strictInput.js";

const item = (state, collection, id) =>
  typeof id === "string" && Object.hasOwn(state[collection]?.items ?? {}, id)
    ? state[collection].items[id]
    : undefined;
const target = (state, collection, id) => {
  const value = item(state, collection, id);
  return value?.type !== "folder" ? value : undefined;
};

// This collector follows only documented reference-bearing fields. It does not
// validate or rewrite legacy action shapes, nor interpret arbitrary literal data.
// Each entry uses the owning entity's identity, so moving that entity keeps the
// reference comparable even when its scene/section ancestry changes.
function collect(state, spend) {
  const entries = (value) => {
    const result = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
    spend(1 + result.length);
    return result;
  };
  const list = (value) => {
    const result = Array.isArray(value) ? value : [];
    spend(1 + result.length);
    return result;
  };
  const bindingType = (value) => {
    if (typeof value !== "string") return typeof value;
    const match = /^\$\{variables(?:\.([A-Za-z_$][\w$]*)|\[("(?:[^"\\]|\\.)*")\])\}$/.exec(value);
    if (match) return target(state, "variables", match[1] ?? JSON.parse(match[2]))?.variableType;
    return value.includes("${") || value.startsWith("_event") ? undefined : "string";
  };
  const operationMatches = (variable, operation) => {
    if (variable.computed !== undefined || variable.readOnly === true) return false;
    const type = variable.variableType;
    if (type === "object") return operation.op === "set" && operation.valueMode === "literal" && operation.value !== null && typeof operation.value === "object";
    if (operation.valueMode === "literal") return false;
    if (operation.op === "toggle") return type === "boolean";
    if (operation.op !== "set" && type !== "number") return false;
    if (operation.value === undefined) return ["increment", "decrement"].includes(operation.op) && type === "number";
    const actual = bindingType(operation.value);
    if (actual && actual !== type) return false;
    if (type === "string" && variable.isEnum && actual === "string") return variable.enumValues.includes(operation.value);
    return true;
  };
  const found = new Map();
  const record = (path, value, valid) => {
    spend(1);
    if (typeof value === "string" && value.length)
      found.set(JSON.stringify(path), { value, valid: Boolean(valid), path });
  };
  const ref = (collection, value, path, predicate = () => true) => {
    const resource = target(state, collection, value);
    record(path, value, resource && predicate(resource));
    return resource;
  };
  const binding = (value, path) => {
    if (typeof value !== "string") return;
    for (const match of value.matchAll(
      /\$\{variables(?:\.([A-Za-z_$][\w$]*)|\[("(?:[^"\\]|\\.)*")\])/g,
    )) {
      const id = match[1] ?? JSON.parse(match[2]);
      ref("variables", id, [...path, "binding", id]);
    }
  };
  const content = (value, path) => {
    binding(value, path);
    list(value).forEach((segment, index) => {
      const p = [...path, index];
      binding(segment?.text, [...p, "text"]);
      ref("variables", segment?.reference?.resourceId, [
        ...p,
        "reference",
        "resourceId",
      ]);
      ref("textStyles", segment?.textStyleId, [...p, "textStyleId"]);
      ref("textStyles", segment?.furigana?.textStyleId, [
        ...p,
        "furigana",
        "textStyleId",
      ]);
    });
  };
  const animation = (value, path, transition = false) =>
    ref(
      "animations",
      value?.resourceId,
      [...path, "resourceId"],
      (resource) => !transition || resource.animation?.type === "transition",
    );
  const sprite = (value, path, characterId) => {
    const owners = characterId
      ? [target(state, "characters", characterId)]
      : Object.values(state.characters.items);
    const candidates = owners.flatMap((owner) => {
      const resource = owner?.sprites?.items?.[value?.resourceId];
      return resource && ["image", "spritesheet"].includes(resource.type)
        ? [resource]
        : [];
    });
    record(
      [...path, "resourceId"],
      value?.resourceId,
      candidates.length === 1 &&
        (value.animationName === undefined ||
          Object.hasOwn(candidates[0].animations ?? {}, value.animationName)),
    );
  };
  const portrait = (value, path, characterId) => {
    ref("transforms", value?.transformId, [...path, "transformId"]);
    animation(value?.animations, [...path, "animations"]);
    list(value?.items).forEach((value, index) =>
      sprite(value, [...path, "items", index], characterId),
    );
  };
  const visual = (value, path) => {
    const kinds = {
      image: "images",
      spritesheet: "spritesheets",
      video: "videos",
      layout: "layouts",
    };
    const matches = Object.entries(kinds).filter(
      ([kind, collection]) =>
        (!value?.resourceType || value.resourceType === kind) &&
        target(state, collection, value?.resourceId),
    );
    const resource =
      matches.length === 1
        ? target(state, matches[0][1], value.resourceId)
        : undefined;
    record(
      [...path, "resourceId"],
      value?.resourceId,
      resource &&
        (value.animationName === undefined ||
          Object.hasOwn(resource.animations ?? {}, value.animationName)),
    );
    ref("transforms", value?.transformId, [...path, "transformId"]);
    ref("colors", value?.colorId, [...path, "colorId"]);
    animation(value?.animations, [...path, "animations"]);
  };
  const expression = (value, path) => {
    for (const [operator, operand] of entries(value)) {
      if (operator === "literal") continue;
      if (operator === "var") binding(`\${${operand}}`, path);
      else if (Array.isArray(operand))
        operand.forEach((entry, index) =>
          expression(entry, [...path, operator, index]),
        );
      else expression(operand, [...path, operator]);
    }
  };
  const audio = (value, path, sceneId, voice) => {
    ref(
      voice ? "voices" : "sounds",
      value?.resourceId,
      [...path, "resourceId"],
      (resource) => !voice || resource.sceneId === sceneId,
    );
    for (const field of ["beginEffect", "endEffect", "audioEffects"])
      ref("audioEffects", value?.[field]?.resourceId, [
        ...path,
        field,
        "resourceId",
      ]);
  };
  const dialogue = (value, path) => {
    ref("characters", value?.characterId, [...path, "characterId"]);
    for (const key of ["ui", "gui"])
      ref(
        "layouts",
        value?.[key]?.resourceId,
        [...path, key, "resourceId"],
        (layout) =>
          ["dialogue-adv", "dialogue-nvl"].includes(layout.layoutType) &&
          (!value.mode || layout.layoutType === `dialogue-${value.mode}`),
      );
    portrait(value?.character?.sprite, [...path, "character", "sprite"]);
    binding(value?.characterName, [...path, "characterName"]);
    binding(value?.character?.name, [...path, "character", "name"]);
    content(value?.content, [...path, "content"]);
  };
  const actions = (map, path, sceneId) => {
    for (const [name, value] of entries(map)) {
      if (!value || typeof value !== "object") continue;
      const p = [...path, name];
      if (name === "background") visual(value, p);
      if (name === "visual")
        list(value.items).forEach((value, index) =>
          visual(value, [...p, "items", index]),
        );
      if (name === "screen")
        animation(value.animations, [...p, "animations"], true);
      if (name === "dialogue") dialogue(value, p);
      if (name === "character")
        list(value.items).forEach((value, index) => {
          const q = [...p, "items", index];
          ref("characters", value?.id, [...q, "id"]);
          ref("transforms", value?.transformId, [...q, "transformId"]);
          animation(value?.animations, [...q, "animations"]);
          list(value?.sprites).forEach((entry, index) =>
            sprite(entry, [...q, "sprites", index], value?.id),
          );
        });
      if (
        ["choice", "form", "showConfirmDialog", "pushOverlay"].includes(name)
      ) {
        const types = {
          choice: "choice",
          form: "input",
          showConfirmDialog: "confirmDialog",
        };
        ref(
          "layouts",
          value.resourceId,
          [...p, "resourceId"],
          (layout) => !types[name] || layout.layoutType === types[name],
        );
        animation(value.animations, [...p, "animations"]);
      }
      if (name === "control")
        ref("controls", value.resourceId, [...p, "resourceId"]);
      if (["sectionTransition", "resetStoryAtSection"].includes(name)) {
        const owners = Object.values(state.scenes.items).filter((scene) =>
          Object.hasOwn(scene.sections?.items ?? {}, value.sectionId),
        );
        record(
          [...p, "sectionId"],
          value.sectionId,
          owners.length === 1 &&
            (!value.sceneId || owners[0].id === value.sceneId),
        );
        animation(
          value.screen?.animations,
          [...p, "screen", "animations"],
          true,
        );
      }
      if (name === "updateVariable")
        list(value.operations).forEach((operation, index) => {
          const q = [...p, "operations", index];
          ref(
            "variables",
            operation?.variableId,
            [...q, "variableId"],
            (variable) => operationMatches(variable, operation),
          );
          if (operation?.valueMode !== "literal")
            binding(operation?.value, [...q, "value"]);
        });
      if (name === "form")
        for (const [key, field] of entries(value.fields)) {
          ref(
            "variables",
            field?.variableId,
            [...p, "fields", key, "variableId"],
            (variable) =>
              variable.variableType === "string" &&
              variable.computed === undefined &&
              variable.readOnly !== true,
          );
          binding(field?.placeholder, [...p, "fields", key, "placeholder"]);
        }
      if (["sfx", "bgm", "voice"].includes(name)) {
        const voice = name === "voice";
        audio(value, p, sceneId, voice);
        for (const field of ["sounds", "items"])
          list(value[field]).forEach((value, index) =>
            audio(value, [...p, field, index], sceneId, voice),
          );
        list(value.channels).forEach((channel, index) =>
          list(channel?.sounds).forEach((value, soundIndex) =>
            audio(
              value,
              [...p, "channels", index, "sounds", soundIndex],
              sceneId,
              false,
            ),
          ),
        );
      }
      if (name === "conditional")
        list(value.branches).forEach((branch, index) => {
          expression(branch?.when, [...p, "branches", index, "when"]);
          actions(
            branch?.actions,
            [...p, "branches", index, "actions"],
            sceneId,
          );
        });
      if (name === "choice")
        list(value.items).forEach((value, index) => {
          content(value?.content, [...p, "items", index, "content"]);
          actions(
            value?.events?.click?.actions,
            [...p, "items", index, "events", "click", "actions"],
            sceneId,
          );
        });
      if (["form", "showConfirmDialog"].includes(name))
        for (const field of [
          "submitActions",
          "confirmActions",
          "cancelActions",
        ])
          actions(value[field], [...p, field], sceneId);
      if (name.startsWith("set")) binding(value.value, [...p, "value"]);
      if (["saveSlot", "loadSlot"].includes(name))
        binding(value.slotId, [...p, "slotId"]);
    }
  };
  for (const [sceneId, scene] of entries(state.scenes.items))
    for (const [, section] of entries(scene.sections?.items))
      for (const [lineId, line] of entries(section.lines?.items))
        actions(line.actions, ["line", lineId, "actions"], sceneId);
  for (const collection of ["layouts", "controls"])
    for (const [ownerId, owner] of entries(state[collection].items)) {
      const p = [collection, ownerId];
      for (const [elementId, element] of entries(owner.elements?.items))
        for (const field of [
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
        ])
          actions(element[field]?.payload?.actions, [
            ...p,
            "elements",
            elementId,
            field,
          ]);
      for (const field of ["keyboard", "keyup"])
        for (const [key, interaction] of entries(owner[field]))
          actions(interaction?.payload?.actions, [...p, field, key]);
      const preview = owner.preview;
      if (preview) {
        ref("images", preview.backgroundImageId, [
          ...p,
          "preview",
          "backgroundImageId",
        ]);
        dialogue(preview.dialogue, [...p, "preview", "dialogue"]);
        for (const [key, sample] of entries(preview.variables))
          ref("variables", key, [...p, "preview", "variables", key], (variable) => {
            const type = Array.isArray(sample) ? "object" : typeof sample;
            return sample !== null && type === variable.variableType && (!variable.isEnum || variable.enumValues.includes(sample));
          });
        for (const field of ["dialogueLines", "historyDialogue"])
          list(preview[field]).forEach((line, index) =>
            dialogue(line, [...p, "preview", field, index]),
          );
        list(preview.dialogue?.lines).forEach((line, index) =>
          dialogue(line, [...p, "preview", "dialogue", "lines", index]),
        );
        actions(
          { choice: preview.choice, showConfirmDialog: preview.confirmDialog },
          [...p, "preview"],
        );
      }
    }
  return found;
}

export function validateReferenceImpact(before, after, initialWork = 0) {
  let work = initialWork;
  const spend = (amount) => {
    work += amount;
    if (work > STRICT_LIMITS.work) strictFailure("state", "exceeds the reference-impact work limit");
  };
  const previous = collect(before, spend);
  for (const [key, current] of collect(after, spend)) {
    const old = previous.get(key);
    if (old?.valid && old.value === current.value && !current.valid) {
      const path = current.path.join(".");
      throw createPreconditionValidationError(
        `${path} would lose a previously valid reference`,
        { path, referenceId: current.value },
      );
    }
  }
  return work - initialWork;
}
