import { expect, test } from "vitest";

import {
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const createStoredNumber = ({ state, variableId, name, value }) =>
  processCommand({
    state,
    command: {
      type: "variable.create",
      payload: {
        variableId,
        data: {
          type: "variable",
          variableType: "number",
          name,
          scope: "context",
          default: value,
          value,
        },
      },
    },
  });

test("variable.create persists a computed expression without stored values", () => {
  const hpResult = createStoredNumber({
    state: createEmptyTestState(),
    variableId: "hp",
    name: "HP",
    value: 80,
  });
  const maxHpResult = createStoredNumber({
    state: hpResult.state,
    variableId: "maxHp",
    name: "Max HP",
    value: 100,
  });

  const command = {
    type: "variable.create",
    payload: {
      variableId: "hpPercent",
      data: {
        type: "variable",
        variableType: "number",
        name: "HP Percent",
        computed: {
          expr: {
            round: [
              {
                mul: [
                  {
                    div: [{ var: "variables.hp" }, { var: "variables.maxHp" }],
                  },
                  100,
                ],
              },
            ],
          },
        },
      },
    },
  };

  expect(validatePayload(command)).toEqual({ valid: true });
  expect(validateAgainstState({ state: maxHpResult.state, command })).toEqual({
    valid: true,
  });

  const result = processCommand({ state: maxHpResult.state, command });

  expect(result.valid).toBe(true);
  expect(result.state.variables.items.hpPercent).toMatchObject({
    id: "hpPercent",
    type: "variable",
    variableType: "number",
    computed: command.payload.data.computed,
  });
  expect(result.state.variables.items.hpPercent).not.toHaveProperty("default");
  expect(result.state.variables.items.hpPercent).not.toHaveProperty("value");
  expect(result.state.variables.items.hpPercent).not.toHaveProperty("scope");
  expect(validateState({ state: result.state })).toEqual({ valid: true });
});

test("computed object variables support ordered branches and literal values", () => {
  const state = createEmptyTestState();
  const command = {
    type: "variable.create",
    payload: {
      variableId: "hpBadge",
      data: {
        type: "variable",
        variableType: "object",
        name: "HP Badge",
        computed: {
          branches: [
            {
              when: {
                lte: [{ var: "variables.hp" }, 0],
              },
              value: {
                text: "Down",
                colorId: "gray",
              },
            },
          ],
          default: {
            value: {
              text: "Healthy",
              colorId: "green",
            },
          },
        },
      },
    },
  };

  const result = processCommand({ state, command });

  expect(result.valid).toBe(true);
  expect(result.state.variables.items.hpBadge.computed).toEqual(
    command.payload.data.computed,
  );
  expect(validateState({ state: result.state })).toEqual({ valid: true });
});

test("computed variables reject stored values and incompatible expressions", () => {
  expect(
    validatePayload({
      type: "variable.create",
      payload: {
        variableId: "badStoredValue",
        data: {
          type: "variable",
          variableType: "number",
          name: "Bad Stored Value",
          default: 0,
          computed: { expr: 1 },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message:
        "payload.data computed variables must not contain default or value",
    },
  });

  expect(
    validatePayload({
      type: "variable.create",
      payload: {
        variableId: "badType",
        data: {
          type: "variable",
          variableType: "number",
          name: "Bad Type",
          computed: { expr: "not a number" },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message: "payload.data.computed.expr must resolve to number",
    },
  });
});

test("computed definitions reject unknown operators and condition calls", () => {
  expect(
    validatePayload({
      type: "variable.create",
      payload: {
        variableId: "unknownOperator",
        data: {
          type: "variable",
          variableType: "number",
          name: "Unknown Operator",
          computed: { expr: { power: [2, 3] } },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message:
        "payload.data.computed.expr contains unsupported expression operator 'power'",
    },
  });

  expect(
    validatePayload({
      type: "variable.create",
      payload: {
        variableId: "conditionCall",
        data: {
          type: "variable",
          variableType: "string",
          name: "Condition Call",
          computed: {
            branches: [
              {
                when: { call: "isReady" },
                expr: "ready",
              },
            ],
            default: { expr: "waiting" },
          },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message:
        "payload.data.computed.branches[0].when function calls are not supported",
    },
  });

  expect(
    validatePayload({
      type: "variable.create",
      payload: {
        variableId: "stringCondition",
        data: {
          type: "variable",
          variableType: "string",
          name: "String Condition",
          computed: {
            branches: [{ when: "variables.ready", expr: "ready" }],
            default: { expr: "waiting" },
          },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message:
        "payload.data.computed.branches[0].when string conditions are not supported",
    },
  });
});

test("computed definitions accept every Route Engine expression operator", () => {
  const cases = [
    ["add", [1, 2], "number"],
    ["sub", [1, 2], "number"],
    ["mul", [1, 2], "number"],
    ["div", [1, 2], "number"],
    ["mod", [1, 2], "number"],
    ["neg", [1], "number"],
    ["round", [1.5], "number"],
    ["floor", [1.5], "number"],
    ["ceil", [1.5], "number"],
    ["min", [1, 2], "number"],
    ["max", [1, 2], "number"],
    ["clamp", [2, 0, 1], "number"],
    ["eq", [1, 1], "boolean"],
    ["neq", [1, 2], "boolean"],
    ["gt", [2, 1], "boolean"],
    ["gte", [2, 1], "boolean"],
    ["lt", [1, 2], "boolean"],
    ["lte", [1, 2], "boolean"],
    ["in", [1, { literal: [1, 2] }], "boolean"],
    ["and", [true], "boolean"],
    ["or", [false, true], "boolean"],
    ["all", [true], "boolean"],
    ["any", [false, true], "boolean"],
    ["not", [true], "boolean"],
    ["length", ["text"], "number"],
    ["includes", [{ literal: [1, 2] }, 2], "boolean"],
  ];

  cases.forEach(([operator, operands, variableType]) => {
    expect(
      validatePayload({
        type: "variable.create",
        payload: {
          variableId: `computed-${operator}`,
          data: {
            type: "variable",
            variableType,
            name: operator,
            computed: { expr: { [operator]: operands } },
          },
        },
      }),
    ).toEqual({ valid: true });
  });
});

test("variable.update edits computed definitions without permitting source conversion", () => {
  const computedResult = processCommand({
    state: createEmptyTestState(),
    command: {
      type: "variable.create",
      payload: {
        variableId: "scoreLabel",
        data: {
          type: "variable",
          variableType: "string",
          name: "Score Label",
          computed: { expr: "Score" },
        },
      },
    },
  });

  const updateResult = processCommand({
    state: computedResult.state,
    command: {
      type: "variable.update",
      payload: {
        variableId: "scoreLabel",
        data: {
          name: "Current Score Label",
          computed: { expr: "Current score" },
        },
      },
    },
  });

  expect(updateResult.valid).toBe(true);
  expect(updateResult.state.variables.items.scoreLabel).toMatchObject({
    name: "Current Score Label",
    computed: { expr: "Current score" },
  });

  const storedResult = createStoredNumber({
    state: createEmptyTestState(),
    variableId: "score",
    name: "Score",
    value: 0,
  });
  expect(
    validateAgainstState({
      state: storedResult.state,
      command: {
        type: "variable.update",
        payload: {
          variableId: "score",
          data: { computed: { expr: 1 } },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message: "stored variables cannot be converted to computed variables",
    },
  });

  expect(
    validateAgainstState({
      state: computedResult.state,
      command: {
        type: "variable.update",
        payload: {
          variableId: "scoreLabel",
          data: { value: "stored" },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message:
        "computed variables cannot update scope, stored value, or enum fields",
    },
  });
});

test("computed variables omit scope while stored variables require it", () => {
  expect(
    validatePayload({
      type: "variable.create",
      payload: {
        variableId: "scopedComputed",
        data: {
          type: "variable",
          variableType: "string",
          name: "Scoped Computed",
          scope: "context",
          computed: { expr: "temporary" },
        },
      },
    }),
  ).toMatchObject({
    valid: false,
    error: {
      message: "payload.data.scope must be omitted for computed variables",
    },
  });

  expect(
    validatePayload({
      type: "variable.create",
      payload: {
        variableId: "unscopedStored",
        data: {
          type: "variable",
          variableType: "string",
          name: "Unscoped Stored",
          default: "stored",
          value: "stored",
        },
      },
    }),
  ).toMatchObject({ valid: false });
});
