/**
 * Agenda Vibra - Servidor Local para Intranet da Empresa
 * 100% puro Node.js sem dependências externas (sem necessidade de npm install).
 * Sistema de Persistência Imune a Commits do Git com Múltiplas Camadas de Redundância.
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
const DB_TEMPLATE_FILE = path.join(DATA_DIR, 'database.template.json');
const TRIPS_FILE = path.join(DATA_DIR, 'trips.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const LOG_FILE = path.join(DATA_DIR, 'activity.log');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const ASSETS_DIR = path.join(ROOT, 'assets');

// Garantir diretórios necessários
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Registro em log de auditoria permanente (texto legível e imutável)
function logActivity(action, details) {
  try {
    const now = new Date().toISOString();
    const strDetails = typeof details === 'object' ? JSON.stringify(details) : String(details);
    const line = `[${now}] [${action}] ${strDetails}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    console.error('[LOG ERROR]', err.message);
  }
}

// Mescla listas de viagens com segurança (preserva existentes e atualiza as mais recentes por id)
function mergeTrips(existing, incoming) {
  const map = new Map();
  (existing || []).forEach(t => {
    if (t && t.id) {
      map.set(t.id, { ...t });
    }
  });
  (incoming || []).forEach(t => {
    if (t && t.id) {
      const old = map.get(t.id);
      if (!old) {
        map.set(t.id, { ...t });
      } else {
        const oldTime = new Date(old.updatedAt || old.startDate || 0).getTime();
        const newTime = new Date(t.updatedAt || t.startDate || 0).getTime();
        if (newTime >= oldTime) {
          map.set(t.id, { ...old, ...t });
        }
      }
    }
  });
  return Array.from(map.values());
}

// Mescla listas de relatórios de forma segura (preserva relatórios existentes e atualiza os mais recentes)
function mergeReports(existing, incoming) {
  const map = new Map();
  (existing || []).forEach(r => {
    if (r && (r.tripId || r.id)) {
      const key = r.tripId || r.id;
      map.set(key, { ...r, id: key, tripId: key });
    }
  });
  (incoming || []).forEach(r => {
    if (r && (r.tripId || r.id)) {
      const key = r.tripId || r.id;
      const cleanR = { ...r, id: key, tripId: key };
      const old = map.get(key);
      if (!old) {
        map.set(key, cleanR);
      } else {
        const oldTime = new Date(old.updatedAt || 0).getTime();
        const newTime = new Date(cleanR.updatedAt || 0).getTime();
        if (newTime >= oldTime) {
          map.set(key, { ...old, ...cleanR });
        }
      }
    }
  });
  return Array.from(map.values());
}

// Ler viagens do arquivo dedicado trips.json
function readTripsFromFile() {
  try {
    if (fs.existsSync(TRIPS_FILE)) {
      const raw = fs.readFileSync(TRIPS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.trips)) return parsed.trips;
    }
  } catch (err) {
    console.error('[ERRO] Falha ao ler trips.json:', err.message);
  }
  return null;
}

// Ler viagens do último backup válido
function readLatestBackupTrips() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return null;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('trips-') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(BACKUPS_DIR, f), 'utf8');
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (parsed.trips || null);
        if (Array.isArray(list) && list.length > 0) {
          console.log(`[BACKUP] Viagens restauradas do backup: ${f} (${list.length} viagens)`);
          return list;
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[ERRO] Falha ao verificar backups de viagens:', err.message);
  }
  return null;
}

// Salvar viagens em trips.json e gerar backup rotativo
function saveTripsWithBackup(tripsList) {
  try {
    const cleanList = Array.isArray(tripsList) ? tripsList : [];
    fs.writeFileSync(TRIPS_FILE, JSON.stringify(cleanList, null, 2), 'utf8');

    if (cleanList.length > 0) {
      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUPS_DIR, `trips-${ts}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(cleanList, null, 2), 'utf8');

      try {
        const files = fs.readdirSync(BACKUPS_DIR)
          .filter(f => f.startsWith('trips-') && f.endsWith('.json'))
          .sort();
        while (files.length > 50) {
          const toDelete = files.shift();
          fs.unlinkSync(path.join(BACKUPS_DIR, toDelete));
        }
      } catch (_) {}
    }
    return true;
  } catch (err) {
    console.error('[ERRO] Falha ao gravar backup de viagens:', err.message);
    return false;
  }
}

// Ler relatórios do arquivo dedicado reports.json
function readReportsFromFile() {
  try {
    if (fs.existsSync(REPORTS_FILE)) {
      const raw = fs.readFileSync(REPORTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.reports)) return parsed.reports;
    }
  } catch (err) {
    console.error('[ERRO] Falha ao ler reports.json:', err.message);
  }
  return null;
}

// Ler relatórios do último backup válido
function readLatestBackupReports() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return null;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('reports-') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(BACKUPS_DIR, f), 'utf8');
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (parsed.reports || null);
        if (Array.isArray(list) && list.length > 0) {
          console.log(`[BACKUP] Relatórios restaurados do backup: ${f} (${list.length} relatórios)`);
          return list;
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[ERRO] Falha ao verificar backups de relatórios:', err.message);
  }
  return null;
}

// Salvar relatórios em reports.json e gerar backup rotativo
function saveReportsWithBackup(reportsList) {
  try {
    const cleanList = Array.isArray(reportsList) ? reportsList : [];
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(cleanList, null, 2), 'utf8');

    if (cleanList.length > 0) {
      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUPS_DIR, `reports-${ts}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(cleanList, null, 2), 'utf8');

      try {
        const files = fs.readdirSync(BACKUPS_DIR)
          .filter(f => f.startsWith('reports-') && f.endsWith('.json'))
          .sort();
        while (files.length > 50) {
          const toDelete = files.shift();
          fs.unlinkSync(path.join(BACKUPS_DIR, toDelete));
        }
      } catch (_) {}
    }
    return true;
  } catch (err) {
    console.error('[ERRO] Falha ao gravar backup de relatórios:', err.message);
    return false;
  }
}

// Garantir banco de dados JSON com recuperação automática e multi-camada
function readDB() {
  let db = null;
  // 1. Tentar ler DB_FILE principal
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[ERRO] Falha ao ler database.json:', err.message);
  }

  // 2. Se DB_FILE não existir ou estiver corrompido, tenta template ou inicialização
  if (!db || typeof db !== 'object') {
    try {
      if (fs.existsSync(DB_TEMPLATE_FILE)) {
        const raw = fs.readFileSync(DB_TEMPLATE_FILE, 'utf8');
        db = JSON.parse(raw);
        console.log('[INIT] database.json inicializado a partir de database.template.json');
      }
    } catch (_) {}
  }

  if (!db || typeof db !== 'object') {
    db = { trips: [], reports: [], lastUpdated: new Date().toISOString() };
  }
  if (!Array.isArray(db.trips)) db.trips = [];
  if (!Array.isArray(db.reports)) db.reports = [];

  // 3. Proteção e recuperação de VIAGENS
  const fromTripsFile = readTripsFromFile();
  if (fromTripsFile && fromTripsFile.length > 0) {
    db.trips = mergeTrips(db.trips, fromTripsFile);
  } else if (db.trips.length === 0) {
    const fromBackupTrips = readLatestBackupTrips();
    if (fromBackupTrips && fromBackupTrips.length > 0) {
      db.trips = fromBackupTrips;
      console.log(`[RECUPERAÇÃO] ${db.trips.length} viagens restauradas do backup`);
    }
  }

  // 4. Proteção e recuperação de RELATÓRIOS
  const fromReportsFile = readReportsFromFile();
  if (fromReportsFile && fromReportsFile.length > 0) {
    db.reports = mergeReports(db.reports, fromReportsFile);
  } else if (db.reports.length === 0) {
    const fromBackup = readLatestBackupReports();
    if (fromBackup && fromBackup.length > 0) {
      db.reports = fromBackup;
      console.log(`[RECUPERAÇÃO] ${db.reports.length} relatórios restaurados do backup`);
    }
  }

  // Remove relatórios órfãos se a viagem correspondente não existir
  if (Array.isArray(db.trips) && Array.isArray(db.reports)) {
    const validTripIds = new Set(db.trips.map(t => t.id));
    db.reports = db.reports.filter(r => validTripIds.has(r.tripId || r.id));
  }

  return db;
}

function writeDB(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    if (Array.isArray(data.trips)) {
      saveTripsWithBackup(data.trips);
    }
    if (Array.isArray(data.reports)) {
      saveReportsWithBackup(data.reports);
    }

    // Salvar backup consolidado periódico
    try {
      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUPS_DIR, `database-${ts}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
      const files = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('database-') && f.endsWith('.json'))
        .sort();
      while (files.length > 30) {
        fs.unlinkSync(path.join(BACKUPS_DIR, files.shift()));
      }
    } catch (_) {}

    return true;
  } catch (err) {
    console.error('[ERRO] Falha ao gravar database.json:', err.message);
    return false;
  }
}

// Inicializar e garantir persistência inicial em disco
const initialDB = readDB();
writeDB(initialDB);

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

  // 2a. Salvar viagem individual com segurança e backup imediato
  if (req.method === 'POST' && pathname === '/api/trip') {
    try {
      const trip = await parseBody(req);
      if (!trip || !trip.id || !trip.title) {
        return sendJSON(res, 400, { success: false, error: 'Dados da viagem incompletos (id e título são obrigatórios).' });
      }
      if (!trip.updatedAt) {
        trip.updatedAt = new Date().toISOString();
      }

      const db = readDB();
      db.trips = mergeTrips(db.trips || [], [trip]);
      writeDB(db);

      logActivity('SALVAR_VIAGEM', { id: trip.id, title: trip.title, owner: trip.owner, startDate: trip.startDate, endDate: trip.endDate });
      return sendJSON(res, 200, { success: true, trip, count: db.trips.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 2b. Excluir viagem individualmente
  if (req.method === 'DELETE' && pathname.startsWith('/api/trip/')) {
    try {
      const targetId = decodeURIComponent(pathname.replace('/api/trip/', '')).trim();
      const db = readDB();
      const initialCount = db.trips.length;
      db.trips = (db.trips || []).filter(t => t.id !== targetId);
      // Remove também o relatório vinculado se existir
      db.reports = (db.reports || []).filter(r => r.tripId !== targetId && r.id !== targetId);
      writeDB(db);

      logActivity('EXCLUIR_VIAGEM', { id: targetId, removed: initialCount !== db.trips.length });
      return sendJSON(res, 200, { success: true, count: db.trips.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 2c. Salvar/mesclar lista completa de viagens
  if (req.method === 'POST' && pathname === '/api/trips') {
    try {
      const body = await parseBody(req);
      const incoming = Array.isArray(body) ? body : (body.trips || []);
      const db = readDB();
      db.trips = mergeTrips(db.trips || [], incoming);

      // Ajustar mês dos relatórios se a data da viagem mudou
      const tripMap = new Map(db.trips.map(t => [t.id, t]));
      if (Array.isArray(db.reports)) {
        db.reports = db.reports.map(r => {
          const tid = r.tripId || r.id;
          const t = tripMap.get(tid);
          if (t && t.startDate) {
            r.month = t.startDate.slice(0, 7);
          }
          return r;
        });
      }

      writeDB(db);
      logActivity('SINCRONIZAR_VIAGENS', { total: db.trips.length, incomingCount: incoming.length });
      return sendJSON(res, 200, { success: true, count: db.trips.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 3a. Obter todos os relatórios
  if (req.method === 'GET' && pathname === '/api/reports') {
    const db = readDB();
    return sendJSON(res, 200, { success: true, reports: db.reports || [] });
  }

  // 3b. Salvar relatório individual com backup imediato
  if (req.method === 'POST' && pathname === '/api/report') {
    try {
      const rep = await parseBody(req);
      if (!rep || (!rep.tripId && !rep.id)) {
        return sendJSON(res, 400, { success: false, error: 'tripId obrigatório' });
      }
      const tripId = rep.tripId || rep.id;
      rep.id = tripId;
      rep.tripId = tripId;
      if (!rep.updatedAt) rep.updatedAt = new Date().toISOString();

      const db = readDB();
      const tripMap = new Map((db.trips || []).map(t => [t.id, t]));
      const t = tripMap.get(tripId);
      if (t && t.startDate) {
        rep.month = t.startDate.slice(0, 7);
      } else if (!rep.month) {
        rep.month = rep.updatedAt ? rep.updatedAt.slice(0, 7) : new Date().toISOString().slice(0, 7);
      }

      db.reports = mergeReports(db.reports || [], [rep]);
      writeDB(db);

      logActivity('SALVAR_RELATORIO', { tripId, author: rep.author, month: rep.month, hasPhotos: (rep.photos || []).length, hasAttachments: (rep.attachments || []).length });
      return sendJSON(res, 200, { success: true, report: rep, count: db.reports.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 3c. Excluir relatório individualmente
  if (req.method === 'DELETE' && pathname.startsWith('/api/report/')) {
    try {
      const targetId = decodeURIComponent(pathname.replace('/api/report/', '')).trim();
      const db = readDB();
      db.reports = (db.reports || []).filter(r => r.tripId !== targetId && r.id !== targetId);
      writeDB(db);

      logActivity('EXCLUIR_RELATORIO', { tripId: targetId });
      return sendJSON(res, 200, { success: true, count: db.reports.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 3d. Salvar / mesclar lista de relatórios
  if (req.method === 'POST' && pathname === '/api/reports') {
    try {
      const body = await parseBody(req);
      const rawReports = Array.isArray(body) ? body : (body.reports || []);
      const db = readDB();
      const tripMap = new Map((db.trips || []).map(t => [t.id, t]));
      const cleanIncoming = rawReports
        .filter(r => {
          const tid = r.tripId || r.id;
          return tripMap.has(tid);
        })
        .map(r => {
          const tid = r.tripId || r.id;
          const t = tripMap.get(tid);
          if (t && t.startDate) {
            r.month = t.startDate.slice(0, 7);
          } else if (!r.month) {
            r.month = r.updatedAt ? r.updatedAt.slice(0, 7) : new Date().toISOString().slice(0, 7);
          }
          return { ...r, id: tid, tripId: tid };
        });

      db.reports = mergeReports(db.reports || [], cleanIncoming);
      writeDB(db);

      logActivity('SINCRONIZAR_RELATORIOS', { total: db.reports.length, incomingCount: cleanIncoming.length });
      return sendJSON(res, 200, { success: true, count: db.reports.length });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 4. Sincronização completa (trips + reports com mesclagem inteligente)
  if (req.method === 'POST' && pathname === '/api/sync') {
    try {
      const body = await parseBody(req);
      const db = readDB();
      if (Array.isArray(body.trips) && body.trips.length > 0) {
        db.trips = mergeTrips(db.trips || [], body.trips);
      }
      if (Array.isArray(body.reports) && body.reports.length > 0) {
        const tripMap = new Map((db.trips || []).map(t => [t.id, t]));
        const formatted = body.reports.map(r => {
          const tid = r.tripId || r.id;
          const t = tripMap.get(tid);
          if (t && t.startDate) {
            r.month = t.startDate.slice(0, 7);
          } else if (!r.month) {
            r.month = r.updatedAt ? r.updatedAt.slice(0, 7) : new Date().toISOString().slice(0, 7);
          }
          return { ...r, id: tid, tripId: tid };
        });
        db.reports = mergeReports(db.reports || [], formatted);
      }
      writeDB(db);
      return sendJSON(res, 200, { success: true, db });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 5. Exportar backup consolidado completo para download
  if (req.method === 'GET' && pathname === '/api/backup/export') {
    const db = readDB();
    const exportData = {
      sistema: 'Agenda Vibra',
      versao: '2.0',
      dataExportacao: new Date().toISOString(),
      totalViagens: db.trips.length,
      totalRelatorios: db.reports.length,
      trips: db.trips,
      reports: db.reports
    };
    const filename = `backup-agenda-vibra-${new Date().toISOString().slice(0, 10)}.json`;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    return res.end(JSON.stringify(exportData, null, 2));
  }

  // 6. Restaurar dados a partir de arquivo de backup JSON
  if (req.method === 'POST' && pathname === '/api/backup/import') {
    try {
      const body = await parseBody(req);
      const incomingTrips = Array.isArray(body.trips) ? body.trips : [];
      const incomingReports = Array.isArray(body.reports) ? body.reports : [];

      if (incomingTrips.length === 0 && incomingReports.length === 0) {
        return sendJSON(res, 400, { success: false, error: 'O arquivo de backup não contém viagens ou relatórios válidos.' });
      }

      const db = readDB();
      db.trips = mergeTrips(db.trips || [], incomingTrips);
      db.reports = mergeReports(db.reports || [], incomingReports);
      writeDB(db);

      logActivity('RESTAURAR_BACKUP', {
        viagensImportadas: incomingTrips.length,
        relatoriosImportados: incomingReports.length,
        totalViagens: db.trips.length,
        totalRelatorios: db.reports.length
      });

      return sendJSON(res, 200, {
        success: true,
        message: 'Backup restaurado com sucesso!',
        tripsCount: db.trips.length,
        reportsCount: db.reports.length
      });
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message });
    }
  }

  // 7. Estatísticas de saúde do armazenamento e backups
  if (req.method === 'GET' && pathname === '/api/stats') {
    const db = readDB();
    let backupCount = 0;
    try {
      if (fs.existsSync(BACKUPS_DIR)) {
        backupCount = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json')).length;
      }
    } catch (_) {}

    return sendJSON(res, 200, {
      success: true,
      trips: db.trips.length,
      reports: db.reports.length,
      backups: backupCount,
      lastUpdated: db.lastUpdated
    });
  }

  // 8. Upload de fotos e arquivos anexados organizados por mês
  if (req.method === 'POST' && pathname === '/api/upload') {
    const originalName = reqUrl.searchParams.get('name') || 'arquivo';
    const originalType = reqUrl.searchParams.get('type') || 'application/octet-stream';
    let month = reqUrl.searchParams.get('month'); // formato esperado: YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // Cria a pasta do mês dentro de uploads se não existir
    const monthDir = path.join(UPLOADS_DIR, month);
    if (!fs.existsSync(monthDir)) {
      fs.mkdirSync(monthDir, { recursive: true });
    }

    const ext = path.extname(originalName) || '';
    const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const safeName = fileId + ext;
    const destPath = path.join(monthDir, safeName);

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
          month: month,
          url: `/uploads/${month}/${safeName}`
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

  // 9. Excluir anexo (suporta busca no mês ou raiz de uploads)
  if (req.method === 'DELETE' && pathname.startsWith('/api/upload/')) {
    const rawTarget = decodeURIComponent(pathname.replace('/api/upload/', '')).replace(/^[/\\]+/, '');
    const directPath = path.normalize(path.join(UPLOADS_DIR, rawTarget));
    if (directPath.startsWith(UPLOADS_DIR) && fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      try { fs.unlinkSync(directPath); } catch (_) {}
      return sendJSON(res, 200, { success: true });
    }

    const baseTarget = path.basename(rawTarget);
    const findAndDelete = (dir) => {
      if (!fs.existsSync(dir)) return false;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (findAndDelete(full)) return true;
        } else if (entry.isFile()) {
          if (entry.name === baseTarget || entry.name.startsWith(baseTarget + '.')) {
            try { fs.unlinkSync(full); } catch (_) {}
            return true;
          }
        }
      }
      return false;
    };

    findAndDelete(UPLOADS_DIR);
    return sendJSON(res, 200, { success: true });
  }

  // ===================== ARQUIVOS ESTÁTICOS =====================
  // Pasta de uploads (suporta subpastas de mês ex: /uploads/2026-11/foto.png e raiz)
  if (pathname.startsWith('/uploads/')) {
    const relPath = pathname.replace('/uploads/', '');
    const cleanPath = path.normalize(path.join(UPLOADS_DIR, relPath));
    if (!cleanPath.startsWith(UPLOADS_DIR)) {
      res.writeHead(403);
      return res.end('Acesso proibido');
    }
    const downloadName = reqUrl.searchParams.get('filename');
    if (fs.existsSync(cleanPath) && fs.statSync(cleanPath).isFile()) {
      return serveStatic(req, res, cleanPath, downloadName);
    }
    const fallbackPath = path.join(UPLOADS_DIR, path.basename(relPath));
    return serveStatic(req, res, fallbackPath, downloadName);
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
  console.log('\n [3] Armazenamento com Redundância Ativa (Imune a Commits):');
  console.log(`     - Base principal: ${DB_FILE}`);
  console.log(`     - Viagens dedicadas: ${TRIPS_FILE}`);
  console.log(`     - Relatórios dedicados: ${REPORTS_FILE}`);
  console.log(`     - Backups automáticos: ${BACKUPS_DIR}`);
  console.log(`     - Histórico de auditoria: ${LOG_FILE}`);
  console.log(`     - Fotos e anexos: ${UPLOADS_DIR}`);
  console.log('===============================================================');
  console.log(' Mantenha esta janela aberta para o servidor continuar rodando.');
  console.log(' Pressione Ctrl + C para encerrar.\n');
});
