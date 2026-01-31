import fs from 'node:fs/promises';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiRoute } from '../openapi/types';
import { LoadedScenario } from '../scenarios/types';
import { findMatchingRule } from '../rules/matcher';
import { generateHappyPathResponse } from '../responses/generator';
import { ScenarioState } from '../state/scenario-state';
import { createLogger, Logger } from '../utils/logger';
import { resolveFrom } from '../utils/path';
import { sleep } from '../utils/sleep';

export type ServerOptions = {
  routes: ApiRoute[];
  scenarios: LoadedScenario[];
  scenarioState: ScenarioState;
  port: number;
  verbose?: boolean;
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
  const logger = createLogger('mock-hub', options.verbose ?? false);
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

    const autoGenStatus = parseAutoGenStatus(scenarioName);
    const loadedScenario = scenarioName ? scenarioMap.get(scenarioName) : undefined;

    if (scenarioName && !autoGenStatus && !loadedScenario) {
      logger.warn(`Scenario "${scenarioName}" not found. Falling back to happy path.`);
    }

    if (loadedScenario) {
      const match = findMatchingRule(loadedScenario.rules, {
        method: request.method,
        path: request.url.split('?')[0],
        headers: request.headers,
        query: request.query as Record<string, unknown>,
      });

      if (match) {
        const { respond } = match;

        if (respond.timeout !== undefined) {
          // TODO: Support configurable timeout behaviors beyond fixed 504.
          await sleep(respond.timeout);
          reply.code(504).send({ message: 'Mock timeout' });
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
        return;
      }
    }

    if (autoGenStatus) {
      reply.code(autoGenStatus).send();
      return;
    }

    const generated = generateHappyPathResponse(route.responses);
    reply.code(generated.status).send(generated.body ?? undefined);
  };

  for (const route of options.routes) {
    server.route({
      method: route.method,
      url: route.fastifyPath,
      handler: async (request: FastifyRequest, reply: FastifyReply) =>
        handleRequest(request, reply, route),
    });
  }

  server.addHook('onReady', async () => {
    logger.info(`Routes loaded: ${options.routes.length}`);
  });

  return server;
};

export const startServer = async (options: ServerOptions): Promise<void> => {
  const logger = createLogger('mock-hub', options.verbose ?? false);
  const server = createServer(options);
  await server.listen({ port: options.port, host: '0.0.0.0' });
  logger.info(`Mock Hub running on http://localhost:${options.port}`);
};
