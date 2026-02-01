import { TemplateError, TemplateErrorCode } from './types';

export class TemplateValidationError extends Error {
  readonly code: TemplateErrorCode;
  readonly index?: number;
  readonly helper?: string;

  constructor(error: TemplateError) {
    super(error.message);
    this.name = 'TemplateValidationError';
    this.code = error.code;
    this.index = error.index;
    this.helper = error.helper;
  }
}

export class TemplateRenderError extends Error {
  readonly errors: TemplateError[];

  constructor(message: string, errors: TemplateError[]) {
    super(message);
    this.name = 'TemplateRenderError';
    this.errors = errors;
  }
}
