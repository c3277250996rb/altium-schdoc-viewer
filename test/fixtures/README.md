# Test fixtures

`.SchDoc`, `.SchDot`, and `.PrjPcb` files are **not tracked** in this repo — they're
gitignored to prevent accidentally publishing customer-proprietary content. Tests that
need a real Altium binary fixture skip themselves (`describe.skipIf(!hasFixture)`) when
the file is absent, so the suite passes in CI and on public forks.

## Running the full test suite locally

Drop the reference board in this folder as `local-board.SchDoc` and the fixture-dependent
tests will run. The pinned baseline in `test/parser.test.ts` belongs to this exact file:

| Property | Value |
|---|---|
| Size | 802,304 bytes |
| SHA-256 | `F6BCB5F591BB77801F358335CE5A3A01EB9F2EA66728E781B9262727FCBCB729` |
| Records / components / pins | 4304 / 87 / 823 |
| `U1` | `16PIN`, value `MT6339N5`, footprint `IDC16`, 24 pins |

If your copy differs, the parser assertions will fail — re-pin them only after confirming
the fixture really is the intended board. The file must:

- not be tracked (the `.gitignore` at the repo root blocks it)
- remain outside any backup / sync tool that uploads to a public location

A different board can live here too (for example a genuine `AFE-Eval_Schematics_B.SchDoc`):
give it its own file name and its own test file, so each baseline stays pinned to one document.

## Contributing a public-domain fixture

If you can produce a small `.SchDoc` from open-licensed artwork (e.g. a KiCad demo
re-exported via Altium, or an OSHWA-licensed board), that would let CI exercise the real
record path. Check the license, document provenance in this file, and open a PR.

Until then, the unit tests in `test/bom.test.ts` that don't depend on a real fixture
(`compressDesignatorRange`) are the safety net.
