// ═══════════════════════════════════════════
// THE SILVER VAULT — App v3
// ═══════════════════════════════════════════

let tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

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
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);
    if (screenId === 'charts-screen') {
        // Always clear cache so chart regenerates with the live price
        Object.keys(chartCache).forEach(k => delete chartCache[k]);
        if (lineChart) { lineChart.destroy(); lineChart = null; }
        requestAnimationFrame(() => renderActiveChart());
    }
}

function goBack() {
    goToScreen('dashboard-screen');
}

// ── DARK MODE ────────────────────────────────────────────────────────
function applyDarkMode(dark) {
    document.body.classList.toggle('dark-mode', dark);
    // Opacity flash — GPU-composited, causes zero repaint
    document.body.classList.remove('dark-mode-animating');
    void document.body.offsetWidth; // trigger reflow to restart animation
    document.body.classList.add('dark-mode-animating');
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

// ── CHAT ──────────────────────────────────────────────────────────────
function addMsg(author, text, type) {
    const box = document.getElementById('chat-messages');
    const el  = document.createElement('div');
    el.className = `chat-message ${type}`;
    const safe = escapeHtml(text);
    if (type.includes('bot')) {
        el.innerHTML = `<div class="msg-content"><span class="msg-inline-author">${escapeHtml(author)}:</span> <span class="msg-text">${safe}</span></div>`;
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
    _quizPanel('quiz-start');
}

function initQuiz() {
    document.getElementById('quiz-start-btn')?.addEventListener('click', quizStart);
    document.getElementById('quiz-restart-btn')?.addEventListener('click', quizReset);
}

// ── INIT DASHBOARD ────────────────────────────────────────────────────
function initDashboard() {
    if (dashboardInited) return;
    dashboardInited = true;

    updateSilverPrice();
    setInterval(updateSilverPrice, 30 * 60 * 1000);

    loadPnl();
    renderPnl();

    // ── Main menu navigation ──
    document.querySelectorAll('.main-switch-btn').forEach(b => {
        b.onclick = () => goToScreen(`${b.dataset.target}-screen`);
    });

    // ── Back buttons ──
    ['personal', 'homework', 'updates', 'charts'].forEach(name => {
        const btn = document.getElementById(`back-${name}`);
        if (btn) btn.onclick = () => {
            if (name === 'homework') quizReset(); // stop timer when leaving
            goBack();
        };
    });

    initQuiz();

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

// ── BOOT ──────────────────────────────────────────────────────────────
function boot() {
    applyDarkMode(localStorage.getItem(DARK_MODE_KEY) === '1');
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    document.getElementById('passcode')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') handleLogin();
    });
    if (sessionToken()) showDashboard();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
