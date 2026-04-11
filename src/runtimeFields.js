export const RUNTIME_FIELD_GROUPS = Object.freeze([
  {
    id: "routeEngine",
    name: "Route Engine",
    fields: Object.freeze([
      {
        id: "dialogueTextSpeed",
        name: "Dialogue Text Speed",
        type: "number",
        scope: "device",
        default: 50,
        source: "global.dialogueTextSpeed",
        description: "Controls the default dialogue text reveal speed.",
      },
      {
        id: "autoForwardDelay",
        name: "Auto Forward Delay",
        type: "number",
        scope: "device",
        default: 1000,
        source: "global.autoForwardDelay",
        description: "Controls the default auto mode delay in milliseconds.",
      },
      {
        id: "skipUnseenText",
        name: "Skip Unseen Text",
        type: "boolean",
        scope: "device",
        default: false,
        source: "global.skipUnseenText",
        description:
          "When enabled, skip mode can continue through lines the player has not viewed yet.",
      },
      {
        id: "skipTransitionsAndAnimations",
        name: "Skip Transitions And Animations",
        type: "boolean",
        scope: "device",
        default: false,
        source: "global.skipTransitionsAndAnimations",
        description:
          "When enabled, transitions and animations are skipped during presentation.",
      },
      {
        id: "soundVolume",
        name: "Sound Volume",
        type: "number",
        scope: "device",
        default: 500,
        source: "global.soundVolume",
        description: "Controls the effective sound effects volume.",
      },
      {
        id: "musicVolume",
        name: "Music Volume",
        type: "number",
        scope: "device",
        default: 500,
        source: "global.musicVolume",
        description: "Controls the effective music volume.",
      },
      {
        id: "muteAll",
        name: "Mute All",
        type: "boolean",
        scope: "device",
        default: false,
        source: "global.muteAll",
        description: "Controls whether all audio output is muted.",
      },
      {
        id: "saveLoadPagination",
        name: "Save/Load Pagination",
        type: "number",
        scope: "context",
        default: 1,
        source: "context.runtime.saveLoadPagination",
        description:
          "Tracks the current save/load pagination page for the active context.",
      },
      {
        id: "menuPage",
        name: "Menu Page",
        type: "string",
        scope: "context",
        default: "",
        source: "context.runtime.menuPage",
        description: "Tracks the current menu page id for the active UI flow.",
      },
      {
        id: "menuEntryPoint",
        name: "Menu Entry Point",
        type: "string",
        scope: "context",
        default: "",
        source: "context.runtime.menuEntryPoint",
        description:
          "Tracks how the current menu flow was opened for the active context.",
      },
      {
        id: "autoMode",
        name: "Auto Mode",
        type: "boolean",
        scope: "session",
        default: false,
        source: "global.autoMode",
        description: "Reflects whether auto mode is currently active.",
      },
      {
        id: "skipMode",
        name: "Skip Mode",
        type: "boolean",
        scope: "session",
        default: false,
        source: "global.skipMode",
        description: "Reflects whether skip mode is currently active.",
      },
      {
        id: "dialogueUIHidden",
        name: "Dialogue UI Hidden",
        type: "boolean",
        scope: "session",
        default: false,
        source: "global.dialogueUIHidden",
        description: "Reflects whether the dialogue UI is currently hidden.",
      },
      {
        id: "isLineCompleted",
        name: "Is Line Completed",
        type: "boolean",
        scope: "session",
        default: false,
        source: "global.isLineCompleted",
        description:
          "Reflects whether the current line has completed its presentation.",
      },
    ]),
  },
]);

export const RUNTIME_FIELD_IDS = Object.freeze(
  RUNTIME_FIELD_GROUPS.flatMap((group) =>
    (group.fields || []).map((field) => field.id),
  ),
);

const RUNTIME_FIELD_ID_SET = new Set(RUNTIME_FIELD_IDS);

export const isRuntimeFieldId = (value) => {
  return typeof value === "string" && RUNTIME_FIELD_ID_SET.has(value);
};

export const getRuntimeFieldDefinitions = () => {
  return RUNTIME_FIELD_GROUPS.flatMap((group) => group.fields || []);
};
