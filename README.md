# Integration Mock Hub

Lightweight, local-first OpenAPI mock server with scenario overrides.

## Project structure

```
.
├── src
│   ├── cli
│   │   └── index.ts
│   ├── openapi
│   │   ├── parser.ts
│   │   └── types.ts
│   ├── responses
│   │   └── generator.ts
│   ├── rules
│   │   └── matcher.ts
│   ├── scenarios
│   │   ├── loader.ts
│   │   └── types.ts
│   ├── server
│   │   └── server.ts
│   ├── state
│   │   └── scenario-state.ts
│   ├── ui
│   │   └── scenario-ui.tsx
│   └── utils
│       ├── logger.ts
│       ├── path.ts
│       └── sleep.ts
├── scenarios
│   ├── partner-down.yaml
│   └── responses
│       └── partner_down.json
├── package.json
└── tsconfig.json
```

## Usage

### Install deps

```bash
npm install
```

### Local run (dev)

```bash
npm run dev -- --spec ./openapi.yaml --source ./scenarios
```

### Build

```bash
npm run build
```

### Run built CLI

```bash
node dist/cli.js run --spec ./openapi.yaml --source ./scenarios
```

### npx usage

```bash
npx mock-hub run --spec ./openapi.yaml --source ./scenarios
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario PartnerDown
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --scenario auto-gen-500
npx mock-hub run --spec ./openapi.yaml --source ./scenarios --ui
```

## Scenario rules

- `path` supports exact or wildcard (`/contracts/*`)
- `headers` match exact value or existence
- `query` match exact key/value
- `method` optional

### Header override

```
X-MockHub-Scenario: PartnerDown
```

## TODO

- Stateful mocks with request history
- Complex rule matching (regex, JSON body matching)
- UI editing and inline rule changes
- Scenario hot reload via file watcher
