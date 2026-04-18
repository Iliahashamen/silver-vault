// ═══════════════════════════════════════════
// THE SILVER VAULT — App v3
// ═══════════════════════════════════════════

let tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const SESSION_KEY    = 'vault_session';
const SESSION_DURATION = 3 * 60 * 60 * 1000;
const PNL_KEY        = 'vault_pnl_entries_v1';
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

// ── LOGIN ────────────────────────────────────────────────────────────
async function handleLogin() {
    const pass = document.getElementById('passcode')?.value.trim();
    if (!pass) return;
    const msg = document.getElementById('error-msg');
    const btn = document.getElementById('login-btn');
    if (msg) msg.textContent = 'מתחבר...';
    if (btn)  btn.disabled = true;
    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: pass }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'גישה נדחתה');
        saveSession(data.token);
        if (msg) msg.textContent = 'גישה אושרה ✓';
        setTimeout(() => showDashboard(), 500);
    } catch {
        if (msg) msg.textContent = 'שגיאת התחברות ✗';
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
    try {
        const res  = await fetch(`${CONFIG.CHAT_API_URL}/api/silver-price`);
        const data = await res.json();
        if (!data.success) throw new Error();
        silverPrice = Number(data.xag_usd);
        document.getElementById('price-value').textContent  = `$${silverPrice.toFixed(2)}`;
        document.getElementById('price-update').textContent =
            `עודכן לפני ${Math.floor((data.cache_age_seconds || 0) / 60)} דקות`;
    } catch {
        document.getElementById('price-value').textContent  = '$32.00';
        document.getElementById('price-update').textContent = 'מצב דמו';
        silverPrice = 32;
    }
    // Refresh today's USD→ILS rate for net spot valuation
    await refreshCurrentFx();
    renderPnl();
    Object.keys(chartCache).forEach(k => delete chartCache[k]);
    if (document.getElementById('charts-screen')?.classList.contains('active')) {
        requestAnimationFrame(() => renderActiveChart());
    }
}

async function refreshCurrentFx() {
    const today = new Date().toISOString().slice(0, 10);
    const rate  = await fetchFxRate(today);
    if (rate && rate > 0) currentFx = rate;
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
    '1d': { count: 20, vol: 0.009, intervalMs: 24 * 60 * 60 * 1000 },         // 20 days
    '1w': { count: 12, vol: 0.013, intervalMs:  7 * 24 * 60 * 60 * 1000 },    // 12 weeks
    '1m': { count: 12, vol: 0.018, intervalMs: 30 * 24 * 60 * 60 * 1000 },    // 12 months
};

function genCandles(frame) {
    const conf = FRAME_CONF[frame];
    const now  = Date.now();
    let close  = silverPrice || 32;
    const out  = [];
    for (let i = 0; i < conf.count; i++) {
        const ts   = now - (conf.count - i) * conf.intervalMs;
        const open = close;
        close = Math.max(8, open + (Math.random() - 0.5) * conf.vol * open);
        const high = Math.max(open, close) + Math.random() * conf.vol * open * 1.8;
        const low  = Math.min(open, close) - Math.random() * conf.vol * open * 1.8;
        out.push({ open, close, high, low: Math.max(0.1, low), ts });
    }
    return out;
}

function formatCandleTime(ts, frame) {
    const d  = new Date(ts);
    const tz = 'Asia/Jerusalem';
    if (frame === '1d') {
        // Exact date: DD/MM/YYYY
        const day   = d.toLocaleDateString('he-IL', { day: '2-digit',   timeZone: tz });
        const month = d.toLocaleDateString('he-IL', { month: '2-digit', timeZone: tz });
        const year  = d.toLocaleDateString('he-IL', { year:  '2-digit', timeZone: tz });
        return `${day}/${month}/${year}`;
    }
    if (frame === '1w') {
        // Week start: DD/MM
        const day   = d.toLocaleDateString('he-IL', { day: '2-digit',   timeZone: tz });
        const month = d.toLocaleDateString('he-IL', { month: '2-digit', timeZone: tz });
        return `${day}/${month}`;
    }
    // Monthly: MM/YYYY
    const month = d.toLocaleDateString('he-IL', { month: '2-digit', timeZone: tz });
    const year  = d.toLocaleDateString('he-IL', { year:  '2-digit', timeZone: tz });
    return `${month}/${year}`;
}

// ── CANDLESTICK RENDERER (canvas) ───────────────────────────────────
function drawRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y,     x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x,     y + h, rr);
    ctx.arcTo(x,     y + h, x,     y,     rr);
    ctx.arcTo(x,     y,     x + w, y,     rr);
    ctx.closePath();
}

function renderCandleChart(frame) {
    const c = document.getElementById('candles-canvas');
    if (!c) return;
    activeFrame = frame;
    const data = chartCache[frame] || (chartCache[frame] = genCandles(frame));
    const ctx  = c.getContext('2d');
    const dpr  = window.devicePixelRatio || 1;
    const W    = c.clientWidth  || 700;
    const H    = c.clientHeight || 380;
    c.width    = Math.floor(W * dpr);
    c.height   = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Padding: generous bottom for angled timestamps, left for price labels
    const p  = { t: 20, r: 16, b: 70, l: 52 };
    const iw = W - p.l - p.r;
    const ih = H - p.t - p.b;
    const max   = Math.max(...data.map(x => x.high));
    const min   = Math.min(...data.map(x => x.low));
    const span  = Math.max(0.0001, max - min);

    // Background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(240,237,231,.9)';
    drawRoundRect(ctx, 0, 0, W, H, 18);
    ctx.fill();

    // Horizontal grid + Y price labels
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y     = p.t + (ih / gridLines) * i;
        const price = max - (span / gridLines) * i;
        ctx.strokeStyle = 'rgba(78,110,92,.16)';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(W - p.r, y); ctx.stroke();
        ctx.fillStyle  = 'rgba(74,88,72,.60)';
        ctx.font       = '10px Assistant, sans-serif';
        ctx.textAlign  = 'right';
        ctx.fillText(`$${price.toFixed(1)}`, p.l - 5, y + 4);
    }

    // Candles + X timestamps (every candle gets a label, drawn at angle)
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

        // Wick
        ctx.strokeStyle = col;
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(x, yh); ctx.lineTo(x, yl); ctx.stroke();

        // Body
        ctx.fillStyle = col;
        const bodyY = Math.min(yo, yc);
        const bodyH = Math.max(2, Math.abs(yc - yo));
        ctx.fillRect(x - bw / 2, bodyY, bw, bodyH);

        // Tick mark at bottom of chart area
        ctx.strokeStyle = 'rgba(78,110,92,.25)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, H - p.b);
        ctx.lineTo(x, H - p.b + 4);
        ctx.stroke();

        // Date label — rotated 40° so all dates fit without overlap
        const label = formatCandleTime(d.ts, frame);
        ctx.save();
        ctx.translate(x, H - p.b + 6);
        ctx.rotate(-40 * Math.PI / 180);
        ctx.fillStyle = 'rgba(74,88,72,.70)';
        ctx.font      = '9px Assistant, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(label, 0, 0);
        ctx.restore();
    });
}

// ── LINE CHART (Chart.js) ─────────────────────────────────────────────
function renderLineChart(frame) {
    const canvas = document.getElementById('line-canvas');
    if (!canvas) return;
    activeFrame = frame;
    const data   = chartCache[frame] || (chartCache[frame] = genCandles(frame));
    const labels = data.map(c => formatCandleTime(c.ts, frame));
    const prices = data.map(c => c.close);

    const lineColor = 'rgba(196,132,90,1)';
    const fillColor = 'rgba(196,132,90,0.12)';
    const gridColor = 'rgba(74,88,72,0.10)';
    const textColor = 'rgba(74,88,72,0.75)';

    if (lineChart) { lineChart.destroy(); lineChart = null; }

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
                        label: ctx => ` $${ctx.parsed.y.toFixed(3)} USD/oz`
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color:    textColor,
                        font:     { size: 9 },
                        maxRotation: 40,
                        minRotation: 40,
                        autoSkip: false,
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
        if (btn) btn.onclick = goBack;
    });

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
