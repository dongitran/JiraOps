# AGENTS.md

## Mandatory Order

1. For UI/UX changes, update `docs/designs/prototypes/` first.
2. Verify the prototype with MCP Playwright through an HTTP server.
3. Only after the prototype is correct, start TDD and implement extension code.

## Prototype Server

- Start: `python3 -m http.server 4174 --bind 127.0.0.1 --directory docs/designs/prototypes`
- Open: `http://127.0.0.1:4174/index.html`

## Required Validation

- `npm run validate:root`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`

## Security

- Never log OAuth tokens, client secrets, Authorization headers, or raw credential payloads.
- Store secrets only in VS Code SecretStorage or environment variables.
- Keep e2e data deterministic and non-sensitive.
