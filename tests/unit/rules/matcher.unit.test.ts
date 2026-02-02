import { describe, it, expect } from "vitest";
import { findMatchingRule } from "../../../src/rules/matcher";
import type { ScenarioRule } from "../../../src/scenarios/types";

const rule = (overrides: Partial<ScenarioRule>): ScenarioRule => ({
  id: "rule-1",
  match: {
    path: "/contracts/*",
    method: "GET",
  },
  respond: {
    status: 200,
    body: { ok: true },
  },
  ...overrides,
});

describe("rules", () => {
  describe("matcher", () => {
    it("should match path wildcard and method", () => {
      const match = findMatchingRule(
        [rule({})],
        {
          method: "GET",
          path: "/contracts/123",
          headers: {},
          query: {},
        }
      );

      expect(match?.rule.id).toBe("rule-1");
    });

    it("should match headers case-insensitively", () => {
      const match = findMatchingRule(
        [
          rule({
            match: {
              path: "/contracts",
              method: "GET",
              headers: { "X-User-Type": "premium" },
            },
          }),
        ],
        {
          method: "GET",
          path: "/contracts",
          headers: { "x-user-type": "premium" },
          query: {},
        }
      );

      expect(match?.rule.id).toBe("rule-1");
    });

    it("should prefer more specific query match", () => {
      const match = findMatchingRule(
        [
          rule({
            id: "less-specific",
            match: { path: "/contracts", method: "GET" },
          }),
          rule({
            id: "more-specific",
            match: { path: "/contracts", method: "GET", query: { dryRun: "true" } },
          }),
        ],
        {
          method: "GET",
          path: "/contracts",
          headers: {},
          query: { dryRun: "true" },
        }
      );

      expect(match?.rule.id).toBe("more-specific");
    });
  });
});
