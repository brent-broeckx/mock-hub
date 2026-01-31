# Mock-hub — MVP Specification

## Overview

Integration Mock Hub is a lightweight, local-first mock server designed to help developers, QA, and DevOps teams simulate APIs based on OpenAPI specifications. It automatically generates happy-path responses, allows scenario-based overrides, and supports CLI, terminal UI, and request header overrides.

### Primary goals

- **Accelerate development** by providing predictable API mocks.
- **Enable realistic testing** of error scenarios and edge cases.
- **Integrate easily** with CI/CD pipelines via npm/npx.
- **Lightweight and cross-platform**, usable in any terminal environment.

### Key Principles

- **Contract-first:** OpenAPI spec is the source of truth.
- **Predictable:** deterministic rule evaluation.
- **Flexible:** multiple ways to override (CLI, UI, headers).
- **Minimal friction:** works out-of-the-box with no installation or configuration overhead.

## 1. Core Stack & Tools

| Layer | Technology / Library | Notes |
| :--- | :--- | :--- |
| **Language** | TypeScript | Strong typing, developer-friendly, cross-platform |
| **CLI** | Commander.js | Handles commands, flags (`--scenario`, `--ui`, `--source`) |
| **CLI UI** | Ink | Optional, interactive terminal UI for selecting scenarios |
| **HTTP Server** | Express or Fastify | Lightweight HTTP server for endpoints |
| **OpenAPI Parsing** | `swagger-parser`, `openapi-types` | Reads OpenAPI spec, extracts endpoints, schemas, examples |
| **Mock Body Generation** | `json-schema-faker` | Generates default response bodies from OpenAPI schemas |
| **Scenario Files** | Node FS + `js-yaml` | Read `.yaml` scenario files from directory |
| **Logging** | `debug` or built-in | Configurable verbose logging for developers |

## 2. Core Concepts

- **Default behavior:** Returns happy-path response code automatically.
- **Scenario-based behavior:** Allows developers to simulate errors, delays, and edge cases.
- **Auto-generated responses:** Default bodies generated from OpenAPI schemas or examples.
- **Overrides:** Header-based, CLI, or UI scenario selection.

## 3. Scenario Model

File structure: `scenarios/scenario-name.yaml` (YAML)

**Fields:**

```yaml
scenario: PartnerDown
description: Simulate partner API being unavailable
rules:
  - match:
      path: /contracts/*
      method: GET
      headers:
        X-User-Type: premium
    respond:
      status: 503
      bodyFile: responses/partner_down.json
      delayMs: 500
```

**Rule Matching:**

- **path:** exact or wildcard (`/contracts/*`)
- **method:** optional, defaults to ANY (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
- **query:** optional, top-level key-value match
- **headers:** optional, exact match or existence

**Respond Fields:**

- **status:** HTTP status code
- **body** or **bodyFile**: optional, overrides OpenAPI-generated body
- **headers:** optional
- **delayMs:** optional
- **timeout:** optional

**Priority of evaluation:**

1. Request header (`X-Mock-Scenario`)
2. CLI/UI-selected scenario
3. Auto-gen scenario (`auto-gen-500`)
4. Default happy-path response

## 4. Default Response Behavior

Always return happy-path status code (lowest 2xx) for endpoint.

**Default body generation:**

1. Use example if present in OpenAPI spec
2. Else generate JSON from schema
3. Else return empty body

If no 2xx is defined, pick the lowest available status code and log a warning.

## 5. Auto-Generated Response Scenarios

Special global scenarios for quick testing:

- `auto-gen-500` → all endpoints return 500
- `auto-gen-503` → all endpoints return 503

Useful for frontend error handling, QA, or chaos testing.

Can be selected via CLI (`--scenario auto-gen-500`)

## 6. CLI & UI

**CLI Commands:**

```bash
# Start server with default happy path
npx mock-hub run --source ./scenarios

# Start with specific scenario
npx mock-hub run --source ./scenarios --scenario PartnerDown

# Start with interactive CLI UI
npx mock-hub run --source ./scenarios --ui

# Start with global auto-gen scenario
npx mock-hub run --source ./scenarios --scenario auto-gen-500
```

**UI (Ink):**

- Lightweight, interactive, terminal-based scenario selector
- Read-only for v1
- Shows loaded scenarios and active selection

**Header override (for CI / automation):**

```
X-Mock-Scenario: PartnerDown
```

- Takes highest priority
- Enables deterministic tests per request

## 7. Scenario & OpenAPI Integration

- Scenario rules override status, body, headers, or delay.
- Default bodies auto-generated from OpenAPI.
- Optional body or bodyFile for custom responses.
- Auto-gen scenarios for global endpoint overrides.

## 8. Non-Goals (v1)

| Feature | Supported in v1? | Notes |
| :--- | :--- | :--- |
| Regex in path/query | ❌ | Only exact or wildcard (*) |
| Conditional logic | ❌ | Use multiple rules instead |
| Deep JSON body matching | ❌ | Top-level optional only |
| Non-standard HTTP methods | ❌ | Only GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD |
| Inventing missing endpoints | ❌ | Only use OpenAPI endpoints |
| Cross-endpoint matching | ❌ | Except auto-gen scenarios |
| Stateful matching | ❌ | Stateless only |
| External data fetching | ❌ | Only static or OpenAPI-generated |
| Auth validation | ❌ | Header presence optional only |
| UI rule editing | ❌ | Scenarios edited in files |
| Auto-generate undocumented status codes | ❌ | Must explicitly override with scenario |
## 9. Developer UX Flow

**Default flow:**

```bash
npx mock-hub run --source ./scenarios
```

Returns happy-path status & body for all endpoints.

**Scenario flow:**

```bash
npx mock-hub run --source ./scenarios --scenario PartnerDown
```

Endpoints follow scenario rules.

**UI override:**
Launch `--ui` → switch active scenario in terminal.

**Header override (CI):**
Add `X-Mock-Scenario` per request → overrides scenario and default behavior.

**Auto-gen scenario:**

```bash
npx mock-hub run --source ./scenarios --scenario auto-gen-500
```

All endpoints return specified status code.

## 10. Key Principles

- **Stateless** — No tracking of previous requests in v1.
- **Contract-first** — OpenAPI is the source of truth.
- **Predictable** — Deterministic rule evaluation order.
- **Flexible** — Multiple ways to override: CLI, UI, headers.
- **Low friction** — Works out-of-the-box, no installation required.

## 11. Current implemenations

- [x] Skeleton CLI using Commander
- [x] HTTP server with Fastify

- [x] OpenAPI parser integration + default body generation
- [x] Scenario loader (YAML `.yaml` files)

- [x] Rule engine (matching paths, methods, headers, query)
- [x] CLI UI with Ink for scenario selection

- [x] Auto-gen scenarios (`auto-gen-500`, etc.)
- [x] Header-based overrides

- [x] Logging / verbose mode / startup info

## 11. Next Steps / Roadmap
