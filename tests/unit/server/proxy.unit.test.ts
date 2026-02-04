import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    responses: {
      "200": {
        description: "ok",
      },
    },
  },
  {
    method: "POST",
    path: "/payments",
    fastifyPath: "/payments",
    operation: {} as ApiRoute["operation"],
    responses: {
      "201": {
        description: "created",
      },
    },
  },
];

describe("server", () => {
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

    it("should proxy when no scenario matches and proxy enabled", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        makeResponse(200, { "content-type": "application/json" }, JSON.stringify({ proxied: true }))
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
        url: "/contracts?plan=pro",
        headers: { "x-test": "1" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ proxied: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe("http://localhost:8080/contracts?plan=pro");
      expect(options?.method).toBe("GET");
      expect(options?.headers).toMatchObject({ "x-test": "1" });
      expect(options?.headers).not.toHaveProperty("host");
      await server.close();
    });

    it("should return scenario mock and skip proxy when body is defined", async () => {
      const fetchMock = vi.mocked(fetch);

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
        proxyBaseUrl,
      });

      const response = await server.inject({
        method: "GET",
        url: "/contracts",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "down" });
      expect(fetchMock).not.toHaveBeenCalled();
      await server.close();
    });

    it("should proxy and apply overrides when scenario has no body", async () => {
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

    it("should abort proxy when timeout is set on scenario override", async () => {
      vi.useFakeTimers();

      const fetchMock = vi.mocked(fetch);
      fetchMock.mockImplementation((_url, options) => {
        const signal = options?.signal as AbortSignal | undefined;
        return new Promise((_, reject) => {
          if (!signal) return;
          signal.addEventListener("abort", () => {
            const error = new Error("Aborted");
            (error as Error & { name: string }).name = "AbortError";
            reject(error);
          });
        }) as Promise<Response>;
      });

      const scenarios: LoadedScenario[] = [
        {
          scenario: "SlowProxy",
          version: "1.0.0",
          rules: [
            {
              id: "slow",
              match: { path: "/contracts", method: "GET" },
              respond: {
                status: 200,
                timeout: 10,
              },
            },
          ],
          sourcePath: "/scenarios/slow.yaml",
          sourceDir: "/scenarios",
        },
      ];

      const state = new ScenarioState();
      state.set("SlowProxy");

      const server = createServer({
        routes,
        scenarios,
        scenarioState: state,
        port: 0,
        eventLogger: createNullEventLogger(),
        proxyBaseUrl,
      });

      const responsePromise = server.inject({
        method: "GET",
        url: "/contracts",
      });

      await vi.advanceTimersByTimeAsync(20);
      const response = await responsePromise;

      expect(response.statusCode).toBe(504);
      await server.close();
      vi.useRealTimers();
    });

    it("should forward request body when proxying", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        makeResponse(201, { "content-type": "application/json" }, "{\"ok\":true}")
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
        method: "POST",
        url: "/payments",
        payload: { amount: 25 },
      });

      expect(response.statusCode).toBe(201);
      const [, options] = fetchMock.mock.calls[0] ?? [];
      expect(options?.body).toBe(JSON.stringify({ amount: 25 }));
      await server.close();
    });
  });
});
