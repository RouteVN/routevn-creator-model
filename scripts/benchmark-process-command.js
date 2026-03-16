import { performance } from "node:perf_hooks";

import { processCommand } from "../src/index.js";

const createEmptyState = () => ({
  project: {},
  story: {
    initialSceneId: "scene-0",
  },
  scenes: {
    items: {},
    tree: [],
  },
  sections: {
    items: {},
    tree: [],
  },
  lines: {
    items: {},
    tree: [],
  },
  images: {
    items: {},
    tree: [],
  },
  sounds: {
    items: {},
    tree: [],
  },
  videos: {
    items: {},
    tree: [],
  },
  animations: {
    items: {},
    tree: [],
  },
  characters: {
    items: {},
    tree: [],
  },
  fonts: {
    items: {},
    tree: [],
  },
  transforms: {
    items: {},
    tree: [],
  },
  colors: {
    items: {},
    tree: [],
  },
  textStyles: {
    items: {},
    tree: [],
  },
  variables: {
    items: {},
    tree: [],
  },
  layouts: {
    items: {},
    tree: [],
  },
});

const createBenchmarkState = ({
  sceneCount = 40,
  sectionsPerScene = 6,
  linesPerSection = 16,
  imageCount = 200,
  variableCount = 120,
  layoutElementCount = 40,
} = {}) => {
  const state = createEmptyState();

  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    const sceneId = `scene-${sceneIndex}`;
    state.scenes.items[sceneId] = {
      id: sceneId,
      type: "scene",
      name: `Scene ${sceneIndex}`,
    };
    state.scenes.tree.push({ id: sceneId, children: [] });

    for (let sectionIndex = 0; sectionIndex < sectionsPerScene; sectionIndex += 1) {
      const sectionId = `section-${sceneIndex}-${sectionIndex}`;
      state.sections.items[sectionId] = {
        id: sectionId,
        sceneId,
        name: `Section ${sceneIndex}-${sectionIndex}`,
      };
      state.sections.tree.push({ id: sectionId, children: [] });

      for (let lineIndex = 0; lineIndex < linesPerSection; lineIndex += 1) {
        const lineId = `line-${sceneIndex}-${sectionIndex}-${lineIndex}`;
        state.lines.items[lineId] = {
          id: lineId,
          sectionId,
          actions: {
            say: `${sceneIndex}-${sectionIndex}-${lineIndex}`,
          },
        };
        state.lines.tree.push({ id: lineId });
      }
    }
  }

  for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
    const imageId = `image-${imageIndex}`;
    state.images.items[imageId] = {
      id: imageId,
      type: "image",
      name: `Image ${imageIndex}`,
      fileId: `file-image-${imageIndex}`,
    };
    state.images.tree.push({ id: imageId, children: [] });
  }

  for (let variableIndex = 0; variableIndex < variableCount; variableIndex += 1) {
    const variableId = `variable-${variableIndex}`;
    state.variables.items[variableId] = {
      id: variableId,
      type: "number",
      name: `Variable ${variableIndex}`,
      scope: "context",
      default: 0,
      value: variableIndex,
    };
    state.variables.tree.push({ id: variableId, children: [] });
  }

  state.fonts.items["font-ui"] = {
    id: "font-ui",
    type: "font",
    name: "UI Font",
    fileId: "file-font-ui",
    fontFamily: "Suit",
  };
  state.fonts.tree.push({ id: "font-ui", children: [] });

  state.colors.items["color-ui"] = {
    id: "color-ui",
    type: "color",
    name: "White",
    hex: "#ffffff",
  };
  state.colors.tree.push({ id: "color-ui", children: [] });

  state.textStyles.items["text-style-ui"] = {
    id: "text-style-ui",
    type: "textStyle",
    name: "UI",
    fontId: "font-ui",
    colorId: "color-ui",
    fontSize: 32,
    lineHeight: 1.4,
    fontWeight: "700",
  };
  state.textStyles.tree.push({ id: "text-style-ui", children: [] });

  state.layouts.items["layout-dialogue"] = {
    id: "layout-dialogue",
    type: "layout",
    name: "Dialogue",
    layoutType: "dialogue",
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
        },
      },
      tree: [
        {
          id: "container-root",
          children: [],
        },
      ],
    },
  };
  state.layouts.tree.push({ id: "layout-dialogue", children: [] });

  for (
    let elementIndex = 0;
    elementIndex < layoutElementCount;
    elementIndex += 1
  ) {
    const elementId = `text-${elementIndex}`;
    state.layouts.items["layout-dialogue"].elements.items[elementId] = {
      id: elementId,
      type: "text",
      name: `Text ${elementIndex}`,
      x: elementIndex * 4,
      y: elementIndex * 2,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      text: `Text ${elementIndex}`,
      textStyleId: "text-style-ui",
    };
    state.layouts.items["layout-dialogue"].elements.tree[0].children.push({
      id: elementId,
      children: [],
    });
  }

  return state;
};

const benchmark = ({ label, iterations, state, command }) => {
  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    processCommand({ state, command });
  }

  const elapsedMs = performance.now() - startedAt;
  const averageMs = elapsedMs / iterations;
  const commandsPerSecond = (iterations / elapsedMs) * 1000;

  return {
    label,
    iterations,
    elapsedMs,
    averageMs,
    commandsPerSecond,
  };
};

const state = createBenchmarkState();

const results = [
  benchmark({
    label: "scene.update",
    iterations: 250,
    state,
    command: {
      type: "scene.update",
      payload: {
        sceneId: "scene-10",
        data: {
          name: "Scene 10 Updated",
        },
      },
    },
  }),
  benchmark({
    label: "line.update_actions",
    iterations: 250,
    state,
    command: {
      type: "line.update_actions",
      payload: {
        lineId: "line-10-2-8",
        data: {
          mood: "tense",
        },
      },
    },
  }),
  benchmark({
    label: "image.move",
    iterations: 250,
    state,
    command: {
      type: "image.move",
      payload: {
        imageId: "image-25",
        position: "before",
        positionTargetId: "image-24",
      },
    },
  }),
  benchmark({
    label: "layout.element.update",
    iterations: 250,
    state,
    command: {
      type: "layout.element.update",
      payload: {
        layoutId: "layout-dialogue",
        elementId: "text-10",
        data: {
          opacity: 0.5,
        },
      },
    },
  }),
];

for (const result of results) {
  console.log(
    `${result.label}: ${result.averageMs.toFixed(3)} ms/op (${result.commandsPerSecond.toFixed(1)} ops/s) over ${result.iterations} iterations`,
  );
}
