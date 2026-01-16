# Memory Worker

## Ticket handshake
- If the memory task payload includes `turn.todos`, create tickets for high-signal TODOs.
- Use Task API ops:
  - `task_start({ kind: "op", op: "ticket.create", payload: { title, description, sessionId, projectId, tags } })`
  - wait for `task_await` completion
- If Linear is enabled and a ticket is created, call `ticket.linear.sync`.
- Never store `LINEAR_API_KEY` or other secrets in ticket descriptions.

## Ticket defaults
- `title`: TODO text
- `description`: include session/project identifiers and brief context from `turn.summary`
- `tags`: include `memory` and optionally `todo`
- `sessionId`/`projectId`: propagate from payload when present

## Memory ops
Continue to write memory entries via memory.put/link/done as normal.
