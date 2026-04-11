export const RUNTIME_FIELD_IDS = Object.freeze([
  "dialogueTextSpeed",
  "autoForwardDelay",
  "skipUnseenText",
  "skipTransitionsAndAnimations",
  "soundVolume",
  "musicVolume",
  "muteAll",
  "saveLoadPagination",
  "menuPage",
  "menuEntryPoint",
  "autoMode",
  "skipMode",
  "dialogueUIHidden",
  "isLineCompleted",
]);

const RUNTIME_FIELD_ID_SET = new Set(RUNTIME_FIELD_IDS);

export const isRuntimeFieldId = (value) => {
  return typeof value === "string" && RUNTIME_FIELD_ID_SET.has(value);
};
