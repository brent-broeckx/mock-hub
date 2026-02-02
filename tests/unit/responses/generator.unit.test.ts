import { describe, it, expect, vi } from "vitest";
import { generateHappyPathResponse } from "../../../src/responses/generator";
import type { OpenAPIV3 } from "openapi-types";
import { JSONSchemaFaker } from "json-schema-faker";

vi.mock("json-schema-faker", () => ({
  JSONSchemaFaker: {
    option: vi.fn(),
    generate: vi.fn(),
  },
}));

describe("responses", () => {
  describe("generator", () => {
    it("should pick the lowest 2xx response and use the example", () => {
      const responses: OpenAPIV3.ResponsesObject = {
        "201": {
          description: "created",
          content: {
            "application/json": { example: { ok: "created" } },
          },
        },
        "200": {
          description: "ok",
          content: {
            "application/json": { example: { ok: "ok" } },
          },
        },
      };

      const result = generateHappyPathResponse(responses);

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: "ok" });
    });

    it("should fall back to the lowest status when no 2xx exists", () => {
      const responses: OpenAPIV3.ResponsesObject = {
        "404": { description: "not found" },
        "500": { description: "server error" },
      };

      const result = generateHappyPathResponse(responses);

      expect(result.status).toBe(404);
      expect(result.body).toBeUndefined();
    });

    it("should prefer examples over schema generation", () => {
      const responses: OpenAPIV3.ResponsesObject = {
        "200": {
          description: "ok",
          content: {
            "application/json": {
              example: { ok: true },
              schema: {
                type: "object",
                properties: { ok: { type: "boolean" } },
              },
            },
          },
        },
      };

      const result = generateHappyPathResponse(responses);

      expect(result.body).toEqual({ ok: true });
      expect(vi.mocked(JSONSchemaFaker.generate)).not.toHaveBeenCalled();
    });

    it("should generate from schema when example is missing", () => {
      vi.mocked(JSONSchemaFaker.generate).mockReturnValue({ id: 123 });

      const responses: OpenAPIV3.ResponsesObject = {
        "200": {
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { id: { type: "number" } },
              },
            },
          },
        },
      };

      const result = generateHappyPathResponse(responses);

      expect(result.body).toEqual({ id: 123 });
      expect(vi.mocked(JSONSchemaFaker.generate)).toHaveBeenCalled();
    });
  });
});
