import path from 'node:path';

export const normalizePath = (value: string): string => {
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
};

export const toFastifyPath = (openapiPath: string): string => {
  const normalized = normalizePath(openapiPath);
  // Convert {id} to :id for Fastify routing.
  return normalized.replace(/{(.*?)}/g, ':$1');
};

export const resolveFrom = (baseDir: string, target: string): string => {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(baseDir, target);
};
