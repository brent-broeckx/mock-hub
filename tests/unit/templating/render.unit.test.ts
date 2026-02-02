import { describe, it, expect } from "vitest";
import { createTemplateRuntime, renderTemplates } from "../../../src/templating";

describe("templating", () => {
  describe("render", () => {
    it("should render increment helper deterministically", () => {
      const runtime = createTemplateRuntime();
      const result = renderTemplates("id-{{increment}}-{{increment}}", runtime);

      expect(result.value).toBe("id-1-2");
      expect(result.helpers).toEqual(["increment"]);
    });
  });
});
