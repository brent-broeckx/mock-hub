import { ScenarioMatch, ScenarioRule } from '../scenarios/types';

export type RequestContext = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
};

const normalizeHeaderKey = (key: string): string => key.toLowerCase();

const normalizePathSegment = (value: string): string => {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }
  return value;
};

const matchesPath = (pattern: string, actual: string): boolean => {
  if (pattern === actual) return true;
  if (!pattern.includes('*')) return false;

  const [start, end] = pattern.split('*');
  const normalizedStart = normalizePathSegment(start);
  const normalizedActual = normalizePathSegment(actual);

  const startsOk = normalizedStart
    ? normalizedActual === normalizedStart || normalizedActual.startsWith(`${normalizedStart}/`)
    : true;
  const endsOk = end ? normalizedActual.endsWith(end) : true;
  return startsOk && endsOk;
};

const matchesMethod = (match: ScenarioMatch, method: string): boolean => {
  if (!match.method) return true;
  return match.method.toUpperCase() === method.toUpperCase();
};

const matchesHeaders = (match: ScenarioMatch, headers: RequestContext['headers']): boolean => {
  if (!match.headers) return true;

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [normalizeHeaderKey(key), value])
  );

  return Object.entries(match.headers).every(([key, value]) => {
    const headerValue = normalizedHeaders[normalizeHeaderKey(key)];
    if (value === undefined || value === null) {
      return headerValue !== undefined;
    }

    if (Array.isArray(headerValue)) {
      return headerValue.includes(value);
    }

    return String(headerValue) === value;
  });
};

const matchesQuery = (match: ScenarioMatch, query: RequestContext['query']): boolean => {
  if (!match.query) return true;
  return Object.entries(match.query).every(([key, value]) => {
    const actual = query[key];
    if (actual === undefined || actual === null) return false;
    return String(actual) === String(value);
  });
};

export const findMatchingRule = (
  rules: ScenarioRule[],
  request: RequestContext
): ScenarioRule | undefined => {
  return rules.find((rule) => {
    const { match } = rule;
    return (
      matchesPath(match.path, request.path) &&
      matchesMethod(match, request.method) &&
      matchesHeaders(match, request.headers) &&
      matchesQuery(match, request.query)
    );
  });
};
