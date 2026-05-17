const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      category TEXT,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database ready');
}

let currentView = 'week'; // shared view state

function serveFile(res, filePath, contentType) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

function jsonResponse(res, data, status) {
  res.writeHead(status || 200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    if (pathname === '/' || pathname === '/display') {
      serveFile(res, path.join(__dirname, 'display.html'), 'text/html');
    } else if (pathname === '/remote') {
      serveFile(res, path.join(__dirname, 'remote.html'), 'text/html');
    } else if (pathname === '/api/view' && req.method === 'GET') {
      jsonResponse(res, { view: currentView });
    } else if (pathname === '/api/view' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.view) currentView = data.view;
          jsonResponse(res, { ok: true });
        } catch(e) {
          jsonResponse(res, { error: 'bad request' }, 400);
        }
      });
    } else if (pathname === '/api/events' && req.method === 'GET') {
      const result = await pool.query('SELECT * FROM events ORDER BY date ASC, time ASC');
      jsonResponse(res, result.rows);
    } else if (pathname === '/api/events' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const ev = JSON.parse(body);
          const id = Date.now().toString();
          await pool.query(
            'INSERT INTO events (id, title, date, time, category, note) VALUES ($1,$2,$3,$4,$5,$6)',
            [id, ev.title, ev.date, ev.time || '', ev.category || 'routine', ev.note || '']
          );
          jsonResponse(res, { id, ...ev });
        } catch (e) {
          jsonResponse(res, { error: e.message }, 400);
        }
      });
    } else if (pathname.startsWith('/api/events/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      await pool.query('DELETE FROM events WHERE id = $1', [id]);
      jsonResponse(res, { ok: true });
    } else if (pathname.startsWith('/api/events/') && req.method === 'POST') {
      const id = pathname.split('/').pop();
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const ev = JSON.parse(body);
          await pool.query(
            'UPDATE events SET title=$1, date=$2, time=$3, category=$4, note=$5 WHERE id=$6',
            [ev.title, ev.date, ev.time || '', ev.category || 'routine', ev.note || '', id]
          );
          jsonResponse(res, { ok: true });
        } catch (e) {
          jsonResponse(res, { error: e.message }, 400);
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (e) {
    console.error(e);
    jsonResponse(res, { error: 'Server error' }, 500);
  }
});

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  server.listen(PORT, () => {
    console.log('Schedule app running on port ' + PORT);
  });
}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});
