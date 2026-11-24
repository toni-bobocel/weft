# 3. RGA for text, tombstones kept

Date: 2026-11-24
Status: accepted

## Context

Text edited on two devices at once cannot be last-writer-wins as a whole
string: one person's paragraph would vanish. It needs per-character merge
where concurrent words stay intact rather than interleaving letter by
letter.

## Decision

Replicated Growable Array. Each character records the id of the character
it was typed after. Siblings are ordered by id, newest first. Because ids
are HLC timestamps, everything typed after a newer sibling is newer still,
so the integration loop is "skip while the id is greater than mine". Runs
typed concurrently at the same spot stay contiguous; the unit tests pin
that.

Deletes mark a tombstone. An insert that arrives anchored to a character
this replica has not seen yet is parked until the anchor lands.

## Consequences

- Linear scan on insert. Fine for notes and descriptions; a 100k-character
  document wants a tree (or a library, ADR 1).
- Tombstones grow forever. Collecting them safely needs every replica to
  have seen the delete, which a relay can know only if it tracks every
  peer's version vector. Deferred until a document actually gets heavy.
