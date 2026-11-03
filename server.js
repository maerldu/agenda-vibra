/**
 * Agenda Vibra - Servidor Local para Intranet da Empresa
 * 100% puro Node.js sem dependências externas (sem necessidade de npm install).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const ASSETS_DIR = path.join(ROOT, 'assets');

// Garantir diretórios necessários
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Garantir banco de dados JSON
function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[ERRO] Falha ao ler database.json:', err.message);
  }
  const initial = { trips: [], reports: [], lastUpdated: new Date().toISOString() };
  fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
  return initial;
}

function writeDB(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[ERRO] Falha ao gravar database.json:', err.message);
    return false;
  }
}

// Inicializar DB se necessário
readDB();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB max body limit for JSON
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, filePath, downloadName = null) {
  // Prevenir Directory Traversal
  const safePath = path.normalize(filePath);
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Acesso proibido');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado');
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    };

    if (downloadName) {
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
    } else {
      headers['Content-Disposition'] = 'inline';
    }

    res.writeHead(200, headers);

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // ===================== API ENDPOINTS =====================
  // 0. Informações de rede e links de acesso da equipe
  if (req.method === 'GET' && pathname === '/api/info') {
    const hostname = os.hostname();
    const ips = getNetworkAddresses();
    return sendJSON(res, 200, {
      hostname,
      port: PORT,
      ips,
      links: {
        byHostname: `http://${hostname}:${PORT}`,
        byIp: ips.length > 0 ? `http://${ips[0].ip}:${PORT}` : `http://localhost:${PORT}`
      }
    });
  }

  // 1. Obter todos os dados (viagens e relatórios)
  if (req.method === 'GET' && pathname === '/api/data') {
    const db = readDB();
    return sendJSON(res, 200, db);
  }

  // 2. Salvar viagens
  if (req.method === 'POST' && pathname === '/api/trips') {
    try {
      const body = await parseBody(req);
      const trips = Array.isArray(body) ? body : (body.trips || []);
      const db = readDB();
      db.trips = trips;
      writeDB(db);
      return sendJSON(res, 200, { success: true, count: trips.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 3. Salvar relatórios
  if (req.method === 'POST' && pathname === '/api/reports') {
    try {
      const body = await parseBody(req);
      const reports = Array.isArray(body) ? body : (body.reports || []);
      const db = readDB();
      db.reports = reports;
      writeDB(db);
      return sendJSON(res, 200, { success: true, count: reports.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 4. Sincronização completa (trips + reports)
  if (req.method === 'POST' && pathname === '/api/sync') {
    try {
      const body = await parseBody(req);
      const db = readDB();
      if (Array.isArray(body.trips)) db.trips = body.trips;
      if (Array.isArray(body.reports)) db.reports = body.reports;
      writeDB(db);
      return sendJSON(res, 200, { success: true, db });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 5. Upload de fotos e arquivos anexados
  if (req.method === 'POST' && pathname === '/api/upload') {
    const originalName = reqUrl.searchParams.get('name') || 'arquivo';
    const originalType = reqUrl.searchParams.get('type') || 'application/octet-stream';
    const ext = path.extname(originalName) || '';
    const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const safeName = fileId + ext;
    const destPath = path.join(UPLOADS_DIR, safeName);

    const fileStream = fs.createWriteStream(destPath);
    req.pipe(fileStream);

    fileStream.on('finish', () => {
      try {
        const stats = fs.statSync(destPath);
        return sendJSON(res, 200, {
          id: fileId,
          name: originalName,
          type: originalType,
          size: stats.size,
          url: '/uploads/' + safeName
        });
      } catch (err) {
        return sendJSON(res, 500, { success: false, error: err.message });
      }
    });

    fileStream.on('error', err => {
      return sendJSON(res, 500, { success: false, error: err.message });
    });
    return;
  }

  // 6. Excluir anexo
  if (req.method === 'DELETE' && pathname.startsWith('/api/upload/')) {
    const fname = path.basename(pathname.replace('/api/upload/', ''));
    const target = path.join(UPLOADS_DIR, fname);
    if (fs.existsSync(target)) {
      try { fs.unlinkSync(target); } catch (_) {}
    }
    return sendJSON(res, 200, { success: true });
  }

  // ===================== ARQUIVOS ESTÁTICOS =====================
  // Pasta de uploads
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname.replace('/uploads/', ''));
    const downloadName = reqUrl.searchParams.get('filename');
    return serveStatic(req, res, path.join(UPLOADS_DIR, filename), downloadName);
  }

  // Pasta de assets
  if (pathname.startsWith('/assets/')) {
    const sub = pathname.replace('/assets/', '');
    return serveStatic(req, res, path.join(ASSETS_DIR, sub));
  }

  // Página principal
  if (pathname === '/' || pathname === '/index.html') {
    return serveStatic(req, res, path.join(ROOT, 'index.html'));
  }

  // Outros arquivos na raiz
  const directPath = path.join(ROOT, pathname);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return serveStatic(req, res, directPath);
  }

  // Rota padrão -> index.html
  return serveStatic(req, res, path.join(ROOT, 'index.html'));
});

// Encontrar endereços IP da máquina
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ iface: name, ip: net.address });
      }
    }
  }
  return addresses;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n[AVISO] A porta ${PORT} já está em uso!`);
    console.log('O servidor Agenda Vibra já está rodando em segundo plano.');
    console.log(`Acesse normalmente pelo navegador: http://localhost:${PORT}\n`);
    process.exit(0);
  } else {
    console.error('\n[ERRO no servidor]:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const hostname = os.hostname();
  const ips = getNetworkAddresses();

  console.log('\n===============================================================');
  console.log('   AGENDA VIBRA - SERVIDOR LOCAL ATIVO COM SUCESSO!   ');
  console.log('===============================================================');
  console.log(' [1] Para acessar neste computador:');
  console.log(`     -> http://localhost:${PORT}`);
  console.log('\n [2] Para toda a equipe acessar na rede Vibra:');
  ips.forEach(i => {
    console.log(`     -> http://${i.ip}:${PORT}  (${i.iface})`);
  });
  console.log(`     -> http://${hostname}:${PORT}  (Nome do Computador)`);
  console.log('\n [3] Armazenamento centralizado:');
  console.log(`     - Dados (viagens/relatórios): ${DB_FILE}`);
  console.log(`     - Fotos e anexos de relatórios: ${UPLOADS_DIR}`);
  console.log('===============================================================');
  console.log(' Mantenha esta janela aberta para o servidor continuar rodando.');
  console.log(' Pressione Ctrl + C para encerrar.\n');
});
