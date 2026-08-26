#!/usr/bin/env node
// 蔵書登録・タグ付け用のローカル専用サーバー（外部公開しないこと）。
// 依存パッケージなし（Node標準機能のみ）。起動: node admin/server.js
// http://127.0.0.1:8787 を開いて使う。

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 8787;
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(REPO_ROOT, 'data', 'books.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function readBooks() {
  if (!fs.existsSync(DATA_PATH)) return [];
  const raw = fs.readFileSync(DATA_PATH, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}

function writeBooks(books) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(books, null, 2) + '\n', 'utf8');
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => {
      chunks += c;
      if (chunks.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(chunks ? JSON.parse(chunks) : {});
      } catch (e) {
        reject(new Error('リクエストの形式が正しくありません'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/admin/index.html' : pathname;
  const full = path.normalize(path.join(REPO_ROOT, rel));
  if (!full.startsWith(REPO_ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function normalizeField(v) {
  if (v === undefined || v === null) return null;
  const s = v.toString().trim();
  return s || null;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: REPO_ROOT }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout + stderr);
    });
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch (e) {
    res.writeHead(400);
    res.end();
    return;
  }
  const pathname = url.pathname;

  try {
    if (pathname === '/api/books' && req.method === 'GET') {
      return sendJson(res, 200, readBooks());
    }

    if (pathname === '/api/books' && req.method === 'POST') {
      const body = await readBody(req);
      const title = normalizeField(body.title);
      if (!title) return sendJson(res, 422, { error: 'タイトルは必須です' });

      const books = readBooks();
      const isbn = normalizeField(body.isbn);
      if (isbn && books.some((b) => b.isbn === isbn)) {
        return sendJson(res, 409, { error: 'このISBNはすでに登録されています' });
      }

      const now = new Date().toISOString();
      const book = {
        id: crypto.randomUUID(),
        isbn,
        title,
        author: normalizeField(body.author),
        year: normalizeField(body.year),
        tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],
        created_at: now,
        updated_at: now,
      };
      books.push(book);
      writeBooks(books);
      return sendJson(res, 201, book);
    }

    const idMatch = pathname.match(/^\/api\/books\/([^/]+)$/);

    if (idMatch && req.method === 'PUT') {
      const id = decodeURIComponent(idMatch[1]);
      const body = await readBody(req);
      const books = readBooks();
      const idx = books.findIndex((b) => b.id === id);
      if (idx === -1) return sendJson(res, 404, { error: '見つかりません' });

      const patch = {};
      ['isbn', 'title', 'author', 'year'].forEach((f) => {
        if (f in body) patch[f] = normalizeField(body[f]);
      });
      if (patch.title === null) {
        return sendJson(res, 422, { error: 'タイトルは必須です' });
      }
      if (Array.isArray(body.tags)) {
        patch.tags = body.tags.filter(Boolean);
      }
      if (patch.isbn && books.some((b, i) => i !== idx && b.isbn === patch.isbn)) {
        return sendJson(res, 409, { error: 'このISBNは他の本ですでに使われています' });
      }

      books[idx] = { ...books[idx], ...patch, updated_at: new Date().toISOString() };
      writeBooks(books);
      return sendJson(res, 200, books[idx]);
    }

    if (idMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(idMatch[1]);
      const books = readBooks();
      const next = books.filter((b) => b.id !== id);
      if (next.length === books.length) return sendJson(res, 404, { error: '見つかりません' });
      writeBooks(next);
      return sendJson(res, 200, { deleted: id });
    }

    if (pathname === '/api/publish' && req.method === 'POST') {
      const message = `蔵書データ更新 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      let log = '';
      try {
        log += await run('git', ['add', path.relative(REPO_ROOT, DATA_PATH)]);
        try {
          log += await run('git', ['commit', '-m', message]);
        } catch (e) {
          if (/nothing to commit/.test(e.stdout || '')) {
            return sendJson(res, 200, {
              ok: true,
              log: log + '\n(変更なし: コミットする内容がありませんでした)',
            });
          }
          throw e;
        }
        log += await run('git', ['push']);
        return sendJson(res, 200, { ok: true, log });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.stderr || e.message, log });
      }
    }

    if (req.method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    sendJson(res, 405, { error: 'サポートされていないメソッドです' });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`蔵書登録ツールを起動しました: http://127.0.0.1:${PORT}`);
  console.log('このサーバーはローカル専用です。外部のネットワークには公開しないでください。');
});
