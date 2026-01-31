import fs from 'node:fs/promises';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiRoute } from '../openapi/types';
import { LoadedScenario } from '../scenarios/types';
import { findMatchingRule } from '../rules/matcher';
import { generateHappyPathResponse } from '../responses/generator';
import { ScenarioState } from '../state/scenario-state';
import { resolveFrom } from '../utils/path';
import { sleep } from '../utils/sleep';
import { EventLogger } from '../logging/event-logger';

export type ServerOptions = {
  routes: ApiRoute[];
  scenarios: LoadedScenario[];
  scenarioState: ScenarioState;
  port: number;
  verbose?: boolean;
  eventLogger: EventLogger;
};

const AUTO_GEN_PREFIX = 'auto-gen-';

const getHeaderScenario = (headers: FastifyRequest['headers']): string | undefined => {
  const value = headers['x-mockhub-scenario'];
  if (Array.isArray(value)) return value[0];
  return value;
};

const parseAutoGenStatus = (scenarioName?: string): number | undefined => {
  if (!scenarioName?.startsWith(AUTO_GEN_PREFIX)) return undefined;
  const code = Number(scenarioName.replace(AUTO_GEN_PREFIX, ''));
  if (Number.isFinite(code)) return code;
  return undefined;
};

const readBodyFile = async (sourceDir: string, bodyFile: string): Promise<unknown> => {
  const fullPath = resolveFrom(sourceDir, bodyFile);
  const file = await fs.readFile(fullPath, 'utf-8');
  try {
    return JSON.parse(file);
  } catch {
    return file;
  }
};

const buildScenarioMap = (scenarios: LoadedScenario[]): Map<string, LoadedScenario> => {
  return new Map(scenarios.map((scenario) => [scenario.scenario, scenario]));
};

export const createServer = (options: ServerOptions): FastifyInstance => {
  const server = Fastify({ logger: false });
  const scenarioMap = buildScenarioMap(options.scenarios);

  const handleRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
    route: ApiRoute
  ): Promise<void> => {
    const headerScenario = getHeaderScenario(request.headers);
    const activeScenario = options.scenarioState.get();
    const scenarioName = headerScenario ?? activeScenario;
    const requestPath = request.url.split('?')[0];
    const querySnapshot = Object.fromEntries(
      Object.entries(request.query as Record<string, unknown>).map(([key, value]) => [
        key,
        value === undefined || value === null ? '' : String(value),
      ])
    );
    const headerKeys = Object.keys(request.headers).map((key) => key.toLowerCase()).sort();

    const autoGenStatus = parseAutoGenStatus(scenarioName);
    const loadedScenario = scenarioName ? scenarioMap.get(scenarioName) : undefined;

    options.eventLogger.emitEvent({
      event: 'scenario-resolution',
      method: request.method,
      path: requestPath,
      headerScenario: headerScenario ?? undefined,
      activeScenario: activeScenario ?? undefined,
      result: headerScenario ? 'header' : activeScenario ? 'active' : 'none',
      action: autoGenStatus ? 'auto-gen' : loadedScenario ? 'scenario' : 'passthrough',
      scenarioId: loadedScenario?.scenario,
    });

    if (loadedScenario) {
      const match = findMatchingRule(
        loadedScenario.rules,
        {
          method: request.method,
          path: requestPath,
          headers: request.headers,
          query: request.query as Record<string, unknown>,
        },
        ({ rule, ruleIndex, result }) => {
          options.eventLogger.emitEvent({
            event: 'rule-evaluated',
            scenarioId: loadedScenario.scenario,
            ruleIndex,
            ruleId: rule.id,
            request: {
              method: request.method,
              path: requestPath,
              query: querySnapshot,
              headers: headerKeys,
            },
            result: result.matched ? 'matched' : 'not-matched',
            reason: result.reason,
          });
        }
      );

      if (match) {
        const { respond } = match.rule;

        if (respond.timeout !== undefined) {
          // TODO: Support configurable timeout behaviors beyond fixed 504.
          await sleep(respond.timeout);
          reply.code(504).send({ message: 'Mock timeout' });
          options.eventLogger.emitEvent({
            event: 'execution-complete',
            source: 'timeout',
            status: 504,
          });
          return;
        }

        if (respond.delayMs) {
          await sleep(respond.delayMs);
        }

        const body = respond.bodyFile
          ? await readBodyFile(loadedScenario.sourceDir, respond.bodyFile)
          : respond.body;

        if (respond.headers) {
          Object.entries(respond.headers).forEach(([key, value]) => reply.header(key, value));
        }

        reply.code(respond.status).send(body ?? undefined);
        options.eventLogger.emitEvent({
          event: 'scenario-matched',
          scenarioId: loadedScenario.scenario,
          ruleIndex: match.ruleIndex,
          ruleId: match.rule.id,
        });
        options.eventLogger.emitEvent({
          event: 'execution-complete',
          source: 'scenario',
          status: respond.status,
        });
        return;
      }
    }

    if (autoGenStatus) {
      reply.code(autoGenStatus).send();
      options.eventLogger.emitEvent({
        event: 'execution-complete',
        source: 'auto-gen',
        status: autoGenStatus,
      });
      return;
    }

    const generated = generateHappyPathResponse(route.responses);
    reply.code(generated.status).send(generated.body ?? undefined);
    options.eventLogger.emitEvent({
      event: 'execution-complete',
      source: 'happy-path',
      status: generated.status,
    });
  };

  for (const route of options.routes) {
    server.route({
      method: route.method,
      url: route.fastifyPath,
      handler: async (request: FastifyRequest, reply: FastifyReply) =>
        handleRequest(request, reply, route),
    });
  }

  return server;
};

export const startServer = async (options: ServerOptions): Promise<void> => {
  const server = createServer(options);
  await server.listen({ port: options.port, host: '0.0.0.0' });
  options.eventLogger.emitEvent({
    event: 'server-ready',
    port: options.port,
  });
};
