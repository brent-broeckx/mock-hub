import debugFactory from 'debug';

export type Logger = {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
};

export const createLogger = (namespace = 'mock-hub', verbose = false): Logger => {
  const dbg = debugFactory(namespace);

  const log = (level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]) => {
    const prefix = `[${level.toUpperCase()}]`;
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${message}`, ...args);
  };

  return {
    info: (message, ...args) => log('info', message, ...args),
    warn: (message, ...args) => log('warn', message, ...args),
    error: (message, ...args) => log('error', message, ...args),
    debug: (message, ...args) => {
      if (verbose) {
        dbg(message, ...args);
      }
    },
  };
};
