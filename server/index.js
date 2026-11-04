const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

// Directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Initial storage load
let reports = [];
if (fs.existsSync(REPORTS_FILE)) {
  try {
    reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
  } catch (e) {
    reports = [];
  }
}

function persistReports() {
  try {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist reports:', err);
  }
}

// Global Chaos Configuration
const chaosConfig = {
  latencyMs: 0,             // Extra delay in ms (e.g. 1500 for 2G simulation)
  dropRate: 0,              // 0-100% chance to abruptly drop connection mid-flight
  failRate: 0,              // 0-100% chance to return 500 Internal Server Error
  blackHole: false,         // Never responds (hangs until client timeout)
  enforce5MbCeiling: true,  // Enforces 5 MB ceiling (returns 413)
  rateLimit: false,         // Returns 429 Too Many Requests
};

// Recent request logs (kept in memory for the web dashboard)
const requestLogs = [];
function logEvent(type, message, details = {}) {
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    time: new Date().toISOString(),
    type,
    message,
    details
  };
  requestLogs.unshift(item);
  if (requestLogs.length > 100) requestLogs.pop();
  console.log(`[${type}] ${message}`, details);
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const reportId = req.params.id || req.body.reportId || 'general';
    const dest = path.join(UPLOADS_DIR, reportId);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const imageId = req.body.imageId || Date.now().toString();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${imageId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // Multer raw limit high so our handler can explicitly test and reject > 5MB with 413
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Chaos Middleware (applied to /api routes)
app.use('/api', (req, res, next) => {
  // Skip chaos for chaos config and health endpoints
  if (req.path.startsWith('/chaos') || req.path === '/health') {
    return next();
  }

  logEvent('REQUEST', `${req.method} ${req.originalUrl}`);

  // 1. Black hole simulation
  if (chaosConfig.blackHole) {
    logEvent('CHAOS', `Request black-holed (will not answer): ${req.originalUrl}`);
    // Intentionally never respond
    return;
  }

  // 2. Abrupt socket drop simulation
  if (chaosConfig.dropRate > 0 && Math.random() * 100 < chaosConfig.dropRate) {
    logEvent('CHAOS', `Socket abruptly destroyed: ${req.originalUrl}`);
    req.socket.destroy();
    return;
  }

  // 3. Rate limit simulation
  if (chaosConfig.rateLimit) {
    logEvent('CHAOS', `Rate limit triggered: 429 Too Many Requests`);
    return res.status(429).json({ error: 'Too Many Requests (Chaos Mode Active)' });
  }

  // 4. Server error simulation
  if (chaosConfig.failRate > 0 && Math.random() * 100 < chaosConfig.failRate) {
    logEvent('CHAOS', `Simulated failure: 500 Internal Server Error`);
    return res.status(500).json({ error: 'Simulated 500 Internal Server Error' });
  }

  // 5. Latency simulation (2G / slow connection)
  if (chaosConfig.latencyMs > 0) {
    setTimeout(next, chaosConfig.latencyMs);
  } else {
    next();
  }
});

// ---------------- API ENDPOINTS ----------------

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    reportsCount: reports.length,
    chaos: chaosConfig
  });
});

// 2. Chaos management
app.get('/api/chaos', (req, res) => {
  res.json(chaosConfig);
});

app.post('/api/chaos', (req, res) => {
  const { latencyMs, dropRate, failRate, blackHole, enforce5MbCeiling, rateLimit } = req.body;
  if (typeof latencyMs === 'number') chaosConfig.latencyMs = Math.max(0, latencyMs);
  if (typeof dropRate === 'number') chaosConfig.dropRate = Math.min(100, Math.max(0, dropRate));
  if (typeof failRate === 'number') chaosConfig.failRate = Math.min(100, Math.max(0, failRate));
  if (typeof blackHole === 'boolean') chaosConfig.blackHole = blackHole;
  if (typeof enforce5MbCeiling === 'boolean') chaosConfig.enforce5MbCeiling = enforce5MbCeiling;
  if (typeof rateLimit === 'boolean') chaosConfig.rateLimit = rateLimit;

  logEvent('CHAOS_UPDATE', 'Chaos config updated', chaosConfig);
  res.json({ success: true, chaos: chaosConfig });
});

// 3. Initialize or Register a Report (Idempotent)
app.post('/api/reports', (req, res) => {
  const { id, description, expectedImagesCount, imageIds, createdAt } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Report id is required' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Non-blank description is required' });
  }

  // Idempotency check: Does report already exist?
  let report = reports.find(r => r.id === id);
  if (report) {
    logEvent('REPORT_EXISTS', `Report ${id} already exists, returning existing record`);
    return res.status(200).json({
      message: 'Report already registered',
      report
    });
  }

  // Create new report record
  report = {
    id,
    description: description.trim(),
    expectedImagesCount: expectedImagesCount || (imageIds ? imageIds.length : 1),
    imageIds: imageIds || [],
    images: [], // received images
    status: 'pending_images',
    createdAt: createdAt || Date.now(),
    receivedAt: Date.now()
  };

  reports.push(report);
  persistReports();

  logEvent('REPORT_INIT', `New report created: ${id}`, { description: report.description, expectedImages: report.expectedImagesCount });
  res.status(201).json({ message: 'Report initialized', report });
});

// 4. Upload an Image for a Report (Per-image incremental upload, strictly idempotent)
app.post('/api/reports/:id/images', upload.single('file'), (req, res) => {
  const reportId = req.params.id;
  const { imageId, index, originalSize, compressedSize } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  // Hard 5 MB Ceiling Enforcement
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB in bytes
  if (chaosConfig.enforce5MbCeiling && req.file.size > MAX_FILE_SIZE) {
    // Delete the rejected file from disk
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    logEvent('CEILING_BREACH', `Rejected image ${imageId} (${(req.file.size / 1024 / 1024).toFixed(2)} MB exceeds 5 MB ceiling)`, { reportId });
    return res.status(413).json({
      error: 'Payload Too Large: Image exceeds 5 MB ceiling limit (server hard rejection)'
    });
  }

  let report = reports.find(r => r.id === reportId);
  if (!report) {
    // If report was not pre-registered, auto-create it
    report = {
      id: reportId,
      description: req.body.description || 'Auto-registered report',
      expectedImagesCount: Number(req.body.expectedImagesCount) || 1,
      imageIds: [],
      images: [],
      status: 'pending_images',
      createdAt: Date.now(),
      receivedAt: Date.now()
    };
    reports.push(report);
  }

  const effectiveImageId = imageId || path.parse(req.file.filename).name;

  // Idempotency check: Has this image already been uploaded for this report?
  const existingImage = report.images.find(img => img.imageId === effectiveImageId);
  if (existingImage) {
    logEvent('IMAGE_DUPLICATE', `Image ${effectiveImageId} already received for report ${reportId}`);
    return res.status(200).json({
      message: 'Image already received (idempotent)',
      image: existingImage,
      reportStatus: report.status
    });
  }

  // Register image
  const imageRecord = {
    imageId: effectiveImageId,
    filename: req.file.filename,
    url: `/uploads/${reportId}/${req.file.filename}`,
    size: req.file.size,
    originalSize: Number(originalSize) || req.file.size,
    compressedSize: Number(compressedSize) || req.file.size,
    index: Number(index) || report.images.length,
    uploadedAt: Date.now()
  };

  report.images.push(imageRecord);

  // Check if report is now complete
  if (report.images.length >= report.expectedImagesCount) {
    report.status = 'delivered';
    report.completedAt = Date.now();
    logEvent('REPORT_COMPLETE', `Report ${reportId} fully delivered with ${report.images.length} images!`);
  } else {
    logEvent('IMAGE_RECEIVED', `Image ${imageRecord.index + 1}/${report.expectedImagesCount} received for report ${reportId}`, { sizeKb: (req.file.size / 1024).toFixed(1) });
  }

  persistReports();
  res.status(200).json({
    message: 'Image uploaded successfully',
    image: imageRecord,
    reportStatus: report.status,
    imagesReceived: report.images.length,
    expectedImagesCount: report.expectedImagesCount
  });
});

// 5. Finalize Report
app.post('/api/reports/:id/finalize', (req, res) => {
  const reportId = req.params.id;
  const report = reports.find(r => r.id === reportId);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  report.status = 'delivered';
  report.completedAt = Date.now();
  persistReports();

  logEvent('REPORT_FINALIZED', `Report ${reportId} explicitly finalized`);
  res.json({ message: 'Report finalized', report });
});

// 6. Review: List all reports on the server (Fetched strictly from server state)
app.get('/api/reports', (req, res) => {
  // Sort newest first
  const sorted = [...reports].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({
    count: sorted.length,
    reports: sorted
  });
});

// 7. Get single report
app.get('/api/reports/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json(report);
});

// 8. Start Over / Server Reset
app.post('/api/reset', (req, res) => {
  logEvent('RESET', 'Deliberate server reset triggered: wiping all reports and uploaded images');
  reports = [];
  persistReports();

  // Clean uploaded files
  if (fs.existsSync(UPLOADS_DIR)) {
    try {
      fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    } catch (e) {
      console.error('Error cleaning uploads dir:', e);
    }
  }

  res.json({
    success: true,
    message: 'Server storage and uploads completely reset to clean state'
  });
});

// 9. Logs endpoint for Dashboard
app.get('/api/logs', (req, res) => {
  res.json(requestLogs);
});

// 10. Web Dashboard (Interactive Failure Simulator & Live Inspector)
app.get(['/', '/dashboard'], (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Field Reports — Server & Chaos Simulator</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #0F172A;
      --card: #1E293B;
      --border: #334155;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --primary: #38BDF8;
      --success: #34D399;
      --danger: #F87171;
      --warning: #FBBF24;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 12px;
    }
    h1 { margin: 0; font-size: 24px; display: flex; align-items: center; gap: 10px; }
    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.2);
      color: var(--primary);
      text-transform: uppercase;
      font-weight: 700;
    }
    .grid { display: grid; grid-template-columns: 380px 1fr; gap: 24px; }
    @media(max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    h2 { margin-top: 0; font-size: 16px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .control-group { margin-bottom: 18px; }
    label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
    .sublabel { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
    input[type="range"] { width: 100%; accent-color: var(--primary); }
    .val-display { float: right; font-family: monospace; color: var(--primary); font-weight: bold; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border-radius: 8px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      font-size: 14px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: var(--primary); color: #0F172A; }
    .btn-danger { background: var(--danger); color: #0F172A; }
    .btn-warning { background: var(--warning); color: #0F172A; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-top: 1px solid var(--border);
    }
    .toggle:first-of-type { border-top: none; }
    .reports-list { display: flex; flex-direction: column; gap: 16px; }
    .report-card {
      background: #0B1120;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      align-items: center;
    }
    .report-title { font-weight: 700; font-size: 16px; }
    .report-meta { font-size: 12px; color: var(--text-muted); font-family: monospace; }
    .thumbs { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .thumb-wrap {
      position: relative;
      width: 90px;
      height: 90px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: #1E293B;
    }
    .thumb-wrap img { width: 100%; height: 100%; object-fit: cover; }
    .thumb-size {
      position: absolute;
      bottom: 2px;
      right: 2px;
      background: rgba(0,0,0,0.75);
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      font-family: monospace;
    }
    .logs-box {
      background: #0B1120;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      height: 240px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 12px;
      margin-top: 16px;
    }
    .log-line { margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 3px; }
    .log-line .tag { font-weight: bold; padding: 1px 4px; border-radius: 3px; }
    .tag-REQUEST { color: var(--primary); }
    .tag-CHAOS { color: var(--danger); font-weight: bold; }
    .tag-REPORT_COMPLETE { color: var(--success); }
    .tag-IMAGE_RECEIVED { color: #A78BFA; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Field Reports Backend <span class="badge">Chaos Simulator</span></h1>
        <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">
          Tested for 2G networks, dropped sockets, 5MB ceilings & unattended recovery
        </div>
      </div>
      <div>
        <button class="btn btn-danger" onclick="resetServer()">Start Over / Reset Server</button>
      </div>
    </header>

    <div class="grid">
      <!-- Chaos Simulator Controls -->
      <div class="panel">
        <h2>Chaos Controls (Make It Fail)</h2>

        <div class="control-group">
          <label>Latency (Network Delay): <span class="val-display" id="disp-latency">0 ms</span></label>
          <div class="sublabel">Simulate slow 2G connection (recommend 1500–2500ms)</div>
          <input type="range" id="slider-latency" min="0" max="6000" step="250" value="0" oninput="updateChaos()">
          <div class="btn-group">
            <button class="btn" style="background:#334155;color:#fff;font-size:11px;padding:4px 8px;" onclick="setLatency(0)">Normal (0ms)</button>
            <button class="btn" style="background:#334155;color:#fff;font-size:11px;padding:4px 8px;" onclick="setLatency(1500)">2G (1.5s)</button>
            <button class="btn" style="background:#334155;color:#fff;font-size:11px;padding:4px 8px;" onclick="setLatency(3500)">Edge (3.5s)</button>
          </div>
        </div>

        <div class="control-group">
          <label>Drop Connection Rate: <span class="val-display" id="disp-drop">0%</span></label>
          <div class="sublabel">Abruptly destroys TCP socket mid-request with no response</div>
          <input type="range" id="slider-drop" min="0" max="100" step="5" value="0" oninput="updateChaos()">
        </div>

        <div class="control-group">
          <label>HTTP 500 Failure Rate: <span class="val-display" id="disp-fail">0%</span></label>
          <div class="sublabel">Returns simulated 500 Internal Server Error</div>
          <input type="range" id="slider-fail" min="0" max="100" step="5" value="0" oninput="updateChaos()">
        </div>

        <div class="toggle">
          <div>
            <div style="font-weight:600;font-size:14px;">Black Hole (Hang Forever)</div>
            <div style="font-size:12px;color:var(--text-muted);">Request never responds; tests client timeout</div>
          </div>
          <input type="checkbox" id="check-blackhole" onchange="updateChaos()" style="transform:scale(1.3);cursor:pointer;">
        </div>

        <div class="toggle">
          <div>
            <div style="font-weight:600;font-size:14px;">Rate Limit (HTTP 429)</div>
            <div style="font-size:12px;color:var(--text-muted);">Too Many Requests error</div>
          </div>
          <input type="checkbox" id="check-ratelimit" onchange="updateChaos()" style="transform:scale(1.3);cursor:pointer;">
        </div>

        <div class="toggle">
          <div>
            <div style="font-weight:600;font-size:14px;">Enforce 5 MB Ceiling</div>
            <div style="font-size:12px;color:var(--text-muted);">Strict HTTP 413 Payload Too Large if > 5 MB</div>
          </div>
          <input type="checkbox" id="check-ceiling" checked onchange="updateChaos()" style="transform:scale(1.3);cursor:pointer;">
        </div>

        <div style="margin-top:20px; border-top:1px solid var(--border); padding-top:16px;">
          <h2 style="margin-bottom:8px;">Live Server Activity Log</h2>
          <div class="logs-box" id="logs-box"></div>
        </div>
      </div>

      <!-- Server Reports Review -->
      <div class="panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2>Server Confirmed Reports (<span id="reports-count">0</span>)</h2>
          <button class="btn btn-primary" style="font-size:12px; padding:6px 12px;" onclick="loadReports()">Refresh Now</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-top:-6px;">
          Fetched directly from server storage — proves reports safely reached the destination.
        </p>

        <div class="reports-list" id="reports-list">
          <div style="color:var(--text-muted); font-size:14px; text-align:center; padding:40px 0;">
            No reports received yet. Compose and submit one from the app!
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function loadChaos() {
      const res = await fetch('/api/chaos');
      const data = await res.json();
      document.getElementById('slider-latency').value = data.latencyMs;
      document.getElementById('disp-latency').innerText = data.latencyMs + ' ms';
      document.getElementById('slider-drop').value = data.dropRate;
      document.getElementById('disp-drop').innerText = data.dropRate + '%';
      document.getElementById('slider-fail').value = data.failRate;
      document.getElementById('disp-fail').innerText = data.failRate + '%';
      document.getElementById('check-blackhole').checked = data.blackHole;
      document.getElementById('check-ratelimit').checked = data.rateLimit;
      document.getElementById('check-ceiling').checked = data.enforce5MbCeiling;
    }

    async function updateChaos() {
      const latencyMs = Number(document.getElementById('slider-latency').value);
      const dropRate = Number(document.getElementById('slider-drop').value);
      const failRate = Number(document.getElementById('slider-fail').value);
      const blackHole = document.getElementById('check-blackhole').checked;
      const rateLimit = document.getElementById('check-ratelimit').checked;
      const enforce5MbCeiling = document.getElementById('check-ceiling').checked;

      document.getElementById('disp-latency').innerText = latencyMs + ' ms';
      document.getElementById('disp-drop').innerText = dropRate + '%';
      document.getElementById('disp-fail').innerText = failRate + '%';

      await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latencyMs, dropRate, failRate, blackHole, rateLimit, enforce5MbCeiling })
      });
    }

    function setLatency(ms) {
      document.getElementById('slider-latency').value = ms;
      updateChaos();
    }

    async function loadReports() {
      try {
        const res = await fetch('/api/reports');
        const data = await res.json();
        document.getElementById('reports-count').innerText = data.count;
        const list = document.getElementById('reports-list');
        if (data.reports.length === 0) {
          list.innerHTML = '<div style="color:var(--text-muted); font-size:14px; text-align:center; padding:40px 0;">No reports received yet. Compose and submit one from the app!</div>';
          return;
        }

        list.innerHTML = data.reports.map(r => {
          const dt = new Date(r.createdAt).toLocaleString();
          const imagesHtml = (r.images || []).map(img => {
            const kb = (img.size / 1024).toFixed(0);
            return '<div class="thumb-wrap"><img src="' + img.url + '" alt="Report photo"><div class="thumb-size">' + kb + ' KB</div></div>';
          }).join('');

          const isDelivered = r.status === 'delivered';
          const badgeColor = isDelivered ? 'var(--success)' : 'var(--warning)';

          return '<div class="report-card">' +
            '<div class="report-header">' +
              '<div class="report-title">' + escapeHtml(r.description) + '</div>' +
              '<span class="badge" style="background:rgba(255,255,255,0.1);color:' + badgeColor + '">' + r.status + '</span>' +
            '</div>' +
            '<div class="report-meta">ID: ' + r.id + ' &bull; ' + dt + ' &bull; ' + (r.images ? r.images.length : 0) + '/' + r.expectedImagesCount + ' images</div>' +
            '<div class="thumbs">' + imagesHtml + '</div>' +
          '</div>';
        }).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function loadLogs() {
      try {
        const res = await fetch('/api/logs');
        const logs = await res.json();
        const box = document.getElementById('logs-box');
        box.innerHTML = logs.map(l => {
          const time = l.time.split('T')[1].split('.')[0];
          return '<div class="log-line"><span style="color:#64748B;">[' + time + ']</span> <span class="tag tag-' + l.type + '">[' + l.type + ']</span> ' + escapeHtml(l.message) + '</div>';
        }).join('');
      } catch (e) {}
    }

    async function resetServer() {
      if (!confirm('Are you sure you want to wipe all server data and uploaded photos?')) return;
      await fetch('/api/reset', { method: 'POST' });
      loadReports();
      loadLogs();
    }

    function escapeHtml(s) {
      return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    loadChaos();
    loadReports();
    loadLogs();
    setInterval(loadReports, 3000);
    setInterval(loadLogs, 2000);
  </script>
</body>
</html>`);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`Field Reports Backend running on http://localhost:${PORT}`);
  console.log(`Chaos Simulator Web Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`====================================================`);
});
