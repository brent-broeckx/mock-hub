# Test Strategy (Vitest, memfs, execa)

This document defines the test suite structure, categories, fixture strategy, naming rules, examples, CI alignment, and explicit non-goals. It is intentionally opinionated for long-term maintainability.

## 1) Test folder structure

```
.
├── tests
│   ├── unit
│   │   ├── openapi
│   │   ├── rules
│   │   ├── scenarios
│   │   ├── templating
│   │   ├── responses
│   │   └── logging
│   ├── integration
│   │   └── cli
│   ├── fixtures
│   │   ├── openapi
│   │   ├── scenarios
│   │   ├── templates
│   │   └── invalid
│   └── helpers
│       ├── memfs.ts
│       ├── execa.ts
│       └── assertions.ts
└── ...
```

**Why each folder exists**
- **tests/unit/**: Pure logic tests for deterministic behavior and fast feedback. No process spawning, no networking, no real FS writes.
- **tests/integration/cli/**: Minimal CLI behavior tests using `execa` against the built CLI entrypoint. Covers flag parsing and exit behavior only.
- **tests/fixtures/**: Declarative YAML/JSON/templating inputs reused across suites. No runtime-generated files.
- **tests/helpers/**: Test-only helpers for memfs setup, CLI invocation, and reusable assertions.

## 2) Test categories

### Validation tests
**Belongs here**
- YAML syntax/duplicate keys errors
- Scenario schema validation (required keys, allowed keys, types)
- Semantic constraints (HTTP method, status, path rules)
- Template validation rules (placement, allowed helpers)

**Does not belong here**
- Rule matching precedence
- Response selection
- CLI flags

Primary modules: [src/scenarios/validation.ts](src/scenarios/validation.ts), [src/templating/validation.ts](src/templating/validation.ts)

### Matching tests
**Belongs here**
- Path matching with and without wildcard
- Method matching
- Header and query matching semantics
- Case-insensitive header keys
- Trailing slash normalization

**Does not belong here**
- Scenario selection precedence across sources
- Logging or CLI parsing

Primary module: [src/rules/matcher.ts](src/rules/matcher.ts)

### Scenario precedence tests
**Belongs here**
- Header override vs default scenario
- Active scenario vs per-request override
- Fallback to happy-path when no scenario matches
- Auto-generated scenario naming behavior

**Does not belong here**
- OpenAPI parsing details
- CLI option parsing

Primary modules: [src/server/server.ts](src/server/server.ts), [src/scenarios/types.ts](src/scenarios/types.ts)

### OpenAPI parsing tests
**Belongs here**
- Dereferencing behavior
- Path/method extraction
- Operation ID usage for response mapping

**Does not belong here**
- Response generation or templating

Primary module: [src/openapi/parser.ts](src/openapi/parser.ts)

### Response selection tests
**Belongs here**
- Default response selection (lowest 2xx or lowest status)
- Example preference over schema-generated
- Behavior when example missing or schema invalid

**Does not belong here**
- Scenario precedence or validation errors

Primary module: [src/responses/generator.ts](src/responses/generator.ts)

### Templating resolution tests
**Belongs here**
- `{{uuid}}`, `{{now}}`, `{{increment}}` rendering
- Escaping `\{{...}}`
- Per-scenario `increment` isolation

**Does not belong here**
- Validation errors (those go in validation tests)

Primary modules: [src/templating/parser.ts](src/templating/parser.ts), [src/templating/render.ts](src/templating/render.ts)

### Deterministic logging tests
**Belongs here**
- JSONL shape and deterministic key ordering
- Absence of undefined keys
- Event type coverage for scenario resolution

**Does not belong here**
- UI rendering
- CLI parsing

Primary module: [src/logging/event-logger.ts](src/logging/event-logger.ts)

### CLI parsing tests
**Belongs here**
- Required flags enforcement
- Help output and exit codes
- `--logging` mode behavior
- `--ui` excluded from tests (explicitly not used)

**Does not belong here**
- OpenAPI parsing details
- Scenario matching logic

Primary module: [src/cli/index.ts](src/cli/index.ts)

### Error tests
**Belongs here**
- Bad OpenAPI specs
- Bad YAML scenario files
- Invalid templates

**Does not belong here**
- Normal happy-path flows

Primary modules: [src/openapi/parser.ts](src/openapi/parser.ts), [src/scenarios/validation.ts](src/scenarios/validation.ts)

## 3) Fixture strategy

### Sources
- **OpenAPI fixtures**: YAML or JSON in tests/fixtures/openapi/
- **Scenario fixtures**: YAML in tests/fixtures/scenarios/
- **Templates**: JSON in tests/fixtures/templates/
- **Invalid inputs**: tests/fixtures/invalid/ for error tests

### In-memory FS
- Use `memfs` for all fixture access. Do not write to disk.
- Use a single helper in tests/helpers/memfs.ts that exposes `loadFixtures()` and `resetFs()`.
- Use `vol.fromJSON()` with absolute-like POSIX paths (example: `/specs/openapi.yaml`) to avoid Windows path inconsistencies.

### Naming conventions
- OpenAPI: `pets.v3.yaml`, `orders.v3.with-refs.yaml`
- Scenarios: `partner-down.yaml`, `invalid-method.yaml`
- Templates: `templated-body.json`, `templated-array.json`
- Invalid: `bad-yaml.dup-keys.yaml`, `bad-template.nested.yaml`

### Edge cases
- Invalid YAML (duplicate keys, malformed)
- Invalid semantic constraints (method, status, path wildcard usage)
- Template location violations (non-string or outside `respond.body`/`respond.bodyFile`)

## 4) Test naming conventions

### File naming
- Use `*.test.ts` under tests/.
- Structure: `<module>.<category>.test.ts`.
  - Example: `openapi.parser.unit.test.ts`

### Test case naming
- Use consistent grammar: `should <expected behavior> when <condition>`.
- Example: `should reject invalid HTTP method when method is FETCH`.

### Describe blocks
- Top-level: `describe('<module>')`.
- Nested: `describe('<category>')`.
- Keep one responsibility per `describe`.

## 5) Sample test skeletons (short, real)

### A) Pure unit test (OpenAPI parsing)
```ts
import { describe, it, expect } from "vitest";
import { parseOpenApi } from "../../src/openapi/parser";
import { vol } from "memfs";

describe("openapi", () => {
  describe("parser", () => {
    it("should extract paths and methods from a valid spec", async () => {
      vol.fromJSON({
        "/specs/openapi.yaml": `openapi: 3.0.0\ninfo:\n  title: Test\n  version: 1.0.0\npaths:\n  /pets:\n    get:\n      responses:\n        '200':\n          description: ok\n`,
      });

      const result = await parseOpenApi("/specs/openapi.yaml");

      expect(result.routes).toHaveLength(1);
      expect(result.routes[0]).toMatchObject({ path: "/pets", method: "GET" });
    });
  });
});
```

### B) Scenario precedence test
```ts
import { describe, it, expect } from "vitest";
import { resolveScenario } from "../../src/server/server";

describe("server", () => {
  describe("scenario precedence", () => {
    it("should prefer header override over active scenario", () => {
      const resolved = resolveScenario({
        headerScenario: "PartnerDown",
        activeScenario: "HappyPath",
        scenarios: ["PartnerDown", "HappyPath"],
      });

      expect(resolved).toBe("PartnerDown");
    });
  });
});
```

### C) CLI flag test (execa)
```ts
import { describe, it, expect } from "vitest";
import { execa } from "execa";

describe("cli", () => {
  it("should fail fast when --spec is missing", async () => {
    const result = await execa("node", ["dist/cli.js", "run"], {
      reject: false,
      env: { CI: "1" },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--spec");
  });
});
```

### D) Deterministic logging test
```ts
import { describe, it, expect } from "vitest";
import { EventLogger } from "../../src/logging/event-logger";

describe("logging", () => {
  it("should emit stable JSONL with sorted keys", () => {
    const logger = new EventLogger({ mode: "jsonl" });

    const line = logger.serialize({
      type: "scenario-resolved",
      scenario: "PartnerDown",
      requestId: "req-1",
      path: "/contracts",
      method: "GET",
    });

    expect(line).toBe(
      '{"method":"GET","path":"/contracts","requestId":"req-1","scenario":"PartnerDown","type":"scenario-resolved"}\n'
    );
  });
});
```

## 6) CI alignment

### Parallel-friendly structure
- Most tests are pure unit tests and run quickly in parallel.
- Only CLI tests spawn a process; keep those minimal and targeted.

### Deterministic output
- Avoid time/uuid helpers in tests unless explicitly asserted with stubs.
- Use `memfs` fixtures for all file interactions.

### Fail loudly and clearly
- No snapshots for large JSON blobs.
- Assert exact failure messages for validation errors when stable.

### Example npm scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:ci": "vitest run --reporter=verbose --no-watch --coverage=false"
  }
}
```

## 7) Explicit non-goals

- **UI rendering tests**: UI is Ink-based and non-deterministic in CI. Risk is mitigated by state-transition unit tests only.
- **End-to-end HTTP server tests**: Slow and flaky; correctness is covered by parsing, matching, and response-generation unit tests.
- **Network calls**: Not required. All inputs are file-based and handled via memfs.
- **Real filesystem writes**: Avoided entirely via memfs to keep tests hermetic.
- **Publishing tests to npm**: Tests remain under tests/ and are excluded from npm package output by build/publish configuration.
