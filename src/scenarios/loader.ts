import fs from 'node:fs/promises';
import path from 'node:path';
import { LoadedScenario } from './types';
import {
  formatValidationErrors,
  validateScenarioFile,
  validateScenarioSet,
  ValidationError,
} from './validation';
import { EventLogger } from '../logging/event-logger';

const isMockFile = (name: string): boolean => name.toLowerCase().endsWith('.yaml');

const readDirRecursive = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readDirRecursive(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

export const loadScenarios = async (
  sourceDir?: string,
  eventLogger?: EventLogger
): Promise<LoadedScenario[]> => {
  if (!sourceDir) {
    eventLogger?.emitEvent({
      event: 'scenarios-discovered',
      scenarios: [],
    });
    return [];
  }

  const files = await readDirRecursive(sourceDir);
  const scenarioFiles = files.filter((file) => isMockFile(file)).sort();

  eventLogger?.emitEvent({
    event: 'config-files',
    files: scenarioFiles,
  });

  const scenarios: LoadedScenario[] = [];
  const validationErrors: ValidationError[] = [];

  for (const filePath of scenarioFiles) {
    const result = await validateScenarioFile(filePath);

    if (result.errors.length > 0) {
      const sortedErrors = [...result.errors].sort((a, b) =>
        `${a.path}:${a.message}`.localeCompare(`${b.path}:${b.message}`)
      );
      eventLogger?.emitEvent({
        event: 'validation-file',
        file: filePath,
        result: 'failed',
        errors: sortedErrors.map((error) => ({
          path: error.path,
          message: error.message,
          severity: error.severity,
          ruleId: error.ruleId,
          line: error.line,
          column: error.column,
        })),
      });
      validationErrors.push(...result.errors);
      continue;
    }

    eventLogger?.emitEvent({
      event: 'validation-file',
      file: filePath,
      result: 'ok',
    });

    if (result.scenario) {
      scenarios.push({
        ...result.scenario,
        sourcePath: filePath,
        sourceDir,
      });
    }
  }

  if (scenarios.length > 0) {
    validationErrors.push(...validateScenarioSet(scenarios, sourceDir));
  }

  eventLogger?.emitEvent({
    event: 'scenarios-discovered',
    scenarios: scenarios.map((scenario) => scenario.scenario).sort(),
  });

  const errorList = validationErrors.filter((entry) => entry.severity === 'error');
  const warningList = validationErrors.filter((entry) => entry.severity === 'warning');

  eventLogger?.emitEvent({
    event: 'validation-summary',
    errors: errorList.length,
    warnings: warningList.length,
  });

  if (errorList.length > 0) {
    throw new Error(formatValidationErrors(errorList));
  }

  return scenarios;
};
