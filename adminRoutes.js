// ══════════════════════════════════════════════════════════════
// ELINGU SUPER ADMIN ROUTES & DASHBOARD
// Centralized Founder Operations, AI Token Telemetry, School Licensing,
// User Account Support & Safety Watchtower
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const adminStore = require('./adminStore');
const authUtils = require('./authUtils');

// ── AUTHENTICATION MIDDLEWARE ───────────────────────────────

function requireAdminAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = req.headers['x-admin-token'];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Super Admin login required.' });
  }

  const payload = authUtils.verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Admin session expired or invalid. Please sign in again.' });
  }

  req.admin = payload;
  next();
}

// ── API ENDPOINTS ───────────────────────────────────────────

// POST /api/admin/login
router.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await adminStore.authenticateAdmin(email, password);
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.json({
      success: true,
      token: result.token,
      admin: result.admin
    });
  } catch (err) {
    console.error('[adminRoutes] Login error:', err.message);
    res.status(500).json({ error: 'Internal server error during admin login.' });
  }
});

// GET /api/admin/me — verify active session
router.get('/api/admin/me', requireAdminAuth, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// GET /api/admin/metrics — Tab 1: Command Center metrics
router.get('/api/admin/metrics', requireAdminAuth, (req, res) => {
  try {
    const metrics = adminStore.getTelemetryMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    console.error('[adminRoutes] Metrics error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve telemetry metrics.' });
  }
});

// GET /api/admin/users — Tab 2: User Directory
router.get('/api/admin/users', requireAdminAuth, (req, res) => {
  try {
    const { role = 'all', search = '', page = 1, limit = 50 } = req.query;
    const data = adminStore.getAllUsers({
      role,
      search,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('[adminRoutes] Users list error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve users directory.' });
  }
});

// POST /api/admin/users/unlock — 1-click account unlock
router.post('/api/admin/users/unlock', requireAdminAuth, (req, res) => {
  try {
    const { role, id } = req.body || {};
    if (!role || !id) return res.status(400).json({ error: 'User role and ID are required.' });

    const result = adminStore.unlockUser({ role, id });
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlock user.' });
  }
});

// POST /api/admin/users/reset-pin — admin reset learner PIN
router.post('/api/admin/users/reset-pin', requireAdminAuth, (req, res) => {
  try {
    const { studentId, newPin } = req.body || {};
    if (!studentId || !newPin) return res.status(400).json({ error: 'Student ID and new PIN are required.' });

    const result = adminStore.resetStudentPin(studentId, newPin);
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset student PIN.' });
  }
});

// POST /api/admin/users/tier — change student tier
router.post('/api/admin/users/tier', requireAdminAuth, (req, res) => {
  try {
    const { studentId, tier } = req.body || {};
    if (!studentId || !tier) return res.status(400).json({ error: 'Student ID and tier are required.' });

    const result = adminStore.updateStudentTier(studentId, tier);
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update student tier.' });
  }
});

// GET /api/admin/schools — Tab 3: Schools & Institutional Hub
router.get('/api/admin/schools', requireAdminAuth, (req, res) => {
  try {
    const schools = adminStore.getAllSchoolsDirectory();
    res.json({ success: true, schools });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load schools directory.' });
  }
});

// POST /api/admin/schools/pilot-status
router.post('/api/admin/schools/pilot-status', requireAdminAuth, (req, res) => {
  try {
    const { schoolId, isPilot, pilotExpiresAt } = req.body || {};
    if (!schoolId) return res.status(400).json({ error: 'School ID required.' });

    const result = adminStore.updateSchoolPilotStatus(schoolId, { isPilot, pilotExpiresAt });
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update school pilot status.' });
  }
});

// GET /api/admin/safety-logs — Tab 4: Safety Watchtower
router.get('/api/admin/safety-logs', requireAdminAuth, (req, res) => {
  try {
    const { filter = 'all', limit = 50 } = req.query;
    const logs = adminStore.getSafetyLogs({ filter, limit: parseInt(limit) || 50 });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load safety logs.' });
  }
});

// POST /api/admin/safety-logs/resolve
router.post('/api/admin/safety-logs/resolve', requireAdminAuth, (req, res) => {
  try {
    const { incidentId } = req.body || {};
    if (!incidentId) return res.status(400).json({ error: 'Incident ID required.' });

    const result = adminStore.resolveSafetyIncident(incidentId, req.admin.email);
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve safety incident.' });
  }
});

// GET /api/admin/subscriptions — Tab 5: Subscription Ledger
router.get('/api/admin/subscriptions', requireAdminAuth, (req, res) => {
  try {
    const ledger = adminStore.getSubscriptionsLedger();
    res.json({ success: true, ledger });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load subscriptions ledger.' });
  }
});

// ── FRONTEND DASHBOARD PAGE ─────────────────────────────────

router.get(['/admin', '/admin/portal', '/admin/login'], (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elingu — Super Admin Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0A0F1D;
      --card-bg: rgba(17, 24, 39, 0.78);
      --card-border: rgba(255, 255, 255, 0.12);
      --accent: #00D4AA;
      --accent-rgb: 0, 212, 170;
      --primary: #0D3A26;
      --text: #F1F5F9;
      --text-muted: #94A3B8;
      --danger: #EF4444;
      --warning: #F59E0B;
      --success: #10B981;
      --header-bg: rgba(11, 15, 28, 0.82);
      --tabs-bg: rgba(15, 23, 42, 0.82);
      --table-header-bg: rgba(15, 23, 42, 0.65);
      --table-row-border: rgba(255, 255, 255, 0.08);
      --table-row-hover: rgba(0, 212, 170, 0.08);
    }

    body.theme-light {
      --bg: #F1F5F9;
      --card-bg: rgba(255, 255, 255, 0.95);
      --card-border: rgba(203, 213, 225, 0.85);
      --accent: #059669;
      --accent-rgb: 5, 150, 105;
      --primary: #10B981;
      --text: #0F172A;
      --text-muted: #64748B;
      --header-bg: rgba(255, 255, 255, 0.92);
      --tabs-bg: rgba(248, 250, 252, 0.95);
      --table-header-bg: #F8FAFC;
      --table-row-border: rgba(226, 232, 240, 0.9);
      --table-row-hover: rgba(16, 185, 129, 0.06);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(circle at 12% 18%, rgba(0, 212, 170, 0.22) 0%, transparent 40%),
        radial-gradient(circle at 88% 12%, rgba(99, 102, 241, 0.26) 0%, transparent 45%),
        radial-gradient(circle at 50% 45%, rgba(14, 165, 233, 0.15) 0%, transparent 55%),
        radial-gradient(circle at 18% 85%, rgba(244, 63, 94, 0.18) 0%, transparent 45%),
        radial-gradient(circle at 82% 80%, rgba(245, 158, 11, 0.18) 0%, transparent 45%),
        radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
      background-size: auto, auto, auto, auto, auto, 28px 28px;
      background-attachment: fixed;
      color: var(--text);
      font-family: 'DM Sans', -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      transition: background 0.3s ease, color 0.3s ease;
    }

    body.theme-light {
      background-image: 
        radial-gradient(circle at 12% 18%, rgba(0, 212, 170, 0.14) 0%, transparent 40%),
        radial-gradient(circle at 88% 12%, rgba(99, 102, 241, 0.16) 0%, transparent 45%),
        radial-gradient(circle at 50% 85%, rgba(245, 158, 11, 0.12) 0%, transparent 50%),
        radial-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px);
      background-size: auto, auto, auto, 28px 28px;
    }

    /* Top Navigation Bar */
    .admin-header {
      background: var(--header-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }
    .brand-logo {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 2px solid var(--accent);
      box-shadow: 0 0 16px rgba(0, 212, 170, 0.35);
    }
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 700;
      background: linear-gradient(90deg, #FFFFFF, #6EE7B7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.3px;
    }
    .admin-badge {
      font-size: 11px;
      background: linear-gradient(135deg, rgba(0, 212, 170, 0.2), rgba(99, 102, 241, 0.2));
      color: var(--accent);
      border: 1px solid rgba(0, 212, 170, 0.45);
      padding: 3px 9px;
      border-radius: 6px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-left: 8px;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .admin-user-pill {
      font-size: 13px;
      color: #E2E8F0;
      background: rgba(255, 255, 255, 0.06);
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-logout {
      background: rgba(239, 68, 68, 0.15);
      color: #F87171;
      border: 1px solid rgba(239, 68, 68, 0.35);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-logout:hover {
      background: #EF4444;
      color: #FFFFFF;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
    }

    /* Tabs Navigation */
    .tabs-bar {
      background: var(--tabs-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 0 28px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 600;
      padding: 14px 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.04);
    }
    .tab-btn.active {
      color: var(--text);
      border-bottom-color: var(--accent);
      background: linear-gradient(180deg, rgba(0, 212, 170, 0.15) 0%, rgba(0, 212, 170, 0.02) 100%);
    }
    .tab-badge {
      background: linear-gradient(135deg, #EF4444, #F43F5E);
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
    }

    /* Main Container */
    .admin-content {
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 26px 28px 60px;
    }
    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
    }

    /* Metric Cards Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 26px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 22px 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .metric-card:hover {
      transform: translateY(-2px);
    }
    .metric-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3.5px;
      background: linear-gradient(90deg, var(--accent), #0D3A26);
    }
    .metric-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .metric-title {
      font-size: 12px;
      font-weight: 700;
      color: #CBD5E1;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .metric-icon-badge {
      font-size: 18px;
      padding: 6px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.08);
      display: inline-flex;
    }
    .metric-val {
      font-family: 'Outfit', sans-serif;
      font-size: 30px;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 4px;
      letter-spacing: -0.5px;
    }
    .metric-sub {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Card Themes */
    .card-students {
      background: linear-gradient(145deg, rgba(16, 185, 129, 0.16) 0%, rgba(6, 78, 59, 0.35) 100%);
      border: 1px solid rgba(52, 211, 153, 0.4);
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.12);
    }
    .card-students::before { background: linear-gradient(90deg, #10B981, #6EE7B7) !important; }
    .card-students .metric-val { color: #6EE7B7; }
    .card-students .metric-sub { color: #A7F3D0; }

    .card-tokens {
      background: linear-gradient(145deg, rgba(99, 102, 241, 0.16) 0%, rgba(49, 46, 129, 0.35) 100%);
      border: 1px solid rgba(129, 140, 248, 0.4);
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.12);
    }
    .card-tokens::before { background: linear-gradient(90deg, #6366F1, #C7D2FE) !important; }
    .card-tokens .metric-val { color: #C7D2FE; }
    .card-tokens .metric-sub { color: #E0E7FF; }

    .card-spend {
      background: linear-gradient(145deg, rgba(245, 158, 11, 0.16) 0%, rgba(120, 53, 15, 0.35) 100%);
      border: 1px solid rgba(251, 191, 36, 0.4);
      box-shadow: 0 4px 20px rgba(245, 158, 11, 0.12);
    }
    .card-spend::before { background: linear-gradient(90deg, #F59E0B, #FDE68A) !important; }
    .card-spend .metric-val { color: #FDE68A; }
    .card-spend .metric-sub { color: #FEF3C7; }

    .card-schools {
      background: linear-gradient(145deg, rgba(6, 182, 212, 0.16) 0%, rgba(22, 78, 99, 0.35) 100%);
      border: 1px solid rgba(34, 211, 238, 0.4);
      box-shadow: 0 4px 20px rgba(6, 182, 212, 0.12);
    }
    .card-schools::before { background: linear-gradient(90deg, #06B6D4, #A5F3FC) !important; }
    .card-schools .metric-val { color: #A5F3FC; }
    .card-schools .metric-sub { color: #CFFAFE; }

    .card-turns {
      background: linear-gradient(145deg, rgba(244, 63, 94, 0.16) 0%, rgba(136, 19, 55, 0.35) 100%);
      border: 1px solid rgba(251, 113, 133, 0.4);
      box-shadow: 0 4px 20px rgba(244, 63, 94, 0.12);
    }
    .card-turns::before { background: linear-gradient(90deg, #F43F5E, #FECDD3) !important; }
    .card-turns .metric-val { color: #FECDD3; }
    .card-turns .metric-sub { color: #FFE4E6; }

    /* Tables */
    .table-card {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      overflow: hidden;
      margin-bottom: 24px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4), 0 0 24px rgba(0, 212, 170, 0.05);
      transition: all 0.3s ease;
    }
    .table-header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 14px;
      background: linear-gradient(90deg, rgba(0, 212, 170, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%);
    }
    .table-title {
      font-family: 'Outfit', sans-serif;
      font-size: 17.5px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .table-search-input {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 9px 14px;
      border-radius: 10px;
      font-size: 13px;
      outline: none;
      min-width: 260px;
      transition: all 0.2s;
    }
    .table-search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 12px rgba(0, 212, 170, 0.25);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13.5px;
    }
    th {
      background: var(--table-header-bg);
      color: var(--text-muted);
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding: 13px 20px;
      font-weight: 700;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 14px 20px;
      border-bottom: 1px solid var(--table-row-border);
      color: var(--text);
    }
    tr:hover td {
      background: var(--table-row-hover);
    }

    /* Light Mode Overrides */
    body.theme-light .admin-badge { background: rgba(5, 150, 105, 0.12); color: #059669; border-color: rgba(5, 150, 105, 0.3); }
    body.theme-light .admin-user-pill { background: #FFFFFF; color: #0F172A; border-color: #E2E8F0; }
    body.theme-light .table-search-input { background: #FFFFFF; border-color: #CBD5E1; color: #0F172A; }
    body.theme-light .card-students { background: linear-gradient(145deg, #ECFDF5 0%, #D1FAE5 100%); border: 1.5px solid #10B981; }
    body.theme-light .card-students .metric-val { color: #047857; }
    body.theme-light .card-students .metric-sub { color: #065F46; }
    body.theme-light .card-tokens { background: linear-gradient(145deg, #EEF2FF 0%, #E0E7FF 100%); border: 1.5px solid #6366F1; }
    body.theme-light .card-tokens .metric-val { color: #4338CA; }
    body.theme-light .card-tokens .metric-sub { color: #3730A3; }
    body.theme-light .card-spend { background: linear-gradient(145deg, #FFFBEB 0%, #FEF3C7 100%); border: 1.5px solid #F59E0B; }
    body.theme-light .card-spend .metric-val { color: #B45309; }
    body.theme-light .card-spend .metric-sub { color: #92400E; }
    body.theme-light .card-schools { background: linear-gradient(145deg, #ECFEFF 0%, #CFFAFE 100%); border: 1.5px solid #06B6D4; }
    body.theme-light .card-schools .metric-val { color: #0E7490; }
    body.theme-light .card-schools .metric-sub { color: #155E75; }
    body.theme-light .card-turns { background: linear-gradient(145deg, #FFF1F2 0%, #FFE4E6 100%); border: 1.5px solid #F43F5E; }
    body.theme-light .card-turns .metric-val { color: #BE123C; }
    body.theme-light .card-turns .metric-sub { color: #9F1239; }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-student { background: rgba(56, 189, 248, 0.18); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.35); }
    .badge-teacher { background: rgba(52, 211, 153, 0.18); color: #34D399; border: 1px solid rgba(52, 211, 153, 0.35); }
    .badge-parent { background: rgba(251, 191, 36, 0.18); color: #FBBF24; border: 1px solid rgba(251, 191, 36, 0.35); }
    .badge-locked { background: rgba(239, 68, 68, 0.22); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.5); }
    .badge-active { background: rgba(16, 185, 129, 0.18); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.35); }
    .badge-pilot { background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(236, 72, 153, 0.22)); color: #F472B6; border: 1px solid rgba(244, 114, 182, 0.4); }
    .badge-gemini { background: rgba(16, 185, 129, 0.2); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-openai { background: rgba(56, 189, 248, 0.2); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.4); }
    .badge-groq { background: rgba(249, 115, 22, 0.2); color: #FB923C; border: 1px solid rgba(249, 115, 22, 0.4); }
    .badge-anthropic { background: rgba(168, 85, 247, 0.2); color: #C084FC; border: 1px solid rgba(168, 85, 247, 0.4); }

    /* Action buttons in table */
    .btn-action {
      background: rgba(0, 212, 170, 0.12);
      color: var(--accent);
      border: 1px solid rgba(0, 212, 170, 0.35);
      padding: 5px 12px;
      border-radius: 7px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      margin-right: 6px;
    }
    .btn-action:hover {
      background: var(--accent);
      color: #07150E;
      box-shadow: 0 0 10px rgba(0, 212, 170, 0.4);
    }
    .btn-action.btn-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #F87171;
      border-color: rgba(239, 68, 68, 0.35);
    }
    .btn-action.btn-danger:hover {
      background: #EF4444;
      color: #FFFFFF;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
    }

    /* Modal Login Overlay */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(3, 10, 6, 0.88);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .login-box {
      background: linear-gradient(165deg, #133322 0%, #0B1C13 100%);
      border: 1.5px solid rgba(0, 212, 170, 0.45);
      border-radius: 24px;
      width: 100%;
      max-width: 440px;
      padding: 38px 32px 30px;
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.8), 0 0 45px rgba(0, 212, 170, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.12);
      position: relative;
      overflow: hidden;
    }
    .login-box::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, #00D4AA, #6366F1, #F59E0B, #F43F5E);
    }
    .login-header {
      text-align: center;
      margin-bottom: 26px;
    }
    .login-title {
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: #FFFFFF;
      margin-top: 12px;
      letter-spacing: -0.3px;
    }
    .login-sub {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .form-group {
      margin-bottom: 18px;
    }
    .form-label {
      display: block;
      font-size: 12.5px;
      font-weight: 600;
      color: #CBD5E1;
      margin-bottom: 6px;
    }
    .form-input {
      width: 100%;
      background: #07150E;
      border: 1px solid var(--card-border);
      color: #FFFFFF;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }
    .form-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 14px rgba(0, 212, 170, 0.25);
    }
    .btn-primary {
      width: 100%;
      background: linear-gradient(135deg, #00D4AA 0%, #10B981 100%);
      color: #07150E;
      border: none;
      padding: 14px;
      border-radius: 10px;
      font-size: 14.5px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 8px;
      box-shadow: 0 4px 18px rgba(0, 212, 170, 0.35);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #25ECC0 0%, #34D399 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 24px rgba(0, 212, 170, 0.5);
    }
    .login-error {
      color: #F87171;
      font-size: 13px;
      text-align: center;
      margin-top: 14px;
      display: none;
      background: rgba(239, 68, 68, 0.1);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    /* Toast notification */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #102419;
      border: 1.5px solid var(--accent);
      color: #FFFFFF;
      padding: 14px 22px;
      border-radius: 12px;
      box-shadow: 0 10px 35px rgba(0,0,0,0.6), 0 0 18px rgba(0, 212, 170, 0.25);
      z-index: 2000;
      font-size: 13.5px;
      font-weight: 600;
      display: none;
    }
  </style>
</head>
<body>

  <!-- ADMIN AUTH MODAL OVERLAY -->
  <div id="loginModal" class="modal-overlay" style="display: flex;">
    <div class="login-box">
      <div class="login-header">
        <div style="position: relative; display: inline-block;">
          <img src="/elingu-avatar.png" alt="Elingu" style="width: 68px; height: 68px; border-radius: 50%; border: 2.5px solid #00D4AA; box-shadow: 0 0 25px rgba(0,212,170,0.4);" />
        </div>
        <h2 class="login-title">Super Admin Portal</h2>
        <p class="login-sub">Founder Command Center & Operations</p>
      </div>
      <form onsubmit="handleAdminLogin(event)">
        <div class="form-group">
          <label class="form-label">Admin Email</label>
          <input type="email" id="loginEmail" class="form-input" value="mutwirijamesbam@gmail.com" placeholder="mutwirijamesbam@gmail.com" required autocomplete="username" />
        </div>
        <div class="form-group">
          <label class="form-label">Master Password</label>
          <div style="position: relative;">
            <input type="password" id="loginPass" class="form-input" placeholder="Enter Master Password" required autocomplete="current-password" style="padding-right: 44px;" />
            <button type="button" id="togglePassBtn" onclick="togglePassVisibility()" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 16px; cursor: pointer; opacity: 0.8;" title="Show/Hide Password">👁️</button>
          </div>
        </div>
        <button type="submit" class="btn-primary" id="loginBtn">Authenticate & Enter →</button>
        <p id="loginError" class="login-error"></p>

        <!-- Colorful Founder Credentials Note -->
        <div style="margin-top: 20px; background: linear-gradient(135deg, rgba(0, 212, 170, 0.08), rgba(99, 102, 241, 0.08)); border: 1px solid rgba(0, 212, 170, 0.35); border-radius: 12px; padding: 12px 14px; font-size: 12px; line-height: 1.6; color: #CBD5E1;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #00D4AA; margin-bottom: 2px;">
            <span>🔑</span> Founder Credentials:
          </div>
          <div>Email: <strong style="color: #FFFFFF;">mutwirijamesbam@gmail.com</strong></div>
          <div>Password: <strong style="color: #FBBF24; letter-spacing: 0.5px;">REDACTED_ADMIN_PASSWORD</strong></div>
        </div>
      </form>
    </div>
  </div>

  <!-- TOAST NOTIFICATION -->
  <div id="adminToast" class="toast"></div>

  <!-- HEADER -->
  <header class="admin-header">
    <a href="/admin" class="brand-left">
      <img src="/elingu-avatar.png" alt="Logo" class="brand-logo" />
      <div>
        <span class="brand-title">Elingu</span>
        <span class="admin-badge">Super Admin</span>
      </div>
    </a>
    <div class="header-right">
      <button type="button" onclick="toggleTheme()" class="theme-toggle-btn" id="themeToggleBtn" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); color: var(--text); padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">☀️ Light Mode</button>
      <div class="admin-user-pill" id="adminUserPill">
        <span>👤</span>
        <span id="adminName">James Mutwiri (Founder)</span>
      </div>
      <a href="/" target="_blank" style="color: var(--accent); font-size: 12.5px; text-decoration: none; font-weight: 700; background: rgba(0,212,170,0.1); padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(0,212,170,0.25);">Open Site ↗</a>
      <button class="btn-logout" onclick="handleLogout()">Sign Out</button>
    </div>
  </header>

  <!-- NAVIGATION TABS -->
  <nav class="tabs-bar">
    <button class="tab-btn active" onclick="switchTab('command-center', this)">📊 Command Center</button>
    <button class="tab-btn" onclick="switchTab('users', this)">👥 User Directory</button>
    <button class="tab-btn" onclick="switchTab('schools', this)">🏫 Schools & Pilot Hub</button>
    <button class="tab-btn" onclick="switchTab('safety', this)">
      🛡️ Safety Watchtower
      <span class="tab-badge" id="safetyBadge" style="display: none;">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('subscriptions', this)">💳 Subscriptions & M-Pesa</button>
  </nav>

  <!-- MAIN TAB CONTENT -->
  <main class="admin-content">

    <!-- ── TAB 1: COMMAND CENTER (METRICS & AI TELEMETRY) ── -->
    <section id="tab-command-center" class="tab-pane active">
      <div class="metrics-grid">
        <div class="metric-card card-students">
          <div class="metric-header-row">
            <span class="metric-title">Active Students Today</span>
            <span class="metric-icon-badge">🎓</span>
          </div>
          <div class="metric-val" id="mActiveToday">0</div>
          <div class="metric-sub" id="mTotalStudents">Total Enrolled: 0</div>
        </div>
        <div class="metric-card card-tokens">
          <div class="metric-header-row">
            <span class="metric-title">Today's Token Burn</span>
            <span class="metric-icon-badge">⚡</span>
          </div>
          <div class="metric-val" id="mTodayTokens">0</div>
          <div class="metric-sub" id="mTodayCalls">0 LLM calls today</div>
        </div>
        <div class="metric-card card-spend">
          <div class="metric-header-row">
            <span class="metric-title">Daily AI Spend</span>
            <span class="metric-icon-badge">💰</span>
          </div>
          <div class="metric-val" id="mDailySpendKes">KES 0.00</div>
          <div class="metric-sub" id="mDailySpendUsd">\$0.0000 USD</div>
        </div>
        <div class="metric-card card-schools">
          <div class="metric-header-row">
            <span class="metric-title">Partner Hub</span>
            <span class="metric-icon-badge">🏫</span>
          </div>
          <div class="metric-val" id="mSchoolsTeachers">0 / 0</div>
          <div class="metric-sub">Schools / Teachers</div>
        </div>
        <div class="metric-card card-turns">
          <div class="metric-header-row">
            <span class="metric-title">Total Socratic Turns</span>
            <span class="metric-icon-badge">💬</span>
          </div>
          <div class="metric-val" id="mTotalTurns">0</div>
          <div class="metric-sub">Conversations All Time</div>
        </div>
      </div>

      <!-- Per-Model AI Consumption & Spend Breakdown -->
      <div class="table-card">
        <div class="table-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 22px;">🤖</span>
            <div>
              <div class="table-title">Model-by-Model AI Spend & Telemetry</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Calculated dynamically per model in $ USD and KES via Safaricom/CBK forex (<span id="forexRateBadge" style="color: #34D399; font-weight: 700;">1 USD = KES 129.50</span>)
              </div>
            </div>
          </div>
          <div>
            <button class="btn-action" onclick="loadMetrics()" style="background: rgba(0,212,170,0.15); color: #00D4AA; border: 1px solid rgba(0,212,170,0.3); font-weight: 600;">
              🔄 Refresh Usage
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Model Name</th>
              <th>Provider</th>
              <th>Calls Today</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
              <th>Total Tokens</th>
              <th>Daily Spend ($ USD)</th>
              <th>Daily Spend (KES)</th>
              <th>Pricing / 1M Tokens</th>
            </tr>
          </thead>
          <tbody id="modelsTableBody">
            <tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Loading per-model telemetry...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Recent 7-Day AI Consumption Table -->
      <div class="table-card">
        <div class="table-header">
          <div class="table-title">7-Day AI Token Consumption & Financial Margins</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>LLM Calls</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
              <th>Total Tokens</th>
              <th>Est. Cost (USD)</th>
              <th>Est. Cost (KES)</th>
            </tr>
          </thead>
          <tbody id="telemetryTableBody">
            <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Loading telemetry data...</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── TAB 2: USER DIRECTORY & ACCOUNT SUPPORT ── -->
    <section id="tab-users" class="tab-pane">
      <div class="table-card">
        <div class="table-header">
          <div class="table-title">Unified User Accounts (Students, Teachers, Parents)</div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <select id="userRoleFilter" onchange="loadUsers()" style="background: #08170F; border: 1px solid var(--card-border); color: #FFF; padding: 8px 12px; border-radius: 8px; font-size: 13px;">
              <option value="all">All Roles</option>
              <option value="student">Students Only</option>
              <option value="teacher">Teachers Only</option>
              <option value="parent">Parents Only</option>
            </select>
            <input type="text" id="userSearchInput" class="table-search-input" placeholder="Search by name, handle, phone..." oninput="debounceUserSearch()" />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Display Name</th>
              <th>Identifier / Contact</th>
              <th>Details / School</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="usersTableBody">
            <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Loading users...</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── TAB 3: SCHOOLS & INSTITUTIONAL HUB ── -->
    <section id="tab-schools" class="tab-pane">
      <div class="table-card">
        <div class="table-header">
          <div class="table-title">Partner Schools & Master Chalkboard Join Codes</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>School Name</th>
              <th>Location</th>
              <th>Admin Code</th>
              <th>Teachers</th>
              <th>Students</th>
              <th>Master Stream Codes</th>
              <th>Pilot Status</th>
            </tr>
          </thead>
          <tbody id="schoolsTableBody">
            <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Loading schools...</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── TAB 4: SAFETY WATCHTOWER (KDPA 2019) ── -->
    <section id="tab-safety" class="tab-pane">
      <div class="table-card">
        <div class="table-header">
          <div class="table-title">Safety Watchtower & Constitutional AI Audit Log</div>
          <div>
            <select id="safetyFilter" onchange="loadSafetyLogs()" style="background: #08170F; border: 1px solid var(--card-border); color: #FFF; padding: 8px 12px; border-radius: 8px; font-size: 13px;">
              <option value="all">All Incidents</option>
              <option value="pending" selected>Pending Review</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Learner Handle</th>
              <th>Category</th>
              <th>Trigger Keyword</th>
              <th>Query Snippet</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="safetyTableBody">
            <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Loading safety watchtower logs...</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── TAB 5: SUBSCRIPTIONS & M-PESA LEDGER ── -->
    <section id="tab-subscriptions" class="tab-pane">
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-title">Active Subscribers</div>
          <div class="metric-val" id="subTotalActive">0</div>
          <div class="metric-sub">Across All Paying Tiers</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">Standard Tiers</div>
          <div class="metric-val" id="subStandard">0</div>
          <div class="metric-sub">KES 300 / mo</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">School Pilot Access</div>
          <div class="metric-val" id="subPilot">0</div>
          <div class="metric-sub">Institutional License</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">Free Learners</div>
          <div class="metric-val" id="subFree">0</div>
          <div class="metric-sub">15 Free Turns / Day</div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <div class="table-title">Recent M-Pesa Daraja STK Push Transactions</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Receipt / ID</th>
              <th>Phone</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="subsTableBody">
            <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No M-Pesa transactions recorded yet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

  </main>

  <script>
    let adminToken = localStorage.getItem('elingu_admin_token') || '';
    let currentAdmin = null;

    // Toggle Password Visibility in Login Modal
    function togglePassVisibility() {
      const p = document.getElementById('loginPass');
      const btn = document.getElementById('togglePassBtn');
      if (!p || !btn) return;
      if (p.type === 'password') {
        p.type = 'text';
        btn.textContent = '🔒';
      } else {
        p.type = 'password';
        btn.textContent = '👁️';
      }
    }

    // Provider Badge Helper
    function getProviderBadge(provider) {
      const p = (provider || 'gemini').toLowerCase();
      if (p === 'gemini') return '<span class="badge badge-gemini">🟢 Google Gemini</span>';
      if (p === 'openai') return '<span class="badge badge-openai">🔵 OpenAI</span>';
      if (p === 'groq') return '<span class="badge badge-groq">🟠 Groq LPU</span>';
      if (p === 'anthropic') return '<span class="badge badge-anthropic">🟣 Claude</span>';
      return '<span class="badge">' + (provider || 'AI') + '</span>';
    }

    // Theme Switcher (Dark Aurora Glow <-> Crisp Studio Light)
    function toggleTheme() {
      const isLight = document.body.classList.toggle('theme-light');
      localStorage.setItem('elingu_admin_theme', isLight ? 'light' : 'dark');
      const btn = document.getElementById('themeToggleBtn');
      if (btn) {
        btn.innerHTML = isLight ? '🌙 Dark Glow' : '☀️ Light Mode';
      }
    }
    // Restore saved theme
    if (localStorage.getItem('elingu_admin_theme') === 'light') {
      document.body.classList.add('theme-light');
      setTimeout(() => {
        const btn = document.getElementById('themeToggleBtn');
        if (btn) btn.innerHTML = '🌙 Dark Glow';
      }, 10);
    }

    // Toast Helper
    function showToast(msg) {
      const t = document.getElementById('adminToast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 3500);
    }

    // Switch Tabs
    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');
      if (btn) btn.classList.add('active');

      if (tabId === 'command-center') loadMetrics();
      if (tabId === 'users') loadUsers();
      if (tabId === 'schools') loadSchools();
      if (tabId === 'safety') loadSafetyLogs();
      if (tabId === 'subscriptions') loadSubscriptions();
    }

    // Check existing auth
    async function checkAuth() {
      if (!adminToken) {
        document.getElementById('loginModal').style.display = 'flex';
        return;
      }
      try {
        const res = await fetch('/api/admin/me', {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        if (res.ok) {
          const data = await res.json();
          currentAdmin = data.admin;
          document.getElementById('adminName').textContent = currentAdmin.name || 'Super Admin';
          document.getElementById('loginModal').style.display = 'none';
          loadMetrics();
        } else {
          localStorage.removeItem('elingu_admin_token');
          document.getElementById('loginModal').style.display = 'flex';
        }
      } catch (err) {
        document.getElementById('loginModal').style.display = 'flex';
      }
    }

    // Handle Login
    async function handleAdminLogin(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPass').value;
      const btn = document.getElementById('loginBtn');
      const errEl = document.getElementById('loginError');

      btn.disabled = true;
      btn.textContent = 'Verifying...';
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          adminToken = data.token;
          localStorage.setItem('elingu_admin_token', adminToken);
          currentAdmin = data.admin;
          document.getElementById('adminName').textContent = currentAdmin.name;
          document.getElementById('loginModal').style.display = 'none';
          showToast('Welcome to Super Admin, ' + currentAdmin.name + '!');
          loadMetrics();
        } else {
          errEl.textContent = data.error || 'Authentication failed.';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = 'Server error. Please verify network.';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Authenticate & Enter →';
      }
    }

    function handleLogout() {
      localStorage.removeItem('elingu_admin_token');
      adminToken = '';
      document.getElementById('loginModal').style.display = 'flex';
    }

    // ── DATA LOADERS ──

    async function loadMetrics() {
      try {
        const res = await fetch('/api/admin/metrics', {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const data = await res.json();
        if (!data.success) return;
        const m = data.metrics;

        document.getElementById('mActiveToday').textContent = m.today.activeStudents;
        document.getElementById('mTotalStudents').textContent = 'Total Enrolled: ' + m.counts.totalStudents;
        document.getElementById('mTodayTokens').textContent = m.today.totalTokens.toLocaleString();
        document.getElementById('mTodayCalls').textContent = m.today.totalCalls + ' LLM calls today';
        document.getElementById('mDailySpendKes').textContent = 'KES ' + m.today.costKes.toFixed(2);
        document.getElementById('mDailySpendUsd').textContent = '$' + m.today.costUsd.toFixed(4) + ' USD';
        document.getElementById('mSchoolsTeachers').textContent = m.counts.totalSchools + ' / ' + m.counts.totalTeachers;
        document.getElementById('mTotalTurns').textContent = m.counts.totalTurnsAllTime.toLocaleString();

        // Safety badge in tabs
        const badge = document.getElementById('safetyBadge');
        if (m.counts.pendingSafetyCount > 0) {
          badge.textContent = m.counts.pendingSafetyCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }

        // Update Forex Rate Badge
        const forexEl = document.getElementById('forexRateBadge');
        if (forexEl && m.today && m.today.forexRate) {
          forexEl.textContent = '1 USD = KES ' + m.today.forexRate.toFixed(2);
        }

        // Render Per-Model Telemetry & Spend Breakdown
        const mbody = document.getElementById('modelsTableBody');
        if (mbody) {
          if (!m.today.models || m.today.models.length === 0) {
            mbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">No models active yet today. Active primary model: <strong>gemini-flash-lite-latest</strong></td></tr>';
          } else {
            mbody.innerHTML = m.today.models.map(md => \`
              <tr>
                <td>
                  <div style="font-weight: 700; color: #FFFFFF; display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--accent);">⚡</span> \${md.displayName || md.model}
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">\${md.model}</div>
                </td>
                <td>\${getProviderBadge(md.provider)}</td>
                <td><strong style="color: #FFFFFF;">\${md.calls || 0}</strong></td>
                <td>\${(md.inputTokens || 0).toLocaleString()}</td>
                <td>\${(md.outputTokens || 0).toLocaleString()}</td>
                <td><strong style="color: #67E8F9;">\${(md.totalTokens || 0).toLocaleString()}</strong></td>
                <td><strong style="color: #FDE68A;">$\${(md.costUsd || 0).toFixed(6)}</strong></td>
                <td><strong style="color: #34D399; font-size: 13.5px;">KES \${(md.costKes || 0).toFixed(2)}</strong></td>
                <td><span style="font-size: 11.5px; color: #94A3B8; font-family: monospace;">\${md.ratesDisplay || 'Standard'}</span></td>
              </tr>
            \`).join('');
          }
        }

        // Render 7-day table
        const tbody = document.getElementById('telemetryTableBody');
        if (!m.recentDays || m.recentDays.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No activity logged yet today.</td></tr>';
        } else {
          tbody.innerHTML = m.recentDays.map(d => \`
            <tr>
              <td><strong>\${d.date}</strong></td>
              <td>\${d.totalCalls || 0}</td>
              <td>\${(d.inputTokens || 0).toLocaleString()}</td>
              <td>\${(d.outputTokens || 0).toLocaleString()}</td>
              <td><strong>\${((d.inputTokens || 0) + (d.outputTokens || 0)).toLocaleString()}</strong></td>
              <td>$\${(d.costUsd || 0).toFixed(4)}</td>
              <td><span style="color:var(--accent); font-weight:700;">KES \${(d.costKes || 0).toFixed(2)}</span></td>
            </tr>
          \`).join('');
        }
      } catch (err) {
        console.error('Error loading metrics:', err);
      }
    }

    let searchTimer = null;
    function debounceUserSearch() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadUsers(), 300);
    }

    async function loadUsers() {
      const role = document.getElementById('userRoleFilter').value;
      const search = document.getElementById('userSearchInput').value;
      try {
        const res = await fetch(\`/api/admin/users?role=\${role}&search=\${encodeURIComponent(search)}\`, {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const data = await res.json();
        const tbody = document.getElementById('usersTableBody');
        if (!data.users || data.users.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No users matching query.</td></tr>';
          return;
        }

        tbody.innerHTML = data.users.map(u => \`
          <tr>
            <td><span class="badge badge-\${u.role}">\${u.role}</span></td>
            <td><strong>\${u.displayName}</strong></td>
            <td>\${u.identifier}</td>
            <td style="color:var(--text-muted); font-size:12.5px;">\${u.subInfo}</td>
            <td><span class="badge badge-pilot">\${u.subscriptionTier}</span></td>
            <td>
              \${u.isLocked ? '<span class="badge badge-locked">LOCKED</span>' : '<span class="badge badge-active">OK</span>'}
            </td>
            <td>
              \${u.isLocked ? \`<button class="btn-action" onclick="unlockUser('\${u.role}', '\${u.id}')">Unlock</button>\` : ''}
              \${u.role === 'student' ? \`<button class="btn-action" onclick="resetPinPrompt('\${u.id}', '\${u.displayName}')">Reset PIN</button>\` : ''}
              \${u.role === 'student' ? \`<button class="btn-action" onclick="changeTierPrompt('\${u.id}')">Set Tier</button>\` : ''}
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Error loading users:', err);
      }
    }

    async function unlockUser(role, id) {
      if (!confirm('Unlock this account immediately?')) return;
      try {
        const res = await fetch('/api/admin/users/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
          body: JSON.stringify({ role, id })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'Account unlocked!');
          loadUsers();
        } else {
          alert(data.error || 'Failed to unlock.');
        }
      } catch (err) {
        alert('Error communicating with server.');
      }
    }

    async function resetPinPrompt(studentId, name) {
      const newPin = prompt('Enter a new 4-digit PIN for ' + name + ':', '2026');
      if (!newPin) return;
      try {
        const res = await fetch('/api/admin/users/reset-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
          body: JSON.stringify({ studentId, newPin })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'PIN reset successfully!');
        } else {
          alert(data.error || 'Failed to reset PIN.');
        }
      } catch (err) {
        alert('Server error.');
      }
    }

    async function changeTierPrompt(studentId) {
      const tier = prompt('Enter new tier (free, standard, premium, school_pilot):', 'school_pilot');
      if (!tier) return;
      try {
        const res = await fetch('/api/admin/users/tier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
          body: JSON.stringify({ studentId, tier })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'Tier updated!');
          loadUsers();
        } else {
          alert(data.error || 'Failed to update tier.');
        }
      } catch (err) {
        alert('Server error.');
      }
    }

    async function loadSchools() {
      try {
        const res = await fetch('/api/admin/schools', {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const data = await res.json();
        const tbody = document.getElementById('schoolsTableBody');
        if (!data.schools || data.schools.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No schools registered yet.</td></tr>';
          return;
        }

        tbody.innerHTML = data.schools.map(s => {
          const codes = Object.entries(s.joinCodes || {}).map(([str, code]) => \`\${str}: <strong style="color:var(--accent);">\${code}</strong>\`).join(' • ') || '—';
          return \`
            <tr>
              <td><strong>\${s.name}</strong></td>
              <td>\${s.county}, \${s.subCounty}</td>
              <td><span style="font-family:monospace; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px;">\${s.adminCode}</span></td>
              <td>\${s.teacherCount}</td>
              <td>\${s.studentCount}</td>
              <td style="font-size:12px;">\${codes}</td>
              <td>
                <span class="badge \${s.isPilot ? 'badge-pilot' : 'badge-active'}">\${s.isPilot ? 'Pilot License' : 'Commercial'}</span>
              </td>
            </tr>
          \`;
        }).join('');
      } catch (err) {
        console.error('Error loading schools:', err);
      }
    }

    async function loadSafetyLogs() {
      const filter = document.getElementById('safetyFilter').value;
      try {
        const res = await fetch(\`/api/admin/safety-logs?filter=\${filter}\`, {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const data = await res.json();
        const tbody = document.getElementById('safetyTableBody');
        if (!data.logs || data.logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">✅ No safety incidents detected. System clean!</td></tr>';
          return;
        }

        tbody.innerHTML = data.logs.map(l => \`
          <tr>
            <td style="font-size:12px; color:var(--text-muted);">\${new Date(l.timestamp).toLocaleString()}</td>
            <td><strong>\${l.handle}</strong></td>
            <td><span class="badge badge-locked">\${l.category}</span></td>
            <td><strong style="color:#F87171;">\${l.matchedWord}</strong></td>
            <td style="font-size:12.5px; color:#CBD5E1; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${l.messageSnippet}</td>
            <td>\${l.resolved ? '<span class="badge badge-active">Resolved</span>' : '<span class="badge badge-locked">Pending</span>'}</td>
            <td>
              \${!l.resolved ? \`<button class="btn-action" onclick="resolveSafetyIncident('\${l.id}')">Mark Resolved</button>\` : '—'}
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Error loading safety logs:', err);
      }
    }

    async function resolveSafetyIncident(incidentId) {
      try {
        const res = await fetch('/api/admin/safety-logs/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
          body: JSON.stringify({ incidentId })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Incident marked as resolved.');
          loadSafetyLogs();
          loadMetrics();
        }
      } catch (err) {
        alert('Server error.');
      }
    }

    async function loadSubscriptions() {
      try {
        const res = await fetch('/api/admin/subscriptions', {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const data = await res.json();
        if (!data.success) return;
        const l = data.ledger;

        document.getElementById('subTotalActive').textContent = l.totalSubscribers;
        document.getElementById('subStandard').textContent = l.tierCounts.standard;
        document.getElementById('subPilot').textContent = l.tierCounts.school_pilot;
        document.getElementById('subFree').textContent = l.tierCounts.free;

        const tbody = document.getElementById('subsTableBody');
        if (!l.transactions || l.transactions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No M-Pesa transactions logged yet.</td></tr>';
        } else {
          tbody.innerHTML = l.transactions.map(t => \`
            <tr>
              <td><strong>\${t.receipt || t.id}</strong></td>
              <td>\${t.phone || '—'}</td>
              <td><strong style="color:var(--accent);">KES \${t.amount || 0}</strong></td>
              <td>\${new Date(t.timestamp || t.date).toLocaleString()}</td>
              <td><span class="badge badge-active">\${t.status || 'Completed'}</span></td>
            </tr>
          \`).join('');
        }
      } catch (err) {
        console.error('Error loading subscriptions:', err);
      }
    }

    // Initialize on page load
    checkAuth();
  </script>
</body>
</html>`);
});

module.exports = router;
