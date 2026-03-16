import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

import { validatePayload } from "../src/index.js";

const animationSchemaPath =
  new URL(
    "../../route-graphics/src/schemas/animations/animation.yaml",
    import.meta.url,
  );

const schemaText = await readFile(animationSchemaPath, "utf8");

const extractEnumEntries = ({ startMarker, endMarker }) => {
  const block = schemaText.split(startMarker)[1]?.split(endMarker)[0] ?? "";

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
};

const extractPropertyNames = ({ sectionName }) => {
  const block =
    schemaText
      .split(`  ${sectionName}:\n`)[1]
      ?.split("    additionalProperties: false")[0] ?? "";

  return block
    .split("\n")
    .map((line) => line.match(/^      ([A-Za-z0-9]+):$/)?.[1])
    .filter(Boolean);
};

const easingKeys = extractEnumEntries({
  startMarker: "      easing:\n        type: string\n        description: Easing function to use.\n        enum:\n",
  endMarker: "      relative:",
});

const liveTweenProperties = extractPropertyNames({
  sectionName: "liveTween",
});

const replaceTweenProperties = extractPropertyNames({
  sectionName: "replaceTween",
});

test("animation easing support stays in sync with Route Graphics", () => {
  expect(easingKeys.length).toBeGreaterThan(0);

  for (const easing of easingKeys) {
    expect(() =>
      validatePayload({
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          data: {
            type: "animation",
            name: "Anim",
            animation: {
              type: "live",
              tween: {
                x: {
                  keyframes: [
                    {
                      duration: 100,
                      value: 1,
                      easing,
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    ).not.toThrow();
  }
});

test("animation live and replace tween properties stay in sync with Route Graphics", () => {
  expect(liveTweenProperties).toEqual([
    "alpha",
    "x",
    "y",
    "scaleX",
    "scaleY",
    "rotation",
  ]);

  expect(replaceTweenProperties).toEqual([
    "translateX",
    "translateY",
    "alpha",
    "scaleX",
    "scaleY",
    "rotation",
  ]);

  for (const propertyName of liveTweenProperties) {
    expect(() =>
      validatePayload({
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          data: {
            type: "animation",
            name: "Anim",
            animation: {
              type: "live",
              tween: {
                [propertyName]: {
                  keyframes: [{ duration: 100, value: 1 }],
                },
              },
            },
          },
        },
      }),
    ).not.toThrow();
  }

  for (const propertyName of replaceTweenProperties) {
    expect(() =>
      validatePayload({
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          data: {
            type: "animation",
            name: "Anim",
            animation: {
              type: "replace",
              prev: {
                tween: {
                  [propertyName]: {
                    keyframes: [{ duration: 100, value: 1 }],
                  },
                },
              },
            },
          },
        },
      }),
    ).not.toThrow();
  }
});

test("animation mask variants from Route Graphics remain accepted", () => {
  expect(() =>
    validatePayload({
      type: "animation.create",
      payload: {
        animationId: "animation-sequence",
        data: {
          type: "animation",
          name: "Mask Sequence",
          animation: {
            type: "replace",
            mask: {
              kind: "sequence",
              textures: ["a", "b"],
            },
          },
        },
      },
    }),
  ).not.toThrow();

  expect(() =>
    validatePayload({
      type: "animation.create",
      payload: {
        animationId: "animation-composite",
        data: {
          type: "animation",
          name: "Mask Composite",
          animation: {
            type: "replace",
            mask: {
              kind: "composite",
              items: [{ texture: "a", channel: "alpha" }],
            },
          },
        },
      },
    }),
  ).not.toThrow();
});
