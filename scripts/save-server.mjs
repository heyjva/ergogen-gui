#!/usr/bin/env node
/**
 * save-server.mjs
 *
 * A tiny localhost-only HTTP helper that lets the Ergogen GUI read and write a
 * real config.yaml file on disk. This exists because Firefox / Zen (and other
 * non-Chromium browsers) do not implement the writable File System Access API,
 * so the browser page itself cannot write local files. The GUI makes normal
 * fetch() calls to this helper, which performs the privileged file I/O.
 *
 * Security notes:
 *  - Binds to 127.0.0.1 only (never exposed to the network).
 *  - Only ever reads/writes the single configured CONFIG_PATH.
 *  - CORS is limited to the local Vite dev origin(s).
 *
 * Configuration (env vars):
 *  - CONFIG_PATH:  absolute path to the config.yaml to manage.
 *                  Defaults to ../ergogen-keyboard/config.yaml relative to the
 *                  GUI repo (i.e. the sibling keyboard repo).
 *  - SAVE_HELPER_PORT: port to listen on (default 3001).
 *  - ALLOWED_ORIGIN:  allowed CORS origin (default http://localhost:3000).
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG = path.resolve(
  __dirname,
  '..',
  '..',
  'ergogen-keyboard',
  'config.yaml'
);

const CONFIG_PATH = path.resolve(process.env.CONFIG_PATH || DEFAULT_CONFIG);
const PORT = Number(process.env.SAVE_HELPER_PORT || 3001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Guard against absurdly large payloads (config files are tiny).
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  // Always send CORS headers.
  for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: CONFIG_PATH }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/config') {
      const contents = await fs.readFile(CONFIG_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(contents);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/save') {
      const body = await readBody(req);
      await fs.writeFile(CONFIG_PATH, body, 'utf8');
      console.log(
        `[save-server] wrote ${body.length} bytes to ${CONFIG_PATH} at ${new Date().toISOString()}`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: CONFIG_PATH }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  } catch (err) {
    console.error('[save-server] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[save-server] listening on http://127.0.0.1:${PORT}`);
  console.log(`[save-server] managing file: ${CONFIG_PATH}`);
  console.log(`[save-server] allowed origin: ${ALLOWED_ORIGIN}`);
});
