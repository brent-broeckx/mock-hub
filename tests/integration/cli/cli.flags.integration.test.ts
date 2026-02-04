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
    // expect(`${result.stderr}${result.stdout}`).toContain(
    //   "OpenAPI spec is required when not using --proxy"
    // );
  });

  runIfDist("should show help and exit 0", async () => {
    const result = await execa("node", [distCli, "run", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--spec");
  });

  runIfDist("should allow proxy without spec", async () => {
    let result: { stdout?: string; stderr?: string } | undefined;

    try {
      result = await execa("node", [distCli, "run", "--proxy", "http://localhost:8080"], {
        timeout: 300,
      });
    } catch (error) {
      result = error as { stdout?: string; stderr?: string };
    }

    const output = `${result?.stderr ?? ""}${result?.stdout ?? ""}`;
    expect(output).not.toContain("OpenAPI spec is required when not using --proxy");
  });
});
