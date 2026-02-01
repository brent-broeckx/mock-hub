import crypto from 'node:crypto';
import { TemplateHelperName, TemplateRuntime } from './types';

export const TEMPLATE_HELPERS: TemplateHelperName[] = ['uuid', 'now', 'increment'];

export const createTemplateRuntime = (): TemplateRuntime => {
  let counter = 0;
  return {
    nextIncrement: () => {
      counter += 1;
      return counter;
    },
  };
};

export const resolveHelper = (name: TemplateHelperName, runtime: TemplateRuntime): string => {
  switch (name) {
    case 'uuid':
      return crypto.randomUUID();
    case 'now':
      return new Date().toISOString();
    case 'increment':
      return String(runtime.nextIncrement());
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
};
