# Integration Mock Hub

OpenAPI-first mock server with deterministic scenario overrides and strict validation.

## Install

```bash
npm i -D mock-hub
```

Or run without installing:

```bash
npx mock-hub run --spec ./openapi.yaml --source ./scenarios
```

## Quick start

1. Create an OpenAPI spec (example: [openapi.yaml](openapi.yaml)).
2. Create a scenarios directory (example: [scenarios](scenarios)).
3. Run the server:

```bash
npx mock-hub run --spec ./openapi.yaml --source ./scenarios
```

## CLI usage

```bash
mock-hub run --spec <path> --source <dir> [--scenario <name>] [--ui] [--port <number>] [--verbose]
```

Examples:

```bash
npx mock-hub run --spec ./openapi.yaml --source ./scenarios
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario PartnerDown
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario auto-gen-500
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --ui
```

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

Per-request override using `X-Mock-Scenario`:

```
X-Mock-Scenario: PartnerDown
```

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

## Project structure

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
│   └── utils
├── scenarios
└── openapi.yaml
```
