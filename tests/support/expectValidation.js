import { expect } from "vitest";

const expectMessage = ({ message, expected }) => {
  if (expected instanceof RegExp) {
    expect(message).toMatch(expected);
    return;
  }

  expect(message).toBe(expected);
};

export const expectValidation = (callback) => ({
  toThrow(expected) {
    const result = callback();

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expectMessage({
      message: result.error.message,
      expected,
    });
  },
  not: {
    toThrow() {
      const result = callback();
      expect(result).toEqual({ valid: true });
    },
  },
});
