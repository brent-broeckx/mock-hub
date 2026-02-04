import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OpenAPIV3 } from "openapi-types";
import type { ApiRoute } from "../../../src/openapi/types";
import type { LoadedScenario } from "../../../src/scenarios/types";

type ScenarioStateMock = {
  set: (...args: unknown[]) => void;
  get: () => string | undefined;
};

declare module "../../../src/state/scenario-state" {
  export const __test: {
    getLastInstance: () => ScenarioStateMock | undefined;
  };
}

const originalArgv = process.argv;

const spec: OpenAPIV3.Document = {
  openapi: "3.0.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
};

const routes: ApiRoute[] = [];
const scenarios: LoadedScenario[] = [];

vi.mock("../../../src/openapi/parser", () => ({
  loadOpenApiSpec: vi.fn(),
  extractRoutes: vi.fn(),
}));

vi.mock("../../../src/scenarios/loader", () => ({
  loadScenarios: vi.fn(),
}));

vi.mock("../../../src/server/server", () => ({
  startServer: vi.fn(),
}));

vi.mock("../../../src/ui/scenario-ui", () => ({
  startScenarioUI: vi.fn(),
}));

vi.mock("../../../src/logging/event-logger", () => {
  const eventLogger = { emitEvent: vi.fn() };
  return {
    createEventLogger: vi.fn(() => eventLogger),
    createNullEventLogger: vi.fn(() => eventLogger),
  };
});

vi.mock("../../../src/state/scenario-state", () => {
  let lastInstance: ScenarioState | undefined;

  class ScenarioState {
    public current?: string;
    public set = vi.fn((next?: string) => {
      this.current = next || undefined;
    });
    public get = vi.fn(() => this.current);

    constructor() {
      lastInstance = this;
    }
  }

  return {
    ScenarioState,
    __test: {
      getLastInstance: () => lastInstance,
    },
  };
});

describe("cli", () => {
  beforeEach(() => {
    vi.resetModules();
    process.argv = [
      "node",
      "mock-hub",
      "run",
      "--spec",
      "/specs/openapi.yaml",
      "--scenario",
      "PartnerDown",
    ];
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.clearAllMocks();
  });

  it("should load the requested scenario without starting UI when --ui is absent", async () => {
    const parser = await import("../../../src/openapi/parser");
    const loader = await import("../../../src/scenarios/loader");
    const server = await import("../../../src/server/server");
    const ui = await import("../../../src/ui/scenario-ui");
    const state = await import("../../../src/state/scenario-state");
    const stateModule = state as typeof state & {
      __test: { getLastInstance: () => ScenarioStateMock | undefined };
    };

    vi.mocked(parser.loadOpenApiSpec).mockResolvedValue(spec);
    vi.mocked(parser.extractRoutes).mockReturnValue(routes);
    vi.mocked(loader.loadScenarios).mockResolvedValue(scenarios);

    await import("../../../src/cli/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(parser.loadOpenApiSpec).toHaveBeenCalledWith("/specs/openapi.yaml");
    expect(parser.extractRoutes).toHaveBeenCalledWith(spec);
    expect(ui.startScenarioUI).not.toHaveBeenCalled();

    const lastState = stateModule.__test.getLastInstance();
    expect(lastState?.set).toHaveBeenCalledWith("PartnerDown");

    const callArgs = vi.mocked(server.startServer).mock.calls[0]?.[0];
    expect(callArgs?.routes).toBe(routes);
    expect(callArgs?.scenarios).toBe(scenarios);
    expect(callArgs?.scenarioState).toBe(lastState);
    expect(callArgs?.port).toBe(4010);
  });

  it("should allow startup without --spec when --proxy is provided", async () => {
    process.argv = [
      "node",
      "mock-hub",
      "run",
      "--proxy",
      "http://localhost:8080",
    ];

    const parser = await import("../../../src/openapi/parser");
    const loader = await import("../../../src/scenarios/loader");
    const server = await import("../../../src/server/server");

    vi.mocked(parser.loadOpenApiSpec).mockResolvedValue(spec);
    vi.mocked(parser.extractRoutes).mockReturnValue(routes);
    vi.mocked(loader.loadScenarios).mockResolvedValue(scenarios);

    await import("../../../src/cli/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(parser.loadOpenApiSpec).not.toHaveBeenCalled();
    expect(parser.extractRoutes).not.toHaveBeenCalled();

    const callArgs = vi.mocked(server.startServer).mock.calls[0]?.[0];
    expect(callArgs?.proxyBaseUrl).toBe("http://localhost:8080");
    expect(callArgs?.routes).toEqual([]);
  });

  it("should fail fast when neither --spec nor --proxy is provided", async () => {
    process.argv = [
      "node",
      "mock-hub",
      "run",
    ];

    const server = await import("../../../src/server/server");
    const logger = await import("../../../src/logging/event-logger");

    await import("../../../src/cli/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(server.startServer)).not.toHaveBeenCalled();
    expect(vi.mocked(logger.createNullEventLogger)().emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "startup-failed",
        message: "OpenAPI spec is required when not using --proxy",
      })
    );
  });
});
