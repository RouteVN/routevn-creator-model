import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

import { validatePayload } from "../src/index.js";

const animationSchemaPath = new URL(
  "./fixtures/route-graphics-animation-contract.json",
  import.meta.url,
);

const contract = JSON.parse(await readFile(animationSchemaPath, "utf8"));
const { easingKeys, updateTweenProperties, transitionTweenProperties } = contract;

test("animation easing support stays in sync with Route Graphics", () => {
  expect(easingKeys.length).toBeGreaterThan(0);

  for (const easing of easingKeys) {
    expect(
      validatePayload({
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          data: {
            type: "animation",
            name: "Anim",
            animation: {
              type: "update",
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
    ).toEqual({ valid: true });
  }
});

test("animation update and transition tween properties stay in sync with Route Graphics", () => {
  expect(updateTweenProperties).toEqual([
    "alpha",
    "x",
    "y",
    "scaleX",
    "scaleY",
    "rotation",
  ]);

  expect(transitionTweenProperties).toEqual([
    "translateX",
    "translateY",
    "alpha",
    "scaleX",
    "scaleY",
    "rotation",
  ]);

  for (const propertyName of updateTweenProperties) {
    expect(
      validatePayload({
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          data: {
            type: "animation",
            name: "Anim",
            animation: {
              type: "update",
              tween: {
                [propertyName]: {
                  keyframes: [{ duration: 100, value: 1 }],
                },
              },
            },
          },
        },
      }),
    ).toEqual({ valid: true });
  }

  for (const propertyName of transitionTweenProperties) {
    expect(
      validatePayload({
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          data: {
            type: "animation",
            name: "Anim",
            animation: {
              type: "transition",
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
    ).toEqual({ valid: true });
  }
});

test("animation mask variants from Route Graphics remain accepted", () => {
  expect(
    validatePayload({
      type: "animation.create",
      payload: {
        animationId: "animation-sequence",
        data: {
          type: "animation",
          name: "Mask Sequence",
          animation: {
            type: "transition",
            mask: {
              kind: "sequence",
              textures: ["a", "b"],
            },
          },
        },
      },
    }),
  ).toEqual({ valid: true });

  expect(
    validatePayload({
      type: "animation.create",
      payload: {
        animationId: "animation-composite",
        data: {
          type: "animation",
          name: "Mask Composite",
          animation: {
            type: "transition",
            mask: {
              kind: "composite",
              items: [{ texture: "a", channel: "alpha" }],
            },
          },
        },
      },
    }),
  ).toEqual({ valid: true });
});
