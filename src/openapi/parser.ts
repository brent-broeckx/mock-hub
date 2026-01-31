import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from 'openapi-types';
import { ApiRoute, ApiSpec } from './types';
import { normalizePath, toFastifyPath } from '../utils/path';

const SUPPORTED_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
] as const;

export const loadOpenApiSpec = async (specPath: string): Promise<ApiSpec> => {
  const api = (await SwaggerParser.dereference(specPath)) as OpenAPIV3.Document;
  return api;
};

export const extractRoutes = (spec: ApiSpec): ApiRoute[] => {
  const routes: ApiRoute[] = [];

  for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem) continue;

    for (const method of SUPPORTED_METHODS) {
      const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined;
      if (!operation) continue;

      routes.push({
        method: method.toUpperCase() as ApiRoute['method'],
        path: normalizePath(pathKey),
        fastifyPath: toFastifyPath(pathKey),
        operation,
        responses: operation.responses || {},
      });
    }
  }

  return routes;
};
