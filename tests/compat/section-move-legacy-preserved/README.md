# Legacy section move

This model-owned scenario records a schema-14 section move that keeps existing
line IDs, line order, unknown action keys, and unknown dialogue fields. Its seed
and expected state were originally observed with model 1.14.0 and are copied
byte-for-byte from the client preparation documents. The manifest records the
source revision, original file hashes, and adopted file hashes.

`commands.json` contains only model command types and domain payloads. The old
preparation scenario's illustrative transport envelopes and future model-version
value are not model inputs. Tests call the unversioned legacy APIs, compare the
complete ordered state from sequential processing and batch replay, and assert
that moving the section retains its existing lines without recreating them.

Run `bunx vitest run tests/section-move-compatibility.test.js` or `bun run test`.
The suite needs no client checkout, browser, database, or package release.

These frozen expectations must not be regenerated from a candidate reducer.
Strict version dispatch, affected-reference rejection, and strict copy/duplicate
behavior are separate future tests; this scenario proves legacy compatibility.
