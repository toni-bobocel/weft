# 2. Hybrid logical clocks for every timestamp

Date: 2026-11-24
Status: accepted

## Context

Last-writer-wins needs to agree on "last". Wall clocks drift and jump
backwards; a phone left in airplane mode for a week can be minutes off.
Lamport clocks are causal but meaningless to a person reading a conflict
log ("counter 8812 beat counter 8790").

## Decision

Hybrid logical clocks: the physical time when clocks agree, a logical
counter when they do not, the node id as the final tie-break. Encoded as
fixed-width base 36 so ids sort as plain strings.

Remote timestamps more than 60 seconds ahead are refused. The relay drops
such a peer with close code 4400 instead of letting it drag every clock
forward and win every conflict until the real time catches up.

## Consequences

- If A happened before B, `ts(A) < ts(B)`, regardless of wall clocks. The
  RGA depends on this (ADR 3).
- Timestamps stay readable: the inspector can show the time a write was
  made, not just its order.
- "Last" means last by HLC, not last by human perception. Two edits a few
  milliseconds apart on two devices are a coin toss that is at least the
  same coin toss everywhere.
