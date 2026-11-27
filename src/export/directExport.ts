import { csvFromTable } from '../editor/webview/csv';
import type { BuiltNet } from '../netlist/builder';
import type { ParsedSchDoc } from '../parser/schematic';
import {
  componentTable,
  netConnectionTable,
  parameterTable,
  pinTable,
  type ComponentRow,
  type NetRow,
  type ParameterRow,
  type PinRow,
  type ReportTable,
} from './tables';

/** Everything Direct Export writes, in the tab row shapes. */
export interface DirectExportSource {
  components: readonly ComponentRow[];
  pins: readonly PinRow[];
  nets: readonly NetRow[];
  parameters: readonly ParameterRow[];
}

export interface DirectExportFile {
  name: string;
  content: string;
}

/** Folder prefix keeps exports apart from the schematic and makes them obvious in a listing. */
export const DIRECT_EXPORT_FOLDER_PREFIX = 'Direct-Export_';

/** Folder name: `Direct-Export_` + the schematic's file name *including* its extension. */
export function directExportFolderName(fileName: string): string {
  return `${DIRECT_EXPORT_FOLDER_PREFIX}${fileName}`;
}

/** Project the parsed model onto the tab rows, resolving each pin's component designator. */
export function directExportSource(doc: ParsedSchDoc, nets: readonly BuiltNet[]): DirectExportSource {
  const designators = new Map(doc.components.map((c) => [c.recordIndex, c.designator]));
  return {
    components: doc.components,
    pins: doc.pins.map((pin) => ({
      designator: designators.get(pin.componentRecordIndex) ?? '',
      pinDesignator: pin.pinDesignator,
      name: pin.name,
      electrical: pin.electrical,
      componentRecordIndex: pin.componentRecordIndex,
    })),
    nets,
    parameters: doc.components.flatMap((c) =>
      c.parameters.map((par) => ({
        component: c.designator || '?',
        name: par.name,
        value: par.value,
        hidden: par.hidden,
      }))
    ),
  };
}

/** The four CSVs written by Direct Export, always in this order. */
export function buildDirectExportFiles(source: DirectExportSource): DirectExportFile[] {
  const tables: [string, ReportTable][] = [
    ['components.csv', componentTable(source.components)],
    ['pins.csv', pinTable(source.pins)],
    ['nets.csv', netConnectionTable(source.nets)],
    ['parameters.csv', parameterTable(source.parameters)],
  ];
  return tables.map(([name, table]) => ({ name, content: csvFromTable(table.headers, table.rows) }));
}
