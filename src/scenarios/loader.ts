import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { LoadedScenario, ScenarioFile } from './types';

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

export const loadScenarios = async (sourceDir: string): Promise<LoadedScenario[]> => {
  const files = await readDirRecursive(sourceDir);
  const scenarioFiles = files.filter((file) => isMockFile(file));

  const scenarios: LoadedScenario[] = [];

  for (const filePath of scenarioFiles) {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = yaml.load(content) as ScenarioFile;

    if (!data || !data.scenario || !Array.isArray(data.rules)) {
      throw new Error(`Invalid scenario file: ${filePath}`);
    }

    scenarios.push({
      ...data,
      sourcePath: filePath,
      sourceDir,
    });
  }

  return scenarios;
};
