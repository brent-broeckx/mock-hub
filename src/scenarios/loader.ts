import fs from 'node:fs/promises';
import path from 'node:path';
import { LoadedScenario } from './types';
import {
  formatValidationErrors,
  validateScenarioFile,
  validateScenarioSet,
  ValidationError,
} from './validation';

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

export const loadScenarios = async (sourceDir?: string): Promise<LoadedScenario[]> => {
  if (!sourceDir) {
    return [];
  }

  const files = await readDirRecursive(sourceDir);
  const scenarioFiles = files.filter((file) => isMockFile(file));

  const scenarios: LoadedScenario[] = [];
  const validationErrors: ValidationError[] = [];

  for (const filePath of scenarioFiles) {
    const result = await validateScenarioFile(filePath);

    if (result.errors.length > 0) {
      validationErrors.push(...result.errors);
      continue;
    }

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

  const errorList = validationErrors.filter((entry) => entry.severity === 'error');
  const warningList = validationErrors.filter((entry) => entry.severity === 'warning');

  if (warningList.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(formatValidationErrors(warningList));
  }

  if (errorList.length > 0) {
    throw new Error(formatValidationErrors(errorList));
  }

  return scenarios;
};
