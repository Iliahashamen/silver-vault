/**
 * GROUPTECH Hub — Entry Point
 * Single passcode gate → 3 system selector.
 * Token shared via localStorage so vault/mine skip their own login.
 */

const HUB_API_URL = (() => {
    if (typeof location !== 'undefined' &&
        (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        return 'http://localhost:8082';
    }
    return 'https://web-production-f049.up.railway.app';
})();

const SESSION_KEY  = 'grouptech_session';
const SESSION_TTL  = 3 * 60 * 60 * 1000; // 3 hours

function initGridCanvas() {
    const canvas = document.getElementById('hub-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const CELL = 52;
    const GOLD_MAIN = 'rgba(201, 162, 39, 0.14)';
    const GOLD_BRIGHT = 'rgba(226, 191, 80, 0.22)';
    const GOLD_DIAG = 'rgba(201, 162, 39, 0.08)';
    let offset = 0;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cols = Math.ceil(canvas.width  / CELL) + 2;
        const rows = Math.ceil(canvas.height / CELL) + 2;
        const ox   = (offset % CELL);

        ctx.lineWidth = 0.65;
        ctx.strokeStyle = GOLD_MAIN;
        for (let c = -1; c < cols; c++) {
            ctx.beginPath();
            ctx.moveTo(c * CELL - ox, 0);
            ctx.lineTo(c * CELL - ox, canvas.height);
            ctx.stroke();
        }
        ctx.strokeStyle = GOLD_BRIGHT;
        for (let r = -1; r < rows; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * CELL - ox);
            ctx.lineTo(canvas.width, r * CELL - ox);
            ctx.stroke();
        }
        ctx.strokeStyle = GOLD_DIAG;
        ctx.lineWidth = 0.45;
        for (let c = -1; c < cols + rows; c++) {
            ctx.beginPath();
            ctx.moveTo(c * CELL - ox, 0);
            ctx.lineTo(c * CELL - ox - canvas.height * 0.5, canvas.height);
            ctx.stroke();
        }
        offset += 0.18;
        requestAnimationFrame(draw);
    }
    draw();
}

function formatUsd(value) {
    if (value == null || Number.isNaN(value)) return '$—';
    return '$' + Number(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function buildTickerHtml(gold, silver) {
    const goldStr = formatUsd(gold);
    const silverStr = formatUsd(silver);
    return (
        '<span class="tick-gold">GOLD XAU/USD ' + goldStr + '</span>' +
        '<span class="tick-sep">◆</span>' +
        '<span class="tick-silver">SILVER XAG/USD ' + silverStr + '</span>' +
        '<span class="tick-sep">◆</span>' +
        '<span class="tick-live">LIVE</span>' +
        '<span class="tick-sep">◆</span>' +
        '<span class="tick-gold">GROUPTECH MARKETS</span>' +
        '<span class="tick-sep">◆</span>'
    );
}

function renderHubTicker(gold, silver) {
    const html = buildTickerHtml(gold, silver);
    const a = document.getElementById('hub-ticker-a');
    const b = document.getElementById('hub-ticker-b');
    const wrap = document.querySelector('.hub-ticker');
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
    if (wrap) wrap.classList.remove('is-loading');
}

async function refreshHubTickerPrices() {
    let gold = null;
    let silver = null;

    try {
        const [goldRes, silverRes] = await Promise.all([
            fetch(`${HUB_API_URL}/api/gold-price`, { cache: 'no-store' }),
            fetch(`${HUB_API_URL}/api/silver-price`, { cache: 'no-store' }),
        ]);
        const goldData = await goldRes.json();
        const silverData = await silverRes.json();
        if (goldData.success && goldData.xau_usd != null) {
            gold = Number(goldData.xau_usd);
        }
        if (silverData.success && silverData.xag_usd != null) {
            silver = Number(silverData.xag_usd);
        }
    } catch (_) { /* keep placeholders */ }

    renderHubTicker(gold, silver);
    return { gold, silver };
}

function initHubTicker() {
    const wrap = document.querySelector('.hub-ticker');
    if (wrap) wrap.classList.add('is-loading');
    renderHubTicker(null, null);
    refreshHubTickerPrices();
    setInterval(refreshHubTickerPrices, 2 * 60 * 1000);
}

function saveSession(token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        token,
        expires: Date.now() + SESSION_TTL,
    }));
    // Also seed vault + mine session keys so they skip their old login screens
    const payload = JSON.stringify({
        loggedIn: true,
        timestamp: Date.now(),
        token,
    });
    localStorage.setItem('vault_session', payload);
    localStorage.setItem('mine_session', payload);
}

function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (Date.now() > obj.expires) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return obj.token;
    } catch { return null; }
}

async function verifyToken(token) {
    try {
        const res = await fetch(`${HUB_API_URL}/api/auth-check`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        return res.ok;
    } catch { return false; }
}

async function doLogin(passcode) {
    const res = await fetch(`${HUB_API_URL}/api/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ passcode }),
    });
    if (res.status === 503) throw new Error('unavailable');
    if (!res.ok) throw new Error('bad_status');
    const data = await res.json();
    if (!data.success || !data.token) throw new Error('denied');
    return data.token;
}

function showSystems() {
    const loginEl   = document.getElementById('hub-login');
    const systemsEl = document.getElementById('hub-systems');

    if (loginEl && loginEl.style.display !== 'none') {
        loginEl.classList.add('is-leaving');
        setTimeout(() => {
            loginEl.style.display = 'none';
            revealSystems(systemsEl);
        }, 500);
    } else {
        revealSystems(systemsEl);
    }
}

function revealSystems(systemsEl) {
    if (!systemsEl) return;
    systemsEl.hidden = false;
    systemsEl.classList.add('is-entering');
    // Force reflow then fade in
    void systemsEl.offsetWidth;
    requestAnimationFrame(() => {
        systemsEl.classList.add('visible');
        systemsEl.classList.remove('is-entering');
    });
}

function showError(msg) {
    const el = document.getElementById('hub-error');
    const inp = document.getElementById('hub-passcode');
    if (el) { el.textContent = msg; el.classList.add('visible'); }
    if (inp) {
        inp.classList.add('error');
        setTimeout(() => inp.classList.remove('error'), 600);
    }
    setTimeout(() => { if (el) el.classList.remove('visible'); }, 3000);
}

async function boot() {
    initGridCanvas();
    initHubTicker();
    // Drop stale PWA caches that still hold the old vault login HTML
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
        }
    } catch (_) {}


    const existing = getSession();
    if (existing) {
        const valid = await verifyToken(existing);
        if (valid) {
            const payload = JSON.stringify({ loggedIn: true, timestamp: Date.now(), token: existing });
            localStorage.setItem('vault_session', payload);
            localStorage.setItem('mine_session', payload);
            const loginEl = document.getElementById('hub-login');
            if (loginEl) loginEl.style.display = 'none';
            showSystems();
            return;
        }
        localStorage.removeItem(SESSION_KEY);
    }

    const btn = document.getElementById('hub-enter-btn');
    const inp = document.getElementById('hub-passcode');
    let busy = false;

    async function attempt() {
        if (busy) return;
        const passcode = (inp ? inp.value.trim() : '');
        if (!passcode) { inp && inp.focus(); return; }

        busy = true;
        if (btn) { btn.classList.add('loading'); btn.textContent = '...'; btn.disabled = true; }

        try {
            const token = await doLogin(passcode);
            saveSession(token);
            showSystems();
        } catch (err) {
            showError(err && err.message === 'unavailable'
                ? 'השרת לא מוגדר — נסה שוב בעוד דקה'
                : 'קוד שגוי — נסה שוב');
            if (btn) { btn.classList.remove('loading'); btn.textContent = 'כניסה'; btn.disabled = false; }
            busy = false;
            inp && inp.focus();
        }
    }

    btn && btn.addEventListener('click', attempt);
    // Desktop Enter + mobile "Go" / newline
    inp && inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attempt();
        }
    });
    inp && inp.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            attempt();
        }
    });
    // Mobile soft-keyboard "Go" sometimes fires as form submit / change
    inp && inp.addEventListener('change', () => {
        // no-op; keep focus behavior natural
    });
    inp && setTimeout(() => inp.focus(), 300);

    const cloudCard = document.querySelector('.system-card.locked');
    cloudCard && cloudCard.addEventListener('click', () => {
        showError('הענן — בקרוב');
    });
    cloudCard && cloudCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showError('הענן — בקרוב');
        }
    });

    // Before entering vault/mine: refresh child sessions so old login never appears
    document.querySelectorAll('.system-card[data-system]').forEach((card) => {
        card.addEventListener('click', async (e) => {
            e.preventDefault();
            const token = getSession();
            if (!token) {
                showError('יש להתחבר קודם');
                return;
            }
            const payload = JSON.stringify({
                loggedIn: true,
                timestamp: Date.now(),
                token,
            });
            localStorage.setItem('vault_session', payload);
            localStorage.setItem('mine_session', payload);
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                token,
                expires: Date.now() + SESSION_TTL,
            }));

            // Clear any stale PWA caches that still hold the old login HTML
            try {
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map((r) => r.unregister()));
                }
                if (window.caches) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((k) => caches.delete(k)));
                }
            } catch (_) { /* ignore */ }

            const href = card.dataset.system === 'mine'
                ? 'mine/home.html'
                : 'silver-app.html';
            location.assign(href + '?from=hub&t=' + Date.now());
        });
    });
}

document.addEventListener('DOMContentLoaded', boot);
