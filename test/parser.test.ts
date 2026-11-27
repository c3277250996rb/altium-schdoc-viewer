import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSchDocBuffer } from '../src/parser/schematic';
import { splitRecords } from '../src/parser/records';
import { readFileHeaderStream } from '../src/parser/cfb';

// Fixture is intentionally NOT committed (customer-proprietary). Contributors with
// legitimate access can drop the same board here locally; CI and public forks skip
// these assertions.
//
// Baseline pinned to `local-board.SchDoc`: 802,304 bytes, SHA-256 F6BCB5F5…,
// U1 = MT6339N5 / IDC16 / 24 pins. If one of these numbers moves, either the fixture
// was replaced or the parser regressed — find out which before touching the values.
const fixture = path.join(__dirname, 'fixtures', 'local-board.SchDoc');
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)('parser', () => {
  it('reads FileHeader stream from OLE SchDoc', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const fh = readFileHeaderStream(buf);
    expect(fh.byteLength).toBeGreaterThan(100_000);
  });

  it('splits records and parses the local board fixture', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    expect(doc.records.length).toBe(4304);
    expect(doc.components.length).toBe(87);
    expect(doc.pins.length).toBe(823);
    expect(doc.wires.length).toBeGreaterThan(100);
    expect(doc.lines.length).toBeGreaterThan(300);
    expect(doc.polylines.length).toBeGreaterThan(50);
    expect(doc.rectangles.length).toBeGreaterThan(25);
    expect(doc.texts.length).toBeGreaterThan(50);
    expect(new Set(doc.pins.map((p) => p.orientation))).toEqual(new Set([0, 1, 2, 3]));
    const u1 = doc.components.find((c) => c.designator === 'U1');
    expect(u1).toBeDefined();
    expect(u1!.libReference).toBe('16PIN');
    expect(u1!.value).toBe('MT6339N5');
    expect(u1!.footprint).toBe('IDC16');
    expect(doc.pins.filter((p) => p.componentRecordIndex === u1!.recordIndex).length).toBe(24);
  });

  it('splitRecords matches full buffer parse', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const fh = readFileHeaderStream(buf);
    const recs = splitRecords(fh);
    expect(recs.length).toBe(4304);
  });
});
