import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

import { validatePayload } from "../src/index.js";

const contractPath = new URL(
  "./fixtures/route-engine-audio-effect-contract.json",
  import.meta.url,
);
const contract = JSON.parse(await readFile(contractPath, "utf8"));

const createCommand = (audioEffect) => ({
  type: "audioEffect.create",
  payload: {
    audioEffectId: "audio-effect-a",
    data: {
      type: "audioEffect",
      name: "Audio Effect",
      audioEffect,
    },
  },
});

test("audio effect easing support stays in sync with Route Engine", () => {
  expect(contract.easingKeys.length).toBeGreaterThan(0);

  for (const easing of contract.easingKeys) {
    expect(
      validatePayload(
        createCommand({
          type: "transition",
          next: {
            fade: {
              duration: 100,
              easing,
            },
          },
        }),
      ),
    ).toEqual({ valid: true });
  }
});

test("audio effect tween properties stay in sync with Route Engine", () => {
  expect(contract.tweenProperties).toEqual(["volume", "pan", "playbackRate"]);
  expect(contract.updateEndpoint).toEqual({
    valueType: "number",
    relative: false,
  });

  const endpointValues = { volume: 50, pan: 0, playbackRate: 1 };

  for (const property of contract.tweenProperties) {
    expect(
      validatePayload(
        createCommand({
          type: "update",
          tween: {
            [property]: {
              keyframes: [{ value: endpointValues[property], duration: 100 }],
            },
          },
        }),
      ),
    ).toEqual({ valid: true });
  }
});

test("audio effect transition fade keyframes stay in sync with Route Engine", () => {
  expect(contract.transitionFade).toEqual({
    valueType: "number",
    minimum: 0,
    maximum: 100,
    relative: false,
    prevEndpoint: 0,
    nextEndpoint: 100,
  });

  for (const [side, endpoint] of [
    ["prev", contract.transitionFade.prevEndpoint],
    ["next", contract.transitionFade.nextEndpoint],
  ]) {
    expect(
      validatePayload(
        createCommand({
          type: "transition",
          [side]: {
            fade: {
              keyframes: [
                {
                  value: contract.transitionFade.minimum,
                  duration: 100,
                },
                {
                  value: contract.transitionFade.maximum,
                  duration: 100,
                },
                { value: endpoint, duration: 100 },
              ],
            },
          },
        }),
      ),
    ).toEqual({ valid: true });
  }
});

test("audio effect absolute numeric bounds stay in sync with Route Engine", () => {
  expect(contract.absoluteBounds).toEqual({
    volume: { minimum: 0, maximum: 100 },
    pan: { minimum: -1, maximum: 1 },
    playbackRate: { minimum: 0 },
  });

  for (const [property, bounds] of Object.entries(contract.absoluteBounds)) {
    const acceptedValues = [bounds.minimum];
    if (bounds.maximum !== undefined) {
      acceptedValues.push(bounds.maximum);
    }

    for (const value of acceptedValues) {
      expect(
        validatePayload(
          createCommand({
            type: "update",
            tween: {
              [property]: {
                keyframes: [
                  { startValue: value, value, duration: 0 },
                  { value, duration: 0 },
                ],
              },
            },
          }),
        ),
      ).toEqual({ valid: true });
    }
  }
});
