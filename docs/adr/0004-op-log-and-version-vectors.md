# 4. Sync an op log with version vectors; the server is a replica

Date: 2026-11-24
Status: accepted

## Context

Snapshot sync (send the whole state, merge) is simple and wasteful.
Timestamp-since sync ("everything after T") breaks with clock skew: a peer
can create an op stamped earlier than T after T has passed.

## Decision

- Every op carries a gapless sequence number per site. A version vector,
  `{site: highest seq seen}`, describes exactly what a replica holds.
- The protocol is two messages. `hello` carries a version vector; the
  answer is every op the sender lacks. After that, ops are pushed live.
- Receiving is defensive: duplicates are dropped, gaps and missing
  anchors are parked and retried. Any transport works, including ones
  that reorder or redeliver.
- The relay is a replica that never edits. It persists the log in SQLite,
  answers deltas, and forwards what it learns. It holds no special
  authority: two clients can sync peer to peer with the same code.

## Consequences

- Reconnecting after a week offline sends what changed, not the database.
- The log only grows. Compaction (a snapshot plus the tail) is a storage
  concern of the relay and does not change the protocol.
- No authorization yet: anyone connected to a relay can write. A real
  deployment scopes relays per document and checks a token on upgrade.
