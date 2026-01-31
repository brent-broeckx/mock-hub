import { EventEmitter } from 'node:events';

export type LogMode = 'ci' | 'cli' | 'ui';

export type LogEvent =
  | {
      event: 'startup';
      mode: LogMode;
      spec: string;
      sourceDir?: string;
      ui: boolean;
      port: number;
    }
  | {
      event: 'startup-failed';
      message: string;
    }
  | {
      event: 'config-files';
      files: string[];
    }
  | {
      event: 'validation-file';
      file: string;
      result: 'ok' | 'failed';
      errors?: Array<{
        path: string;
        message: string;
        severity: 'error' | 'warning';
        ruleId?: string;
        line?: number;
        column?: number;
      }>;
    }
  | {
      event: 'validation-summary';
      errors: number;
      warnings: number;
    }
  | {
      event: 'scenarios-discovered';
      scenarios: string[];
    }
  | {
      event: 'scenario-resolution';
      method: string;
      path: string;
      headerScenario?: string;
      activeScenario?: string;
      result: 'header' | 'active' | 'none';
      action: 'passthrough' | 'scenario' | 'auto-gen';
      scenarioId?: string;
    }
  | {
      event: 'rule-evaluated';
      scenarioId: string;
      ruleIndex: number;
      ruleId?: string;
      request: {
        method: string;
        path: string;
        query: Record<string, string>;
        headers: string[];
      };
      result: 'matched' | 'not-matched';
      reason?: string;
    }
  | {
      event: 'scenario-matched';
      scenarioId: string;
      ruleIndex: number;
      ruleId?: string;
    }
  | {
      event: 'execution-complete';
      source: 'scenario' | 'auto-gen' | 'happy-path' | 'timeout';
      status: number;
    }
  | {
      event: 'server-ready';
      port: number;
    };

export type EventLogger = {
  emitEvent: (event: LogEvent) => void;
  onEvent: (handler: (event: LogEvent) => void) => void;
};

export type EventLoggerOptions = {
  mode: LogMode;
  format?: 'jsonl' | 'pretty';
  stream?: NodeJS.WritableStream;
};

const stableStringify = (value: unknown): string => {
  if (value === undefined) {
    return 'null';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  const body = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',');
  return `{${body}}`;
};

export const createEventLogger = ({ mode, stream, format }: EventLoggerOptions): EventLogger => {
  const emitter = new EventEmitter();
  const output = stream ?? (mode === 'ui' ? process.stderr : process.stdout);
  const activeFormat = format ?? (mode === 'ci' ? 'jsonl' : stream ? 'jsonl' : 'pretty');

  const colors = {
    reset: '\u001b[0m',
    green: '\u001b[32m',
    red: '\u001b[31m',
    lightBlue: '\u001b[94m',
  };

  const colorizeLine = (line: string): string => {
    if (activeFormat !== 'pretty' || mode === 'ci') {
      return line;
    }

    if (line.startsWith('✔')) {
      return `${colors.green}${line}${colors.reset}`;
    }

    if (line.startsWith('✖')) {
      return `${colors.red}${line}${colors.reset}`;
    }

    if (line.startsWith('▶') || line.startsWith('○')) {
      return `${colors.lightBlue}${line}${colors.reset}`;
    }

    return line;
  };

  const formatPretty = (event: LogEvent): string => {
    switch (event.event) {
      case 'startup':
        return [
          '▶ Startup',
          ` ○ mode=${event.mode}`,
          ` ○ spec=${event.spec}`,
          ` ○ source=${event.sourceDir ?? 'none'}`,
          ` ○ ui=${event.ui}`,
          ` ○ port=${event.port}`,
        ].map(colorizeLine).join('\n');
      case 'startup-failed':
        return [
          '✖ Startup failed',
          ` ○ message=${event.message}`,
        ].map(colorizeLine).join('\n');
      case 'config-files':
        return [
          '▶ Config files',
          ` ○ count=${event.files.length}`,
        ].map(colorizeLine).join('\n');
      case 'validation-file':
        return [
          '▶ Validation file',
          ` ○ file=${event.file}`,
          ` ○ result=${event.result}`,
        ].map(colorizeLine).join('\n');
      case 'validation-summary':
        return [
          '▶ Validation summary',
          ` ○ errors=${event.errors}`,
          ` ○ warnings=${event.warnings}`,
        ].map(colorizeLine).join('\n');
      case 'scenarios-discovered':
        return [
          '▶ Scenarios discovered',
          ` ○ count=${event.scenarios.length}`,
        ].map(colorizeLine).join('\n');
      case 'scenario-resolution':
        return [
          '▶ Scenario resolution',
          ` ○ method=${event.method}`,
          ` ○ path=${event.path}`,
          ` ○ result=${event.result}`,
          ` ○ action=${event.action}`,
          ` ○ scenario=${event.scenarioId ?? 'none'}`,
        ].map(colorizeLine).join('\n');
      case 'rule-evaluated':
        return [
          `${event.result === 'matched' ? '✔' : '✖'} Rule evaluated`,
          ` ○ scenario=${event.scenarioId}`,
          ` ○ ruleIndex=${event.ruleIndex}`,
          ` ○ ruleId=${event.ruleId ?? 'none'}`,
          ` ○ method=${event.request.method}`,
          ` ○ path=${event.request.path}`,
          ` ○ result=${event.result}`,
          ` ○ reason=${event.reason ?? 'none'}`,
        ].map(colorizeLine).join('\n');
      case 'scenario-matched':
        return [
          '✔ Matched rule',
          ` ○ scenario=${event.scenarioId}`,
          ` ○ ruleIndex=${event.ruleIndex}`,
          ` ○ ruleId=${event.ruleId ?? 'none'}`,
        ].map(colorizeLine).join('\n');
      case 'execution-complete':
        return [
          '▶ Execution complete',
          ` ○ source=${event.source}`,
          ` ○ status=${event.status}`,
        ].map(colorizeLine).join('\n');
      case 'server-ready':
        return [
          '▶ Server ready',
          ` ○ port=${event.port}`,
        ].map(colorizeLine).join('\n');
      default:
        return stableStringify(event);
    }
  };

  const emitEvent = (event: LogEvent) => {
    emitter.emit('event', event);
    const line = activeFormat === 'jsonl' ? stableStringify(event) : formatPretty(event);
    output.write(`${line}\n`);
  };

  const onEvent = (handler: (event: LogEvent) => void) => {
    emitter.on('event', handler);
  };

  return { emitEvent, onEvent };
};

export const createNullEventLogger = (): EventLogger => {
  return {
    emitEvent: () => undefined,
    onEvent: () => undefined,
  };
};
