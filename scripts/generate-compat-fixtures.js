import { mkdir, rm, writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { SCHEMA_VERSION } from "../src/index.js";
import { createEmptyTestState } from "../tests/support/createEmptyTestState.js";

const COMPAT_SCHEMA_ROOT = new URL(
  `../tests/compat/schema-${SCHEMA_VERSION}/`,
  import.meta.url,
);

const clone = (value) => structuredClone(value);

const createTreeNode = (id, children = []) => ({ id, children });

const createEmptyNestedCollection = () => ({
  items: {},
  tree: [],
});

const createLayoutElementBlur = () => ({
  x: 6,
  y: 9,
  quality: 3,
  kernelSize: 9,
  repeatEdgePixels: true,
});

const createChoiceSingleItemElementData = ({ choiceItemIndex = 0 } = {}) => ({
  type: "container-ref-choice-single-item",
  name: "Choice Single Item",
  x: 0,
  y: 0,
  anchorX: 0,
  anchorY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  direction: "absolute",
  choiceItemIndex,
  click: {
    inheritToChildren: true,
  },
});

const createFileItem = ({
  id,
  type = "image",
  mimeType = "application/octet-stream",
  size = 1,
  sha256,
}) => {
  if (type === "folder") {
    return {
      id,
      type: "folder",
      name: id,
    };
  }

  return {
    id,
    type,
    mimeType,
    size,
    sha256: sha256 ?? `${id}-sha256`,
  };
};

const withFiles = (state, files) => {
  for (const file of files) {
    state.files.items[file.id] = createFileItem(file);
    state.files.tree.push(createTreeNode(file.id));
  }
  return state;
};

const withFontAndColorRefs = (state) => {
  withFiles(state, [
    { id: "file-font-ui", type: "font", mimeType: "font/ttf" },
  ]);
  state.fonts.items["font-ui"] = {
    id: "font-ui",
    type: "font",
    name: "UI Font",
    fileId: "file-font-ui",
    fontFamily: "Suit",
  };
  state.fonts.tree = [createTreeNode("font-ui")];
  state.colors.items["color-ui"] = {
    id: "color-ui",
    type: "color",
    name: "White",
    hex: "#ffffff",
  };
  state.colors.tree = [createTreeNode("color-ui")];
  return state;
};

const withTextStyleRefs = (state) => {
  withFontAndColorRefs(state);
  state.textStyles.items["text-style-ui"] = {
    id: "text-style-ui",
    type: "textStyle",
    name: "UI Style",
    fontId: "font-ui",
    colorId: "color-ui",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.tree = [createTreeNode("text-style-ui")];
  return state;
};

const withSpritesheetRefs = (state) => {
  withFiles(state, [
    { id: "file-spritesheet-ui", type: "image", mimeType: "image/png" },
    {
      id: "thumb-spritesheet-ui",
      type: "image-thumbnail",
      mimeType: "image/webp",
    },
  ]);
  state.spritesheets.items["spritesheet-ui"] = {
    id: "spritesheet-ui",
    type: "spritesheet",
    name: "UI Spritesheet",
    fileId: "file-spritesheet-ui",
    thumbnailFileId: "thumb-spritesheet-ui",
    sheetWidth: 512,
    sheetHeight: 256,
    frameCount: 2,
    width: 256,
    height: 256,
    jsonData: {
      meta: {
        image: "ui-spritesheet.png",
      },
    },
    animations: {
      idle: {
        frames: [0, 1],
        animationSpeed: 1,
        loop: true,
      },
    },
  };
  state.spritesheets.tree = [createTreeNode("spritesheet-ui")];
  return state;
};

const createSceneBaseState = () => {
  const state = createEmptyTestState();
  state.story.initialSceneId = "scene-a";
  state.scenes.items = {
    "scene-a": {
      id: "scene-a",
      type: "scene",
      name: "Intro",
      sections: createEmptyNestedCollection(),
    },
    "folder-scenes": {
      id: "folder-scenes",
      type: "folder",
      name: "Folder",
    },
    "scene-b": {
      id: "scene-b",
      type: "scene",
      name: "Middle",
      sections: createEmptyNestedCollection(),
    },
  };
  state.scenes.tree = [
    createTreeNode("scene-a"),
    createTreeNode("folder-scenes", [createTreeNode("scene-b")]),
  ];
  return state;
};

const createSectionBaseState = () => {
  const state = createSceneBaseState();
  state.scenes.items["scene-a"].sections = {
    items: {
      "section-a": {
        id: "section-a",
        name: "Section A",
        lines: createEmptyNestedCollection(),
      },
      "section-b": {
        id: "section-b",
        name: "Section B",
        lines: createEmptyNestedCollection(),
      },
    },
    tree: [createTreeNode("section-a"), createTreeNode("section-b")],
  };
  state.scenes.items["scene-b"].sections = {
    items: {
      "section-other": {
        id: "section-other",
        name: "Other",
        lines: createEmptyNestedCollection(),
      },
    },
    tree: [createTreeNode("section-other")],
  };
  return state;
};

const createLineBaseState = () => {
  const state = createSectionBaseState();
  state.scenes.items["scene-a"].sections.items["section-a"].lines = {
    items: {
      "line-a": {
        id: "line-a",
        actions: {
          say: "hello",
        },
      },
      "line-b": {
        id: "line-b",
        actions: {
          say: "bye",
        },
      },
    },
    tree: [createTreeNode("line-a"), createTreeNode("line-b")],
  };
  state.scenes.items["scene-a"].sections.items["section-b"].lines = {
    items: {
      "line-other": {
        id: "line-other",
        actions: {
          say: "other",
        },
      },
    },
    tree: [createTreeNode("line-other")],
  };
  return state;
};

const createCharacterBaseState = () => {
  const state = createEmptyTestState();
  withFiles(state, [
    { id: "file-smile", type: "image", mimeType: "image/png" },
    { id: "file-angry", type: "image", mimeType: "image/png" },
  ]);
  state.characters.items["character-hero"] = {
    id: "character-hero",
    type: "character",
    name: "Hero",
    sprites: {
      items: {
        "folder-default": {
          id: "folder-default",
          type: "folder",
          name: "Default",
        },
        "sprite-a": {
          id: "sprite-a",
          type: "image",
          name: "Smile",
          fileId: "file-smile",
        },
        "sprite-b": {
          id: "sprite-b",
          type: "image",
          name: "Angry",
          fileId: "file-angry",
        },
      },
      tree: [
        createTreeNode("folder-default", [createTreeNode("sprite-a")]),
        createTreeNode("sprite-b"),
      ],
    },
  };
  state.characters.tree = [createTreeNode("character-hero")];
  return state;
};

const createLayoutBaseState = () => {
  const state = withSpritesheetRefs(withTextStyleRefs(createEmptyTestState()));
  state.layouts.items["layout-dialogue"] = {
    id: "layout-dialogue",
    type: "layout",
    name: "Dialogue",
    description: "Main dialogue frame",
    layoutType: "dialogue-adv",
    thumbnailFileId: "thumb-spritesheet-ui",
    preview: {
      backgroundImageId: "image-preview-layout",
      runtime: {
        autoMode: true,
      },
    },
    elements: {
      items: {
        "container-root": {
          id: "container-root",
          type: "container",
          name: "Root",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          gapX: 16,
          gapY: 12,
          scrollUp: {
            inheritToChildren: true,
            payload: {
              actions: {
                nextLine: {},
              },
            },
          },
          scrollDown: {
            payload: {
              actions: {
                toggleDialogueUI: {},
              },
            },
          },
        },
        "text-a": {
          id: "text-a",
          type: "text",
          name: "Title",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "text-style-ui",
        },
        "text-b": {
          id: "text-b",
          type: "text",
          name: "Subtitle",
          x: 0,
          y: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "World",
          textStyleId: "text-style-ui",
        },
        "sprite-blur": {
          id: "sprite-blur",
          type: "sprite",
          name: "Blurred Sprite",
          x: 0,
          y: 60,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          blur: createLayoutElementBlur(),
        },
        "choice-single-item": {
          id: "choice-single-item",
          ...createChoiceSingleItemElementData(),
        },
      },
      tree: [
        createTreeNode("container-root", [
          createTreeNode("text-a"),
          createTreeNode("text-b"),
          createTreeNode("sprite-blur"),
          createTreeNode("choice-single-item"),
        ]),
      ],
    },
  };
  state.layouts.tree = [createTreeNode("layout-dialogue")];
  return state;
};

const createControlBaseState = () => {
  const state = withSpritesheetRefs(withTextStyleRefs(createEmptyTestState()));
  state.controls.items["control-default"] = {
    id: "control-default",
    type: "control",
    name: "Default Control",
    description: "Shared navigation control",
    thumbnailFileId: "thumb-spritesheet-ui",
    preview: {
      choice: {
        items: [{ content: "Continue" }],
      },
    },
    keyboard: {
      enter: {
        payload: {
          actions: {
            nextLine: {},
          },
        },
      },
    },
    keyup: {
      enter: {
        payload: {
          actions: {
            toggleAutoMode: {},
          },
        },
      },
    },
    elements: {
      items: {
        "container-root": {
          id: "container-root",
          type: "container",
          name: "Root",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          gapX: 16,
          gapY: 12,
          scrollUp: {
            payload: {
              actions: {
                nextLine: {},
              },
            },
          },
          scrollDown: {
            inheritToChildren: true,
            payload: {
              actions: {
                toggleSkipMode: {},
              },
            },
          },
        },
        "text-a": {
          id: "text-a",
          type: "text",
          name: "Title",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "text-style-ui",
        },
        "text-b": {
          id: "text-b",
          type: "text",
          name: "Subtitle",
          x: 0,
          y: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "World",
          textStyleId: "text-style-ui",
        },
        "sprite-blur": {
          id: "sprite-blur",
          type: "sprite",
          name: "Blurred Sprite",
          x: 0,
          y: 60,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          blur: createLayoutElementBlur(),
        },
        "choice-single-item": {
          id: "choice-single-item",
          ...createChoiceSingleItemElementData(),
        },
      },
      tree: [
        createTreeNode("container-root", [
          createTreeNode("text-a"),
          createTreeNode("text-b"),
          createTreeNode("sprite-blur"),
          createTreeNode("choice-single-item"),
        ]),
      ],
    },
  };
  state.controls.tree = [createTreeNode("control-default")];
  return state;
};

const mergeCollections = (targetState, sourceState, collectionKey) => {
  targetState[collectionKey] = clone(sourceState[collectionKey]);
};

const createSparseCompatibilityState = () => {
  const state = createEmptyTestState();
  state.project = {
    resolution: {
      width: 1280,
      height: 720,
    },
  };
  state.story.initialSceneId = "scene-main";
  state.scenes.items["scene-main"] = {
    id: "scene-main",
    type: "scene",
    name: "Main",
    sections: createEmptyNestedCollection(),
  };
  state.scenes.tree = [createTreeNode("scene-main")];
  withFiles(state, [
    { id: "file-image", type: "image", mimeType: "image/png" },
    {
      id: "file-spritesheet",
      type: "image",
      mimeType: "image/png",
      size: 1024,
    },
    {
      id: "thumb-spritesheet",
      type: "image-thumbnail",
      mimeType: "image/webp",
      size: 64,
    },
    { id: "file-sound", type: "audio", mimeType: "audio/mpeg" },
    { id: "file-video", type: "video", mimeType: "video/mp4" },
    { id: "thumb-video", type: "video-thumbnail", mimeType: "image/jpeg" },
    { id: "file-font", type: "font", mimeType: "font/ttf" },
  ]);
  state.images.items["image-main"] = {
    id: "image-main",
    type: "image",
    name: "Main Image",
    fileId: "file-image",
  };
  state.images.tree = [createTreeNode("image-main")];
  state.spritesheets.items["spritesheet-main"] = {
    id: "spritesheet-main",
    type: "spritesheet",
    name: "Main Spritesheet",
    fileId: "file-spritesheet",
    thumbnailFileId: "thumb-spritesheet",
    sheetWidth: 512,
    sheetHeight: 256,
    frameCount: 2,
    width: 256,
    height: 256,
    jsonData: {
      meta: {
        image: "main-spritesheet.png",
      },
    },
    animations: {
      default: {
        frames: [0, 1],
        animationSpeed: 1,
        loop: true,
      },
    },
  };
  state.spritesheets.tree = [createTreeNode("spritesheet-main")];
  state.sounds.items["sound-main"] = {
    id: "sound-main",
    type: "sound",
    name: "Main Sound",
    fileId: "file-sound",
  };
  state.sounds.tree = [createTreeNode("sound-main")];
  state.videos.items["video-main"] = {
    id: "video-main",
    type: "video",
    name: "Main Video",
    fileId: "file-video",
    thumbnailFileId: "thumb-video",
  };
  state.videos.tree = [createTreeNode("video-main")];
  state.animations.items["animation-main"] = {
    id: "animation-main",
    type: "animation",
    name: "Main Animation",
    animation: {
      type: "update",
      tween: {
        x: {
          auto: {
            duration: 1000,
            easing: "linear",
          },
        },
      },
    },
  };
  state.animations.tree = [createTreeNode("animation-main")];
  state.fonts.items["font-main"] = {
    id: "font-main",
    type: "font",
    name: "Main Font",
    fileId: "file-font",
    fontFamily: "Suit",
  };
  state.fonts.tree = [createTreeNode("font-main")];
  state.colors.items["color-main"] = {
    id: "color-main",
    type: "color",
    name: "Main Color",
    hex: "#112233",
  };
  state.colors.tree = [createTreeNode("color-main")];
  state.transforms.items["transform-main"] = {
    id: "transform-main",
    type: "transform",
    name: "Main Transform",
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    anchorX: 0,
    anchorY: 0,
    rotation: 0,
  };
  state.transforms.tree = [createTreeNode("transform-main")];
  state.variables.items["variable-main"] = {
    id: "variable-main",
    type: "variable",
    variableType: "number",
    name: "Score",
    scope: "device",
    default: 0,
    value: 0,
  };
  state.variables.tree = [createTreeNode("variable-main")];
  state.textStyles.items["text-style-main"] = {
    id: "text-style-main",
    type: "textStyle",
    name: "Main Style",
    fontId: "font-main",
    colorId: "color-main",
    fontSize: 28,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.tree = [createTreeNode("text-style-main")];
  state.characters.items["character-main"] = {
    id: "character-main",
    type: "character",
    name: "Hero",
    sprites: createEmptyNestedCollection(),
  };
  state.characters.tree = [createTreeNode("character-main")];
  state.layouts.items["layout-main"] = {
    id: "layout-main",
    type: "layout",
    name: "Main Layout",
    layoutType: "general",
    elements: createEmptyNestedCollection(),
  };
  state.layouts.tree = [createTreeNode("layout-main")];
  state.controls.items["control-main"] = {
    id: "control-main",
    type: "control",
    name: "Main Control",
    elements: createEmptyNestedCollection(),
  };
  state.controls.tree = [createTreeNode("control-main")];
  return state;
};

const createRichCompatibilityState = () => {
  const state = createLineBaseState();
  withFiles(state, [
    { id: "file-font-ui", type: "font", mimeType: "font/ttf" },
    { id: "file-smile", type: "image", mimeType: "image/png", size: 256 },
    { id: "file-angry", type: "image", mimeType: "image/png", size: 256 },
    {
      id: "thumb-spritesheet-ui",
      type: "image-thumbnail",
      mimeType: "image/webp",
      size: 128,
    },
    { id: "file-image-rich", type: "image", mimeType: "image/png", size: 2048 },
    { id: "thumb-image-rich", type: "image-thumbnail", mimeType: "image/webp" },
    {
      id: "file-spritesheet-rich",
      type: "image",
      mimeType: "image/png",
      size: 3072,
    },
    {
      id: "thumb-spritesheet-rich",
      type: "image-thumbnail",
      mimeType: "image/webp",
      size: 128,
    },
    {
      id: "thumb-animation-rich",
      type: "image-thumbnail",
      mimeType: "image/webp",
      size: 128,
    },
    { id: "file-sound-rich", type: "audio", mimeType: "audio/mp3", size: 1024 },
    {
      id: "waveform-sound-rich",
      type: "audio-waveform",
      mimeType: "application/json",
    },
    { id: "file-video-rich", type: "video", mimeType: "video/mp4", size: 4096 },
    {
      id: "thumb-video-rich",
      type: "video-thumbnail",
      mimeType: "image/jpeg",
    },
  ]);
  state.scenes.items["scene-a"].sections.items["section-a"].lines.items[
    "line-a"
  ].actions.background = {
    resourceId: "image-rich",
    opacity: 0.75,
    blur: {
      x: 6,
      y: 9,
      quality: 3,
      kernelSize: 9,
      repeatEdgePixels: true,
    },
  };
  mergeCollections(state, createCharacterBaseState(), "characters");
  mergeCollections(state, createLayoutBaseState(), "layouts");
  mergeCollections(state, createControlBaseState(), "controls");
  mergeCollections(state, createControlBaseState(), "fonts");
  mergeCollections(state, createControlBaseState(), "colors");
  mergeCollections(state, createControlBaseState(), "textStyles");
  state.transforms.items["transform-rich"] = {
    id: "transform-rich",
    type: "transform",
    name: "Camera",
    description: "Default framing transform",
    x: 100,
    y: 200,
    scaleX: 1,
    scaleY: 1,
    anchorX: 0,
    anchorY: 0,
    rotation: 0,
  };
  state.transforms.tree = [createTreeNode("transform-rich")];
  state.variables.items["variable-rich"] = {
    id: "variable-rich",
    type: "variable",
    variableType: "string",
    name: "Mood",
    description: "Tracks the current dialogue mood",
    scope: "account",
    isEnum: true,
    enumValues: ["calm", "tense"],
    default: "calm",
    value: "calm",
  };
  state.variables.tree = [createTreeNode("variable-rich")];
  state.images.items["folder-art"] = {
    id: "folder-art",
    type: "folder",
    name: "Art",
  };
  state.images.items["image-rich"] = {
    id: "image-rich",
    type: "image",
    name: "Background",
    description: "Establishing shot",
    fileId: "file-image-rich",
    thumbnailFileId: "thumb-image-rich",
    width: 1920,
    height: 1080,
  };
  state.images.tree = [
    createTreeNode("folder-art", [createTreeNode("image-rich")]),
  ];
  state.spritesheets.items["folder-spritesheets"] = {
    id: "folder-spritesheets",
    type: "folder",
    name: "Spritesheets",
  };
  state.spritesheets.items["spritesheet-rich"] = {
    id: "spritesheet-rich",
    type: "spritesheet",
    name: "Hero Idle",
    description: "Idle loop spritesheet",
    fileId: "file-spritesheet-rich",
    thumbnailFileId: "thumb-spritesheet-rich",
    sheetWidth: 1024,
    sheetHeight: 512,
    frameCount: 4,
    width: 256,
    height: 256,
    jsonData: {
      meta: {
        image: "hero-idle.png",
      },
    },
    animations: {
      idle: {
        frames: [0, 1, 2, 3],
        animationSpeed: 1,
        loop: true,
      },
    },
  };
  state.spritesheets.tree = [
    createTreeNode("folder-spritesheets", [createTreeNode("spritesheet-rich")]),
  ];
  state.sounds.items["folder-audio"] = {
    id: "folder-audio",
    type: "folder",
    name: "Audio",
  };
  state.sounds.items["sound-rich"] = {
    id: "sound-rich",
    type: "sound",
    name: "Ambience",
    description: "Night ambience",
    fileId: "file-sound-rich",
    waveformDataFileId: "waveform-sound-rich",
    duration: 42.5,
  };
  state.sounds.tree = [
    createTreeNode("folder-audio", [createTreeNode("sound-rich")]),
  ];
  state.videos.items["folder-video"] = {
    id: "folder-video",
    type: "folder",
    name: "Video",
  };
  state.videos.items["video-rich"] = {
    id: "video-rich",
    type: "video",
    name: "Opening",
    description: "Opening cinematic",
    fileId: "file-video-rich",
    thumbnailFileId: "thumb-video-rich",
    width: 1280,
    height: 720,
  };
  state.videos.tree = [
    createTreeNode("folder-video", [createTreeNode("video-rich")]),
  ];
  state.animations.items["animation-rich"] = {
    id: "animation-rich",
    type: "animation",
    name: "Entrance Motion",
    description: "Entrance motion",
    thumbnailFileId: "thumb-animation-rich",
    preview: {
      background: {
        imageId: "image-rich",
      },
      outgoing: {
        imageId: "image-rich",
      },
      incoming: {
        imageId: "image-rich",
      },
    },
    animation: {
      type: "update",
      tween: {
        x: {
          auto: {
            duration: 1000,
            easing: "linear",
          },
        },
        alpha: {
          keyframes: [],
        },
      },
    },
  };
  state.animations.tree = [createTreeNode("animation-rich")];
  return state;
};

const createCrossReferencedState = () => {
  const state = createRichCompatibilityState();
  state.layouts.items["layout-dialogue"].elements.items["text-a"].variableId =
    "variable-rich";
  state.layouts.items["layout-dialogue"].elements.items["anim-idle"] = {
    id: "anim-idle",
    type: "spritesheet-animation",
    name: "Idle Loop",
    x: 0,
    y: 80,
    anchorX: 0,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    resourceId: "spritesheet-rich",
    animationName: "idle",
  };
  state.layouts.items["layout-dialogue"].elements.tree[0].children.push(
    createTreeNode("anim-idle"),
  );
  state.controls.items["control-default"].elements.items["text-a"].variableId =
    "variable-rich";
  state.controls.items["control-default"].elements.items["anim-idle"] = {
    id: "anim-idle",
    type: "spritesheet-animation",
    name: "Idle Loop",
    x: 0,
    y: 80,
    anchorX: 0,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    resourceId: "spritesheet-rich",
    animationName: "idle",
  };
  state.controls.items["control-default"].elements.tree[0].children.push(
    createTreeNode("anim-idle"),
  );
  return state;
};

const payloadSet = (type, minimal, full, extras = {}) => [
  { type, fixtureName: "minimal", payload: minimal },
  { type, fixtureName: "full", payload: full },
  ...Object.entries(extras).map(([fixtureName, payload]) => ({
    type,
    fixtureName,
    payload,
  })),
];

const createFolderedPayloadSets = ({
  family,
  idField,
  idsField,
  minimalCreateData,
  fullCreateData,
  minimalUpdateData,
  fullUpdateData,
}) => {
  const createType = `${family}.create`;
  const updateType = `${family}.update`;
  const deleteType = `${family}.delete`;
  const moveType = `${family}.move`;

  return [
    ...payloadSet(
      createType,
      {
        [idField]: "item-a",
        data: minimalCreateData,
      },
      {
        [idField]: "item-a",
        parentId: "folder-a",
        position: "before",
        positionTargetId: "item-b",
        data: fullCreateData,
      },
      {
        "folder-full": {
          [idField]: "folder-a",
          data: {
            type: "folder",
            name: "Folder A",
          },
        },
      },
    ),
    ...payloadSet(
      updateType,
      {
        [idField]: "item-a",
        data: minimalUpdateData,
      },
      {
        [idField]: "item-a",
        data: fullUpdateData,
      },
    ),
    ...payloadSet(
      deleteType,
      {
        [idsField]: ["item-a"],
      },
      {
        [idsField]: ["item-a", "item-b"],
      },
    ),
    ...payloadSet(
      moveType,
      {
        [idField]: "item-a",
        parentId: "folder-a",
        position: "last",
      },
      {
        [idField]: "item-a",
        parentId: "folder-a",
        position: "before",
        positionTargetId: "item-b",
      },
    ),
  ];
};

const payloadFixtures = [
  ...payloadSet(
    "project.create",
    {
      state: createEmptyTestState(),
    },
    {
      state: createRichCompatibilityState(),
    },
  ),
  ...payloadSet(
    "story.update",
    {
      data: {
        initialSceneId: null,
      },
    },
    {
      data: {
        initialSceneId: "scene-b",
      },
    },
  ),
  ...payloadSet(
    "scene.create",
    {
      sceneId: "scene-c",
      data: {
        name: "New Scene",
      },
    },
    {
      sceneId: "scene-c",
      parentId: "folder-scenes",
      position: "before",
      positionTargetId: "scene-b",
      data: {
        type: "scene",
        name: "Train Station",
        description: "Station platform intro",
        position: {
          x: 320,
          y: 80,
        },
      },
    },
    {
      "folder-full": {
        sceneId: "folder-prologue",
        data: {
          type: "folder",
          name: "Prologue",
        },
      },
    },
  ),
  ...payloadSet(
    "scene.update",
    {
      sceneId: "scene-a",
      data: {
        name: "Intro Updated",
      },
    },
    {
      sceneId: "scene-a",
      data: {
        name: "Intro Updated",
        description: "Updated scene summary",
        position: {
          x: 120,
          y: 64,
        },
      },
    },
  ),
  ...payloadSet(
    "scene.delete",
    {
      sceneIds: ["scene-a"],
    },
    {
      sceneIds: ["scene-a", "scene-b"],
    },
  ),
  ...payloadSet(
    "scene.move",
    {
      sceneId: "scene-a",
      parentId: "folder-scenes",
      position: "last",
    },
    {
      sceneId: "scene-a",
      parentId: "folder-scenes",
      position: "before",
      positionTargetId: "scene-b",
    },
  ),
  ...payloadSet(
    "section.create",
    {
      sectionId: "section-c",
      sceneId: "scene-a",
      data: {
        name: "Section C",
      },
    },
    {
      sectionId: "section-c",
      sceneId: "scene-a",
      parentId: "section-a",
      position: "before",
      positionTargetId: "section-b",
      data: {
        name: "Section C",
      },
    },
  ),
  ...payloadSet(
    "section.update",
    {
      sectionId: "section-a",
      data: {
        name: "Section A Updated",
      },
    },
    {
      sectionId: "section-a",
      data: {
        name: "Section A Updated",
      },
    },
  ),
  ...payloadSet(
    "section.delete",
    {
      sectionIds: ["section-a"],
    },
    {
      sectionIds: ["section-a", "section-b"],
    },
  ),
  ...payloadSet(
    "section.move",
    {
      sectionId: "section-a",
      parentId: "section-b",
      position: "last",
    },
    {
      sectionId: "section-a",
      sceneId: "scene-b",
      parentId: "section-b",
      position: "before",
      positionTargetId: "section-other",
    },
  ),
  ...payloadSet(
    "line.create",
    {
      sectionId: "section-a",
      lines: [
        {
          lineId: "line-c",
          data: {
            actions: {
              say: "new",
            },
          },
        },
      ],
    },
    {
      sectionId: "section-a",
      position: "before",
      positionTargetId: "line-a",
      lines: [
        {
          lineId: "line-c",
          data: {
            actions: {
              dialogue: {
                mode: "adv",
                content: [{ text: "Hello" }],
              },
              background: {
                resourceId: "image-rich",
                opacity: 0.75,
                blur: {
                  x: 6,
                  y: 9,
                  quality: 3,
                  kernelSize: 9,
                  repeatEdgePixels: true,
                },
              },
            },
          },
        },
        {
          lineId: "line-d",
          data: {
            actions: {
              say: "next",
            },
          },
        },
      ],
    },
  ),
  ...payloadSet(
    "line.update_actions",
    {
      lineId: "line-a",
      data: {
        mood: "tense",
      },
    },
    {
      lineId: "line-a",
      replace: true,
      data: {
        dialogue: {
          mode: "nvl",
          content: [{ text: "Replaced" }],
        },
        background: {
          resourceId: "image-rich",
          opacity: 0.5,
          blur: {
            x: 6,
            y: 9,
            quality: 3,
            kernelSize: 9,
            repeatEdgePixels: true,
          },
        },
      },
    },
  ),
  ...payloadSet(
    "line.delete",
    {
      lineIds: ["line-a"],
    },
    {
      lineIds: ["line-a", "line-b"],
    },
  ),
  ...payloadSet(
    "line.move",
    {
      lineId: "line-a",
      toSectionId: "section-b",
      position: "last",
    },
    {
      lineId: "line-a",
      toSectionId: "section-b",
      position: "before",
      positionTargetId: "line-other",
    },
  ),
  ...payloadSet(
    "file.create",
    {
      fileId: "file-a",
      data: {
        mimeType: "image/png",
        size: 128,
        sha256: "file-a-sha256",
      },
    },
    {
      fileId: "file-a",
      data: {
        mimeType: "video/mp4",
        size: 4096,
        sha256: "file-a-sha256",
      },
    },
  ),
  ...payloadSet(
    "file.delete",
    {
      fileIds: ["file-a"],
    },
    {
      fileIds: ["file-a", "file-b"],
    },
  ),
  ...payloadSet(
    "file.move",
    {
      fileId: "file-a",
      parentId: "folder-a",
      position: "last",
    },
    {
      fileId: "file-a",
      parentId: "folder-a",
      position: "before",
      positionTargetId: "file-b",
    },
  ),
  ...createFolderedPayloadSets({
    family: "image",
    idField: "imageId",
    idsField: "imageIds",
    minimalCreateData: {
      type: "image",
      name: "Image",
      fileId: "file-image",
    },
    fullCreateData: {
      type: "image",
      name: "Background",
      description: "Establishing shot",
      fileId: "file-image",
      thumbnailFileId: "thumb-image",
      width: 1920,
      height: 1080,
      tagIds: ["tag-bg"],
    },
    minimalUpdateData: {
      name: "Image Updated",
    },
    fullUpdateData: {
      description: "Establishing shot",
      thumbnailFileId: "thumb-image",
      width: 1280,
      height: 720,
      tagIds: ["tag-bg"],
    },
  }),
  ...createFolderedPayloadSets({
    family: "spritesheet",
    idField: "spritesheetId",
    idsField: "spritesheetIds",
    minimalCreateData: {
      type: "spritesheet",
      name: "Spritesheet",
      fileId: "file-image",
      jsonData: {
        meta: {
          image: "sheet.png",
        },
      },
      animations: {
        default: {
          frames: [0],
        },
      },
    },
    fullCreateData: {
      type: "spritesheet",
      name: "Hero Idle",
      description: "Idle loop spritesheet",
      fileId: "file-image",
      thumbnailFileId: "thumb-image",
      sheetWidth: 1024,
      sheetHeight: 512,
      frameCount: 4,
      width: 256,
      height: 256,
      jsonData: {
        meta: {
          image: "hero-idle.png",
        },
      },
      animations: {
        idle: {
          frames: [0, 1, 2, 3],
          fps: 12,
          loop: true,
        },
      },
    },
    minimalUpdateData: {
      name: "Spritesheet Updated",
    },
    fullUpdateData: {
      description: "Updated idle loop spritesheet",
      thumbnailFileId: "thumb-image",
      frameCount: 6,
      width: 320,
      height: 256,
      jsonData: {
        meta: {
          image: "hero-idle-updated.png",
        },
      },
      animations: {
        idle: {
          frames: [0, 1, 2, 3, 4, 5],
          fps: 15,
          loop: true,
        },
      },
    },
  }),
  ...createFolderedPayloadSets({
    family: "sound",
    idField: "soundId",
    idsField: "soundIds",
    minimalCreateData: {
      type: "sound",
      name: "Sound",
      fileId: "file-sound",
    },
    fullCreateData: {
      type: "sound",
      name: "Ambience",
      description: "Night ambience",
      fileId: "file-sound",
      waveformDataFileId: "waveform-sound",
      duration: 42.5,
      tagIds: ["tag-ambience"],
    },
    minimalUpdateData: {
      duration: 42,
    },
    fullUpdateData: {
      description: "Night ambience",
      waveformDataFileId: null,
      duration: 84,
      tagIds: ["tag-ambience"],
    },
  }),
  ...createFolderedPayloadSets({
    family: "video",
    idField: "videoId",
    idsField: "videoIds",
    minimalCreateData: {
      type: "video",
      name: "Video",
      fileId: "file-video",
      thumbnailFileId: "thumb-video",
    },
    fullCreateData: {
      type: "video",
      name: "Opening",
      description: "Opening cinematic",
      fileId: "file-video",
      thumbnailFileId: "thumb-video",
      width: 1280,
      height: 720,
      tagIds: ["tag-opening"],
    },
    minimalUpdateData: {
      width: 1280,
    },
    fullUpdateData: {
      description: "Opening cinematic",
      thumbnailFileId: "thumb-video",
      width: 1920,
      height: 1080,
      tagIds: ["tag-opening"],
    },
  }),
  ...createFolderedPayloadSets({
    family: "animation",
    idField: "animationId",
    idsField: "animationIds",
    minimalCreateData: {
      type: "animation",
      name: "Animation",
      animation: {
        type: "update",
        tween: {
          x: {
            keyframes: [{ duration: 100, value: 1 }],
          },
        },
      },
    },
    fullCreateData: {
      type: "animation",
      name: "Entrance Motion",
      description: "Entrance motion",
      thumbnailFileId: "thumb-animation",
      preview: {
        background: {
          imageId: "image-background",
        },
        outgoing: {
          imageId: "image-outgoing",
        },
        incoming: {
          imageId: "image-incoming",
        },
      },
      animation: {
        type: "update",
        tween: {
          x: {
            auto: {
              duration: 1000,
              easing: "linear",
            },
          },
          alpha: {
            keyframes: [{ duration: 100, value: 1 }],
          },
        },
      },
    },
    minimalUpdateData: {
      name: "Animation Updated",
    },
    fullUpdateData: {
      description: "Soft mask transition",
      thumbnailFileId: "thumb-animation",
      preview: {
        background: {
          imageId: "image-background",
        },
        outgoing: {
          imageId: "image-outgoing",
          transformId: "transform-outgoing",
        },
        incoming: {
          imageId: "image-incoming",
          transformId: "transform-incoming",
        },
      },
      animation: {
        type: "update",
        tween: {
          x: {
            auto: {
              duration: 1200,
              easing: "easeOutQuad",
            },
          },
          alpha: {
            keyframes: [{ duration: 100, value: 0.6 }],
          },
        },
      },
    },
  }),
  {
    type: "animation.update",
    fixtureName: "empty-keyframes",
    payload: {
      animationId: "item-a",
      data: {
        animation: {
          type: "update",
          tween: {
            x: {
              keyframes: [],
            },
          },
        },
      },
    },
  },
  ...createFolderedPayloadSets({
    family: "font",
    idField: "fontId",
    idsField: "fontIds",
    minimalCreateData: {
      type: "font",
      name: "Font",
      fileId: "file-font",
      fontFamily: "Suit",
    },
    fullCreateData: {
      type: "font",
      name: "Font",
      description: "Editorial serif family",
      fileId: "file-font",
      fontFamily: "Suit",
    },
    minimalUpdateData: {
      fontFamily: "Suit Alt",
    },
    fullUpdateData: {
      description: "Updated display family",
      fontFamily: "Suit Alt",
    },
  }),
  ...createFolderedPayloadSets({
    family: "color",
    idField: "colorId",
    idsField: "colorIds",
    minimalCreateData: {
      type: "color",
      name: "Color",
      hex: "#112233",
    },
    fullCreateData: {
      type: "color",
      name: "Color",
      description: "Core brand tone",
      hex: "#112233",
    },
    minimalUpdateData: {
      hex: "#223344",
    },
    fullUpdateData: {
      description: "Deeper emphasis tone",
      hex: "#223344",
    },
  }),
  ...createFolderedPayloadSets({
    family: "particle",
    idField: "particleId",
    idsField: "particleIds",
    minimalCreateData: {
      type: "particle",
      name: "Snow",
      width: 1280,
      height: 720,
      seed: 12345,
      modules: {
        emission: {},
        appearance: {},
      },
    },
    fullCreateData: {
      type: "particle",
      name: "Snow Overlay",
      description: "Ambient snowfall overlay",
      width: 1280,
      height: 720,
      seed: 12345,
      modules: {
        emission: {
          mode: "continuous",
          rate: 20,
          particleLifetime: {
            min: 1,
            max: 2,
          },
          source: {
            kind: "rect",
            data: {
              x: 0,
              y: 0,
              width: 1280,
              height: 20,
            },
          },
        },
        appearance: {
          texture: "snowflake",
        },
      },
    },
    minimalUpdateData: {
      width: 1440,
    },
    fullUpdateData: {
      description: "Updated snowfall overlay",
      width: 1440,
      height: 900,
      seed: 67890,
    },
  }),
  ...createFolderedPayloadSets({
    family: "transform",
    idField: "transformId",
    idsField: "transformIds",
    minimalCreateData: {
      type: "transform",
      name: "Camera",
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
    },
    fullCreateData: {
      type: "transform",
      name: "Camera",
      description: "Default framing transform",
      x: 100,
      y: 200,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
    },
    minimalUpdateData: {
      x: 320,
    },
    fullUpdateData: {
      description: "Updated framing",
      x: 320,
      y: 240,
      rotation: 15,
    },
  }),
  ...createFolderedPayloadSets({
    family: "variable",
    idField: "variableId",
    idsField: "variableIds",
    minimalCreateData: {
      type: "variable",
      variableType: "number",
      name: "Score",
      scope: "device",
      default: 0,
      value: 0,
    },
    fullCreateData: {
      type: "variable",
      variableType: "string",
      name: "Mood",
      description: "Tracks the current dialogue mood",
      scope: "account",
      isEnum: true,
      enumValues: ["calm", "tense"],
      default: "calm",
      value: "calm",
    },
    minimalUpdateData: {
      scope: "account",
      value: 10,
    },
    fullUpdateData: {
      description: "Progress score",
      isEnum: true,
      enumValues: ["calm", "tense", "urgent"],
      default: "tense",
      value: "urgent",
    },
  }),
  ...createFolderedPayloadSets({
    family: "textStyle",
    idField: "textStyleId",
    idsField: "textStyleIds",
    minimalCreateData: {
      type: "textStyle",
      name: "Dialogue",
      fontId: "font-ui",
      colorId: "color-ui",
      fontSize: 32,
      lineHeight: 1.4,
      fontWeight: "700",
    },
    fullCreateData: {
      type: "textStyle",
      name: "Dialogue",
      description: "Main spoken-line styling",
      fontId: "font-ui",
      colorId: "color-ui",
      fontSize: 32,
      lineHeight: 1.4,
      fontWeight: "700",
      previewText: "Hello",
    },
    minimalUpdateData: {
      previewText: "Preview",
    },
    fullUpdateData: {
      description: "Main spoken-line styling",
      fontSize: 40,
      lineHeight: 1.6,
      fontWeight: "600",
      previewText: "Preview",
    },
  }),
  ...createFolderedPayloadSets({
    family: "character",
    idField: "characterId",
    idsField: "characterIds",
    minimalCreateData: {
      type: "character",
      name: "Hero",
      sprites: createEmptyNestedCollection(),
    },
    fullCreateData: {
      type: "character",
      name: "Hero",
      description: "Main actor",
      shortcut: "1",
      sprites: createEmptyNestedCollection(),
    },
    minimalUpdateData: {
      name: "Hero Updated",
    },
    fullUpdateData: {
      description: "Lead actor",
      shortcut: "2",
    },
  }),
  ...createFolderedPayloadSets({
    family: "layout",
    idField: "layoutId",
    idsField: "layoutIds",
    minimalCreateData: {
      type: "layout",
      name: "Dialogue",
      layoutType: "dialogue-adv",
      elements: createEmptyNestedCollection(),
    },
    fullCreateData: {
      type: "layout",
      name: "Dialogue",
      description: "Main dialogue frame",
      layoutType: "dialogue-adv",
      thumbnailFileId: "thumb-image",
      preview: {
        backgroundImageId: "image-preview-layout",
        runtime: {
          autoMode: true,
        },
      },
      elements: createEmptyNestedCollection(),
    },
    minimalUpdateData: {
      name: "Dialogue Updated",
    },
    fullUpdateData: {
      name: "Dialogue Updated",
      description: "Updated dialogue frame",
      thumbnailFileId: "thumb-image",
      preview: {
        variables: {
          score: 7,
        },
      },
    },
  }),
  ...payloadSet(
    "layout.schema.upgrade",
    {
      layoutIds: ["layout-dialogue"],
      targetSchemaVersion: 2,
    },
    {
      layoutIds: ["layout-dialogue", "layout-menu"],
      targetSchemaVersion: 2,
    },
  ),
  ...createFolderedPayloadSets({
    family: "control",
    idField: "controlId",
    idsField: "controlIds",
    minimalCreateData: {
      type: "control",
      name: "Default Control",
      elements: createEmptyNestedCollection(),
    },
    fullCreateData: {
      type: "control",
      name: "Default Control",
      description: "Shared navigation control",
      thumbnailFileId: "thumb-image",
      preview: {
        runtime: {
          autoMode: true,
        },
      },
      keyboard: {
        enter: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
      },
      keyup: {
        enter: {
          payload: {
            actions: {
              toggleAutoMode: {},
            },
          },
        },
      },
      elements: createEmptyNestedCollection(),
    },
    minimalUpdateData: {
      name: "Control Updated",
    },
    fullUpdateData: {
      name: "Control Updated",
      description: "Updated navigation control",
      thumbnailFileId: "thumb-image",
      preview: {
        choice: {
          items: [{ content: "Play" }],
        },
      },
      keyboard: {
        space: {
          payload: {
            actions: {
              toggleDialogueUI: {},
            },
          },
        },
      },
      keyup: {
        space: {
          payload: {
            actions: {
              toggleSkipMode: {},
            },
          },
        },
      },
    },
  }),
  ...payloadSet(
    "character.sprite.create",
    {
      characterId: "character-hero",
      spriteId: "sprite-c",
      data: {
        type: "image",
        name: "New Sprite",
        fileId: "file-new-sprite",
      },
    },
    {
      characterId: "character-hero",
      spriteId: "sprite-c",
      parentId: "folder-default",
      position: "before",
      positionTargetId: "sprite-a",
      data: {
        type: "image",
        name: "New Sprite",
        fileId: "file-new-sprite",
        width: 512,
        height: 512,
        tagIds: ["tag-smile"],
      },
    },
    {
      "folder-full": {
        characterId: "character-hero",
        spriteId: "folder-alt",
        data: {
          type: "folder",
          name: "Alt",
        },
      },
    },
  ),
  ...payloadSet(
    "character.sprite.update",
    {
      characterId: "character-hero",
      spriteId: "sprite-a",
      data: {
        name: "Smile Updated",
      },
    },
    {
      characterId: "character-hero",
      spriteId: "sprite-a",
      data: {
        name: "Smile Updated",
        width: 640,
        height: 640,
        tagIds: ["tag-smile"],
      },
    },
  ),
  ...payloadSet(
    "character.sprite.delete",
    {
      characterId: "character-hero",
      spriteIds: ["sprite-a"],
    },
    {
      characterId: "character-hero",
      spriteIds: ["sprite-a", "sprite-b"],
    },
  ),
  ...payloadSet(
    "character.sprite.move",
    {
      characterId: "character-hero",
      spriteId: "sprite-a",
      parentId: "folder-default",
      position: "last",
    },
    {
      characterId: "character-hero",
      spriteId: "sprite-a",
      parentId: "folder-default",
      position: "before",
      positionTargetId: "sprite-b",
    },
  ),
  ...payloadSet(
    "tag.create",
    {
      scopeKey: "images",
      tagId: "tag-bg",
      data: {
        type: "tag",
        name: "Background",
      },
    },
    {
      scopeKey: "characterSprites:character-hero",
      tagId: "tag-smile",
      data: {
        type: "tag",
        name: "Smile",
        color: "#112233",
      },
    },
  ),
  ...payloadSet(
    "tag.update",
    {
      scopeKey: "images",
      tagId: "tag-bg",
      data: {
        name: "Backdrop",
      },
    },
    {
      scopeKey: "characterSprites:character-hero",
      tagId: "tag-smile",
      data: {
        name: "Smile Updated",
        color: null,
      },
    },
  ),
  ...payloadSet(
    "tag.delete",
    {
      scopeKey: "images",
      tagIds: ["tag-bg"],
    },
    {
      scopeKey: "characterSprites:character-hero",
      tagIds: ["tag-smile", "tag-angry"],
    },
  ),
  ...payloadSet(
    "layout.element.create",
    {
      layoutId: "layout-dialogue",
      elementId: "text-c",
      data: {
        type: "text",
        name: "Body",
        x: 0,
        y: 40,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        text: "More",
        textStyleId: "text-style-ui",
      },
    },
    {
      layoutId: "layout-dialogue",
      elementId: "text-c",
      parentId: "container-root",
      position: "before",
      positionTargetId: "text-a",
      data: {
        type: "text",
        name: "Body",
        x: 0,
        y: 40,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        text: "More",
        textStyleId: "text-style-ui",
        variableId: "variable-rich",
        scrollUp: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        scrollDown: {
          inheritToChildren: true,
          payload: {
            actions: {
              toggleDialogueUI: {},
            },
          },
        },
      },
    },
    {
      "container-full": {
        layoutId: "layout-dialogue",
        elementId: "container-body",
        data: {
          type: "container",
          name: "Body Container",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          gapX: 16,
          gapY: 12,
        },
      },
      "rect-full": {
        layoutId: "layout-dialogue",
        elementId: "rect-body",
        data: {
          type: "rect",
          name: "Body Rect",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          fill: "#112233",
        },
      },
      "sprite-full": {
        layoutId: "layout-dialogue",
        elementId: "sprite-body",
        data: {
          type: "sprite",
          name: "Body Sprite",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          imageId: "image-rich",
          blur: createLayoutElementBlur(),
        },
      },
      "spritesheet-full": {
        layoutId: "layout-dialogue",
        elementId: "spritesheet-body",
        data: {
          type: "spritesheet-animation",
          name: "Body Animation",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          resourceId: "spritesheet-ui",
          animationName: "idle",
        },
      },
      "slider-full": {
        layoutId: "layout-dialogue",
        elementId: "slider-body",
        data: {
          type: "slider",
          name: "Body Slider",
          x: 0,
          y: 0,
          width: 300,
          height: 24,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      },
      "choice-single-item-full": {
        layoutId: "layout-dialogue",
        elementId: "choice-single-item-b",
        parentId: "container-root",
        data: createChoiceSingleItemElementData({ choiceItemIndex: 1 }),
      },
    },
  ),
  ...payloadSet(
    "layout.element.update",
    {
      layoutId: "layout-dialogue",
      elementId: "text-a",
      data: {
        name: "Title Updated",
      },
    },
    {
      layoutId: "layout-dialogue",
      elementId: "text-a",
      data: {
        variableId: "variable-rich",
        scrollUp: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        scrollDown: {
          inheritToChildren: true,
          payload: {
            actions: {
              toggleDialogueUI: {},
            },
          },
        },
      },
    },
    {
      "sprite-blur-full": {
        layoutId: "layout-dialogue",
        elementId: "sprite-blur",
        data: {
          blur: createLayoutElementBlur(),
        },
      },
      "choice-single-item-full": {
        layoutId: "layout-dialogue",
        elementId: "choice-single-item",
        data: {
          choiceItemIndex: 2,
        },
      },
    },
  ),
  ...payloadSet(
    "layout.element.delete",
    {
      layoutId: "layout-dialogue",
      elementIds: ["text-a"],
    },
    {
      layoutId: "layout-dialogue",
      elementIds: ["text-a", "text-b"],
    },
  ),
  ...payloadSet(
    "layout.element.move",
    {
      layoutId: "layout-dialogue",
      elementId: "text-a",
      parentId: "container-root",
      position: "last",
    },
    {
      layoutId: "layout-dialogue",
      elementId: "text-a",
      parentId: "container-root",
      position: "before",
      positionTargetId: "text-b",
    },
  ),
  ...payloadSet(
    "control.element.create",
    {
      controlId: "control-default",
      elementId: "text-c",
      data: {
        type: "text",
        name: "Body",
        x: 0,
        y: 40,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        text: "More",
        textStyleId: "text-style-ui",
      },
    },
    {
      controlId: "control-default",
      elementId: "text-c",
      parentId: "container-root",
      position: "before",
      positionTargetId: "text-a",
      data: {
        type: "text",
        name: "Body",
        x: 0,
        y: 40,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        text: "More",
        textStyleId: "text-style-ui",
        variableId: "variable-rich",
        scrollUp: {
          inheritToChildren: true,
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        scrollDown: {
          payload: {
            actions: {
              toggleSkipMode: {},
            },
          },
        },
      },
    },
    {
      "container-full": {
        controlId: "control-default",
        elementId: "container-body",
        data: {
          type: "container",
          name: "Body Container",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          gapX: 16,
          gapY: 12,
        },
      },
      "rect-full": {
        controlId: "control-default",
        elementId: "rect-body",
        data: {
          type: "rect",
          name: "Body Rect",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          fill: "#112233",
        },
      },
      "sprite-full": {
        controlId: "control-default",
        elementId: "sprite-body",
        data: {
          type: "sprite",
          name: "Body Sprite",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          imageId: "image-rich",
          blur: createLayoutElementBlur(),
        },
      },
      "spritesheet-full": {
        controlId: "control-default",
        elementId: "spritesheet-body",
        data: {
          type: "spritesheet-animation",
          name: "Body Animation",
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          resourceId: "spritesheet-ui",
          animationName: "idle",
        },
      },
      "slider-full": {
        controlId: "control-default",
        elementId: "slider-body",
        data: {
          type: "slider",
          name: "Body Slider",
          x: 0,
          y: 0,
          width: 300,
          height: 24,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      },
      "choice-single-item-full": {
        controlId: "control-default",
        elementId: "choice-single-item-b",
        parentId: "container-root",
        data: createChoiceSingleItemElementData({ choiceItemIndex: 1 }),
      },
    },
  ),
  ...payloadSet(
    "control.element.update",
    {
      controlId: "control-default",
      elementId: "text-a",
      data: {
        name: "Title Updated",
      },
    },
    {
      controlId: "control-default",
      elementId: "text-a",
      data: {
        variableId: "variable-rich",
        scrollUp: {
          inheritToChildren: true,
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        scrollDown: {
          payload: {
            actions: {
              toggleSkipMode: {},
            },
          },
        },
      },
    },
    {
      "sprite-blur-full": {
        controlId: "control-default",
        elementId: "sprite-blur",
        data: {
          blur: createLayoutElementBlur(),
        },
      },
      "choice-single-item-full": {
        controlId: "control-default",
        elementId: "choice-single-item",
        data: {
          choiceItemIndex: 2,
        },
      },
    },
  ),
  ...payloadSet(
    "control.element.delete",
    {
      controlId: "control-default",
      elementIds: ["text-a"],
    },
    {
      controlId: "control-default",
      elementIds: ["text-a", "text-b"],
    },
  ),
  ...payloadSet(
    "control.element.move",
    {
      controlId: "control-default",
      elementId: "text-a",
      parentId: "container-root",
      position: "last",
    },
    {
      controlId: "control-default",
      elementId: "text-a",
      parentId: "container-root",
      position: "before",
      positionTargetId: "text-b",
    },
  ),
];

const stateFixtures = [
  {
    fixtureName: "minimal-project",
    state: createEmptyTestState(),
  },
  {
    fixtureName: "omitted-optionals-project",
    state: createSparseCompatibilityState(),
  },
  {
    fixtureName: "present-optionals-project",
    state: createRichCompatibilityState(),
  },
  {
    fixtureName: "cross-referenced-project",
    state: createCrossReferencedState(),
  },
  {
    fixtureName: "maximal-project",
    state: createCrossReferencedState(),
  },
];

const streamFixtures = [
  {
    fixtureName: "story-crud",
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createLineBaseState(),
        },
      },
      {
        type: "story.update",
        payload: {
          data: {
            initialSceneId: "scene-b",
          },
        },
      },
      {
        type: "scene.create",
        payload: {
          sceneId: "scene-c",
          parentId: "folder-scenes",
          data: {
            name: "Flashback",
          },
        },
      },
      {
        type: "scene.update",
        payload: {
          sceneId: "scene-a",
          data: {
            description: "Updated scene summary",
          },
        },
      },
      {
        type: "scene.move",
        payload: {
          sceneId: "scene-c",
          position: "after",
          positionTargetId: "scene-a",
        },
      },
      {
        type: "section.create",
        payload: {
          sectionId: "section-c",
          sceneId: "scene-a",
          data: {
            name: "Section C",
          },
        },
      },
      {
        type: "section.update",
        payload: {
          sectionId: "section-a",
          data: {
            name: "Section A Updated",
          },
        },
      },
      {
        type: "section.move",
        payload: {
          sectionId: "section-b",
          position: "before",
          positionTargetId: "section-a",
        },
      },
      {
        type: "line.create",
        payload: {
          sectionId: "section-a",
          lines: [
            {
              lineId: "line-c",
              data: {
                actions: {
                  say: "new",
                },
              },
            },
          ],
        },
      },
      {
        type: "line.update_actions",
        payload: {
          lineId: "line-a",
          data: {
            mood: "tense",
            background: {
              resourceId: "image-rich",
              opacity: 0.5,
              blur: {
                x: 6,
                y: 9,
                quality: 3,
                kernelSize: 9,
                repeatEdgePixels: true,
              },
            },
          },
        },
      },
      {
        type: "line.move",
        payload: {
          lineId: "line-b",
          toSectionId: "section-b",
          position: "last",
        },
      },
      {
        type: "line.delete",
        payload: {
          lineIds: ["line-c"],
        },
      },
      {
        type: "section.delete",
        payload: {
          sectionIds: ["section-c"],
        },
      },
      {
        type: "scene.delete",
        payload: {
          sceneIds: ["scene-c"],
        },
      },
    ],
  },
  {
    fixtureName: "media-crud",
    initialState: createEmptyTestState(),
    commands: [
      {
        type: "project.create",
        payload: {
          state: createEmptyTestState(),
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "file-image",
          data: {
            mimeType: "image/png",
            size: 2048,
            sha256: "file-image-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "thumb-image",
          data: {
            mimeType: "image/webp",
            size: 128,
            sha256: "thumb-image-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "file-spritesheet",
          data: {
            mimeType: "image/png",
            size: 1024,
            sha256: "file-spritesheet-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "thumb-spritesheet",
          data: {
            mimeType: "image/webp",
            size: 64,
            sha256: "thumb-spritesheet-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "file-sound",
          data: {
            mimeType: "audio/mp3",
            size: 1024,
            sha256: "file-sound-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "waveform-sound",
          data: {
            mimeType: "application/json",
            size: 64,
            sha256: "waveform-sound-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "file-video",
          data: {
            mimeType: "video/mp4",
            size: 4096,
            sha256: "file-video-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "thumb-video",
          data: {
            mimeType: "image/jpeg",
            size: 128,
            sha256: "thumb-video-sha256",
          },
        },
      },
      {
        type: "image.create",
        payload: {
          imageId: "folder-art",
          data: { type: "folder", name: "Art" },
        },
      },
      {
        type: "image.create",
        payload: {
          imageId: "image-a",
          parentId: "folder-art",
          data: {
            type: "image",
            name: "Background",
            fileId: "file-image",
            thumbnailFileId: "thumb-image",
            width: 1920,
            height: 1080,
          },
        },
      },
      {
        type: "image.update",
        payload: {
          imageId: "image-a",
          data: { description: "Establishing shot" },
        },
      },
      {
        type: "image.move",
        payload: {
          imageId: "image-a",
          parentId: "folder-art",
          position: "last",
        },
      },
      {
        type: "spritesheet.create",
        payload: {
          spritesheetId: "folder-spritesheets",
          data: { type: "folder", name: "Spritesheets" },
        },
      },
      {
        type: "spritesheet.create",
        payload: {
          spritesheetId: "spritesheet-a",
          parentId: "folder-spritesheets",
          data: {
            type: "spritesheet",
            name: "Hero Idle",
            fileId: "file-spritesheet",
            thumbnailFileId: "thumb-spritesheet",
            width: 256,
            height: 256,
            jsonData: {
              meta: {
                image: "hero-idle.png",
              },
            },
            animations: {
              idle: {
                frames: [0, 1],
                animationSpeed: 1,
                loop: true,
              },
            },
          },
        },
      },
      {
        type: "spritesheet.update",
        payload: {
          spritesheetId: "spritesheet-a",
          data: { description: "Idle loop spritesheet" },
        },
      },
      {
        type: "spritesheet.move",
        payload: {
          spritesheetId: "spritesheet-a",
          parentId: "folder-spritesheets",
          position: "last",
        },
      },
      {
        type: "sound.create",
        payload: {
          soundId: "folder-audio",
          data: { type: "folder", name: "Audio" },
        },
      },
      {
        type: "sound.create",
        payload: {
          soundId: "sound-a",
          parentId: "folder-audio",
          data: {
            type: "sound",
            name: "Ambience",
            fileId: "file-sound",
            waveformDataFileId: "waveform-sound",
            duration: 42.5,
          },
        },
      },
      {
        type: "sound.update",
        payload: {
          soundId: "sound-a",
          data: { description: "Night ambience", waveformDataFileId: null },
        },
      },
      {
        type: "sound.move",
        payload: {
          soundId: "sound-a",
          parentId: "folder-audio",
          position: "last",
        },
      },
      {
        type: "video.create",
        payload: {
          videoId: "folder-video",
          data: { type: "folder", name: "Video" },
        },
      },
      {
        type: "video.create",
        payload: {
          videoId: "video-a",
          parentId: "folder-video",
          data: {
            type: "video",
            name: "Opening",
            fileId: "file-video",
            thumbnailFileId: "thumb-video",
            width: 1280,
            height: 720,
          },
        },
      },
      {
        type: "video.update",
        payload: {
          videoId: "video-a",
          data: { description: "Opening cinematic" },
        },
      },
      {
        type: "video.move",
        payload: {
          videoId: "video-a",
          parentId: "folder-video",
          position: "last",
        },
      },
      {
        type: "image.delete",
        payload: { imageIds: ["image-a", "folder-art"] },
      },
      {
        type: "spritesheet.delete",
        payload: { spritesheetIds: ["spritesheet-a", "folder-spritesheets"] },
      },
      {
        type: "sound.delete",
        payload: { soundIds: ["sound-a", "folder-audio"] },
      },
      {
        type: "video.delete",
        payload: { videoIds: ["video-a", "folder-video"] },
      },
      {
        type: "file.delete",
        payload: {
          fileIds: [
            "thumb-image",
            "file-image",
            "thumb-spritesheet",
            "file-spritesheet",
            "waveform-sound",
            "file-sound",
            "thumb-video",
            "file-video",
          ],
        },
      },
    ],
  },
  {
    fixtureName: "ui-resources-crud",
    initialState: createEmptyTestState(),
    commands: [
      { type: "project.create", payload: { state: createEmptyTestState() } },
      {
        type: "file.create",
        payload: {
          fileId: "file-font",
          data: {
            mimeType: "font/ttf",
            size: 2048,
            sha256: "file-font-sha256",
          },
        },
      },
      {
        type: "font.create",
        payload: {
          fontId: "folder-fonts",
          data: { type: "folder", name: "Fonts" },
        },
      },
      {
        type: "font.create",
        payload: {
          fontId: "font-ui",
          parentId: "folder-fonts",
          data: {
            type: "font",
            name: "UI Font",
            fileId: "file-font",
            fontFamily: "Suit",
          },
        },
      },
      {
        type: "font.update",
        payload: {
          fontId: "font-ui",
          data: { description: "Editorial serif family" },
        },
      },
      {
        type: "font.move",
        payload: {
          fontId: "font-ui",
          parentId: "folder-fonts",
          position: "last",
        },
      },
      {
        type: "color.create",
        payload: {
          colorId: "folder-colors",
          data: { type: "folder", name: "Colors" },
        },
      },
      {
        type: "color.create",
        payload: {
          colorId: "color-ui",
          parentId: "folder-colors",
          data: { type: "color", name: "White", hex: "#ffffff" },
        },
      },
      {
        type: "color.update",
        payload: {
          colorId: "color-ui",
          data: { description: "Core brand tone" },
        },
      },
      {
        type: "color.move",
        payload: {
          colorId: "color-ui",
          parentId: "folder-colors",
          position: "last",
        },
      },
      {
        type: "transform.create",
        payload: {
          transformId: "folder-transforms",
          data: { type: "folder", name: "Transforms" },
        },
      },
      {
        type: "transform.create",
        payload: {
          transformId: "transform-ui",
          parentId: "folder-transforms",
          data: {
            type: "transform",
            name: "Camera",
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            anchorX: 0,
            anchorY: 0,
            rotation: 0,
          },
        },
      },
      {
        type: "transform.update",
        payload: {
          transformId: "transform-ui",
          data: { description: "Default framing transform" },
        },
      },
      {
        type: "transform.move",
        payload: {
          transformId: "transform-ui",
          parentId: "folder-transforms",
          position: "last",
        },
      },
      {
        type: "variable.create",
        payload: {
          variableId: "folder-variables",
          data: { type: "folder", name: "Variables" },
        },
      },
      {
        type: "variable.create",
        payload: {
          variableId: "mood",
          parentId: "folder-variables",
          data: {
            type: "variable",
            variableType: "string",
            name: "Mood",
            scope: "device",
            isEnum: true,
            enumValues: ["calm", "tense"],
            default: "calm",
            value: "calm",
          },
        },
      },
      {
        type: "variable.update",
        payload: {
          variableId: "mood",
          data: {
            scope: "account",
            enumValues: ["calm", "tense", "urgent"],
            value: "tense",
          },
        },
      },
      {
        type: "variable.move",
        payload: {
          variableId: "mood",
          parentId: "folder-variables",
          position: "last",
        },
      },
      {
        type: "textStyle.create",
        payload: {
          textStyleId: "folder-styles",
          data: { type: "folder", name: "Styles" },
        },
      },
      {
        type: "textStyle.create",
        payload: {
          textStyleId: "style-ui",
          parentId: "folder-styles",
          data: {
            type: "textStyle",
            name: "Dialogue",
            fontId: "font-ui",
            colorId: "color-ui",
            fontSize: 32,
            lineHeight: 1.4,
            fontWeight: "700",
          },
        },
      },
      {
        type: "textStyle.update",
        payload: { textStyleId: "style-ui", data: { previewText: "Preview" } },
      },
      {
        type: "textStyle.move",
        payload: {
          textStyleId: "style-ui",
          parentId: "folder-styles",
          position: "last",
        },
      },
      {
        type: "textStyle.delete",
        payload: { textStyleIds: ["style-ui", "folder-styles"] },
      },
      {
        type: "variable.delete",
        payload: { variableIds: ["mood", "folder-variables"] },
      },
      {
        type: "transform.delete",
        payload: { transformIds: ["transform-ui", "folder-transforms"] },
      },
      {
        type: "color.delete",
        payload: { colorIds: ["color-ui", "folder-colors"] },
      },
      {
        type: "font.delete",
        payload: { fontIds: ["font-ui", "folder-fonts"] },
      },
      { type: "file.delete", payload: { fileIds: ["file-font"] } },
    ],
  },
  {
    fixtureName: "animation-crud",
    initialState: createEmptyTestState(),
    commands: [
      { type: "project.create", payload: { state: createEmptyTestState() } },
      {
        type: "file.create",
        payload: {
          fileId: "thumb-animation",
          data: {
            mimeType: "image/webp",
            size: 128,
            sha256: "thumb-animation-sha256",
          },
        },
      },
      {
        type: "animation.create",
        payload: {
          animationId: "folder-motion",
          data: { type: "folder", name: "Motion" },
        },
      },
      {
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          parentId: "folder-motion",
          data: {
            type: "animation",
            name: "Entrance",
            thumbnailFileId: "thumb-animation",
            preview: {
              background: {
                imageId: "image-background",
              },
              outgoing: {
                imageId: "image-outgoing",
              },
              incoming: {
                imageId: "image-incoming",
              },
            },
            animation: {
              type: "update",
              tween: {
                x: {
                  auto: {
                    duration: 1000,
                    easing: "linear",
                  },
                },
              },
            },
          },
        },
      },
      {
        type: "animation.update",
        payload: {
          animationId: "animation-a",
          data: {
            description: "Entrance motion",
            preview: {
              background: {
                imageId: "image-background",
              },
              outgoing: {
                imageId: "image-outgoing",
                transformId: "transform-outgoing",
              },
              incoming: {
                imageId: "image-incoming",
                transformId: "transform-incoming",
              },
            },
            animation: {
              type: "update",
              tween: {
                x: {
                  auto: {
                    duration: 1200,
                    easing: "easeOutQuad",
                  },
                },
                alpha: {
                  keyframes: [{ duration: 100, value: 1 }],
                },
              },
            },
          },
        },
      },
      {
        type: "animation.move",
        payload: {
          animationId: "animation-a",
          parentId: "folder-motion",
          position: "last",
        },
      },
      {
        type: "animation.delete",
        payload: { animationIds: ["animation-a", "folder-motion"] },
      },
    ],
  },
  {
    fixtureName: "character-crud",
    initialState: createEmptyTestState(),
    commands: [
      { type: "project.create", payload: { state: createEmptyTestState() } },
      {
        type: "file.create",
        payload: {
          fileId: "file-smile",
          data: {
            mimeType: "image/png",
            size: 256,
            sha256: "file-smile-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "file-angry",
          data: {
            mimeType: "image/png",
            size: 256,
            sha256: "file-angry-sha256",
          },
        },
      },
      {
        type: "character.create",
        payload: {
          characterId: "folder-cast",
          data: { type: "folder", name: "Cast" },
        },
      },
      {
        type: "character.create",
        payload: {
          characterId: "character-hero",
          parentId: "folder-cast",
          data: {
            type: "character",
            name: "Hero",
            sprites: { items: {}, tree: [] },
          },
        },
      },
      {
        type: "character.update",
        payload: {
          characterId: "character-hero",
          data: { description: "Lead actor" },
        },
      },
      {
        type: "character.sprite.create",
        payload: {
          characterId: "character-hero",
          spriteId: "folder-default",
          data: { type: "folder", name: "Default" },
        },
      },
      {
        type: "character.sprite.create",
        payload: {
          characterId: "character-hero",
          spriteId: "sprite-smile",
          parentId: "folder-default",
          data: {
            type: "image",
            name: "Smile",
            fileId: "file-smile",
            width: 512,
            height: 512,
          },
        },
      },
      {
        type: "character.sprite.update",
        payload: {
          characterId: "character-hero",
          spriteId: "sprite-smile",
          data: { name: "Smile Updated" },
        },
      },
      {
        type: "character.sprite.move",
        payload: {
          characterId: "character-hero",
          spriteId: "sprite-smile",
          parentId: "folder-default",
          position: "last",
        },
      },
      {
        type: "character.sprite.delete",
        payload: {
          characterId: "character-hero",
          spriteIds: ["sprite-smile", "folder-default"],
        },
      },
      {
        type: "character.move",
        payload: {
          characterId: "character-hero",
          parentId: "folder-cast",
          position: "last",
        },
      },
      {
        type: "character.delete",
        payload: { characterIds: ["character-hero", "folder-cast"] },
      },
      {
        type: "file.delete",
        payload: { fileIds: ["file-smile", "file-angry"] },
      },
    ],
  },
  {
    fixtureName: "tag-crud",
    initialState: createEmptyTestState(),
    commands: [
      { type: "project.create", payload: { state: createEmptyTestState() } },
      {
        type: "file.create",
        payload: {
          fileId: "file-image",
          data: {
            mimeType: "image/png",
            size: 256,
            sha256: "file-image-sha256",
          },
        },
      },
      {
        type: "file.create",
        payload: {
          fileId: "file-smile",
          data: {
            mimeType: "image/png",
            size: 256,
            sha256: "file-smile-sha256",
          },
        },
      },
      {
        type: "character.create",
        payload: {
          characterId: "character-hero",
          data: {
            type: "character",
            name: "Hero",
            sprites: { items: {}, tree: [] },
          },
        },
      },
      {
        type: "tag.create",
        payload: {
          scopeKey: "images",
          tagId: "tag-bg",
          data: {
            type: "tag",
            name: "Background",
          },
        },
      },
      {
        type: "tag.create",
        payload: {
          scopeKey: "characterSprites:character-hero",
          tagId: "tag-smile",
          data: {
            type: "tag",
            name: "Smile",
          },
        },
      },
      {
        type: "image.create",
        payload: {
          imageId: "image-a",
          data: {
            type: "image",
            name: "Background",
            fileId: "file-image",
            tagIds: ["tag-bg"],
          },
        },
      },
      {
        type: "character.sprite.create",
        payload: {
          characterId: "character-hero",
          spriteId: "sprite-smile",
          data: {
            type: "image",
            name: "Smile",
            fileId: "file-smile",
            tagIds: ["tag-smile"],
          },
        },
      },
      {
        type: "tag.update",
        payload: {
          scopeKey: "images",
          tagId: "tag-bg",
          data: {
            name: "Backdrop",
            color: "#112233",
          },
        },
      },
      {
        type: "tag.delete",
        payload: {
          scopeKey: "images",
          tagIds: ["tag-bg"],
        },
      },
      {
        type: "character.delete",
        payload: {
          characterIds: ["character-hero"],
        },
      },
    ],
  },
  {
    fixtureName: "layout-crud",
    initialState: createEmptyTestState(),
    commands: [
      { type: "project.create", payload: { state: createLayoutBaseState() } },
      {
        type: "layout.create",
        payload: {
          layoutId: "folder-layouts",
          data: { type: "folder", name: "Layouts" },
        },
      },
      {
        type: "layout.create",
        payload: {
          layoutId: "layout-alt",
          parentId: "folder-layouts",
          data: {
            type: "layout",
            name: "Alt Layout",
            description: "Alternate dialogue layout",
            layoutType: "general",
            thumbnailFileId: "thumb-spritesheet-ui",
            preview: {
              runtime: {
                autoMode: true,
              },
            },
            elements: { items: {}, tree: [] },
          },
        },
      },
      {
        type: "layout.update",
        payload: {
          layoutId: "layout-alt",
          data: {
            name: "Alt Layout Updated",
            preview: {
              variables: {
                score: 7,
              },
            },
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-alt",
          elementId: "container-root",
          data: {
            type: "container",
            name: "Root",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-alt",
          elementId: "text-a",
          parentId: "container-root",
          data: {
            type: "text",
            name: "Title",
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Hello",
            textStyleId: "text-style-ui",
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-alt",
          elementId: "anim-a",
          parentId: "container-root",
          data: {
            type: "spritesheet-animation",
            name: "Idle Loop",
            x: 0,
            y: 80,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            resourceId: "spritesheet-ui",
            animationName: "idle",
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-alt",
          elementId: "sprite-blur",
          parentId: "container-root",
          data: {
            type: "sprite",
            name: "Blurred Sprite",
            x: 0,
            y: 60,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            blur: createLayoutElementBlur(),
          },
        },
      },
      {
        type: "layout.element.create",
        payload: {
          layoutId: "layout-alt",
          elementId: "choice-single-item",
          parentId: "container-root",
          data: createChoiceSingleItemElementData({ choiceItemIndex: 0 }),
        },
      },
      {
        type: "layout.element.update",
        payload: {
          layoutId: "layout-alt",
          elementId: "text-a",
          data: {
            name: "Title Updated",
            scrollUp: {
              payload: {
                actions: {
                  nextLine: {},
                },
              },
            },
            scrollDown: {
              payload: {
                actions: {
                  toggleDialogueUI: {},
                },
              },
            },
          },
        },
      },
      {
        type: "layout.element.update",
        payload: {
          layoutId: "layout-alt",
          elementId: "sprite-blur",
          data: {
            blur: {
              x: 8,
              y: 10,
              quality: 4,
              kernelSize: 11,
              repeatEdgePixels: false,
            },
          },
        },
      },
      {
        type: "layout.element.update",
        payload: {
          layoutId: "layout-alt",
          elementId: "choice-single-item",
          data: {
            choiceItemIndex: 3,
          },
        },
      },
      {
        type: "layout.element.move",
        payload: {
          layoutId: "layout-alt",
          elementId: "text-a",
          parentId: "container-root",
          position: "last",
        },
      },
      {
        type: "layout.element.delete",
        payload: {
          layoutId: "layout-alt",
          elementIds: [
            "text-a",
            "anim-a",
            "sprite-blur",
            "choice-single-item",
            "container-root",
          ],
        },
      },
      {
        type: "layout.move",
        payload: {
          layoutId: "layout-alt",
          parentId: "folder-layouts",
          position: "last",
        },
      },
      {
        type: "layout.delete",
        payload: { layoutIds: ["layout-alt", "folder-layouts"] },
      },
    ],
  },
  {
    fixtureName: "control-crud",
    initialState: createEmptyTestState(),
    commands: [
      { type: "project.create", payload: { state: createControlBaseState() } },
      {
        type: "control.create",
        payload: {
          controlId: "folder-controls",
          data: { type: "folder", name: "Controls" },
        },
      },
      {
        type: "control.create",
        payload: {
          controlId: "control-alt",
          parentId: "folder-controls",
          data: {
            type: "control",
            name: "Alt Control",
            description: "Alternate navigation control",
            thumbnailFileId: "thumb-spritesheet-ui",
            preview: {
              runtime: {
                autoMode: true,
              },
            },
            elements: { items: {}, tree: [] },
          },
        },
      },
      {
        type: "control.update",
        payload: {
          controlId: "control-alt",
          data: {
            name: "Alt Control Updated",
            preview: {
              choice: {
                items: [{ content: "Continue" }],
              },
            },
            keyboard: {
              space: {
                payload: {
                  actions: {
                    toggleDialogueUI: {},
                  },
                },
              },
            },
            keyup: {
              space: {
                payload: {
                  actions: {
                    toggleSkipMode: {},
                  },
                },
              },
            },
          },
        },
      },
      {
        type: "control.element.create",
        payload: {
          controlId: "control-alt",
          elementId: "container-root",
          data: {
            type: "container",
            name: "Root",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
          },
        },
      },
      {
        type: "control.element.create",
        payload: {
          controlId: "control-alt",
          elementId: "text-a",
          parentId: "container-root",
          data: {
            type: "text",
            name: "Title",
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Hello",
            textStyleId: "text-style-ui",
          },
        },
      },
      {
        type: "control.element.create",
        payload: {
          controlId: "control-alt",
          elementId: "anim-a",
          parentId: "container-root",
          data: {
            type: "spritesheet-animation",
            name: "Idle Loop",
            x: 0,
            y: 80,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            resourceId: "spritesheet-ui",
            animationName: "idle",
          },
        },
      },
      {
        type: "control.element.create",
        payload: {
          controlId: "control-alt",
          elementId: "sprite-blur",
          parentId: "container-root",
          data: {
            type: "sprite",
            name: "Blurred Sprite",
            x: 0,
            y: 60,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            blur: createLayoutElementBlur(),
          },
        },
      },
      {
        type: "control.element.create",
        payload: {
          controlId: "control-alt",
          elementId: "choice-single-item",
          parentId: "container-root",
          data: createChoiceSingleItemElementData({ choiceItemIndex: 0 }),
        },
      },
      {
        type: "control.element.update",
        payload: {
          controlId: "control-alt",
          elementId: "text-a",
          data: {
            name: "Title Updated",
            scrollUp: {
              payload: {
                actions: {
                  nextLine: {},
                },
              },
            },
            scrollDown: {
              payload: {
                actions: {
                  toggleSkipMode: {},
                },
              },
            },
          },
        },
      },
      {
        type: "control.element.update",
        payload: {
          controlId: "control-alt",
          elementId: "sprite-blur",
          data: {
            blur: {
              x: 8,
              y: 10,
              quality: 4,
              kernelSize: 11,
              repeatEdgePixels: false,
            },
          },
        },
      },
      {
        type: "control.element.update",
        payload: {
          controlId: "control-alt",
          elementId: "choice-single-item",
          data: {
            choiceItemIndex: 3,
          },
        },
      },
      {
        type: "control.element.move",
        payload: {
          controlId: "control-alt",
          elementId: "text-a",
          parentId: "container-root",
          position: "last",
        },
      },
      {
        type: "control.element.delete",
        payload: {
          controlId: "control-alt",
          elementIds: [
            "text-a",
            "anim-a",
            "sprite-blur",
            "choice-single-item",
            "container-root",
          ],
        },
      },
      {
        type: "control.move",
        payload: {
          controlId: "control-alt",
          parentId: "folder-controls",
          position: "last",
        },
      },
      {
        type: "control.delete",
        payload: { controlIds: ["control-alt", "folder-controls"] },
      },
    ],
  },
];

const writeYaml = async (fileUrl, value) => {
  await mkdir(new URL("./", fileUrl), { recursive: true });
  await writeFile(
    fileUrl,
    yaml.dump(value, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
    }),
  );
};

const generatePayloadFixtures = async () => {
  await rm(new URL("./payloads/", COMPAT_SCHEMA_ROOT), {
    recursive: true,
    force: true,
  });

  for (const fixture of payloadFixtures) {
    await writeYaml(
      new URL(
        `./payloads/${fixture.type}/${fixture.fixtureName}.yaml`,
        COMPAT_SCHEMA_ROOT,
      ),
      {
        schemaVersion: SCHEMA_VERSION,
        type: fixture.type,
        payload: fixture.payload,
      },
    );
  }
};

const generateStateFixtures = async () => {
  await rm(new URL("./states/", COMPAT_SCHEMA_ROOT), {
    recursive: true,
    force: true,
  });

  for (const fixture of stateFixtures) {
    await writeYaml(
      new URL(`./states/${fixture.fixtureName}.yaml`, COMPAT_SCHEMA_ROOT),
      {
        schemaVersion: SCHEMA_VERSION,
        state: fixture.state,
      },
    );
  }
};

const generateStreamFixtures = async () => {
  await rm(new URL("./streams/", COMPAT_SCHEMA_ROOT), {
    recursive: true,
    force: true,
  });

  for (const fixture of streamFixtures) {
    await writeYaml(
      new URL(`./streams/${fixture.fixtureName}.yaml`, COMPAT_SCHEMA_ROOT),
      {
        schemaVersion: SCHEMA_VERSION,
        initialState: fixture.initialState,
        commands: fixture.commands,
      },
    );
  }
};

await generatePayloadFixtures();
await generateStateFixtures();
await generateStreamFixtures();

console.log(
  `Generated schema-${SCHEMA_VERSION} compatibility fixtures in ${COMPAT_SCHEMA_ROOT.pathname}`,
);
