# 1. Write the CRDTs instead of adopting Yjs or Automerge

Date: 2026-11-24
Status: accepted

## Context

Yjs and Automerge are excellent and battle-tested. They are also large,
opinionated about document shape, and opaque at the exact moment a sync bug
needs explaining: "why did this field end up with that value on that
device" is answered by reading someone else's internals.

The data here is narrow: records with a handful of fields, plus a few text
bodies. That fits two well-understood structures.

## Decision

- Fields are last-writer-wins registers keyed by a hybrid logical clock.
- Text is an RGA sequence.
- Both are written here, in about 500 lines with no dependencies, and run
  unchanged in the browser and on the relay.
- Correctness is not argued, it is tested: a property test generates
  thousands of histories with concurrent edits, clock skew, drops,
  duplicates and reordering, and requires byte-identical state at the end.

## Consequences

- Every merge decision is inspectable; the demo shows them as they happen.
- No rich text, no move operation, no undo across peers. Those are where
  the libraries earn their size; adopting one later is a storage-format
  migration, not a rewrite of the app, because the app talks to `Replica`.
- Tombstones are never collected (see ADR 3).
