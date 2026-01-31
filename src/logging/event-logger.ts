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

export const createEventLogger = ({ mode, stream }: EventLoggerOptions): EventLogger => {
  const emitter = new EventEmitter();
  const output = stream ?? (mode === 'ui' ? process.stderr : process.stdout);

  const emitEvent = (event: LogEvent) => {
    emitter.emit('event', event);
    const line = stableStringify(event);
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
