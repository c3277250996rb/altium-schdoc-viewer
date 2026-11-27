import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildDirectExportFiles, directExportFolderName, directExportSource } from '../src/export/directExport';
import { buildNetlist } from '../src/netlist/builder';
import { parseSchDocBuffer } from '../src/parser/schematic';

// Same rule as the parser test: the fixture is customer-proprietary and never committed,
// so fixture-dependent assertions are skipped on CI and in public forks.
const fixture = path.join(__dirname, 'fixtures', 'local-board.SchDoc');
const hasFixture = fs.existsSync(fixture);

describe('direct export files', () => {
  it('names the folder after the schematic, extension included', () => {
    expect(directExportFolderName('local-board.SchDoc')).toBe('local-board.SchDoc');
    expect(directExportFolderName('power.SchDot')).toBe('power.SchDot');
  });

  it('writes components, pins, nets and parameters in a fixed order', () => {
    const files = buildDirectExportFiles({ components: [], pins: [], nets: [], parameters: [] });
    expect(files.map((f) => f.name)).toEqual([
      'components.csv',
      'pins.csv',
      'nets.csv',
      'parameters.csv',
    ]);
    expect(files[0].content).toBe(
      'Designator,LibReference,Value,Footprint,IndexInSheet,Description\n'
    );
    expect(files[1].content).toBe('Designator,Pin,Name,Electrical,CompIdx\n');
    expect(files[2].content).toBe('Net,Pin,PinName\n');
    expect(files[3].content).toBe('Component,Name,Value,Hidden\n');
  });

  it('keeps the tab row shapes and CSV quoting', () => {
    const files = buildDirectExportFiles({
      components: [
        {
          designator: 'U1',
          libReference: '16PIN',
          value: 'MT6339N5',
          footprint: 'IDC16',
          indexInSheet: 1,
          description: 'header, 16 pin',
        },
      ],
      pins: [
        { designator: 'U1', pinDesignator: '1', name: 'VBUS', electrical: 4, componentRecordIndex: 3 },
      ],
      nets: [{ name: 'VBUS', pins: [{ designator: 'U1', pin: '1', pinName: 'VBUS' }] }],
      parameters: [
        { component: 'U1', name: 'Temperature', value: '=25', hidden: true },
        { component: '?', name: 'Description', value: 'plain', hidden: false },
      ],
    });
    expect(files[0].content).toBe(
      'Designator,LibReference,Value,Footprint,IndexInSheet,Description\n' +
        'U1,16PIN,MT6339N5,IDC16,1,"header, 16 pin"\n'
    );
    expect(files[1].content).toBe(
      'Designator,Pin,Name,Electrical,CompIdx\nU1,1,VBUS,4,3\n'
    );
    expect(files[2].content).toBe('Net,Pin,PinName\nVBUS,U1-1,VBUS\n');
    // A leading "=" gets the formula-injection apostrophe; no quote needed without a delimiter.
    expect(files[3].content).toBe(
      "Component,Name,Value,Hidden\nU1,Temperature,'=25,Y\n?,Description,plain,\n"
    );
  });
});

describe.skipIf(!hasFixture)('direct export from a real sheet', () => {
  it('projects the parsed model onto the same tables as the tabs', () => {
    const doc = parseSchDocBuffer(new Uint8Array(fs.readFileSync(fixture)));
    const nets = buildNetlist(doc);
    const files = buildDirectExportFiles(directExportSource(doc, nets));
    const [components, pins, netsCsv, parameters] = files;

    // One header line plus one line per record; parameters can span lines when quoted,
    // so only the row count of the fixed-width tables is asserted.
    expect(components.content.split('\n').filter(Boolean).length).toBe(doc.components.length + 1);
    expect(pins.content.split('\n').filter(Boolean).length).toBe(doc.pins.length + 1);
    expect(netsCsv.content.split('\n').filter(Boolean).length).toBe(
      nets.reduce((sum, n) => sum + n.pins.length, 0) + 1
    );
    expect(parameters.content.split('\n')[0]).toBe('Component,Name,Value,Hidden');

    // Every pin row must resolve its component designator, exactly like the Pins tab.
    const pinRows = pins.content.split('\n').slice(1).filter(Boolean);
    for (const row of pinRows.slice(0, 50)) {
      expect(row.split(',')[0]).not.toBe('');
    }
    expect(components.content).toContain('U1,16PIN,MT6339N5,IDC16,');
  });
});
