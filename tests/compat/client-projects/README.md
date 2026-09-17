# Frozen old-client domain streams

These four synthetic projects were authored by pinned Creator clients. Their
command streams were adopted from frozen SQLite packs; expected domain states
were produced only by the released model 1.15.0 in the independently installed
previous-reader checkout. Each file records its source path/hash, writer and
previous-reader revisions and dependency identities. SHA-256 sidecars prevent
accidental fixture rewriting.

`tests/client-project-compatibility.test.js` has no client, database or browser
dependency. It exercises payload, state/precondition, sequential and batch APIs
and compares the exact resulting data. Existing schema archives 1–15 and their
historical subset comparison remain unchanged. These tests preserve legacy
behavior, including unsupported action fields, rather than validating strict
new authoring. Client-owned spritesheet adapters and checkpoint recovery remain
in the client suite.

The one-time adoption script refuses to overwrite existing files and requires
model 1.15.0. Never regenerate expected data using a candidate validator.
