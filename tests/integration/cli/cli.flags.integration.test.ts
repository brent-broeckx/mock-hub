import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execa } from "../../helpers/execa";

const distCli = resolve(process.cwd(), "dist/cli.js");
const hasDist = existsSync(distCli);

const runIfDist = it.runIf(hasDist);

describe("cli", () => {
  runIfDist("should fail fast when --spec is missing", async () => {
    const result = await execa("node", [distCli, "run"]);

    expect(result.exitCode).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toContain("--spec");
  });

  runIfDist("should show help and exit 0", async () => {
    const result = await execa("node", [distCli, "run", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--spec");
  });
});
