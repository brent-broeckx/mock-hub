export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'OPTIONS'
  | 'HEAD';

export type ScenarioMatch = {
  path: string;
  method?: HttpMethod;
  query?: Record<string, string>;
  headers?: Record<string, string | null | undefined>;
};

export type ScenarioRespond = {
  status: number;
  body?: unknown;
  bodyFile?: string;
  headers?: Record<string, string>;
  delayMs?: number;
  timeout?: number;
};

export type ScenarioRule = {
  id?: string;
  match: ScenarioMatch;
  respond: ScenarioRespond;
};

export type ScenarioFile = {
  scenario: string;
  description?: string;
  version?: string;
  rules: ScenarioRule[];
};

export type LoadedScenario = ScenarioFile & {
  sourcePath: string;
  sourceDir: string;
};
