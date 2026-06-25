// ═══════════════════════════════════════════
// THE SILVER VAULT — App v3
// ═══════════════════════════════════════════

let tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// Block long-press context menu on all images and buttons
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart',   e => e.preventDefault());

const SESSION_KEY    = 'vault_session';
const SESSION_DURATION = 3 * 60 * 60 * 1000;
const PNL_KEY        = 'vault_pnl_entries_v1';
const DARK_MODE_KEY  = 'vault_dark_mode';
const DEFAULT_FX     = 3.65;

let silverPrice   = 32;
let currentFx     = 3.65;        // today's USD→ILS rate, fetched on startup
let pnlRows       = [];
const chartCache  = {};          // { frame: [{open,close,high,low,ts}, …] }
let activeFrame   = '1d';
let activeChartType = 'candles'; // 'candles' | 'line'
let lineChart     = null;
let dashboardInited = false;

// User id: prefer Telegram identity; otherwise a stable per-browser id (persisted),
// so standalone web-app users keep one continuous Mr. D session across reloads.
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
// live site (isLocalDevHost is false there) — no secret is exposed in public code.
const DEV_PREVIEW_TOKEN = 'local-dev-preview-token';

function isLocalDevHost() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
}

// ── SESSION ─────────────────────────────────────────────────────────
function sessionToken() {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (!s?.loggedIn) return null;
        if (Date.now() - s.timestamp > SESSION_DURATION) return null;
        return s.token || null;
    } catch { return null; }
}

function saveSession(token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        loggedIn: true, timestamp: Date.now(), token
    }));
}

// ── SCREEN NAVIGATION ────────────────────────────────────────────────
function goToScreen(screenId) {
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
}

function goBack() {
    goToScreen('dashboard-screen');
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
    // Restart opacity flash via rAF — avoids synchronous forced reflow
    document.body.classList.remove('dark-mode-animating');
    requestAnimationFrame(() => document.body.classList.add('dark-mode-animating'));
    const icon  = document.getElementById('dark-mode-icon');
    const label = document.getElementById('dark-mode-label');
    if (icon)  icon.textContent  = dark ? '☀️' : '🌙';
    if (label) label.textContent = dark ? 'חזרה למצב יום' : 'מצב לילה';
}

function toggleDarkMode() {
    const dark = !document.body.classList.contains('dark-mode');
    localStorage.setItem(DARK_MODE_KEY, dark ? '1' : '0');
    // setTimeout(0) yields to the macro-task queue — click event fully
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
    const pass = document.getElementById('passcode')?.value.trim();
    if (!pass) return;
    const msg = document.getElementById('error-msg');
    const btn = document.getElementById('login-btn');
    if (msg) { msg.textContent = 'מתחבר...'; msg.style.color = '#888'; }
    if (btn)  btn.disabled = true;
    try {
        if (isLocalDevHost()) {
            saveSession(DEV_PREVIEW_TOKEN);
            if (msg) { msg.textContent = 'גישה אושרה ✓ (מצב פיתוח)'; msg.style.color = '#4AB882'; }
            setTimeout(() => showDashboard(), 300);
            return;
        }
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: pass }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'קוד שגוי');
        saveSession(data.token);
        if (msg) { msg.textContent = 'גישה אושרה ✓'; msg.style.color = '#4AB882'; }
        setTimeout(() => showDashboard(), 500);
    } catch (e) {
        if (msg) { msg.textContent = (e.message && !e.message.includes('fetch')) ? e.message + ' ✗' : 'שגיאת חיבור ✗'; msg.style.color = '#C04040'; }
        document.getElementById('passcode').value = '';
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function validateTokenWithServer(token) {
    if (isLocalDevHost() && token === DEV_PREVIEW_TOKEN) return true;
    try {
        const res = await fetch(`${CONFIG.CHAT_API_URL}/api/auth-check`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return res.status !== 401;
    } catch {
        return true; // network error — don't kick user out
    }
}

async function showDashboard() {
    const token = sessionToken();
    if (token) {
        const valid = await validateTokenWithServer(token);
        if (!valid) {
            localStorage.removeItem(SESSION_KEY);
            // Token was invalidated (server restart) — go back to login
            goToScreen('login-screen');
            const msg = document.getElementById('error-msg');
            if (msg) { msg.textContent = 'החיבור פג — יש להתחבר שוב.'; msg.style.color = '#C04040'; }
            return;
        }
    }
    goToScreen('dashboard-screen');
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

// ── SILVER PRICE + CURRENT FX ────────────────────────────────────────
async function updateSilverPrice() {
    let priceOk = false;
    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/silver-price`);
        const data = await res.json();
        if (!data.success) throw new Error();
        silverPrice = Number(data.xag_usd);
        document.getElementById('price-value').textContent  = `$${silverPrice.toFixed(2)}`;
        document.getElementById('price-update').textContent =
            `עודכן לפני ${Math.floor((data.cache_age_seconds || 0) / 60)} דקות`;
        priceOk = true;
    } catch {
        if (!priceOk) {
            document.getElementById('price-value').textContent  = '$—';
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
// Uses the free Frankfurter API — no API key required
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
    const now    = oz * silverPrice * currentFx;
    return { ...r, histFx, cost, buy, oz, now, pnl: now - cost };
}

function renderPnl() {
    // Show live FX rate used for spot valuation
    const fxInfo = document.getElementById('fx-live-info');
    if (fxInfo) {
        fxInfo.textContent = `שווי ספוט מחושב לפי: כסף $${silverPrice.toFixed(2)}/oz × שער ₪${currentFx.toFixed(4)}/$`;
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
                <td><button class="row-delete-btn" data-id="${r.id}">✕</button></td>
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
    let close  = silverPrice || 32;
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

// Fetch real historical silver price data from backend (Yahoo Finance via /api/silver-history)
async function fetchRealChartData(frame) {
    const periodMap = { '1d': 'daily', '1w': 'weekly', '1m': 'yearly' };
    const period    = periodMap[frame] || 'daily';
    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/silver-history?period=${period}`);
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
            ? '* נתוני מחיר אמיתיים — סילבר פיוצ\'רס (SI=F)'
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
            ? '* נתוני מחיר אמיתיים — סילבר פיוצ\'רס (SI=F)'
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

    // Date meta line — only "as of" date, no next-update
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
    if (_newsData) { _renderNewsDigest(_newsLang); return; }

    container.innerHTML = '<div class="news-loading">טוען חדשות...</div>';

    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/news`);
        const data = await res.json();

        if (!data.success || !Array.isArray(data.items) || !data.items.length) {
            container.innerHTML = '<p class="news-empty">אין חדשות זמינות כרגע. נסה שוב מאוחר יותר.</p>';
            return;
        }
        _newsData = data;
        _renderNewsDigest(_newsLang);
    } catch {
        container.innerHTML = '<p class="news-empty">שגיאת חיבור — נסה שוב מאוחר יותר.</p>';
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
    'charts':         { he: '📊 גרפים',            en: '📊 Charts',                    ru: '📊 Графики',
                        action: ['screen', 'charts-screen'] },
    'museum':         { he: '🏛️ מוזיאון מינטים',    en: '🏛️ Mints Museum',              ru: '🏛️ Музей монетных дворов',
                        action: ['screen', 'museum-screen'] },
    'museum:israel':  { he: '🇮🇱 מינט ישראל',       en: '🇮🇱 Israel Mint',               ru: '🇮🇱 Монетный двор Израиля',
                        action: ['mint', 'israel'] },
    'museum:germany': { he: '🇩🇪 מינט גרמניה',      en: '🇩🇪 Germany Mint',              ru: '🇩🇪 Баварский монетный двор',
                        action: ['mint', 'germany'] },
    'museum:uk':      { he: '🇬🇧 המינט המלכותי',    en: '🇬🇧 Royal Mint',                ru: '🇬🇧 Королевский монетный двор',
                        action: ['mint', 'uk'] },
    'museum:usa':     { he: '🇺🇸 מינט ארה"ב',        en: '🇺🇸 US Mint',                   ru: '🇺🇸 Монетный двор США',
                        action: ['mint', 'usa'] },
    'museum:canada':  { he: '🇨🇦 מינט קנדה',          en: '🇨🇦 Royal Canadian Mint',       ru: '🇨🇦 Монетный двор Канады',
                        action: ['mint', 'canada'] },
    'museum:perth':   { he: '🇦🇺 מינט פרת\'',          en: '🇦🇺 Perth Mint',                ru: '🇦🇺 Монетный двор Перта',
                        action: ['mint', 'perth'] },
    'museum:austria': { he: '🇦🇹 מינט וינה',          en: '🇦🇹 Austrian Mint',             ru: '🇦🇹 Австрийский монетный двор',
                        action: ['mint', 'austria'] },
    'museum:mexico':  { he: '🇲🇽 מינט מקסיקו',        en: '🇲🇽 Mexico Mint',               ru: '🇲🇽 Монетный двор Мексики',
                        action: ['mint', 'mexico'] },
    'quiz':           { he: '❓ טריוויה כסף',        en: '❓ Silver Quiz',                ru: '❓ Викторина',
                        action: ['quiz', ''] },
    'pnl':            { he: '📈 מעקב רווח / הפסד',  en: '📈 P&L Tracker',               ru: '📈 Трекер прибыли/убытков',
                        action: ['screen', 'pnl-screen'] },
    'guide':          { he: '📖 מדריך הכסף',         en: '📖 Silver Guide',               ru: '📖 Руководство по серебру',
                        action: ['screen', 'guide-screen'] },
    'news':           { he: '📰 חדשות ועדכונים',    en: '📰 News & Updates',             ru: '📰 Новости и обновления',
                        action: ['screen', 'updates-screen'] },
    'homework':       { he: '📚 שיעורי בית',         en: '📚 Homework',                   ru: '📚 Домашнее задание',
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
            '<div class="msg-content typing-indicator" aria-label="מר ד׳ מקליד">' +
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
    const typing = addMsg('מר ד׳', 'מקליד...', 'bot typing');
    try {
        const token = sessionToken();
        const res = await fetch(`${CONFIG.CHAT_API_URL}/chat`, {
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
            addMsg('מר ד׳', 'החיבור פג תוקף. מתחבר מחדש...', 'bot error');
            localStorage.removeItem(SESSION_KEY);
            setTimeout(() => {
                document.getElementById('mr-d-modal').style.display = 'none';
                document.body.style.overflow = '';
                document.getElementById('mr-d-fab').style.display = 'none';
                goToScreen('login-screen');
            }, 1500);
            return;
        }

        const data = await res.json();
        typing.remove();
        addMsg('מר ד׳', data.response || 'אין כרגע מענה, נסה שוב.', 'bot');
    } catch {
        typing.remove();
        addMsg('מר ד׳', 'יש כרגע תקלה זמנית. נסה שוב בעוד רגע.', 'bot error');
    }
}

// ══════════════════════════════════════════════════════════════════════
// SILVER TRIVIA QUIZ
// ══════════════════════════════════════════════════════════════════════
const QUIZ_BANK = [
  { q: "כמה גרם יש באונקיה טרויה של כסף?", a: ["31.10 גרם","28.35 גרם","33.00 גרם","29.58 גרם"] },
  { q: "מה הסמל הבינלאומי של כסף בשוק הסחורות?", a: ["XAG","AG","SL","SIL"] },
  { q: "מה נחשב 'כסף טהור' (Fine Silver)?", a: ["999 חלקים מאלף","925 חלקים מאלף","990 חלקים מאלף","970 חלקים מאלף"] },
  { q: "מה עדיף לרכוש כשרוצים לשלם פרמיה נמוכה יותר?", a: ["מטיל","מטבע","הפרמיה זהה","תלוי בגודל בלבד"] },
  { q: "מה הוא 'יחס זהב-כסף' (Gold-Silver Ratio)?", a: ["כמה אונקיות כסף שוות אונקיה אחת של זהב","כמה גרם כסף יש לעומת זהב בעולם","היחס בין מחיר זהב לכסף ב-1900","אחוז הכסף בסגסוגת זהב"] },
  { q: "מה הוא 'פרמיה' בשוק הכסף הפיזי?", a: ["ההפרש בין מחיר הספוט למחיר הקמעונאי","מס על רכישת כסף","עלות האחסון השנתית","עמלת הברוקר"] },
  { q: "איזה מטבע כסף מנפיקה ארצות הברית?", a: ["Silver Eagle","Maple Leaf","Britannia","Philharmoniker"] },
  { q: "מה הוא 'ספוט' (Spot Price) של כסף?", a: ["המחיר העדכני לאונקיה בשוק הבינלאומי","מחיר כסף ישן","המחיר המינימלי שמוכרים מוכנים לקבל","מחיר עתידי ידוע מראש"] },
  { q: "מה הוא 'כסף 999.9' (ארבעה תשעות)?", a: ["כסף עם 99.99% טוהר","כסף מיוצר בשנת 1999","סוג מיוחד של כסף קולוידלי","כסף שעומד בתקן אירופאי בלבד"] },
  { q: "איזה יחס זהב-כסף (GSR) נחשב 'גבוה' ומציין כסף זול יחסית?", a: ["מעל 80","מעל 50","מעל 30","מעל 100"] },
  { q: "מה היא 'אסטרטגיית DCA' (Dollar Cost Averaging)?", a: ["קנייה בכמות קבועה בתדירות קבועה ללא קשר למחיר","לקנות הכל פעם אחת כשהמחיר נמוך","למכור חלק מהאחזקות בעלייה","לשמור מזומן ולחכות לירידות"] },
  { q: "מה מס רווח הון משוער על כסף בישראל?", a: ["כ-25%","10%","17%","33%"] },
  { q: "מה ההבדל בין 'כסף פיזי' ל'כסף נייר'?", a: ["כסף פיזי הוא מתכת אמיתית, כסף נייר הוא חוזה או ETF","כסף פיזי הוא מטבעות ישנים בלבד","כסף נייר שווה יותר","אין הבדל"] },
  { q: "מה הם 'מטבעות נומיסמטיים'?", a: ["מטבעות אספנות עם ערך מעבר לתוכן המתכת","מטבעות לסחר יומיומי","מטבעות עם ערך נקוב גבוה","מטבעות שנוצרו לפני 1950 בלבד"] },
  { q: "מה הוא 'Sterling Silver' (כסף 925)?", a: ["כסף עם 925 חלקים מאלף טוהר","כסף עם 99.9% טוהר","כסף שנוצר בבריטניה בלבד","כסף שאינו מתאים להשקעה"] },
  { q: "באיזה תחום תעשייתי חשוב משתמשים בכסף?", a: ["לוחות סולאריים ואלקטרוניקה","רק בתכשיטים","רק במטבעות ושטרות","בתעשיית הנפט בלבד"] },
  { q: "מה שיא המחיר ההיסטורי המשוער של כסף?", a: ["כ-$50 לאונקיה","כ-$30 לאונקיה","כ-$70 לאונקיה","כ-$100 לאונקיה"] },
  { q: "מה יתרון מטיל כסף גדול על פני מטיל קטן?", a: ["פרמיה נמוכה יותר לאונקיה","קל יותר לאחסן","יותר נזיל","טוהר גבוה יותר"] },
  { q: "מה הוא 'Silver ETF'?", a: ["קרן סל שעוקבת אחר מחיר הכסף ללא החזקת מתכת פיזית","מטיל כסף גדול במיוחד","כסף שנמכר בבורסה ישראלית","חוזה עתידי על כסף"] },
  { q: "כמה אונקיות טרוי יש בקילוגרם כסף?", a: ["32.15 אונקיות","28 אונקיות","35 אונקיות","40 אונקיות"] },
  { q: "מה הוא ה-LBMA?", a: ["גוף שמגדיר תקני איכות בינלאומיים למתכות יקרות","בנק מרכזי לכסף","חברת ביטוח למתכות","מדד כסף אירופאי"] },
  { q: "איזה מטבע כסף מנפיקה קנדה?", a: ["Maple Leaf","Silver Eagle","Britannia","Philharmoniker"] },
  { q: "מה הוא ה-COMEX?", a: ["בורסת הסחורות בניו יורק המשפיעה על מחיר הכסף","חברת ייצור כסף אמריקאית","תקן בינלאומי לטוהר כסף","מועדון משקיעי כסף"] },
  { q: "מה הוא 'Allocated Storage' (אחסון מוקצה)?", a: ["כסף ספציפי שנאגר בנפרד ושייך לך לחלוטין","כסף שנאגר ביחד עם מתכות של אחרים","כסף שמאוחסן בבנק","שירות ממשלתי לאחסון מתכות"] },
  { q: "מה הוא 'בוליון' (Bullion)?", a: ["מטילים ומטבעות המוערכים לפי משקל המתכת שלהם","מטבעות עם ערך נקוב גבוה","כסף שנוצר לפני 1900","שם של חברת כסף בינלאומית"] },
  { q: "מתי עדיף להחזיק מטבעות על פני מטילים?", a: ["כשרוצים נזילות קלה יותר","כשרוצים לשלם פרמיה נמוכה","כשקונים כמויות גדולות","כשהאחסון הוא הגורם המרכזי"] },
  { q: "מה הם 'Silver Stackers'?", a: ["אנשים שצוברים כסף פיזי לאורך זמן","מוכרי כסף מקצועיים","מנהלי קרנות כסף","יצרני מטילי כסף"] },
  { q: "מה הסיכון העיקרי ברכישת כסף ממוכר לא מוכר?", a: ["קבלת כסף מזויף","מחיר גבוה מדי","בעיות מס","בעיות אחסון"] },
  { q: "איזה מטבע כסף מנפיקה אוסטריה?", a: ["Philharmoniker","Silver Eagle","Maple Leaf","Britannia"] },
  { q: "מה הוא 'Numismatic Premium'?", a: ["תוספת מחיר על מטבעות אספנות מעבר לערך המתכת","פרמיה על כמות גדולה","הנחה על רכישת מטילים","עלות האריזה של המטבע"] },
  { q: "כיצד ריבית נמוכה של הפד האמריקאי משפיעה על מחיר הכסף?", a: ["נוטה להעלות את מחיר הכסף","מוריד את מחיר הכסף","אין השפעה","גורם לייסוף הדולר בלבד"] },
  { q: "כמה כניסות שוק מינימום מומלצות לכסף פיזי?", a: ["3–5 כניסות נפרדות","כניסה אחת מלאה","2 כניסות מקסימום","עד 10 כניסות קטנות בלבד"] },
  { q: "מה ההמלצה לגבי קנייה חודשית מינימלית בכסף?", a: ["אונקיה אחת לפחות בחודש","5 אונקיות לחודש","100 גרם לחודש","תלוי לחלוטין בתקציב"] },
  { q: "מה אחד מהסיכונים הייחודיים לכסף לעומת זהב?", a: ["תנודתיות גבוהה יותר","לא ניתן לאחסן אותו","אין ביקוש תעשייתי","קשה יותר לזיוף"] },
  { q: "מה פירוש 'Bid Price' לעומת 'Ask Price'?", a: ["Bid – מחיר שקונה מוכן לשלם; Ask – מחיר שמוכר מוכן לקבל","Bid – מחיר שמוכר מוכן למכור; Ask – מחיר שקונה מוכן לשלם","שניהם זהים תמיד","Bid מחיר כסף, Ask מחיר זהב"] },
  { q: "מה יתרון כסף פיזי על פני ETF של כסף?", a: ["ללא סיכון צד שלישי ובעלות ישירה על המתכת","נזיל יותר מ-ETF","זול יותר לרכישה","אין הבדל מהותי"] },
  { q: "מה מציין יחס זהב-כסף מעל 80?", a: ["כסף זול יחסית לזהב – הזדמנות פוטנציאלית לקנייה","כסף יקר מדי לעומת זהב","עודף היצע של כסף בשוק","שוק דובי בכסף"] },
  { q: "מה כדאי לעשות כשמחיר הכסף יורד בחדות?", a: ["לצבור בהדרגה לפי תקציב – ירידה יכולה להיות הזדמנות","למכור מיד לפני שמאבדים יותר","לחכות שהמחיר יחזור לשיא","לקנות הכל בבת אחת"] },
  { q: "מה הוא 'Unallocated' בניגוד ל-'Allocated'?", a: ["Unallocated – דרישה כללית ללא מתכת ספציפית; Allocated – מתכת ספציפית שלך","אין הבדל מהותי","Unallocated תמיד בטוח יותר","Allocated זמין רק לבנקים"] },
  { q: "למה מומלץ לפצל קנייה ל-3–5 כניסות נפרדות?", a: ["להוריד סיכון תזמון שגוי ולנצל ירידות בדרך","כי הפרמיה נמוכה יותר כך","בגלל חוק ישראלי שמגביל קנייה בסכום אחד","כדי לחסוך בעמלות בנק"] },
  { q: "מה ה-'Spot' מחושב לפי?", a: ["מחיר המסחר הנוכחי בשוק הסחורות הבינלאומי","ממוצע מחירים של השנה האחרונה","מחיר שקובעת ממשלת ארה\"ב","מחיר קבוע שמתעדכן פעם בשבוע"] },
  { q: "מה הוא המוליך החשמלי הטוב ביותר מבין כל המתכות?", a: ["כסף (Silver)","זהב","נחושת","פלטינה"] },
  { q: "כמה אחוז מהתיק מומלץ להקצות למתכות יקרות למשקיע מתחיל?", a: ["עד 15%","עד 50%","עד 5%","עד 30%"] },
  { q: "מה החיסרון הייחודי של קרן סל (ETF) כסף לעומת כסף פיזי?", a: ["סיכון צד נגדי — אינכם הבעלים הישירים של הכסף","לא ניתן לקנות בסכומים קטנים","אין שקיפות על ביצועי הקרן","מחיר הקנייה גבוה יותר"] },
  { q: "מה ייחודי בכסף לעומת זהב בהקשר מהפכת האנרגיה הירוקה?", a: ["כסף הוא רכיב קריטי בפאנלים סולאריים וברכבים חשמליים","כסף זול יותר לייצור פאנלים","זהב אינו בשימוש תעשייתי כלל","כסף נפוץ יותר מזהב בקרום כדור הארץ"] },
  { q: "מהי הדרך הזולה והנגישה ביותר למשקיע מתחיל להיחשף לכסף?", a: ["קרנות סל (ETF)","רכישת מטילים פיזיים","חוזים עתידיים","מניות חברות כרייה"] },
  { q: "מה הסיכון המרכזי של חוזים עתידיים (Futures) על כסף?", a: ["מינוף גבוה — ההפסד יכול לעלות על ההשקעה הראשונית","לא ניתן למכור לפני הפקיעה","אין חשיפה לשינויי מחיר","דמי ניהול גבוהים מאוד"] },
  { q: "מה כולל מחיר ה'פרמיה' על כסף פיזי?", a: ["עלויות ייצור, שינוע וביטוח של המתכת","מע\"מ בלבד","רווח המוכר בלבד","עלות האחסון השנתית"] },
  { q: "מה שם הגוף הישראלי המפורסם שמוכר כסף ומטבעות מקומיים?", a: ["The Holy Land Mint (החברה הישראלית למדליות ומטבעות)","בנק ישראל","Israel Coins Ltd","המטבעה הישראלית הרשמית"] },
  { q: "מה המשמעות של 'סיכון צד נגדי' (Counterparty Risk)?", a: ["סיכון שמנהל הקרן לא יוכל לעמוד בהתחייבויותיו","סיכון נפילת מחיר כסף בשוק","סיכון גניבת כסף פיזי","סיכון מטבע חוץ"] },
  { q: "מה ייחד את ביקוש הכסף לעומת זהב בשוק הגלובלי?", a: ["לכסף יש ביקוש תעשייתי נרחב בנוסף לביקוש להשקעה","לזהב ביקוש תעשייתי גדול יותר","ביקוש הכסף נובע בעיקר מתכשיטים","אין הבדל בין הביקושים"] },
  { q: "מה אחד מחסרונות ההשקעה בכסף פיזי?", a: ["נזילות נמוכה — מכירה עלולה להיות איטית","אין הגנה מול אינפלציה","לא ניתן לאחסן בכספות","המחיר קבוע ולא מגיב לשוק"] },
  { q: "מה ההבדל בין 'Ask price' ל-'Bid price' בשוק המתכות?", a: ["Ask הוא המחיר שהמוכרים מבקשים, Bid הוא המחיר שהקונים מוכנים לשלם","Ask תמיד גבוה מ-Bid באחוז קבוע","Bid הוא המחיר הרשמי, Ask הוא ספקולטיבי","שניהם זהים בשוק סחורות"] },
  { q: "לאיזה סוג משקיע מתאימים חוזים עתידיים (Futures) על כסף?", a: ["משקיעים מנוסים עם סבילות גבוהה לסיכון","משקיעים פסיביים לטווח ארוך","משקיעים מתחילים עם תקציב קטן","כל משקיע ללא הבדל"] },
  { q: "מה החיסרון בהשקעה במניות חברות כרייה כחלופה לכסף פיזי?", a: ["ההצלחה תלויה בניהול ותפעול החברה ולא רק במחיר הכסף","לא ניתן לקנות בבורסה","הן לא עוקבות אחר מחיר הכסף בשום מצב","אין דיבידנד בחברות כרייה"] },
];

let QUIZ_TOTAL = 15;   // capped per round; adapts if the store has fewer questions
const QUIZ_SECS  = 600;

let quizState = { questions: [], idx: 0, score: 0, timeLeft: QUIZ_SECS, timer: null, locked: false };

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
        pct >= 90 ? 'מעולה! אתה מומחה כסף אמיתי 🏆' :
        pct >= 70 ? 'תוצאה מצוינת! ידע מרשים של שוק הכסף.' :
        pct >= 50 ? 'לא רע! כדאי לחזור על חומר הלמידה.' :
                    'יש מקום לשיפור — חזור ולמד שוב!';
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
    if (menu) menu.style.display = '';
    if (wrap) wrap.style.display = 'none';
    _quizPanel('quiz-start'); // reset quiz panels for next time
}

function _hwOpenQuiz() {
    const menu = document.getElementById('hw-menu');
    const wrap = document.getElementById('hw-quiz-wrap');
    if (menu) menu.style.display = 'none';
    if (wrap) wrap.style.display = '';
    _quizPanel('quiz-start');
}

function initQuiz() {
    document.getElementById('quiz-start-btn')?.addEventListener('click', quizStart);
    document.getElementById('quiz-restart-btn')?.addEventListener('click', quizReset);
    document.getElementById('quiz-menu-btn')?.addEventListener('click', _hwOpenQuiz);
    document.getElementById('back-to-hw-menu')?.addEventListener('click', () => {
        quizReset(); // stops timer, resets state, shows menu
    });
}

// ══════════════════════════════════════════════════════════════════════
// MUSEUM — Mint data + logic
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
        id: 'israel',
        flag: '🇮🇱',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Jerusalem_skyline_from_armon_hanatziv_panoramic.jpg/800px-Jerusalem_skyline_from_armon_hanatziv_panoramic.jpg',
        he: {
            name: 'חברת מטבעות ישראל',
            subtitle: 'Israel Coins and Medals Corp. — ICMC',
            founded: 'נוסדה 1952',
            location: 'ירושלים, ישראל',
            website: 'en.israelmint.com',
            history: [
                {
                    title: 'ייסוד ורקע היסטורי',
                    text: 'חברת מטבעות ישראל (ICMC) הוקמה בשנת 1952 כחברה ממשלתית מטעם בנק ישראל, כשלוש שנים לאחר הכרזת העצמאות. החברה הוקמה במטרה לייצר מטבעות זיכרון ומדליות המסמלים את ערכי ואירועי המדינה הצעירה. הטביעה הראשונה בוצעה בחו"ל בעקבות מגבלות טכנולוגיות מקומיות.'
                },
                {
                    title: 'פיתוח ומקום בזירה הבינלאומית',
                    text: 'לאורך העשורים הפכה ICMC לאחת מחברות המטבעות המוכרות ביותר בעולם. המטבעות שלה מופצים ב-60 מדינות ונחשבים לפריטי אספנות יוקרתיים. החברה עובדת עם אמנים ישראלים בולטים שמעצבים את פני המטבעות, ומשלבת ערכים יהודיים ולאומיים בכל יצירה.'
                },
                {
                    title: 'כסף פיזי ומטבעות אספנות',
                    text: 'מדי שנה, לרגל יום העצמאות, מנפיקה החברה סדרות מוגבלות של מטבעות כסף טהור. בנוסף, מייצרת ICMC מטבעות כסף לנושאים כגון ירושלים, חנוכה, פסח ואישים היסטוריים. מטבעות אלה מוטבעים מכסף 999 ו-925, ורבים מהם הפכו לפריטים נדירים בשוק האספנות הבינלאומי.'
                }
            ],
            products: [
                {
                    title: 'בוליון יונת השלום',
                    type: 'בוליון',
                    weight: 'משקלים שונים',
                    year: '2014–',
                    purity: 'כסף 999 / זהב 999.9',
                    desc: 'בוליון הכסף הישראלי "יונת השלום" של מטבעות ארץ הקודש, המיוצר החל משנת 2014. בחלקו הקדמי: יונה לבנה עם עלה זית במעופה מעל חומות ירושלים העתיקה. בחלקו האחורי: סמל החברה, טוהר המתכת ומשקלה; במטילים גם חותמת בודק ומספר סידורי. זמין כעיגול או מטיל. החל מ-2019 גם בזהב טהור 999.9.',
                    img: DOVE_OF_PEACE_IMG,
                    emoji: '🕊️',
                    transparent: true
                },
                {
                    title: 'מטיל כסף יצוק 1 ק"ג — יונת השלום',
                    type: 'מטיל',
                    weight: '1 ק"ג',
                    year: '2014–',
                    purity: 'כסף 999',
                    desc: 'מטיל כסף טהור יצוק במשקל 1 ק"ג מסדרת "יונת השלום" של מטבעות ארץ הקודש. על המטיל מוטבעים סמל החברה, יונת השלום, טוהר המתכת, משקל, סימן ICMC ומספר סידורי. מיוצר החל מ-2014; החל מ-2019 זמין גם בזהב טהור 999.9.',
                    img: DOVE_OF_PEACE_1KG_BAR_IMG,
                    emoji: '🥈',
                    transparent: true
                },
                {
                    title: '300 גרם גרגירי כסף',
                    type: 'גרגירים',
                    weight: '300 גרם',
                    year: '',
                    purity: 'כסף 999',
                    desc: 'גרגירי כסף טהור 999 במשקל 300 גרם ממטבעות ארץ הקודש. אריזה רשמית במיכל פластיק אטום עם סימון טוהר ומשקל. מתאים להשקעה בכסף פיזי, ייצור ואספנות.',
                    img: SILVER_GRAINS_300G_IMG,
                    emoji: '✨',
                    transparent: true
                }
            ]
        },
        en: {
            name: 'Israel Coins and Medals Corp.',
            subtitle: 'State-owned coin authority — ICMC',
            founded: 'Founded 1952',
            location: 'Jerusalem, Israel',
            website: 'en.israelmint.com',
            history: [
                {
                    title: 'Foundation & Historical Background',
                    text: 'The Israel Coins and Medals Corporation (ICMC) was established in 1952 as a government-owned company under the Bank of Israel, just a few years after the Declaration of Independence. It was created to produce commemorative coins and medals representing the values and events of the young nation. The first coins were minted abroad due to local technical limitations.'
                },
                {
                    title: 'Growth & International Standing',
                    text: 'Over the decades, ICMC has grown into one of the most recognized coin producers in the world. Its coins are distributed in over 60 countries and are considered prestigious collectibles. The company collaborates with leading Israeli artists who design coin faces, integrating Jewish and national values into every piece.'
                },
                {
                    title: 'Physical Silver & Collector Coins',
                    text: 'Each year, to mark Israeli Independence Day, the company issues limited series of pure silver coins. ICMC also produces silver coins themed around Jerusalem, Hanukkah, Passover, and historical figures. These coins, struck from 999 and 925 silver, have become rare collectibles in the international numismatic market.'
                }
            ],
            products: [
                { title: 'Dove of Peace Bullion', type: 'Bullion', weight: 'Various weights', year: '2014–', purity: '.999 Silver / .9999 Gold', desc: 'Israeli "Dove of Peace" bullion by The Holy Land Mint, produced since 2014. Obverse: a white dove with an olive branch in flight above the Old City of Jerusalem walls. Reverse: Holy Land Mint logo, metal purity and weight; bars also carry the Melter Assayer mark and serial number. Available as rounds or bars. Gold .9999 versions since 2019.', img: DOVE_OF_PEACE_IMG, emoji: '🕊️', transparent: true },
                { title: 'Dove of Peace 1 kg Cast Bar', type: 'Bar', weight: '1 kg', year: '2014–', purity: '.999 Silver', desc: 'Cast .999 fine silver bar from the "Dove of Peace" series by The Holy Land Mint. Stamped with the company logo, dove motif, SILVER .999, weight, ICMC mark and serial number. Produced since 2014; gold .9999 versions available since 2019.', img: DOVE_OF_PEACE_1KG_BAR_IMG, emoji: '🥈', transparent: true },
                { title: '300g Fine Silver Grains', type: 'Grains', weight: '300g', year: '', purity: '.999 Silver', desc: '300 grams of .999 fine silver grains (shot) from The Holy Land Mint — Israel Coins & Medals Corp. Official sealed plastic jar labeled Fine Silver 999. Suitable for physical silver investment, manufacturing and collecting.', img: SILVER_GRAINS_300G_IMG, emoji: '✨', transparent: true }
            ]
        },
        ru: {
            name: 'Израильский монетный двор',
            subtitle: 'Государственная монетная корпорация — ICMC',
            founded: 'Основан в 1952',
            location: 'Иерусалим, Израиль',
            website: 'en.israelmint.com',
            history: [
                {
                    title: 'Основание и исторический фон',
                    text: 'Израильская корпорация монет и медалей (ICMC) была основана в 1952 году как государственная компания под управлением Банка Израиля, примерно через три года после провозглашения независимости. Она была создана для чеканки памятных монет и медалей, символизирующих ценности и события молодого государства. Первые монеты чеканились за рубежом из-за местных технических ограничений.'
                },
                {
                    title: 'Развитие и международное признание',
                    text: 'На протяжении десятилетий ICMC стала одним из наиболее признанных производителей монет в мире. Её монеты распространяются более чем в 60 странах и считаются престижными предметами коллекционирования. Компания сотрудничает с ведущими израильскими художниками, создающими дизайн монет с интеграцией еврейских и национальных ценностей.'
                },
                {
                    title: 'Физическое серебро и коллекционные монеты',
                    text: 'Ежегодно, в честь Дня независимости Израиля, компания выпускает ограниченные серии монет из чистого серебра. ICMC также производит серебряные монеты на темы Иерусалима, Хануки, Пасхи и исторических деятелей. Эти монеты из серебра 999 и 925 пробы стали редкими предметами коллекционирования на международном рынке нумизматики.'
                }
            ],
            products: [
                { title: 'Буллион «Голубь мира»', type: 'Буллион', weight: 'Разные веса', year: '2014–', purity: 'Серебро 999 / Золото 999.9', desc: 'Израильский буллион «Голубь мира» от монетного двора Святой Земли, выпускается с 2014 года. Лицевая сторона: белый голубь с оливковой ветвью над стенами Старого города Иерусалима. Оборотная: логотип монетного двора, проба и вес; на слитках также клеймо контролёра и серийный номер. Доступен в виде монет и слитков. С 2019 года также из золота 999.9 пробы.', img: DOVE_OF_PEACE_IMG, emoji: '🕊️', transparent: true },
                { title: 'Литой слиток 1 кг «Голубь мира»', type: 'Слиток', weight: '1 кг', year: '2014–', purity: 'Серебро 999', desc: 'Литой слиток из серебра 999 пробы весом 1 кг из серии «Голубь мира» от монетного двора Святой Земли. На слитке: логотип компании, голубь, проба, вес, знак ICMC и серийный номер. Выпускается с 2014 года; с 2019 года также из золота 999.9 пробы.', img: DOVE_OF_PEACE_1KG_BAR_IMG, emoji: '🥈', transparent: true },
                { title: '300 г серебряных гранул', type: 'Гранулы', weight: '300 г', year: '', purity: 'Серебро 999', desc: '300 граммов серебряных гранул пробы 999 от монетного двора Святой Земли. Официальная герметичная пластиковая упаковка с маркировкой пробы и веса. Подходит для инвестиций в физическое серебро, производства и коллекционирования.', img: SILVER_GRAINS_300G_IMG, emoji: '✨', transparent: true }
            ]
        }
    },

    germany: {
        id: 'germany',
        flag: '🇩🇪',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/M%C3%BCnchen_Bayerisches_Hauptm%C3%BCnzamt_1.jpg/800px-M%C3%BCnchen_Bayerisches_Hauptm%C3%BCnzamt_1.jpg',
        he: {
            name: 'בית המטבע הבוורי',
            subtitle: 'Bayerisches Hauptmünzamt — מינכן',
            founded: 'נוסד 1158',
            location: 'מינכן, בוואריה, גרמניה',
            website: 'hauptmuenzamt.bayern',
            history: [
                {
                    title: 'ייסוד ימי הביניים',
                    text: 'בית המטבע הבוורי (Bayerisches Hauptmünzamt) הוא אחד מבתי המטבע הוותיקים ביותר בעולם, עם תולדות המתחילות בשנת 1158 תחת הנסיך הנריך האריה ממינכן. לאורך מאות שנים שימש בית המטבע לייצור מטבעות לממלכת בוואריה, ומאוחר יותר לאימפריה הגרמנית. מיקומו ההיסטורי במינכן, בלב בוואריה, עיצב את זהותו הייחודית.'
                },
                {
                    title: 'עידן מודרני ומוצרי כסף',
                    text: 'בעידן המודרני הפך בית המטבע הבוורי לגוף מוביל בייצור מטבעות אספנות ועיטורים מדינתיים. בית המטבע מתמחה במטבעות זיכרון כסף ברמה גבוהה, הכוללים סדרות היסטוריות, מוזיקה קלאסית ומורשת בוורית. כיום הוא אחד משמונה בתי מטבע גרמניים פעילים, כאשר כל בית מטבע מסמן מטבעותיו בסימן ייחודי (לבוואריה: D).'
                },
                {
                    title: 'מטילי כסף ואספנות',
                    text: 'בנוסף למטבעות הזיכרון, מייצר בית המטבע הבוורי מטילי כסף טהורים לשוק ההשקעות. מוצריו זוכים להכרה בינלאומית בשל דיוקן הטביעה הגבוה ועיצובים היסטוריים מפוארים. סדרת המטבעות הגרמנית "Deutschland Silber Unze" הפכה לאחת מהפופולריות ביותר בקרב משקיעי כסף באירופה.'
                }
            ],
            products: [
            ]
        },
        en: {
            name: 'Bavarian State Mint',
            subtitle: 'Bayerisches Hauptmünzamt — Munich',
            founded: 'Founded 1158',
            location: 'Munich, Bavaria, Germany',
            website: 'hauptmuenzamt.bayern',
            history: [
                {
                    title: 'Medieval Foundation',
                    text: 'The Bavarian State Mint (Bayerisches Hauptmünzamt) is one of the oldest mints in the world, with origins dating to 1158 under Prince Henry the Lion in Munich. Over centuries it served as the coin-producing authority for the Kingdom of Bavaria and later the German Empire. Its historic location in the heart of Munich shaped its unique identity.'
                },
                {
                    title: 'Modern Era & Silver Products',
                    text: 'In the modern era, the Bavarian Mint became a leader in high-quality commemorative coins and state decorations. It specializes in premium silver coins featuring historical series, classical music, and Bavarian heritage. Today it is one of eight active German mints, each identified by a unique mintmark (Bavaria uses the letter "D").'
                },
                {
                    title: 'Silver Bars & Collecting',
                    text: 'In addition to commemorative coins, the Bavarian Mint produces pure silver bars for the investment market. Its products are internationally recognized for precision striking and magnificent historical designs. The German "Deutschland Silber Unze" series has become one of the most popular among silver investors in Europe.'
                }
            ],
            products: [
            ]
        },
        ru: {
            name: 'Баварский монетный двор',
            subtitle: 'Bayerisches Hauptmünzamt — Мюнхен',
            founded: 'Основан в 1158',
            location: 'Мюнхен, Бавария, Германия',
            website: 'hauptmuenzamt.bayern',
            history: [
                {
                    title: 'Средневековое основание',
                    text: 'Баварский государственный монетный двор (Bayerisches Hauptmünzamt) — один из старейших монетных дворов в мире, история которого восходит к 1158 году при принце Генрихе Льве в Мюнхене. На протяжении столетий он служил органом чеканки монет для Королевства Бавария, а впоследствии для Германской империи. Историческое расположение в сердце Мюнхена сформировало его уникальную идентичность.'
                },
                {
                    title: 'Современная эпоха и серебряные изделия',
                    text: 'В современную эпоху Баварский монетный двор стал лидером в производстве высококачественных памятных монет и государственных наград. Он специализируется на коллекционных серебряных монетах: исторические серии, классическая музыка, баварское наследие. Сегодня это один из восьми действующих немецких монетных дворов, каждый из которых имеет уникальный знак (у Баварии — «D»).'
                },
                {
                    title: 'Серебряные слитки и коллекционирование',
                    text: 'В дополнение к памятным монетам, Баварский монетный двор производит слитки чистого серебра для инвестиционного рынка. Его продукция пользуется международным признанием благодаря высокоточной чеканке и великолепным историческим дизайнам. Серия «Deutschland Silber Unze» стала одной из наиболее популярных среди инвесторов в серебро по всей Европе.'
                }
            ],
            products: [
            ]
        }
    },

    uk: {
        id: 'uk',
        flag: '🇬🇧',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Llantrisant_Royal_Mint_Building.jpg/800px-Llantrisant_Royal_Mint_Building.jpg',
        he: {
            name: 'המינט המלכותי',
            subtitle: 'The Royal Mint — לנטריסנט, ויילס',
            founded: 'נוסד 886',
            location: 'לנטריסנט, ויילס, בריטניה',
            website: 'www.royalmint.com',
            history: [
                {
                    title: 'ייסוד ועידן המלוכה',
                    text: 'המינט המלכותי (The Royal Mint) הוא אחד הגופים הממשלתיים הוותיקים ביותר בעולם, עם מסורת טביעת מטבעות שמתחילה בשנת 886 לספירה תחת המלך אלפרד הגדול. במשך מאות שנים שכן המינט ב"מגדל לונדון", ולאחר מכן ברחוב Tower Hill בלונדון. בשנת 1968 עבר לאתרו הנוכחי בלנטריסנט, ויילס.'
                },
                {
                    title: 'הברבריאניה — סמל הכסף הבריטי',
                    text: 'הסדרה הנחשבת ביותר של המינט המלכותי היא ללא ספק מטבע הברבריאניה (Britannia), שנטבע לראשונה כמטבע כסף השקעה בשנת 1987. ברבריאניה, המייצגת את בריטניה כדמות נשית לוחמת, הפכה לאחד הסמלים הנודעים ביותר של שוק הכסף הפיזי הבינלאומי. המטבע עשוי כסף 999.9 ומהווה הילך חוקי בממלכה המאוחדת.'
                },
                {
                    title: 'חדשנות ומנהיגות בשוק',
                    text: 'המינט המלכותי מוביל בחדשנות: הוא היה הראשון להנפיק מטבעות כסף בצבעים (2016), ומטבעות עם אפקטים הולוגרפיים. סדרת "חיות המלכה" (Queen\'s Beasts, 2016–2021), שהכילה 10 מטבעות כסף תוך שנות ייצור, הפכה לפנומן אספנות עולמי. בנוסף, המינט מנפיק מטבעות זיכרון, שטרות זהב ומטילי כסף למשקיעים.'
                }
            ],
            products: [
                {
                    title: 'מטיל כסף יצוק 500 גרם',
                    type: 'מטיל',
                    weight: '500 גרם',
                    year: '',
                    purity: 'כסף 999',
                    desc: 'מטיל השקעה יצוק מהמינט המלכותי הבריטי. על המטיל: לוגו המינט, משקל 500 גרם, טוהר 999 ומספר סידורי ייחודי. מטילי יציקה פופולריים בקרב משקיעים שמחפשים כמות כסף גדולה בפרמיה נמוכה יחסית. מטילים אינם נושאים דיוקן מלכותי — בניגוד למטבעות.',
                    img: ROYAL_MINT_500G_CAST_BAR_IMG,
                    emoji: '🥈',
                    transparent: true
                },
                {
                    title: 'ברבריאניה כסף 2026',
                    type: 'מטבע',
                    weight: '1 אונקיה',
                    year: '2026',
                    purity: 'כסף 999.9',
                    desc: 'מטבע הברבריאניה — אחד ממטבעות הכסף המוכרים בעולם, מיוצר על ידי המינט המלכותי מאז 1987. על הגב: ברבריאניה עם קסדה, חנית, מגן דגל בריטניה וענף זית. כולל אבטחה מתקדמת: תמונה נסתרת (חנית או מנעול), אנימציית משטח, מיקרו-טקסט «קישוט והגנה», וקווי צבע על המגן. הילך חוקי בבריטניה בערך נקוב של 2 לירות.',
                    img: BRITANNIA_2026_REVERSE_IMG,
                    emoji: '🇬🇧',
                    transparent: true
                },
                {
                    title: 'ברבריאניה — המלך צ\'ארלס השלישי',
                    type: 'מטבע',
                    weight: '1 אונקיה',
                    year: '2026',
                    purity: 'כסף 999.9',
                    desc: 'על פני המטבע מופיע דיוקן המלך צ\'ארלס השלישי — ללא כתר, בעיצוב האמן מרטין ג\'נינגס. סביב הדיוקן: שם המלך, תארים מלכותיים וערך נקוב של 2 לירות. מאז עלייתו לכס ב-2022, דיוקן המלך מופיע על רוב מטבעות המינט המלכותי — כולל ברבריאניה, סוברין ומטבעות זיכרון — במקום אליזבת השנייה. שדה הרקע עם טקסטורת אבטחה מיקרוסקופית.',
                    img: BRITANNIA_2026_OBVERSE_IMG,
                    emoji: '👑',
                    transparent: true
                }
            ]
        },
        en: {
            name: 'The Royal Mint',
            subtitle: 'The Royal Mint — Llantrisant, Wales',
            founded: 'Founded 886 AD',
            location: 'Llantrisant, Wales, United Kingdom',
            website: 'www.royalmint.com',
            history: [
                {
                    title: 'Foundation & Royal History',
                    text: 'The Royal Mint is one of the oldest government bodies in the world, with a coinage tradition dating to 886 AD under King Alfred the Great. For centuries it was housed in the Tower of London, then on Tower Hill. In 1968 it moved to its current site in Llantrisant, Wales, becoming a world-class coin manufacturing facility.'
                },
                {
                    title: 'Britannia — Symbol of British Silver',
                    text: 'The most celebrated Royal Mint product is undoubtedly the Britannia silver coin, first struck as a silver bullion coin in 1987. Britannia, representing Britain as a female warrior figure, has become one of the most recognised symbols in the international physical silver market. The coin is struck in 999.9 fine silver and is legal tender in the United Kingdom.'
                },
                {
                    title: 'Innovation & Market Leadership',
                    text: 'The Royal Mint leads in innovation: it was the first to issue coloured silver coins (2016) and coins with holographic effects. The "Queen\'s Beasts" series (2016–2021), comprising 10 silver coins over its production years, became a global collecting phenomenon. The Mint also issues commemorative coins, gold notes, and silver bars for investors.'
                }
            ],
            products: [
                {
                    title: 'Royal Mint 500g Cast Silver Bar',
                    type: 'Bar',
                    weight: '500g',
                    year: '',
                    purity: '.999 Silver',
                    desc: 'Cast investment bar from The Royal Mint — stamped THE ROYAL MINT, 500g, 999, SILVER, with a unique serial number (e.g. R000001). Cast bars are popular with stackers seeking larger silver weight at a typically lower premium per gram than coins. Bars carry no royal portrait — unlike Royal Mint coinage.',
                    img: ROYAL_MINT_500G_CAST_BAR_IMG,
                    emoji: '🥈',
                    transparent: true
                },
                {
                    title: 'Silver Britannia (2026) — Reverse',
                    type: 'Coin',
                    weight: '1 oz',
                    year: '2026',
                    purity: '.9999 Silver',
                    desc: 'The Britannia is one of the world\'s most recognised silver bullion coins, struck by The Royal Mint since 1987. Reverse: Britannia with helmet, trident, Union Jack shield and olive branch; inscriptions BRITANNIA, 2026, 1 OZ, 999 FINE SILVER. Advanced security: Latent Image (trident/padlock), Surface Animation, micro-text DECUS ET TUTAMEN, and tincture lines on the shield. UK legal tender.',
                    img: BRITANNIA_2026_REVERSE_IMG,
                    emoji: '🇬🇧',
                    transparent: true
                },
                {
                    title: 'Silver Britannia — King Charles III Obverse',
                    type: 'Coin',
                    weight: '1 oz',
                    year: '2026',
                    purity: '.9999 Silver',
                    desc: 'Obverse: portrait of King Charles III — uncrowned, by Martin Jennings (initials MJ). Inscription: CHARLES III • D • G • REX • F • D • 2 POUNDS. Since his accession in 2022, the King\'s effigy appears on most Royal Mint bullion and commemorative silver — including Britannia and Sovereign — replacing Queen Elizabeth II. Micro-textured security field on the background.',
                    img: BRITANNIA_2026_OBVERSE_IMG,
                    emoji: '👑',
                    transparent: true
                }
            ]
        },
        ru: {
            name: 'Королевский монетный двор',
            subtitle: 'The Royal Mint — Лланттресант, Уэльс',
            founded: 'Основан в 886 г. н.э.',
            location: 'Лланттресант, Уэльс, Великобритания',
            website: 'www.royalmint.com',
            history: [
                {
                    title: 'Основание и королевская история',
                    text: 'Королевский монетный двор — один из старейших государственных органов в мире, с традицией чеканки монет, восходящей к 886 году н.э. при короле Альфреде Великом. Столетиями он располагался в Тауэре, затем на Тауэр-Хилл в Лондоне. В 1968 году двор переехал в нынешнее здание в Лланттресанте, Уэльс, став производственным объектом мирового класса.'
                },
                {
                    title: 'Britannia — символ британского серебра',
                    text: 'Самым известным продуктом Королевского монетного двора, несомненно, является серебряная монета Britannia, впервые выпущенная как инвестиционная серебряная монета в 1987 году. Britannia, изображающая Британию в образе женщины-воина, стала одним из наиболее узнаваемых символов на мировом рынке физического серебра. Монета чеканится из серебра 999.9 пробы и является законным платёжным средством.'
                },
                {
                    title: 'Инновации и лидерство на рынке',
                    text: 'Королевский монетный двор лидирует в инновациях: он первым выпустил цветные серебряные монеты (2016) и монеты с голографическими эффектами. Серия «Звери королевы» (2016–2021), состоящая из 10 серебряных монет, стала мировым коллекционным феноменом. Двор также выпускает памятные монеты, золотые ноты и серебряные слитки для инвесторов.'
                }
            ],
            products: [
                {
                    title: 'Литой слиток 500 г — Королевский монетный двор',
                    type: 'Слиток',
                    weight: '500 г',
                    year: '',
                    purity: 'Серебро 999',
                    desc: 'Инвестиционный литой слиток от Королевского монетного двора Великобритании. На слитке: логотип двора, вес 500 г, проба 999 и уникальный серийный номер. Популярен у инвесторов, покупающих большой вес серебра с более низкой премией за грамм. На слитках нет королевского портрета — в отличие от монет.',
                    img: ROYAL_MINT_500G_CAST_BAR_IMG,
                    emoji: '🥈',
                    transparent: true
                },
                {
                    title: 'Серебряная Britannia 2026',
                    type: 'Монета',
                    weight: '1 унция',
                    year: '2026',
                    purity: 'Серебро 999.9',
                    desc: 'Britannia — одна из самых узнаваемых инвестиционных серебряных монет мира, чеканится Королевским монетным двором с 1987 года. Оборотная сторона: Britannia с шлемом, трезубцем, щитом с британским флагом и оливковой ветвью. Защита: скрытое изображение (трезубец или замок), анимация поверхности, микротекст «Украшение и защита», линии герба на щите. Законное платёжное средство Великобритании номиналом 2 фунта.',
                    img: BRITANNIA_2026_REVERSE_IMG,
                    emoji: '🇬🇧',
                    transparent: true
                },
                {
                    title: 'Britannia — король Карл III',
                    type: 'Монета',
                    weight: '1 унция',
                    year: '2026',
                    purity: 'Серебро 999.9',
                    desc: 'Лицевая сторона: портрет короля Карла III — без короны, работа художника Мартина Дженнингса. Вокруг портрета: имя короля, королевские титулы и номинал 2 фунта. С 2022 года после восшествия на престол портрет короля появляется на большинстве инвестиционных и памятных серебряных монет двора — включая Britannia и Sovereign — вместо Елизаветы II. Микротекстурированное защитное поле фона.',
                    img: BRITANNIA_2026_OBVERSE_IMG,
                    emoji: '👑',
                    transparent: true
                }
            ]
        }
    },

    // ─────────────────────────────────────────────────────────────────
    usa: {
        id: 'usa',
        flag: '🇺🇸',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/United_States_Mint_Philadelphia.jpg/800px-United_States_Mint_Philadelphia.jpg',
        he: {
            name: 'בית המטבע האמריקאי',
            subtitle: 'United States Mint — מייצר את American Silver Eagle',
            founded: 'נוסד 1792',
            location: 'פילדלפיה / ווסט פוינט, ארה"ב',
            website: 'www.usmint.gov',
            history: [
                {
                    title: 'ייסוד ומטבע הדולר',
                    text: 'בית המטבע האמריקאי נוסד ב-1792 בפילדלפיה, בירת ארה"ב דאז, בחוק הטבעה פדרלי ראשון. מטרתו הייתה ייצור מטבעות דולר זהב, כסף ונחושת לרפובליקה הצעירה. הבניין בפילדלפיה הוא המבנה הציבורי הפדרלי הראשון שנבנה בארצות הברית, ומאז שמש כסמל הכלכלה האמריקאית.'
                },
                {
                    title: 'American Silver Eagle — מטבע הכסף הנמכר בעולם',
                    text: 'מאז 1986, בית המטבע האמריקאי מייצר את ה-American Silver Eagle — המטבע ההשקעה הנמכר ביותר בהיסטוריה. המטבע עשוי כסף 999 (אונקיה), ועל פניו "Walking Liberty" — עיצוב מ-1916 שנחשב לציור המטבע הנפלא ביותר בהיסטוריה האמריקאית. ב-2021 עודכן צד הנשר (Reverse) לראשונה מאז 1986.'
                },
                {
                    title: 'מורשת ומוצרים מיוחדים',
                    text: 'בנוסף ל-Silver Eagle, בית המטבע הנפיק ב-2021 גרסאות מחודשות של Morgan Dollar ו-Peace Dollar — שתי מטבעות איקוניות מהמאה ה-20. סדרת "America the Beautiful" (2010–2021) כללה 56 מטבעות 5 אונקיות של אתרים לאומיים. בית המטבע האמריקאי שומר על מלאי אסטרטגי לאומי של כסף ב-West Point.'
                }
            ],
            products: [
                {
                    title: 'נשר אמריקני',
                    type: 'מטבע',
                    weight: '1 אונקיה',
                    year: '1986–',
                    purity: 'כסף 999',
                    desc: 'הנשר האמריקני הוא מטבע הבוליון הנפוץ בצפון אמריקה, מיוצר מאז 1986. למטבע מעמד הילך חוקי בארה"ב וערך נקוב סמלי של דולר אחד. נחשב לאחד המטבעות הנוחים למכירה מחדש ברחבי העולם.',
                    img: AMERICAN_SILVER_EAGLE_IMG,
                    emoji: '🦅',
                    transparent: true
                },
                {
                    title: 'ביזון אמריקאי — מטבע זיכרון 2001',
                    type: 'מטבע זיכרון',
                    weight: '1 אונקיה',
                    year: '2001',
                    purity: 'כסף 999',
                    desc: 'מטבע זיכרון כסף של בית המטבע האמריקאי, הוצע בקיץ 2001 עד גמר המלאי (500,000 יחידות). המטבע מציין את פתיחת המוזיאון הלאומי לעם האינדיאני האמריקאי. העיצוב מבוסס על מטבע הביזון הקלאסי (1913–1938): פרופיל יליד אמריקאי בצד אחד וביזון בצד השני. עוצב על ידי הפסל ג\'יימס ארל פרייזר.',
                    img: AMERICAN_BUFFALO_2001_IMG,
                    emoji: '🦬',
                    transparent: true
                },
                {
                    title: 'מטיל כסף 10 אונקיות — Sunshine Mint',
                    type: 'מטיל',
                    weight: '10 אונקיות',
                    year: '',
                    purity: 'כסף 999',
                    desc: 'מטיל השקעה אמריקאי מיצרן Sunshine Minting — אחד מיצרני הכסף הפרטיים המובילים בארה"ב. על המטיל: לוגו הנשר, טוהר 999 ומשקל 10 אונקיות. מטילים אלו נפוצים בקרב משקיעי כסף פיזי: פרמיה לרוב נמוכה יותר ממטבעות, משקל ברור ונזילות טובה. חלק מהמטילים כוללים שכבת אבטחה מיקרוסקופית לאימות.',
                    img: SUNSHINE_MINT_10OZ_BAR_IMG,
                    emoji: '🥈',
                    transparent: true
                }
            ]
        },
        en: {
            name: 'United States Mint',
            subtitle: 'United States Mint — Home of the American Silver Eagle',
            founded: 'Founded 1792',
            location: 'Philadelphia / West Point, USA',
            website: 'www.usmint.gov',
            history: [
                { title: 'Foundation & the Dollar', text: 'The United States Mint was founded in 1792 in Philadelphia, then the nation\'s capital, under the first federal coinage act. Its purpose was to produce gold, silver and copper dollar coins for the young republic. The Philadelphia building was the first federal public building constructed in the United States, and has since stood as a symbol of American economic strength.' },
                { title: 'American Silver Eagle — World\'s Best-Selling Bullion Coin', text: 'Since 1986, the US Mint has produced the American Silver Eagle — the best-selling investment coin in history. Struck in .999 fine silver (1 oz), its obverse features "Walking Liberty," a design from 1916 widely considered the finest American coin artwork ever created. In 2021, the reverse (Eagle side) was updated for the first time in 35 years.' },
                { title: 'Heritage & Special Products', text: 'In addition to the Silver Eagle, the Mint issued redesigned Morgan and Peace Dollars in 2021 — two iconic 20th-century coins now struck in .999 fine silver. The "America the Beautiful" series (2010–2021) comprised 56 five-ounce coins depicting national parks. The US Mint maintains a national strategic silver reserve at West Point.' }
            ],
            products: [
                { title: 'American Silver Eagle', type: 'Coin', weight: '1 oz', year: '1986–', purity: '.999 Silver', desc: 'The American Silver Eagle is the most popular bullion coin in North America. Minting began in 1986 in both gold and silver. It holds legal tender status in the US with a symbolic face value of $1. Widely recognized and relatively easy to redeem worldwide.', img: AMERICAN_SILVER_EAGLE_IMG, emoji: '🦅', transparent: true },
                { title: 'American Buffalo Commemorative (2001)', type: 'Commemorative', weight: '1 oz', year: '2001', purity: '.999 Silver', desc: 'The American Buffalo Commemorative Silver Dollar was offered by the U.S. Mint from June 7 to June 21, 2001, until it sold out. Authorized mintage: 500,000 coins. It commemorates the opening of the National Museum of the American Indian. The design recreates the famous Buffalo Nickel (1913–1938) with two American icons: a Native American profile and an American buffalo. Chief Iron Tail, Chief Big Tree, and Chief Two Moons modeled for sculptor James Earle Fraser; the buffalo model came from the Central Park Zoo. Fraser (1876–1953) was also known for "The End of the Trail" and other major American medals.', img: AMERICAN_BUFFALO_2001_IMG, emoji: '🦬', transparent: true },
                { title: 'Sunshine Mint 10 oz Silver Bar', type: 'Bar', weight: '10 oz', year: '', purity: '.999 Silver', desc: 'Investment silver bar from Sunshine Minting — one of America\'s leading private mints. Stamped with the Sunshine Minting eagle logo, .999 FINE SILVER, and 10 OUNCES. Popular with physical silver stackers: typically lower premium per ounce than coins, clear weight, and good secondary-market liquidity. Some bars include MintMark SI micro-engraving for authentication.', img: SUNSHINE_MINT_10OZ_BAR_IMG, emoji: '🥈', transparent: true }
            ]
        },
        ru: {
            name: 'Монетный двор США',
            subtitle: 'United States Mint — дом American Silver Eagle',
            founded: 'Основан в 1792',
            location: 'Филадельфия / Вест-Пойнт, США',
            website: 'www.usmint.gov',
            history: [
                { title: 'Основание и доллар', text: 'Монетный двор США был основан в 1792 году в Филадельфии — тогдашней столице страны — на основании первого федерального закона о чеканке монет. Его цель — производство золотых, серебряных и медных долларовых монет для молодой республики. Здание в Филадельфии стало первым федеральным общественным зданием, построенным в США.' },
                { title: 'American Silver Eagle — самая продаваемая монета в мире', text: 'С 1986 года Монетный двор США выпускает American Silver Eagle — самую продаваемую инвестиционную монету в истории. Чеканится из серебра .999 (1 унция), на аверсе изображена «Идущая Свобода» — дизайн 1916 года, считающийся лучшим произведением монетного искусства США. В 2021 году реверс (орёл) был обновлён впервые за 35 лет.' },
                { title: 'Наследие и специальные выпуски', text: 'В 2021 году монетный двор выпустил обновлённые Morgan Dollar и Peace Dollar из серебра .999. Серия «Красоты Америки» (2010–2021) включала 56 пятиунцевых монет с изображением национальных парков. Монетный двор США хранит национальный стратегический резерв серебра в Вест-Пойнте.' }
            ],
            products: [
                { title: 'Американский серебряный орёл', type: 'Монета', weight: '1 унция', year: '1986–', purity: 'Серебро 999', desc: 'Американский серебряный орёл — самая популярная инвестиционная монета в Северной Америке, выпускается с 1986 года. Имеет статус законного платёжного средства США с номиналом 1 доллар. Широко известна и относительно легко продаётся по всему миру.', img: AMERICAN_SILVER_EAGLE_IMG, emoji: '🦅', transparent: true },
                { title: 'Американский бизон — памятная 2001', type: 'Памятная', weight: '1 унция', year: '2001', purity: 'Серебро 999', desc: 'Памятная серебряная монета Монетного двора США, продавалась летом 2001 года до полного распродажа (500 000 экземпляров). Посвящена открытию Национального музея американских индейцев. Дизайн основан на классической монете с бизоном (1913–1938): профиль коренного американца и бизон. Автор — скульптор Джеймс Эрл Фрейзер.', img: AMERICAN_BUFFALO_2001_IMG, emoji: '🦬', transparent: true },
                { title: 'Слиток 10 унций — Sunshine Mint', type: 'Слиток', weight: '10 унций', year: '', purity: 'Серебро 999', desc: 'Инвестиционный слиток от частного монетного двора Sunshine Minting — одного из ведущих производителей серебра в США. На слитке: логотип орла, проба 999 и вес 10 унций. Популярен у инвесторов: обычно ниже премия за унцию, чем у монет, понятный вес и хорошая ликвидность. На некоторых слитках есть микрогравировка для проверки подлинности.', img: SUNSHINE_MINT_10OZ_BAR_IMG, emoji: '🥈', transparent: true }
            ]
        }
    },

    // ─────────────────────────────────────────────────────────────────
    canada: {
        id: 'canada',
        flag: '🇨🇦',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Royal_Canadian_Mint_main_fa%C3%A7ade.JPG/800px-Royal_Canadian_Mint_main_fa%C3%A7ade.JPG',
        he: {
            name: 'בית המטבע המלכותי הקנדי',
            subtitle: 'Royal Canadian Mint — מייצר את Silver Maple Leaf',
            founded: 'נוסד 1908',
            location: 'אוטווה (אספנות) / ויניפג (השקעות), קנדה',
            website: 'www.mint.ca',
            history: [
                { title: 'ייסוד ומסורת קנדית', text: 'בית המטבע המלכותי הקנדי נוסד ב-1908 באוטווה, כשקנדה ביקשה עצמאות מוניטרית מבריטניה. עד אז מטבעות קנדיים הוטבעו בלונדון. הבניין ההיסטורי המרהיב באוטווה, שנבנה בסגנון גותי, הפך לאחד מסמלי העיר. בשנת 1988 נפתח מפעל שני בויניפג לייצור מטבעות השקעה בהיקפים גדולים.' },
                { title: 'Silver Maple Leaf — שיא הטוהר', text: 'Silver Maple Leaf הוכנס לשוק ב-1988 כמטבע ההשקעה הקנדי המרכזי. המטבע עשוי כסף 9999 (99.99% טהור) — טוהר גבוה יותר מרוב מתחריו. עלה על עלה מייפל האיקוני של קנדה מקשט את פניו, ואת גב המטבע מקשט דיוקן המלכה. הוא הילך חוקי בשווי 5 דולר קנדי.' },
                { title: 'חדשנות וסדרות מיוחדות', text: 'בית המטבע הקנדי חלוץ טכנולוגי — הוא הנפיק את מטבע ה-"25 קילוגרם" הגדול בעולם (2007), ומטבעות עם הולוגרמה. סדרות "Call of the Wild", "Predator Series" ו-"Birds of Prey" הפכו לפנומן אספנות עולמי. הקנדים ייצרו גם מטבעות עם רובידיום — יסוד נדיר, בפעם הראשונה בהיסטוריית המטבעות.' }
            ],
            products: [
            ]
        },
        en: {
            name: 'Royal Canadian Mint',
            subtitle: 'Royal Canadian Mint — Home of the Silver Maple Leaf',
            founded: 'Founded 1908',
            location: 'Ottawa (collectibles) / Winnipeg (bullion), Canada',
            website: 'www.mint.ca',
            history: [
                { title: 'Foundation & Canadian Tradition', text: 'The Royal Canadian Mint was founded in 1908 in Ottawa, as Canada sought monetary independence from Britain. Until then, Canadian coins were struck in London. The magnificent Gothic-style historic building in Ottawa became one of the city\'s landmarks. In 1988, a second facility opened in Winnipeg for large-scale bullion coin production.' },
                { title: 'Silver Maple Leaf — Peak Purity', text: 'The Silver Maple Leaf was introduced in 1988 as Canada\'s flagship investment coin. Struck in .9999 fine silver (99.99% pure) — higher purity than most competitors. Canada\'s iconic maple leaf graces the obverse, while the monarch\'s portrait adorns the reverse. It is legal tender at C$5 face value.' },
                { title: 'Innovation & Special Series', text: 'The Royal Canadian Mint is a technology pioneer — it issued the world\'s largest coin (25kg, 2007) and holographic coins. The "Call of the Wild," "Predator Series," and "Birds of Prey" series became global collecting phenomena. Canada also produced coins incorporating rubidium — a rare element — for the first time in coin history.' }
            ],
            products: [
            ]
        },
        ru: {
            name: 'Королевский монетный двор Канады',
            subtitle: 'Royal Canadian Mint — дом Silver Maple Leaf',
            founded: 'Основан в 1908',
            location: 'Оттава (коллекционные) / Виннипег (инвестиционные), Канада',
            website: 'www.mint.ca',
            history: [
                { title: 'Основание и канадская традиция', text: 'Королевский монетный двор Канады был основан в 1908 году в Оттаве, когда Канада стремилась к монетарной независимости от Великобритании. До этого канадские монеты чеканились в Лондоне. Великолепное историческое здание в готическом стиле в Оттаве стало одной из достопримечательностей города. В 1988 году в Виннипеге открылся второй завод для крупномасштабного производства инвестиционных монет.' },
                { title: 'Silver Maple Leaf — вершина чистоты', text: 'Silver Maple Leaf был представлен в 1988 году как главная канадская инвестиционная монета. Чеканится из серебра .9999 (99,99% чистоты) — более высокая проба, чем у большинства конкурентов. Знаменитый кленовый лист Канады украшает аверс, а портрет монарха — реверс. Является законным платёжным средством номиналом C$5.' },
                { title: 'Инновации и специальные серии', text: 'Королевский монетный двор Канады — технологический пионер. Он выпустил крупнейшую монету в мире (25 кг, 2007) и голографические монеты. Серии «Call of the Wild», «Predator Series» и «Birds of Prey» стали мировыми коллекционными феноменами. Канада также выпустила монеты с рубидием — редким элементом — впервые в истории монетного дела.' }
            ],
            products: [
            ]
        }
    },

    // ─────────────────────────────────────────────────────────────────
    perth: {
        id: 'perth',
        flag: '🇦🇺',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Perth_Mint%2C_WA%2C_2023.jpg/800px-Perth_Mint%2C_WA%2C_2023.jpg',
        he: {
            name: 'בית המטבע של פרת\'',
            subtitle: 'Perth Mint — קנגרו, קוקאברה וסדרת הירח',
            founded: 'נוסד 1899',
            location: 'פרת\', מערב אוסטרליה',
            website: 'www.perthmint.com',
            history: [
                { title: 'ייסוד בעידן זהב', text: 'בית המטבע של פרת\' נוסד ב-1899 במהלך "בהלת הזהב" האוסטרלית, כסניף של בית המטבע המלכותי הבריטי. מטרתו הייתה עיבוד זהב המופק ממכרות ווסטרן אוסטרליה. לאחר שאוסטרליה הקימה את בית המטבע הלאומי שלה ב-1965, פרת\' המשיך לפעול כבית מטבע ממשלתי עצמאי של ווסטרן אוסטרליה, עם מוניטין עולמי.' },
                { title: 'סדרות הכסף האיקוניות', text: 'Silver Kookaburra הופיעה ב-1990 כאחת מסדרות הכסף הראשונות בעולם עם עיצוב משתנה מדי שנה. Silver Kangaroo הושק ב-2016. סדרת "Lunar" (לוח שנה סיני) הוחלה על מטבעות כסף ב-1999, עם 12 מטבעות המייצגים בעלי חיים מהגלגל הסיני — אחת מסדרות האספנות הפופולריות בעולם. לפרת\' גם Silver Koala ו-Silver Swan.' },
                { title: 'טוהר ואמינות', text: 'Perth Mint ידוע בייצור מטבעות עם טוהר 9999 ו-99999 (Five Nines — 99.999%). הוא מציע שירות "סוכנות" ייחודי המאפשר למשקיעים לרכוש ולאחסן כסף בכספת פרת\' עצמה. בית המטבע גם מציע מוצרי כסף עם ציפוי זהב (gilded) ועם צבע. הוא גם מייצר מטבעות עבור ממשלות אחרות.' }
            ],
            products: [
            ]
        },
        en: {
            name: 'Perth Mint',
            subtitle: 'Perth Mint — Kangaroo, Kookaburra & Lunar Series',
            founded: 'Founded 1899',
            location: 'Perth, Western Australia',
            website: 'www.perthmint.com',
            history: [
                { title: 'Gold Rush Foundation', text: 'The Perth Mint was founded in 1899 during the Australian gold rush, as a branch of the British Royal Mint. Its purpose was to process gold extracted from Western Australian mines. After Australia established its national mint in 1965, Perth continued as an independent state government mint for Western Australia, building a world-class reputation.' },
                { title: 'Iconic Silver Series', text: 'The Silver Kookaburra launched in 1990 as one of the world\'s first silver series with an annually changing design. The Silver Kangaroo launched in 2016. The "Lunar" series (Chinese calendar) was applied to silver coins in 1999, with 12 coins representing Chinese zodiac animals — one of the world\'s most popular collecting series. Perth also produces Silver Koala and Silver Swan.' },
                { title: 'Purity & Reliability', text: 'Perth Mint is renowned for coins of .9999 and .99999 purity (Five Nines — 99.999%). It offers a unique "Certificate" storage service allowing investors to buy and store silver in Perth\'s own vault. The mint also offers gold-plated (gilded) and coloured silver products. It also strikes coins for other governments worldwide.' }
            ],
            products: [
            ]
        },
        ru: {
            name: 'Монетный двор Перта',
            subtitle: 'Perth Mint — Кенгуру, Кукабарра и Лунная серия',
            founded: 'Основан в 1899',
            location: 'Перт, Западная Австралия',
            website: 'www.perthmint.com',
            history: [
                { title: 'Основание в эпоху золотой лихорадки', text: 'Монетный двор Перта был основан в 1899 году во время австралийской золотой лихорадки как филиал британского Королевского монетного двора. Его задачей была переработка золота из шахт Западной Австралии. После создания национального монетного двора Австралии в 1965 году Перт продолжил работу как независимый государственный монетный двор штата.' },
                { title: 'Легендарные серебряные серии', text: 'Silver Kookaburra запустили в 1990 году как одну из первых в мире серий серебра с меняющимся ежегодным дизайном. Silver Kangaroo появился в 2016 году. «Лунная» серия (китайский календарь) вышла на серебряных монетах в 1999 году — 12 монет с животными китайского зодиака, ставших одними из самых популярных в мире. Перт также выпускает Silver Koala и Silver Swan.' },
                { title: 'Чистота и надёжность', text: 'Монетный двор Перта известен монетами с пробой .9999 и .99999 (Five Nines — 99,999%). Он предлагает уникальный сервис хранения, позволяющий инвесторам покупать и хранить серебро в собственном хранилище Перта. Двор также выпускает позолоченные и цветные серебряные изделия и чеканит монеты для правительств других стран.' }
            ],
            products: [
            ]
        }
    },

    // ─────────────────────────────────────────────────────────────────
    austria: {
        id: 'austria',
        flag: '🇦🇹',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Am_Heumarkt_1_Hauptmuenzamt_DSC_7408w.jpg/800px-Am_Heumarkt_1_Hauptmuenzamt_DSC_7408w.jpg',
        he: {
            name: 'בית המטבע הווינאי',
            subtitle: 'Münze Österreich — מייצר את Wiener Philharmoniker',
            founded: 'נוסד 1194',
            location: 'וינה, אוסטריה',
            website: 'www.muenzeoesterreich.at',
            history: [
                { title: 'ייסוד אימפריאלי', text: 'בית המטבע הווינאי (Münze Österreich) נוסד ב-1194 ביוזמת הדוכס לאופולד V ​​מאוסטריה, מכסף שנגבה מפדיון השבי של ריצ\'רד לב-הארי. זהו אחד מבתי המטבע הפעילים הוותיקים בעולם. לאורך מאות שנים שירת את האימפריה ההבסבורגית, ייצר מטבעות לקיסרים, ואת מורשת אירופה המלכותית.' },
                { title: 'Wiener Philharmoniker — הנמכר ביותר באירופה', text: 'ב-1989 השיק בית המטבע הווינאי את Wiener Philharmoniker — מטבע כסף 999 שהפך לנמכר ביותר באירופה. המטבע מוקדש לתזמורת הפילהרמונית הווינאית, אחת הנודעות בעולם. פני המטבע מקשטים כלים מוזיקליים של התזמורת, ועל גבו האורגן ב"זאל מוזיקפרין". הוא הילך חוקי באוסטריה.' },
                { title: 'הנבה ומדלי', text: 'מעבר ל-Philharmoniker, בית המטבע הווינאי מנפיק את Vienna Mint Collection — כולל מטבעות כסף נדירים עם עיצובים של אמני וינה. מטבע ה-100 יורו זהב הוא אחד הגדולים שהנפיק. בית המטבע גם ידוע בייצור מדלי כסף ועיטורים מדינתיים למדינות אחרות. הוא שיתף פעולה עם אמנים עולמיים לסדרות מוגבלות.' }
            ],
            products: [
            ]
        },
        en: {
            name: 'Austrian Mint (Vienna)',
            subtitle: 'Münze Österreich — Home of the Wiener Philharmoniker',
            founded: 'Founded 1194',
            location: 'Vienna, Austria',
            website: 'www.muenzeoesterreich.at',
            history: [
                { title: 'Imperial Foundation', text: 'The Austrian Mint (Münze Österreich) was founded in 1194 at the initiative of Duke Leopold V of Austria, from silver raised through the ransom of Richard the Lionheart. It is one of the oldest continuously operating mints in the world. For centuries it served the Habsburg Empire, producing coins for emperors and carrying the legacy of European royal tradition.' },
                { title: 'Wiener Philharmoniker — Europe\'s Best-Seller', text: 'In 1989, the Austrian Mint launched the Wiener Philharmoniker — a .999 fine silver coin that became Europe\'s best-selling bullion coin. The coin is dedicated to the Vienna Philharmonic Orchestra, one of the world\'s most renowned. The obverse features instruments of the orchestra, while the reverse shows the great organ of the Wiener Musikverein. It is legal tender in Austria.' },
                { title: 'Innovation & Medals', text: 'Beyond the Philharmoniker, the Austrian Mint issues the Vienna Mint Collection — including rare silver coins with designs by Viennese artists. Its 100 Euro gold coin is one of the largest ever issued. The mint also produces silver medals and state decorations for other countries, and has collaborated with international artists for limited series.' }
            ],
            products: [
            ]
        },
        ru: {
            name: 'Австрийский монетный двор (Вена)',
            subtitle: 'Münze Österreich — дом Wiener Philharmoniker',
            founded: 'Основан в 1194',
            location: 'Вена, Австрия',
            website: 'www.muenzeoesterreich.at',
            history: [
                { title: 'Имперское основание', text: 'Австрийский монетный двор (Münze Österreich) был основан в 1194 году по инициативе герцога Леопольда V Австрийского — из серебра, полученного в качестве выкупа за Ричарда Львиное Сердце. Это один из старейших непрерывно действующих монетных дворов в мире. Столетиями он служил Габсбургской империи, чеканя монеты для императоров.' },
                { title: 'Wiener Philharmoniker — лидер продаж Европы', text: 'В 1989 году Австрийский монетный двор выпустил Wiener Philharmoniker — монету из серебра .999, ставшую самой продаваемой инвестиционной монетой в Европе. Монета посвящена Венскому филармоническому оркестру. На аверсе изображены инструменты оркестра, на реверсе — орган Wiener Musikverein. Является законным платёжным средством в Австрии.' },
                { title: 'Инновации и медали', text: 'Помимо Philharmoniker, Австрийский монетный двор выпускает Vienna Mint Collection — редкие серебряные монеты с дизайном венских художников. Его золотая монета номиналом 100 евро — одна из крупнейших когда-либо выпускавшихся. Двор также производит серебряные медали и государственные награды для других стран.' }
            ],
            products: [
            ]
        }
    },

    // ─────────────────────────────────────────────────────────────────
    mexico: {
        id: 'mexico',
        flag: '🇲🇽',
        buildingImg: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Antigua_Casa_de_Moneda.JPG/800px-Antigua_Casa_de_Moneda.JPG',
        he: {
            name: 'בית המטבע המקסיקני',
            subtitle: 'Casa de Moneda de México — הוותיק באמריקה מאז 1535',
            founded: 'נוסד 1535',
            location: 'סן לואיס פוטוסי, מקסיקו',
            website: 'www.gob.mx/cmm',
            history: [
                { title: 'הוותיק ביותר באמריקה', text: 'Casa de Moneda de México, הוקמה ב-1535 בצו המלך קרלוס הראשון של ספרד — בית המטבע הראשון והוותיק ביותר ביבשת אמריקה. כ-500 שנות פעולה רצופה. הבניין ההיסטורי בלב העיר מקסיקו (כיום מוזיאון נומיסמטי) הוא אתר מורשת עולמית של יונסק"ו. המינט הדף מטבעות כסף המפורסמים "Reales" שמימנו את הכלכלה הקולוניאלית של ספרד.' },
                { title: 'Onza de Plata Libertad — כסף ההשקעה המקסיקני', text: 'ב-1982 הנפיק בית המטבע המקסיקני את ה-Onza de Plata Libertad — המטבע ההשקעה הרשמי של מקסיקו. על פני המטבע ניצבת "הניצחון המכונף" (מלאך העצמאות), אנדרטת העצמאות של מקסיקו סיטי. הגב מקשט נשר מקסיקני עם נחש — סמל המדינה. הוא מיוצר בכסף 999 ו-9999, בגדלים מ-1/20 אונקיה עד 5 אונקיות.' },
                { title: 'מורשת אמנותית ועושר', text: 'מקסיקו הייתה בעל מכרות הכסף הגדולים בעולם — מכרות גואנחוואטו וסאקאטקאס סיפקו לאורך מאות שנים חלק ניכר מהכסף הגלובלי. Libertad נחשב לאחד המטבעות עם העיצוב הנחשב ביותר בשוק העולמי. המינט מייצר גם מטבעות זיכרון עם עיצובים פרה-קולומביאניים — אצטקים, מאיה ועוד.' }
            ],
            products: [
            ]
        },
        en: {
            name: 'Casa de Moneda de México',
            subtitle: 'Casa de Moneda de México — The Americas\' oldest mint since 1535',
            founded: 'Founded 1535',
            location: 'San Luis Potosí, Mexico',
            website: 'www.gob.mx/cmm',
            history: [
                { title: 'Oldest Mint in the Americas', text: 'Casa de Moneda de México was established in 1535 by decree of King Charles I of Spain — the first and oldest mint in the entire American continent. Nearly 500 years of continuous operation. The historic building in Mexico City (now a numismatic museum) is a UNESCO World Heritage Site. The mint struck the famous silver "Reales" coins that financed Spain\'s colonial economy.' },
                { title: 'Onza de Plata Libertad — Mexican Investment Silver', text: 'In 1982, the Mexican Mint issued the Onza de Plata Libertad — Mexico\'s official investment coin. The obverse features the "Winged Victory" (Angel of Independence), Mexico City\'s landmark monument. The reverse displays the Mexican eagle with a serpent — the national symbol. Produced in .999 and .9999 silver, in sizes from 1/20 oz to 5 oz.' },
                { title: 'Artistic Heritage & Wealth', text: 'Mexico was home to the world\'s largest silver mines — the Guanajuato and Zacatecas mines supplied a significant portion of global silver for centuries. The Libertad is considered one of the most beautifully designed coins in the world market. The mint also produces commemorative coins with Pre-Columbian designs — Aztec, Maya and more.' }
            ],
            products: [
            ]
        },
        ru: {
            name: 'Монетный двор Мексики',
            subtitle: 'Casa de Moneda de México — старейший монетный двор Америки с 1535 г.',
            founded: 'Основан в 1535',
            location: 'Сан-Луис-Потоси, Мексика',
            website: 'www.gob.mx/cmm',
            history: [
                { title: 'Старейший в Америке', text: 'Casa de Moneda de México был основан в 1535 году по указу короля Карла I Испанского — первый и старейший монетный двор на всём американском континенте. Почти 500 лет непрерывной работы. Историческое здание в Мехико (ныне нумизматический музей) — объект Всемирного наследия ЮНЕСКО. Двор чеканил знаменитые серебряные «Реалы», финансировавшие колониальную экономику Испании.' },
                { title: 'Onza de Plata Libertad — мексиканское инвестиционное серебро', text: 'В 1982 году Мексиканский монетный двор выпустил Onza de Plata Libertad — официальную инвестиционную монету Мексики. На аверсе — «Крылатая победа» (Ангел Независимости), символ Мехико. Реверс украшен мексиканским орлом со змеёй — национальным гербом. Чеканится из серебра .999 и .9999 в размерах от 1/20 унции до 5 унций.' },
                { title: 'Художественное наследие и богатство', text: 'Мексика была родиной крупнейших серебряных рудников мира — шахты Гуанахуато и Сакатекас веками снабжали значительную часть мирового серебра. Libertad считается одной из красивейших монет на мировом рынке. Монетный двор также выпускает памятные монеты с доколумбийскими дизайнами — ацтекскими, майя и другими.' }
            ],
            products: [
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

    // Update lang tabs — scope to mint-detail-screen only to avoid bleeding into guide tabs
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

    // Products HTML — only user-uploaded Supabase images
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
            <span class="mint-record-icon" aria-hidden="true">🏆</span>
            <div class="mint-record-body">
                <h4>${escapeHtml(r.title)}</h4>
                <p>${escapeHtml(r.text)}</p>
            </div>
        </div>
    `).join('');

    // Products section label by lang
    const labels = {
        he: { history: '📖 היסטוריה', records: '🏆 שיאים ועובדות', products: '🪙 מוצרי כסף', purity: 'טוהר', more: 'אתר רשמי' },
        en: { history: '📖 History', records: '🏆 Records & Highlights', products: '🪙 Silver Products', purity: 'Purity', more: 'Official Website' },
        ru: { history: '📖 История', records: '🏆 Рекорды и факты', products: '🪙 Серебряные изделия', purity: 'Проба', more: 'Официальный сайт' }
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
                    <span class="mint-meta-chip">📅 ${escapeHtml(d.founded)}</span>
                    <span class="mint-meta-chip">📍 ${escapeHtml(d.location)}</span>
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
        goToScreen('museum-screen');
    });
}

// ── SILVER GUIDE ─────────────────────────────────────────────────────
const GUIDE_DATA = {
    he: {
        dir: 'rtl',
        chapters: [
            {
                icon: '🔰',
                title: 'מה זה כסף פיזי — מבוא למתחיל',
                content: `
                    <p>כסף פיזי הוא כסף טהור בצורת <strong>מטבעות</strong> או <strong>מטילים</strong> שאתה מחזיק בידיך ממש — לא נייר, לא מניה, לא ETF. אתה הבעלים המוחלט.</p>
                    <p><strong>מה ההבדל בין מטבע למטיל?</strong></p>
                    <ul>
                        <li><strong>מטבע (Coin):</strong> מוטבע ע"י מינט ממשלתי (כמו מינט ישראל, ה-Royal Mint). יש לו ערך נקוב רשמי, עיצוב אמנותי, ולעיתים ערך קולקטיבי מעל מחיר הכסף.</li>
                        <li><strong>מטיל (Bar):</strong> גוש כסף פשוט, לרוב זול יותר לאונקיה, מיוצר ע"י מפעלים פרטיים (כמו Heraeus, Umicore). אין לו ערך קולקטיבי.</li>
                    </ul>
                    <div class="guide-tip-box">💡 <strong>טיפ:</strong> לרוב מטילים זולים יותר לאונקיה. מטבעות מוכרים מהר יותר וקל יותר לאמת את אמיתותם.</div>
                    <p><strong>גדלים נפוצים:</strong> ¼ אונקיה, ½ אונקיה, 1 אונקיה (הנפוץ ביותר), 5 אונקיות, 10 אונקיות, 1 ק"ג, 5 ק"ג.</p>
                    <p><strong>טוהר:</strong> כסף טהור הוא .999 (99.9%) או .9999 (99.99%). מטבעות ישנים כמו Morgan Dollar הם .900 — לא כסף השקעה.</p>
                `
            },
            {
                icon: '🛒',
                title: 'איפה קונים כסף בישראל — 2026',
                content: `
                    <p><strong>אפשרויות עיקריות לרכישה בארץ:</strong></p>
                    <ul>
                        <li><strong>מינט ישראל (החברה הישראלית למדליות ולמטבעות):</strong> האתר הרשמי <em>coins.co.il</em>. מטבעות מוכרים ומאומתים לחלוטין. פרמיום גבוה יחסית.</li>
                        <li><strong>חנויות מטבעות פרטיות:</strong> ישנן חנויות מומחיות במרכז ובצפון. בדוק ביקורות ואמינות לפני קנייה.</li>
                        <li><strong>פלטפורמות מקוונות בינלאומיות:</strong> <em>Bullion By Post</em>, <em>Silver Gold Bull</em>, <em>Europäisches Münzhaus</em> — משלוח לישראל אפשרי, שים לב לעמלות מכס ו-VAT.</li>
                        <li><strong>שוק אפור / יחידים:</strong> פורומים, קבוצות טלגרם — <strong>סיכון גבוה לזיופים! מומלץ רק עם בדיקה מקצועית.</strong></li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>אזהרה:</strong> מכס ישראלי — ייבוא אישי של כסף מזכה בפטור ממע"מ אם הוא מוגדר כ"מטיל כסף השקעה". בדוק עם המוכר לפני הזמנה.</div>
                `
            },
            {
                icon: '💰',
                title: 'איפה מוכרים כסף בישראל — 2026',
                content: `
                    <p>מכירה בארץ מוגבלת יותר מקנייה. עיקר האפשרויות:</p>
                    <ul>
                        <li><strong>חנויות מטבעות מורשות:</strong> הן הדרך הכי מהירה לפדיון. מצפות לקנות ממך מתחת למחיר ספוט — זה הרווח שלהן.</li>
                        <li><strong>מינט ישראל:</strong> מקבל מטבעות ישראלים לפדיון בתנאים מסוימים.</li>
                        <li><strong>פלטפורמות P2P (יחיד-ליחיד):</strong> קבוצות פייסבוק וטלגרם ייעודיות. מחיר טוב יותר אך תהליך ארוך יותר.</li>
                        <li><strong>בינלאומי:</strong> מכירה לחנויות אירופיות / אמריקאיות — רלוונטי לכמויות גדולות.</li>
                    </ul>
                    <div class="guide-tip-box">💡 <strong>טיפ:</strong> מטבעות של מינטים מוכרים (Britannia, Maple Leaf, American Eagle) נמכרים <strong>הרבה יותר מהר</strong> ובמחיר טוב יותר מאשר מטבעות לא מוכרים.</div>
                `
            },
            {
                icon: '💸',
                title: 'כמה לקנות — אסטרטגיית כניסה למתחיל',
                content: `
                    <p>אין כמות "נכונה" — הכל תלוי במטרה שלך.</p>
                    <p><strong>עקרונות בסיס:</strong></p>
                    <ul>
                        <li>מרבית המומחים ממליצים <strong>5%–15%</strong> מהחסכונות בנכסים קשים (כסף + זהב + מטח).</li>
                        <li>התחל עם <strong>כמות קטנה</strong> (1–5 אונקיות) כדי להבין את התהליך לפני שמשקיעים סכומים גדולים.</li>
                        <li>קנה בקביעות (<strong>Dollar Cost Averaging</strong>) — כל חודש כמות קבועה, בלי לנחש את השוק.</li>
                        <li>שמור תמיד <strong>נזילות</strong> — אל תשקיע כסף שאתה עלול לצטרך בחירום.</li>
                    </ul>
                    <div class="guide-tip-box">💡 מינימום מוצלח להתחיל: <strong>10 אונקיות כסף טהור (.999)</strong> — שווה לך בניהול, אחסון ופיזור.</div>
                `
            },
            {
                icon: '❌',
                title: 'טעויות של מתחילים — הדברים שכולם עושים בפעם הראשונה',
                content: `
                    <ul>
                        <li>🚫 <strong>קונים ממקור לא מוכר</strong> — זיוף כסף נפוץ. הכלל הברזל: קנה רק ממינטים מוכרים או דילרים מורשים.</li>
                        <li>🚫 <strong>לא בודקים את הפרמיום</strong> — מחיר ה-"כסף" שאתה קונה כולל פרמיום מעל ספוט. פרמיום גבוה מדי = נזק ברווחיות.</li>
                        <li>🚫 <strong>מאחסנים בבית ללא ביטוח</strong> — גנב אחד, ופרידה מההשקעה. שקול כספת ביטחון או שירות אחסון.</li>
                        <li>🚫 <strong>קונים "כסף ישן" מוזל</strong> — מטבעות .900 (כמו Morgan Dollars) אינם כסף השקעה. בדוק תמיד את הטוהר.</li>
                        <li>🚫 <strong>ציפייה לרווח מהיר</strong> — כסף הוא חיסכון לטווח ארוך, לא מסחר. מי שקנה ב-2011 בשיא חיכה 10 שנים.</li>
                        <li>🚫 <strong>קניית כסף "מוכסף" (silver plated)</strong> — ציפוי כסף בלבד. ערך אפסי. תמיד בדוק: .999 Fine Silver.</li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>בדיקת אמיתות:</strong> מגנט, מבחן קול, מכשיר Sigma Metalytics — זה ההשקעה הכי חכמה לפני כל קנייה גדולה.</div>
                `
            },
            {
                icon: '🏦',
                title: 'אחסון בטוח — איך שומרים את הכסף',
                content: `
                    <p>אחסון נכון שווה כסף. אפשרויות נפוצות:</p>
                    <ul>
                        <li><strong>כספת ביתית:</strong> נוחה, זמינה. חייבת להיות מחוברת לקיר/רצפה. ביטוח נפרד מומלץ.</li>
                        <li><strong>תא בנקאי (Safe Deposit Box):</strong> בטוח מגנבה. לא מכוסה על ידי ביטוח הבנק — צריך ביטוח נפרד.</li>
                        <li><strong>שירות אחסון מקצועי (Vault Storage):</strong> חברות כמו Brinks, Loomis — מבוטח ומנוטר. פתרון לכמויות גדולות.</li>
                    </ul>
                    <p><strong>כלל חשוב:</strong> אל תספר לכולם שיש לך כסף פיזי. OPSEC (אבטחת מידע אישי) חשוב כמו אבטחת הכסף עצמו.</p>
                    <div class="guide-tip-box">💡 <strong>אחסון:</strong> הימנע מחשיפה לאוויר לח. שקיות ניילון עם silica gel שומרות על הברק ומונעות חמצון.</div>
                `
            },
            {
                icon: '📊',
                title: 'הבנת מחיר הכסף — ספוט, פרמיום ומחזורים',
                content: `
                    <p><strong>מחיר ספוט (Spot Price):</strong> המחיר הגלובלי של אונקיה כסף 999 פיור בשוק הסחורות (COMEX). זה המחיר "הבסיסי".</p>
                    <p><strong>פרמיום (Premium):</strong> הסכום הנוסף שאתה משלם מעל הספוט. מכסה ייצור, הפצה ורווח הדילר.</p>
                    <ul>
                        <li>מטבע Britannia 1oz = ספוט + 10%–18%</li>
                        <li>מטיל 1kg = ספוט + 3%–8%</li>
                        <li>מטבע ישראל מינט = ספוט + 15%–25%</li>
                    </ul>
                    <p><strong>מחזורים היסטוריים:</strong> כסף נסק ב-2011 ל-$49 לאונקיה ואז צנח. ב-2020 שוב עלה בחדות ל-$29. ב-2024–2025 עלה מעל $30 ושמר יציבות.</p>
                    <div class="guide-tip-box">💡 <strong>יחס זהב-כסף (Gold/Silver Ratio):</strong> כשהיחס גבוה (>80), כסף "זול" יחסית לזהב. יחס היסטורי: ~60:1. נכון לשנת 2026: עוקב אחר הגרף שלנו בלשונית "גרפים".</div>
                `
            },
            {
                icon: '⚖️',
                title: 'מיסוי ורגולציה בישראל — 2026',
                content: `
                    <p>מס רווח הון על מכירת כסף פיזי בישראל:</p>
                    <ul>
                        <li><strong>יחידים:</strong> 25% מס רווח הון על הרווח (מחיר מכירה פחות מחיר קנייה).</li>
                        <li><strong>מע"מ:</strong> כסף פיזי לצורך השקעה פטור ממע"מ בישראל (בניגוד לתכשיטים).</li>
                        <li><strong>דיווח:</strong> עסקאות מעל סף מסוים (בדרך כלל 50,000 ₪) עשויות לדרוש דיווח לרשות המסים.</li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>חשוב:</strong> שמור תיעוד של כל קנייה ומכירה (תאריך, מחיר, כמות). זה ישמש אותך בעת חישוב המס. מידע זה הוא לימודי בלבד — התייעץ עם רואה חשבון.</div>
                `
            }
        ]
    },
    en: {
        dir: 'ltr',
        chapters: [
            {
                icon: '🔰',
                title: 'What Is Physical Silver — A Beginner\'s Introduction',
                content: `
                    <p>Physical silver means owning actual <strong>coins</strong> or <strong>bars</strong> in your hands — not paper, not a stock, not an ETF. You are the outright owner.</p>
                    <p><strong>Coin vs Bar — what's the difference?</strong></p>
                    <ul>
                        <li><strong>Coin:</strong> Minted by a government mint (e.g. Royal Mint, Israel Mint). Has a legal face value, artistic design, and sometimes collectible value above the silver price.</li>
                        <li><strong>Bar:</strong> A simple silver block, usually cheaper per ounce, produced by private refiners (Heraeus, Umicore, Valcambi). No collectible premium.</li>
                    </ul>
                    <div class="guide-tip-box">💡 <strong>Tip:</strong> Bars are usually cheaper per ounce. Coins sell faster and are easier to verify as authentic.</div>
                    <p><strong>Common sizes:</strong> ¼ oz, ½ oz, 1 oz (most popular), 5 oz, 10 oz, 1 kg, 5 kg.</p>
                    <p><strong>Purity:</strong> Investment silver is .999 (99.9%) or .9999 (99.99%). Old coins like Morgan Dollars are .900 — not investment grade.</p>
                `
            },
            {
                icon: '🛒',
                title: 'Where to Buy Silver in Israel — 2026',
                content: `
                    <p><strong>Main options for buying in Israel:</strong></p>
                    <ul>
                        <li><strong>Israel Mint (ICMC):</strong> Official site <em>coins.co.il</em>. Fully verified coins. Higher premium.</li>
                        <li><strong>Private coin dealers:</strong> Specialist shops in Tel Aviv and the north. Always check reviews.</li>
                        <li><strong>International online dealers:</strong> <em>Bullion By Post</em>, <em>Silver Gold Bull</em>, <em>Europäisches Münzhaus</em> — shipping to Israel is possible; watch for customs duties.</li>
                        <li><strong>P2P / private sellers:</strong> Telegram groups, forums — <strong>high counterfeit risk! Only recommended with professional verification.</strong></li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>Customs note:</strong> Personal imports of investment-grade silver bars may be VAT-exempt in Israel. Verify with the seller before ordering.</div>
                `
            },
            {
                icon: '💰',
                title: 'Where to Sell Silver in Israel — 2026',
                content: `
                    <p>Selling locally is more limited than buying. Main options:</p>
                    <ul>
                        <li><strong>Licensed coin dealers:</strong> Fastest route to cash. Expect to sell below spot — that's their margin.</li>
                        <li><strong>Israel Mint:</strong> Accepts Israeli coins for redemption under certain conditions.</li>
                        <li><strong>P2P platforms:</strong> Dedicated Facebook/Telegram groups — better price but longer process.</li>
                        <li><strong>International buyers:</strong> Selling to European/US dealers — relevant for larger quantities.</li>
                    </ul>
                    <div class="guide-tip-box">💡 <strong>Tip:</strong> Recognized coins (Britannia, Maple Leaf, American Eagle) sell <strong>much faster</strong> and at better prices than obscure coins.</div>
                `
            },
            {
                icon: '💸',
                title: 'How Much to Buy — Entry Strategy for Beginners',
                content: `
                    <p>There is no single "right" amount — it depends on your goals.</p>
                    <p><strong>Core principles:</strong></p>
                    <ul>
                        <li>Most experts suggest <strong>5%–15%</strong> of savings in hard assets (silver + gold + foreign currency).</li>
                        <li>Start <strong>small</strong> (1–5 oz) to understand the process before committing larger sums.</li>
                        <li>Buy regularly using <strong>Dollar Cost Averaging</strong> — a fixed amount monthly, without timing the market.</li>
                        <li>Always maintain <strong>liquidity</strong> — never invest money you might need in an emergency.</li>
                    </ul>
                    <div class="guide-tip-box">💡 A good starting milestone: <strong>10 oz of .999 fine silver</strong> — meaningful for management, storage, and diversification.</div>
                `
            },
            {
                icon: '❌',
                title: 'Beginner Mistakes — What Everyone Does the First Time',
                content: `
                    <ul>
                        <li>🚫 <strong>Buying from unknown sources</strong> — silver counterfeits are common. Golden rule: buy only from recognized mints or licensed dealers.</li>
                        <li>🚫 <strong>Ignoring the premium</strong> — the price you pay includes a markup over spot. Too high a premium = poor profitability.</li>
                        <li>🚫 <strong>Storing at home without insurance</strong> — one theft, and the investment is gone. Consider a secured safe or storage service.</li>
                        <li>🚫 <strong>Buying cheap "old silver"</strong> — .900 coins (Morgan Dollars etc.) are not investment silver. Always verify purity.</li>
                        <li>🚫 <strong>Expecting quick profits</strong> — silver is a long-term store of value, not a trade. Those who bought at the 2011 peak waited 10 years.</li>
                        <li>🚫 <strong>Buying silver-plated items</strong> — just a thin coating. Zero investment value. Always check: .999 Fine Silver.</li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>Authentication:</strong> Use a magnet, sound test, or Sigma Metalytics device — the smartest investment before any large purchase.</div>
                `
            },
            {
                icon: '🏦',
                title: 'Safe Storage — How to Keep Your Silver',
                content: `
                    <p>Proper storage is part of the investment. Common options:</p>
                    <ul>
                        <li><strong>Home safe:</strong> Convenient, accessible. Must be bolted to wall/floor. Separate insurance recommended.</li>
                        <li><strong>Bank safe deposit box:</strong> Secure from theft. NOT covered by bank insurance — get a separate policy.</li>
                        <li><strong>Professional vault storage:</strong> Companies like Brinks, Loomis — insured and monitored. Best for large quantities.</li>
                    </ul>
                    <p><strong>Key rule:</strong> Don't tell everyone you own physical silver. OPSEC (operational security) matters as much as physical security.</p>
                    <div class="guide-tip-box">💡 <strong>Storage:</strong> Keep silver away from humid air. Plastic bags with silica gel preserve the shine and prevent tarnishing.</div>
                `
            },
            {
                icon: '📊',
                title: 'Understanding Silver Price — Spot, Premium & Cycles',
                content: `
                    <p><strong>Spot price:</strong> The global price of one troy ounce of .999 fine silver on the commodities market (COMEX). This is the baseline.</p>
                    <p><strong>Premium:</strong> The extra amount you pay over spot. Covers manufacturing, distribution, and dealer profit.</p>
                    <ul>
                        <li>Britannia 1oz coin = spot + 10%–18%</li>
                        <li>1 kg bar = spot + 3%–8%</li>
                        <li>Israel Mint coin = spot + 15%–25%</li>
                    </ul>
                    <p><strong>Historical cycles:</strong> Silver surged to $49/oz in 2011 then crashed. Rose sharply again in 2020 to $29. In 2024–2025 it stabilized above $30.</p>
                    <div class="guide-tip-box">💡 <strong>Gold/Silver Ratio:</strong> When the ratio is high (>80), silver is "cheap" relative to gold. Historical average: ~60:1. Track it live in our Charts tab.</div>
                `
            },
            {
                icon: '⚖️',
                title: 'Taxation & Regulation in Israel — 2026',
                content: `
                    <p>Capital gains tax on selling physical silver in Israel:</p>
                    <ul>
                        <li><strong>Individuals:</strong> 25% capital gains tax on the profit (sale price minus purchase price).</li>
                        <li><strong>VAT:</strong> Investment silver is VAT-exempt in Israel (unlike jewelry).</li>
                        <li><strong>Reporting:</strong> Transactions above a certain threshold (usually ₪50,000) may require reporting to the tax authority.</li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>Important:</strong> Keep records of every purchase and sale (date, price, quantity). This is for educational purposes only — consult a certified accountant for personal tax advice.</div>
                `
            }
        ]
    },
    ru: {
        dir: 'rtl',
        chapters: [
            {
                icon: '🔰',
                title: 'Что такое физическое серебро — введение для начинающих',
                content: `
                    <p>Физическое серебро — это реальные <strong>монеты</strong> или <strong>слитки</strong>, которые вы держите в руках, а не бумага, акция или ETF. Вы — полноправный владелец.</p>
                    <p><strong>Монета vs Слиток — в чём разница?</strong></p>
                    <ul>
                        <li><strong>Монета (Coin):</strong> Чеканится государственным монетным двором (Royal Mint, Israel Mint). Имеет номинал, художественный дизайн и иногда коллекционную ценность сверх цены серебра.</li>
                        <li><strong>Слиток (Bar):</strong> Простой кусок серебра, обычно дешевле за унцию, производится частными аффинажными заводами (Heraeus, Umicore). Без коллекционной надбавки.</li>
                    </ul>
                    <div class="guide-tip-box">💡 <strong>Совет:</strong> Слитки дешевле за унцию. Монеты продаются быстрее и легче проверяются на подлинность.</div>
                    <p><strong>Популярные размеры:</strong> ¼ oz, ½ oz, 1 oz (самый популярный), 5 oz, 10 oz, 1 кг, 5 кг.</p>
                    <p><strong>Чистота:</strong> Инвестиционное серебро — .999 (99,9%) или .9999 (99,99%). Старые монеты типа Morgan Dollar — .900, не инвестиционного уровня.</p>
                `
            },
            {
                icon: '🛒',
                title: 'Где купить серебро в Израиле — 2026',
                content: `
                    <p><strong>Основные варианты покупки в Израиле:</strong></p>
                    <ul>
                        <li><strong>Israel Mint (ICMC):</strong> Официальный сайт <em>coins.co.il</em>. Полностью проверенные монеты. Высокая надбавка.</li>
                        <li><strong>Частные нумизматические магазины:</strong> Специализированные магазины в Тель-Авиве и на севере. Всегда проверяйте отзывы.</li>
                        <li><strong>Международные онлайн-дилеры:</strong> <em>Bullion By Post</em>, <em>Silver Gold Bull</em> — доставка в Израиль возможна; следите за таможней.</li>
                        <li><strong>Частные продавцы (P2P):</strong> Telegram-группы — <strong>высокий риск подделок! Только с профессиональной проверкой.</strong></li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>Таможня:</strong> Ввоз инвестиционных серебряных слитков может быть освобождён от НДС в Израиле. Уточните у продавца до заказа.</div>
                `
            },
            {
                icon: '💰',
                title: 'Где продать серебро в Израиле — 2026',
                content: `
                    <p>Продажа в стране ограниченнее, чем покупка. Основные варианты:</p>
                    <ul>
                        <li><strong>Лицензированные дилеры монет:</strong> Самый быстрый способ. Ожидайте продажу ниже спота — это их маржа.</li>
                        <li><strong>Israel Mint:</strong> Принимает израильские монеты на выкуп на определённых условиях.</li>
                        <li><strong>P2P платформы:</strong> Группы Facebook/Telegram — лучшая цена, но процесс длиннее.</li>
                        <li><strong>Международные покупатели:</strong> Продажа европейским/американским дилерам — актуально для больших объёмов.</li>
                    </ul>
                    <div class="guide-tip-box">💡 <strong>Совет:</strong> Монеты известных монетных дворов (Britannia, Maple Leaf, American Eagle) продаются <strong>намного быстрее</strong> по лучшей цене.</div>
                `
            },
            {
                icon: '💸',
                title: 'Сколько покупать — стратегия входа для новичка',
                content: `
                    <p>Нет единственно правильной суммы — всё зависит от ваших целей.</p>
                    <p><strong>Основные принципы:</strong></p>
                    <ul>
                        <li>Большинство экспертов рекомендуют <strong>5%–15%</strong> сбережений в твёрдых активах (серебро + золото + иностранная валюта).</li>
                        <li>Начните с <strong>малого</strong> (1–5 oz), чтобы понять процесс, прежде чем вкладывать крупные суммы.</li>
                        <li>Покупайте регулярно (<strong>усреднение стоимости</strong>) — фиксированная сумма ежемесячно, без угадывания рынка.</li>
                        <li>Всегда сохраняйте <strong>ликвидность</strong> — не инвестируйте деньги, которые могут понадобиться в экстренной ситуации.</li>
                    </ul>
                    <div class="guide-tip-box">💡 Хорошая стартовая позиция: <strong>10 oz серебра .999</strong> — достаточно для управления, хранения и диверсификации.</div>
                `
            },
            {
                icon: '❌',
                title: 'Ошибки новичков — то, что все делают в первый раз',
                content: `
                    <ul>
                        <li>🚫 <strong>Покупка из неизвестных источников</strong> — подделки серебра распространены. Правило: покупайте только у известных монетных дворов или лицензированных дилеров.</li>
                        <li>🚫 <strong>Игнорирование надбавки</strong> — цена включает наценку над спотом. Слишком высокая надбавка = плохая доходность.</li>
                        <li>🚫 <strong>Хранение дома без страховки</strong> — одна кража, и инвестиция потеряна. Рассмотрите сейф или профессиональное хранение.</li>
                        <li>🚫 <strong>Покупка дешёвого "старого серебра"</strong> — монеты .900 не являются инвестиционным серебром. Всегда проверяйте чистоту.</li>
                        <li>🚫 <strong>Ожидание быстрой прибыли</strong> — серебро — долгосрочное хранилище ценности. Купившие в 2011 году на пике ждали 10 лет.</li>
                        <li>🚫 <strong>Покупка "посеребрённых" предметов</strong> — только напыление. Нулевая инвестиционная ценность. Всегда проверяйте: .999 Fine Silver.</li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>Проверка подлинности:</strong> Магнит, звуковой тест, устройство Sigma Metalytics — самая умная инвестиция перед любой крупной покупкой.</div>
                `
            },
            {
                icon: '🏦',
                title: 'Безопасное хранение — как хранить серебро',
                content: `
                    <p>Правильное хранение — часть инвестиции. Варианты:</p>
                    <ul>
                        <li><strong>Домашний сейф:</strong> Удобно и доступно. Должен быть прикручен к стене/полу. Рекомендуется отдельная страховка.</li>
                        <li><strong>Банковская ячейка:</strong> Надёжно от кражи. Банковская страховка НЕ покрывает — нужна отдельная.</li>
                        <li><strong>Профессиональное хранилище:</strong> Brinks, Loomis — застраховано и охраняется. Лучшее решение для больших объёмов.</li>
                    </ul>
                    <p><strong>Важное правило:</strong> Не рассказывайте всем о своём серебре. OPSEC (информационная безопасность) так же важна, как физическая защита.</p>
                    <div class="guide-tip-box">💡 <strong>Хранение:</strong> Избегайте влажного воздуха. Пакеты с силикагелем сохраняют блеск и предотвращают окисление.</div>
                `
            },
            {
                icon: '📊',
                title: 'Понимание цены серебра — спот, надбавка и циклы',
                content: `
                    <p><strong>Спот-цена:</strong> Мировая цена одной тройской унции чистого серебра .999 на товарном рынке (COMEX). Это базовая цена.</p>
                    <p><strong>Надбавка (Premium):</strong> Дополнительная сумма сверх спота. Покрывает производство, дистрибуцию и прибыль дилера.</p>
                    <ul>
                        <li>Монета Britannia 1 oz = спот + 10%–18%</li>
                        <li>Слиток 1 кг = спот + 3%–8%</li>
                        <li>Монета Israel Mint = спот + 15%–25%</li>
                    </ul>
                    <p><strong>Исторические циклы:</strong> Серебро достигло $49/oz в 2011 году, затем упало. В 2020 снова выросло до $29. В 2024–2025 стабилизировалось выше $30.</p>
                    <div class="guide-tip-box">💡 <strong>Соотношение золото/серебро:</strong> Когда оно высокое (>80), серебро "дёшево" относительно золота. Исторически ~60:1. Отслеживайте в разделе "Графики".</div>
                `
            },
            {
                icon: '⚖️',
                title: 'Налогообложение в Израиле — 2026',
                content: `
                    <p>Налог на прирост капитала при продаже физического серебра в Израиле:</p>
                    <ul>
                        <li><strong>Физические лица:</strong> 25% налог на прирост капитала с прибыли (цена продажи минус цена покупки).</li>
                        <li><strong>НДС:</strong> Инвестиционное серебро освобождено от НДС в Израиле (в отличие от ювелирных украшений).</li>
                        <li><strong>Отчётность:</strong> Сделки выше определённого порога (обычно ₪50,000) могут потребовать отчётности в налоговую службу.</li>
                    </ul>
                    <div class="guide-warn-box">⚠️ <strong>Важно:</strong> Сохраняйте документы о каждой покупке и продаже (дата, цена, количество). Эта информация носит образовательный характер — проконсультируйтесь с бухгалтером.</div>
                `
            }
        ]
    }
};

let _guideActiveLang = 'he';

// Admin-managed guide chapters (fetched once from the content API, then cached).
// Store-first: when present, these REPLACE the built-in GUIDE_DATA so guides are
// managed entirely in the admin panel — never hardcoded. Built-in is fallback only.
let _adminGuides = null;

// Generic content fetch for any collection (guides|quiz|mints|links).
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
    _adminGuides = await _fetchContent('guides');
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
        const [quiz, mints] = await Promise.all([_fetchContent('quiz'), _fetchContent('mints')]);
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
        return { icon: it.icon || '📘', title: block.title || '', content: block.content || '' };
    }).filter(ch => ch.title || ch.content);

    if (chapters.length === 0) {
        // Fallback only — no managed content yet.
        chapters = data.chapters.slice();
    }

    container.innerHTML = chapters.map((ch, i) => `
        <div class="guide-chapter" id="guide-ch-${i}">
            <button class="guide-chapter-header" onclick="toggleGuideChapter(${i})">
                <span class="guide-chapter-icon">${ch.icon}</span>
                <span class="guide-chapter-title">${ch.title}</span>
                <span class="guide-chapter-arrow">←</span>
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

    updateSilverPrice();
    setInterval(updateSilverPrice, 30 * 60 * 1000);

    document.getElementById('price-strip-btn')?.addEventListener('click', openDailyLineChart);

    loadPnl();
    renderPnl();

    // ── Main menu navigation ──
    document.querySelectorAll('.main-switch-btn, .icon-btn').forEach(b => {
        b.onclick = () => goToScreen(`${b.dataset.target}-screen`);
    });

    // ── Back buttons ──
    ['personal', 'homework', 'updates', 'charts', 'guide'].forEach(name => {
        const btn = document.getElementById(`back-${name}`);
        if (btn) btn.onclick = () => {
            if (name === 'homework') {
                const quizWrap = document.getElementById('hw-quiz-wrap');
                if (quizWrap && quizWrap.style.display !== 'none') {
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
    document.getElementById('back-pnl')?.addEventListener('click', () => goToScreen('personal-screen'));

    // ── P&L form (async — auto-fetches FX rate) ──
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
            fxStatus.textContent = '🔍 מחפש שער דולר לתאריך...';
            fxStatus.className   = 'fx-status fx-loading';
        }

        const fx = await fetchFxRate(date);

        if (fxStatus) {
            fxStatus.textContent = `✓ שער דולר לתאריך ${date}: ₪${fx.toFixed(4)}`;
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
            case 'pnl-screen':          goToScreen('personal-screen'); break;
            case 'homework-screen': {
                const qw = document.getElementById('hw-quiz-wrap');
                if (qw && qw.style.display !== 'none') { quizReset(); }
                else { quizReset(); goBack(); }
                break;
            }
            case 'museum-screen':       goBack();                      break;
            case 'mint-detail-screen':  goToScreen('museum-screen');   break;
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
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    document.getElementById('passcode')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') handleLogin();
    });
    initSwipeBack();
    initDevPreview();
    _loadStoreContent();   // pull store-managed quiz/museum (built-in stays as fallback)
    if (sessionToken()) showDashboard();
}

function initDevPreview() {
    if (!isLocalDevHost()) return;

    document.body.classList.add('dev-mode');
    const banner = document.createElement('div');
    banner.className = 'dev-preview-banner';
    banner.innerHTML = `
        <span class="dev-preview-label">🔧 מצב פיתוח מקומי</span>
        <span class="dev-preview-note">השינויים כאן לא על האתר החי — רענון אוטומטי אחרי שמירה</span>
        <button type="button" class="dev-preview-reload" onclick="location.reload()">רענון</button>
    `;
    document.body.prepend(banner);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
