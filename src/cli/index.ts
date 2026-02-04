#!/usr/bin/env node
import { Command } from 'commander';
import { loadOpenApiSpec, extractRoutes } from '../openapi/parser';
import { loadScenarios } from '../scenarios/loader';
import { startServer } from '../server/server';
import { ScenarioState } from '../state/scenario-state';
import { startScenarioUI } from '../ui/scenario-ui';
import { createEventLogger, createNullEventLogger, LogMode } from '../logging/event-logger';

const program = new Command();

program
  .name('mock-hub')
  .description('Integration Mock Hub - OpenAPI-driven mock server')
  .version('0.1.0');

program
  .command('run')
  .description('Start the mock server')
  .option('--spec <path>', 'Path to OpenAPI spec (json/yaml)')
  .option('--source <dir>', 'Directory containing .yaml scenario files')
  .option('--scenario <name>', 'Active scenario name')
  .option('--ui', 'Interactive scenario selector', false)
  .option('--logging', 'Emit deterministic logs', false)
  .option('--port <number>', 'Server port', '4010')
  .option('--proxy <baseUrl>', 'Proxy base URL for unmatched requests')
  .addHelpText(
    'after',
    `\nExamples:\n  mock-hub run --spec ./openapi.yaml\n  mock-hub run --spec ./openapi.yaml --source ./scenarios\n  mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario PartnerDown\n  mock-hub run --spec ./openapi.yaml --source ./scenarios --ui\n`
  )
  .action(
    async (options: {
      spec?: string;
      source?: string;
      scenario?: string;
      ui?: boolean;
      showLog?: boolean;
      logging?: boolean;
      port?: string;
      proxy?: string;
    }) => {
    const port = Number(options.port);
    const mode: LogMode = options.ui ? 'ui' : process.env.CI ? 'ci' : 'cli';
    const proxyBaseUrl = options.proxy?.trim() || undefined;
    const specPath = options.spec?.trim() || undefined;
    // Resolve run mode before loading any files. Spec is optional only in proxy mode.
    const runMode = proxyBaseUrl ? 'proxy' : 'mock';
    const shouldLog = Boolean(options.showLog || options.logging);
    const eventLogger = shouldLog
      ? createEventLogger({ mode, format: mode === 'ci' ? 'jsonl' : 'pretty' })
      : createNullEventLogger();

    try {
      if (runMode === 'mock' && !specPath) {
        throw new Error('OpenAPI spec is required when not using --proxy');
      }

      const spec = specPath ? await loadOpenApiSpec(specPath) : undefined;
      const routes = spec ? extractRoutes(spec) : [];
      const scenarios = await loadScenarios(options.source, eventLogger);

      eventLogger.emitEvent({
        event: 'startup',
        mode,
        spec: specPath,
        sourceDir: options.source,
        ui: Boolean(options.ui),
        port,
        proxyBaseUrl,
      });

      const scenarioState = new ScenarioState();
      scenarioState.set(options.scenario);

      if (options.ui) {
        startScenarioUI(
          scenarios.map((scenario) => scenario.scenario),
          scenarioState.get(),
          (next) => scenarioState.set(next)
        );
      }

      await startServer({
        routes,
        scenarios,
        scenarioState,
        port,
        eventLogger,
        proxyBaseUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown startup error';
      eventLogger.emitEvent({
        event: 'startup-failed',
        message,
      });
      process.exitCode = 1;
    }
    }
  );

program.parseAsync(process.argv);
