export const SYSTEM_VARIABLE_GROUPS = Object.freeze([
  {
    id: "routeEngine",
    name: "Route Engine",
    variables: Object.freeze([
      {
        id: "_skipUnseenText",
        name: "Skip Unseen Text",
        scope: "global-device",
        type: "boolean",
        default: false,
        description:
          "When enabled, skip mode can continue through lines the player has not viewed yet.",
      },
      {
        id: "_dialogueTextSpeed",
        name: "Dialogue Text Speed",
        scope: "global-device",
        type: "number",
        default: 50,
        description:
          "Controls the default dialogue text speed stored for this device.",
      },
    ]),
  },
]);

export const SYSTEM_VARIABLE_IDS = Object.freeze(
  SYSTEM_VARIABLE_GROUPS.flatMap((group) =>
    (group.variables || []).map((variable) => variable.id),
  ),
);

const SYSTEM_VARIABLE_ID_SET = new Set(SYSTEM_VARIABLE_IDS);

export const isSystemVariableId = (value) => {
  return typeof value === "string" && SYSTEM_VARIABLE_ID_SET.has(value);
};

export const getSystemVariableDefinitions = () => {
  return SYSTEM_VARIABLE_GROUPS.flatMap((group) => group.variables || []);
};
