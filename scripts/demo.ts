// Renders a real .SchDoc into a standalone HTML page that loads dist/webview.js with the
// same init payload SchDocEditorProvider posts inside VS Code, so the viewer can be viewed
// in a plain browser without the extension host.
//
// The page embeds parsed schematic content, so it is written to demo-out/ (gitignored) and
// must never be committed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { buildSvgPreviewInput } from '../src/editor/previewPayload';
import { buildSvgPreview } from '../src/editor/webview/svgPreview';
import { buildNetlist } from '../src/netlist/builder';
import { parseSchDocBuffer } from '../src/parser/schematic';

type ThemeName = 'light' | 'dark';

// VS Code Light+ / Dark+ palette so the webview looks the same outside the host.
const THEME_VARS: Record<ThemeName, Record<string, string>> = {
  light: {
    'font-family': 'system-ui, "Segoe UI", sans-serif',
    'font-size': '13px',
    'editor-background': '#ffffff',
    'editor-foreground': '#333333',
    foreground: '#3b3b3b',
    descriptionForeground: '#717171',
    'panel-border': '#e5e5e5',
    'sideBar-background': '#f8f8f8',
    'sideBarSectionHeader-background': '#f3f3f3',
    'sideBarSectionHeader-foreground': '#3b3b3b',
    'input-background': '#ffffff',
    'input-foreground': '#333333',
    'input-border': '#cecece',
    'input-placeholderForeground': '#767676',
    focusBorder: '#0090f1',
    'button-background': '#007acc',
    'button-foreground': '#ffffff',
    'button-hoverBackground': '#0062a3',
    'button-border': 'transparent',
    'button-secondaryBackground': '#e5e5e5',
    'button-secondaryForeground': '#3b3b3b',
    'button-secondaryHoverBackground': '#d1d1d1',
    'list-hoverBackground': '#f2f2f2',
    'editor-font-family': 'Consolas, "Courier New", monospace',
    'charts-blue': '#005fb8',
    'charts-yellow': '#b58900',
    'charts-green': '#107c10',
    'charts-orange': '#a15c00',
    'charts-purple': '#7a3e9d',
    'editorWarning-foreground': '#bf8803',
  },
  dark: {
    'font-family': 'system-ui, "Segoe UI", sans-serif',
    'font-size': '13px',
    'editor-background': '#1e1e1e',
    'editor-foreground': '#d4d4d4',
    foreground: '#cccccc',
    descriptionForeground: '#9d9d9d',
    'panel-border': '#3c3c3c',
    'sideBar-background': '#252526',
    'sideBarSectionHeader-background': '#2d2d2d',
    'sideBarSectionHeader-foreground': '#cccccc',
    'input-background': '#3c3c3c',
    'input-foreground': '#cccccc',
    'input-border': '#3c3c3c',
    'input-placeholderForeground': '#a6a6a6',
    focusBorder: '#007fd4',
    'button-background': '#0e639c',
    'button-foreground': '#ffffff',
    'button-hoverBackground': '#1177bb',
    'button-border': 'transparent',
    'button-secondaryBackground': '#3a3d41',
    'button-secondaryForeground': '#cccccc',
    'button-secondaryHoverBackground': '#45494e',
    'list-hoverBackground': '#2a2d2e',
    'editor-font-family': 'Consolas, "Courier New", monospace',
    'charts-blue': '#3794ff',
    'charts-yellow': '#dcdcaa',
    'charts-green': '#89d185',
    'charts-orange': '#ce9178',
    'charts-purple': '#c586c0',
    'editorWarning-foreground': '#cca700',
  },
};

const repoRoot = resolve(__dirname, '..');
const [fileArg, outDirArg, themeArg] = process.argv.slice(2);

const schDoc = resolve(fileArg ?? join(repoRoot, 'test', 'fixtures', 'local-board.SchDoc'));
const outDir = resolve(outDirArg ?? join(repoRoot, 'demo-out'));
const theme: ThemeName = themeArg === 'dark' ? 'dark' : 'light';

if (!existsSync(schDoc)) {
  console.error(`input not found: ${schDoc}`);
  console.error('usage: npm run demo -- [file.SchDoc] [outDir] [light|dark]');
  process.exit(2);
}
const webviewJs = join(repoRoot, 'dist', 'webview.js');
if (!existsSync(webviewJs)) {
  console.error(`missing ${webviewJs} - run "npm run build" first`);
  process.exit(2);
}

const themeVars = Object.entries(THEME_VARS[theme])
  .map(([key, value]) => `    --vscode-${key}: ${value};`)
  .join('\n');

// Same mapping as SchDocEditorProvider.serialize() - kept in sync by hand because the
// provider module imports `vscode` and cannot run outside the extension host.
const model = parseSchDocBuffer(new Uint8Array(readFileSync(schDoc)));
const nets = buildNetlist(model);
const compMap = new Map(model.components.map((c) => [c.recordIndex, c]));

const pins = model.pins.map((pin) => ({
  recordIndex: pin.recordIndex,
  componentRecordIndex: pin.componentRecordIndex,
  designator: compMap.get(pin.componentRecordIndex)?.designator ?? '',
  pinDesignator: pin.pinDesignator,
  name: pin.name,
  electrical: pin.electrical,
}));

const parameters: { component: string; name: string; value: string; hidden: boolean }[] = [];
for (const c of model.components) {
  for (const par of c.parameters) {
    parameters.push({
      component: c.designator || '?',
      name: par.name,
      value: par.value,
      hidden: par.hidden,
    });
  }
}

const payload = {
  fileName: basename(schDoc),
  filePath: schDoc,
  recordCount: model.records.length,
  sheet: { customSize: model.sheet.customSize },
  components: model.components.map((c) => ({
    recordIndex: c.recordIndex,
    designator: c.designator,
    libReference: c.libReference,
    value: c.value,
    footprint: c.footprint,
    description: c.description,
    indexInSheet: c.indexInSheet,
  })),
  pins,
  nets,
  parameters,
  rawRecords: model.records.map((r) => ({
    index: r.index,
    type: r.recordType,
    preview: r.raw.slice(0, 400),
  })),
  previewSvg: buildSvgPreview(buildSvgPreviewInput(model)),
};

// Escape "<" so the JSON literal cannot terminate the inline <script> tag.
const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
const title = basename(schDoc).replace(/[<>&]/g, '');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SchDoc viewer demo (${theme}) - ${title}</title>
<style>
  /* Stand-in for the VS Code theme variables the webview expects. */
  :root {
${themeVars}
    color-scheme: ${theme};
  }
  html, body { height: 100%; }
  body { background: var(--vscode-editor-background); }
</style>
</head>
<body>
<div id="root"></div>
<script>window.__SCHDOC_PAYLOAD__ = ${payloadJson};</script>
<script src="./webview.js"></script>
<script>
  window.postMessage({ type: 'init', payload: window.__SCHDOC_PAYLOAD__ }, '*');
</script>
</body>
</html>
`;

const htmlPath = join(outDir, `index-${theme}.html`);
mkdirSync(outDir, { recursive: true });
writeFileSync(htmlPath, html, 'utf8');
copyFileSync(webviewJs, join(outDir, 'webview.js'));
console.log(
  JSON.stringify({
    theme,
    html: htmlPath,
    records: payload.recordCount,
    components: payload.components.length,
    pins: payload.pins.length,
    nets: nets.length,
    htmlBytes: Buffer.byteLength(html),
  })
);
