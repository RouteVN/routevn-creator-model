const deepFreezeValue = (value, seen) => {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    seen.has(value)
  ) {
    return value;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreezeValue(entry, seen);
    }
  } else {
    for (const entry of Object.values(value)) {
      deepFreezeValue(entry, seen);
    }
  }

  return Object.freeze(value);
};

export const deepFreeze = (value) => {
  return deepFreezeValue(value, new Set());
};
