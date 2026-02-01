import { resolveHelper } from './helpers';
import { parseTemplateString } from './parser';
import { TemplateRenderError } from './errors';
import { TemplateHelperName, TemplateRenderResult, TemplateRuntime } from './types';

const mergeHelpers = (target: TemplateHelperName[], helpers: TemplateHelperName[]): void => {
  for (const helper of helpers) {
    if (!target.includes(helper)) {
      target.push(helper);
    }
  }
};

const renderString = (value: string, runtime: TemplateRuntime): TemplateRenderResult<string> => {
  const parsed = parseTemplateString(value);
  if (parsed.errors.length > 0) {
    throw new TemplateRenderError('Invalid template detected during rendering', parsed.errors);
  }

  if (!parsed.hasTemplates && !value.includes('\\{{')) {
    return { value, helpers: [] };
  }

  const helpers: TemplateHelperName[] = [];
  const rendered = parsed.tokens
    .map((token) => {
      if (token.type === 'text') {
        return token.value;
      }
      mergeHelpers(helpers, [token.name]);
      return resolveHelper(token.name, runtime);
    })
    .join('');

  return { value: rendered, helpers };
};

export const renderTemplates = (value: unknown, runtime: TemplateRuntime): TemplateRenderResult => {
  if (typeof value === 'string') {
    return renderString(value, runtime);
  }

  if (Array.isArray(value)) {
    const helpers: TemplateHelperName[] = [];
    const rendered = value.map((entry) => {
      const result = renderTemplates(entry, runtime);
      mergeHelpers(helpers, result.helpers);
      return result.value;
    });
    return { value: rendered, helpers };
  }

  if (value && typeof value === 'object') {
    const helpers: TemplateHelperName[] = [];
    const renderedEntries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const result = renderTemplates(entry, runtime);
      mergeHelpers(helpers, result.helpers);
      return [key, result.value] as const;
    });
    return { value: Object.fromEntries(renderedEntries), helpers };
  }

  return { value, helpers: [] };
};
