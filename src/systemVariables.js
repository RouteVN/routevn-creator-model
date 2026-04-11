import {
  RUNTIME_FIELD_GROUPS,
  RUNTIME_FIELD_IDS,
  getRuntimeFieldDefinitions,
  isRuntimeFieldId,
} from "./runtimeFields.js";

export const SYSTEM_VARIABLE_GROUPS = Object.freeze(
  RUNTIME_FIELD_GROUPS.map((group) =>
    Object.freeze({
      id: group.id,
      name: group.name,
      variables: Object.freeze(group.fields || []),
    }),
  ),
);

export const SYSTEM_VARIABLE_IDS = RUNTIME_FIELD_IDS;

export const isSystemVariableId = isRuntimeFieldId;

export const getSystemVariableDefinitions = getRuntimeFieldDefinitions;
