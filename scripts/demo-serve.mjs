// Dev-only static server for demo-out/ that also implements the Direct Export endpoint.
// A page opened from file:// cannot write into the project, so `npm run demo:serve` serves
// the demo over http and accepts the same file set the extension host would write itself:
// POST /__direct_export { folder, files: [{ name, content }] } -> <project root>/<folder>/
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const demoRoot = resolve(process.argv[2] ?? 'demo-out');
// Exports land in the project root, exactly like the extension's Direct Export button.
const projectRoot = resolve(process.argv[3] ?? '.');
const port = Number(process.env.PORT ?? 4173);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** Reject separators, traversal and reserved characters: these become file names on disk. */
function isSafeName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 200 &&
    !/[\\/:*?"<>|\u0000-\u001f]/.test(name) &&
    !name.includes('..') &&
    !name.startsWith('.')
  );
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        rejectBody(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });
}

async function handleDirectExport(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    sendJson(res, 400, { error: `bad request: ${err.message}` });
    return;
  }
  const { folder, files } = payload ?? {};
  if (
    !isSafeName(folder) ||
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every((f) => isSafeName(f?.name) && typeof f?.content === 'string')
  ) {
    sendJson(res, 400, { error: 'folder/files missing or contain unsafe names' });
    return;
  }

  const dir = join(projectRoot, folder);
  await mkdir(dir, { recursive: true }); // Creates the folder when missing.
  const written = [];
  for (const file of files) {
    const target = join(dir, file.name);
    await writeFile(target, file.content, 'utf8');
    written.push(target);
  }
  console.log(`[demo-serve] direct export -> ${dir} (${written.length} files)`);
  sendJson(res, 200, { dir, files: written });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rel = url.pathname === '/' ? '/index-light.html' : decodeURIComponent(url.pathname);
  const file = resolve(join(demoRoot, rel));
  if (file !== demoRoot && !file.startsWith(demoRoot + sep)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

const server = createServer((req, res) => {
  const run =
    req.method === 'POST' && req.url === '/__direct_export'
      ? handleDirectExport(req, res)
      : serveStatic(req, res);
  run.catch((err) => {
    console.error('[demo-serve]', err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
    else res.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[demo-serve] demo      : http://127.0.0.1:${port}/`);
  console.log(`[demo-serve] exports to: ${projectRoot}`);
});
