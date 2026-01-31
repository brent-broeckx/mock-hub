import { OpenAPIV3 } from 'openapi-types';
import { JSONSchemaFaker } from 'json-schema-faker';

export type GeneratedResponse = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

const pickLowestStatus = (responses: OpenAPIV3.ResponsesObject): number => {
  const codes = Object.keys(responses)
    .filter((code) => /^\d{3}$/.test(code))
    .map((code) => Number(code))
    .sort((a, b) => a - b);

  return codes[0] ?? 200;
};

const pickHappyPathStatus = (responses: OpenAPIV3.ResponsesObject): number => {
  const successCodes = Object.keys(responses)
    .filter((code) => /^2\d{2}$/.test(code))
    .map((code) => Number(code))
    .sort((a, b) => a - b);

  if (successCodes.length > 0) {
    return successCodes[0];
  }

  return pickLowestStatus(responses);
};

const pickResponse = (
  responses: OpenAPIV3.ResponsesObject,
  status: number
): OpenAPIV3.ResponseObject | undefined => {
  const response = responses[String(status)] as OpenAPIV3.ResponseObject | undefined;
  if (response) return response;
  const first = Object.values(responses).find(
    (value) => typeof value === 'object' && value !== null
  ) as OpenAPIV3.ResponseObject | undefined;
  return first;
};

const pickContent = (response?: OpenAPIV3.ResponseObject): OpenAPIV3.MediaTypeObject | undefined => {
  if (!response?.content) return undefined;
  if (response.content['application/json']) return response.content['application/json'];
  const first = Object.values(response.content)[0];
  return first;
};

const pickExample = (content?: OpenAPIV3.MediaTypeObject): unknown => {
  if (!content) return undefined;
  if (content.example) return content.example;
  if (content.examples) {
    const first = Object.values(content.examples)[0] as OpenAPIV3.ExampleObject | undefined;
    if (first?.value !== undefined) return first.value;
  }
  return undefined;
};

const generateFromSchema = (schema?: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): unknown => {
  if (!schema || ('$ref' in schema)) return undefined;
  try {
    return JSONSchemaFaker.generate(schema);
  } catch {
    return undefined;
  }
};

export const generateHappyPathResponse = (
  responses: OpenAPIV3.ResponsesObject
): GeneratedResponse => {
  const status = pickHappyPathStatus(responses);
  const response = pickResponse(responses, status);
  const content = pickContent(response);
  const example = pickExample(content);
  const schema = content?.schema as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined;
  const generated = example ?? generateFromSchema(schema);

  return {
    status,
    body: generated,
  };
};
