import fs from 'node:fs/promises';
import path from 'node:path';
import * as YAML from 'yaml';
import { ScenarioFile, ScenarioRule } from './types';

export type ValidationSeverity = 'error' | 'warning';

export type ValidationError = {
  file: string;
  path: string;
  ruleId?: string;
  message: string;
  severity: ValidationSeverity;
  line?: number;
  column?: number;
};

export type ValidationResult = {
  scenario?: ScenarioFile;
  errors: ValidationError[];
};

const ROOT_KEYS = new Set(['scenario', 'description', 'rules', 'version']);
const RULE_KEYS = new Set(['id', 'match', 'respond']);
const MATCH_KEYS = new Set(['path', 'method', 'query', 'headers']);
const RESPOND_KEYS = new Set(['status', 'body', 'bodyFile', 'headers', 'delayMs', 'timeout']);

const VALID_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
]);

const RESERVED_SCENARIO_PREFIXES = ['auto-gen-'];

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const pushError = (
  errors: ValidationError[],
  file: string,
  pathKey: string,
  message: string,
  severity: ValidationSeverity = 'error',
  line?: number,
  column?: number,
  ruleId?: string
): void => {
  errors.push({ file, path: pathKey, message, severity, line, column, ruleId });
};

const extractLineInfo = (error: YAML.YAMLError): { line?: number; column?: number } => {
  const linePos = (error as unknown as { linePos?: Array<{ line: number; col: number }> })
    .linePos;
  if (!linePos || linePos.length === 0) return {};
  return { line: linePos[0].line, column: linePos[0].col };
};

const parseYamlStrict = (filePath: string, content: string): { data?: unknown; errors: ValidationError[] } => {
  const doc = YAML.parseDocument(content, {
    prettyErrors: true,
    uniqueKeys: true,
  });

  const errors: ValidationError[] = [];

  for (const err of doc.errors) {
    const { line, column } = extractLineInfo(err);
    pushError(errors, filePath, '', err.message, 'error', line, column);
  }

  for (const warn of doc.warnings) {
    const { line, column } = extractLineInfo(warn);
    pushError(errors, filePath, '', warn.message, 'warning', line, column);
  }

  if (errors.some((entry) => entry.severity === 'error')) {
    return { errors };
  }

  const data = doc.toJS({ maxAliasCount: 0 });
  return { data, errors };
};

const validateRootObject = (value: unknown, filePath: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!isPlainObject(value)) {
    pushError(errors, filePath, '', 'Root document must be an object');
    return errors;
  }

  for (const key of Object.keys(value)) {
    if (!ROOT_KEYS.has(key)) {
      pushError(errors, filePath, key, `Unknown root key "${key}"`);
    }
  }

  if (typeof value.scenario !== 'string' || value.scenario.trim().length === 0) {
    pushError(errors, filePath, 'scenario', 'Scenario name must be a non-empty string');
  }

  if (value.description !== undefined && typeof value.description !== 'string') {
    pushError(errors, filePath, 'description', 'Description must be a string');
  }

  if (value.version !== undefined) {
    if (typeof value.version !== 'string') {
      pushError(errors, filePath, 'version', 'Version must be a string in x.y.z format');
    } else if (!/^\d+\.\d+\.\d+$/.test(value.version)) {
      pushError(errors, filePath, 'version', `Version "${value.version}" must match x.y.z`);
    }
  }

  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    pushError(errors, filePath, 'rules', 'Rules must be a non-empty array');
  }

  return errors;
};

const validateRule = (rule: unknown, filePath: string, index: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const basePath = `rules[${index}]`;
  const ruleId = isPlainObject(rule) && typeof rule.id === 'string' ? rule.id : undefined;

  if (!isPlainObject(rule)) {
    pushError(errors, filePath, basePath, 'Rule must be an object');
    return errors;
  }

  for (const key of Object.keys(rule)) {
    if (!RULE_KEYS.has(key)) {
      pushError(errors, filePath, `${basePath}.${key}`, `Unknown rule key "${key}"`, 'error', undefined, undefined, ruleId);
    }
  }

  if (rule.id !== undefined && (typeof rule.id !== 'string' || rule.id.trim().length === 0)) {
    pushError(errors, filePath, `${basePath}.id`, 'Rule id must be a non-empty string', 'error', undefined, undefined, ruleId);
  }

  if (!isPlainObject(rule.match)) {
    pushError(errors, filePath, `${basePath}.match`, 'match must be an object', 'error', undefined, undefined, ruleId);
  } else {
    for (const key of Object.keys(rule.match)) {
      if (!MATCH_KEYS.has(key)) {
        pushError(errors, filePath, `${basePath}.match.${key}`, `Unknown match key "${key}"`, 'error', undefined, undefined, ruleId);
      }
    }

    if (typeof rule.match.path !== 'string' || rule.match.path.trim().length === 0) {
      pushError(errors, filePath, `${basePath}.match.path`, 'path must be a non-empty string', 'error', undefined, undefined, ruleId);
    } else {
      if (!rule.match.path.startsWith('/')) {
        pushError(errors, filePath, `${basePath}.match.path`, 'path must start with /', 'error', undefined, undefined, ruleId);
      }
      const wildcardCount = (rule.match.path.match(/\*/g) || []).length;
      if (wildcardCount > 1) {
        pushError(errors, filePath, `${basePath}.match.path`, 'path supports at most one * wildcard', 'error', undefined, undefined, ruleId);
      }
    }

    if (rule.match.method !== undefined) {
      if (typeof rule.match.method !== 'string') {
        pushError(errors, filePath, `${basePath}.match.method`, 'method must be a string', 'error', undefined, undefined, ruleId);
      } else if (!VALID_METHODS.has(rule.match.method)) {
        pushError(
          errors,
          filePath,
          `${basePath}.match.method`,
          `"${rule.match.method}" is not a valid HTTP method`,
          'error',
          undefined,
          undefined,
          ruleId
        );
      }
    }

    if (rule.match.query !== undefined) {
      if (!isPlainObject(rule.match.query)) {
        pushError(errors, filePath, `${basePath}.match.query`, 'query must be an object', 'error', undefined, undefined, ruleId);
      } else {
        for (const [key, value] of Object.entries(rule.match.query)) {
          if (typeof value !== 'string') {
            pushError(
              errors,
              filePath,
              `${basePath}.match.query.${key}`,
              'query values must be strings',
              'error',
              undefined,
              undefined,
              ruleId
            );
          }
        }
      }
    }

    if (rule.match.headers !== undefined) {
      if (!isPlainObject(rule.match.headers)) {
        pushError(errors, filePath, `${basePath}.match.headers`, 'headers must be an object', 'error', undefined, undefined, ruleId);
      } else {
        for (const [key, value] of Object.entries(rule.match.headers)) {
          if (typeof key !== 'string') {
            pushError(
              errors,
              filePath,
              `${basePath}.match.headers`,
              'header keys must be strings',
              'error',
              undefined,
              undefined,
              ruleId
            );
          }
          if (value !== null && value !== undefined && typeof value !== 'string') {
            pushError(
              errors,
              filePath,
              `${basePath}.match.headers.${key}`,
              'header values must be strings or null',
              'error',
              undefined,
              undefined,
              ruleId
            );
          }
        }
      }
    }
  }

  if (!isPlainObject(rule.respond)) {
    pushError(errors, filePath, `${basePath}.respond`, 'respond must be an object', 'error', undefined, undefined, ruleId);
  } else {
    for (const key of Object.keys(rule.respond)) {
      if (!RESPOND_KEYS.has(key)) {
        pushError(errors, filePath, `${basePath}.respond.${key}`, `Unknown respond key "${key}"`, 'error', undefined, undefined, ruleId);
      }
    }

    if (rule.respond.status === undefined) {
      pushError(errors, filePath, `${basePath}.respond.status`, 'status is required', 'error', undefined, undefined, ruleId);
    } else if (typeof rule.respond.status !== 'number' || !Number.isFinite(rule.respond.status)) {
      pushError(errors, filePath, `${basePath}.respond.status`, 'status must be a number', 'error', undefined, undefined, ruleId);
    } else if (rule.respond.status < 100 || rule.respond.status > 599) {
      pushError(
        errors,
        filePath,
        `${basePath}.respond.status`,
        'status must be between 100 and 599',
        'error',
        undefined,
        undefined,
        ruleId
      );
    }

    if (rule.respond.body !== undefined && rule.respond.bodyFile !== undefined) {
      pushError(
        errors,
        filePath,
        `${basePath}.respond`,
        'Only one of body or bodyFile may be provided',
        'error',
        undefined,
        undefined,
        ruleId
      );
    }

    if (rule.respond.bodyFile !== undefined && typeof rule.respond.bodyFile !== 'string') {
      pushError(errors, filePath, `${basePath}.respond.bodyFile`, 'bodyFile must be a string', 'error', undefined, undefined, ruleId);
    }

    if (rule.respond.headers !== undefined) {
      if (!isPlainObject(rule.respond.headers)) {
        pushError(errors, filePath, `${basePath}.respond.headers`, 'headers must be an object', 'error', undefined, undefined, ruleId);
      } else {
        for (const [key, value] of Object.entries(rule.respond.headers)) {
          if (typeof value !== 'string') {
            pushError(
              errors,
              filePath,
              `${basePath}.respond.headers.${key}`,
              'header values must be strings',
              'error',
              undefined,
              undefined,
              ruleId
            );
          }
        }
      }
    }

    if (rule.respond.delayMs !== undefined) {
      if (typeof rule.respond.delayMs !== 'number' || rule.respond.delayMs < 0) {
        pushError(errors, filePath, `${basePath}.respond.delayMs`, 'delayMs must be >= 0', 'error', undefined, undefined, ruleId);
      }
    }

    if (rule.respond.timeout !== undefined) {
      if (typeof rule.respond.timeout !== 'number' || rule.respond.timeout < 0) {
        pushError(errors, filePath, `${basePath}.respond.timeout`, 'timeout must be >= 0', 'error', undefined, undefined, ruleId);
      }
    }
  }

  return errors;
};

const validateRuleIds = (rules: ScenarioRule[], filePath: string): ValidationError[] => {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  rules.forEach((rule, index) => {
    const id = (rule as ScenarioRule & { id?: string }).id;
    if (!id) return;
    if (seen.has(id)) {
      pushError(errors, filePath, `rules[${index}].id`, `Duplicate rule id "${id}"`, 'error', undefined, undefined, id);
    }
    seen.add(id);
  });

  return errors;
};

const validateScenarioName = (name: string, filePath: string): ValidationError[] => {
  const errors: ValidationError[] = [];
  for (const prefix of RESERVED_SCENARIO_PREFIXES) {
    if (name.startsWith(prefix)) {
      pushError(
        errors,
        filePath,
        'scenario',
        `Scenario name "${name}" uses reserved prefix "${prefix}"`
      );
    }
  }
  return errors;
};

export const validateScenarioFile = async (filePath: string): Promise<ValidationResult> => {
  const content = await fs.readFile(filePath, 'utf-8');
  const parseResult = parseYamlStrict(filePath, content);

  if (!parseResult.data) {
    return { errors: parseResult.errors };
  }

  const rootErrors = validateRootObject(parseResult.data, filePath);
  const errors = [...parseResult.errors, ...rootErrors];

  if (rootErrors.length > 0) {
    return { errors };
  }

  const data = parseResult.data as ScenarioFile;
  const ruleErrors = data.rules.flatMap((rule, index) => validateRule(rule, filePath, index));
  const idErrors = validateRuleIds(data.rules, filePath);
  const nameErrors = validateScenarioName(data.scenario, filePath);

  errors.push(...ruleErrors, ...idErrors, ...nameErrors);

  if (errors.some((entry) => entry.severity === 'error')) {
    return { errors };
  }

  return { scenario: data, errors };
};

export const validateScenarioSet = (
  scenarios: Array<ScenarioFile & { sourcePath: string }>,
  sourceDir: string
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const seen = new Map<string, string>();

  for (const scenario of scenarios) {
    const name = scenario.scenario;
    const current = seen.get(name);
    if (current) {
      pushError(
        errors,
        scenario.sourcePath,
        'scenario',
        `Duplicate scenario name "${name}" found in ${current}`
      );
    } else {
      seen.set(name, scenario.sourcePath ?? path.resolve(sourceDir, ''));
    }
  }

  return errors;
};

export const formatValidationErrors = (errors: ValidationError[]): string => {
  return errors
    .map((error) => {
      const location = error.line !== undefined ? `:${error.line}:${error.column ?? 0}` : '';
      const pathLabel = error.ruleId ? `${error.ruleId}: ${error.path}` : error.path;
      return `${error.severity.toUpperCase()} ${error.file}${location}\n ○ ${pathLabel}\n   → ${error.message}`;
    })
    .join('\n\n');
};
