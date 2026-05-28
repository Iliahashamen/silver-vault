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

const uid = tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 1_000_000);

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
function _drawLineData(frame, data) {
    const canvas = document.getElementById('line-canvas');
    if (!canvas || !data?.length) return;
    const labels = data.map(c => formatCandleTime(c.ts, frame));
    const prices = data.map(c => c.close);

    const lineColor = 'rgba(196,132,90,1)';
    const fillColor = 'rgba(196,132,90,0.12)';
    const gridColor = 'rgba(74,88,72,0.10)';
    const textColor = 'rgba(74,88,72,0.75)';

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
                        backgroundColor: 'rgba(240,237,231,0.96)',
                        titleColor:      '#2C3028',
                        bodyColor:       '#C4845A',
                        borderColor:     'rgba(168,148,128,0.3)',
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
                        color:          textColor,
                        font:           { size: 9 },
                        maxRotation:    40,
                        minRotation:    30,
                        autoSkip:       true,
                        maxTicksLimit:  10,   // never show more than 10 x-axis ticks
                    },
                    grid:   { color: gridColor },
                    border: { display: false },
                },
                y: {
                    ticks:  { color: textColor, font: { size: 10 }, callback: v => `$${v.toFixed(0)}` },
                    grid:   { color: gridColor },
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

const QUIZ_TOTAL = 15;
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

const DOVE_OF_PEACE_IMG = 'https://uftkmytmegszggtsrrhz.supabase.co/storage/v1/object/public/vault-files/museum/israel/dove-of-peace.webp';

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
            website: 'coins.gov.il',
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
                    desc: 'בוליון הכסף הישראלי "יונת השלום" של The Holy Land Mint, המיוצר החל משנת 2014. בחלקו הקדמי: יונה צחורה עם עלה זית במעופה מעל חומות ירושלים העתיקה. בחלקו האחורי: סמל החברה, טוהר המתכת ומשקלה; במטילים גם סימן Melter Assayer ומספר סידורי. זמין כראונד או מטיל. החל מ-2019 גם בזהב טהור 999.9.',
                    img: DOVE_OF_PEACE_IMG,
                    emoji: '🕊️',
                    transparent: true
                },
                {
                    title: 'מטבע יום העצמאות',
                    type: 'מטבע',
                    weight: '1 אונקיה',
                    year: 'שנתי',
                    purity: 'כסף 999',
                    desc: 'סדרה שנתית לרגל יום עצמאות ישראל, עם עיצוב ייחודי מדי שנה המשלב תמונה נושאית וסמלי המדינה.',
                    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/1_NIS_coin_%28obverse%2C_2017%29.jpg/300px-1_NIS_coin_%28obverse%2C_2017%29.jpg',
                    emoji: '🪙'
                },
                {
                    title: 'מטבע ירושלים',
                    type: 'מטבע',
                    weight: '2 אונקיות',
                    year: '2022',
                    purity: 'כסף 999',
                    desc: 'מטבע פרמיום לרגל 55 שנים לאיחוד ירושלים, עם עיצוב מפורט של החומה העתיקה ועיר דוד.',
                    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Jerusalem_Old_City_from_Above.jpg/300px-Jerusalem_Old_City_from_Above.jpg',
                    emoji: '🏛️'
                },
                {
                    title: 'מדלית כסף מנורה',
                    type: 'מדלייה',
                    weight: '50 גרם',
                    year: '2020',
                    purity: 'כסף 925',
                    desc: 'מדלית כסף סטרלינג עם עיצוב מנורת שבעת הקנים, סמל המדינה. מוגבל ל-1,000 יחידות.',
                    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Menora.svg/300px-Menora.svg.png',
                    emoji: '🕎'
                },
                {
                    title: 'מטיל כסף ישראלי',
                    type: 'מטיל',
                    weight: '10 גרם',
                    year: 'שוטף',
                    purity: 'כסף 999',
                    desc: 'מטיל כסף טהור עם סמל מדינת ישראל, מיוצר לשוק האספנות ולהשקעה בכסף פיזי.',
                    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg',
                    emoji: '🥈'
                },
                {
                    title: 'מטבע חנוכה',
                    type: 'מטבע',
                    weight: '1 אונקיה',
                    year: '2023',
                    purity: 'כסף 999',
                    desc: 'מטבע כסף לרגל חג החנוכה עם עיצוב חנוכייה היסטורית מהמוזיאון הלאומי. מהדורה מוגבלת.',
                    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Hanukkah_Menorah.jpg/300px-Hanukkah_Menorah.jpg',
                    emoji: '🕯️'
                },
                {
                    title: 'מטבע שלמה המלך',
                    type: 'מטבע',
                    weight: '2 אונקיות',
                    year: '2021',
                    purity: 'כסף 999',
                    desc: 'מטבע כסף אמנותי מסדרת "מלכי ישראל" המוקדשת לשלמה המלך, עם ציפוי זהב חלקי.',
                    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/King_Solomon%27s_Temple.jpg/300px-King_Solomon%27s_Temple.jpg',
                    emoji: '👑'
                }
            ]
        },
        en: {
            name: 'Israel Coins and Medals Corp.',
            subtitle: 'State-owned coin authority — ICMC',
            founded: 'Founded 1952',
            location: 'Jerusalem, Israel',
            website: 'coins.gov.il',
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
                { title: 'Independence Day Coin', type: 'Coin', weight: '1 oz', year: 'Annual', purity: '999 Silver', desc: 'Annual series marking Israeli Independence Day, featuring a unique design each year with national symbols.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/1_NIS_coin_%28obverse%2C_2017%29.jpg/300px-1_NIS_coin_%28obverse%2C_2017%29.jpg', emoji: '🪙' },
                { title: 'Jerusalem Coin', type: 'Coin', weight: '2 oz', year: '2022', purity: '999 Silver', desc: 'Premium coin celebrating 55 years since the reunification of Jerusalem, featuring the Old City walls.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Jerusalem_Old_City_from_Above.jpg/300px-Jerusalem_Old_City_from_Above.jpg', emoji: '🏛️' },
                { title: 'Menorah Silver Medal', type: 'Medal', weight: '50g', year: '2020', purity: '925 Silver', desc: 'Sterling silver medal featuring the seven-branched Menorah, the national emblem. Limited to 1,000 pieces.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Menora.svg/300px-Menora.svg.png', emoji: '🕎' },
                { title: 'Israeli Silver Bar', type: 'Bar', weight: '10g', year: 'Current', purity: '999 Silver', desc: 'Pure silver bar with the State of Israel emblem, produced for the collectors and physical silver investment market.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Hanukkah Coin', type: 'Coin', weight: '1 oz', year: '2023', purity: '999 Silver', desc: 'Silver coin for Hanukkah featuring a historic menorah design from the National Museum. Limited edition.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Hanukkah_Menorah.jpg/300px-Hanukkah_Menorah.jpg', emoji: '🕯️' },
                { title: 'King Solomon Coin', type: 'Coin', weight: '2 oz', year: '2021', purity: '999 Silver', desc: 'Artistic silver coin from the "Kings of Israel" series, dedicated to King Solomon, with partial gold plating.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/King_Solomon%27s_Temple.jpg/300px-King_Solomon%27s_Temple.jpg', emoji: '👑' }
            ]
        },
        ru: {
            name: 'Израильский монетный двор',
            subtitle: 'Государственная монетная корпорация — ICMC',
            founded: 'Основан в 1952',
            location: 'Иерусалим, Израиль',
            website: 'coins.gov.il',
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
                { title: 'Буллион «Голубь мира»', type: 'Буллион', weight: 'Разные веса', year: '2014–', purity: 'Серебро 999 / Золото 999.9', desc: 'Израильский буллион «Голубь мира» от The Holy Land Mint, выпускается с 2014 года. Аверс: белый голубь с оливковой ветвью над стенами Старого города Иерусалима. Реверс: логотип Holy Land Mint, проба и вес; на слитках также знак Melter Assayer и серийный номер. Доступен в виде монет и слитков. С 2019 года также из золота 999.9 пробы.', img: DOVE_OF_PEACE_IMG, emoji: '🕊️', transparent: true },
                { title: 'Монета Дня независимости', type: 'Монета', weight: '1 унция', year: 'Ежегодно', purity: 'Серебро 999', desc: 'Ежегодная серия ко Дню независимости Израиля с уникальным дизайном каждого года и национальными символами.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/1_NIS_coin_%28obverse%2C_2017%29.jpg/300px-1_NIS_coin_%28obverse%2C_2017%29.jpg', emoji: '🪙' },
                { title: 'Монета Иерусалима', type: 'Монета', weight: '2 унции', year: '2022', purity: 'Серебро 999', desc: 'Премиальная монета к 55-летию воссоединения Иерусалима с изображением стен Старого города.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Jerusalem_Old_City_from_Above.jpg/300px-Jerusalem_Old_City_from_Above.jpg', emoji: '🏛️' },
                { title: 'Серебряная медаль Менора', type: 'Медаль', weight: '50 г', year: '2020', purity: 'Серебро 925', desc: 'Медаль из серебра 925 пробы с изображением семисвечника Меноры — национального символа. Тираж 1 000 штук.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Menora.svg/300px-Menora.svg.png', emoji: '🕎' },
                { title: 'Израильский серебряный слиток', type: 'Слиток', weight: '10 г', year: 'Текущий', purity: 'Серебро 999', desc: 'Слиток из чистого серебра с гербом государства Израиль для рынка коллекционирования и инвестиций.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Монета Хануки', type: 'Монета', weight: '1 унция', year: '2023', purity: 'Серебро 999', desc: 'Серебряная монета к празднику Хануки с изображением исторической меноры из Национального музея. Лимитированный выпуск.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Hanukkah_Menorah.jpg/300px-Hanukkah_Menorah.jpg', emoji: '🕯️' },
                { title: 'Монета царя Соломона', type: 'Монета', weight: '2 унции', year: '2021', purity: 'Серебро 999', desc: 'Художественная монета из серии "Цари Израиля", посвящённая царю Соломону с частичным золотым покрытием.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/King_Solomon%27s_Temple.jpg/300px-King_Solomon%27s_Temple.jpg', emoji: '👑' }
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
            website: 'bayerisches-hauptmuenzamt.de',
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
                { title: 'מטבע כסף גרמניה 10 יורו', type: 'מטבע', weight: '16 גרם', year: '2023', purity: 'כסף 925', desc: 'מטבע זיכרון רשמי מטעם גרמניה, מסדרת "גרמניה יפה" עם נופים מרהיבים מרחבי המדינה.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/10_Euro_coin_Germany.jpg/300px-10_Euro_coin_Germany.jpg', emoji: '🪙' },
                { title: 'מטיל כסף Bavaria', type: 'מטיל', weight: '1 אונקיה', year: 'שוטף', purity: 'כסף 999', desc: 'מטיל כסף פרמיום עם סמל הדוב הבוורי ורישום ייחודי של בית המטבע. תעודת אותנטיות כלולה.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'מטבע כסף לודוויג ואן בטהובן', type: 'מטבע', weight: '1 אונקיה', year: '2020', purity: 'כסף 999', desc: 'מטבע זיכרון לציון 250 שנה להולדת בטהובן, עם דיוקן מפורט ומוטיבים מוזיקליים. מהדורה מוגבלת.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Beethoven.jpg/300px-Beethoven.jpg', emoji: '🎵' },
                { title: 'מטבע ברנדנבורג שאלה', type: 'מטבע', weight: '18 גרם', year: '2022', purity: 'כסף 925', desc: 'מסדרת "16 מדינות גרמניה" — מטבע המוקדש לברנדנבורג עם תמונת שער ברנדנבורג האיקוני.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/BrandenburgerTor_Dusk.jpg/300px-BrandenburgerTor_Dusk.jpg', emoji: '🏰' },
                { title: 'סט כסף עידן גרמני', type: 'סט', weight: '5×1 אונקיה', year: '2023', purity: 'כסף 999', desc: 'סט חמישה מטבעות המסכם את 5 תקופות גרמניות מבית המטבע, באריזת מתנה פרמיום.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Germany_coin_set.jpg/300px-Germany_coin_set.jpg', emoji: '🎁' },
                { title: 'מטבע הנסיך הנריך', type: 'מטבע', weight: '2 אונקיות', year: '2021', purity: 'כסף 999', desc: 'מטבע יובל לציון 850 שנה לייסוד בית המטבע הבוורי, עם דיוקן הנסיך הנריך האריה.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Henry_the_Lion.jpg/300px-Henry_the_Lion.jpg', emoji: '🦁' }
            ]
        },
        en: {
            name: 'Bavarian State Mint',
            subtitle: 'Bayerisches Hauptmünzamt — Munich',
            founded: 'Founded 1158',
            location: 'Munich, Bavaria, Germany',
            website: 'bayerisches-hauptmuenzamt.de',
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
                { title: 'Germany 10 Euro Silver Coin', type: 'Coin', weight: '16g', year: '2023', purity: '925 Silver', desc: 'Official German commemorative coin from the "Beautiful Germany" series featuring stunning landscapes.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/10_Euro_coin_Germany.jpg/300px-10_Euro_coin_Germany.jpg', emoji: '🪙' },
                { title: 'Bavaria Silver Bar', type: 'Bar', weight: '1 oz', year: 'Current', purity: '999 Silver', desc: 'Premium silver bar with the Bavarian bear emblem and unique mint registry. Certificate of authenticity included.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Ludwig van Beethoven Silver Coin', type: 'Coin', weight: '1 oz', year: '2020', purity: '999 Silver', desc: 'Commemorative coin marking 250 years since Beethoven\'s birth, with detailed portrait and musical motifs. Limited edition.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Beethoven.jpg/300px-Beethoven.jpg', emoji: '🎵' },
                { title: 'Brandenburg Gate Coin', type: 'Coin', weight: '18g', year: '2022', purity: '925 Silver', desc: 'From the "16 German States" series — coin dedicated to Brandenburg featuring the iconic Brandenburg Gate.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/BrandenburgerTor_Dusk.jpg/300px-BrandenburgerTor_Dusk.jpg', emoji: '🏰' },
                { title: 'German Era Silver Set', type: 'Set', weight: '5×1 oz', year: '2023', purity: '999 Silver', desc: 'Set of five coins summarizing 5 German eras from the mint, in premium gift packaging.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Germany_coin_set.jpg/300px-Germany_coin_set.jpg', emoji: '🎁' },
                { title: 'Prince Henry the Lion Coin', type: 'Coin', weight: '2 oz', year: '2021', purity: '999 Silver', desc: 'Jubilee coin marking 850 years since the founding of the Bavarian Mint, featuring Prince Henry the Lion.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Henry_the_Lion.jpg/300px-Henry_the_Lion.jpg', emoji: '🦁' }
            ]
        },
        ru: {
            name: 'Баварский монетный двор',
            subtitle: 'Bayerisches Hauptmünzamt — Мюнхен',
            founded: 'Основан в 1158',
            location: 'Мюнхен, Бавария, Германия',
            website: 'bayerisches-hauptmuenzamt.de',
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
                { title: 'Германия 10 евро серебряная монета', type: 'Монета', weight: '16 г', year: '2023', purity: 'Серебро 925', desc: 'Официальная памятная монета Германии из серии «Красивая Германия» с живописными пейзажами страны.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/10_Euro_coin_Germany.jpg/300px-10_Euro_coin_Germany.jpg', emoji: '🪙' },
                { title: 'Баварский серебряный слиток', type: 'Слиток', weight: '1 унция', year: 'Текущий', purity: 'Серебро 999', desc: 'Премиальный серебряный слиток с изображением баварского медведя и уникальным реестром монетного двора. Прилагается сертификат.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Монета Людвига ван Бетховена', type: 'Монета', weight: '1 унция', year: '2020', purity: 'Серебро 999', desc: 'Памятная монета к 250-летию со дня рождения Бетховена с детальным портретом и музыкальными мотивами. Лимитированный выпуск.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Beethoven.jpg/300px-Beethoven.jpg', emoji: '🎵' },
                { title: 'Монета Бранденбургских ворот', type: 'Монета', weight: '18 г', year: '2022', purity: 'Серебро 925', desc: 'Из серии «16 федеральных земель Германии» — монета, посвящённая Бранденбургу с изображением знаменитых ворот.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/BrandenburgerTor_Dusk.jpg/300px-BrandenburgerTor_Dusk.jpg', emoji: '🏰' },
                { title: 'Серебряный набор германских эпох', type: 'Набор', weight: '5×1 унция', year: '2023', purity: 'Серебро 999', desc: 'Набор из пяти монет, отражающих 5 немецких эпох монетного двора, в премиальной подарочной упаковке.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Germany_coin_set.jpg/300px-Germany_coin_set.jpg', emoji: '🎁' },
                { title: 'Монета принца Генриха Льва', type: 'Монета', weight: '2 унции', year: '2021', purity: 'Серебро 999', desc: 'Юбилейная монета к 850-летию основания Баварского монетного двора с изображением принца Генриха Льва.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Henry_the_Lion.jpg/300px-Henry_the_Lion.jpg', emoji: '🦁' }
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
            website: 'royalmint.com',
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
                { title: 'מטבע ברבריאניה 1 אונקיה', type: 'מטבע', weight: '1 אונקיה', year: '2024', purity: 'כסף 999.9', desc: 'המטבע הנחשב ביותר של המינט המלכותי — ברבריאניה בכסף טהור 999.9. הילך חוקי בשווי 2 ליש"ט. מסדרת 1987.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/2015_Britannia_silver_proof_1oz.jpg/300px-2015_Britannia_silver_proof_1oz.jpg', emoji: '🦅' },
                { title: 'חיית המלכה — האריה האנגלי', type: 'מטבע', weight: '2 אונקיות', year: '2016', purity: 'כסף 999.9', desc: 'מטבע ראשון בסדרת "חיות המלכה" — האריה האנגלי. סדרה של 10 מטבעות, כ-2 אונקיות כסף כ"א. מהדורה מוגבלת.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Lion_England_heraldic.svg/300px-Lion_England_heraldic.svg.png', emoji: '🦁' },
                { title: 'מטיל כסף רויאל מינט', type: 'מטיל', weight: '100 גרם', year: 'שוטף', purity: 'כסף 999', desc: 'מטיל כסף רשמי עם לוגו המינט המלכותי ומספר סידורי. אחד המטילים המוכרים ביותר בשוק ההשקעות הבריטי.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'מטבע קינג צ\'רלס III ברבריאניה', type: 'מטבע', weight: '1 אונקיה', year: '2023', purity: 'כסף 999.9', desc: 'הגרסה הראשונה של מטבע הברבריאניה עם דיוקן המלך צ\'רלס השלישי — אספנות היסטורית.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/King_Charles_III_2023.jpg/300px-King_Charles_III_2023.jpg', emoji: '👑' },
                { title: 'מטבע יובל המלכה', type: 'מטבע', weight: '5 אונקיות', year: '2022', purity: 'כסף 999', desc: 'מטבע זיכרון מיוחד לציון 70 שנות שלטון המלכה אליזבת השנייה. אחד הנדירים בהיסטוריה של המינט המלכותי.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Queen_Elizabeth_II_1953.jpg/300px-Queen_Elizabeth_II_1953.jpg', emoji: '💎' },
                { title: 'חיית המלכה — הדרקון האדום', type: 'מטבע', weight: '2 אונקיות', year: '2017', purity: 'כסף 999.9', desc: 'הדרקון האדום של ויילס מסדרת "חיות המלכה" — אחד הפופולריים מבין 10 מטבעות הסדרה. ייצוג ייחודי של ויילס.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Red_dragon.svg/300px-Red_dragon.svg.png', emoji: '🐉' }
            ]
        },
        en: {
            name: 'The Royal Mint',
            subtitle: 'The Royal Mint — Llantrisant, Wales',
            founded: 'Founded 886 AD',
            location: 'Llantrisant, Wales, United Kingdom',
            website: 'royalmint.com',
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
                { title: 'Britannia 1 oz Silver Coin', type: 'Coin', weight: '1 oz', year: '2024', purity: '999.9 Silver', desc: 'The Royal Mint\'s most celebrated coin — pure 999.9 silver Britannia. Legal tender at £2 face value. Series from 1987.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/2015_Britannia_silver_proof_1oz.jpg/300px-2015_Britannia_silver_proof_1oz.jpg', emoji: '🦅' },
                { title: "Queen's Beast — English Lion", type: 'Coin', weight: '2 oz', year: '2016', purity: '999.9 Silver', desc: 'First coin in the "Queen\'s Beasts" series — the English Lion. A series of 10 coins, each 2 oz silver. Limited mintage.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Lion_England_heraldic.svg/300px-Lion_England_heraldic.svg.png', emoji: '🦁' },
                { title: 'Royal Mint Silver Bar', type: 'Bar', weight: '100g', year: 'Current', purity: '999 Silver', desc: 'Official silver bar with Royal Mint logo and serial number. One of the most recognised bars in the UK investment market.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'King Charles III Britannia', type: 'Coin', weight: '1 oz', year: '2023', purity: '999.9 Silver', desc: 'The first Britannia coin featuring King Charles III\'s portrait — a piece of historic collectibility.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/King_Charles_III_2023.jpg/300px-King_Charles_III_2023.jpg', emoji: '👑' },
                { title: "Queen's Jubilee Coin", type: 'Coin', weight: '5 oz', year: '2022', purity: '999 Silver', desc: 'Special commemorative coin marking 70 years of Queen Elizabeth II\'s reign. One of the rarest in Royal Mint history.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Queen_Elizabeth_II_1953.jpg/300px-Queen_Elizabeth_II_1953.jpg', emoji: '💎' },
                { title: "Queen's Beast — Red Dragon", type: 'Coin', weight: '2 oz', year: '2017', purity: '999.9 Silver', desc: 'The Red Dragon of Wales from the "Queen\'s Beasts" series — one of the most popular of the 10 coins. Unique Welsh representation.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Red_dragon.svg/300px-Red_dragon.svg.png', emoji: '🐉' }
            ]
        },
        ru: {
            name: 'Королевский монетный двор',
            subtitle: 'The Royal Mint — Лланттресант, Уэльс',
            founded: 'Основан в 886 г. н.э.',
            location: 'Лланттресант, Уэльс, Великобритания',
            website: 'royalmint.com',
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
                { title: 'Britannia 1 унция серебра', type: 'Монета', weight: '1 унция', year: '2024', purity: 'Серебро 999.9', desc: 'Самая известная монета Королевского монетного двора — чистая серебряная Britannia 999.9. Законное платёжное средство номиналом 2 фунта. Серия с 1987 года.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/2015_Britannia_silver_proof_1oz.jpg/300px-2015_Britannia_silver_proof_1oz.jpg', emoji: '🦅' },
                { title: 'Звери королевы — Английский лев', type: 'Монета', weight: '2 унции', year: '2016', purity: 'Серебро 999.9', desc: 'Первая монета серии «Звери королевы» — Английский лев. Серия из 10 монет, каждая по 2 унции серебра. Ограниченный тираж.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Lion_England_heraldic.svg/300px-Lion_England_heraldic.svg.png', emoji: '🦁' },
                { title: 'Серебряный слиток Royal Mint', type: 'Слиток', weight: '100 г', year: 'Текущий', purity: 'Серебро 999', desc: 'Официальный серебряный слиток с логотипом Royal Mint и серийным номером. Один из наиболее узнаваемых слитков на британском инвестиционном рынке.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Britannia короля Карла III', type: 'Монета', weight: '1 унция', year: '2023', purity: 'Серебро 999.9', desc: 'Первая монета Britannia с портретом короля Карла III — исторически значимый коллекционный предмет.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/King_Charles_III_2023.jpg/300px-King_Charles_III_2023.jpg', emoji: '👑' },
                { title: 'Монета Юбилея королевы', type: 'Монета', weight: '5 унций', year: '2022', purity: 'Серебро 999', desc: 'Специальная памятная монета к 70-летию правления королевы Елизаветы II. Одна из редчайших в истории Королевского монетного двора.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Queen_Elizabeth_II_1953.jpg/300px-Queen_Elizabeth_II_1953.jpg', emoji: '💎' },
                { title: 'Звери королевы — Красный дракон', type: 'Монета', weight: '2 унции', year: '2017', purity: 'Серебро 999.9', desc: 'Красный дракон Уэльса из серии «Звери королевы» — один из самых популярных из 10 монет серии. Уникальное представление Уэльса.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Red_dragon.svg/300px-Red_dragon.svg.png', emoji: '🐉' }
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
            website: 'usmint.gov',
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
                { title: 'American Silver Eagle 2022', type: 'מטבע', weight: '1 אונקיה', year: '2022', purity: 'כסף 999', desc: 'גרסת 2022 עם ה-Reverse החדש (Type 2) — נשר הנוחת עם כנפיים פרושות. הנמכר ביותר בעולם. הילך חוקי $1.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/2022-american-eagle-silver-one-ounce-bullion-coin-obverse.png/300px-2022-american-eagle-silver-one-ounce-bullion-coin-obverse.png', emoji: '🦅' },
                { title: 'Silver Eagle Reverse Type 2', type: 'מטבע', weight: '1 אונקיה', year: '2021+', purity: 'כסף 999', desc: 'צד הנשר החדש שהוחלף לראשונה ב-35 שנה — עיצוב נשר מפורט ומרשים יותר. מהדורות מיוחדות בגמר Proof ו-Uncirculated.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/%241_Silver_Eagle_Type_2_Reverse.png/300px-%241_Silver_Eagle_Type_2_Reverse.png', emoji: '🦅' },
                { title: 'Morgan Silver Dollar 2021', type: 'מטבע', weight: '26.73 גרם', year: '2021', purity: 'כסף 999', desc: 'חזרת האגדה — Morgan Dollar החדש בטוהר 999 לעומת המקורי של .900. סדרה מוגבלת של 175,000 יחידות למינט. מוטבע עם מנטמארק 5 מינטים.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🪙' },
                { title: 'America the Beautiful 5oz', type: 'מטבע', weight: '5 אונקיות', year: '2010–2021', purity: 'כסף 999', desc: 'הגדול ביותר בסדרת מטבעות ציבוריים — 5 אונקיות כסף עם עיצוב של 56 פארקים לאומיים. קוטר: 76.2 מ"מ. 56 מינטים שונים.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/American_Silver_Eagle_monster_box_from_United_States_Mint.png/300px-American_Silver_Eagle_monster_box_from_United_States_Mint.png', emoji: '🏛️' },
                { title: 'Peace Dollar 2021', type: 'מטבע', weight: '26.73 גרם', year: '2021', purity: 'כסף 999', desc: 'שיבה לסמל השלום — Peace Dollar כסף 999. גרסת 2021 מחזירה עיצוב קלאסי משנת 1921 (100 שנות יובל) במהדורה מוגבלת.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🕊️' },
                { title: 'Silver Eagle Monster Box', type: 'ארגז', weight: '500 אונקיות', year: 'שוטף', purity: 'כסף 999', desc: 'ה"Monster Box" הרשמי — 25 צינורות של 20 מטבעות Silver Eagle. הדרך המקובלת לרכישת כסף בכמויות. אריזה ושמירת ערך.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/American_Silver_Eagle_monster_box_from_United_States_Mint.png/300px-American_Silver_Eagle_monster_box_from_United_States_Mint.png', emoji: '📦' }
            ]
        },
        en: {
            name: 'United States Mint',
            subtitle: 'United States Mint — Home of the American Silver Eagle',
            founded: 'Founded 1792',
            location: 'Philadelphia / West Point, USA',
            website: 'usmint.gov',
            history: [
                { title: 'Foundation & the Dollar', text: 'The United States Mint was founded in 1792 in Philadelphia, then the nation\'s capital, under the first federal coinage act. Its purpose was to produce gold, silver and copper dollar coins for the young republic. The Philadelphia building was the first federal public building constructed in the United States, and has since stood as a symbol of American economic strength.' },
                { title: 'American Silver Eagle — World\'s Best-Selling Bullion Coin', text: 'Since 1986, the US Mint has produced the American Silver Eagle — the best-selling investment coin in history. Struck in .999 fine silver (1 oz), its obverse features "Walking Liberty," a design from 1916 widely considered the finest American coin artwork ever created. In 2021, the reverse (Eagle side) was updated for the first time in 35 years.' },
                { title: 'Heritage & Special Products', text: 'In addition to the Silver Eagle, the Mint issued redesigned Morgan and Peace Dollars in 2021 — two iconic 20th-century coins now struck in .999 fine silver. The "America the Beautiful" series (2010–2021) comprised 56 five-ounce coins depicting national parks. The US Mint maintains a national strategic silver reserve at West Point.' }
            ],
            products: [
                { title: 'American Silver Eagle 2022', type: 'Coin', weight: '1 oz', year: '2022', purity: '999 Silver', desc: '2022 version with the new Type 2 Reverse — a landing eagle with spread wings. World\'s best-seller. Legal tender face value $1.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/2022-american-eagle-silver-one-ounce-bullion-coin-obverse.png/300px-2022-american-eagle-silver-one-ounce-bullion-coin-obverse.png', emoji: '🦅' },
                { title: 'Silver Eagle Type 2 Reverse', type: 'Coin', weight: '1 oz', year: '2021+', purity: '999 Silver', desc: 'The new eagle reverse replaced for the first time in 35 years — a more detailed, impressive eagle design. Available in Proof and Uncirculated finishes.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/%241_Silver_Eagle_Type_2_Reverse.png/300px-%241_Silver_Eagle_Type_2_Reverse.png', emoji: '🦅' },
                { title: 'Morgan Silver Dollar 2021', type: 'Coin', weight: '26.73g', year: '2021', purity: '999 Silver', desc: 'Return of a legend — the new Morgan Dollar in .999 fine silver vs the original .900. Limited series of 175,000 per mint. Struck with mintmarks from 5 mint facilities.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🪙' },
                { title: 'America the Beautiful 5oz', type: 'Coin', weight: '5 oz', year: '2010–2021', purity: '999 Silver', desc: 'The largest US public coin series — 5 oz silver featuring 56 national parks. Diameter: 76.2mm. 56 different designs over the series.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/American_Silver_Eagle_monster_box_from_United_States_Mint.png/300px-American_Silver_Eagle_monster_box_from_United_States_Mint.png', emoji: '🏛️' },
                { title: 'Peace Dollar 2021', type: 'Coin', weight: '26.73g', year: '2021', purity: '999 Silver', desc: 'Return of the peace symbol — the Peace Dollar in .999 fine silver. The 2021 version revives the classic 1921 design for the 100th anniversary in a limited edition.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🕊️' },
                { title: 'Silver Eagle Monster Box', type: 'Box', weight: '500 oz', year: 'Current', purity: '999 Silver', desc: 'The official "Monster Box" — 25 tubes of 20 Silver Eagle coins. The standard format for bulk silver purchases. Official US Mint packaging and value preservation.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/American_Silver_Eagle_monster_box_from_United_States_Mint.png/300px-American_Silver_Eagle_monster_box_from_United_States_Mint.png', emoji: '📦' }
            ]
        },
        ru: {
            name: 'Монетный двор США',
            subtitle: 'United States Mint — дом American Silver Eagle',
            founded: 'Основан в 1792',
            location: 'Филадельфия / Вест-Пойнт, США',
            website: 'usmint.gov',
            history: [
                { title: 'Основание и доллар', text: 'Монетный двор США был основан в 1792 году в Филадельфии — тогдашней столице страны — на основании первого федерального закона о чеканке монет. Его цель — производство золотых, серебряных и медных долларовых монет для молодой республики. Здание в Филадельфии стало первым федеральным общественным зданием, построенным в США.' },
                { title: 'American Silver Eagle — самая продаваемая монета в мире', text: 'С 1986 года Монетный двор США выпускает American Silver Eagle — самую продаваемую инвестиционную монету в истории. Чеканится из серебра .999 (1 унция), на аверсе изображена «Идущая Свобода» — дизайн 1916 года, считающийся лучшим произведением монетного искусства США. В 2021 году реверс (орёл) был обновлён впервые за 35 лет.' },
                { title: 'Наследие и специальные выпуски', text: 'В 2021 году монетный двор выпустил обновлённые Morgan Dollar и Peace Dollar из серебра .999. Серия «Красоты Америки» (2010–2021) включала 56 пятиунцевых монет с изображением национальных парков. Монетный двор США хранит национальный стратегический резерв серебра в Вест-Пойнте.' }
            ],
            products: [
                { title: 'American Silver Eagle 2022', type: 'Монета', weight: '1 унция', year: '2022', purity: 'Серебро 999', desc: 'Выпуск 2022 года с новым реверсом Type 2 — приземляющийся орёл с расправленными крыльями. Самая продаваемая в мире. Номинал $1.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/2022-american-eagle-silver-one-ounce-bullion-coin-obverse.png/300px-2022-american-eagle-silver-one-ounce-bullion-coin-obverse.png', emoji: '🦅' },
                { title: 'Silver Eagle Type 2 Reverse', type: 'Монета', weight: '1 унция', year: '2021+', purity: 'Серебро 999', desc: 'Новый реверс орла, изменённый впервые за 35 лет — более детальный дизайн. Доступен в исполнении Proof и Uncirculated.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/%241_Silver_Eagle_Type_2_Reverse.png/300px-%241_Silver_Eagle_Type_2_Reverse.png', emoji: '🦅' },
                { title: 'Morgan Silver Dollar 2021', type: 'Монета', weight: '26,73 г', year: '2021', purity: 'Серебро 999', desc: 'Возвращение легенды — новый Morgan Dollar из серебра .999 вместо исходного .900. Ограниченная серия 175 000 штук с каждого монетного двора.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🪙' },
                { title: 'America the Beautiful 5 oz', type: 'Монета', weight: '5 унций', year: '2010–2021', purity: 'Серебро 999', desc: 'Крупнейшая серия монет США — 5 унций серебра с изображением 56 национальных парков. Диаметр 76,2 мм. 56 различных дизайнов.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/American_Silver_Eagle_monster_box_from_United_States_Mint.png/300px-American_Silver_Eagle_monster_box_from_United_States_Mint.png', emoji: '🏛️' },
                { title: 'Peace Dollar 2021', type: 'Монета', weight: '26,73 г', year: '2021', purity: 'Серебро 999', desc: 'Возвращение символа мира — Peace Dollar из серебра .999. Версия 2021 года возрождает классический дизайн 1921 года к 100-летнему юбилею, ограниченный тираж.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🕊️' },
                { title: 'Monster Box Silver Eagle', type: 'Ящик', weight: '500 унций', year: 'Текущий', purity: 'Серебро 999', desc: 'Официальный «Monster Box» — 25 тюбиков по 20 монет Silver Eagle. Стандарт оптовых закупок серебра. Официальная упаковка Монетного двора США.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/American_Silver_Eagle_monster_box_from_United_States_Mint.png/300px-American_Silver_Eagle_monster_box_from_United_States_Mint.png', emoji: '📦' }
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
            website: 'mint.ca',
            history: [
                { title: 'ייסוד ומסורת קנדית', text: 'בית המטבע המלכותי הקנדי נוסד ב-1908 באוטווה, כשקנדה ביקשה עצמאות מוניטרית מבריטניה. עד אז מטבעות קנדיים הוטבעו בלונדון. הבניין ההיסטורי המרהיב באוטווה, שנבנה בסגנון גותי, הפך לאחד מסמלי העיר. בשנת 1988 נפתח מפעל שני בויניפג לייצור מטבעות השקעה בהיקפים גדולים.' },
                { title: 'Silver Maple Leaf — שיא הטוהר', text: 'Silver Maple Leaf הוכנס לשוק ב-1988 כמטבע ההשקעה הקנדי המרכזי. המטבע עשוי כסף 9999 (99.99% טהור) — טוהר גבוה יותר מרוב מתחריו. עלה על עלה מייפל האיקוני של קנדה מקשט את פניו, ואת גב המטבע מקשט דיוקן המלכה. הוא הילך חוקי בשווי 5 דולר קנדי.' },
                { title: 'חדשנות וסדרות מיוחדות', text: 'בית המטבע הקנדי חלוץ טכנולוגי — הוא הנפיק את מטבע ה-"25 קילוגרם" הגדול בעולם (2007), ומטבעות עם הולוגרמה. סדרות "Call of the Wild", "Predator Series" ו-"Birds of Prey" הפכו לפנומן אספנות עולמי. הקנדים ייצרו גם מטבעות עם רובידיום — יסוד נדיר, בפעם הראשונה בהיסטוריית המטבעות.' }
            ],
            products: [
                { title: 'Silver Maple Leaf 1oz', type: 'מטבע', weight: '1 אונקיה', year: '2024', purity: 'כסף 9999', desc: 'הנמכר ביותר בקנדה — כסף טהור 9999 עם עיצוב עלה מייפל. הילך חוקי $5 קנדי. תכונת אבטחה ייחודית נגד זיוף מ-2015.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/1-ounce_Silver_Canadian_Maple_Leaf_MADE_OF_.9999%25_PURE_SILVER.jpg/300px-1-ounce_Silver_Canadian_Maple_Leaf_MADE_OF_.9999%25_PURE_SILVER.jpg', emoji: '🍁' },
                { title: 'Maple Leaf צינורות השקעה', type: 'צינור', weight: '25 אונקיות', year: 'שוטף', purity: 'כסף 9999', desc: 'צינורות 25 מטבעות Maple Leaf — האריזה הסטנדרטית להשקעה. אריזה מקורית של בית המטבע. כסף ישיר מהמפעל.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Canadian_Silver_Maple_Leaf_coins_and_tubes.png/300px-Canadian_Silver_Maple_Leaf_coins_and_tubes.png', emoji: '🍁' },
                { title: 'Canadian Silver Portfolio', type: 'אוסף', weight: 'מגוון', year: 'שוטף', purity: 'כסף 9999', desc: 'אוסף מטבעות כסף קנדיים כולל Maple Leaf, Wildlife Series ועוד. מגוון גדלים ועיצובים מבית המטבע הקנדי.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Canadian_Silver_%2883655181%29.jpeg/300px-Canadian_Silver_%2883655181%29.jpeg', emoji: '🇨🇦' },
                { title: 'Call of the Wild — Howling Wolf', type: 'מטבע', weight: '1 אונקיה', year: '2014', purity: 'כסף 9999', desc: 'הראשון בסדרת "Call of the Wild" — זאב יוליל בעיצוב דרמטי. מהדורה מוגבלת. הסדרה כללה: זאב, בז, מוסה, אריה ים, פומה ועוד.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐺' },
                { title: 'Predator Series — Cougar', type: 'מטבע', weight: '1 אונקיה', year: '2012', purity: 'כסף 9999', desc: 'פומה קנדית מסדרת "Predator" — אחת הפופולריות שייצר בית המטבע הקנדי. עיצוב חי ומרשים של טורף המדבריות.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐆' },
                { title: 'Maple Leaf 1kg Silver Bar', type: 'מטיל', weight: '1 ק"ג', year: 'שוטף', purity: 'כסף 9999', desc: 'מטיל כסף קנדי 1 ק"ג עם לוגו עלה המייפל ומספר סידורי. אחד המטילים המוכרים ביותר בשוק ההשקעות הקנדי.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
            ]
        },
        en: {
            name: 'Royal Canadian Mint',
            subtitle: 'Royal Canadian Mint — Home of the Silver Maple Leaf',
            founded: 'Founded 1908',
            location: 'Ottawa (collectibles) / Winnipeg (bullion), Canada',
            website: 'mint.ca',
            history: [
                { title: 'Foundation & Canadian Tradition', text: 'The Royal Canadian Mint was founded in 1908 in Ottawa, as Canada sought monetary independence from Britain. Until then, Canadian coins were struck in London. The magnificent Gothic-style historic building in Ottawa became one of the city\'s landmarks. In 1988, a second facility opened in Winnipeg for large-scale bullion coin production.' },
                { title: 'Silver Maple Leaf — Peak Purity', text: 'The Silver Maple Leaf was introduced in 1988 as Canada\'s flagship investment coin. Struck in .9999 fine silver (99.99% pure) — higher purity than most competitors. Canada\'s iconic maple leaf graces the obverse, while the monarch\'s portrait adorns the reverse. It is legal tender at C$5 face value.' },
                { title: 'Innovation & Special Series', text: 'The Royal Canadian Mint is a technology pioneer — it issued the world\'s largest coin (25kg, 2007) and holographic coins. The "Call of the Wild," "Predator Series," and "Birds of Prey" series became global collecting phenomena. Canada also produced coins incorporating rubidium — a rare element — for the first time in coin history.' }
            ],
            products: [
                { title: 'Silver Maple Leaf 1oz', type: 'Coin', weight: '1 oz', year: '2024', purity: '9999 Silver', desc: 'Canada\'s best-seller — .9999 pure silver with iconic maple leaf design. Legal tender C$5. Unique anti-counterfeiting radial lines feature added since 2015.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/1-ounce_Silver_Canadian_Maple_Leaf_MADE_OF_.9999%25_PURE_SILVER.jpg/300px-1-ounce_Silver_Canadian_Maple_Leaf_MADE_OF_.9999%25_PURE_SILVER.jpg', emoji: '🍁' },
                { title: 'Maple Leaf Investment Tubes', type: 'Tube', weight: '25 oz', year: 'Current', purity: '9999 Silver', desc: 'Tubes of 25 Maple Leaf coins — the standard bullion investment format. Original mint packaging. Direct from the mint factory.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Canadian_Silver_Maple_Leaf_coins_and_tubes.png/300px-Canadian_Silver_Maple_Leaf_coins_and_tubes.png', emoji: '🍁' },
                { title: 'Canadian Silver Portfolio', type: 'Collection', weight: 'Various', year: 'Current', purity: '9999 Silver', desc: 'Collection of Canadian silver coins including Maple Leaf, Wildlife Series and more. Various sizes and designs from the Royal Canadian Mint.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Canadian_Silver_%2883655181%29.jpeg/300px-Canadian_Silver_%2883655181%29.jpeg', emoji: '🇨🇦' },
                { title: 'Call of the Wild — Howling Wolf', type: 'Coin', weight: '1 oz', year: '2014', purity: '9999 Silver', desc: 'First in the "Call of the Wild" series — a howling wolf in dramatic design. Limited mintage. The series featured wolf, falcon, moose, sea lion, cougar and more.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐺' },
                { title: 'Predator Series — Cougar', type: 'Coin', weight: '1 oz', year: '2012', purity: '9999 Silver', desc: 'Canadian cougar from the "Predator" series — one of the most popular series from the Royal Canadian Mint. Vivid and impressive design of this wilderness predator.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐆' },
                { title: 'Maple Leaf 1kg Silver Bar', type: 'Bar', weight: '1 kg', year: 'Current', purity: '9999 Silver', desc: 'Canadian 1kg silver bar with maple leaf logo and serial number. One of the most recognised bars in the Canadian investment market.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
            ]
        },
        ru: {
            name: 'Королевский монетный двор Канады',
            subtitle: 'Royal Canadian Mint — дом Silver Maple Leaf',
            founded: 'Основан в 1908',
            location: 'Оттава (коллекционные) / Виннипег (инвестиционные), Канада',
            website: 'mint.ca',
            history: [
                { title: 'Основание и канадская традиция', text: 'Королевский монетный двор Канады был основан в 1908 году в Оттаве, когда Канада стремилась к монетарной независимости от Великобритании. До этого канадские монеты чеканились в Лондоне. Великолепное историческое здание в готическом стиле в Оттаве стало одной из достопримечательностей города. В 1988 году в Виннипеге открылся второй завод для крупномасштабного производства инвестиционных монет.' },
                { title: 'Silver Maple Leaf — вершина чистоты', text: 'Silver Maple Leaf был представлен в 1988 году как главная канадская инвестиционная монета. Чеканится из серебра .9999 (99,99% чистоты) — более высокая проба, чем у большинства конкурентов. Знаменитый кленовый лист Канады украшает аверс, а портрет монарха — реверс. Является законным платёжным средством номиналом C$5.' },
                { title: 'Инновации и специальные серии', text: 'Королевский монетный двор Канады — технологический пионер. Он выпустил крупнейшую монету в мире (25 кг, 2007) и голографические монеты. Серии «Call of the Wild», «Predator Series» и «Birds of Prey» стали мировыми коллекционными феноменами. Канада также выпустила монеты с рубидием — редким элементом — впервые в истории монетного дела.' }
            ],
            products: [
                { title: 'Silver Maple Leaf 1 oz', type: 'Монета', weight: '1 унция', year: '2024', purity: 'Серебро 9999', desc: 'Самая продаваемая монета Канады — серебро .9999 с иконическим дизайном кленового листа. Номинал C$5. Уникальная защита от подделок с радиальными линиями с 2015 года.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/1-ounce_Silver_Canadian_Maple_Leaf_MADE_OF_.9999%25_PURE_SILVER.jpg/300px-1-ounce_Silver_Canadian_Maple_Leaf_MADE_OF_.9999%25_PURE_SILVER.jpg', emoji: '🍁' },
                { title: 'Тюбики Maple Leaf', type: 'Тюбик', weight: '25 унций', year: 'Текущий', purity: 'Серебро 9999', desc: 'Тюбики по 25 монет Maple Leaf — стандарт инвестиционных закупок. Оригинальная упаковка монетного двора. Серебро напрямую с завода.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Canadian_Silver_Maple_Leaf_coins_and_tubes.png/300px-Canadian_Silver_Maple_Leaf_coins_and_tubes.png', emoji: '🍁' },
                { title: 'Канадское серебро', type: 'Коллекция', weight: 'Разный', year: 'Текущий', purity: 'Серебро 9999', desc: 'Коллекция канадских серебряных монет: Maple Leaf, Wildlife Series и другие. Различные размеры и дизайны Королевского монетного двора Канады.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Canadian_Silver_%2883655181%29.jpeg/300px-Canadian_Silver_%2883655181%29.jpeg', emoji: '🇨🇦' },
                { title: 'Call of the Wild — Воющий волк', type: 'Монета', weight: '1 унция', year: '2014', purity: 'Серебро 9999', desc: 'Первая монета серии «Зов природы» — воющий волк в драматическом дизайне. Ограниченный тираж. Серия: волк, сокол, лось, морской лев, пума и другие.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐺' },
                { title: 'Predator Series — Кугуар', type: 'Монета', weight: '1 унция', year: '2012', purity: 'Серебро 9999', desc: 'Канадский кугуар из серии «Хищники» — одна из самых популярных серий Королевского монетного двора Канады. Яркий и впечатляющий дизайн дикого хищника.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐆' },
                { title: 'Серебряный слиток Maple Leaf 1 кг', type: 'Слиток', weight: '1 кг', year: 'Текущий', purity: 'Серебро 9999', desc: 'Канадский серебряный слиток 1 кг с логотипом кленового листа и серийным номером. Один из самых узнаваемых слитков на канадском инвестиционном рынке.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
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
            website: 'perthmint.com',
            history: [
                { title: 'ייסוד בעידן זהב', text: 'בית המטבע של פרת\' נוסד ב-1899 במהלך "בהלת הזהב" האוסטרלית, כסניף של בית המטבע המלכותי הבריטי. מטרתו הייתה עיבוד זהב המופק ממכרות ווסטרן אוסטרליה. לאחר שאוסטרליה הקימה את בית המטבע הלאומי שלה ב-1965, פרת\' המשיך לפעול כבית מטבע ממשלתי עצמאי של ווסטרן אוסטרליה, עם מוניטין עולמי.' },
                { title: 'סדרות הכסף האיקוניות', text: 'Silver Kookaburra הופיעה ב-1990 כאחת מסדרות הכסף הראשונות בעולם עם עיצוב משתנה מדי שנה. Silver Kangaroo הושק ב-2016. סדרת "Lunar" (לוח שנה סיני) הוחלה על מטבעות כסף ב-1999, עם 12 מטבעות המייצגים בעלי חיים מהגלגל הסיני — אחת מסדרות האספנות הפופולריות בעולם. לפרת\' גם Silver Koala ו-Silver Swan.' },
                { title: 'טוהר ואמינות', text: 'Perth Mint ידוע בייצור מטבעות עם טוהר 9999 ו-99999 (Five Nines — 99.999%). הוא מציע שירות "סוכנות" ייחודי המאפשר למשקיעים לרכוש ולאחסן כסף בכספת פרת\' עצמה. בית המטבע גם מציע מוצרי כסף עם ציפוי זהב (gilded) ועם צבע. הוא גם מייצר מטבעות עבור ממשלות אחרות.' }
            ],
            products: [
                { title: 'Silver Kangaroo 2020', type: 'מטבע', weight: '1 אונקיה', year: '2020', purity: 'כסף 9999', desc: 'קנגרו אוסטרלי — מטבע ההשקעה הרשמי של אוסטרליה. כסף 9999. עיצוב מרהיב של קנגרו בתנועה. פופולרי ביותר עם משקיעי כסף ברחבי העולם.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Obverse_2020_Australia_1_oz_Silver_Kangaroo.jpg/300px-Obverse_2020_Australia_1_oz_Silver_Kangaroo.jpg', emoji: '🦘' },
                { title: 'Silver Kookaburra 2oz Proof', type: 'מטבע', weight: '2 אונקיות', year: 'שנתי', purity: 'כסף 9999', desc: 'קוקאברה — ציפור צחקנת אוסטרלית בגרסת Proof מוזהבת. הסדרה הוחלה ב-1990. עיצוב ייחודי מדי שנה. מוגבלת ומבוקשת.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Obverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg/300px-Obverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg', emoji: '🦅' },
                { title: 'Kookaburra Reverse Proof', type: 'מטבע', weight: '2 אונקיות', year: 'שנתי', purity: 'כסף 9999', desc: 'גב מטבע הקוקאברה — עיצוב המשלים את ה-Obverse. גמר Reverse Proof מיוחד עם ניגוד עמוק בין פני המטבע המבוקים.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Reverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg/300px-Reverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg', emoji: '🦅' },
                { title: 'Silver Swan 2022', type: 'מטבע', weight: '1 אונקיה', year: '2022', purity: 'כסף 9999', desc: 'ברבור אוסטרלי (Black Swan) — אחת הסדרות הנדירות מפרת\'. מהדורה מוגבלת בסדרה שנתית. ברבור שחור על רקע כסף.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Obverse_2022_Australia_1_oz_Silver_Swan_Perth_Mint.jpg/300px-Obverse_2022_Australia_1_oz_Silver_Swan_Perth_Mint.jpg', emoji: '🦢' },
                { title: 'Lunar Series III — Dragon 2024', type: 'מטבע', weight: '1 אונקיה', year: '2024', purity: 'כסף 9999', desc: 'דרקון לוח שנה סיני 2024 מסדרת Lunar III. הפופולרי ביותר בסדרה שנתית. מייצר סקרנות עצומה גם בקרב אספנים אסייתים ומשקיעים.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐉' },
                { title: 'Perth Mint 1kg Silver Bar', type: 'מטיל', weight: '1 ק"ג', year: 'שוטף', purity: 'כסף 9999', desc: 'מטיל כסף 1 ק"ג של פרת\' — גמר מבריק ועם הולוגרמת אבטחה. אחד המטילים המאומתים ביותר בשוק האוסטרלי. כולל תעודת אמיתות.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
            ]
        },
        en: {
            name: 'Perth Mint',
            subtitle: 'Perth Mint — Kangaroo, Kookaburra & Lunar Series',
            founded: 'Founded 1899',
            location: 'Perth, Western Australia',
            website: 'perthmint.com',
            history: [
                { title: 'Gold Rush Foundation', text: 'The Perth Mint was founded in 1899 during the Australian gold rush, as a branch of the British Royal Mint. Its purpose was to process gold extracted from Western Australian mines. After Australia established its national mint in 1965, Perth continued as an independent state government mint for Western Australia, building a world-class reputation.' },
                { title: 'Iconic Silver Series', text: 'The Silver Kookaburra launched in 1990 as one of the world\'s first silver series with an annually changing design. The Silver Kangaroo launched in 2016. The "Lunar" series (Chinese calendar) was applied to silver coins in 1999, with 12 coins representing Chinese zodiac animals — one of the world\'s most popular collecting series. Perth also produces Silver Koala and Silver Swan.' },
                { title: 'Purity & Reliability', text: 'Perth Mint is renowned for coins of .9999 and .99999 purity (Five Nines — 99.999%). It offers a unique "Certificate" storage service allowing investors to buy and store silver in Perth\'s own vault. The mint also offers gold-plated (gilded) and coloured silver products. It also strikes coins for other governments worldwide.' }
            ],
            products: [
                { title: 'Silver Kangaroo 2020', type: 'Coin', weight: '1 oz', year: '2020', purity: '9999 Silver', desc: 'Australian Kangaroo — Australia\'s official investment coin. .9999 fine silver. Stunning design of a kangaroo in motion. Very popular among silver investors worldwide.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Obverse_2020_Australia_1_oz_Silver_Kangaroo.jpg/300px-Obverse_2020_Australia_1_oz_Silver_Kangaroo.jpg', emoji: '🦘' },
                { title: 'Silver Kookaburra 2oz Proof', type: 'Coin', weight: '2 oz', year: 'Annual', purity: '9999 Silver', desc: 'Kookaburra — the laughing Australian bird in gilded Proof version. Series started 1990. Unique design each year. Limited and highly sought-after.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Obverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg/300px-Obverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg', emoji: '🦅' },
                { title: 'Kookaburra Reverse Proof', type: 'Coin', weight: '2 oz', year: 'Annual', purity: '9999 Silver', desc: 'The Kookaburra reverse side — design complementing the obverse. Special Reverse Proof finish with deep contrast between frosted coin surfaces.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Reverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg/300px-Reverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg', emoji: '🦅' },
                { title: 'Silver Swan 2022', type: 'Coin', weight: '1 oz', year: '2022', purity: '9999 Silver', desc: 'Australian Black Swan — one of Perth\'s rarest series. Limited mintage annual series. Black swan on silver background.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Obverse_2022_Australia_1_oz_Silver_Swan_Perth_Mint.jpg/300px-Obverse_2022_Australia_1_oz_Silver_Swan_Perth_Mint.jpg', emoji: '🦢' },
                { title: 'Lunar Series III — Dragon 2024', type: 'Coin', weight: '1 oz', year: '2024', purity: '9999 Silver', desc: 'Chinese zodiac Dragon 2024 from the Lunar Series III. Most popular in the annual series. Generates enormous interest among Asian collectors and investors alike.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐉' },
                { title: 'Perth Mint 1kg Silver Bar', type: 'Bar', weight: '1 kg', year: 'Current', purity: '9999 Silver', desc: 'Perth Mint 1kg silver bar — mirror finish with security hologram. One of the most trusted bars in the Australian market. Certificate of authenticity included.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
            ]
        },
        ru: {
            name: 'Монетный двор Перта',
            subtitle: 'Perth Mint — Кенгуру, Кукабарра и Лунная серия',
            founded: 'Основан в 1899',
            location: 'Перт, Западная Австралия',
            website: 'perthmint.com',
            history: [
                { title: 'Основание в эпоху золотой лихорадки', text: 'Монетный двор Перта был основан в 1899 году во время австралийской золотой лихорадки как филиал британского Королевского монетного двора. Его задачей была переработка золота из шахт Западной Австралии. После создания национального монетного двора Австралии в 1965 году Перт продолжил работу как независимый государственный монетный двор штата.' },
                { title: 'Легендарные серебряные серии', text: 'Silver Kookaburra запустили в 1990 году как одну из первых в мире серий серебра с меняющимся ежегодным дизайном. Silver Kangaroo появился в 2016 году. «Лунная» серия (китайский календарь) вышла на серебряных монетах в 1999 году — 12 монет с животными китайского зодиака, ставших одними из самых популярных в мире. Перт также выпускает Silver Koala и Silver Swan.' },
                { title: 'Чистота и надёжность', text: 'Монетный двор Перта известен монетами с пробой .9999 и .99999 (Five Nines — 99,999%). Он предлагает уникальный сервис хранения, позволяющий инвесторам покупать и хранить серебро в собственном хранилище Перта. Двор также выпускает позолоченные и цветные серебряные изделия и чеканит монеты для правительств других стран.' }
            ],
            products: [
                { title: 'Silver Kangaroo 2020', type: 'Монета', weight: '1 унция', year: '2020', purity: 'Серебро 9999', desc: 'Австралийский кенгуру — официальная инвестиционная монета Австралии. Серебро .9999. Великолепный дизайн кенгуру в движении. Очень популярна среди инвесторов по всему миру.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Obverse_2020_Australia_1_oz_Silver_Kangaroo.jpg/300px-Obverse_2020_Australia_1_oz_Silver_Kangaroo.jpg', emoji: '🦘' },
                { title: 'Silver Kookaburra 2 oz Proof', type: 'Монета', weight: '2 унции', year: 'Ежегодно', purity: 'Серебро 9999', desc: 'Кукабарра — смеющаяся австралийская птица в позолоченной версии Proof. Серия с 1990 года. Уникальный дизайн каждый год. Ограниченный тираж.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Obverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg/300px-Obverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg', emoji: '🦅' },
                { title: 'Kookaburra Reverse Proof', type: 'Монета', weight: '2 унции', year: 'Ежегодно', purity: 'Серебро 9999', desc: 'Реверс монеты Кукабарра — дизайн, дополняющий аверс. Специальный финиш Reverse Proof с глубоким контрастом матовых поверхностей.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Reverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg/300px-Reverse_of_two_ounce_Kookaburra_proof_coin_from_the_Perth_mint.jpg', emoji: '🦅' },
                { title: 'Silver Swan 2022', type: 'Монета', weight: '1 унция', year: '2022', purity: 'Серебро 9999', desc: 'Австралийский чёрный лебедь — одна из редчайших серий Перта. Ограниченный ежегодный тираж. Чёрный лебедь на серебряном фоне.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Obverse_2022_Australia_1_oz_Silver_Swan_Perth_Mint.jpg/300px-Obverse_2022_Australia_1_oz_Silver_Swan_Perth_Mint.jpg', emoji: '🦢' },
                { title: 'Lunar Series III — Дракон 2024', type: 'Монета', weight: '1 унция', year: '2024', purity: 'Серебро 9999', desc: 'Дракон китайского зодиака 2024 из серии Lunar III. Самая популярная в ежегодной серии. Огромный интерес среди азиатских коллекционеров и инвесторов.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🐉' },
                { title: 'Серебряный слиток Perth Mint 1 кг', type: 'Слиток', weight: '1 кг', year: 'Текущий', purity: 'Серебро 9999', desc: 'Серебряный слиток 1 кг от монетного двора Перта — зеркальная полировка с голографической защитой. Один из наиболее надёжных слитков на австралийском рынке. Прилагается сертификат.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
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
            website: 'muenzeoesterreich.at',
            history: [
                { title: 'ייסוד אימפריאלי', text: 'בית המטבע הווינאי (Münze Österreich) נוסד ב-1194 ביוזמת הדוכס לאופולד V ​​מאוסטריה, מכסף שנגבה מפדיון השבי של ריצ\'רד לב-הארי. זהו אחד מבתי המטבע הפעילים הוותיקים בעולם. לאורך מאות שנים שירת את האימפריה ההבסבורגית, ייצר מטבעות לקיסרים, ואת מורשת אירופה המלכותית.' },
                { title: 'Wiener Philharmoniker — הנמכר ביותר באירופה', text: 'ב-1989 השיק בית המטבע הווינאי את Wiener Philharmoniker — מטבע כסף 999 שהפך לנמכר ביותר באירופה. המטבע מוקדש לתזמורת הפילהרמונית הווינאית, אחת הנודעות בעולם. פני המטבע מקשטים כלים מוזיקליים של התזמורת, ועל גבו האורגן ב"זאל מוזיקפרין". הוא הילך חוקי באוסטריה.' },
                { title: 'הנבה ומדלי', text: 'מעבר ל-Philharmoniker, בית המטבע הווינאי מנפיק את Vienna Mint Collection — כולל מטבעות כסף נדירים עם עיצובים של אמני וינה. מטבע ה-100 יורו זהב הוא אחד הגדולים שהנפיק. בית המטבע גם ידוע בייצור מדלי כסף ועיטורים מדינתיים למדינות אחרות. הוא שיתף פעולה עם אמנים עולמיים לסדרות מוגבלות.' }
            ],
            products: [
                { title: 'Wiener Philharmoniker Obverse', type: 'מטבע', weight: '1 אונקיה', year: '2024', purity: 'כסף 999', desc: 'פני המטבע — כלי התזמורת: כינור, צ\'לו, חצוצרה, ועוד. עיצוב קלאסי שלא השתנה מאז 1989. הילך חוקי 1.5 יורו. ראי ביסוד האסתטי האוסטרי.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png', emoji: '🎻' },
                { title: 'Wiener Philharmoniker Reverse', type: 'מטבע', weight: '1 אונקיה', year: '2024', purity: 'כסף 999', desc: 'גב המטבע — עיצוב האורגן הגדול של "ויינר מוזיקפריין". שני צדי המטבע מהווים יצירת אמנות שלמה. קונקרט ויזואלי בכסף.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png', emoji: '🎵' },
                { title: 'Vienna Silver Coins Collection', type: 'אוסף', weight: 'מגוון', year: 'שוטף', purity: 'כסף 999', desc: 'אוסף מטבעות כסף ווינאיים — מגוון שנים, גדלים ועיצובים. מציג את עושר הסדרה מ-1989 עד היום.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Silvercoins.jpg/300px-Silvercoins.jpg', emoji: '🎼' },
                { title: 'Philharmoniker ¼ oz', type: 'מטבע', weight: '¼ אונקיה', year: 'שוטף', purity: 'כסף 999', desc: 'גרסת ¼ אונקיה — פתרון השקעה קטן ונגיש יותר. אותו עיצוב קלאסי במחיר נמוך יותר. מועדף על מתחילים ועל מי שרוצה לפזר קניות.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png', emoji: '🎻' },
                { title: 'Philharmoniker 10oz', type: 'מטבע', weight: '10 אונקיות', year: 'שוטף', purity: 'כסף 999', desc: 'גרסת 10 אונקיות — מהגדולות בסדרת Philharmoniker. אסתטית ומשמעותית כפריט השקעה. ייצור מוגבל ועלות פרמיום.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png', emoji: '🥈' },
                { title: 'Vienna Mint Collection Box', type: 'סט', weight: 'מגוון', year: '2023', purity: 'כסף 999', desc: 'קופסת אוסף Vienna Mint — כמה מטבעות Philharmoniker מסנות שונות, ובאריזת מתנה מפוארת. מהדורה מוגבלת לשנת 2023.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Silvercoins.jpg/300px-Silvercoins.jpg', emoji: '🎁' }
            ]
        },
        en: {
            name: 'Austrian Mint (Vienna)',
            subtitle: 'Münze Österreich — Home of the Wiener Philharmoniker',
            founded: 'Founded 1194',
            location: 'Vienna, Austria',
            website: 'muenzeoesterreich.at',
            history: [
                { title: 'Imperial Foundation', text: 'The Austrian Mint (Münze Österreich) was founded in 1194 at the initiative of Duke Leopold V of Austria, from silver raised through the ransom of Richard the Lionheart. It is one of the oldest continuously operating mints in the world. For centuries it served the Habsburg Empire, producing coins for emperors and carrying the legacy of European royal tradition.' },
                { title: 'Wiener Philharmoniker — Europe\'s Best-Seller', text: 'In 1989, the Austrian Mint launched the Wiener Philharmoniker — a .999 fine silver coin that became Europe\'s best-selling bullion coin. The coin is dedicated to the Vienna Philharmonic Orchestra, one of the world\'s most renowned. The obverse features instruments of the orchestra, while the reverse shows the great organ of the Wiener Musikverein. It is legal tender in Austria.' },
                { title: 'Innovation & Medals', text: 'Beyond the Philharmoniker, the Austrian Mint issues the Vienna Mint Collection — including rare silver coins with designs by Viennese artists. Its 100 Euro gold coin is one of the largest ever issued. The mint also produces silver medals and state decorations for other countries, and has collaborated with international artists for limited series.' }
            ],
            products: [
                { title: 'Wiener Philharmoniker Obverse', type: 'Coin', weight: '1 oz', year: '2024', purity: '999 Silver', desc: 'Coin obverse — orchestra instruments: violin, cello, trumpet and more. Classic design unchanged since 1989. Legal tender €1.50. A visual foundation of Austrian aesthetics.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png', emoji: '🎻' },
                { title: 'Wiener Philharmoniker Reverse', type: 'Coin', weight: '1 oz', year: '2024', purity: '999 Silver', desc: 'Coin reverse — the great organ of the Wiener Musikverein. Both sides form a complete artwork. A visual concert in silver.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png', emoji: '🎵' },
                { title: 'Vienna Silver Coins Collection', type: 'Collection', weight: 'Various', year: 'Current', purity: '999 Silver', desc: 'Vienna silver coins collection — various years, sizes and designs. Showcasing the richness of the series from 1989 to today.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Silvercoins.jpg/300px-Silvercoins.jpg', emoji: '🎼' },
                { title: 'Philharmoniker ¼ oz', type: 'Coin', weight: '¼ oz', year: 'Current', purity: '999 Silver', desc: 'Quarter-ounce version — a more accessible, smaller investment option. Same classic design at a lower price point. Popular with beginners and those building a dollar-cost average strategy.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png', emoji: '🎻' },
                { title: 'Philharmoniker 10oz', type: 'Coin', weight: '10 oz', year: 'Current', purity: '999 Silver', desc: 'Ten-ounce version — one of the largest in the Philharmoniker series. Aesthetically striking and significant as an investment piece. Limited production and premium price.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png', emoji: '🥈' },
                { title: 'Vienna Mint Collection Box', type: 'Set', weight: 'Various', year: '2023', purity: '999 Silver', desc: 'Vienna Mint collection box — several Philharmoniker coins from different years in luxurious gift packaging. Limited 2023 edition.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Silvercoins.jpg/300px-Silvercoins.jpg', emoji: '🎁' }
            ]
        },
        ru: {
            name: 'Австрийский монетный двор (Вена)',
            subtitle: 'Münze Österreich — дом Wiener Philharmoniker',
            founded: 'Основан в 1194',
            location: 'Вена, Австрия',
            website: 'muenzeoesterreich.at',
            history: [
                { title: 'Имперское основание', text: 'Австрийский монетный двор (Münze Österreich) был основан в 1194 году по инициативе герцога Леопольда V Австрийского — из серебра, полученного в качестве выкупа за Ричарда Львиное Сердце. Это один из старейших непрерывно действующих монетных дворов в мире. Столетиями он служил Габсбургской империи, чеканя монеты для императоров.' },
                { title: 'Wiener Philharmoniker — лидер продаж Европы', text: 'В 1989 году Австрийский монетный двор выпустил Wiener Philharmoniker — монету из серебра .999, ставшую самой продаваемой инвестиционной монетой в Европе. Монета посвящена Венскому филармоническому оркестру. На аверсе изображены инструменты оркестра, на реверсе — орган Wiener Musikverein. Является законным платёжным средством в Австрии.' },
                { title: 'Инновации и медали', text: 'Помимо Philharmoniker, Австрийский монетный двор выпускает Vienna Mint Collection — редкие серебряные монеты с дизайном венских художников. Его золотая монета номиналом 100 евро — одна из крупнейших когда-либо выпускавшихся. Двор также производит серебряные медали и государственные награды для других стран.' }
            ],
            products: [
                { title: 'Wiener Philharmoniker Аверс', type: 'Монета', weight: '1 унция', year: '2024', purity: 'Серебро 999', desc: 'Аверс монеты — инструменты оркестра: скрипка, виолончель, труба и другие. Классический дизайн, не менявшийся с 1989 года. Номинал €1,50.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png', emoji: '🎻' },
                { title: 'Wiener Philharmoniker Реверс', type: 'Монета', weight: '1 унция', year: '2024', purity: 'Серебро 999', desc: 'Реверс монеты — великий орган Wiener Musikverein. Обе стороны образуют единое произведение искусства. Визуальный концерт в серебре.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png', emoji: '🎵' },
                { title: 'Коллекция венских монет', type: 'Коллекция', weight: 'Разный', year: 'Текущий', purity: 'Серебро 999', desc: 'Коллекция венских серебряных монет — различные годы, размеры и дизайны. Демонстрирует богатство серии с 1989 года по сегодняшний день.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Silvercoins.jpg/300px-Silvercoins.jpg', emoji: '🎼' },
                { title: 'Philharmoniker ¼ унции', type: 'Монета', weight: '¼ унции', year: 'Текущий', purity: 'Серебро 999', desc: 'Четвертьунцевая версия — более доступный вариант инвестиции. Тот же классический дизайн по более низкой цене. Популярна среди начинающих и приверженцев усреднения стоимости.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Obverse.png', emoji: '🎻' },
                { title: 'Philharmoniker 10 унций', type: 'Монета', weight: '10 унций', year: 'Текущий', purity: 'Серебро 999', desc: 'Десятиунцевая версия — одна из крупнейших в серии Philharmoniker. Эстетически выразительна и значима как инвестиционный объект. Ограниченное производство.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png/300px-Austria_2009_Silver_Philharmonic_%E2%80%93_Reverse.png', emoji: '🥈' },
                { title: 'Коробка Vienna Mint Collection', type: 'Набор', weight: 'Разный', year: '2023', purity: 'Серебро 999', desc: 'Подарочная коробка Vienna Mint — несколько монет Philharmoniker разных лет в роскошной упаковке. Лимитированный выпуск 2023 года.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Silvercoins.jpg/300px-Silvercoins.jpg', emoji: '🎁' }
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
            website: 'casademoneda.gob.mx',
            history: [
                { title: 'הוותיק ביותר באמריקה', text: 'Casa de Moneda de México, הוקמה ב-1535 בצו המלך קרלוס הראשון של ספרד — בית המטבע הראשון והוותיק ביותר ביבשת אמריקה. כ-500 שנות פעולה רצופה. הבניין ההיסטורי בלב העיר מקסיקו (כיום מוזיאון נומיסמטי) הוא אתר מורשת עולמית של יונסק"ו. המינט הדף מטבעות כסף המפורסמים "Reales" שמימנו את הכלכלה הקולוניאלית של ספרד.' },
                { title: 'Onza de Plata Libertad — כסף ההשקעה המקסיקני', text: 'ב-1982 הנפיק בית המטבע המקסיקני את ה-Onza de Plata Libertad — המטבע ההשקעה הרשמי של מקסיקו. על פני המטבע ניצבת "הניצחון המכונף" (מלאך העצמאות), אנדרטת העצמאות של מקסיקו סיטי. הגב מקשט נשר מקסיקני עם נחש — סמל המדינה. הוא מיוצר בכסף 999 ו-9999, בגדלים מ-1/20 אונקיה עד 5 אונקיות.' },
                { title: 'מורשת אמנותית ועושר', text: 'מקסיקו הייתה בעל מכרות הכסף הגדולים בעולם — מכרות גואנחוואטו וסאקאטקאס סיפקו לאורך מאות שנים חלק ניכר מהכסף הגלובלי. Libertad נחשב לאחד המטבעות עם העיצוב הנחשב ביותר בשוק העולמי. המינט מייצר גם מטבעות זיכרון עם עיצובים פרה-קולומביאניים — אצטקים, מאיה ועוד.' }
            ],
            products: [
                { title: 'Libertad 1oz — Winged Victory', type: 'מטבע', weight: '1 אונקיה', year: '2024', purity: 'כסף 999', desc: 'מטבע ה-Libertad הסטנדרטי 1 אונקיה — "הניצחון המכונף" עם הרים הרקע. עיצוב המוכר כיפה ביותר של כסף ההשקעה. גרסאות Proof ו-BU.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Venta_de_Onza_de_Plata_Libertad_en_ventanilla_bancaria.png/300px-Venta_de_Onza_de_Plata_Libertad_en_ventanilla_bancaria.png', emoji: '🏆' },
                { title: 'Libertad 5oz', type: 'מטבע', weight: '5 אונקיות', year: 'שוטף', purity: 'כסף 999', desc: 'גרסת 5 אונקיות — Libertad גדולה ומרשימה. פריט אספנות נדיר ויקר ערך. עיצוב זהה לגרסת 1 אונקיה אך בפרמיום גבוה יותר.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Libertad ¼ oz', type: 'מטבע', weight: '¼ אונקיה', year: 'שוטף', purity: 'כסף 999', desc: 'גרסת ¼ אונקיה — כניסה קטנה יותר לעולם ה-Libertad. פופולרי כמתנה ולאיסוף. הגרסה הקטנה ביותר מתוך 5 גדלים רשמיים.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🪙' },
                { title: 'Aztec Calendar Silver Coin', type: 'מטבע', weight: '1 אונקיה', year: '2023', purity: 'כסף 999', desc: 'מטבע זיכרון עם לוח השנה האצטקי המפורסם — "אבן השמש" האצטקית. מסדרת מורשת פרה-קולומביאנית.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '☀️' },
                { title: 'Maya Tzolkin Silver Medal', type: 'מדלייה', weight: '1 אונקיה', year: '2022', purity: 'כסף 999', desc: 'מדלית כסף עם לוח השנה המאיאני Tzolkin — מורשת התרבות המאיאנית. מסדרת "Culturas Prehispánicas" של בית המטבע.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🗿' },
                { title: 'Mexican Silver Plata Pura Bar', type: 'מטיל', weight: '100 גרם', year: 'שוטף', purity: 'כסף 999', desc: 'מטיל כסף מקסיקני עם חותמת "Plata Pura" — כסף טהור. עם לוגו Casa de Moneda ומספר סידורי. ייצור ממלכתי ייעודי להשקעה.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
            ]
        },
        en: {
            name: 'Casa de Moneda de México',
            subtitle: 'Casa de Moneda de México — The Americas\' oldest mint since 1535',
            founded: 'Founded 1535',
            location: 'San Luis Potosí, Mexico',
            website: 'casademoneda.gob.mx',
            history: [
                { title: 'Oldest Mint in the Americas', text: 'Casa de Moneda de México was established in 1535 by decree of King Charles I of Spain — the first and oldest mint in the entire American continent. Nearly 500 years of continuous operation. The historic building in Mexico City (now a numismatic museum) is a UNESCO World Heritage Site. The mint struck the famous silver "Reales" coins that financed Spain\'s colonial economy.' },
                { title: 'Onza de Plata Libertad — Mexican Investment Silver', text: 'In 1982, the Mexican Mint issued the Onza de Plata Libertad — Mexico\'s official investment coin. The obverse features the "Winged Victory" (Angel of Independence), Mexico City\'s landmark monument. The reverse displays the Mexican eagle with a serpent — the national symbol. Produced in .999 and .9999 silver, in sizes from 1/20 oz to 5 oz.' },
                { title: 'Artistic Heritage & Wealth', text: 'Mexico was home to the world\'s largest silver mines — the Guanajuato and Zacatecas mines supplied a significant portion of global silver for centuries. The Libertad is considered one of the most beautifully designed coins in the world market. The mint also produces commemorative coins with Pre-Columbian designs — Aztec, Maya and more.' }
            ],
            products: [
                { title: 'Libertad 1oz — Winged Victory', type: 'Coin', weight: '1 oz', year: '2024', purity: '999 Silver', desc: 'The standard 1oz Libertad coin — "Winged Victory" with mountain backdrop. Design widely regarded as the most beautiful in investment silver. Available in Proof and BU finishes.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Venta_de_Onza_de_Plata_Libertad_en_ventanilla_bancaria.png/300px-Venta_de_Onza_de_Plata_Libertad_en_ventanilla_bancaria.png', emoji: '🏆' },
                { title: 'Libertad 5oz', type: 'Coin', weight: '5 oz', year: 'Current', purity: '999 Silver', desc: '5-ounce version — a large and impressive Libertad. A rare and highly valued collectible. Same design as the 1oz but commands a higher premium.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Libertad ¼ oz', type: 'Coin', weight: '¼ oz', year: 'Current', purity: '999 Silver', desc: 'Quarter-ounce version — a smaller entry point into the Libertad world. Popular as a gift and for collecting. The smallest of 5 official sizes.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🪙' },
                { title: 'Aztec Calendar Silver Coin', type: 'Coin', weight: '1 oz', year: '2023', purity: '999 Silver', desc: 'Commemorative coin featuring the famous Aztec calendar — the "Aztec Sun Stone." From the Pre-Columbian heritage series.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '☀️' },
                { title: 'Maya Tzolkin Silver Medal', type: 'Medal', weight: '1 oz', year: '2022', purity: '999 Silver', desc: 'Silver medal featuring the Maya Tzolkin calendar — Mayan cultural heritage. From the "Culturas Prehispánicas" series of the mint.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🗿' },
                { title: 'Mexican Plata Pura Silver Bar', type: 'Bar', weight: '100g', year: 'Current', purity: '999 Silver', desc: 'Mexican silver bar stamped "Plata Pura" — pure silver. With Casa de Moneda logo and serial number. State production specifically for investment purposes.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
            ]
        },
        ru: {
            name: 'Монетный двор Мексики',
            subtitle: 'Casa de Moneda de México — старейший монетный двор Америки с 1535 г.',
            founded: 'Основан в 1535',
            location: 'Сан-Луис-Потоси, Мексика',
            website: 'casademoneda.gob.mx',
            history: [
                { title: 'Старейший в Америке', text: 'Casa de Moneda de México был основан в 1535 году по указу короля Карла I Испанского — первый и старейший монетный двор на всём американском континенте. Почти 500 лет непрерывной работы. Историческое здание в Мехико (ныне нумизматический музей) — объект Всемирного наследия ЮНЕСКО. Двор чеканил знаменитые серебряные «Реалы», финансировавшие колониальную экономику Испании.' },
                { title: 'Onza de Plata Libertad — мексиканское инвестиционное серебро', text: 'В 1982 году Мексиканский монетный двор выпустил Onza de Plata Libertad — официальную инвестиционную монету Мексики. На аверсе — «Крылатая победа» (Ангел Независимости), символ Мехико. Реверс украшен мексиканским орлом со змеёй — национальным гербом. Чеканится из серебра .999 и .9999 в размерах от 1/20 унции до 5 унций.' },
                { title: 'Художественное наследие и богатство', text: 'Мексика была родиной крупнейших серебряных рудников мира — шахты Гуанахуато и Сакатекас веками снабжали значительную часть мирового серебра. Libertad считается одной из красивейших монет на мировом рынке. Монетный двор также выпускает памятные монеты с доколумбийскими дизайнами — ацтекскими, майя и другими.' }
            ],
            products: [
                { title: 'Libertad 1 унция — Крылатая победа', type: 'Монета', weight: '1 унция', year: '2024', purity: 'Серебро 999', desc: 'Стандартная монета Libertad 1 унция — «Крылатая победа» на фоне гор. Дизайн, широко признанный красивейшим в инвестиционном серебре. Доступна в вариантах Proof и BU.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Venta_de_Onza_de_Plata_Libertad_en_ventanilla_bancaria.png/300px-Venta_de_Onza_de_Plata_Libertad_en_ventanilla_bancaria.png', emoji: '🏆' },
                { title: 'Libertad 5 унций', type: 'Монета', weight: '5 унций', year: 'Текущий', purity: 'Серебро 999', desc: 'Пятиунцевая версия — крупная и впечатляющая Libertad. Редкий и высокоценный предмет коллекционирования. Тот же дизайн, что у 1-унцевой, но с более высокой надбавкой.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' },
                { title: 'Libertad ¼ унции', type: 'Монета', weight: '¼ унции', year: 'Текущий', purity: 'Серебро 999', desc: 'Четвертьунцевая версия — меньший вход в мир Libertad. Популярна как подарок и для коллекционирования. Наименьший из 5 официальных размеров.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🪙' },
                { title: 'Серебряная монета Aztec Calendar', type: 'Монета', weight: '1 унция', year: '2023', purity: 'Серебро 999', desc: 'Памятная монета с известным ацтекским календарём — «Камнем Солнца». Из серии доколумбийского наследия.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '☀️' },
                { title: 'Серебряная медаль Maya Tzolkin', type: 'Медаль', weight: '1 унция', year: '2022', purity: 'Серебро 999', desc: 'Серебряная медаль с календарём майя Цолькин — наследие культуры майя. Из серии «Culturas Prehispánicas» монетного двора.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🗿' },
                { title: 'Мексиканский слиток Plata Pura', type: 'Слиток', weight: '100 г', year: 'Текущий', purity: 'Серебро 999', desc: 'Мексиканский серебряный слиток со штампом «Plata Pura» — чистое серебро. С логотипом Casa de Moneda и серийным номером. Государственное производство для инвестиций.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Silver_bullion_bar.jpg/300px-Silver_bullion_bar.jpg', emoji: '🥈' }
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

    // Products HTML
    const productsHtml = d.products.map(p => `
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
                <p class="mint-product-year">${escapeHtml(p.year)} · ${escapeHtml(p.weight)}</p>
                <span class="mint-product-type">${escapeHtml(p.type)}</span>
                <p class="mint-product-desc">${escapeHtml(p.desc)}</p>
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
            <div class="mint-hero-flag">${mint.flag}</div>
            <div class="mint-hero-body">
                <h1 class="mint-hero-name">${escapeHtml(d.name)}</h1>
                <p class="mint-hero-subtitle">${escapeHtml(d.subtitle)}</p>
                <div class="mint-meta-row">
                    <span class="mint-meta-chip">📅 ${escapeHtml(d.founded)}</span>
                    <span class="mint-meta-chip">📍 ${escapeHtml(d.location)}</span>
                </div>
            </div>
        </div>

        <div class="mint-building-wrap">
            <img class="mint-building-img"
                 src="${escapeHtml(mint.buildingImg)}"
                 alt="${escapeHtml(d.name)}"
                 loading="lazy"
                 onerror="this.parentElement.innerHTML='<div class=\\'mint-building-placeholder\\'>${mint.flag}</div>'">
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

        <section class="mint-section">
            <h3 class="mint-section-title">${L.products}</h3>
            <div class="mint-products-grid">${productsHtml}</div>
        </section>

        <a class="mint-website-link" href="https://${escapeHtml(d.website)}" target="_blank" rel="noopener">
            🌐 ${L.more}: ${escapeHtml(d.website)}
        </a>
    `;
}

function openMuseumMint(mintId) {
    renderMintDetail(mintId, _museumActiveLang);
    goToScreen('mint-detail-screen');
}

function initMuseum() {
    // Mint hub cards
    document.querySelectorAll('.mint-hub-card').forEach(btn => {
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

    container.innerHTML = data.chapters.map((ch, i) => `
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

    // Render default
    renderGuide('he');
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
    if (sessionToken()) showDashboard();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
