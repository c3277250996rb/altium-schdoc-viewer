import type { BuiltNet } from '../netlist/builder';

/** Minimal component shape needed for an ACCEL_ASCII netlist. */
export interface AccelComponent {
  designator: string;
  libReference: string;
  parameters: readonly { name: string; value: string }[];
}

export interface AccelAsciiOptions {
  /** Value of `DocumentFullPathAndName`, e.g. `E:\temp\board.SchDoc`. */
  documentPath: string;
  /** Value of `DocumentName`, e.g. `board.SchDoc`. */
  documentName: string;
  /** Header name on the first line; Altium writes the project name, `Free Documents` for a standalone sheet. */
  projectName?: string;
  netlistName?: string;
  units?: 'Mil' | 'mm' | 'Inch';
  /** Timestamp used for CurrentDate / CurrentTime / ModifiedDate; defaults to now. */
  now?: Date;
}

const TEXT_STYLE = '(textStyleRef "(Default)")';

/** Quotes a value the way Altium does: backslash and double quote are escaped. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function attrLine(indent: string, name: string, value: string): string {
  return `${indent}(attr ${quote(name)} ${quote(value)} ${TEXT_STYLE})`;
}

const cmpNatural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Altium writes dates as `yyyy/M/d` (no zero padding). */
function formatDate(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 24-hour `HH:mm:ss`. Altium itself writes a locale time such as `上午11:03:53`. */
function formatTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Altium treats every net of the same name as one net, and each pin appears once per net.
 * The heuristic builder can return several geometric clusters under one label (e.g. `GND`
 * split across unconnected wire islands) and can repeat a pin, so merge by name and dedupe
 * `designator + pin` before writing. Unnamed nets (`N$001`) stay separate because their names
 * are already unique.
 */
function mergeNets(nets: readonly BuiltNet[]): { name: string; nodes: { designator: string; pin: string }[] }[] {
  const byName = new Map<string, Map<string, { designator: string; pin: string }>>();
  for (const net of nets) {
    let nodes = byName.get(net.name);
    if (!nodes) {
      nodes = new Map();
      byName.set(net.name, nodes);
    }
    for (const p of net.pins) {
      if (!p.designator || !p.pin) continue;
      nodes.set(`${p.designator}\u0000${p.pin}`, { designator: p.designator, pin: p.pin });
    }
  }
  return [...byName]
    .filter(([, nodes]) => nodes.size > 0)
    .map(([name, nodes]) => ({ name, nodes: [...nodes.values()] }));
}

/**
 * Altium `ACCEL_ASCII` netlist (`.NET`), as produced by Altium's "ACCEL ASCII" netlist
 * exporter: a global attribute block, one `compInst` per component (its parameters as
 * attributes), then one `net` block per net with a `node` per connected pin.
 *
 * Ordering is natural-sorted by designator / net name, so `R2` precedes `R10`. Altium's own
 * file order can differ because it follows internal record order.
 */
export function netlistToAccelAscii(
  components: readonly AccelComponent[],
  nets: readonly BuiltNet[],
  options: AccelAsciiOptions
): string {
  const now = options.now ?? new Date();
  const projectName = options.projectName ?? 'Free Documents';
  const netlistName = options.netlistName ?? 'Netlist_1';
  const units = options.units ?? 'Mil';
  const date = formatDate(now);

  const lines: string[] = [];
  lines.push(`ACCEL_ASCII ${quote(projectName)}`);
  lines.push('(asciiHeader');
  lines.push('  (asciiVersion 3 0)');
  lines.push(`  (fileUnits ${units})`);
  lines.push(')');
  lines.push(`(netlist ${quote(netlistName)}`);
  lines.push('  (globalAttrs');
  lines.push(attrLine('    ', 'CurrentDate', date));
  lines.push(attrLine('    ', 'CurrentTime', formatTime(now)));
  lines.push(attrLine('    ', 'DocumentFullPathAndName', options.documentPath));
  lines.push(attrLine('    ', 'DocumentName', options.documentName));
  lines.push(attrLine('    ', 'ModifiedDate', date));
  lines.push(attrLine('    ', 'ProjectName', projectName));
  lines.push(attrLine('    ', 'SheetNumber', '0'));
  lines.push(attrLine('    ', 'SheetTotal', '0'));
  lines.push('  )');

  const sortedComponents = components
    .filter((c) => c.designator)
    .sort((a, b) => cmpNatural(a.designator, b.designator));
  for (const c of sortedComponents) {
    lines.push(`  (compInst ${quote(c.designator)}`);
    lines.push(`    (compRef ${quote(c.libReference)})`);
    lines.push(`    (originalName ${quote(c.libReference)})`);
    const parameters = c.parameters
      .filter((p) => p.name)
      .sort((a, b) => cmpNatural(a.name, b.name));
    for (const p of parameters) lines.push(attrLine('    ', p.name, p.value));
    // Altium appends the owning sheet last; a standalone document has an empty sheet name.
    lines.push(attrLine('    ', 'Sheet', ''));
    lines.push('  )');
  }

  const mergedNets = mergeNets(nets).sort((a, b) => cmpNatural(a.name, b.name));
  for (const n of mergedNets) {
    lines.push(`  (net ${quote(n.name)}`);
    const nodes = [...n.nodes].sort(
      (a, b) => cmpNatural(a.designator, b.designator) || cmpNatural(a.pin, b.pin)
    );
    for (const p of nodes) lines.push(`    (node ${quote(p.designator)} ${quote(p.pin)})`);
    lines.push('  )');
  }

  lines.push(')');
  return lines.join('\n') + '\n';
}
