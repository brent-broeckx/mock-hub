export type TemplateHelperName = 'uuid' | 'now' | 'increment';

export type TemplateToken =
  | { type: 'text'; value: string }
  | { type: 'helper'; name: TemplateHelperName };

export type TemplateErrorCode =
  | 'malformed'
  | 'unknown-helper'
  | 'arguments-not-allowed'
  | 'nested-helper'
  | 'unexpected-close';

export type TemplateError = {
  code: TemplateErrorCode;
  message: string;
  index?: number;
  helper?: string;
};

export type TemplateParseResult = {
  tokens: TemplateToken[];
  errors: TemplateError[];
  helpers: TemplateHelperName[];
  hasTemplates: boolean;
};

export type TemplateRuntime = {
  nextIncrement: () => number;
};

export type TemplateRenderResult<T = unknown> = {
  value: T;
  helpers: TemplateHelperName[];
};
