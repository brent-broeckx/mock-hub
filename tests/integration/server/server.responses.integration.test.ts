import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  describe("proxy", () => {
    const proxyBaseUrl = "http://localhost:8080";
    const makeResponse = (status: number, headers: Record<string, string>, body: string) =>
      ({
        status,
        headers: new Headers(headers),
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      }) as unknown as Response;

    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("should proxy instead of happy-path when proxy enabled", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        makeResponse(200, { "content-type": "application/json" }, "{\"proxied\":true}")
      );

      const server = createServer({
        routes,
        scenarios: [],
        scenarioState: new ScenarioState(),
        port: 0,
        eventLogger: createNullEventLogger(),
        proxyBaseUrl,
      });

      const response = await server.inject({
        method: "GET",
        url: "/contracts",
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("{\"proxied\":true}");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await server.close();
    });

    it("should apply scenario overrides on proxied responses", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        makeResponse(
          200,
          { "content-type": "application/json", "x-rate-limit": "0" },
          "{\"ok\":true}"
        )
      );

      const scenarios: LoadedScenario[] = [
        {
          scenario: "RateLimited",
          version: "1.0.0",
          rules: [
            {
              id: "rate-limit",
              match: { path: "/contracts", method: "GET" },
              respond: {
                status: 429,
                headers: { "x-rate-limit": "1" },
              },
            },
          ],
          sourcePath: "/scenarios/rate-limit.yaml",
          sourceDir: "/scenarios",
        },
      ];

      const state = new ScenarioState();
      state.set("RateLimited");

      const server = createServer({
        routes,
        scenarios,
        scenarioState: state,
        port: 0,
        eventLogger: createNullEventLogger(),
        proxyBaseUrl,
      });

      const response = await server.inject({
        method: "GET",
        url: "/contracts",
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers["x-rate-limit"]).toBe("1");
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).toBe("{\"ok\":true}");
      await server.close();
    });

    it("should bypass proxy when auto-gen scenario is active", async () => {
      const fetchMock = vi.mocked(fetch);
      const state = new ScenarioState();
      state.set("auto-gen-500");

      const server = createServer({
        routes,
        scenarios: [],
        scenarioState: state,
        port: 0,
        eventLogger: createNullEventLogger(),
        proxyBaseUrl,
      });

      const response = await server.inject({
        method: "GET",
        url: "/contracts",
      });

      expect(response.statusCode).toBe(500);
      expect(fetchMock).not.toHaveBeenCalled();
      await server.close();
    });
  });
});
