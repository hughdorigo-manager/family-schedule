const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DATA_FILE = path.join(__dirname, 'events.json');

function loadEvents() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveEvents(events) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2));
}

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

const server = http.createServer((req, res) => {
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

  if (pathname === '/' || pathname === '/display') {
    serveFile(res, path.join(__dirname, 'display.html'), 'text/html');
  } else if (pathname === '/remote') {
    serveFile(res, path.join(__dirname, 'remote.html'), 'text/html');
  } else if (pathname === '/api/events' && req.method === 'GET') {
    const events = loadEvents();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(events));
  } else if (pathname === '/api/events' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        event.id = Date.now().toString();
        const events = loadEvents();
        events.push(event);
        saveEvents(events);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(event));
      } catch (e) {
        res.writeHead(400);
        res.end('Bad request');
      }
    });
  } else if (pathname.startsWith('/api/events/') && req.method === 'DELETE') {
    const id = pathname.split('/').pop();
    let events = loadEvents();
    events = events.filter(e => e.id !== id);
    saveEvents(events);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } else if (pathname.startsWith('/api/events/') && req.method === 'POST') {
    const id = pathname.split('/').pop();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updated = JSON.parse(body);
        let events = loadEvents();
        events = events.map(e => e.id === id ? { ...e, ...updated, id } : e);
        saveEvents(events);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end('Bad request');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Schedule app running on port ${PORT}`);
  console.log(`Display: http://localhost:${PORT}/display`);
  console.log(`Remote:  http://localhost:${PORT}/remote`);
});
