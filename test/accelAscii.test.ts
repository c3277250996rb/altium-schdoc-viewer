import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { netlistToAccelAscii } from '../src/export/accelAscii';
import { buildNetlist } from '../src/netlist/builder';
import { parseSchDocBuffer } from '../src/parser/schematic';

// Fixture stays local only (customer data), so these assertions skip on CI and in forks.
const fixture = path.join(__dirname, 'fixtures', 'local-board.SchDoc');
const hasFixture = fs.existsSync(fixture);

const NOW = new Date(2026, 10, 27, 9, 5, 7);
const BASE = { documentPath: 'C:/t/b.SchDoc', documentName: 'b.SchDoc', now: NOW };

describe('ACCEL_ASCII netlist', () => {
  it('writes the header, global attrs, compInst and net blocks Altium produces', () => {
    const text = netlistToAccelAscii(
      [
        { designator: 'R2', libReference: 'RES', parameters: [{ name: 'Value', value: '10k' }] },
        { designator: 'R10', libReference: 'RES', parameters: [] },
      ],
      [
        {
          id: 'n1',
          name: 'VCC',
          pins: [
            { designator: 'R10', pin: '2', pinName: '2' },
            { designator: 'R2', pin: '1', pinName: '1' },
          ],
        },
      ],
      BASE
    );

    const style = '(textStyleRef "(Default)")';
    expect(text).toBe(
      [
        'ACCEL_ASCII "Free Documents"',
        '(asciiHeader',
        '  (asciiVersion 3 0)',
        '  (fileUnits Mil)',
        ')',
        '(netlist "Netlist_1"',
        '  (globalAttrs',
        `    (attr "CurrentDate" "2026/11/27" ${style})`,
        `    (attr "CurrentTime" "09:05:07" ${style})`,
        `    (attr "DocumentFullPathAndName" "C:/t/b.SchDoc" ${style})`,
        `    (attr "DocumentName" "b.SchDoc" ${style})`,
        `    (attr "ModifiedDate" "2026/11/27" ${style})`,
        `    (attr "ProjectName" "Free Documents" ${style})`,
        `    (attr "SheetNumber" "0" ${style})`,
        `    (attr "SheetTotal" "0" ${style})`,
        '  )',
        '  (compInst "R2"',
        '    (compRef "RES")',
        '    (originalName "RES")',
        `    (attr "Value" "10k" ${style})`,
        `    (attr "Sheet" "" ${style})`,
        '  )',
        '  (compInst "R10"',
        '    (compRef "RES")',
        '    (originalName "RES")',
        `    (attr "Sheet" "" ${style})`,
        '  )',
        '  (net "VCC"',
        '    (node "R2" "1")',
        '    (node "R10" "2")',
        '  )',
        ')',
        '',
      ].join('\n')
    );
  });

  it('sorts designators and parameters naturally, and skips blank records', () => {
    const text = netlistToAccelAscii(
      [
        {
          designator: 'U10',
          libReference: 'IC',
          parameters: [
            { name: 'Value', value: 'B' },
            { name: 'Comment', value: 'A' },
            { name: '', value: 'ignored' },
          ],
        },
        { designator: '', libReference: 'SKIP', parameters: [] },
        { designator: 'U2', libReference: 'IC', parameters: [] },
      ],
      [
        { id: 'a', name: 'N2', pins: [{ designator: 'U2', pin: '1', pinName: '1' }] },
        { id: 'b', name: 'N10', pins: [{ designator: 'U10', pin: '1', pinName: '1' }] },
        { id: 'c', name: 'EMPTY', pins: [] },
      ],
      BASE
    );

    const order = [...text.matchAll(/\(compInst "([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['U2', 'U10']);
    const attrOrder = [...text.matchAll(/\(attr "([^"]+)"/g)]
      .map((m) => m[1])
      .filter((n) => n === 'Comment' || n === 'Value');
    expect(attrOrder).toEqual(['Comment', 'Value']);
    expect(text).not.toContain('SKIP');
    expect(text).not.toContain('ignored');
    expect(text).not.toContain('EMPTY');
    const netOrder = [...text.matchAll(/\(net "([^"]+)"/g)].map((m) => m[1]);
    expect(netOrder).toEqual(['N2', 'N10']);
  });

  it('merges same-named nets and writes each pin once', () => {
    const text = netlistToAccelAscii(
      [],
      [
        {
          id: 'a',
          name: 'GND',
          pins: [
            { designator: 'C1', pin: '2', pinName: '2' },
            { designator: 'C1', pin: '2', pinName: '2' },
          ],
        },
        { id: 'b', name: 'GND', pins: [{ designator: 'R1', pin: '2', pinName: '2' }] },
      ],
      BASE
    );
    expect([...text.matchAll(/\(net "GND"/g)].length).toBe(1);
    expect([...text.matchAll(/\(node "C1" "2"\)/g)].length).toBe(1);
    expect(text).toContain('    (node "C1" "2")\n    (node "R1" "2")\n');
  });

  it('escapes quotes and backslashes in names and values', () => {
    const text = netlistToAccelAscii(
      [
        {
          designator: 'U1',
          libReference: 'A"B\\C',
          parameters: [{ name: 'Note', value: 'say "hi"' }],
        },
      ],
      [],
      BASE
    );
    expect(text).toContain('(compRef "A\\"B\\\\C")');
    expect(text).toContain('(attr "Note" "say \\"hi\\"" (textStyleRef "(Default)"))');
  });
});

describe.skipIf(!hasFixture)('ACCEL_ASCII from a real sheet', () => {
  /** Net blocks whose node list repeats a `designator-pin`. */
  function duplicates(text: string): string[] {
    const bad: string[] = [];
    for (const block of text.matchAll(/^ {2}\(net "([^"]*)"\n([\s\S]*?) {2}\)/gm)) {
      const nodes = [...block[2].matchAll(/\(node "([^"]*)" "([^"]*)"\)/g)].map(
        (n) => `${n[1]}-${n[2]}`
      );
      if (new Set(nodes).size !== nodes.length) bad.push(block[1]);
    }
    return bad;
  }

  it('emits one compInst per component and one merged net block per net name', () => {
    const doc = parseSchDocBuffer(new Uint8Array(fs.readFileSync(fixture)));
    const nets = buildNetlist(doc);
    const text = netlistToAccelAscii(doc.components, nets, {
      documentPath: fixture,
      documentName: 'local-board.SchDoc',
      now: NOW,
    });

    expect(text.startsWith('ACCEL_ASCII "Free Documents"')).toBe(true);
    expect([...text.matchAll(/^ {2}\(compInst "/gm)].length).toBe(doc.components.length);
    // Same-named clusters collapse into one net, so the count is unique names, not nets.length.
    const uniqueNames = new Set(nets.map((n) => n.name));
    expect([...text.matchAll(/^ {2}\(net "/gm)].length).toBe(uniqueNames.size);
    expect(uniqueNames.size).toBeLessThan(nets.length);
    expect(duplicates(text)).toEqual([]);
    expect(text).toContain('(compInst "U1"');
    expect(text).toContain('(node "U1" ');
  });
});
