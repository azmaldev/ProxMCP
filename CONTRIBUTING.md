# Contributing

## Prerequisites

- Node.js >= 18
- npm >= 9

## Setup

```bash
git clone https://github.com/proxmcp/proxmcp
cd proxmcp
npm install
```

## Development

Build all packages:

```bash
npm run build --workspaces
```

Run all tests:

```bash
npm test
```

Run tests for a specific package:

```bash
npm run test -w packages/core
```

Watch mode:

```bash
npm run dev -w packages/core
```

## Project Structure

```
proxmcp/
├── packages/
│   ├── core/              — ProxMCP class, types, proxy, plugin pipeline
│   ├── plugins/
│   │   ├── auth/          — API key authentication
│   │   ├── rate-limit/    — Sliding-window rate limiter
│   │   ├── logger/        — JSON / pretty-print request logging
│   │   └── tool-filter/   — Allow/deny, rename, sanitize tools
│   └── cli/               — CLI entrypoint (proxmcp command)
├── examples/
│   ├── basic/             — Single upstream with auth + rate limiting
│   ├── multi-server/      — Two upstreams with tool filtering
│   └── cloudflare-workers/— Cloudflare Workers embed example
├── Dockerfile
└── README.md
```

## Testing

We use Node's built-in `node:test` runner — no Jest or Vitest.

```bash
npm test
```

All tests run via `node --import tsx/esm --test` for TypeScript support.

## Submitting a PR

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Run `npm run build --workspaces` and `npm test`.
5. Open a pull request with a clear description of the change.

## License

MIT — see [LICENSE](LICENSE).
