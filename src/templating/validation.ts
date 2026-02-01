import { parseTemplateString } from './parser';
import { TemplateError, TemplateHelperName } from './types';

export type TemplateValidationIssue = {
  path: string;
  message: string;
  helper?: TemplateHelperName | string;
};

const hasTemplateSyntax = (value: string): { hasTemplate: boolean; errors: TemplateError[] } => {
  const parsed = parseTemplateString(value);
  return {
    hasTemplate: parsed.hasTemplates || parsed.errors.length > 0,
    errors: parsed.errors,
  };
};

const toIssue = (path: string, error: TemplateError): TemplateValidationIssue => {
  return {
    path,
    message: error.message,
    helper: error.helper,
  };
};

const validateStringTemplates = (value: string, path: string): TemplateValidationIssue[] => {
  const parsed = parseTemplateString(value);
  if (parsed.errors.length === 0) return [];
  return parsed.errors.map((error) => toIssue(path, error));
};

const validateBodyValue = (value: unknown, path: string): TemplateValidationIssue[] => {
  if (typeof value === 'string') {
    return validateStringTemplates(value, path);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => validateBodyValue(item, `${path}[${index}]`));
  }

  if (value && typeof value === 'object') {
    const errors: TemplateValidationIssue[] = [];
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const keyCheck = hasTemplateSyntax(key);
      if (keyCheck.hasTemplate) {
        errors.push({
          path,
          message: `Template helpers are only allowed in response.body string values (found in key "${key}")`,
        });
      }
      errors.push(...validateBodyValue(entry, `${path}.${key}`));
    }
    return errors;
  }

  return [];
};

const validateNoTemplatesValue = (value: unknown, path: string): TemplateValidationIssue[] => {
  if (typeof value === 'string') {
    const parsed = parseTemplateString(value);
    if (parsed.errors.length > 0) {
      return parsed.errors.map((error) => ({
        path,
        message: `Template syntax is not allowed here: ${error.message}`,
      }));
    }
    if (parsed.hasTemplates) {
      return [{
        path,
        message: 'Template helpers are only allowed in respond.body string values',
      }];
    }
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => validateNoTemplatesValue(item, `${path}[${index}]`));
  }

  if (value && typeof value === 'object') {
    const errors: TemplateValidationIssue[] = [];
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const keyCheck = hasTemplateSyntax(key);
      if (keyCheck.hasTemplate) {
        errors.push({
          path,
          message: `Template helpers are not allowed in object keys (found in key "${key}")`,
        });
      }
      errors.push(...validateNoTemplatesValue(entry, `${path}.${key}`));
    }
    return errors;
  }

  return [];
};

export const validateTemplatesInBody = (value: unknown, path: string): TemplateValidationIssue[] => {
  return validateBodyValue(value, path);
};

export const validateTemplatesNotAllowed = (value: unknown, path: string): TemplateValidationIssue[] => {
  return validateNoTemplatesValue(value, path);
};
