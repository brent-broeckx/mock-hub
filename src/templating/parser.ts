import { TEMPLATE_HELPERS } from './helpers';
import { TemplateError, TemplateHelperName, TemplateParseResult, TemplateToken } from './types';

const hasWhitespace = (value: string): boolean => /\s/.test(value);

const isAllowedHelper = (value: string): value is TemplateHelperName =>
  (TEMPLATE_HELPERS as string[]).includes(value);

const looksLikeHelperWithArgs = (value: string): boolean => {
  return TEMPLATE_HELPERS.some((helper) => value.startsWith(helper) && value !== helper);
};

export const parseTemplateString = (input: string): TemplateParseResult => {
  const tokens: TemplateToken[] = [];
  const errors: TemplateError[] = [];
  const helpers: TemplateHelperName[] = [];
  let hasTemplates = false;

  let buffer = '';
  let index = 0;

  const flushBuffer = () => {
    if (buffer.length > 0) {
      tokens.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  while (index < input.length) {
    if (input[index] === '\\' && input.slice(index + 1, index + 3) === '{{') {
      const closeIndex = input.indexOf('}}', index + 3);
      if (closeIndex === -1) {
        buffer += '{{';
        index += 3;
        continue;
      }

      const literal = input.slice(index + 3, closeIndex);
      buffer += `{{${literal}}}`;
      index = closeIndex + 2;
      continue;
    }

    if (input.slice(index, index + 2) === '{{') {
      flushBuffer();
      const closeIndex = input.indexOf('}}', index + 2);
      if (closeIndex === -1) {
        errors.push({
          code: 'malformed',
          message: 'Template is missing closing "}}"',
          index,
        });
        break;
      }

      const content = input.slice(index + 2, closeIndex);
      hasTemplates = true;

      if (content.length === 0) {
        errors.push({
          code: 'malformed',
          message: 'Template helper cannot be empty',
          index,
        });
      } else if (content.includes('{{') || content.includes('}}')) {
        errors.push({
          code: 'nested-helper',
          message: 'Nested templates are not allowed',
          index,
        });
      } else if (hasWhitespace(content)) {
        errors.push({
          code: 'arguments-not-allowed',
          message: 'Template helpers do not accept arguments',
          index,
          helper: content,
        });
      } else if (isAllowedHelper(content)) {
        tokens.push({ type: 'helper', name: content });
        helpers.push(content);
      } else if (looksLikeHelperWithArgs(content)) {
        errors.push({
          code: 'arguments-not-allowed',
          message: 'Template helpers do not accept arguments',
          index,
          helper: content,
        });
      } else {
        errors.push({
          code: 'unknown-helper',
          message: `Unknown template helper "${content}"`,
          index,
          helper: content,
        });
      }

      index = closeIndex + 2;
      continue;
    }

    if (input.slice(index, index + 2) === '}}') {
      errors.push({
        code: 'unexpected-close',
        message: 'Template has an unexpected "}}"',
        index,
      });
      index += 2;
      continue;
    }

    buffer += input[index];
    index += 1;
  }

  flushBuffer();

  return {
    tokens,
    errors,
    helpers,
    hasTemplates,
  };
};
