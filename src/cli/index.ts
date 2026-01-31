#!/usr/bin/env node
import { Command } from 'commander';
import { loadOpenApiSpec, extractRoutes } from '../openapi/parser';
import { loadScenarios } from '../scenarios/loader';
import { startServer } from '../server/server';
import { ScenarioState } from '../state/scenario-state';
import { startScenarioUI } from '../ui/scenario-ui';
import { createLogger } from '../utils/logger';

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
  .option('--port <number>', 'Server port', '4010')
  .option('--verbose', 'Verbose logging', false)
  .action(
    async (options: {
      spec: string;
      source?: string;
      scenario?: string;
      ui?: boolean;
      port?: string;
      verbose?: boolean;
    }) => {
    const port = Number(options.port);
    const logger = createLogger('mock-hub', options.verbose);

    try {
      const spec = await loadOpenApiSpec(options.spec);
      const routes = extractRoutes(spec);
      const scenarios = await loadScenarios(options.source);

      logger.info(`Loaded ${scenarios.length} scenario file(s).`);

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
      });
    } catch (error) {
      logger.error('Failed to start mock server.', error);
      process.exitCode = 1;
    }
    }
  );

program.parseAsync(process.argv);
