# Tickets + Linear Integration

Tickets are an optional, default-off feature that lets the orchestrator persist task tickets and optionally sync them to Linear.

## Enablement

Tickets are disabled by default. Enable them in `orchestrator.json`:

```json
{
  "tickets": {
    "enabled": true,
    "storePath": ".opencode/orchestrator/tickets.json",
    "autoFromMemoryTodos": false,
    "linear": {
      "enabled": false,
      "teamId": "lin-team-id"
    }
  }
}
```

Notes:
- `tickets.enabled` gates all ticket operations.
- `tickets.linear.enabled` gates Linear sync.
- `tickets.autoFromMemoryTodos` controls whether memory TODOs create tickets automatically.
- The store path defaults to `.opencode/orchestrator/tickets.json` if omitted.

## Linear Environment Variables

Set these in the orchestrator process environment:

- `LINEAR_API_KEY` (required when Linear sync is enabled)
- `LINEAR_TEAM_ID` (required when Linear sync is enabled, unless configured via `tickets.linear.teamId`)
- `LINEAR_API_URL` (optional override, defaults to `https://api.linear.app/graphql`)

## Status Mapping

Ticket status updates map to Linear state types in this order:

- `open` → `unstarted`, then `backlog`
- `in_progress` → `started`
- `blocked` → `blocked`
- `done` → `completed`
- `canceled` → `canceled`

If no matching state type exists, the sync falls back to name heuristics (e.g. "In Progress", "Done").
