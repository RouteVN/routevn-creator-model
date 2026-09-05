import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  SCHEMA_VERSION,
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const createVariableCommand = ({
  variableId,
  variableType,
  name = variableId,
  computed,
  ...data
}) => ({
  type: "variable.create",
  payload: {
    variableId,
    data: {
      type: "variable",
      variableType,
      name,
      ...(computed === undefined ? data : { ...data, computed }),
    },
  },
});

const createComputedCommand = ({
  variableId = "computed",
  variableType = "number",
  computed = { expr: 1 },
  ...data
} = {}) =>
  createVariableCommand({
    variableId,
    variableType,
    computed,
    ...data,
  });

const createStoredVariable = ({
  state,
  variableId,
  variableType = "number",
  value,
  scope = "context",
}) =>
  processCommand({
    state,
    command: createVariableCommand({
      variableId,
      variableType,
      scope,
      default: value,
      value,
    }),
  });

const createStateWithVariables = (variables) => {
  const state = createEmptyTestState();
  state.variables.items = Object.fromEntries(
    variables.map(({ id, ...variable }) => [
      id,
      {
        id,
        type: "variable",
        name: id,
        ...variable,
      },
    ]),
  );
  state.variables.tree = variables.map(({ id }) => ({
    id,
    children: [],
  }));
  return state;
};

const expectInvalid = (result, message) => {
  expect(result).toMatchObject({
    valid: false,
    ...(message === undefined
      ? {}
      : {
          error: {
            message,
          },
        }),
  });
};

const expectPublicApisToReject = (command) => {
  let payloadResult;
  expect(() => {
    payloadResult = validatePayload(command);
  }).not.toThrow();
  expectInvalid(payloadResult);

  let processResult;
  expect(() => {
    processResult = processCommand({
      state: createEmptyTestState(),
      command,
    });
  }).not.toThrow();
  expectInvalid(processResult);
};

test("the package feature version matches the computed-variable schema line", () => {
  const [majorVersion, featureVersion] = packageJson.version
    .split(".")
    .map(Number);

  expect(majorVersion).toBe(1);
  expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(13);
  expect(featureVersion).toBe(SCHEMA_VERSION);
});

test("variable.create persists a computed expression without stored fields", () => {
  const hpResult = createStoredVariable({
    state: createEmptyTestState(),
    variableId: "hp",
    value: 80,
  });
  const maxHpResult = createStoredVariable({
    state: hpResult.state,
    variableId: "maxHp",
    value: 100,
  });
  const command = createComputedCommand({
    variableId: "hpPercent",
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
  });

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

test("computed definitions persist examples without derived results", () => {
  const hpResult = createStoredVariable({
    state: createEmptyTestState(),
    variableId: "hp",
    value: 40,
  });
  const maxHpResult = createStoredVariable({
    state: hpResult.state,
    variableId: "maxHp",
    value: 80,
  });
  const examples = [
    {
      id: "example-low-health",
      name: "Low health",
      input: {
        variables: {
          hp: 40,
          maxHp: 80,
          player: { status: "poisoned" },
        },
        runtime: { locale: "en" },
      },
    },
    {
      id: "example-full-health",
      name: "Full health",
      input: {
        variables: { hp: 100, maxHp: 100 },
      },
    },
  ];
  const command = createComputedCommand({
    variableId: "hpPercent",
    computed: {
      expr: {
        mul: [
          {
            div: [{ var: "variables.hp" }, { var: "variables.maxHp" }],
          },
          100,
        ],
      },
      examples,
    },
  });

  expect(validateAgainstState({ state: maxHpResult.state, command })).toEqual({
    valid: true,
  });
  const result = processCommand({ state: maxHpResult.state, command });

  expect(result.valid).toBe(true);
  expect(result.state.variables.items.hpPercent.computed.examples).toEqual(
    examples,
  );
  expect(
    result.state.variables.items.hpPercent.computed.examples[0],
  ).not.toHaveProperty("result");
  expect(validateState({ state: result.state })).toEqual({ valid: true });
});

test.each([
  [
    "an object instead of an array",
    {},
    "payload.data.computed.examples must be an array",
  ],
  [
    "a missing id",
    [{ input: { variables: {} } }],
    "payload.data.computed.examples[0].id must be a non-empty string",
  ],
  [
    "duplicate ids",
    [
      { id: "same", input: {} },
      { id: "same", input: {} },
    ],
    "payload.data.computed.examples[1].id must be unique within examples",
  ],
  [
    "an empty name",
    [{ id: "example", name: "", input: {} }],
    "payload.data.computed.examples[0].name must be a non-empty string",
  ],
  [
    "a missing input",
    [{ id: "example" }],
    "payload.data.computed.examples[0].input is required",
  ],
  [
    "an array variables namespace",
    [{ id: "example", input: { variables: [] } }],
    "payload.data.computed.examples[0].input.variables must be an object",
  ],
  [
    "a persisted result",
    [{ id: "example", input: {}, result: 50 }],
    "payload.data.computed.examples[0].result is not allowed",
  ],
])("rejects computed examples with %s", (_label, examples, message) => {
  expectInvalid(
    validatePayload(
      createComputedCommand({
        computed: { expr: 1, examples },
      }),
    ),
    message,
  );
});

test.each([
  ["Date", new Date()],
  ["Map", new Map()],
  ["WeakMap", new WeakMap()],
  ["Promise", Promise.resolve()],
])("rejects a %s computed example input", (_label, input) => {
  const command = createComputedCommand({
    computed: {
      expr: 1,
      examples: [{ id: "example", input }],
    },
  });

  expectInvalid(
    validatePayload(command),
    "payload.data.computed.examples[0].input must be an object",
  );
  expectPublicApisToReject(command);
});

test.each([
  ["string", { expr: "ready" }],
  ["number", { expr: 42 }],
  ["boolean", { expr: true }],
  ["object", { value: { text: "Ready" } }],
  ["object", { value: ["ready", 42, true] }],
  ["object", { expr: { literal: { text: "Ready" } } }],
])(
  "simple computed definitions support %s results %#",
  (variableType, computed) => {
    const command = createComputedCommand({
      variableId: `result-${variableType}`,
      variableType,
      computed,
    });
    const result = processCommand({
      state: createEmptyTestState(),
      command,
    });

    expect(result.valid).toBe(true);
    expect(
      result.state.variables.items[`result-${variableType}`].computed,
    ).toEqual(computed);
  },
);

test.each([
  ["string", { expr: "down" }, { expr: "healthy" }],
  ["number", { expr: 0 }, { expr: 100 }],
  ["boolean", { expr: false }, { expr: true }],
  ["object", { value: { text: "Down" } }, { value: { text: "Healthy" } }],
])(
  "conditional computed definitions support %s branch results",
  (variableType, branchResult, defaultResult) => {
    const command = createComputedCommand({
      variableId: `conditional-${variableType}`,
      variableType,
      computed: {
        branches: [
          {
            when: {
              not: {
                eq: [1, 2],
              },
            },
            ...branchResult,
          },
        ],
        default: defaultResult,
      },
    });

    const result = processCommand({
      state: createEmptyTestState(),
      command,
    });
    expect(result.valid).toBe(true);
    expect(
      result.state.variables.items[`conditional-${variableType}`].computed,
    ).toEqual(command.payload.data.computed);
  },
);

describe("expression grammar", () => {
  const operatorCases = [
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

  test.each(operatorCases)(
    "accepts the %s operator",
    (operator, operands, variableType) => {
      expect(
        validatePayload(
          createComputedCommand({
            variableId: `computed-${operator}`,
            variableType,
            computed: { expr: { [operator]: operands } },
          }),
        ),
      ).toEqual({ valid: true });
    },
  );

  const fixedArities = {
    add: 2,
    sub: 2,
    mul: 2,
    div: 2,
    mod: 2,
    neg: 1,
    round: 1,
    floor: 1,
    ceil: 1,
    min: 2,
    max: 2,
    clamp: 3,
    eq: 2,
    neq: 2,
    gt: 2,
    gte: 2,
    lt: 2,
    lte: 2,
    in: 2,
    not: 1,
    length: 1,
    includes: 2,
  };

  test.each(Object.entries(fixedArities))(
    "%s requires exactly %i operands",
    (operator, operandCount) => {
      const variableType = [
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "not",
        "includes",
      ].includes(operator)
        ? "boolean"
        : "number";

      for (const operands of [
        Array.from({ length: operandCount - 1 }, () => 1),
        Array.from({ length: operandCount + 1 }, () => 1),
      ]) {
        expectInvalid(
          validatePayload(
            createComputedCommand({
              variableType,
              computed: { expr: { [operator]: operands } },
            }),
          ),
        );
      }
    },
  );

  test.each(["and", "or", "all", "any"])(
    "%s requires at least one operand",
    (operator) => {
      expectInvalid(
        validatePayload(
          createComputedCommand({
            variableType: "boolean",
            computed: { expr: { [operator]: [] } },
          }),
        ),
      );
    },
  );

  test.each([
    [{ power: [2, 3] }, "unsupported operator"],
    [{ add: [1, 2], sub: [3, 2] }, "multiple operators"],
    [[], "raw array"],
    [{ add: [1, "two"] }, "incompatible numeric operand"],
    [Number.NaN, "NaN literal"],
    [Number.POSITIVE_INFINITY, "infinite literal"],
  ])("rejects malformed expression case: %s", (expr) => {
    expectInvalid(
      validatePayload(
        createComputedCommand({
          computed: { expr },
        }),
      ),
    );
  });

  test.each([
    ["undefined", undefined],
    ["bigint", 1n],
    ["function", () => true],
    ["symbol", Symbol("unsupported")],
  ])(
    "rejects a nested %s primitive without throwing",
    (_description, unsupportedValue) => {
      expectPublicApisToReject(
        createComputedCommand({
          variableType: "boolean",
          computed: {
            expr: { eq: [unsupportedValue, unsupportedValue] },
          },
        }),
      );
    },
  );

  test("rejects cyclic operator expressions without throwing", () => {
    const expr = { add: [1] };
    expr.add.push(expr);

    expectPublicApisToReject(
      createComputedCommand({
        computed: { expr },
      }),
    );
  });

  test("allows an acyclic expression node to be reused", () => {
    const comparison = { eq: [1, 1] };

    expect(
      validatePayload(
        createComputedCommand({
          variableType: "boolean",
          computed: {
            expr: { and: [comparison, comparison] },
          },
        }),
      ),
    ).toEqual({ valid: true });
  });
});

describe("condition grammar", () => {
  const validConditions = [
    { var: "runtime.ready" },
    { literal: ["ready"] },
    { all: [true, { eq: [1, 1] }] },
    { any: [false, { neq: [1, 2] }] },
    { not: { eq: [1, 2] } },
    { eq: [1, 1] },
    { neq: [1, 2] },
    { gt: [2, 1] },
    { gte: [2, 1] },
    { lt: [1, 2] },
    { lte: [1, 2] },
    { in: [1, { literal: [1, 2] }] },
    { add: [1, 2] },
    { sub: [2, 1] },
  ];

  test.each(validConditions)("accepts semantic condition %#", (when) => {
    expect(
      validatePayload(
        createComputedCommand({
          variableType: "string",
          computed: {
            branches: [{ when, expr: "ready" }],
            default: { expr: "waiting" },
          },
        }),
      ),
    ).toEqual({ valid: true });
  });

  const fixedArities = {
    eq: 2,
    neq: 2,
    gt: 2,
    gte: 2,
    lt: 2,
    lte: 2,
    in: 2,
    add: 2,
    sub: 2,
  };

  test.each(Object.entries(fixedArities))(
    "condition %s requires exactly %i operands",
    (operator, operandCount) => {
      for (const operands of [
        Array.from({ length: operandCount - 1 }, () => 1),
        Array.from({ length: operandCount + 1 }, () => 1),
      ]) {
        expectInvalid(
          validatePayload(
            createComputedCommand({
              variableType: "string",
              computed: {
                branches: [
                  {
                    when: { [operator]: operands },
                    expr: "ready",
                  },
                ],
                default: { expr: "waiting" },
              },
            }),
          ),
        );
      }
    },
  );

  test.each(["all", "any"])(
    "condition %s requires at least one operand",
    (operator) => {
      expectInvalid(
        validatePayload(
          createComputedCommand({
            variableType: "string",
            computed: {
              branches: [
                {
                  when: { [operator]: [] },
                  expr: "ready",
                },
              ],
              default: { expr: "waiting" },
            },
          }),
        ),
      );
    },
  );

  test.each(
    [
      "variables.ready",
      { call: "isReady" },
      { unknown: [true] },
      { eq: [1, 1], neq: [1, 2] },
      [],
      { add: [1, "two"] },
      Number.NaN,
    ].map((when) => [when]),
  )("rejects malformed condition %#", (when) => {
    expectInvalid(
      validatePayload(
        createComputedCommand({
          variableType: "string",
          computed: {
            branches: [{ when, expr: "ready" }],
            default: { expr: "waiting" },
          },
        }),
      ),
    );
  });

  test.each([
    ["undefined", undefined],
    ["bigint", 1n],
    ["function", () => true],
    ["symbol", Symbol("unsupported")],
  ])(
    "rejects a nested %s primitive without throwing",
    (_description, unsupportedValue) => {
      expectPublicApisToReject(
        createComputedCommand({
          variableType: "string",
          computed: {
            branches: [
              {
                when: { eq: [unsupportedValue, unsupportedValue] },
                expr: "ready",
              },
            ],
            default: { expr: "waiting" },
          },
        }),
      );
    },
  );

  test("rejects cyclic operator conditions without throwing", () => {
    const when = { all: [true] };
    when.all.push(when);

    expectPublicApisToReject(
      createComputedCommand({
        variableType: "string",
        computed: {
          branches: [{ when, expr: "ready" }],
          default: { expr: "waiting" },
        },
      }),
    );
  });

  test("keeps expression not array-shaped and condition not direct", () => {
    expect(
      validatePayload(
        createComputedCommand({
          variableType: "boolean",
          computed: { expr: { not: [true] } },
        }),
      ),
    ).toEqual({ valid: true });

    expect(
      validatePayload(
        createComputedCommand({
          variableType: "boolean",
          computed: {
            branches: [{ when: { not: true }, expr: true }],
            default: { expr: false },
          },
        }),
      ),
    ).toEqual({ valid: true });

    expectInvalid(
      validatePayload(
        createComputedCommand({
          variableType: "boolean",
          computed: {
            branches: [{ when: { not: [true] }, expr: true }],
            default: { expr: false },
          },
        }),
      ),
    );
  });
});

describe("computed result and branch shapes", () => {
  test.each([
    [{}, "empty simple definition"],
    [{ expr: 1, value: 1 }, "expr and value together"],
    [{ expr: 1, unsupported: true }, "unknown simple property"],
    [{ branches: [], default: { expr: 1 } }, "empty branches"],
    [{ branches: [{ when: true, expr: 1 }] }, "missing default"],
    [
      {
        branches: [{ expr: 1 }],
        default: { expr: 1 },
      },
      "missing branch condition",
    ],
    [
      {
        branches: [{ when: true }],
        default: { expr: 1 },
      },
      "missing branch result",
    ],
    [
      {
        branches: [{ when: true, expr: 1, value: 1 }],
        default: { expr: 1 },
      },
      "branch expr and value together",
    ],
    [
      {
        branches: [{ when: true, expr: 1 }],
        default: {},
      },
      "empty default",
    ],
    [
      {
        branches: [{ when: true, expr: 1 }],
        default: { expr: 1, value: 1 },
      },
      "default expr and value together",
    ],
    [
      {
        branches: [{ when: true, expr: 1 }],
        default: { expr: 1 },
        expr: 1,
      },
      "branches mixed with expr",
    ],
  ])("rejects %s", (computed) => {
    expectInvalid(
      validatePayload(
        createComputedCommand({
          computed,
        }),
      ),
    );
  });

  test.each([
    ["string", 1],
    ["number", "1"],
    ["boolean", 1],
    ["object", null],
  ])(
    "rejects %s results with incompatible expression %#",
    (variableType, expr) => {
      expectInvalid(
        validatePayload(
          createComputedCommand({
            variableType,
            computed: { expr },
          }),
        ),
      );
    },
  );

  test.each([
    ["string", 1],
    ["number", "1"],
    ["boolean", 1],
    ["object", null],
  ])("rejects %s results with incompatible value %#", (variableType, value) => {
    expectInvalid(
      validatePayload(
        createComputedCommand({
          variableType,
          computed: { value },
        }),
      ),
    );
  });

  test("requires JSON-compatible literal data", () => {
    const cyclicValue = {};
    cyclicValue.self = cyclicValue;

    for (const value of [
      { nested: Number.NaN },
      { nested: Number.POSITIVE_INFINITY },
      { nested: undefined },
      { nested: 1n },
      { nested: () => true },
      new Date(),
      cyclicValue,
    ]) {
      expectInvalid(
        validatePayload(
          createComputedCommand({
            variableType: "object",
            computed: { value },
          }),
        ),
      );
    }
  });

  test("rejects top-level stored fields and enum metadata", () => {
    for (const data of [
      { default: 0 },
      { value: 0 },
      { isEnum: true },
      { enumValues: ["one"] },
    ]) {
      expectInvalid(
        validatePayload(
          createComputedCommand({
            variableType: data.isEnum ? "string" : "number",
            computed: { expr: data.isEnum ? "one" : 0 },
            ...data,
          }),
        ),
      );
    }
  });
});

describe("computed reference paths", () => {
  test.each([
    "variables.score",
    'variables["player.stats"]',
    "variables['player.stats']",
    'variables["a\\\"b\\\\c"]',
    "variables['a\\'b']",
    "variables.payload.items[0].name",
    'variables.payload["01"]',
    "runtime.ready",
    'runtime["save.slot"].ready',
  ])("accepts reference syntax %s", (referencePath) => {
    expect(
      validatePayload(
        createComputedCommand({
          computed: { expr: { var: referencePath } },
        }),
      ),
    ).toEqual({ valid: true });
  });

  test.each([
    "variables",
    "runtime",
    "variables.",
    "variables[]",
    "variables[foo]",
    "variables[01]",
    'variables["unterminated]',
    'variables[""]',
    " variables.score",
    "variables.score ",
    "variables.score..value",
    "variables.score]",
    "_event.value",
    "other.value",
  ])("rejects malformed or forbidden reference %s", (referencePath) => {
    expectInvalid(
      validatePayload(
        createComputedCommand({
          computed: { expr: { var: referencePath } },
        }),
      ),
    );
  });

  test("validates referenced variables and statically known types against state", () => {
    const scoreResult = createStoredVariable({
      state: createEmptyTestState(),
      variableId: "score",
      value: 10,
    });
    const labelResult = createStoredVariable({
      state: scoreResult.state,
      variableId: "label",
      variableType: "string",
      value: "ten",
    });

    expect(
      validateAgainstState({
        state: labelResult.state,
        command: createComputedCommand({
          computed: { expr: { var: "variables.score" } },
        }),
      }),
    ).toEqual({ valid: true });

    expectInvalid(
      validateAgainstState({
        state: labelResult.state,
        command: createComputedCommand({
          computed: { expr: { var: "variables.missing" } },
        }),
      }),
    );

    expectInvalid(
      validateAgainstState({
        state: labelResult.state,
        command: createComputedCommand({
          computed: { expr: { var: "variables.label" } },
        }),
      }),
    );
  });

  test("resolves quoted IDs and permits nested paths with unknown static type", () => {
    const quotedId = 'player."stats\\[]';
    const quotedResult = createStoredVariable({
      state: createEmptyTestState(),
      variableId: quotedId,
      value: 10,
    });
    const objectResult = createStoredVariable({
      state: quotedResult.state,
      variableId: "payload",
      variableType: "object",
      value: { scores: [1, 2, 3] },
    });

    expect(
      validateAgainstState({
        state: objectResult.state,
        command: createComputedCommand({
          variableId: "quoted",
          computed: {
            expr: {
              var: `variables[${JSON.stringify(quotedId)}]`,
            },
          },
        }),
      }),
    ).toEqual({ valid: true });

    expect(
      validateAgainstState({
        state: objectResult.state,
        command: createComputedCommand({
          variableId: "nestedLength",
          computed: {
            expr: {
              length: [{ var: "variables.payload.scores" }],
            },
          },
        }),
      }),
    ).toEqual({ valid: true });
  });
});

describe("dependency graph validation", () => {
  const cycleCases = [
    [
      "self reference",
      [
        {
          id: "a",
          variableType: "number",
          computed: {
            expr: { add: [{ var: "variables.a" }, 1] },
          },
        },
      ],
    ],
    [
      "indirect cycle",
      [
        {
          id: "a",
          variableType: "number",
          computed: {
            expr: { add: [{ var: "variables.b" }, 1] },
          },
        },
        {
          id: "b",
          variableType: "number",
          computed: {
            expr: { add: [{ var: "variables.a" }, 1] },
          },
        },
      ],
    ],
    [
      "inactive branch",
      [
        {
          id: "a",
          variableType: "boolean",
          computed: {
            branches: [
              {
                when: false,
                expr: { var: "variables.b" },
              },
            ],
            default: { expr: false },
          },
        },
        {
          id: "b",
          variableType: "boolean",
          computed: { expr: { var: "variables.a" } },
        },
      ],
    ],
    [
      "default result",
      [
        {
          id: "a",
          variableType: "number",
          computed: {
            branches: [{ when: true, expr: 1 }],
            default: { expr: { var: "variables.b" } },
          },
        },
        {
          id: "b",
          variableType: "number",
          computed: { expr: { var: "variables.a" } },
        },
      ],
    ],
    [
      "branch condition",
      [
        {
          id: "a",
          variableType: "string",
          computed: {
            branches: [
              {
                when: { var: "variables.b" },
                expr: "ready",
              },
            ],
            default: { expr: "waiting" },
          },
        },
        {
          id: "b",
          variableType: "boolean",
          computed: {
            expr: { eq: [{ var: "variables.a" }, "ready"] },
          },
        },
      ],
    ],
    [
      "short-circuited operand",
      [
        {
          id: "a",
          variableType: "boolean",
          computed: {
            expr: { and: [false, { var: "variables.b" }] },
          },
        },
        {
          id: "b",
          variableType: "boolean",
          computed: { expr: { var: "variables.a" } },
        },
      ],
    ],
  ];

  test.each(cycleCases)("rejects a cycle hidden in %s", (_label, variables) => {
    expectInvalid(
      validateState({ state: createStateWithVariables(variables) }),
    );
  });

  test("accepts declaration-order-independent acyclic computed chains", () => {
    const state = createStateWithVariables([
      {
        id: "triple",
        variableType: "number",
        computed: {
          expr: { add: [{ var: "variables.double" }, 1] },
        },
      },
      {
        id: "double",
        variableType: "number",
        computed: {
          expr: { add: [{ var: "variables.base" }, 1] },
        },
      },
      {
        id: "base",
        variableType: "number",
        scope: "context",
        default: 1,
        value: 1,
      },
    ]);

    expect(validateState({ state })).toEqual({ valid: true });
  });
});

describe("computed variable command lifecycle", () => {
  test("edits metadata and computed definitions while keeping source and type fixed", () => {
    const computedResult = processCommand({
      state: createEmptyTestState(),
      command: createComputedCommand({
        variableId: "scoreLabel",
        variableType: "string",
        computed: { expr: "Score" },
      }),
    });
    const updateCommand = {
      type: "variable.update",
      payload: {
        variableId: "scoreLabel",
        data: {
          name: "Current Score Label",
          description: "Derived label",
          computed: { expr: "Current score" },
        },
      },
    };

    expect(
      validateAgainstState({
        state: computedResult.state,
        command: updateCommand,
      }),
    ).toEqual({ valid: true });

    const updateResult = processCommand({
      state: computedResult.state,
      command: updateCommand,
    });
    expect(updateResult.state.variables.items.scoreLabel).toMatchObject({
      name: "Current Score Label",
      description: "Derived label",
      variableType: "string",
      computed: { expr: "Current score" },
    });
  });

  test("rejects stored-to-computed conversion", () => {
    const storedResult = createStoredVariable({
      state: createEmptyTestState(),
      variableId: "score",
      value: 0,
    });

    expectInvalid(
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
      "stored variables cannot be converted to computed variables",
    );
  });

  test.each([
    ["scope", "context"],
    ["default", "stored"],
    ["value", "stored"],
    ["isEnum", false],
    ["enumValues", []],
  ])("rejects computed updates to %s", (field, value) => {
    const computedResult = processCommand({
      state: createEmptyTestState(),
      command: createComputedCommand({
        variableId: "label",
        variableType: "string",
        computed: { expr: "ready" },
      }),
    });

    expectInvalid(
      validateAgainstState({
        state: computedResult.state,
        command: {
          type: "variable.update",
          payload: {
            variableId: "label",
            data: { [field]: value },
          },
        },
      }),
      "computed variables cannot update scope, stored value, or enum fields",
    );
  });

  test("rejects update formulas with unknown references or new cycles", () => {
    const state = createStateWithVariables([
      {
        id: "a",
        variableType: "number",
        computed: { expr: 1 },
      },
      {
        id: "b",
        variableType: "number",
        computed: { expr: { var: "variables.a" } },
      },
    ]);

    for (const computed of [
      { expr: { var: "variables.missing" } },
      { expr: { var: "variables.b" } },
    ]) {
      expectInvalid(
        validateAgainstState({
          state,
          command: {
            type: "variable.update",
            payload: {
              variableId: "a",
              data: { computed },
            },
          },
        }),
      );
    }
  });

  test("blocks deleting a referenced variable and allows deleting the dependency set", () => {
    const scoreResult = createStoredVariable({
      state: createEmptyTestState(),
      variableId: "score",
      value: 1,
    });
    const computedResult = processCommand({
      state: scoreResult.state,
      command: createComputedCommand({
        variableId: "doubleScore",
        computed: {
          expr: {
            add: [{ var: "variables.score" }, { var: "variables.score" }],
          },
        },
      }),
    });

    expectInvalid(
      validateAgainstState({
        state: computedResult.state,
        command: {
          type: "variable.delete",
          payload: { variableIds: ["score"] },
        },
      }),
    );

    expect(
      processCommand({
        state: computedResult.state,
        command: {
          type: "variable.delete",
          payload: { variableIds: ["score", "doubleScore"] },
        },
      }),
    ).toMatchObject({
      valid: true,
      state: {
        variables: {
          items: {},
          tree: [],
        },
      },
    });
  });
});

describe("state and payload invariants", () => {
  test("computed variables omit scope while stored variables require it", () => {
    expectInvalid(
      validatePayload(
        createComputedCommand({
          variableId: "scopedComputed",
          variableType: "string",
          scope: "context",
          computed: { expr: "temporary" },
        }),
      ),
      "payload.data.scope must be omitted for computed variables",
    );

    expectInvalid(
      validatePayload(
        createVariableCommand({
          variableId: "unscopedStored",
          variableType: "string",
          default: "stored",
          value: "stored",
        }),
      ),
    );
  });

  test("supports object stored values and requires object-shaped defaults", () => {
    expect(
      validatePayload(
        createVariableCommand({
          variableId: "profile",
          variableType: "object",
          scope: "context",
          default: { name: "Player" },
          value: { name: "Player" },
        }),
      ),
    ).toEqual({ valid: true });

    expectInvalid(
      validatePayload(
        createVariableCommand({
          variableId: "profile",
          variableType: "object",
          scope: "context",
          default: null,
          value: null,
        }),
      ),
    );
  });

  test.each(
    ["default", "value"].flatMap((field) => [
      [`${field} with a nested function`, field, { nested: () => true }],
      [
        `${field} with a nested symbol`,
        field,
        { nested: Symbol("unsupported") },
      ],
      [`${field} with a nested WeakMap`, field, { nested: new WeakMap() }],
    ]),
  )("rejects %s without throwing", (_description, field, malformedValue) => {
    expectPublicApisToReject(
      createVariableCommand({
        variableId: "payload",
        variableType: "object",
        scope: "context",
        default: { serializable: true },
        value: { serializable: true },
        [field]: malformedValue,
      }),
    );
  });

  test("rejects the reserved __proto__ variable ID in commands and state", () => {
    expectInvalid(
      validatePayload(
        createComputedCommand({
          variableId: "__proto__",
        }),
      ),
      "payload.variableId must not use reserved id '__proto__'",
    );

    const state = createEmptyTestState();
    state.variables.items = Object.fromEntries([
      [
        "__proto__",
        {
          id: "__proto__",
          type: "variable",
          variableType: "number",
          name: "Reserved",
          scope: "context",
          default: 0,
          value: 0,
        },
      ],
    ]);
    state.variables.tree = [{ id: "__proto__", children: [] }];
    expectInvalid(validateState({ state }));
  });
});
