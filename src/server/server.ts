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
import { createTemplateRuntime, renderTemplates } from '../templating';
import type { TemplateRuntime } from '../templating/types';

export type ServerOptions = {
  routes: ApiRoute[];
  scenarios: LoadedScenario[];
  scenarioState: ScenarioState;
  port: number;
  eventLogger: EventLogger;
  proxyBaseUrl?: string;
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

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const isHopByHopHeader = (key: string): boolean => {
  return HOP_BY_HOP_HEADERS.has(key.toLowerCase());
};

const buildProxyUrl = (baseUrl: string, requestUrl: string): string => {
  return new URL(requestUrl, baseUrl).toString();
};

const buildProxyHeaders = (headers: FastifyRequest['headers']): Record<string, string> => {
  const result: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    const normalized = key.toLowerCase();
    if (isHopByHopHeader(normalized)) return;
    if (value === undefined) return;
    if (Array.isArray(value)) {
      result[normalized] = value.join(',');
      return;
    }
    result[normalized] = String(value);
  });
  return result;
};

const collectProxyResponseHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (isHopByHopHeader(normalized)) return;
    result[normalized] = value;
  });
  return result;
};

const mergeHeaders = (
  base: Record<string, string>,
  overrides?: Record<string, string>
): Record<string, string> => {
  if (!overrides) return base;
  const merged: Record<string, string> = { ...base };
  Object.entries(overrides).forEach(([key, value]) => {
    merged[key.toLowerCase()] = value;
  });
  return merged;
};

const shouldSendBody = (method: string): boolean => {
  return method !== 'GET' && method !== 'HEAD';
};

type ProxyBody = string | Buffer | Uint8Array;

const serializeRequestBody = (body: unknown): ProxyBody | undefined => {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return body;
  return JSON.stringify(body);
};

type ProxyResult =
  | {
      type: 'success';
      status: number;
      headers: Record<string, string>;
      body?: Buffer;
    }
  | {
      type: 'timeout';
    }
  | {
      type: 'error';
      message: string;
    };

const proxyRequest = async (
  request: FastifyRequest,
  baseUrl: string,
  timeoutMs?: number
): Promise<ProxyResult> => {
  const url = buildProxyUrl(baseUrl, request.url);
  const headers = buildProxyHeaders(request.headers);
  const method = request.method;
  const body = shouldSendBody(method) ? serializeRequestBody(request.body) : undefined;
  const controller = new AbortController();
  const timeoutHandle = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = arrayBuffer.byteLength > 0 ? Buffer.from(arrayBuffer) : undefined;
    const responseHeaders = collectProxyResponseHeaders(response.headers);

    return {
      type: 'success',
      status: response.status,
      headers: responseHeaders,
      body: buffer,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { type: 'timeout' };
    }
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    return { type: 'error', message };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const createServer = (options: ServerOptions): FastifyInstance => {
  const server = Fastify({ logger: false });
  const scenarioMap = buildScenarioMap(options.scenarios);
  const templateRuntimes = new Map<string, TemplateRuntime>();
  const proxyBaseUrl = options.proxyBaseUrl;
  const isProxyEnabled = Boolean(proxyBaseUrl);

  const getTemplateRuntime = (scenarioId: string): TemplateRuntime => {
    const current = templateRuntimes.get(scenarioId);
    if (current) return current;
    const created = createTemplateRuntime();
    templateRuntimes.set(scenarioId, created);
    return created;
  };

  const handleRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
    route?: ApiRoute
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
        const hasMockBody = respond.bodyFile !== undefined || respond.body !== undefined;

        if (isProxyEnabled && !hasMockBody) {
          const targetUrl = proxyBaseUrl ? buildProxyUrl(proxyBaseUrl, request.url) : undefined;
          options.eventLogger.emitEvent({
            event: 'proxy-action',
            result: 'matched',
            action: 'proxy',
            scenarioId: loadedScenario.scenario,
            ruleIndex: match.ruleIndex,
            ruleId: match.rule.id,
            delayMs: respond.delayMs,
            timeout: respond.timeout,
            status: respond.status,
            targetUrl,
          });

          const proxied = await proxyRequest(request, proxyBaseUrl ?? '', respond.timeout);

          if (proxied.type === 'timeout') {
            reply.code(504).send({ message: 'Proxy timeout' });
            options.eventLogger.emitEvent({
              event: 'execution-complete',
              source: 'timeout',
              status: 504,
            });
            return;
          }

          if (proxied.type === 'error') {
            reply.code(502).send({ message: 'Proxy error' });
            options.eventLogger.emitEvent({
              event: 'execution-complete',
              source: 'proxy',
              status: 502,
            });
            return;
          }

          if (respond.delayMs) {
            await sleep(respond.delayMs);
          }

          const mergedHeaders = mergeHeaders(proxied.headers, respond.headers);
          Object.entries(mergedHeaders).forEach(([key, value]) => reply.header(key, value));

          const status = respond.status ?? proxied.status;
          reply.code(status).send(proxied.body ?? undefined);
          options.eventLogger.emitEvent({
            event: 'execution-complete',
            source: 'proxy',
            status,
          });
          return;
        }

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

        let body = respond.bodyFile
          ? await readBodyFile(loadedScenario.sourceDir, respond.bodyFile)
          : respond.body;

        if (body !== undefined) {
          const runtime = getTemplateRuntime(loadedScenario.scenario);
          const rendered = renderTemplates(body, runtime);
          body = rendered.value;

          if (rendered.helpers.length > 0) {
            options.eventLogger.emitEvent({
              event: 'templates-applied',
              scenarioId: loadedScenario.scenario,
              ruleIndex: match.ruleIndex,
              ruleId: match.rule.id,
              helpers: rendered.helpers,
            });
          }
        }

        if (respond.headers) {
          Object.entries(respond.headers).forEach(([key, value]) => reply.header(key, value));
        }

        reply.code(respond.status).send(body ?? undefined);
        if (isProxyEnabled) {
          options.eventLogger.emitEvent({
            event: 'proxy-action',
            result: 'matched',
            action: 'mock',
            scenarioId: loadedScenario.scenario,
            ruleIndex: match.ruleIndex,
            ruleId: match.rule.id,
            delayMs: respond.delayMs,
            timeout: respond.timeout,
            status: respond.status,
          });
        }
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

    if (isProxyEnabled && proxyBaseUrl) {
      const targetUrl = buildProxyUrl(proxyBaseUrl, request.url);
      options.eventLogger.emitEvent({
        event: 'proxy-action',
        result: 'not-matched',
        action: 'proxy',
        targetUrl,
      });

      const proxied = await proxyRequest(request, proxyBaseUrl);

      if (proxied.type === 'timeout') {
        reply.code(504).send({ message: 'Proxy timeout' });
        options.eventLogger.emitEvent({
          event: 'execution-complete',
          source: 'timeout',
          status: 504,
        });
        return;
      }

      if (proxied.type === 'error') {
        reply.code(502).send({ message: 'Proxy error' });
        options.eventLogger.emitEvent({
          event: 'execution-complete',
          source: 'proxy',
          status: 502,
        });
        return;
      }

      Object.entries(proxied.headers).forEach(([key, value]) => reply.header(key, value));
      reply.code(proxied.status).send(proxied.body ?? undefined);
      options.eventLogger.emitEvent({
        event: 'execution-complete',
        source: 'proxy',
        status: proxied.status,
      });
      return;
    }

    if (route) {
      const generated = generateHappyPathResponse(route.responses);
      reply.code(generated.status).send(generated.body ?? undefined);
      options.eventLogger.emitEvent({
        event: 'execution-complete',
        source: 'happy-path',
        status: generated.status,
      });
      return;
    }

    reply.code(404).send({ message: 'Not Found' });
  };

  for (const route of options.routes) {
    server.route({
      method: route.method,
      url: route.fastifyPath,
      handler: async (request: FastifyRequest, reply: FastifyReply) =>
        handleRequest(request, reply, route),
    });
  }

  if (isProxyEnabled) {
    server.setNotFoundHandler((request, reply) => handleRequest(request, reply));
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
