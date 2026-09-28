# Production orchestration contracts

These contracts describe the 501 target boundary around the canonical
`multi-agent-quickstart` runtime. They do not duplicate that runtime and do not
claim that the Launchpad 501 charter is executable or certified.

- `agent-registry.v1.json` pins role cards, allowed tools, evidence inputs and
  outputs, authority, and failure isolation to the inspected runtime revision.
- `mcp-tool-contract.v1.json` defines MCP correlation, bounded retries,
  cancellation, timeouts, idempotency, and mutation authorization.
- `policy.v1.json` defines deterministic admission and preserves human approval,
  certification, and promotion authority.

The executable scale service enforces evidence source labels, bounded
concurrency, cancellation, proof correlation, deterministic quality scoring,
approved Intel telemetry admission, and no automated promotion. The controlled
pressure boundary separately enforces exact targets, one-time authorization,
idempotent application/removal, automatic rollback, and independent recovery
verification.
