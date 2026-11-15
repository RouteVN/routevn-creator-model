import { expect, test } from "vitest";

import {
  processCommand,
  validateAgainstState,
  validatePayload,
  validateState,
} from "../src/index.js";
import { createEmptyTestState } from "./support/createEmptyTestState.js";

const createState = () => {
  const state = createEmptyTestState();
  for (const id of [
    "file-sheet",
    "file-sheet-rebuilt",
    "file-frame-a",
    "file-frame-b",
    "file-frame-c",
  ]) {
    state.files.items[id] = {
      id,
      type: "image",
      mimeType: "image/png",
      size: 1,
      sha256: `${id}-sha256`,
    };
    state.files.tree.push({ id, children: [] });
  }
  state.files.items["folder-frames"] = {
    id: "folder-frames",
    type: "folder",
    name: "Frames",
  };
  state.files.tree.push({ id: "folder-frames", children: [] });
  state.spritesheets.items["folder-sheets"] = {
    id: "folder-sheets",
    type: "folder",
    name: "Sheets",
  };
  state.spritesheets.tree.push({ id: "folder-sheets", children: [] });
  return state;
};

const createFrameSource = () => ({
  frameWidth: 64,
  frameHeight: 32,
  frames: [
    { fileId: "file-frame-a" },
    { fileId: "file-frame-b" },
    { fileId: "file-frame-c" },
    { fileId: "file-frame-b" },
  ],
});

const createCommand = (data = {}) => ({
  type: "spritesheet.create",
  payload: {
    spritesheetId: "sheet-one",
    data: {
      type: "spritesheet",
      name: "Sheet One",
      fileId: "file-sheet",
      jsonData: { meta: { image: "sheet.png" } },
      animations: { walk: { frames: [0, 1, 2, 3], fps: 12 } },
      frameSource: createFrameSource(),
      ...data,
    },
  },
});

const updateCommand = (data, spritesheetId = "sheet-one") => ({
  type: "spritesheet.update",
  payload: { spritesheetId, data },
});

const apply = (state, command) => {
  const before = structuredClone(state);
  const result = processCommand({ state, command });
  expect(result.valid).toBe(true);
  expect(state).toEqual(before);
  return result.state;
};

const createSheetState = () => apply(createState(), createCommand());

const expectInvalid = (result, kind, message) => {
  expect(result.valid).toBe(false);
  expect(result.error.kind).toBe(kind);
  expect(result.error.message).toBe(message);
};

test("spritesheet.create stores a copy of frameSource and allows repeated pictures", () => {
  const command = createCommand();
  const state = apply(createState(), command);

  expect(state.spritesheets.items["sheet-one"]).toEqual({
    id: "sheet-one",
    type: "spritesheet",
    name: "Sheet One",
    fileId: "file-sheet",
    jsonData: { meta: { image: "sheet.png" } },
    animations: { walk: { frames: [0, 1, 2, 3], fps: 12 } },
    frameSource: createFrameSource(),
  });

  command.payload.data.frameSource.frames[0].fileId = "file-frame-c";
  expect(
    state.spritesheets.items["sheet-one"].frameSource.frames[0].fileId,
  ).toBe("file-frame-a");
});

test("spritesheet.create without frameSource stores no frameSource", () => {
  const command = createCommand();
  delete command.payload.data.frameSource;
  const state = apply(createState(), command);

  expect(state.spritesheets.items["sheet-one"]).not.toHaveProperty(
    "frameSource",
  );
});

test.each([
  ["not an object", "frames", "payload.data.frameSource must be an object"],
  [
    "an unknown key",
    { ...createFrameSource(), scale: 2 },
    "payload.data.frameSource.scale is not allowed",
  ],
  [
    "a missing frameWidth",
    { frameHeight: 32, frames: [{ fileId: "file-frame-a" }] },
    "payload.data.frameSource.frameWidth must be an integer greater than or equal to 1",
  ],
  [
    "a zero frameWidth",
    { ...createFrameSource(), frameWidth: 0 },
    "payload.data.frameSource.frameWidth must be an integer greater than or equal to 1",
  ],
  [
    "a fractional frameHeight",
    { ...createFrameSource(), frameHeight: 1.5 },
    "payload.data.frameSource.frameHeight must be an integer greater than or equal to 1",
  ],
  [
    "a string frameHeight",
    { ...createFrameSource(), frameHeight: "32" },
    "payload.data.frameSource.frameHeight must be an integer greater than or equal to 1",
  ],
  [
    "missing frames",
    { frameWidth: 64, frameHeight: 32 },
    "payload.data.frameSource.frames must be a non-empty array",
  ],
  [
    "empty frames",
    { ...createFrameSource(), frames: [] },
    "payload.data.frameSource.frames must be a non-empty array",
  ],
  [
    "a frame that is not an object",
    { ...createFrameSource(), frames: ["file-frame-a"] },
    "payload.data.frameSource.frames.0 must be an object",
  ],
  [
    "a frame with an unknown key",
    {
      ...createFrameSource(),
      frames: [{ fileId: "file-frame-a" }, { fileId: "file-frame-b", x: 0 }],
    },
    "payload.data.frameSource.frames.1.x is not allowed",
  ],
  [
    "a frame without a fileId",
    { ...createFrameSource(), frames: [{}] },
    "payload.data.frameSource.frames.0.fileId must be a non-empty string",
  ],
  [
    "a frame with an empty fileId",
    { ...createFrameSource(), frames: [{ fileId: "" }] },
    "payload.data.frameSource.frames.0.fileId must be a non-empty string",
  ],
])(
  "spritesheet.create rejects frameSource with %s",
  (_, frameSource, message) => {
    expectInvalid(
      validatePayload(createCommand({ frameSource })),
      "payload",
      message,
    );
  },
);

test("spritesheet.create rejects frameSource on folders", () => {
  expectInvalid(
    validatePayload({
      type: "spritesheet.create",
      payload: {
        spritesheetId: "folder-two",
        data: {
          type: "folder",
          name: "Folder Two",
          frameSource: createFrameSource(),
        },
      },
    }),
    "payload",
    "payload.data.frameSource is not allowed",
  );
});

test("spritesheet.update accepts frameSource as an object or null", () => {
  for (const frameSource of [createFrameSource(), null]) {
    expect(validatePayload(updateCommand({ frameSource }))).toEqual({
      valid: true,
    });
  }
});

test.each([
  ["a string", "frames", "payload.data.frameSource must be an object or null"],
  ["an array", [], "payload.data.frameSource must be an object or null"],
  [
    "empty frames",
    { ...createFrameSource(), frames: [] },
    "payload.data.frameSource.frames must be a non-empty array",
  ],
  [
    "a frame with an unknown key",
    { ...createFrameSource(), frames: [{ fileId: "file-frame-a", id: "a" }] },
    "payload.data.frameSource.frames.0.id is not allowed",
  ],
])(
  "spritesheet.update rejects frameSource as %s",
  (_, frameSource, message) => {
    expectInvalid(
      validatePayload(updateCommand({ frameSource })),
      "payload",
      message,
    );
  },
);

test.each(["file-missing", "folder-frames"])(
  "spritesheet.create rejects a frame picture %s that is not a file",
  (fileId) => {
    const frameSource = createFrameSource();
    frameSource.frames[1].fileId = fileId;
    const command = createCommand({ frameSource });

    for (const result of [
      validateAgainstState({ state: createState(), command }),
      processCommand({ state: createState(), command }),
    ]) {
      expectInvalid(
        result,
        "precondition",
        "payload.data.frameSource.frames.1.fileId must reference an existing non-folder file",
      );
      expect(result.error.details).toMatchObject({
        spritesheetId: "sheet-one",
        frameIndex: 1,
        fileId,
      });
    }
  },
);

test("spritesheet.create rejects animation frames that have no picture", () => {
  const command = createCommand({
    animations: {
      idle: { frames: [0] },
      walk: { frames: [0, 1, 4] },
    },
  });

  const result = validateAgainstState({ state: createState(), command });
  expectInvalid(
    result,
    "precondition",
    "payload.data.animations.walk.frames.2 must be less than the payload.data.frameSource.frames length",
  );
  expect(result.error.details).toEqual({
    spritesheetId: "sheet-one",
    animationName: "walk",
    index: 2,
    frame: 4,
    frameCount: 4,
  });

  expect(processCommand({ state: createState(), command }).valid).toBe(false);
});

test("spritesheet.create does not limit animation frames without frameSource", () => {
  const command = createCommand({ animations: { walk: { frames: [9] } } });
  delete command.payload.data.frameSource;

  expect(processCommand({ state: createState(), command }).valid).toBe(true);
});

test("spritesheet.update replaces frameSource with a copy", () => {
  const frameSource = {
    frameWidth: 32,
    frameHeight: 32,
    frames: [
      { fileId: "file-frame-c" },
      { fileId: "file-frame-b" },
      { fileId: "file-frame-a" },
      { fileId: "file-frame-a" },
    ],
  };
  const command = updateCommand({ frameSource });
  const state = apply(createSheetState(), command);

  expect(state.spritesheets.items["sheet-one"]).toEqual({
    id: "sheet-one",
    type: "spritesheet",
    name: "Sheet One",
    fileId: "file-sheet",
    jsonData: { meta: { image: "sheet.png" } },
    animations: { walk: { frames: [0, 1, 2, 3], fps: 12 } },
    frameSource: structuredClone(frameSource),
  });

  frameSource.frames.length = 1;
  expect(state.spritesheets.items["sheet-one"].frameSource.frames).toHaveLength(
    4,
  );
});

test("spritesheet.update rejects a frame picture that is not a file", () => {
  const frameSource = createFrameSource();
  frameSource.frames[3].fileId = "file-missing";
  const result = validateAgainstState({
    state: createSheetState(),
    command: updateCommand({ frameSource }),
  });

  expectInvalid(
    result,
    "precondition",
    "payload.data.frameSource.frames.3.fileId must reference an existing non-folder file",
  );
});

test.each([
  ["fileId", { fileId: "file-sheet-rebuilt" }],
  ["jsonData", { jsonData: { meta: { image: "rebuilt.png" } } }],
  [
    "fileId and jsonData",
    {
      fileId: "file-sheet-rebuilt",
      jsonData: { meta: { image: "rebuilt.png" } },
    },
  ],
])(
  "spritesheet.update rejects a new %s without frameSource on a spritesheet with frameSource",
  (_, data) => {
    const command = updateCommand(data);

    for (const result of [
      validateAgainstState({ state: createSheetState(), command }),
      processCommand({ state: createSheetState(), command }),
    ]) {
      expectInvalid(
        result,
        "precondition",
        "payload.data.frameSource must be provided, or null to clear it, when payload.data.fileId or payload.data.jsonData changes a spritesheet that has frameSource",
      );
      expect(result.error.details).toEqual({ spritesheetId: "sheet-one" });
    }
  },
);

test("spritesheet.update accepts a new sheet file and atlas with their frames", () => {
  const frameSource = createFrameSource();
  frameSource.frames.push({ fileId: "file-frame-c" });
  const state = apply(
    createSheetState(),
    updateCommand({
      fileId: "file-sheet-rebuilt",
      jsonData: { meta: { image: "rebuilt.png" } },
      animations: { walk: { frames: [0, 1, 2, 3, 4] } },
      frameSource,
    }),
  );

  expect(state.spritesheets.items["sheet-one"]).toMatchObject({
    fileId: "file-sheet-rebuilt",
    jsonData: { meta: { image: "rebuilt.png" } },
    animations: { walk: { frames: [0, 1, 2, 3, 4] } },
    frameSource,
  });
});

test("spritesheet.update changes the sheet file freely on a spritesheet without frameSource", () => {
  const command = createCommand();
  delete command.payload.data.frameSource;
  const state = apply(createState(), command);

  expect(
    processCommand({
      state,
      command: updateCommand({ fileId: "file-sheet-rebuilt" }),
    }).valid,
  ).toBe(true);
});

test("spritesheet.update rejects frames that would leave animation frames without a picture", () => {
  const state = createSheetState();
  const fewerFrames = {
    ...createFrameSource(),
    frames: [{ fileId: "file-frame-a" }, { fileId: "file-frame-b" }],
  };

  expectInvalid(
    validateAgainstState({
      state,
      command: updateCommand({ frameSource: fewerFrames }),
    }),
    "precondition",
    "spritesheet.animations.walk.frames.2 must be less than the payload.data.frameSource.frames length",
  );

  expectInvalid(
    validateAgainstState({
      state,
      command: updateCommand({ animations: { walk: { frames: [4] } } }),
    }),
    "precondition",
    "payload.data.animations.walk.frames.0 must be less than the spritesheet.frameSource.frames length",
  );

  expectInvalid(
    validateAgainstState({
      state,
      command: updateCommand({
        animations: { walk: { frames: [0, 2] } },
        frameSource: fewerFrames,
      }),
    }),
    "precondition",
    "payload.data.animations.walk.frames.1 must be less than the payload.data.frameSource.frames length",
  );

  expect(
    processCommand({
      state,
      command: updateCommand({
        animations: { walk: { frames: [0, 1] } },
        frameSource: fewerFrames,
      }),
    }).valid,
  ).toBe(true);
});

test("spritesheet.update stops limiting animation frames once frameSource is cleared", () => {
  const state = apply(
    createSheetState(),
    updateCommand({
      animations: { walk: { frames: [0, 9] } },
      frameSource: null,
    }),
  );

  expect(state.spritesheets.items["sheet-one"]).not.toHaveProperty(
    "frameSource",
  );
  expect(state.spritesheets.items["sheet-one"].animations).toEqual({
    walk: { frames: [0, 9] },
  });
});

test("folder spritesheet items cannot update frameSource", () => {
  for (const frameSource of [createFrameSource(), null]) {
    expectInvalid(
      validateAgainstState({
        state: createState(),
        command: updateCommand({ frameSource }, "folder-sheets"),
      }),
      "precondition",
      "folder spritesheet items cannot update spritesheet fields",
    );
  }
});

test("a file used only as a frame picture cannot be deleted until frameSource stops using it", () => {
  const state = createSheetState();

  for (const fileIds of [["file-frame-c"], ["file-frame-b"]]) {
    const result = processCommand({
      state,
      command: { type: "file.delete", payload: { fileIds } },
    });
    expectInvalid(
      result,
      "precondition",
      "payload.fileIds cannot delete a referenced file",
    );
    expect(result.error.details).toEqual({
      fileId: fileIds[0],
      referenceKind: "spritesheet",
      referenceField: "frameSource.frames",
      referenceOwnerId: "sheet-one",
    });
  }

  const withoutFrameC = apply(
    state,
    updateCommand({
      frameSource: {
        ...createFrameSource(),
        frames: [
          { fileId: "file-frame-a" },
          { fileId: "file-frame-b" },
          { fileId: "file-frame-a" },
          { fileId: "file-frame-b" },
        ],
      },
    }),
  );
  const deleted = apply(withoutFrameC, {
    type: "file.delete",
    payload: { fileIds: ["file-frame-c"] },
  });
  expect(deleted.files.items).not.toHaveProperty("file-frame-c");
});

test("a file folder holding a frame picture cannot be deleted", () => {
  const state = createState();
  state.files.tree = state.files.tree.filter(
    (node) => node.id !== "file-frame-c" && node.id !== "folder-frames",
  );
  state.files.tree.push({
    id: "folder-frames",
    children: [{ id: "file-frame-c", children: [] }],
  });
  const withSheet = apply(state, createCommand());

  const result = processCommand({
    state: withSheet,
    command: { type: "file.delete", payload: { fileIds: ["folder-frames"] } },
  });
  expectInvalid(
    result,
    "precondition",
    "payload.fileIds cannot delete a referenced file",
  );
  expect(result.error.details).toMatchObject({
    fileId: "file-frame-c",
    referenceField: "frameSource.frames",
  });
});

test("validateState accepts a spritesheet with frameSource", () => {
  expect(validateState({ state: createSheetState() })).toEqual({
    valid: true,
  });
});

test.each([
  [
    "an unknown key",
    (sheet) => {
      sheet.frameSource.scale = 2;
    },
    "state.spritesheets.items.sheet-one.frameSource.scale is not allowed",
  ],
  [
    "a non-integer frameWidth",
    (sheet) => {
      sheet.frameSource.frameWidth = 2.5;
    },
    "state.spritesheets.items.sheet-one.frameSource.frameWidth must be an integer greater than or equal to 1",
  ],
  [
    "empty frames",
    (sheet) => {
      sheet.frameSource.frames = [];
    },
    "state.spritesheets.items.sheet-one.frameSource.frames must be a non-empty array",
  ],
  [
    "a frame with an unknown key",
    (sheet) => {
      sheet.frameSource.frames[2].duration = 100;
    },
    "state.spritesheets.items.sheet-one.frameSource.frames.2.duration is not allowed",
  ],
  [
    "null",
    (sheet) => {
      sheet.frameSource = null;
    },
    "state.spritesheets.items.sheet-one.frameSource must be an object",
  ],
])("validateState rejects frameSource with %s", (_, change, message) => {
  const state = createSheetState();
  change(state.spritesheets.items["sheet-one"]);

  expectInvalid(validateState({ state }), "state", message);
});

test("validateState rejects frameSource on spritesheet folders", () => {
  const state = createState();
  state.spritesheets.items["folder-sheets"].frameSource = createFrameSource();

  expectInvalid(
    validateState({ state }),
    "state",
    "state.spritesheets.items.folder-sheets.frameSource is not allowed",
  );
});

test.each(["file-missing", "folder-frames"])(
  "validateState rejects a frame picture %s that is not a file",
  (fileId) => {
    const state = createSheetState();
    state.spritesheets.items["sheet-one"].frameSource.frames[2].fileId = fileId;

    const result = validateState({ state });
    expectInvalid(
      result,
      "invariant",
      "spritesheet.frameSource.frames.fileId must reference an existing non-folder file",
    );
    expect(result.error.details).toEqual({
      spritesheetId: "sheet-one",
      frameIndex: 2,
      fileId,
    });
  },
);

test("validateState rejects animation frames that have no picture in frameSource", () => {
  const state = createSheetState();
  state.spritesheets.items["sheet-one"].animations.idle = { frames: [3, 4] };

  const result = validateState({ state });
  expectInvalid(
    result,
    "invariant",
    "spritesheet.animations frames must be less than the spritesheet.frameSource.frames length",
  );
  expect(result.error.details).toEqual({
    spritesheetId: "sheet-one",
    animationName: "idle",
    index: 1,
    frame: 4,
    frameCount: 4,
  });
});

const emptyCommand = (data = {}) => ({
  type: "spritesheet.create",
  payload: {
    spritesheetId: "sheet-empty",
    data: {
      type: "spritesheet",
      name: "Sheet Empty",
      jsonData: {},
      animations: {},
      ...data,
    },
  },
});

const createEmptySheetState = () => apply(createState(), emptyCommand());

test("spritesheet.create makes an empty spritesheet without a sheet file", () => {
  const state = createEmptySheetState();

  expect(state.spritesheets.items["sheet-empty"]).toEqual({
    id: "sheet-empty",
    type: "spritesheet",
    name: "Sheet Empty",
    jsonData: {},
    animations: {},
  });
  expect(state.spritesheets.items["sheet-empty"]).not.toHaveProperty("fileId");
  expect(validateState({ state })).toEqual({ valid: true });
});

test.each([
  ["an empty string", ""],
  ["null", null],
  ["a number", 7],
])("spritesheet.create rejects a fileId that is %s", (_, fileId) => {
  expectInvalid(
    validatePayload(emptyCommand({ fileId })),
    "payload",
    "payload.data.fileId must be a non-empty string when provided",
  );
});

test.each(["jsonData", "animations"])(
  "spritesheet.create still requires %s on an empty spritesheet",
  (key) => {
    const command = emptyCommand();
    delete command.payload.data[key];

    expectInvalid(
      validatePayload(command),
      "payload",
      `payload.data.${key} must be an object`,
    );
  },
);

test("spritesheet.create rejects a sheet file that is not a file", () => {
  const result = validateAgainstState({
    state: createState(),
    command: emptyCommand({ fileId: "file-missing" }),
  });

  expectInvalid(
    result,
    "precondition",
    "payload.data.fileId must reference an existing non-folder file",
  );
});

test("spritesheet.update adds the sheet file, atlas, and frames to an empty spritesheet", () => {
  const command = updateCommand(
    {
      fileId: "file-sheet",
      sheetWidth: 256,
      sheetHeight: 32,
      frameCount: 4,
      jsonData: { meta: { image: "sheet.png" } },
      animations: { walk: { frames: [0, 1, 2, 3], fps: 12 } },
      frameSource: createFrameSource(),
    },
    "sheet-empty",
  );
  const state = apply(createEmptySheetState(), command);

  expect(state.spritesheets.items["sheet-empty"]).toEqual({
    id: "sheet-empty",
    type: "spritesheet",
    name: "Sheet Empty",
    fileId: "file-sheet",
    sheetWidth: 256,
    sheetHeight: 32,
    frameCount: 4,
    jsonData: { meta: { image: "sheet.png" } },
    animations: { walk: { frames: [0, 1, 2, 3], fps: 12 } },
    frameSource: createFrameSource(),
  });
  expect(validateState({ state })).toEqual({ valid: true });
});

test("spritesheet.update keeps an empty spritesheet empty when it changes other fields", () => {
  const state = apply(
    createEmptySheetState(),
    updateCommand(
      { name: "Renamed", description: "No frames yet" },
      "sheet-empty",
    ),
  );

  expect(state.spritesheets.items["sheet-empty"]).toEqual({
    id: "sheet-empty",
    type: "spritesheet",
    name: "Renamed",
    description: "No frames yet",
    jsonData: {},
    animations: {},
  });
});

test("spritesheet.update checks frames added to an empty spritesheet", () => {
  const state = createEmptySheetState();
  const frameSource = createFrameSource();
  frameSource.frames[0].fileId = "file-missing";

  expectInvalid(
    validateAgainstState({
      state,
      command: updateCommand(
        {
          fileId: "file-sheet",
          jsonData: { meta: { image: "sheet.png" } },
          animations: { walk: { frames: [0] } },
          frameSource,
        },
        "sheet-empty",
      ),
    }),
    "precondition",
    "payload.data.frameSource.frames.0.fileId must reference an existing non-folder file",
  );

  expectInvalid(
    validateAgainstState({
      state,
      command: updateCommand(
        {
          fileId: "file-sheet",
          jsonData: { meta: { image: "sheet.png" } },
          animations: { walk: { frames: [0, 4] } },
          frameSource: createFrameSource(),
        },
        "sheet-empty",
      ),
    }),
    "precondition",
    "payload.data.animations.walk.frames.1 must be less than the payload.data.frameSource.frames length",
  );

  expectInvalid(
    validateAgainstState({
      state,
      command: updateCommand({ fileId: "file-missing" }, "sheet-empty"),
    }),
    "precondition",
    "payload.data.fileId must reference an existing non-folder file",
  );
});

test.each([
  ["an empty string", ""],
  ["null", null],
])("spritesheet.update rejects a fileId that is %s", (_, fileId) => {
  expectInvalid(
    validatePayload(updateCommand({ fileId }, "sheet-empty")),
    "payload",
    "payload.data.fileId must be a non-empty string when provided",
  );
});

test("file.delete is unaffected by an empty spritesheet", () => {
  const state = createEmptySheetState();

  const deleted = apply(state, {
    type: "file.delete",
    payload: { fileIds: ["file-sheet", "file-frame-a"] },
  });
  expect(deleted.files.items).not.toHaveProperty("file-sheet");
  expect(deleted.files.items).not.toHaveProperty("file-frame-a");
  expect(deleted.spritesheets.items["sheet-empty"]).not.toHaveProperty(
    "fileId",
  );

  const filled = apply(
    state,
    updateCommand({ fileId: "file-sheet" }, "sheet-empty"),
  );
  const result = processCommand({
    state: filled,
    command: { type: "file.delete", payload: { fileIds: ["file-sheet"] } },
  });
  expectInvalid(
    result,
    "precondition",
    "payload.fileIds cannot delete a referenced file",
  );
  expect(result.error.details).toEqual({
    fileId: "file-sheet",
    referenceKind: "spritesheet",
    referenceField: "fileId",
    referenceOwnerId: "sheet-empty",
  });
});

test("validateState still checks a spritesheet fileId when present", () => {
  const state = createEmptySheetState();

  state.spritesheets.items["sheet-empty"].fileId = "";
  expectInvalid(
    validateState({ state }),
    "state",
    "state.spritesheets.items.sheet-empty.fileId must be a non-empty string when provided",
  );

  state.spritesheets.items["sheet-empty"].fileId = "file-missing";
  const result = validateState({ state });
  expectInvalid(
    result,
    "invariant",
    "spritesheet.fileId must reference an existing non-folder file",
  );
  expect(result.error.details).toEqual({
    spritesheetId: "sheet-empty",
    fileId: "file-missing",
  });
});
