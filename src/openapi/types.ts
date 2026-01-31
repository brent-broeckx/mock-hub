import { OpenAPIV3 } from 'openapi-types';
import { HTTPMethods } from 'fastify';

export type ApiSpec = OpenAPIV3.Document;

export type ApiRoute = {
  method: HTTPMethods;
  path: string;
  fastifyPath: string;
  operation: OpenAPIV3.OperationObject;
  responses: OpenAPIV3.ResponsesObject;
};
