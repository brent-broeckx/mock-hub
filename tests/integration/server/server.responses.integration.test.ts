import { describe, it, expect, vi } from "vitest";
import { createServer } from "../../../src/server/server";
import { ScenarioState } from "../../../src/state/scenario-state";
import { createNullEventLogger } from "../../../src/logging/event-logger";
import type { ApiRoute } from "../../../src/openapi/types";
import type { LoadedScenario } from "../../../src/scenarios/types";
import fs from "node:fs/promises";
import { resolve } from "node:path";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
  },
}));

const routes: ApiRoute[] = [
  {
    method: "GET",
    path: "/contracts",
    fastifyPath: "/contracts",
    operation: {} as ApiRoute["operation"],
    responses: {
      "200": {
        description: "ok",
        content: {
          "application/json": {
            example: { ok: true },
          },
        },
      },
    },
  },
];

describe("server", () => {
  describe("responses", () => {
    it("should return the scenario response body when provided", async () => {
      const scenarios: LoadedScenario[] = [
        {
          scenario: "PartnerDown",
          version: "1.0.0",
          rules: [
            {
              id: "partner-down",
              match: { path: "/contracts", method: "GET" },
              respond: { status: 503, body: { error: "down" } },
            },
          ],
          sourcePath: "/scenarios/partner-down.yaml",
          sourceDir: "/scenarios",
        },
      ];

      const state = new ScenarioState();
      state.set("PartnerDown");

      const server = createServer({
        routes,
        scenarios,
        scenarioState: state,
        port: 0,
        eventLogger: createNullEventLogger(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/contracts",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "down" });
      await server.close();
    });

    it("should return the scenario bodyFile contents when provided", async () => {
      const readFile = vi.mocked(fs.readFile);
      readFile.mockResolvedValueOnce("{\"result\":\"from-file\"}");

      const scenarios: LoadedScenario[] = [
        {
          scenario: "BodyFile",
          version: "1.0.0",
          rules: [
            {
              id: "from-file",
              match: { path: "/contracts", method: "GET" },
              respond: { status: 200, bodyFile: "responses/contract.json" },
            },
          ],
          sourcePath: "/scenarios/body-file.yaml",
          sourceDir: "/scenarios",
        },
      ];

      const state = new ScenarioState();
      state.set("BodyFile");

      const server = createServer({
        routes,
        scenarios,
        scenarioState: state,
        port: 0,
        eventLogger: createNullEventLogger(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/contracts",
      });

      expect(readFile).toHaveBeenCalledWith(resolve("/scenarios", "responses/contract.json"), "utf-8");
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ result: "from-file" });
      await server.close();
    });

    it("should return a generated happy-path response when no scenario matches", async () => {
      const state = new ScenarioState();

      const server = createServer({
        routes,
        scenarios: [],
        scenarioState: state,
        port: 0,
        eventLogger: createNullEventLogger(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/contracts",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      await server.close();
    });
  });
});
