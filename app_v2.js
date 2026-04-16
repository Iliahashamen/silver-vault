let tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

const SESSION_KEY = 'vault_session';
const SESSION_DURATION = 3 * 60 * 60 * 1000;
const CHAT_HISTORY_DURATION = 60 * 60 * 1000;
const PNL_KEY = 'vault_pnl_entries_v1';
const DEFAULT_FX = 3.65;

let silverPrice = 32;
let pnlRows = [];
const chartCache = {};
let activeFrame = '5m';
let activeSection = 'personal';

const quiz = [
    { q: 'מה תפקיד סטופ לוס?', a: ['פקודת קניה', 'הגבלת הפסד', 'חישוב מס'], c: 1 },
    { q: 'כשמחיר כסף עולה, שווי האונקיות שלך בדרך כלל...', a: ['יורד', 'עולה', 'נשאר קבוע'], c: 1 },
    { q: 'מה נכון בניהול סיכון?', a: ['עסקה אחת גדולה', 'אין סטופ', 'פיזור ויציאה מתוכננת'], c: 2 },
    { q: 'למה עוקבים אחרי חדשות שוק?', a: ['כדי לזהות תנודתיות', 'רק בידור', 'לא צריך'], c: 0 },
    { q: 'למה לתעד עסקאות?', a: ['אין סיבה', 'לשפר החלטות בעתיד', 'לשתף חברים'], c: 1 },
];
let quizIndex = 0;
let quizScore = 0;
let quizLocked = false;

const uid = tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 1000000);
const CHAT_KEY = `vault_chat_${uid}`;

function sessionToken() {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (!s?.loggedIn) return null;
        if (Date.now() - s.timestamp > SESSION_DURATION) return null;
        return s.token || null;
    } catch {
        return null;
    }
}

function saveSession(token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ loggedIn: true, timestamp: Date.now(), token }));
}

function showDashboard() {
    document.getElementById('login-screen')?.classList.remove('active');
    document.getElementById('dashboard-screen')?.classList.add('active');
    const footer = document.querySelector('.footer');
    if (footer) footer.style.display = 'none';
    initDashboard();
}

async function handleLogin() {
    const pass = document.getElementById('passcode')?.value.trim();
    if (!pass) return;
    const msg = document.getElementById('error-msg');
    const btn = document.getElementById('login-btn');
    if (msg) msg.textContent = 'מתחבר...';
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${CONFIG.CHAT_API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: pass }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'גישה נדחתה');
        saveSession(data.token);
        if (msg) msg.textContent = 'גישה אושרה ✓';
        setTimeout(showDashboard, 500);
    } catch (e) {
        if (msg) msg.textContent = 'שגיאת התחברות ✗';
    } finally {
        if (btn) btn.disabled = false;
    }
}

function formatIls(v) {
    return `₪${Number(v || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

async function updateSilverPrice() {
    try {
        const res = await fetch(`${CONFIG.CHAT_API_URL}/api/silver-price`);
        const data = await res.json();
        if (!data.success) throw new Error();
        silverPrice = Number(data.xag_usd);
        document.getElementById('price-value').textContent = `$${silverPrice.toFixed(2)}`;
        document.getElementById('price-update').textContent = `עודכן לפני ${Math.floor((data.cache_age_seconds || 0) / 60)} דקות`;
    } catch {
        document.getElementById('price-value').textContent = '$32.00';
        document.getElementById('price-update').textContent = 'מצב דמו';
        silverPrice = 32;
    }
    renderPnl();
    Object.keys(chartCache).forEach((k) => delete chartCache[k]);
    renderChart(activeFrame);
}

function loadPnl() {
    try {
        pnlRows = JSON.parse(localStorage.getItem(PNL_KEY)) || [];
        if (!Array.isArray(pnlRows)) pnlRows = [];
    } catch {
        pnlRows = [];
    }
}

function savePnl() {
    localStorage.setItem(PNL_KEY, JSON.stringify(pnlRows));
}

function calcRow(r) {
    const fx = Number(r.fx || DEFAULT_FX);
    const cost = Number(r.cost || 0);
    const buy = Number(r.buy || 0);
    const oz = buy > 0 ? cost / (buy * fx) : 0;
    const now = oz * silverPrice * fx;
    return { ...r, fx, cost, buy, oz, now, pnl: now - cost };
}

function renderPnl() {
    const body = document.getElementById('pnl-table-body');
    if (!body) return;
    if (!pnlRows.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty-row">אין עסקאות עדיין</td></tr>';
    } else {
        body.innerHTML = pnlRows.map(calcRow).map((r) => `
            <tr>
                <td>${r.date}</td><td>${r.note || 'עסקה'}</td><td>${formatIls(r.cost)}</td><td>$${r.buy.toFixed(2)}</td>
                <td>${r.oz.toFixed(4)}</td><td>${formatIls(r.now)}</td>
                <td class="${r.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">${formatIls(r.pnl)}</td>
                <td><button class="row-delete-btn" data-id="${r.id}">✕</button></td>
            </tr>
        `).join('');
    }
    const t = pnlRows.map(calcRow).reduce((a, r) => ({ cost: a.cost + r.cost, now: a.now + r.now }), { cost: 0, now: 0 });
    document.getElementById('total-cost-ils').textContent = formatIls(t.cost);
    document.getElementById('total-current-ils').textContent = formatIls(t.now);
    const pnlEl = document.getElementById('total-pnl-ils');
    const p = t.now - t.cost;
    pnlEl.textContent = formatIls(p);
    pnlEl.className = p >= 0 ? 'pnl-positive' : 'pnl-negative';
}

function renderQuiz() {
    const q = quiz[quizIndex];
    document.getElementById('quiz-progress').textContent = `שאלה ${quizIndex + 1} מתוך ${quiz.length}`;
    document.getElementById('quiz-score').textContent = `ניקוד: ${quizScore}`;
    document.getElementById('quiz-question').textContent = q.q;
    document.getElementById('quiz-feedback').textContent = '';
    document.getElementById('quiz-next-btn').disabled = true;
    quizLocked = false;
    document.getElementById('quiz-options').innerHTML = q.a.map((x, i) => `<button class="quiz-option-btn" data-i="${i}">${x}</button>`).join('');
}

function genCandles(frame) {
    const conf = { '5m': [36, 0.003], '1h': [40, 0.005], '1d': [34, 0.009], '1w': [26, 0.013], '1m': [30, 0.018] }[frame];
    let close = silverPrice || 32;
    const out = [];
    for (let i = 0; i < conf[0]; i += 1) {
        const open = close;
        close = Math.max(8, open + (Math.random() - 0.5) * conf[1] * open);
        const high = Math.max(open, close) + Math.random() * conf[1] * open * 1.8;
        const low = Math.min(open, close) - Math.random() * conf[1] * open * 1.8;
        out.push({ open, close, high, low: Math.max(0.1, low) });
    }
    return out;
}

function drawRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

function renderChart(frame) {
    const c = document.getElementById('candles-canvas');
    if (!c) return;
    activeFrame = frame;
    const data = chartCache[frame] || (chartCache[frame] = genCandles(frame));
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth || 1000, H = c.clientHeight || 420;
    c.width = Math.floor(W * dpr); c.height = Math.floor(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = { t: 20, r: 20, b: 34, l: 48 }, iw = W - p.l - p.r, ih = H - p.t - p.b;
    const max = Math.max(...data.map((x) => x.high)), min = Math.min(...data.map((x) => x.low)), span = Math.max(0.0001, max - min);
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(240,237,231,.88)'; drawRoundRect(ctx, 0, 0, W, H, 18); ctx.fill();
    for (let i = 0; i <= 5; i += 1) {
        const y = p.t + (ih / 5) * i;
        ctx.strokeStyle = 'rgba(78,110,92,.18)'; ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(W - p.r, y); ctx.stroke();
    }
    const step = iw / data.length, bw = Math.max(5, step * 0.56);
    data.forEach((d, i) => {
        const x = p.l + i * step + step / 2;
        const yo = p.t + ((max - d.open) / span) * ih, yc = p.t + ((max - d.close) / span) * ih;
        const yh = p.t + ((max - d.high) / span) * ih, yl = p.t + ((max - d.low) / span) * ih;
        const up = d.close >= d.open, col = up ? '#4AB882' : '#D94949';
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x, yh); ctx.lineTo(x, yl); ctx.stroke();
        ctx.fillStyle = col; ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(2, Math.abs(yc - yo)));
    });
}

function addMsg(author, text, type) {
    const box = document.getElementById('chat-messages');
    const el = document.createElement('div');
    el.className = `chat-message ${type}`;
    el.innerHTML = `<div style="line-height:1.8;margin-bottom:8px;white-space:pre-wrap;">${text}</div><div style="font-size:10px;opacity:.55;text-align:left;">— ${author}</div>`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    addMsg('אתה', text, 'user'); input.value = '';
    const typing = addMsg('מר ד׳', 'מקליד...', 'bot typing');
    try {
        const res = await fetch(`${CONFIG.CHAT_API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(sessionToken() ? { Authorization: `Bearer ${sessionToken()}` } : {}) },
            body: JSON.stringify({ user_id: uid, message: text }),
        });
        const data = await res.json();
        typing.remove();
        addMsg('מר ד׳', data.response || 'אין כרגע מענה, נסה שוב.', 'bot');
    } catch {
        typing.remove();
        addMsg('מר ד׳', 'יש כרגע תקלה זמנית. נסה שוב בעוד רגע.', 'bot error');
    }
}

function initDashboard() {
    updateSilverPrice();
    setInterval(updateSilverPrice, 30 * 60 * 1000);
    loadPnl();
    renderPnl();
    renderQuiz();

    document.querySelectorAll('.main-switch-btn').forEach((b) => b.onclick = () => {
        activeSection = b.dataset.section;
        document.querySelectorAll('.main-switch-btn').forEach((x) => x.classList.toggle('active', x === b));
        document.querySelectorAll('.section-panel').forEach((s) => s.classList.toggle('active', s.id === `${activeSection}-section`));
        if (activeSection === 'charts') renderChart(activeFrame);
    });

    document.getElementById('pnl-form').onsubmit = (e) => {
        e.preventDefault();
        const date = document.getElementById('tx-date').value;
        const note = document.getElementById('tx-note').value.trim();
        const cost = Number(document.getElementById('tx-amount-ils').value || 0);
        const buy = Number(document.getElementById('tx-buy-price').value || 0);
        const fx = Number(document.getElementById('tx-fx').value || DEFAULT_FX);
        if (!date || cost <= 0 || buy <= 0 || fx <= 0) return;
        pnlRows.unshift({ id: `${Date.now()}${Math.random()}`, date, note, cost, buy, fx });
        savePnl();
        renderPnl();
        e.target.reset();
    };

    document.getElementById('pnl-table-body').onclick = (e) => {
        const btn = e.target.closest('.row-delete-btn');
        if (!btn) return;
        pnlRows = pnlRows.filter((r) => String(r.id) !== String(btn.dataset.id));
        savePnl();
        renderPnl();
    };

    document.getElementById('quiz-options').onclick = (e) => {
        const b = e.target.closest('.quiz-option-btn');
        if (!b || quizLocked) return;
        quizLocked = true;
        const i = Number(b.dataset.i);
        const ok = i === quiz[quizIndex].c;
        document.querySelectorAll('.quiz-option-btn').forEach((x) => {
            const ix = Number(x.dataset.i);
            if (ix === quiz[quizIndex].c) x.classList.add('correct');
            if (ix === i && !ok) x.classList.add('wrong');
            x.disabled = true;
        });
        if (ok) quizScore += 1;
        document.getElementById('quiz-score').textContent = `ניקוד: ${quizScore}`;
        document.getElementById('quiz-feedback').textContent = ok ? 'נכון מאוד!' : 'לא מדויק, נסה בשאלה הבאה.';
        document.getElementById('quiz-next-btn').disabled = false;
    };

    document.getElementById('quiz-next-btn').onclick = () => {
        if (quizIndex < quiz.length - 1) {
            quizIndex += 1;
            renderQuiz();
        } else {
            document.getElementById('quiz-feedback').textContent = `סיימת! ציון: ${quizScore}/${quiz.length}`;
            document.getElementById('quiz-next-btn').disabled = true;
        }
    };

    document.getElementById('quiz-reset-btn').onclick = () => {
        quizIndex = 0; quizScore = 0; renderQuiz();
    };

    document.querySelectorAll('.chart-time-btn').forEach((b) => b.onclick = () => {
        document.querySelectorAll('.chart-time-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderChart(b.dataset.timeframe);
    });

    window.onresize = () => { if (activeSection === 'charts') renderChart(activeFrame); };

    const modal = document.getElementById('mr-d-modal');
    document.getElementById('mr-d-fab').onclick = () => { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; };
    document.getElementById('mr-d-close').onclick = () => { modal.style.display = 'none'; document.body.style.overflow = ''; };
    modal.onclick = (e) => { if (e.target === modal) { modal.style.display = 'none'; document.body.style.overflow = ''; } };

    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
}

function boot() {
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    document.getElementById('passcode')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    if (sessionToken()) showDashboard();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
