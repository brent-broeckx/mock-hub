import { describe, it, expect, vi } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { extractRoutes, loadOpenApiSpec } from "../../../src/openapi/parser";
import type { OpenAPIV3 } from "openapi-types";

vi.mock("@apidevtools/swagger-parser", () => ({
  default: { dereference: vi.fn() },
}));

describe("openapi", () => {
  describe("parser", () => {
    it("should call dereference and return the spec", async () => {
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {},
      };

      const dereference = vi.mocked(SwaggerParser.dereference);
      dereference.mockResolvedValue(spec);

      const result = await loadOpenApiSpec("/specs/openapi.yaml");

      expect(dereference).toHaveBeenCalledWith("/specs/openapi.yaml");
      expect(result).toBe(spec);
    });

    it("should extract routes from a valid spec", () => {
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/pets": {
            get: {
              responses: {
                "200": { description: "ok" },
              },
            },
          },
        },
      };

      const routes = extractRoutes(spec);

      expect(routes).toHaveLength(1);
      expect(routes[0].method).toBe("GET");
      expect(routes[0].path).toBe("/pets");
    });
  });
});
