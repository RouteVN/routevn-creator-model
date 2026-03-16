import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

import { validatePayload } from "../src/index.js";

const animationSchemaPath = new URL(
  "./fixtures/route-graphics-animation-contract.json",
  import.meta.url,
);

const contract = JSON.parse(await readFile(animationSchemaPath, "utf8"));
const { easingKeys, liveTweenProperties, replaceTweenProperties } = contract;

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
