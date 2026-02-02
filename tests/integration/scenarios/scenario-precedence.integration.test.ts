import { describe, it, expect } from "vitest";
import { createServer } from "../../../src/server/server";
import { ScenarioState } from "../../../src/state/scenario-state";
import { createNullEventLogger } from "../../../src/logging/event-logger";
import type { ApiRoute } from "../../../src/openapi/types";
import type { LoadedScenario } from "../../../src/scenarios/types";

const routes: ApiRoute[] = [
  {
    method: "GET",
    path: "/contracts",
    fastifyPath: "/contracts",
    operation: {} as ApiRoute["operation"],
    responses: {},
  },
];

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

describe("server", () => {
  describe("scenario precedence", () => {
    it("should prefer header override over active scenario", async () => {
      const state = new ScenarioState();
      state.set("HappyPath");

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
        headers: { "x-mockhub-scenario": "PartnerDown" },
      });

      expect(response.statusCode).toBe(503);
      await server.close();
    });
  });
});
