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
  .requiredOption('--spec <path>', 'Path to OpenAPI spec (json/yaml)')
  .option('--source <dir>', 'Directory containing .yaml scenario files')
  .option('--scenario <name>', 'Active scenario name')
  .option('--ui', 'Interactive scenario selector', false)
  .option('--logging', 'Emit deterministic JSONL logs', false)
  .option('--port <number>', 'Server port', '4010')
  .option('--verbose', 'Verbose logging', false)
  .action(
    async (options: {
      spec: string;
      source?: string;
      scenario?: string;
      ui?: boolean;
      logging?: boolean;
      port?: string;
      verbose?: boolean;
    }) => {
    const port = Number(options.port);
    const mode: LogMode = options.ui ? 'ui' : process.env.CI ? 'ci' : 'cli';
    const eventLogger = options.logging ? createEventLogger({ mode }) : createNullEventLogger();

    try {
      const spec = await loadOpenApiSpec(options.spec);
      const routes = extractRoutes(spec);
      const scenarios = await loadScenarios(options.source, eventLogger);

      eventLogger.emitEvent({
        event: 'startup',
        mode,
        spec: options.spec,
        sourceDir: options.source,
        ui: Boolean(options.ui),
        port,
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
        verbose: options.verbose,
        eventLogger,
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
