# Integration Mock Hub

OpenAPI-first mock server with deterministic scenario overrides and strict validation.

## Install

```bash
npm i -D @brentbroeckx/mock-hub
```

Run without installing:

```bash
npx mock-hub run --spec ./openapi.yaml --source ./scenarios
```

Global install:

```bash
npm i -g @brentbroeckx/mock-hub
mock-hub run --spec ./openapi.yaml --source ./scenarios
```

## Quick start

1. Create an OpenAPI spec (example: [openapi.yaml](scenarios/examples/default/openapi.yaml)).
2. (optional) Create a scenarios directory (example: [scenarios](scenarios)).
3. Run the server:

```bash
npx mock-hub run --spec ./openapi.yaml
or
npx mock-hub run --spec ./openapi.yaml --source ./scenarios
```

## CLI usage

```bash
mock-hub run --spec <path> [--source <dir>] [--scenario <name>] [--ui] [--logging] [--port <number>] [--verbose]
```

Help:

```bash
mock-hub run --help
```

### CLI options

- `--spec <path>`: Path to OpenAPI spec (YAML or JSON). Required.
- `--source <dir>`: Directory containing `.yaml` scenario files. Optional; if omitted, happy-path responses are used.
- `--scenario <name>`: Default scenario name to apply when no header override is provided.
- `--ui`: Launch interactive scenario selector (Ink).
- `--logging`: Enable deterministic logs (pretty in CLI/UI, JSONL in CI).
- `--port <number>`: Port to run the mock server (default: 4010).

### Examples

```bash
npx mock-hub run --spec ./openapi.yaml
npx mock-hub run --spec ./openapi.yaml --source ./scenarios
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario PartnerDown
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --ui
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --logging
```

## CI Usage

Use the mock server in CI to make integration points deterministic, fast, and isolated from external system availability.

### Typical CI Flow

- Start the mock server on a known port with a fixed scenario and deterministic logging.
- Run your test suite against `http://localhost:<port>`.
- Let the pipeline cleanly shut down the server after tests complete.

### Example: Backend Integration Tests

```bash
CI=1 npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario PartnerDown --port 4010 --logging

BASE_URL=http://localhost:4010 npm test

# Force a single request via header (override for one call in your tests)
curl -s -H "X-MockHub-Scenario: PartnerDown" http://localhost:4010/contracts >/dev/null
```

### Example: Frontend E2E Tests

```bash
CI=1 npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario HappyPath --port 4010 --logging

BASE_URL=http://localhost:4010 npx playwright test
```

### Example: Forcing Error Scenarios

```bash
CI=1 npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario PartnerDown --port 4010 --logging

# Validate 503 handling
curl -i -H "X-MockHub-Scenario: PartnerDown" http://localhost:4010/contracts

# Validate 500 handling using another scenario
curl -i -H "X-MockHub-Scenario: PaymentFailed" http://localhost:4010/payments
```

### Notes on Determinism

- Same input $\rightarrow$ same output.
- No random behavior or time‑dependent responses.
- Safe to run in parallel CI jobs when using unique ports per job.

### What Not to Use in CI

- UI mode (`--ui`): requires interactive terminals and is non‑deterministic for automation.
- Interactive scenario switching: can introduce state drift across parallel jobs.

## Scenario file example

Save as [scenarios/partner-down.yaml](scenarios/partner-down.yaml):

```yaml
scenario: PartnerDown
version: 1.0.0
description: Simulate partner API being unavailable
rules:
  - id: partner-down-get
    match:
      path: /contracts/*
      method: GET
      headers:
        X-User-Type: premium
    respond:
      status: 503
      bodyFile: responses/partner_down.json
      delayMs: 500
      headers:
        Retry-After: "30"
  - id: dryrun-validation
    match:
      path: /contracts
      method: POST
      query:
        dryRun: "true"
    respond:
      status: 400
      body:
        error: "Dry-run validation failed"
        code: "VALIDATION_ERROR"
```

## Header override

Per-request override using `X-MockHub-Scenario`:

```
X-MockHub-Scenario: PartnerDown
```

## Configuration locations

- OpenAPI spec: `--spec <path>` (YAML or JSON).
- Scenarios directory: `--source <dir>` containing `.yaml` files and optional `responses/` files.

## Response templating (scenario responses only)

Templating is supported only inside `respond.body` and `respond.bodyFile` (including nested objects/arrays) for scenario-defined responses. Templates are string-only and resolved per response generation.

### Allowed helpers

- `{{uuid}}` RFC 4122 v4 UUID (new value per response)
- `{{now}}` ISO-8601 timestamp (evaluated at response time)
- `{{increment}}` In-memory counter (increments per response, resets on process restart)

No arguments, no nesting, no conditionals, no loops.

### Escaping

Use `\\{{...}}` to output a literal `{{...}}`.

### Example: inline body templating

```yaml
respond:
  status: 201
  body:
    id: "{{uuid}}"
    createdAt: "{{now}}"
    sequence: "{{increment}}"
    note: "Literal: \\{{not-a-template}}"
```

### Example: bodyFile templating

Scenario:

```yaml
respond:
  status: 201
  bodyFile: responses/templated_body.json
```

Response file (templates allowed inside JSON string values):

```json
{
  "id": "{{uuid}}",
  "createdAt": "{{now}}",
  "sequence": "{{increment}}"
}
```

### Validation rules

- Templates are only allowed in `respond.body` and `respond.bodyFile` string values (including nested objects/arrays).
- Templates are not allowed in status codes, headers, match rules, delays/timeouts, or paths/methods.
- Unknown helpers, arguments, nesting, malformed syntax, or templates in non-string values fail validation before startup.

## Validation behavior (strict)

Validation happens before any scenario execution. Invalid files fail fast with precise errors.

### YAML-level

- Syntax errors are rejected with file and line/column.
- Duplicate keys are rejected.
- Only known root keys are allowed.

### Schema-level

- No additional properties allowed.
- Required fields must exist.
- Arrays like `rules` must be non-empty.
- Rule `id` values must be unique within a file.

### Semantic checks

- HTTP status must be $100$–$599$.
- HTTP method must be valid (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD).
- `path` must start with `/` and may include at most one `*` wildcard.
- `body` and `bodyFile` are mutually exclusive.
- `delayMs`/`timeout` must be non-negative.
- `version` must match `x.y.z`.

### Cross-scenario checks

- Scenario names must be unique.
- Reserved scenario names (prefix `auto-gen-`) are rejected.

### Error output example

```
ERROR scenarios/auth.yaml:12:4
 ○ payment-failure: rules[0].match.method
   → "FETCH" is not a valid HTTP method
```

## Project structure (recommended)

```
.
├── src
│   ├── cli
│   ├── openapi
│   ├── responses
│   ├── rules
│   ├── scenarios
│   ├── server
│   ├── state
│   ├── ui
│   └── ...
├── dist
├── scenarios
└── openapi.yaml
```

## Publishing

- Builds output to `dist/` only
- Uses ESM with Node >= 18.
- `bin` points to `dist/cli.js` for `npx` and global usage.
