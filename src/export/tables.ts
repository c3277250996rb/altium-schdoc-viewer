import { netConnectionRows } from '../editor/webview/csv';

/** A tab's columns plus its data rows, as plain strings ready for CSV. */
export interface ReportTable {
  headers: string[];
  rows: string[][];
}

/**
 * Structural row shapes shared by the webview payload and the parsed model, so the tabs and
 * Direct Export are built from one definition and cannot drift apart.
 */
export interface ComponentRow {
  designator: string;
  libReference: string;
  value: string;
  footprint: string;
  indexInSheet: number;
  description: string;
}

export interface PinRow {
  designator: string;
  pinDesignator: string;
  name: string;
  electrical: number;
  componentRecordIndex: number;
}

export interface NetRow {
  name: string;
  pins: { designator: string; pin: string; pinName: string }[];
}

export interface ParameterRow {
  component: string;
  name: string;
  value: string;
  hidden: boolean;
}

export interface RawRecordRow {
  index: number;
  type: number | null;
  preview: string;
}

export function componentTable(components: readonly ComponentRow[]): ReportTable {
  return {
    headers: ['Designator', 'LibReference', 'Value', 'Footprint', 'IndexInSheet', 'Description'],
    rows: components.map((c) => [
      c.designator,
      c.libReference,
      c.value,
      c.footprint,
      String(c.indexInSheet),
      c.description,
    ]),
  };
}

export function pinTable(pins: readonly PinRow[]): ReportTable {
  return {
    headers: ['Designator', 'Pin', 'Name', 'Electrical', 'CompIdx'],
    rows: pins.map((p) => [
      p.designator,
      p.pinDesignator,
      p.name,
      String(p.electrical),
      String(p.componentRecordIndex),
    ]),
  };
}

/** Nets tab view: one row per net with the pin list joined into a single cell. */
export function netTable(nets: readonly NetRow[]): ReportTable {
  return {
    headers: ['Net', 'Pins'],
    rows: nets.map((n) => [n.name, n.pins.map((p) => `${p.designator}-${p.pin}`).join(', ')]),
  };
}

/** One row per connection - this is what the Nets tab and Direct Export write to CSV. */
export function netConnectionTable(nets: readonly NetRow[]): ReportTable {
  return { headers: ['Net', 'Pin', 'PinName'], rows: netConnectionRows(nets) };
}

export function parameterTable(parameters: readonly ParameterRow[]): ReportTable {
  return {
    headers: ['Component', 'Name', 'Value', 'Hidden'],
    rows: parameters.map((p) => [p.component, p.name, p.value, p.hidden ? 'Y' : '']),
  };
}

export function rawRecordTable(records: readonly RawRecordRow[]): ReportTable {
  return {
    headers: ['Index', 'RECORD', 'Preview'],
    rows: records.map((r) => [String(r.index), r.type === null ? '' : String(r.type), r.preview]),
  };
}
