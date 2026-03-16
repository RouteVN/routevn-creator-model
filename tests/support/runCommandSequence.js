import { expect } from "vitest";

import { processCommand, validateState } from "../../src/index.js";
import { deepFreeze } from "./deepFreeze.js";

export const runCommandSequence = ({ initialState, commands }) => {
  const immutableInitialState = structuredClone(initialState);
  deepFreeze(immutableInitialState);

  validateState({ state: immutableInitialState });

  let currentState = immutableInitialState;

  return commands.map((command, index) => {
    const previousSnapshot = structuredClone(currentState);

    const result = processCommand({
      state: currentState,
      command,
    });

    expect(currentState).toEqual(previousSnapshot);
    expect(result.state).not.toBe(currentState);

    validateState({ state: result.state });

    const step = {
      index,
      command: structuredClone(command),
      previousState: previousSnapshot,
      state: structuredClone(result.state),
    };

    currentState = deepFreeze(structuredClone(result.state));

    return step;
  });
};
