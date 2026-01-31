import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli/index.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  bundle: true,
  external: [
    '@apidevtools/swagger-parser',
    '@apidevtools/json-schema-ref-parser',
    '@apidevtools/openapi-schemas',
    '@apidevtools/swagger-methods',
    'react',
    'ink',
    'ink-select-input',
  ],
  sourcemap: true,
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
});
