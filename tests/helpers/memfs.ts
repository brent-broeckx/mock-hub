import { vi } from "vitest";
import { fs as memfs, vol } from "memfs";

vi.mock("node:fs", () => memfs);
vi.mock("fs", () => memfs);
vi.mock("node:fs/promises", () => ({
  default: memfs.promises,
  ...memfs.promises,
}));
vi.mock("fs/promises", () => ({
  default: memfs.promises,
  ...memfs.promises,
}));

export const resetFs = (): void => {
  vol.reset();
};

export const loadFs = (files: Record<string, string>): void => {
  vol.fromJSON(files, "/");
};

export { memfs, vol };
