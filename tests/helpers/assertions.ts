export const expectSubset = <T extends object>(actual: T, subset: Partial<T>): void => {
  for (const [key, value] of Object.entries(subset)) {
    if ((actual as Record<string, unknown>)[key] !== value) {
      throw new Error(`Expected ${key} to be ${String(value)}`);
    }
  }
};
