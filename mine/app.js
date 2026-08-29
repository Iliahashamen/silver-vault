// ═══════════════════════════════════════════
// THE MINE - App v3 (physical gold)
// ═══════════════════════════════════════════

let tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// Block long-press context menu on all images and buttons
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart',   e => e.preventDefault());

const SESSION_KEY    = 'mine_session';
const SESSION_DURATION = 3 * 60 * 60 * 1000;
const PNL_KEY        = 'vault_pnl_entries_v1';
const DARK_MODE_KEY  = 'vault_dark_mode';
const DEFAULT_FX     = 3.65;

let goldPrice     = 2300;
let currentFx     = 3.65;        // today's USD→ILS rate, fetched on startup
let pnlRows       = [];
const chartCache  = {};          // { frame: [{open,close,high,low,ts}, …] }
let activeFrame   = '1d';
let activeChartType = 'candles'; // 'candles' | 'line'
let lineChart     = null;
let dashboardInited = false;

// User id: prefer Telegram identity; otherwise a stable per-browser id (persisted),
// so standalone web-app users keep one continuous groupBOT session across reloads.
function _stableWebUid() {
    try {
        let id = localStorage.getItem('vault_web_uid');
        if (!id) {
            id = String(Math.floor(Math.random() * 1_000_000_000));
            localStorage.setItem('vault_web_uid', id);
        }
        return Number(id);
    } catch {
        return Math.floor(Math.random() * 1_000_000);
    }
}
const uid = tg?.initDataUnsafe?.user?.id || _stableWebUid();

// Local-only preview token. On localhost any passcode grants a preview session
// so the app can be viewed offline without the backend. This NEVER works on the
// live site (isLocalDevHost is false there) - no secret is exposed in public code.
const DEV_PREVIEW_TOKEN = 'local-dev-preview-token';

function isLocalDevHost() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
}

// ── SESSION ─────────────────────────────────────────────────────────
function sessionToken() {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (s?.loggedIn && (Date.now() - s.timestamp <= SESSION_DURATION)) return s.token || null;
    } catch {}
    // Accept hub-level grouptech_session so mine can be entered directly from hub
    try {
        const hub = JSON.parse(localStorage.getItem('grouptech_session'));
        if (hub?.token && Date.now() < hub.expires) {
            saveSession(hub.token); // promote to mine session
            return hub.token;
        }
    } catch {}
    return null;
}

function saveSession(token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        loggedIn: true, timestamp: Date.now(), token
    }));
}


// ── BROWSER HISTORY (system/back button stays inside the app) ────────
const APP_NAV_ID = 'mine';

function _screenUrl(screenId) {
    return `${location.pathname}${location.search}#${screenId}`;
}

function _pushScreenHistory(screenId, replace) {
    const state = { app: APP_NAV_ID, screen: screenId };
    const url = _screenUrl(screenId);
    try {
        if (replace) history.replaceState(state, '', url);
        else history.pushState(state, '', url);
    } catch (e) {}
}

function _applyScreenFromHistory(screenId) {
    goToScreen(screenId, { skipHistory: true });
    // Close homework sub-views when leaving that screen via system back
    if (screenId !== 'homework-screen') {
        try { quizReset(); } catch (e) {}
    }
}

window.addEventListener('popstate', (e) => {
    const st = e.state;
    const screen = (st && st.app === APP_NAV_ID && st.screen) ? st.screen : 'dashboard-screen';
    _applyScreenFromHistory(screen);
});

// ── SCREEN NAVIGATION ────────────────────────────────────────────────
function goToScreen(screenId, opts = {}) {
    // Hub is the only login - never show the old passcode screen
    if (screenId === 'login-screen') {
        location.replace('../hub.html');
        return;
    }
    const current = document.querySelector('.screen.active');
    const target = document.getElementById(screenId);
    if (!target || (current && current.id === screenId)) return;

    function activateTarget() {
        target.classList.add('active');
        window.scrollTo(0, 0);
        if (screenId === 'charts-screen') {
            Object.keys(chartCache).forEach(k => delete chartCache[k]);
            if (lineChart) { lineChart.destroy(); lineChart = null; }
            requestAnimationFrame(() => renderActiveChart());
        }
    }

    if (current && current !== target) {
        current.classList.add('screen-leaving');
        setTimeout(() => {
            current.classList.remove('active', 'screen-leaving');
            activateTarget();
        }, 200);
    } else {
        activateTarget();
    }

    if (screenId === 'updates-screen') loadNews();

    if (!opts.skipHistory) {
        _pushScreenHistory(screenId, !!opts.replace);
    }
}

function goBack() {
    // System/in-app back: pop browser history so OS/browser back matches UI back
    if (history.state && history.state.app === APP_NAV_ID) {
        history.back();
        return;
    }
    goToScreen('dashboard-screen', { replace: true });
}

function openDailyLineChart() {
    activeChartType = 'line';
    activeFrame = '1d';

    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.chartType === 'line');
    });
    document.querySelectorAll('.chart-time-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.timeframe === '1d');
    });

    const candlesEl = document.getElementById('candles-container');
    const lineEl    = document.getElementById('line-container');
    if (candlesEl) candlesEl.style.display = 'none';
    if (lineEl)    lineEl.style.display    = '';
    if (lineChart) { lineChart.destroy(); lineChart = null; }

    goToScreen('charts-screen');
}

// ── DARK MODE ────────────────────────────────────────────────────────
function applyDarkMode(dark) {
    document.body.classList.toggle('dark-mode', dark);
    // Restart opacity flash via rAF - avoids synchronous forced reflow
    document.body.classList.remove('dark-mode-animating');
    requestAnimationFrame(() => document.body.classList.add('dark-mode-animating'));
    const label = document.getElementById('dark-mode-label');
    if (label) label.textContent = dark ? 'מצב בהיר/כהה - כהה' : 'מצב בהיר/כהה - בהיר';
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', dark ? '#0E0A04' : '#B89868');
}

function toggleDarkMode() {
    const dark = !document.body.classList.contains('dark-mode');
    localStorage.setItem(DARK_MODE_KEY, dark ? '1' : '0');
    // setTimeout(0) yields to the macro-task queue - click event fully
    // completes and the browser can process any pending paint before the
    // CSS variable cascade fires, keeping the UI responsive.
    setTimeout(() => {
        applyDarkMode(dark);
        if (document.getElementById('charts-screen')?.classList.contains('active')) {
            requestAnimationFrame(() => renderActiveChart());
        }
    }, 0);
}

// ── LOGIN ────────────────────────────────────────────────────────────
async function handleLogin() {
    location.replace('../hub.html');
}

async function validateTokenWithServer(token) {
    if (isLocalDevHost() && token === DEV_PREVIEW_TOKEN) return true;
    try {
        const res = await fetch(`${CONFIG.CHAT_API_URL}/api/auth-check`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return res.status !== 401;
    } catch {
        return true; // network error - don't kick user out
    }
}

async function showDashboard() {
    const token = sessionToken();
    if (token) {
        const valid = await validateTokenWithServer(token);
        if (!valid) {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem('grouptech_session');
            location.replace('../hub.html');
            return;
        }
    }
    goToScreen('dashboard-screen', { replace: true });
    const footer = document.querySelector('.footer');
    if (footer) footer.style.display = 'none';
    document.getElementById('mr-d-fab').style.display = '';
    initDashboard();
}

// ── FORMATTING ───────────────────────────────────────────────────────
function formatIls(v) {
    return `₪${Number(v || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

// ── GOLD PRICE + CURRENT FX ────────────────────────────────────────
async function updateGoldPrice() {
    let priceOk = false;
    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/gold-price`);
        const data = await res.json();
        if (!data.success) throw new Error();
        goldPrice = Number(data.xau_usd);
        document.getElementById('price-value').textContent  = `$${goldPrice.toFixed(2)}`;
        document.getElementById('price-update').textContent =
            `עודכן לפני ${Math.floor((data.cache_age_seconds || 0) / 60)} דקות`;
        priceOk = true;
    } catch {
        if (!priceOk) {
            document.getElementById('price-value').textContent  = '$-';
            document.getElementById('price-update').textContent = 'אין חיבור';
        }
    }
    // Always refresh FX rate regardless of price API success
    await refreshCurrentFx();
    renderPnl();
    Object.keys(chartCache).forEach(k => delete chartCache[k]);
    if (document.getElementById('charts-screen')?.classList.contains('active')) {
        requestAnimationFrame(() => renderActiveChart());
    }
}

async function refreshCurrentFx() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const rate  = await fetchFxRate(today);
        if (rate && rate > 0) currentFx = rate;
    } catch { /* keep DEFAULT_FX */ }
}

// ── EXCHANGE RATE AUTO-FETCH ─────────────────────────────────────────
// Uses the free Frankfurter API - no API key required
async function fetchFxRate(date) {
    try {
        const res = await fetch(`https://api.frankfurter.app/${date}?from=USD&to=ILS`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const rate = data.rates?.ILS;
        if (rate && rate > 0) return Number(rate);
    } catch {}
    return DEFAULT_FX;
}

// ── P&L ──────────────────────────────────────────────────────────────
function loadPnl() {
    try {
        pnlRows = JSON.parse(localStorage.getItem(PNL_KEY)) || [];
        if (!Array.isArray(pnlRows)) pnlRows = [];
    } catch { pnlRows = []; }
}

function savePnl() {
    localStorage.setItem(PNL_KEY, JSON.stringify(pnlRows));
}

function calcRow(r) {
    const histFx = Number(r.fx  || DEFAULT_FX); // FX rate at purchase (for oz calculation)
    const cost   = Number(r.cost || 0);
    const buy    = Number(r.buy  || 0);
    const oz     = buy > 0 ? cost / (buy * histFx) : 0;
    // Net spot value = ounces × today's spot × today's FX rate (no premium)
    const now    = oz * goldPrice * currentFx;
    return { ...r, histFx, cost, buy, oz, now, pnl: now - cost };
}

function renderPnl() {
    // Show live FX rate used for spot valuation
    const fxInfo = document.getElementById('fx-live-info');
    if (fxInfo) {
        fxInfo.textContent = `שווי ספוט מחושב לפי: זהב $${goldPrice.toFixed(2)}/oz × שער ₪${currentFx.toFixed(4)}/$`;
    }

    const body = document.getElementById('pnl-table-body');
    if (!body) return;
    if (!pnlRows.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty-row">אין עסקאות עדיין</td></tr>';
    } else {
        body.innerHTML = pnlRows.map(calcRow).map(r => `
            <tr>
                <td>${escapeHtml(r.date)}</td>
                <td>${escapeHtml(r.note || 'עסקה')}</td>
                <td>${formatIls(r.cost)}</td>
                <td>$${Number(r.buy).toFixed(2)}</td>
                <td>${Number(r.oz).toFixed(4)}</td>
                <td>${formatIls(r.now)}</td>
                <td class="${r.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">${formatIls(r.pnl)}</td>
                <td><button class="row-delete-btn" data-id="${r.id}">×</button></td>
            </tr>
        `).join('');
    }
    const t = pnlRows.map(calcRow).reduce(
        (a, r) => ({ cost: a.cost + r.cost, now: a.now + r.now }),
        { cost: 0, now: 0 }
    );
    document.getElementById('total-cost-ils').textContent    = formatIls(t.cost);
    document.getElementById('total-current-ils').textContent = formatIls(t.now);
    const pnlEl = document.getElementById('total-pnl-ils');
    const p = t.now - t.cost;
    pnlEl.textContent = formatIls(p);
    pnlEl.className   = p >= 0 ? 'pnl-positive' : 'pnl-negative';
}

// ── CHART DATA GENERATION ────────────────────────────────────────────
const FRAME_CONF = {
    '1d': { count: 20, vol: 0.006, intervalMs:      60 * 60 * 1000 },   // hourly for ~20 candles
    '1w': { count: 7,  vol: 0.010, intervalMs:  24 * 60 * 60 * 1000 },  // 7 days
    '1m': { count: 12, vol: 0.014, intervalMs:   7 * 24 * 60 * 60 * 1000 }, // 12 weeks
};

// Fallback: generate simulated candles anchored at current live price
function genCandles(frame) {
    const conf = FRAME_CONF[frame];
    const now  = Date.now();
    let close  = goldPrice || 2300;
    const out  = [];
    for (let i = 0; i < conf.count; i++) {
        const ts   = now - (conf.count - i) * conf.intervalMs;
        const open = close;
        close = Math.max(8, open + (Math.random() - 0.5) * conf.vol * open);
        const high = Math.max(open, close) + Math.random() * conf.vol * open * 1.5;
        const low  = Math.min(open, close) - Math.random() * conf.vol * open * 1.5;
        out.push({ open, close, high, low: Math.max(0.1, low), ts });
    }
    return out;
}

// Fetch real historical gold price data from backend (Yahoo Finance via /api/gold-history)
async function fetchRealChartData(frame) {
    const periodMap = { '1d': 'daily', '1w': 'weekly', '1m': 'yearly' };
    const period    = periodMap[frame] || 'daily';
    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/gold-history?period=${period}`);
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data) || json.data.length < 3) return null;

        // Convert {date, price} → OHLC candles (close = real price, wicks simulated)
        const vol = FRAME_CONF[frame]?.vol || 0.01;
        return json.data.map((pt, i, arr) => {
            const close = pt.price;
            const open  = i > 0 ? arr[i - 1].price : close;
            const wick  = Math.random() * vol;
            return {
                open,
                close,
                high: Math.max(open, close) * (1 + wick),
                low:  Math.max(0.1, Math.min(open, close) * (1 - wick)),
                ts:   new Date(pt.date).getTime(),
            };
        });
    } catch { return null; }
}

// Load chart data: real API first, simulated fallback; result is always cached
async function loadChartData(frame) {
    if (chartCache[frame]) return chartCache[frame];
    const real = await fetchRealChartData(frame);
    if (real && real.length >= 3) {
        _lastDataReal = true;
        chartCache[frame] = real;
        return real;
    }
    _lastDataReal = false;
    const sim = genCandles(frame);
    chartCache[frame] = sim;
    return sim;
}

// Whether the current chart is using real market data
let _lastDataReal = false;

// Reliable date part extraction using Intl (handles DST, locale correctly)
function _dateParts(ts, tz) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit', month: '2-digit', year: '2-digit', timeZone: tz
    }).formatToParts(new Date(ts));
    return {
        day:   parts.find(p => p.type === 'day')?.value   ?? '00',
        month: parts.find(p => p.type === 'month')?.value ?? '00',
        year:  parts.find(p => p.type === 'year')?.value  ?? '00',
    };
}

function _timeStr(ts, tz) {
    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false
    }).format(new Date(ts));
}

// Short label for chart axis (1d = HH:MM, 1w = DD/MM, 1m = MM/YY)
function formatCandleTime(ts, frame) {
    const tz = 'Asia/Jerusalem';
    if (frame === '1d') return _timeStr(ts, tz);          // e.g. "14:00"
    const { day, month, year } = _dateParts(ts, tz);
    if (frame === '1w') return `${day}/${month}`;          // e.g. "09/04"
    return `${month}/${year}`;                             // e.g. "04/25"
}

// Full label for tooltips (includes year / date)
function formatCandleTimeFull(ts, frame) {
    const tz = 'Asia/Jerusalem';
    const { day, month, year } = _dateParts(ts, tz);
    if (frame === '1d') return `${day}/${month}/20${year} ${_timeStr(ts, tz)}`;
    if (frame === '1m') return `${month}/20${year}`;
    return `${day}/${month}/20${year}`;
}

// ── CANDLESTICK RENDERER (canvas) ───────────────────────────────────
function _showCanvasLoading() {
    const c = document.getElementById('candles-canvas');
    if (!c) return;
    const ctx  = c.getContext('2d');
    const dark = document.body.classList.contains('dark-mode');
    const W = c.clientWidth || 700;
    const H = c.clientHeight || 380;
    c.width = Math.floor(W * (window.devicePixelRatio || 1));
    c.height = Math.floor(H * (window.devicePixelRatio || 1));
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = dark ? 'rgba(26,36,28,.92)' : 'rgba(240,237,231,.9)';
    ctx.beginPath();
    ctx.roundRect?.(0, 0, W, H, 18) ?? ctx.rect(0, 0, W, H);
    ctx.fill();
    ctx.fillStyle = dark ? 'rgba(185,215,186,.45)' : 'rgba(74,88,72,.45)';
    ctx.font = '14px Assistant, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('טוען נתונים...', W / 2, H / 2);
}

function _drawCandleData(frame, data) {
    const c = document.getElementById('candles-canvas');
    if (!c || !data?.length) return;
    const ctx  = c.getContext('2d');
    const dpr  = window.devicePixelRatio || 1;
    const W    = c.clientWidth  || 700;
    const H    = c.clientHeight || 380;
    c.width    = Math.floor(W * dpr);
    c.height   = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const p  = { t: 20, r: 16, b: 70, l: 52 };
    const iw = W - p.l - p.r;
    const ih = H - p.t - p.b;
    const max  = Math.max(...data.map(x => x.high));
    const min  = Math.min(...data.map(x => x.low));
    const span = Math.max(0.0001, max - min);

    // Background
    const isDark = document.body.classList.contains('dark-mode');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDark ? 'rgba(26,36,28,.92)' : 'rgba(240,237,231,.9)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 18);
    else ctx.rect(0, 0, W, H);
    ctx.fill();

    // Horizontal grid + Y price labels
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y     = p.t + (ih / gridLines) * i;
        const price = max - (span / gridLines) * i;
        ctx.strokeStyle = isDark ? 'rgba(90,140,94,.22)' : 'rgba(78,110,92,.16)';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(W - p.r, y); ctx.stroke();
        ctx.fillStyle   = isDark ? 'rgba(185,215,186,.65)' : 'rgba(74,88,72,.60)';
        ctx.font        = '10px Assistant, sans-serif';
        ctx.textAlign   = 'right';
        ctx.fillText(`$${price.toFixed(2)}`, p.l - 4, y + 4);
    }

    // Candles + X timestamps
    const step = iw / data.length;
    const bw   = Math.max(4, step * 0.56);

    data.forEach((d, i) => {
        const x  = p.l + i * step + step / 2;
        const yo = p.t + ((max - d.open)  / span) * ih;
        const yc = p.t + ((max - d.close) / span) * ih;
        const yh = p.t + ((max - d.high)  / span) * ih;
        const yl = p.t + ((max - d.low)   / span) * ih;
        const up  = d.close >= d.open;
        const col = up ? '#4AB882' : '#D94949';

        ctx.strokeStyle = col;
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(x, yh); ctx.lineTo(x, yl); ctx.stroke();

        ctx.fillStyle = col;
        const bodyY = Math.min(yo, yc);
        const bodyH = Math.max(2, Math.abs(yc - yo));
        ctx.fillRect(x - bw / 2, bodyY, bw, bodyH);

        ctx.strokeStyle = isDark ? 'rgba(90,140,94,.20)' : 'rgba(78,110,92,.25)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, H - p.b);
        ctx.lineTo(x, H - p.b + 4);
        ctx.stroke();

        // Dynamic label step: skip labels so they never overlap (target min 28px gap after rotation)
        const labelStep = Math.max(1, Math.ceil(30 / (step * Math.cos(40 * Math.PI / 180))));
        if (i % labelStep === 0) {
            const label = formatCandleTime(d.ts, frame);
            ctx.save();
            ctx.translate(x, H - p.b + 8);
            // -40° (CCW) + textAlign 'left' → text extends toward upper-right in screen space
            ctx.rotate(-40 * Math.PI / 180);
            ctx.fillStyle = isDark ? 'rgba(185,215,186,.72)' : 'rgba(74,88,72,.72)';
            ctx.font      = '9px Assistant, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(label, 0, 0);
            ctx.restore();
        }
    });

    // Update footnote based on whether data is real or simulated
    const note = document.querySelector('.chart-note');
    if (note) {
        note.textContent = _lastDataReal
            ? '* נתוני מחיר אמיתיים - חוזים עתידיים על זהב (GC=F)'
            : '* גרף דמו לימודי המחושב על סמך מחיר נוכחי וסימולציית תנודתיות.';
    }
}

function renderCandleChart(frame) {
    activeFrame = frame;
    if (chartCache[frame]) {
        _drawCandleData(frame, chartCache[frame]);
        return;
    }
    _showCanvasLoading();
    loadChartData(frame).then(data => _drawCandleData(frame, data));
}

// ── LINE CHART (Chart.js) ─────────────────────────────────────────────
function _chartUiTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    return {
        textColor: isDark ? 'rgba(221,234,221,0.88)' : 'rgba(74,88,72,0.75)',
        gridColor: isDark ? 'rgba(90,140,94,0.22)' : 'rgba(74,88,72,0.10)',
        tooltipBg: isDark ? 'rgba(34,44,36,0.96)' : 'rgba(240,237,231,0.96)',
        tooltipTitle: isDark ? '#edf5ee' : '#2C3028',
        tooltipBody: isDark ? '#d49e7e' : '#C4845A',
        tooltipBorder: isDark ? 'rgba(90,140,94,0.35)' : 'rgba(168,148,128,0.3)',
    };
}

function _drawLineData(frame, data) {
    const canvas = document.getElementById('line-canvas');
    if (!canvas || !data?.length) return;
    const labels = data.map(c => formatCandleTime(c.ts, frame));
    const prices = data.map(c => c.close);
    const theme = _chartUiTheme();

    const lineColor = 'rgba(196,132,90,1)';
    const fillColor = 'rgba(196,132,90,0.12)';

    lineChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data:              prices,
                borderColor:       lineColor,
                backgroundColor:   fillColor,
                borderWidth:       2.5,
                pointRadius:       data.length > 30 ? 2 : 4,
                pointHoverRadius:  6,
                pointBackgroundColor: lineColor,
                fill:    true,
                tension: 0.4,
            }]
        },
        options: {
            responsive:           true,
            maintainAspectRatio:  false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                    tooltip: {
                        backgroundColor: theme.tooltipBg,
                        titleColor:      theme.tooltipTitle,
                        bodyColor:       theme.tooltipBody,
                        borderColor:     theme.tooltipBorder,
                        borderWidth:     1,
                        cornerRadius:    10,
                        padding:         10,
                        callbacks: {
                            title: ctx => {
                                const idx = ctx[0]?.dataIndex;
                                const d   = (chartCache[activeFrame] || [])[idx];
                                return d ? formatCandleTimeFull(d.ts, activeFrame) : '';
                            },
                            label: ctx => ` $${ctx.parsed.y.toFixed(3)} USD/oz`
                        }
                    }
            },
            scales: {
                x: {
                    ticks: {
                        color:          theme.textColor,
                        font:           { size: 9 },
                        maxRotation:    40,
                        minRotation:    30,
                        autoSkip:       true,
                        maxTicksLimit:  10,   // never show more than 10 x-axis ticks
                    },
                    grid:   { color: theme.gridColor },
                    border: { display: false },
                },
                y: {
                    ticks:  { color: theme.textColor, font: { size: 10 }, callback: v => `$${v.toFixed(0)}` },
                    grid:   { color: theme.gridColor },
                    border: { display: false },
                }
            }
        }
    });

    // Update footnote
    const note = document.querySelector('.chart-note');
    if (note) {
        note.textContent = _lastDataReal
            ? '* נתוני מחיר אמיתיים - חוזים עתידיים על זהב (GC=F)'
            : '* גרף דמו לימודי המחושב על סמך מחיר נוכחי וסימולציית תנודתיות.';
    }
}

function renderLineChart(frame) {
    activeFrame = frame;
    if (lineChart) { lineChart.destroy(); lineChart = null; }
    if (chartCache[frame]) {
        _drawLineData(frame, chartCache[frame]);
        return;
    }
    loadChartData(frame).then(data => {
        if (lineChart) { lineChart.destroy(); lineChart = null; }
        _drawLineData(frame, data);
    });
}

function renderActiveChart() {
    if (activeChartType === 'candles') renderCandleChart(activeFrame);
    else                               renderLineChart(activeFrame);
}

// ── WEEKLY NEWS ───────────────────────────────────────────────────────
const NEWS_CAT_LABELS = {
    he: { financial: 'פיננסי', geopolitical: 'גיאופוליטי', positive: 'חיובי', negative: 'שלילי' },
    en: { financial: 'Financial', geopolitical: 'Geopolitical', positive: 'Positive', negative: 'Negative' },
    ru: { financial: 'Финансы', geopolitical: 'Геополитика', positive: 'Позитив', negative: 'Негатив' },
};
const NEWS_CAT_CLASS = {
    financial: 'news-tag-financial', geopolitical: 'news-tag-geo',
    positive:  'news-tag-positive',  negative:     'news-tag-negative',
};
const NEWS_LANG_DIR  = { he: 'rtl', en: 'ltr', ru: 'ltr' };
const NEWS_LANG_KEY  = 'vault_news_lang';

let _newsData    = null;   // cached API response
let _newsLang    = localStorage.getItem(NEWS_LANG_KEY) || 'he';

function _formatNewsDate(isoDate, lang) {
    if (!isoDate) return '';
    const d = new Date(isoDate + 'T00:00:00');
    const locales = { he: 'he-IL', en: 'en-GB', ru: 'ru-RU' };
    return d.toLocaleDateString(locales[lang] || 'he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function _renderNewsDigest(lang) {
    const container = document.getElementById('news-container');
    const meta      = document.getElementById('news-date-meta');
    if (!container || !_newsData) return;

    const items       = _newsData.items || [];
    const pubDate     = _newsData.published_date || '';
    const nextUpdate  = _newsData.next_update    || '';

    // Date meta line - only "as of" date, no next-update
    if (meta) {
        meta.textContent = lang === 'he' ? `נכון ל-${_formatNewsDate(pubDate, 'he')}` : '';
    }

    const dir     = NEWS_LANG_DIR[lang] || 'rtl';
    const digest  = document.createElement('div');
    digest.className = 'news-digest';
    digest.setAttribute('dir', dir);

    items.forEach((item, idx) => {
        const langBlock = item[lang] || item['he'] || {};

        const section = document.createElement('div');
        section.className = 'news-section';
        section.innerHTML = `
            <h3 class="news-section-title">${escapeHtml(langBlock.title || '')}</h3>
            <p class="news-section-body">${escapeHtml(langBlock.summary || '')}</p>
        `;
        digest.appendChild(section);

        if (idx < items.length - 1) {
            const hr = document.createElement('hr');
            hr.className = 'news-divider';
            digest.appendChild(hr);
        }
    });

    container.innerHTML = '';
    container.appendChild(digest);
}

function _switchNewsLang(lang) {
    _newsLang = lang;
    localStorage.setItem(NEWS_LANG_KEY, lang);
    document.querySelectorAll('.news-lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
    });
    if (_newsData) _renderNewsDigest(lang);
}

async function loadNews() {
    const container = document.getElementById('news-container');
    if (!container) return;

    container.innerHTML = '<div class="news-loading">טוען חדשות...</div>';

    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/news`, { cache:'no-store' });
        const data = await res.json();

        if (!data.success || !Array.isArray(data.items) || !data.items.length) {
            _newsData = null;
            container.innerHTML = '<p class="news-empty">אין חדשות זמינות כרגע. נסה שוב מאוחר יותר.</p>';
            return;
        }
        _newsData = data;
        _renderNewsDigest(_newsLang);
    } catch {
        container.innerHTML = '<p class="news-empty">שגיאת חיבור - נסה שוב מאוחר יותר.</p>';
    }
}

function initNewsLangToggle() {
    document.querySelectorAll('.news-lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === _newsLang);
        btn.addEventListener('click', () => _switchNewsLang(btn.dataset.lang));
    });
}

// ── NAVIGATION CHIPS (Mr. D → App deeplinks) ─────────────────────────

const NAV_CHIP_DEFS = {
    'charts':         { he: 'גרפים',            en: 'Charts',                    ru: 'Графики',
                        action: ['screen', 'charts-screen'] },
    'museum':         { he: 'מוזיאון מינטים',    en: 'Mints Museum',              ru: 'Музей монетных дворов',
                        action: ['screen', 'museum-screen'] },
    'museum:israel':  { he: 'מינט ישראל',       en: 'Israel Mint',               ru: 'Монетный двор Израиля',
                        action: ['mint', 'israel'] },
    'museum:germany': { he: 'מינט גרמניה',      en: 'Germany Mint',              ru: 'Баварский монетный двор',
                        action: ['mint', 'germany'] },
    'museum:uk':      { he: 'המינט המלכותי',    en: 'Royal Mint',                ru: 'Королевский монетный двор',
                        action: ['mint', 'uk'] },
    'museum:usa':     { he: 'מינט ארה"ב',        en: 'US Mint',                   ru: 'Монетный двор США',
                        action: ['mint', 'usa'] },
    'museum:canada':  { he: 'מינט קנדה',          en: 'Royal Canadian Mint',       ru: 'Монетный двор Канады',
                        action: ['mint', 'canada'] },
    'museum:perth':   { he: 'מינט פרת\'',          en: 'Perth Mint',                ru: 'Монетный двор Перта',
                        action: ['mint', 'perth'] },
    'museum:austria': { he: 'מינט וינה',          en: 'Austrian Mint',             ru: 'Австрийский монетный двор',
                        action: ['mint', 'austria'] },
    'museum:mexico':  { he: 'מינט מקסיקו',        en: 'Mexico Mint',               ru: 'Монетный двор Мексики',
                        action: ['mint', 'mexico'] },
    'quiz':           { he: 'טריוויה זהב',        en: 'Gold Quiz',                  ru: 'Викторина',
                        action: ['quiz', ''] },
    'pnl':            { he: 'מעקב רווח / הפסד',  en: 'P&L Tracker',               ru: 'Трекер прибыли/убытков',
                        action: ['screen', 'pnl-screen'] },
    'guide':          { he: 'קנייה ומכירה',           en: 'Buy & Sell',               ru: 'Покупка и продажа',
                        action: ['screen', 'guide-screen'] },
    'news':           { he: 'חדשות ועדכונים',    en: 'News & Updates',             ru: 'Новости и обновления',
                        action: ['screen', 'updates-screen'] },
    'homework':       { he: 'שיעורי בית',         en: 'Homework',                   ru: 'Домашнее задание',
                        action: ['screen', 'homework-screen'] },
};

function _detectChatLang(text) {
    const he = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const ru = (text.match(/[\u0400-\u04FF]/g) || []).length;
    if (he >= 5 && he >= ru) return 'he';
    if (ru >= 5) return 'ru';
    return 'en';
}

function _parseNavTokens(rawText) {
    const seen  = new Set();
    const tokens = [];
    const text = rawText.replace(/\[NAV:([^\]]+)\]/gi, (_, key) => {
        const k = key.trim().toLowerCase();
        if (NAV_CHIP_DEFS[k] && !seen.has(k) && tokens.length < 4) {
            seen.add(k);
            tokens.push(k);
        }
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { text, tokens };
}

function handleNavChip(token) {
    const def = NAV_CHIP_DEFS[token];
    if (!def) return;
    // Close modal
    const modal = document.getElementById('mr-d-modal');
    if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    const [type, target] = def.action;
    if (type === 'screen') {
        goToScreen(target);
    } else if (type === 'mint') {
        openMuseumMint(target);
    } else if (type === 'quiz') {
        goToScreen('homework-screen');
        setTimeout(_hwOpenQuiz, 250); // wait for screen transition
    }
}

// ── CHAT ──────────────────────────────────────────────────────────────
function addMsg(author, rawText, type) {
    const box = document.getElementById('chat-messages');
    const el  = document.createElement('div');
    el.className = `chat-message ${type}`;

    // Typing indicator: three animated floating dots (no author label, no text).
    if (type.includes('typing')) {
        el.innerHTML =
            '<div class="msg-content typing-indicator" aria-label="גרופבוט מקליד">' +
            '<span class="typing-dot"></span>' +
            '<span class="typing-dot"></span>' +
            '<span class="typing-dot"></span>' +
            '</div>';
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
        return el;
    }

    // Parse nav tokens only on final bot messages (not typing indicator / error)
    let displayText = rawText;
    let navTokens   = [];
    const isFinalBot = type === 'bot';
    if (isFinalBot) {
        const parsed = _parseNavTokens(rawText);
        displayText  = parsed.text;
        navTokens    = parsed.tokens;
    }

    const safe = escapeHtml(displayText);
    if (type.includes('bot')) {
        let html = `<div class="msg-content"><span class="msg-inline-author">${escapeHtml(author)}:</span> <span class="msg-text">${safe}</span></div>`;
        if (navTokens.length > 0) {
            const lang     = _detectChatLang(displayText);
            const chipsHtml = navTokens.map(token => {
                const def = NAV_CHIP_DEFS[token];
                if (!def) return '';
                const label = escapeHtml(def[lang] || def.he);
                return `<button class="nav-chip" onclick="handleNavChip('${token}')">${label}</button>`;
            }).join('');
            html += `<div class="nav-chips-row">${chipsHtml}</div>`;
        }
        el.innerHTML = html;
    } else {
        el.innerHTML = `<div class="msg-content"><span class="msg-text">${safe}</span></div>`;
    }
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    addMsg('אתה', text, 'user');
    input.value = '';
    const typing = addMsg('גרופבוט', 'מקליד...', 'bot typing');
    try {
        const token = sessionToken();
        const res = await fetch(`${CONFIG.CHAT_API_URL}/chat/mine`, {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ user_id: uid, message: text }),
        });

        // Server restarted → token invalidated → force re-login
        if (res.status === 401) {
            typing.remove();
            addMsg('גרופבוט', 'החיבור פג תוקף. מתחבר מחדש...', 'bot error');
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem('grouptech_session');
            setTimeout(() => {
                location.replace('../hub.html');
            }, 1200);
            return;
        }

        const data = await res.json();
        typing.remove();
        addMsg('גרופבוט', data.response || 'אין כרגע מענה, נסה שוב.', 'bot');
    } catch {
        typing.remove();
        addMsg('גרופבוט', 'יש כרגע תקלה זמנית. נסה שוב בעוד רגע.', 'bot error');
    }
}

// ══════════════════════════════════════════════════════════════════════
// GOLD TRIVIA QUIZ (QUIZ_BANK in gold_quiz_bank.js)
// ══════════════════════════════════════════════════════════════════════


let QUIZ_TOTAL = 15;   // capped per round; adapts if the store has fewer questions
const QUIZ_SECS  = 600;

let quizState = { questions: [], idx: 0, score: 0, timeLeft: QUIZ_SECS, timer: null, locked: false };
let _learningVideos = null;

function _quizShuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function _quizBuild() {
    QUIZ_TOTAL = Math.min(15, QUIZ_BANK.length);
    return _quizShuffle(QUIZ_BANK).slice(0, QUIZ_TOTAL).map(({ q, a }) => {
        const order = _quizShuffle([0, 1, 2, 3]);
        return { q, answers: order.map(i => a[i]), correct: order.indexOf(0) };
    });
}

function _quizFmt(sec) {
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function _quizPanel(show) {
    ['quiz-start', 'quiz-playing', 'quiz-done'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === show) ? '' : 'none';
    });
}

function _quizRender() {
    const { questions, idx, score, timeLeft } = quizState;
    const q = questions[idx];
    const pct = Math.round((idx / QUIZ_TOTAL) * 100);

    document.getElementById('quiz-q-num').textContent   = `${idx + 1} / ${QUIZ_TOTAL}`;
    document.getElementById('quiz-score-hud').textContent = `${score} נק'`;
    document.getElementById('quiz-question').textContent  = q.q;
    const bar = document.getElementById('quiz-bar');
    if (bar) bar.style.width = pct + '%';

    const timerEl = document.getElementById('quiz-timer');
    if (timerEl) {
        timerEl.textContent = _quizFmt(timeLeft);
        timerEl.classList.toggle('quiz-timer-low', timeLeft <= 60);
    }

    const wrap = document.getElementById('quiz-options');
    wrap.innerHTML = '';
    q.answers.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className   = 'quiz-opt-btn';
        btn.textContent = ans;
        btn.onclick     = () => _quizSelect(i);
        wrap.appendChild(btn);
    });
    quizState.locked = false;
}

function _quizSelect(chosen) {
    if (quizState.locked) return;
    quizState.locked = true;
    const { questions, idx } = quizState;
    const correct = questions[idx].correct;
    const ok = chosen === correct;
    if (ok) quizState.score++;
    if (ok) playQuizCorrectSound();
    else playQuizWrongSound();

    document.querySelectorAll('.quiz-opt-btn').forEach((btn, i) => {
        btn.disabled = true;
        if (i === correct) btn.classList.add('correct');
        if (i === chosen && !ok) btn.classList.add('wrong');
    });
    document.getElementById('quiz-score-hud').textContent = `${quizState.score} נק'`;
    setTimeout(_quizNext, 2000);
}

function _quizNext() {
    quizState.idx++;
    if (quizState.idx >= QUIZ_TOTAL) {
        _quizEnd();
    } else {
        _quizRender();
    }
}

function _quizTick() {
    quizState.timeLeft--;
    const timerEl = document.getElementById('quiz-timer');
    if (timerEl) {
        timerEl.textContent = _quizFmt(quizState.timeLeft);
        timerEl.classList.toggle('quiz-timer-low', quizState.timeLeft <= 60);
    }
    if (quizState.timeLeft <= 0) {
        clearInterval(quizState.timer);
        quizState.timer = null;
        _quizEnd();
    }
}

function _quizEnd() {
    if (quizState.timer) { clearInterval(quizState.timer); quizState.timer = null; }
    const s = quizState.score;
    const pct = Math.round((s / QUIZ_TOTAL) * 100);
    document.getElementById('quiz-final-score').textContent = s;
    document.getElementById('quiz-done-msg').textContent =
        pct >= 90 ? 'מעולה! אתה מומחה זהב פיזי!' :
        pct >= 70 ? 'תוצאה מצוינת! ידע מרשים של שוק הזהב.' :
        pct >= 50 ? 'לא רע! כדאי לחזור על חומר הלמידה.' :
                    'יש מקום לשיפור - חזור ולמד שוב!';
    _quizPanel('quiz-done');
}

function quizStart() {
    if (quizState.timer) clearInterval(quizState.timer);
    quizState = { questions: _quizBuild(), idx: 0, score: 0, timeLeft: QUIZ_SECS, timer: null, locked: false };
    _quizPanel('quiz-playing');
    _quizRender();
    quizState.timer = setInterval(_quizTick, 1000);
}

function quizReset() {
    if (quizState.timer) { clearInterval(quizState.timer); quizState.timer = null; }
    quizState = { questions: [], idx: 0, score: 0, timeLeft: QUIZ_SECS, timer: null, locked: false };
    _hwShowMenu(); // return to homework menu instead of showing quiz-start directly
}

function _hwShowMenu() {
    const menu = document.getElementById('hw-menu');
    const wrap = document.getElementById('hw-quiz-wrap');
    const videosWrap = document.getElementById('hw-videos-wrap');
    if (menu) menu.style.display = '';
    if (wrap) wrap.style.display = 'none';
    if (videosWrap) videosWrap.style.display = 'none';
    _quizPanel('quiz-start'); // reset quiz panels for next time
}

function _hwOpenQuiz() {
    const menu = document.getElementById('hw-menu');
    const wrap = document.getElementById('hw-quiz-wrap');
    const videosWrap = document.getElementById('hw-videos-wrap');
    if (menu) menu.style.display = 'none';
    if (wrap) wrap.style.display = '';
    if (videosWrap) videosWrap.style.display = 'none';
    _quizPanel('quiz-start');
}

function _safeYouTubeUrl(raw) {
    try {
        const url = new URL(String(raw || '').trim());
        if (url.protocol !== 'https:') return '';
        const host = url.hostname.toLowerCase();
        const allowed = host === 'youtu.be' ||
            host === 'youtube.com' ||
            host.endsWith('.youtube.com') ||
            host === 'youtube-nocookie.com' ||
            host.endsWith('.youtube-nocookie.com');
        return allowed ? url.href : '';
    } catch {
        return '';
    }
}

async function _loadLearningVideos() {
    const list = document.getElementById('learning-videos-list');
    if (!list) return;
    list.innerHTML = '<p class="learning-videos-state">טוען סרטונים...</p>';

    if (_learningVideos === null) {
        _learningVideos = await _fetchContent('links');
    }

    const videos = (_learningVideos || [])
        .map(item => ({
            title: String(item.title || '').trim(),
            url: _safeYouTubeUrl(item.url),
            order: Number(item.order) || 100,
        }))
        .filter(item => item.title && item.url)
        .sort((a, b) => a.order - b.order);

    if (!videos.length) {
        list.innerHTML = '<p class="learning-videos-state">סרטוני הלימוד יעלו כאן בקרוב.</p>';
        return;
    }

    list.innerHTML = videos.map(video => `
        <a class="learning-video-link" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">
            <span class="learning-video-play" aria-hidden="true"></span>
            <span class="learning-video-title">${escapeHtml(video.title)}</span>
            <span class="learning-video-arrow" aria-hidden="true"></span>
        </a>
    `).join('');
}

function _hwOpenVideos() {
    const menu = document.getElementById('hw-menu');
    const quizWrap = document.getElementById('hw-quiz-wrap');
    const videosWrap = document.getElementById('hw-videos-wrap');
    if (menu) menu.style.display = 'none';
    if (quizWrap) quizWrap.style.display = 'none';
    if (videosWrap) videosWrap.style.display = '';
    _loadLearningVideos();
}

function _hwSubViewOpen() {
    return ['hw-quiz-wrap', 'hw-videos-wrap'].some(id => {
        const el = document.getElementById(id);
        return el && el.style.display !== 'none';
    });
}

function initQuiz() {
    document.getElementById('quiz-start-btn')?.addEventListener('click', quizStart);
    document.getElementById('quiz-restart-btn')?.addEventListener('click', quizReset);
    document.getElementById('quiz-menu-btn')?.addEventListener('click', _hwOpenQuiz);
    document.getElementById('videos-menu-btn')?.addEventListener('click', _hwOpenVideos);
    document.getElementById('back-to-hw-menu-videos')?.addEventListener('click', _hwShowMenu);
}

// ══════════════════════════════════════════════════════════════════════
// MUSEUM - Mint data + logic
// ══════════════════════════════════════════════════════════════════════

const DOVE_OF_PEACE_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/israel/dove-of-peace.webp?v=2';
const DOVE_OF_PEACE_1KG_BAR_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/israel/dove-of-peace-1kg-bar.webp?v=2';
const SILVER_GRAINS_300G_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/israel/silver-grains-300g.webp?v=2';
const AMERICAN_SILVER_EAGLE_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/usa/american-silver-eagle.webp?v=2';
const AMERICAN_BUFFALO_2001_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/usa/american-buffalo-commemorative-2001.webp?v=3';
const SUNSHINE_MINT_10OZ_BAR_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/usa/sunshine-mint-10oz-bar.webp?v=3';
const ROYAL_MINT_500G_CAST_BAR_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/uk/royal-mint-500g-cast-bar.webp?v=1';
const BRITANNIA_2026_REVERSE_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/uk/silver-britannia-2026-reverse.webp?v=1';
const BRITANNIA_2026_OBVERSE_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/uk/silver-britannia-2026-obverse.webp?v=1';

const MUSEUM_UPLOADED_MINTS = new Set(['israel', 'usa', 'uk']);
const MUSEUM_UPLOADED_IMG_HOST = 'uftkmytmegszggtsrrhz.supabase.co';

function getUploadedMintProducts(products) {
    return (products || []).filter(p => p?.img && p.img.includes(MUSEUM_UPLOADED_IMG_HOST));
}

function formatProductDesc(p) {
    const desc = (p.desc || '').trim();
    const weight = (p.weight || '').trim();
    let year = (p.year || '').trim();
    if (/^(שוטף|current|текущий|ongoing)$/i.test(year)) year = '';

    if (year && weight) return `${year} - ${weight} - ${desc}`;
    if (year) return `${year} - ${desc}`;
    if (weight) return `${weight} - ${desc}`;
    return desc;
}

function mintWebsiteHref(website) {
    if (!website) return '';
    const value = String(website).trim();
    if (/^https?:\/\//i.test(value)) return value;
    return `https://${value}`;
}

function mintWebsiteLabel(website) {
    return String(website || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

const MINT_DATA = {
    israel: {
        id: "israel",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Jerusalem_skyline_from_armon_hanatziv_panoramic.jpg/800px-Jerusalem_skyline_from_armon_hanatziv_panoramic.jpg",
        he: {
            name: "מינט ישראל",
            subtitle: "Israel Coins and Medals Corp. - ICMC",
            founded: "נוסד 1952",
            location: "ירושלים, ישראל",
            website: "en.israelmint.com",
            history: [
                {
                    title: "יסוד ומעמד לאומי",
                    text: "מינט ישראל (ICMC) הוקם ב-1952 כגוף הרשמי להנפקת מטבעות ומדליות. לצד הנפקות אספנות הוא מציע גם בוליון זהב - כולל סדרת יונת השלום."
                },
                {
                    title: "זהב השקעה ישראלי",
                    text: "בשנים האחרונות המותג The Holy Land Mint חיזק נוכחות בשוק הזהב הפיזי: מטבעות ומטילים בטוהר גבוה, עם ביקוש מקומי ובינלאומי."
                },
                {
                    title: "פטור ממע״מ",
                    text: "זהב השקעה מוכר בישראל נהנה מפטור ממע״מ - יתרון משמעותי למשקיע המקומי לעומת כסף."
                }
            ],
            products: [
                {
                    title: "יונת השלום - זהב",
                    type: "בוליון",
                    weight: "משקלים שונים",
                    year: "2019-",
                    purity: "זהב 999.9",
                    desc: "סדרת יונת השלום בזהב טהור - סמל ישראלי מוכר, נזילות טובה בשוק המקומי.",
                    img: "https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/israel/dove-of-peace.webp?v=2",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "מטבעות זהב לאומיים",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "משתנה",
                    purity: "זהב 999-999.9",
                    desc: "הנפקות זהב רשמיות ונושאיות של ICMC - מתאימות להשקעה ולאספנות.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1952",
                    text: "הקמת החברה הישראלית למדליות ולמטבעות."
                },
                {
                    title: "יונת השלום זהב",
                    text: "הרחבת הסדרה לזהב 999.9."
                },
                {
                    title: "Holy Land Mint",
                    text: "מיתוג בינלאומי לבוליון ישראלי."
                }
            ]
        },
        en: {
            name: "Israel Mint",
            subtitle: "Israel Coins and Medals Corp. - ICMC",
            founded: "Founded 1952",
            location: "Jerusalem, Israel",
            website: "en.israelmint.com",
            history: [
                {
                    title: "National foundation",
                    text: "ICMC was founded in 1952 as Israel’s official mint for coins and medals. It also offers physical gold bullion, including the Dove of Peace series."
                },
                {
                    title: "Holy Land Mint gold",
                    text: "Under the Holy Land Mint brand, Israel issues high-purity gold coins and bars with solid local and international demand."
                },
                {
                    title: "VAT advantage",
                    text: "Recognized investment gold in Israel is VAT-exempt - a major edge versus silver."
                }
            ],
            products: [
                {
                    title: "Dove of Peace - Gold",
                    type: "Bullion",
                    weight: "Various",
                    year: "2019-",
                    purity: "Gold 999.9",
                    desc: "Israel’s signature gold bullion line - recognizable and liquid in the local market.",
                    img: "https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/israel/dove-of-peace.webp?v=2",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "National gold issues",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "Varies",
                    purity: "Gold 999-999.9",
                    desc: "Official ICMC gold issues for investment and collecting.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1952",
                    text: "ICMC founded."
                },
                {
                    title: "Gold Dove",
                    text: "Series expanded into 999.9 gold."
                },
                {
                    title: "Holy Land Mint",
                    text: "International bullion branding."
                }
            ]
        },
        ru: {
            name: "Монетный двор Израиля",
            subtitle: "Israel Coins and Medals Corp. - ICMC",
            founded: "Основан в 1952",
            location: "Иерусалим, Израиль",
            website: "en.israelmint.com",
            history: [
                {
                    title: "Национальный двор",
                    text: "ICMC основан в 1952 году. Помимо памятных выпусков предлагает инвестиционное золото, включая серию «Голубь мира»."
                },
                {
                    title: "Holy Land Mint",
                    text: "Бренд выпускает золотые монеты и слитки высокой пробы."
                },
                {
                    title: "Без НДС",
                    text: "Инвестиционное золото в Израиле освобождено от НДС."
                }
            ],
            products: [
                {
                    title: "«Голубь мира» - золото",
                    type: "Буллион",
                    weight: "Разные веса",
                    year: "2019-",
                    purity: "Золото 999.9",
                    desc: "Флагманская золотая серия Израиля.",
                    img: "https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/israel/dove-of-peace.webp?v=2",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Национальные золотые выпуски",
                    type: "Монета",
                    weight: "1oz / доли",
                    year: "Разное",
                    purity: "Золото 999-999.9",
                    desc: "Официальные золотые выпуски ICMC.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1952",
                    text: "Основание ICMC."
                },
                {
                    title: "Золотой Голубь",
                    text: "Серия в пробе 999.9."
                }
            ]
        }
    },
    usa: {
        id: "usa",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/United_States_Mint_Philadelphia.jpg/800px-United_States_Mint_Philadelphia.jpg",
        he: {
            name: "בית המטבע האמריקאי",
            subtitle: "United States Mint",
            founded: "נוסד 1792",
            location: "פילדלפיה / ווסט פוינט, ארה״ב",
            website: "usmint.gov",
            history: [
                {
                    title: "מסורת זהב אמריקאית",
                    text: "ה-US Mint מנפיק את מטבעות הזהב המוכרים בעולם - בראשם American Gold Eagle ו-American Buffalo."
                },
                {
                    title: "סטנדרט השקעה",
                    text: "American Gold Eagle (22K עם סגסוגת עמידה) ו-Buffalo (24K טהור) הם אמות מידה לנזילות בשוק הזהב."
                },
                {
                    title: "ביקוש עולמי",
                    text: "מטבעות זהב אמריקאים נסחרים בקלות אצל דילרים בכל העולם."
                }
            ],
            products: [
                {
                    title: "American Gold Eagle",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "1986-",
                    purity: "זהב 22K (91.67%)",
                    desc: "מטבע הזהב הנמכר ביותר בארה״ב - עמיד, מוכר ונזיל מאוד.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/2016_American_Gold_Eagle_Obverse.jpg/640px-2016_American_Gold_Eagle_Obverse.jpg",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "American Buffalo Gold",
                    type: "מטבע",
                    weight: "1oz",
                    year: "2006-",
                    purity: "זהב 24K (99.99%)",
                    desc: "מטבע זהב טהור בעיצוב אייקוני - מועדף על משקיעים שרוצים טוהר מקסימלי.",
                    img: "https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/usa/american-buffalo-commemorative-2001.webp?v=3",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1792",
                    text: "הקמת US Mint."
                },
                {
                    title: "1986",
                    text: "השקת American Gold Eagle."
                },
                {
                    title: "2006",
                    text: "השקת American Buffalo בזהב 24K."
                }
            ]
        },
        en: {
            name: "United States Mint",
            subtitle: "US Mint",
            founded: "Founded 1792",
            location: "Philadelphia / West Point, USA",
            website: "usmint.gov",
            history: [
                {
                    title: "American gold tradition",
                    text: "The US Mint issues the world’s most recognized gold bullion coins - the American Gold Eagle and American Buffalo."
                },
                {
                    title: "Investment standard",
                    text: "Gold Eagle (22K durable alloy) and Buffalo (24K pure) set the liquidity benchmark for physical gold."
                },
                {
                    title: "Global demand",
                    text: "US gold coins trade easily with dealers worldwide."
                }
            ],
            products: [
                {
                    title: "American Gold Eagle",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "1986-",
                    purity: "Gold 22K (91.67%)",
                    desc: "America’s best-known gold bullion coin - durable and highly liquid.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/2016_American_Gold_Eagle_Obverse.jpg/640px-2016_American_Gold_Eagle_Obverse.jpg",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "American Buffalo Gold",
                    type: "Coin",
                    weight: "1oz",
                    year: "2006-",
                    purity: "Gold 24K (99.99%)",
                    desc: "Iconic pure-gold bullion coin for maximum purity.",
                    img: "https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/usa/american-buffalo-commemorative-2001.webp?v=3",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1792",
                    text: "US Mint founded."
                },
                {
                    title: "1986",
                    text: "American Gold Eagle launched."
                },
                {
                    title: "2006",
                    text: "American Buffalo 24K launched."
                }
            ]
        },
        ru: {
            name: "Монетный двор США",
            subtitle: "United States Mint",
            founded: "Основан в 1792",
            location: "Филадельфия / Вест-Пойнт, США",
            website: "usmint.gov",
            history: [
                {
                    title: "Американское золото",
                    text: "US Mint выпускает American Gold Eagle и American Buffalo - эталоны инвестиционного золота."
                },
                {
                    title: "Ликвидность",
                    text: "Монеты США легко продаются дилерам по всему миру."
                }
            ],
            products: [
                {
                    title: "American Gold Eagle",
                    type: "Монета",
                    weight: "1oz / доли",
                    year: "1986-",
                    purity: "Золото 22K",
                    desc: "Самая известная золотая инвестиционная монета США.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/2016_American_Gold_Eagle_Obverse.jpg/640px-2016_American_Gold_Eagle_Obverse.jpg",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "American Buffalo",
                    type: "Монета",
                    weight: "1oz",
                    year: "2006-",
                    purity: "Золото 24K",
                    desc: "Чистое золото 99.99%.",
                    img: "https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/usa/american-buffalo-commemorative-2001.webp?v=3",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1986",
                    text: "Запуск Gold Eagle."
                },
                {
                    title: "2006",
                    text: "Запуск Buffalo 24K."
                }
            ]
        }
    },
    uk: {
        id: "uk",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Royal_Mint_Llantrisant.jpg/800px-Royal_Mint_Llantrisant.jpg",
        he: {
            name: "המינט המלכותי",
            subtitle: "The Royal Mint - בריטניה",
            founded: "מסורת מ-886",
            location: "לנטריסנט, ויילס",
            website: "royalmint.com",
            history: [
                {
                    title: "מורשת זהב בריטית",
                    text: "המינט המלכותי אחראי לסוברן ולהנפקת Britannia בזהב - מהמטבעות המוכרים באירופה."
                },
                {
                    title: "Britannia זהב",
                    text: "מטבע Britannia בזהב 999.9 משלב עיצוב קלאסי עם טוהר גבוה ונזילות מעולה."
                },
                {
                    title: "סטנדרט LBMA",
                    text: "המינט המלכותי הוא שם אמין בשוק המתכות היקרות העולמי."
                }
            ],
            products: [
                {
                    title: "Gold Britannia",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "1987-",
                    purity: "זהב 999.9",
                    desc: "מטבע זהב בריטי מוביל - נפוץ באירופה ובישראל.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/2023_Britannia_1oz_Gold_Coin.png/640px-2023_Britannia_1oz_Gold_Coin.png",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Sovereign",
                    type: "מטבע",
                    weight: "~7.98g",
                    year: "היסטורי-היום",
                    purity: "זהב 22K",
                    desc: "הסוברן - מטבע זהב קלאסי עם היסטוריה ארוכה וביקוש יציב.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Elizabeth_II_gold_sovereign_1958_obverse.jpg/640px-Elizabeth_II_gold_sovereign_1958_obverse.jpg",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "886+",
                    text: "שורשי המינט המלכותי."
                },
                {
                    title: "Sovereign",
                    text: "סמל זהב בריטי לדורות."
                },
                {
                    title: "Britannia Gold",
                    text: "בוליון זהב מודרני בטוהר 999.9."
                }
            ]
        },
        en: {
            name: "The Royal Mint",
            subtitle: "United Kingdom",
            founded: "Roots from 886",
            location: "Llantrisant, Wales",
            website: "royalmint.com",
            history: [
                {
                    title: "British gold heritage",
                    text: "Home of the Sovereign and Gold Britannia - cornerstones of European bullion."
                },
                {
                    title: "Modern purity",
                    text: "Gold Britannia is struck in 999.9 fine gold with strong global liquidity."
                }
            ],
            products: [
                {
                    title: "Gold Britannia",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "1987-",
                    purity: "Gold 999.9",
                    desc: "Leading UK gold bullion coin.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/2023_Britannia_1oz_Gold_Coin.png/640px-2023_Britannia_1oz_Gold_Coin.png",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Sovereign",
                    type: "Coin",
                    weight: "~7.98g",
                    year: "Historic-present",
                    purity: "Gold 22K",
                    desc: "Classic British gold coin with enduring demand.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Elizabeth_II_gold_sovereign_1958_obverse.jpg/640px-Elizabeth_II_gold_sovereign_1958_obverse.jpg",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "Sovereign",
                    text: "Historic British gold standard."
                },
                {
                    title: "Britannia Gold",
                    text: "Modern 999.9 bullion."
                }
            ]
        },
        ru: {
            name: "Королевский монетный двор",
            subtitle: "The Royal Mint - Великобритания",
            founded: "С IX века",
            location: "Ллантрисант, Уэльс",
            website: "royalmint.com",
            history: [
                {
                    title: "Британское золото",
                    text: "Двор выпускает Sovereign и золотую Britannia."
                }
            ],
            products: [
                {
                    title: "Gold Britannia",
                    type: "Монета",
                    weight: "1oz",
                    year: "1987-",
                    purity: "Золото 999.9",
                    desc: "Ведущая британская золотая монета.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/2023_Britannia_1oz_Gold_Coin.png/640px-2023_Britannia_1oz_Gold_Coin.png",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Sovereign",
                    type: "Монета",
                    weight: "~7.98g",
                    year: "История-сегодня",
                    purity: "Золото 22K",
                    desc: "Классическая британская золотая монета.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Elizabeth_II_gold_sovereign_1958_obverse.jpg/640px-Elizabeth_II_gold_sovereign_1958_obverse.jpg",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "Britannia Gold",
                    text: "Современный буллион 999.9."
                }
            ]
        }
    },
    canada: {
        id: "canada",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Royal_Canadian_Mint_Ottawa.jpg/800px-Royal_Canadian_Mint_Ottawa.jpg",
        he: {
            name: "מינט קנדה",
            subtitle: "Royal Canadian Mint",
            founded: "נוסד 1908",
            location: "אוטווה / ויניפג, קנדה",
            website: "mint.ca",
            history: [
                {
                    title: "Maple Leaf זהב",
                    text: "המינט הקנדי מפורסם ב-Gold Maple Leaf - מהמטבעות הטהורים והמוכרים בעולם."
                },
                {
                    title: "חדשנות ואבטחה",
                    text: "קנדה מובילה בטכנולוגיות אבטחה במטבעות זהב ושומרת על מוניטין של טוהר 999.9."
                },
                {
                    title: "נזילות גבוהה",
                    text: "Maple Leaf נסחר בקלות אצל דילרים בכל השווקים המרכזיים."
                }
            ],
            products: [
                {
                    title: "Gold Maple Leaf",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "1979-",
                    purity: "זהב 999.9",
                    desc: "מטבע זהב קנדי אייקוני - טוהר גבוה ונזילות מצוינת.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Gold_Maple_Leaf_1oz_2015_obverse.png/640px-Gold_Maple_Leaf_1oz_2015_obverse.png",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1979",
                    text: "השקת Gold Maple Leaf."
                },
                {
                    title: "999.9",
                    text: "סטנדרט טוהר מהמובילים בעולם."
                }
            ]
        },
        en: {
            name: "Royal Canadian Mint",
            subtitle: "Canada",
            founded: "Founded 1908",
            location: "Ottawa / Winnipeg, Canada",
            website: "mint.ca",
            history: [
                {
                    title: "Gold Maple Leaf",
                    text: "One of the world’s purest and most recognized gold bullion coins."
                },
                {
                    title: "Security & purity",
                    text: "Canadian gold issues are known for advanced security and 999.9 fineness."
                }
            ],
            products: [
                {
                    title: "Gold Maple Leaf",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "1979-",
                    purity: "Gold 999.9",
                    desc: "Iconic Canadian gold bullion coin.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Gold_Maple_Leaf_1oz_2015_obverse.png/640px-Gold_Maple_Leaf_1oz_2015_obverse.png",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1979",
                    text: "Gold Maple Leaf launched."
                },
                {
                    title: "999.9",
                    text: "World-class purity standard."
                }
            ]
        },
        ru: {
            name: "Королевский монетный двор Канады",
            subtitle: "Royal Canadian Mint",
            founded: "Основан в 1908",
            location: "Оттава / Виннипег",
            website: "mint.ca",
            history: [
                {
                    title: "Maple Leaf",
                    text: "Одна из самых чистых и узнаваемых золотых монет мира."
                }
            ],
            products: [
                {
                    title: "Gold Maple Leaf",
                    type: "Монета",
                    weight: "1oz",
                    year: "1979-",
                    purity: "Золото 999.9",
                    desc: "Икона канадского инвестиционного золота.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Gold_Maple_Leaf_1oz_2015_obverse.png/640px-Gold_Maple_Leaf_1oz_2015_obverse.png",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1979",
                    text: "Запуск Gold Maple Leaf."
                }
            ]
        }
    },
    germany: {
        id: "germany",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Muenchen_Residenz_Brunnenhof.jpg/800px-Muenchen_Residenz_Brunnenhof.jpg",
        he: {
            name: "מינט בוואריה",
            subtitle: "Bayerisches Hauptmünzamt - מינכן",
            founded: "מסורת מאות שנים",
            location: "מינכן, גרמניה",
            website: "hauptmuenzamt.bayern.de",
            history: [
                {
                    title: "זהב גרמני ואיכות אירופית",
                    text: "המינט הבווארי מנפיק מטבעות זהב איכותיים - כולל הנפקות הנצחה והשקעה הנפוצות בשוק האירופי."
                },
                {
                    title: "חותמת D",
                    text: "מוצרים ממינכן נושאים את סימן המטבעה D - סימן הכרה בינלאומי."
                },
                {
                    title: "אמון משקיעים",
                    text: "גרמניה היא שוק זהב פיזי חזק; מוצרים ממינטים גרמניים נהנים ממוניטין של דיוק וגימור."
                }
            ],
            products: [
                {
                    title: "מטבעות זהב בוואריים",
                    type: "מטבע",
                    weight: "1oz / משקלים אירופיים",
                    year: "מודרני",
                    purity: "זהב 999-999.9",
                    desc: "הנפקות זהב ממינט מינכן - פופולריות בקרב משקיעים באירופה.",
                    img: "",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "מטילי זהב אירופיים",
                    type: "מטיל",
                    weight: "10g-100g / 1oz",
                    year: "מודרני",
                    purity: "זהב 999.9",
                    desc: "פורמטים נוחים להשקעה הדרגתית בזהב פיזי.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "חותמת D",
                    text: "סימן המטבעה של מינכן."
                },
                {
                    title: "שוק אירופי",
                    text: "ביקוש חזק לזהב פיזי בגרמניה."
                }
            ]
        },
        en: {
            name: "Bavarian State Mint",
            subtitle: "Bayerisches Hauptmünzamt - Munich",
            founded: "Centuries of minting",
            location: "Munich, Germany",
            website: "hauptmuenzamt.bayern.de",
            history: [
                {
                    title: "German gold quality",
                    text: "The Bavarian mint produces high-quality gold coins popular across Europe."
                },
                {
                    title: "Mintmark D",
                    text: "Munich issues carry the D mintmark - a trusted identifier."
                }
            ],
            products: [
                {
                    title: "Bavarian gold coins",
                    type: "Coin",
                    weight: "1oz / EU weights",
                    year: "Modern",
                    purity: "Gold 999-999.9",
                    desc: "Munich gold issues favored by European investors.",
                    img: "",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "European gold bars",
                    type: "Bar",
                    weight: "10g-100g / 1oz",
                    year: "Modern",
                    purity: "Gold 999.9",
                    desc: "Convenient formats for stacking physical gold.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "Mintmark D",
                    text: "Munich identifier."
                },
                {
                    title: "EU demand",
                    text: "Strong physical-gold market in Germany."
                }
            ]
        },
        ru: {
            name: "Баварский монетный двор",
            subtitle: "Bayerisches Hauptmünzamt - Мюнхен",
            founded: "Многовековая традиция",
            location: "Мюнхен, Германия",
            website: "hauptmuenzamt.bayern.de",
            history: [
                {
                    title: "Немецкое золото",
                    text: "Двор выпускает качественные золотые монеты для европейского рынка."
                }
            ],
            products: [
                {
                    title: "Баварские золотые монеты",
                    type: "Монета",
                    weight: "1oz",
                    year: "Современные",
                    purity: "Золото 999-999.9",
                    desc: "Выпуски Мюнхена популярны в Европе.",
                    img: "",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Европейские слитки",
                    type: "Слиток",
                    weight: "10g-100g",
                    year: "Современные",
                    purity: "Золото 999.9",
                    desc: "Удобные форматы для накопления.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "Клеймо D",
                    text: "Идентификатор Мюнхена."
                }
            ]
        }
    },
    perth: {
        id: "perth",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Perth_Mint_building.jpg/800px-Perth_Mint_building.jpg",
        he: {
            name: "מינט פרת׳",
            subtitle: "The Perth Mint - אוסטרליה",
            founded: "נוסד 1899",
            location: "פרת׳, אוסטרליה המערבית",
            website: "perthmint.com",
            history: [
                {
                    title: "זהב אוסטרלי",
                    text: "Perth Mint הוא מהשמות החזקים בעולם בזהב פיזי - Kangaroo, Lunar ועוד."
                },
                {
                    title: "ממשלתי ואמין",
                    text: "בבעלות מדינת אוסטרליה המערבית - מוניטין גבוה של אמינות ואספקה."
                },
                {
                    title: "עיצובים מתחלפים",
                    text: "סדרות שנתיות מושכות גם משקיעים וגם אספנים."
                }
            ],
            products: [
                {
                    title: "Australian Gold Kangaroo",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "1989-",
                    purity: "זהב 999.9",
                    desc: "מטבע זהב אוסטרלי מוביל עם עיצוב שנתי משתנה.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/2016_Australian_Gold_Kangaroo_1oz_Obverse.png/640px-2016_Australian_Gold_Kangaroo_1oz_Obverse.png",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Lunar Gold Series",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "1996-",
                    purity: "זהב 999.9",
                    desc: "סדרת הירח הסיני בזהב - ביקוש חזק באסיה ובעולם.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1899",
                    text: "הקמת Perth Mint."
                },
                {
                    title: "Kangaroo",
                    text: "דגלון הזהב האוסטרלי."
                }
            ]
        },
        en: {
            name: "The Perth Mint",
            subtitle: "Western Australia",
            founded: "Founded 1899",
            location: "Perth, Australia",
            website: "perthmint.com",
            history: [
                {
                    title: "Australian gold powerhouse",
                    text: "Home of the Gold Kangaroo and Lunar gold series."
                },
                {
                    title: "Government-backed",
                    text: "Owned by the State of Western Australia - strong trust and supply reputation."
                }
            ],
            products: [
                {
                    title: "Australian Gold Kangaroo",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "1989-",
                    purity: "Gold 999.9",
                    desc: "Flagship Australian gold bullion coin.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/2016_Australian_Gold_Kangaroo_1oz_Obverse.png/640px-2016_Australian_Gold_Kangaroo_1oz_Obverse.png",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Lunar Gold Series",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "1996-",
                    purity: "Gold 999.9",
                    desc: "Chinese lunar-themed gold series with strong Asian demand.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1899",
                    text: "Perth Mint founded."
                },
                {
                    title: "Kangaroo",
                    text: "Australia’s gold bullion flagship."
                }
            ]
        },
        ru: {
            name: "Монетный двор Перта",
            subtitle: "The Perth Mint - Австралия",
            founded: "Основан в 1899",
            location: "Перт, Австралия",
            website: "perthmint.com",
            history: [
                {
                    title: "Австралийское золото",
                    text: "Известен сериями Kangaroo и Lunar."
                }
            ],
            products: [
                {
                    title: "Gold Kangaroo",
                    type: "Монета",
                    weight: "1oz",
                    year: "1989-",
                    purity: "Золото 999.9",
                    desc: "Главная австралийская золотая монета.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/2016_Australian_Gold_Kangaroo_1oz_Obverse.png/640px-2016_Australian_Gold_Kangaroo_1oz_Obverse.png",
                    emoji: "",
                    transparent: true
                },
                {
                    title: "Lunar Gold",
                    type: "Монета",
                    weight: "1oz",
                    year: "1996-",
                    purity: "Золото 999.9",
                    desc: "Лунная серия с высоким спросом в Азии.",
                    img: "",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "Kangaroo",
                    text: "Флагман австралийского золота."
                }
            ]
        }
    },
    austria: {
        id: "austria",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Muenze_Oesterreich_Wien.jpg/800px-Muenze_Oesterreich_Wien.jpg",
        he: {
            name: "מינט וינה",
            subtitle: "Münze Österreich - אוסטריה",
            founded: "מסורת ארוכה",
            location: "וינה, אוסטריה",
            website: "muenzeoesterreich.at",
            history: [
                {
                    title: "Vienna Philharmonic זהב",
                    text: "מטבע הפילהרמונית הווינאית בזהב הוא מהנמכרים באירופה - עיצוב מוזיקלי ייחודי."
                },
                {
                    title: "טוהר ואיכות",
                    text: "מונפק בזהב 999.9 עם מוניטין אירופי חזק."
                },
                {
                    title: "נזילות באירופה",
                    text: "קל למכירה אצל דילרים באיחוד האירופי ובישראל."
                }
            ],
            products: [
                {
                    title: "Vienna Philharmonic Gold",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "1989-",
                    purity: "זהב 999.9",
                    desc: "מטבע הזהב האירופי האייקוני - נזיל ומבוקש.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Vienna_Philharmonic_coin_gold_obverse.jpg/640px-Vienna_Philharmonic_coin_gold_obverse.jpg",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1989",
                    text: "השקת Philharmonic זהב."
                },
                {
                    title: "999.9",
                    text: "טוהר אירופאי מוביל."
                }
            ]
        },
        en: {
            name: "Austrian Mint",
            subtitle: "Münze Österreich",
            founded: "Historic mint",
            location: "Vienna, Austria",
            website: "muenzeoesterreich.at",
            history: [
                {
                    title: "Vienna Philharmonic Gold",
                    text: "One of Europe’s best-selling gold bullion coins."
                },
                {
                    title: "Purity",
                    text: "Struck in 999.9 fine gold with strong EU liquidity."
                }
            ],
            products: [
                {
                    title: "Vienna Philharmonic Gold",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "1989-",
                    purity: "Gold 999.9",
                    desc: "Iconic European gold bullion coin.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Vienna_Philharmonic_coin_gold_obverse.jpg/640px-Vienna_Philharmonic_coin_gold_obverse.jpg",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1989",
                    text: "Gold Philharmonic launched."
                }
            ]
        },
        ru: {
            name: "Австрийский монетный двор",
            subtitle: "Münze Österreich",
            founded: "Исторический двор",
            location: "Вена, Австрия",
            website: "muenzeoesterreich.at",
            history: [
                {
                    title: "Vienna Philharmonic",
                    text: "Одна из самых продаваемых золотых монет Европы."
                }
            ],
            products: [
                {
                    title: "Philharmonic Gold",
                    type: "Монета",
                    weight: "1oz",
                    year: "1989-",
                    purity: "Золото 999.9",
                    desc: "Икона европейского инвестиционного золота.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Vienna_Philharmonic_coin_gold_obverse.jpg/640px-Vienna_Philharmonic_coin_gold_obverse.jpg",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1989",
                    text: "Запуск золотой Philharmonic."
                }
            ]
        }
    },
    mexico: {
        id: "mexico",
        flag: "",
        buildingImg: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Casa_de_Moneda_de_Mexico.jpg/800px-Casa_de_Moneda_de_Mexico.jpg",
        he: {
            name: "מינט מקסיקו",
            subtitle: "Casa de Moneda de México",
            founded: "נוסד 1535",
            location: "מקסיקו סיטי",
            website: "cmm.gob.mx",
            history: [
                {
                    title: "זהב מקסיקני",
                    text: "Casa de Moneda היא מהמטבעות הוותיקות באמריקה ומנפיקה את Libertad בזהב."
                },
                {
                    title: "Libertad זהב",
                    text: "מטבע ללא ערך נקוב רשמי בחלק מהשנים - מבוקש בקרב אספנים ומשקיעים."
                },
                {
                    title: "עיצוב ייחודי",
                    text: "המלאך המכונף הוא סמל מוכר של זהב מקסיקני."
                }
            ],
            products: [
                {
                    title: "Gold Libertad",
                    type: "מטבע",
                    weight: "1oz / חצאים",
                    year: "1981-",
                    purity: "זהב 999",
                    desc: "מטבע הזהב המקסיקני האייקוני - עיצוב ייחודי ונזילות טובה.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Mexican_Gold_Libertad_1oz_2015_obverse.png/640px-Mexican_Gold_Libertad_1oz_2015_obverse.png",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1535",
                    text: "מהמטבעות הוותיקות בעולם החדש."
                },
                {
                    title: "Libertad Gold",
                    text: "בוליון זהב מקסיקני מוכר."
                }
            ]
        },
        en: {
            name: "Mexican Mint",
            subtitle: "Casa de Moneda de México",
            founded: "Founded 1535",
            location: "Mexico City",
            website: "cmm.gob.mx",
            history: [
                {
                    title: "Mexican gold",
                    text: "One of the oldest mints in the Americas - issuer of the Gold Libertad."
                },
                {
                    title: "Distinctive design",
                    text: "The Winged Victory design is iconic among gold stackers."
                }
            ],
            products: [
                {
                    title: "Gold Libertad",
                    type: "Coin",
                    weight: "1oz / fractions",
                    year: "1981-",
                    purity: "Gold 999",
                    desc: "Mexico’s flagship gold bullion coin.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Mexican_Gold_Libertad_1oz_2015_obverse.png/640px-Mexican_Gold_Libertad_1oz_2015_obverse.png",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "1535",
                    text: "Among the oldest mints in the New World."
                },
                {
                    title: "Libertad Gold",
                    text: "Recognized Mexican gold bullion."
                }
            ]
        },
        ru: {
            name: "Монетный двор Мексики",
            subtitle: "Casa de Moneda de México",
            founded: "Основан в 1535",
            location: "Мехико",
            website: "cmm.gob.mx",
            history: [
                {
                    title: "Мексиканское золото",
                    text: "Эмитент золотой Libertad."
                }
            ],
            products: [
                {
                    title: "Gold Libertad",
                    type: "Монета",
                    weight: "1oz",
                    year: "1981-",
                    purity: "Золото 999",
                    desc: "Главная золотая монета Мексики.",
                    img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Mexican_Gold_Libertad_1oz_2015_obverse.png/640px-Mexican_Gold_Libertad_1oz_2015_obverse.png",
                    emoji: "",
                    transparent: true
                }
            ],
            records: [
                {
                    title: "Libertad Gold",
                    text: "Узнаваемый мексиканский буллион."
                }
            ]
        }
    }
};


// ── Museum state ──────────────────────────────────────────────────────
let _museumActiveMint = null;
let _museumActiveLang = 'he';

function _mintImgFallback(el, emoji) {
    el.outerHTML = `<div class="mint-product-img-placeholder">${emoji}</div>`;
}

function renderMintDetail(mintId, lang) {
    _museumActiveMint = mintId;
    _museumActiveLang = lang || _museumActiveLang;

    const mint = MINT_DATA[mintId];
    if (!mint) return;
    const d = mint[_museumActiveLang] || mint.he;

    // Update title bar
    const titleEl = document.getElementById('mint-detail-title');
    if (titleEl) titleEl.textContent = `${mint.flag} ${d.name}`;

    // Update lang tabs - scope to mint-detail-screen only to avoid bleeding into guide tabs
    document.querySelectorAll('#mint-detail-screen .mint-lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === _museumActiveLang);
    });

    // Determine page direction
    const isRtl = _museumActiveLang === 'he';
    const detailWrap = document.getElementById('mint-detail-screen');
    if (detailWrap) {
        detailWrap.dir = isRtl ? 'rtl' : 'ltr';
        detailWrap.style.textAlign = isRtl ? 'right' : 'left';
    }

    // Products HTML - only user-uploaded Supabase images
    const uploadedProducts = getUploadedMintProducts(d.products);
    const productsHtml = uploadedProducts.map(p => `
        <div class="mint-product-card">
            <div class="mint-product-img-wrap${p.transparent ? ' mint-product-img-wrap--transparent' : ''}">
                <img class="mint-product-img${p.transparent ? ' mint-product-img--transparent' : ''}"
                     src="${escapeHtml(p.img)}"
                     alt="${escapeHtml(p.title)}"
                     loading="lazy"
                     onerror="this.outerHTML='<div class=\\'mint-product-img-placeholder\\'>${p.emoji}</div>'">
            </div>
            <div class="mint-product-info">
                <p class="mint-product-title">${escapeHtml(p.title)}</p>
                <p class="mint-product-desc">${escapeHtml(formatProductDesc(p))}</p>
            </div>
        </div>
    `).join('');

    // History HTML
    const historyHtml = d.history.map(h => `
        <div class="mint-history-item">
            <h4>${escapeHtml(h.title)}</h4>
            <p>${escapeHtml(h.text)}</p>
        </div>
    `).join('');

    // Records / highlights HTML
    const recordsHtml = (d.records || []).map(r => `
        <div class="mint-record-item">
            <span class="mint-record-icon" aria-hidden="true"></span>
            <div class="mint-record-body">
                <h4>${escapeHtml(r.title)}</h4>
                <p>${escapeHtml(r.text)}</p>
            </div>
        </div>
    `).join('');

    // Products section label by lang
    const labels = {
        he: { history: ' היסטוריה', records: ' שיאים ועובדות', products: ' מוצרי זהב', purity: 'טוהר', more: 'אתר רשמי' },
        en: { history: ' History', records: ' Records & Highlights', products: ' Gold Products', purity: 'Purity', more: 'Official Website' },
        ru: { history: ' История', records: ' Рекорды и факты', products: ' Серебряные изделия', purity: 'Проба', more: 'Официальный сайт' }
    };
    const L = labels[_museumActiveLang] || labels.he;

    const content = document.getElementById('mint-detail-content');
    if (!content) return;
    content.innerHTML = `
        <div class="mint-hero">
            <div class="mint-hero-body">
                <h1 class="mint-hero-name">${escapeHtml(d.name)}</h1>
                <p class="mint-hero-subtitle">${escapeHtml(d.subtitle)}</p>
                <div class="mint-meta-row">
                    <span class="mint-meta-chip"> ${escapeHtml(d.founded)}</span>
                    <span class="mint-meta-chip"> ${escapeHtml(d.location)}</span>
                </div>
            </div>
        </div>

        <section class="mint-section">
            <h3 class="mint-section-title">${L.history}</h3>
            <div class="mint-history-block">${historyHtml}</div>
        </section>

        ${recordsHtml ? `
        <section class="mint-section">
            <h3 class="mint-section-title">${L.records}</h3>
            <div class="mint-records-block">${recordsHtml}</div>
        </section>
        ` : ''}

        ${uploadedProducts.length ? `
        <section class="mint-section">
            <h3 class="mint-section-title">${L.products}</h3>
            <div class="mint-products-grid">${productsHtml}</div>
        </section>
        ` : ''}

        <a class="mint-website-link" href="${escapeHtml(mintWebsiteHref(d.website))}" target="_blank" rel="noopener noreferrer">
            ${L.more}: ${escapeHtml(mintWebsiteLabel(d.website))}
        </a>
    `;
}

function openMuseumMint(mintId) {
    if (!MINT_DATA[mintId]) return;
    renderMintDetail(mintId, _museumActiveLang);
    goToScreen('mint-detail-screen');
}

function initMuseum() {
    document.querySelectorAll('.mint-hub-card').forEach(btn => {
        btn.style.display = '';
        btn.onclick = () => openMuseumMint(btn.dataset.mint);
    });

    // Language tabs on mint-detail-screen only
    document.querySelectorAll('#mint-detail-screen .mint-lang-btn').forEach(btn => {
        btn.onclick = () => {
            if (_museumActiveMint) renderMintDetail(_museumActiveMint, btn.dataset.lang);
        };
    });

    // Back from museum hub → dashboard
    document.getElementById('back-museum')?.addEventListener('click', () => {
        goBack();
    });

    // Back from mint detail → museum hub
    document.getElementById('back-mint-detail')?.addEventListener('click', () => {
        goBack();
    });
}

// ── GOLD GUIDE ───────────────────────────────────────────────────────
const GUIDE_DATA = {
    he: {
        dir: 'rtl',
        chapters: [
            {
                icon: "",
                title: "למה זהב? הסיבות המרכזיות",
                content: `<p>זהב הוא אחד מנכסי השמירה הוותיקים בהיסטוריה. הנה למה:</p><ul><li><strong>ללא מע"מ בישראל</strong> - זהב השקעה פטור ממע"מ, בניגוד לכסף.</li><li><strong>נזילות גבוהה</strong> - ניתן למכור כמעט בכל מקום בעולם.</li><li><strong>גידור אינפלציה</strong> - שמר ערך לאורך אלפי שנים.</li><li><strong>ללא סיכון צד שלישי</strong> - זהב פיזי אינו תלוי בחברה כלשהי.</li><li><strong>ביקוש עולמי יציב</strong> - תכשיטים, טכנולוגיה, בנקים מרכזיים.</li></ul><p>עבור משקיע ישראלי, היתרון הגדול הוא <strong>פטור ממע"מ</strong> - זה כבר 17% יתרון מהיום הראשון.</p>`
            },
            {
                icon: "",
                title: "מה לקנות: מטבע או מטיל?",
                content: `<p>השאלה הנפוצה ביותר אצל משקיעים חדשים:</p><ul><li><strong>מטיל (Bar)</strong> - פרמיה נמוכה יותר, עדיף לכמויות גדולות. מתאים למי שרוצה מקסימום מתכת על כל שקל.</li><li><strong>מטבע (Coin)</strong> - פרמיה גבוהה יותר, אבל ביקוש גבוה יותר גם ממשקיעים אחרים. קל יותר למכור ביחידות קטנות.</li></ul><p><strong>המלצה כללית:</strong> אם מטרתך השקעה טהורה - לך על מטילים. אם אוהב את הרגשת המטבע - קרוגרנד, מייפל ליף וויניאי הם בחירות מעולות.</p><div class='guide-tip-box'><strong>טיפ:</strong> מטבעות 22K כמו קרוגרנד קשים יותר ועמידים לשריטות - יתרון לאחסון ארוך טווח.</div>`
            },
            {
                icon: "",
                title: "מטבעות הזהב הגדולים: מדריך קצר",
                content: `<p>המטבעות הנפוצים בישראל ובעולם:</p><ul><li><strong>קרוגרנד (Krugerrand)</strong> - דרום אפריקה, 22K (91.67%), 1oz. אחד המוכרים ביותר.</li><li><strong>Maple Leaf</strong> - קנדה, 24K (99.99%), 1oz. טוהרות הגבוהה ביותר בין מטבעות הגדולים.</li><li><strong>Vienna Philharmonic</strong> - אוסטריה, 24K, 1oz. הנמכר ביותר באירופה.</li><li><strong>American Gold Eagle</strong> - ארה"ב, 22K, 1oz. אחד האמינים ביותר.</li><li><strong>Australian Kangaroo</strong> - אוסטרליה, 24K, עיצוב שנתי משתנה.</li><li><strong>Britannia</strong> - בריטניה, 24K, 1oz.</li></ul><p>כל המטבעות האלו מוכרים בינלאומית ונזילים מאוד.</p>`
            },
            {
                icon: "",
                title: "קניית זהב בישראל - כל מה שצריך לדעת",
                content: `<p>מדריך ספציפי לשוק הישראלי:</p><ul><li><strong>פטור ממע"מ</strong> - זהב השקעה (מטבעות ומטילים מוכרים) פטור ממע"מ לפי חוק. זו זכות - לא מתנה מהממשלה.</li><li><strong>מס רווח הון</strong> - ~25% על רווח ממכירה (חינוכי; היוועץ ברואה חשבון).</li><li><strong>יבוא</strong> - ייבוא אישי עד €10,000 ללא הצהרה מיוחדת. מעל זה - צריך להצהיר.</li><li><strong>איפה לקנות</strong> - מוכרים מוסמכים, בתי שוהם, ודילרים מוכרים. הכי בטוח - מקום עם ניירת.</li><li><strong>אחסון</strong> - כספת ביתית, כספת בנק, או שירות אחסון מאובטח.</li></ul><div class='guide-warn-box'><strong>שים לב:</strong> קניית זהב ב"שוק שחור" ללא קבלה - סיכון לזיוף ובעיות מס עתידיות. תמיד קנה ממקור רשמי עם ניירת.</div>`
            },
            {
                icon: "",
                title: "GSR - יחס זהב-כסף כאינדיקטור",
                content: `<p>GSR (Gold-Silver Ratio) מציין כמה אונקיות כסף שוות לאונקיית זהב:</p><ul><li><strong>GSR גבוה (80+)</strong> - זהב יקר ביחס לכסף; לכסף יש פוטנציאל להצמיח יותר %-טית.</li><li><strong>GSR נמוך (מתחת ל-50)</strong> - זהב זול ביחס לכסף; לזהב פוטנציאל גבוה יחסית.</li><li>HSR ההיסטורי: בין 15:1 ל-100:1 לאורך ההיסטוריה.</li></ul><p>זה <strong>לא אינדיקטור מדויק</strong> - אלא כלי חינוכי לראות תמחור יחסי. לא להסתמך עליו לבדו.</p><div class='guide-tip-box'><strong>כיצד להשתמש:</strong> כש-GSR גבוה מאוד - שקול לנסות לצבור יותר כסף; כש-GSR נמוך מאוד - זהב נראה זול יחסית.</div>`
            },
            {
                icon: "",
                title: "אחסון זהב - אפשרויות ושיקולים",
                content: `<p>אחסון הוא אחד הנושאים החשובים ביותר לכל מחזיק זהב פיזי:</p><ul><li><strong>כספת ביתית</strong> - זמינה, פרטית, אבל דורשת כספת איכותית ומקום בטוח.</li><li><strong>כספת בנק</strong> - בטוחה, אבל יש עלויות שנתיות ופחות גישה מיידית.</li><li><strong>שירות אחסון מקצועי</strong> (Vault) - עלות שנתית בד"כ 0.1-0.5% מהשווי, ביטוח כולל.</li></ul><div class='guide-warn-box'><strong>אל תשמור כמויות גדולות בבית ללא כספת איכותית ובלי ביטוח ייעודי. גניבה של מטבעות ומטילים קשה מאוד לשחזר.</strong></div><p>בחירה סבירה: עד כמה עשרות אונקיות - כספת ביתית טובה. כמויות גדולות יותר - שירות אחסון מקצועי.</p>`
            },
            {
                icon: "",
                title: "זהב מול כסף - מה ההבדל להשקעה?",
                content: `<p>שני המתכות הן 'נכסים קשים' אבל שונות בכמה נקודות מרכזיות:</p><ul><li><strong>מע"מ</strong> - זהב פטור, כסף חייב (יתרון ברור לזהב בישראל).</li><li><strong>תנודתיות</strong> - כסף תנודתי יותר מזהב; עולה חזק יותר בשוורי, יורד חזק יותר בדובי.</li><li><strong>ביקוש תעשייתי</strong> - לכסף יש ביקוש תעשייתי גבוה יותר (אלקטרוניקה, סולאר).</li><li><strong>נגישות</strong> - כסף זול יותר לאונקיה, קל יותר להתחיל.</li><li><strong>GSR</strong> - כשהיחס גבוה, כסף זול יחסית לזהב.</li></ul><p>אסטרטגיה פופולרית: <strong>שניהם</strong> - חלק זהב כעוגן יציב, חלק כסף כ"מנוף" עם פוטנציאל גבוה יותר.</p>`
            },
        ]
    },
    en: {
        dir: 'ltr',
        chapters: [
            {
                icon: "",
                title: "Why Gold? The Core Case",
                content: `<p>Gold is one of the oldest wealth preservation assets in history:</p><ul><li><strong>No VAT in Israel</strong> - investment gold is VAT-exempt, unlike silver.</li><li><strong>High liquidity</strong> - can be sold almost anywhere in the world.</li><li><strong>Inflation hedge</strong> - preserved value for thousands of years.</li><li><strong>No counterparty risk</strong> - physical gold doesn't depend on any company.</li><li><strong>Stable global demand</strong> - jewelry, technology, central banks.</li></ul>`
            },
            {
                icon: "",
                title: "Bar vs Coin: What to Buy?",
                content: `<p>The most common question for new gold investors:</p><ul><li><strong>Bars</strong> - lower premium, better for large quantities. Maximum metal per dollar.</li><li><strong>Coins</strong> - higher premium but also higher demand from other investors. Easier to sell in small quantities.</li></ul><p><strong>General advice:</strong> Pure investment? Go for bars. Love the collectible feel? Krugerrand, Maple Leaf, or Philharmonics are excellent choices.</p>`
            },
            {
                icon: "",
                title: "Major Gold Coins: Quick Guide",
                content: `<p>The most popular gold coins globally:</p><ul><li><strong>Krugerrand</strong> - South Africa, 22K, 1oz. One of the most recognized worldwide.</li><li><strong>Maple Leaf</strong> - Canada, 24K (99.99%), 1oz. Highest purity among major coins.</li><li><strong>Vienna Philharmonic</strong> - Austria, 24K, 1oz. Best-selling in Europe.</li><li><strong>American Gold Eagle</strong> - USA, 22K, 1oz.</li><li><strong>Australian Kangaroo</strong> - Australia, 24K, annual design.</li></ul>`
            },
            {
                icon: "",
                title: "Buying Gold in Israel - Everything You Need",
                content: `<p>Israel-specific guide:</p><ul><li><strong>VAT Exempt</strong> - Investment gold is exempt from VAT under Israeli law.</li><li><strong>Capital Gains Tax</strong> - ~25% on realized profit (educational; consult an accountant).</li><li><strong>Import</strong> - Personal imports up to €10,000 require no special declaration.</li><li><strong>Where to Buy</strong> - Authorized dealers, jewelry stores, recognized dealers with proper paperwork.</li><li><strong>Storage</strong> - Home safe, bank safe deposit box, or professional secured storage.</li></ul>`
            },
            {
                icon: "",
                title: "GSR - Gold-to-Silver Ratio as an Indicator",
                content: `<p>The GSR shows how many ounces of silver equal one ounce of gold:</p><ul><li><strong>High GSR (80+)</strong> - gold is expensive relative to silver.</li><li><strong>Low GSR (below 50)</strong> - gold is cheap relative to silver.</li></ul><p>This is an <strong>educational tool</strong>, not a precise signal. Don't rely on it alone.</p>`
            },
            {
                icon: "",
                title: "Gold Storage - Options & Considerations",
                content: `<p>Storage is one of the most critical aspects of physical gold ownership:</p><ul><li><strong>Home Safe</strong> - immediate access, private, but requires quality safe and secure location.</li><li><strong>Bank Safe Deposit Box</strong> - secure, annual fee, limited access hours.</li><li><strong>Professional Vault</strong> - typically 0.1-0.5% annual fee, insurance included.</li></ul>`
            },
            {
                icon: "",
                title: "Gold vs Silver - Investment Comparison",
                content: `<p>Both are 'hard assets' but differ in key areas:</p><ul><li><strong>VAT</strong> - Gold is exempt; silver is taxed (clear advantage for gold in Israel).</li><li><strong>Volatility</strong> - Silver is more volatile; rises harder in bull markets, falls harder in bear.</li><li><strong>Industrial demand</strong> - Silver has higher industrial demand (electronics, solar).</li><li><strong>Accessibility</strong> - Silver is cheaper per ounce, easier entry point.</li></ul>`
            },
        ]
    },
    ru: {
        dir: 'ltr',
        chapters: [
            {
                icon: "",
                title: "Почему золото? Основные причины",
                content: `<p>Золото - один из старейших активов сохранения капитала:</p><ul><li><strong>Без НДС в Израиле</strong> - инвестиционное золото освобождено от НДС.</li><li><strong>Высокая ликвидность</strong> - можно продать почти в любой точке мира.</li><li><strong>Защита от инфляции</strong> - сохраняло ценность тысячелетиями.</li></ul>`
            },
            {
                icon: "",
                title: "Слитки vs Монеты: что выбрать?",
                content: `<p><ul><li><strong>Слитки</strong> - меньшая наценка, лучше для больших объёмов.</li><li><strong>Монеты</strong> - выше наценка, но и легче продать поштучно.</li></ul></p>`
            },
            {
                icon: "",
                title: "Главные золотые монеты: краткий справочник",
                content: `<p><ul><li><strong>Крюгерранд</strong> - ЮАР, 22K.</li><li><strong>Кленовый лист</strong> - Канада, 24K (99.99%).</li><li><strong>Венская Филармония</strong> - Австрия, 24K.</li><li><strong>Gold Eagle</strong> - США, 22K.</li></ul></p>`
            },
            {
                icon: "",
                title: "Покупка золота в Израиле - всё необходимое",
                content: `<p><ul><li><strong>Освобождение от НДС</strong> - инвестиционное золото освобождено от НДС.</li><li><strong>Налог на прирост капитала</strong> - ~25% от прибыли при продаже.</li><li><strong>Импорт</strong> - до €10,000 без специальной декларации.</li></ul></p>`
            },
            {
                icon: "",
                title: "GSR - соотношение золота к серебру",
                content: `<p>GSR показывает, сколько унций серебра равны одной унции золота. Высокий GSR (80+) - золото дорого относительно серебра. Низкий GSR (ниже 50) - золото дёшево относительно серебра.</p>`
            },
            {
                icon: "",
                title: "Хранение золота - варианты и соображения",
                content: `<p><ul><li><strong>Домашний сейф</strong> - мгновенный доступ, требует качественного сейфа.</li><li><strong>Банковская ячейка</strong> - безопасно, ежегодная плата.</li><li><strong>Профессиональный хранилище</strong> - 0.1-0.5% в год, обычно включает страховку.</li></ul></p>`
            },
            {
                icon: "",
                title: "Золото против серебра - инвестиционное сравнение",
                content: `<p><ul><li><strong>НДС</strong> - золото освобождено, серебро облагается (преимущество золота).</li><li><strong>Волатильность</strong> - серебро более волатильно.</li><li><strong>Промышленный спрос</strong> - у серебра выше.</li></ul></p>`
            },
        ]
    },
};

let _guideActiveLang = 'he';

// Admin-managed guide chapters (fetched once from the content API, then cached).
// Store-first: when present, these REPLACE the built-in gold GUIDE_DATA so guides are
// managed entirely in the admin panel - never hardcoded. Built-in is fallback only.
let _adminGuides = null;

// Generic content fetch for any collection (mine-guides|quiz|mints|links).
async function _fetchContent(type) {
    try {
        const res = await fetch(`${CONFIG.CHAT_API_URL}/api/content?type=${encodeURIComponent(type)}`);
        const data = await res.json();
        return (data && data.success && Array.isArray(data.items)) ? data.items : [];
    } catch {
        return [];
    }
}

async function _fetchAdminGuides() {
    if (_adminGuides !== null) return _adminGuides;
    _adminGuides = await _fetchContent('mine-guides');
    return _adminGuides;
}

// ── Store-first QUIZ + MUSEUM ──────────────────────────────────────────
// When the admin store has items, they REPLACE the built-in data in place, so
// existing render logic is untouched. Built-in stays as the offline fallback.
let _storeContentLoaded = false;
async function _loadStoreContent() {
    if (_storeContentLoaded) return;
    _storeContentLoaded = true;
    try {
        const [quiz, mints] = await Promise.all([_fetchContent('mine-quiz'), _fetchContent('mine-mints')]);
        // Quiz: store items shaped {q, a:[4], correct}. Built-in QUIZ_BANK expects a[0]=correct.
        if (Array.isArray(quiz) && quiz.length) {
            const mapped = quiz.map(it => {
                const a = Array.isArray(it.a) ? it.a.slice(0, 4) : [];
                const c = Math.max(0, Math.min(3, Number(it.correct) || 0));
                if (a.length < 2) return null;
                return { q: String(it.q || ''), a: [a[c], ...a.filter((_, i) => i !== c)] };
            }).filter(x => x && x.q);
            if (mapped.length && typeof QUIZ_BANK !== 'undefined') {
                QUIZ_BANK.length = 0; QUIZ_BANK.push(...mapped);
            }
        }
        // Museum: store items are full mint objects keyed by id.
        if (Array.isArray(mints) && mints.length && typeof MINT_DATA !== 'undefined') {
            Object.keys(MINT_DATA).forEach(k => delete MINT_DATA[k]);
            mints.sort((x, y) => (x.order || 100) - (y.order || 100))
                 .forEach(m => { if (m && m.id) MINT_DATA[m.id] = m; });
        }
    } catch (e) {
        console.warn('store content load failed (using built-in):', e);
    }
}

function renderGuide(lang) {
    _guideActiveLang = lang;
    const data = GUIDE_DATA[lang] || GUIDE_DATA.he;
    const container = document.getElementById('guide-content');
    if (!container) return;

    container.dir = data.dir;

    // Update lang buttons
    document.querySelectorAll('.guide-lang-bar .mint-lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
    });

    // Store-first: once the admin content store has guides, it is the single
    // source of truth (hardcode-free). The built-in GUIDE_DATA is used ONLY as
    // an offline fallback when the store is empty or unreachable.
    const admin = (_adminGuides || []).slice().sort((a, b) => (a.order || 100) - (b.order || 100));
    let chapters = admin.map(it => {
        const block = it[lang] || it.he || {};
        return { icon: it.icon || '', title: block.title || '', content: block.content || '' };
    }).filter(ch => ch.title || ch.content);

    if (chapters.length === 0) {
        // Fallback only - no managed content yet.
        chapters = data.chapters.slice();
    }

    container.innerHTML = chapters.map((ch, i) => `
        <div class="guide-chapter" id="guide-ch-${i}">
            <button class="guide-chapter-header" onclick="toggleGuideChapter(${i})">
                <span class="guide-chapter-icon">${ch.icon}</span>
                <span class="guide-chapter-title">${ch.title}</span>
                <span class="guide-chapter-arrow" aria-hidden="true"></span>
            </button>
            <div class="guide-chapter-body">${ch.content}</div>
        </div>
    `).join('');
}

function toggleGuideChapter(idx) {
    const ch = document.getElementById(`guide-ch-${idx}`);
    if (!ch) return;
    ch.classList.toggle('open');
}

function initGuide() {
    // Language tabs
    document.querySelectorAll('.guide-lang-bar .mint-lang-btn').forEach(btn => {
        btn.onclick = () => renderGuide(btn.dataset.lang);
    });

    // Back button
    document.getElementById('back-guide')?.addEventListener('click', () => goBack());

    // Render default now, then re-render once admin-managed chapters are fetched.
    renderGuide('he');
    _fetchAdminGuides().then(() => renderGuide(_guideActiveLang || 'he'));
}

// ── INIT DASHBOARD ────────────────────────────────────────────────────
function initDashboard() {
    if (dashboardInited) return;
    dashboardInited = true;

    updateGoldPrice();
    setInterval(updateGoldPrice, 30 * 60 * 1000);

    document.getElementById('price-strip-btn')?.addEventListener('click', openDailyLineChart);

    loadPnl();
    renderPnl();

    // ── Main menu navigation ──
    document.querySelectorAll('.icon-btn[data-target], .main-switch-btn[data-target]').forEach(b => {
        b.onclick = () => goToScreen(`${b.dataset.target}-screen`);
    });

    // ── Back buttons ──
    ['personal', 'homework', 'updates', 'charts', 'guide'].forEach(name => {
        const btn = document.getElementById(`back-${name}`);
        if (btn) btn.onclick = () => {
            if (name === 'homework') {
                if (_hwSubViewOpen()) {
                    quizReset();
                    return;
                }
                quizReset();
            }
            goBack();
        };
    });

    initQuiz();
    initNewsLangToggle();
    initMuseum();
    initGuide();

    // ── Personal area sub-navigation ──
    document.getElementById('dark-mode-btn')?.addEventListener('click', toggleDarkMode);
    document.getElementById('pnl-open-btn')?.addEventListener('click', () => goToScreen('pnl-screen'));
    document.getElementById('back-pnl')?.addEventListener('click', () => goBack());

    // ── P&L form (async - auto-fetches FX rate) ──
    document.getElementById('pnl-form').onsubmit = async (e) => {
        e.preventDefault();
        const date  = document.getElementById('tx-date').value;
        const note  = document.getElementById('tx-note').value.trim();
        const cost  = Number(document.getElementById('tx-amount-ils').value || 0);
        const buy   = Number(document.getElementById('tx-buy-price').value || 0);
        if (!date || cost <= 0 || buy <= 0) return;

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        const fxStatus = document.getElementById('fx-status');
        if (fxStatus) {
            fxStatus.textContent = ' מחפש שער דולר לתאריך...';
            fxStatus.className   = 'fx-status fx-loading';
        }

        const fx = await fetchFxRate(date);

        if (fxStatus) {
            fxStatus.textContent = ` שער דולר לתאריך ${date}: ₪${fx.toFixed(4)}`;
            fxStatus.className   = 'fx-status fx-ok';
            setTimeout(() => { fxStatus.textContent = ''; fxStatus.className = 'fx-status'; }, 6000);
        }

        pnlRows.unshift({
            id: `${Date.now()}${Math.random()}`,
            date, note, cost, buy, fx
        });
        savePnl();
        renderPnl();
        e.target.reset();
        if (submitBtn) submitBtn.disabled = false;
    };

    // ── Delete row ──
    document.getElementById('pnl-table-body').onclick = (e) => {
        const btn = e.target.closest('.row-delete-btn');
        if (!btn) return;
        pnlRows = pnlRows.filter(r => String(r.id) !== String(btn.dataset.id));
        savePnl();
        renderPnl();
    };

    // ── Chart type toggle ──
    document.querySelectorAll('.chart-type-btn').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.chart-type-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            activeChartType = b.dataset.chartType;
            // Invalidate cache so chart regenerates with fresh data
            Object.keys(chartCache).forEach(k => delete chartCache[k]);

            if (activeChartType === 'candles') {
                document.getElementById('candles-container').style.display = '';
                document.getElementById('line-container').style.display    = 'none';
                if (lineChart) { lineChart.destroy(); lineChart = null; }
                requestAnimationFrame(() => renderCandleChart(activeFrame));
            } else {
                document.getElementById('candles-container').style.display = 'none';
                document.getElementById('line-container').style.display    = '';
                requestAnimationFrame(() => renderLineChart(activeFrame));
            }
        };
    });

    // ── Chart time buttons ──
    document.querySelectorAll('.chart-time-btn').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.chart-time-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            activeFrame = b.dataset.timeframe;
            renderActiveChart();
        };
    });

    window.onresize = () => {
        if (document.getElementById('charts-screen')?.classList.contains('active')) {
            if (activeChartType === 'candles') renderCandleChart(activeFrame);
        }
    };

    // ── Mr. D modal ──
    const modal = document.getElementById('mr-d-modal');
    document.getElementById('mr-d-fab').onclick = () => {
        modal.style.display     = 'flex';
        document.body.style.overflow = 'hidden';
    };
    document.getElementById('mr-d-close').onclick = () => {
        modal.style.display     = 'none';
        document.body.style.overflow = '';
    };
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display     = 'none';
            document.body.style.overflow = '';
        }
    };

    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('chat-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendMessage();
    });

    // ── AI disclaimer ──
    document.getElementById('accept-disclaimer-btn')?.addEventListener('click', () => {
        document.getElementById('ai-disclaimer-modal').style.display = 'none';
    });
}


// ── SWIPE-BACK GESTURE ────────────────────────────────────────────────
// Right-to-left swipe anywhere on screen navigates back (RTL-natural)
function initSwipeBack() {
    let _sx = 0, _sy = 0;

    document.addEventListener('touchstart', e => {
        _sx = e.touches[0].clientX;
        _sy = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        const dx = _sx - e.changedTouches[0].clientX;   // positive = moved left
        const dy = Math.abs(_sy - e.changedTouches[0].clientY);
        if (dx < 80 || dy > 55) return;                 // too short or too diagonal

        const active = document.querySelector('.screen.active');
        if (!active) return;
        switch (active.id) {
            case 'pnl-screen':          goBack(); break;
            case 'homework-screen': {
                if (_hwSubViewOpen()) { quizReset(); }
                else { quizReset(); goBack(); }
                break;
            }
            case 'museum-screen':       goBack();                      break;
            case 'mint-detail-screen':  goBack();                      break;
            case 'guide-screen':        goBack();                      break;
            case 'personal-screen':
            case 'updates-screen':
            case 'charts-screen':       goBack();                      break;
        }
    }, { passive: true });
}

// ── BOOT ──────────────────────────────────────────────────────────────
function boot() {
    // Fallback for Telegram < 8.0: set safe-area CSS var from the JS API
    const _tgSafeTop = tg?.contentSafeAreaInset?.top ?? tg?.safeAreaInset?.top ?? 0;
    if (_tgSafeTop > 0) {
        document.documentElement.style.setProperty(
            '--tg-content-safe-area-inset-top', _tgSafeTop + 'px'
        );
    }
    applyDarkMode(localStorage.getItem(DARK_MODE_KEY) === '1');
    initSwipeBack();
    initDevPreview();
    _loadStoreContent();   // pull store-managed quiz/museum (built-in stays as fallback)

    // Only hub login - mine never shows its own passcode screen
    if (sessionToken()) {
        showDashboard();
    } else {
        location.replace('../hub.html');
    }
}

function initDevPreview() {
    if (!isLocalDevHost()) return;

    document.body.classList.add('dev-mode');
    const banner = document.createElement('div');
    banner.className = 'dev-preview-banner';
    banner.innerHTML = `
        <span class="dev-preview-label"> מצב פיתוח מקומי</span>
        <span class="dev-preview-note">השינויים כאן לא על האתר החי - רענון אוטומטי אחרי שמירה</span>
        <button type="button" class="dev-preview-reload" onclick="location.reload()">רענון</button>
    `;
    document.body.prepend(banner);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
