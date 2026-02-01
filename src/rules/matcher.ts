import { ScenarioMatch, ScenarioRule } from '../scenarios/types';

export type RequestContext = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
};

export type RuleEvaluation = {
  matched: boolean;
  reason?: string;
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

const headerMismatchReason = (
  match: ScenarioMatch,
  headers: RequestContext['headers']
): string | undefined => {
  if (!match.headers) return undefined;

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [normalizeHeaderKey(key), value])
  );

  for (const [key, expected] of Object.entries(match.headers)) {
    const actual = normalizedHeaders[normalizeHeaderKey(key)];

    if (expected === undefined || expected === null) {
      if (actual === undefined) {
        return `header ${key} missing`;
      }
      continue;
    }

    if (actual === undefined) {
      return `header ${key} missing`;
    }

    if (Array.isArray(actual)) {
      if (!actual.includes(expected)) {
        return `header ${key} mismatch`;
      }
      continue;
    }

    if (String(actual) !== expected) {
      return `header ${key} mismatch`;
    }
  }

  return undefined;
};

const matchesQuery = (match: ScenarioMatch, query: RequestContext['query']): boolean => {
  if (!match.query) return true;
  return Object.entries(match.query).every(([key, value]) => {
    const actual = query[key];
    if (actual === undefined || actual === null) return false;
    return String(actual) === String(value);
  });
};

const queryMismatchReason = (match: ScenarioMatch, query: RequestContext['query']): string | undefined => {
  if (!match.query) return undefined;
  for (const [key, value] of Object.entries(match.query)) {
    const actual = query[key];
    if (actual === undefined || actual === null) {
      return `query ${key} missing`;
    }
    if (String(actual) !== String(value)) {
      return `query ${key} mismatch`;
    }
  }
  return undefined;
};

const scoreMatchSpecificity = (match: ScenarioMatch): number => {
  let score = 0;

  if (match.path) {
    score += match.path.includes('*') ? 1 : 10;
    score += match.path.split('/').filter(Boolean).length;
  }

  if (match.method) {
    score += 5;
  }

  if (match.headers) {
    score += Object.keys(match.headers).length * 2;
  }

  if (match.query) {
    score += Object.keys(match.query).length * 3;
  }

  return score;
};

const evaluateRule = (rule: ScenarioRule, request: RequestContext): RuleEvaluation => {
  const { match } = rule;

  if (!matchesPath(match.path, request.path)) {
    return { matched: false, reason: `path mismatch` };
  }

  if (!matchesMethod(match, request.method)) {
    return { matched: false, reason: `method mismatch` };
  }

  if (!matchesHeaders(match, request.headers)) {
    return {
      matched: false,
      reason: headerMismatchReason(match, request.headers) ?? 'header mismatch',
    };
  }

  if (!matchesQuery(match, request.query)) {
    return {
      matched: false,
      reason: queryMismatchReason(match, request.query) ?? 'query mismatch',
    };
  }

  return { matched: true };
};

export type RuleEvaluationObserver = (input: {
  rule: ScenarioRule;
  ruleIndex: number;
  result: RuleEvaluation;
}) => void;

export type MatchingRule = {
  rule: ScenarioRule;
  ruleIndex: number;
};

export const findMatchingRule = (
  rules: ScenarioRule[],
  request: RequestContext,
  observer?: RuleEvaluationObserver
): MatchingRule | undefined => {
  let bestMatch: MatchingRule | undefined;
  let bestScore = -1;

  for (const [index, rule] of rules.entries()) {
    const result = evaluateRule(rule, request);
    observer?.({ rule, ruleIndex: index, result });

    if (!result.matched) {
      continue;
    }

    const score = scoreMatchSpecificity(rule.match);
    if (score > bestScore) {
      bestMatch = { rule, ruleIndex: index };
      bestScore = score;
    }
  }

  return bestMatch;
};
