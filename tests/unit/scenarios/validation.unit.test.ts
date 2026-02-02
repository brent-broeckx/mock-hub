import { describe, it, expect, beforeEach } from "vitest";
import { loadFs, resetFs } from "../../helpers/memfs";
import { validateScenarioFile } from "../../../src/scenarios/validation";

describe("scenarios", () => {
  describe("validation", () => {
    beforeEach(() => {
      resetFs();
    });

    it("should reject invalid HTTP method", async () => {
      loadFs({
        "/scenarios/invalid.yaml": [
          "scenario: BadMethod",
          "version: 1.0.0",
          "rules:",
          "  - id: bad-method",
          "    match:",
          "      path: /contracts",
          "      method: FETCH",
          "    respond:",
          "      status: 200",
        ].join("\n"),
      });

      const result = await validateScenarioFile("/scenarios/invalid.yaml");

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("valid HTTP method");
    });
  });
});
