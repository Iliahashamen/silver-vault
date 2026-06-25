// ═══════════════════════════════════════════════════════════════════
// VAULT // CONTROL — Matrix-themed content admin panel
// Two-step gate (passcode + challenge, both validated server-side).
// Guides are LIVE (CRUD + one-time seed). Other modules are scaffolded.
// ═══════════════════════════════════════════════════════════════════

const API = CONFIG.CHAT_API_URL;
let adminToken = sessionStorage.getItem('vault_admin_token') || null;
let pendingPass = '';                  // held between step 1 and step 2 (never stored)
let items = [];                         // working copy of guide items
const LANGS = ['he', 'en', 'ru'];

// ── Matrix digital rain ────────────────────────────────────────────
(function rain() {
    const canvas = document.getElementById('matrix-rain');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let cols, drops, fontSize = 14;
    const glyphs = 'アイウエオカキクケコサシスセソ0123456789ABCDEFﾊﾋﾌﾍﾎ$£¥₿'.split('');
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        cols = Math.floor(canvas.width / fontSize);
        drops = new Array(cols).fill(1);
    }
    resize();
    window.addEventListener('resize', resize);
    function draw() {
        ctx.fillStyle = 'rgba(0,4,0,0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff41';
        ctx.font = fontSize + 'px monospace';
        for (let i = 0; i < drops.length; i++) {
            const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
            ctx.fillText(ch, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
    }
    setInterval(draw, 55);
})();

// ── Auth (two-step) ────────────────────────────────────────────────
function setMsg(text, cls) {
    const m = document.getElementById('admin-login-msg');
    m.textContent = text || '';
    m.className = 'msg' + (cls ? ' ' + cls : '');
}

function gotoChallenge() {
    pendingPass = document.getElementById('admin-pass').value.trim();
    if (!pendingPass) { setMsg('> nothing entered', 'err'); return; }
    document.getElementById('step-pass').classList.add('hidden');
    document.getElementById('step-challenge').classList.remove('hidden');
    setMsg('');
    setTimeout(() => document.getElementById('admin-challenge').focus(), 50);
}

function backToPass() {
    document.getElementById('step-challenge').classList.add('hidden');
    document.getElementById('step-pass').classList.remove('hidden');
    document.getElementById('admin-challenge').value = '';
    setMsg('');
}

async function adminLogin() {
    const challenge = document.getElementById('admin-challenge').value.trim();
    setMsg('> verifying...', 'ok');
    try {
        const res = await fetch(`${API}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: pendingPass, challenge }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(res.status === 503 ? 'PANEL OFFLINE' : 'ACCESS DENIED');
        adminToken = data.token;
        sessionStorage.setItem('vault_admin_token', adminToken);
        pendingPass = '';
        showEditor();
    } catch (e) {
        setMsg('> ' + (e.message || 'CONNECTION ERROR'), 'err');
        document.getElementById('admin-challenge').value = '';
    }
}

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
}

// ── Section navigation ─────────────────────────────────────────────
function showSection(sec) {
    document.querySelectorAll('#section-nav button').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + sec)?.classList.add('active');
}

const STUBS = {
    mrd:    { icon: '🧠', title: 'מר D — בקרת AI', desc: 'הגדרת אישיות, הוראות מערכת, תקרת הוצאה יומית וניטור שימוש. הליבה כבר קיימת בצד השרת — המסך כאן יחבר אליה.' },
    users:  { icon: '👤', title: 'משתמשים', desc: 'ניהול גישה, קודי קנייה ("buy access"), קרדיטים והרשאות. תלוי בהפעלת מערכת ההרשמה (Auth) שכבר מוכנה כשלד.' },
    photos: { icon: '🖼️', title: 'תמונות', desc: 'העלאה וניהול של תמונות (מטבעות, מדריכים) ב-Supabase Storage, לשימוש חוזר בכל מקום במערכת.' },
    links:  { icon: '🔗', title: 'קישורים', desc: 'ניהול קישורי YouTube ומשאבים חיצוניים — להוספה/הסרה ללא קוד.' },
    prices: { icon: '📈', title: 'מחירים', desc: 'מצב מחיר אוטומטי (Yahoo) עם אפשרות לדריסה ידנית ("fixing prices") במצב חירום.' },
};

function renderStubs() {
    Object.entries(STUBS).forEach(([sec, s]) => {
        const el = document.getElementById('sec-' + sec);
        if (!el) return;
        el.innerHTML = `<div class="panel"><div class="stub">
            <div class="big">${s.icon}</div>
            <h3>${s.title}</h3>
            <p>${s.desc}</p>
            <span class="tag">// MODULE INITIALIZING</span>
        </div></div>`;
    });
}

// ── Guides: load / render ──────────────────────────────────────────
async function loadContent() {
    const res = await fetch(`${API}/api/admin/content`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 503) { logout(); return; }
    const data = await res.json();
    items = (data.guides || []).sort((a, b) => (a.order || 100) - (b.order || 100));
    renderItems();
}

function blankItem() {
    const it = { id: 'g_' + Date.now().toString(36), icon: '📘', order: (items.length + 1) * 10, published: true };
    LANGS.forEach(l => it[l] = { title: '', content: '' });
    return it;
}

function renderItems() {
    const c = document.getElementById('items-container');
    c.innerHTML = '';
    items.forEach((it, idx) => c.appendChild(renderItem(it, idx)));
}

function renderItem(it, idx) {
    const el = document.createElement('div');
    el.className = 'item';
    const langTabs = LANGS.map((l, i) =>
        `<button type="button" class="${i === 0 ? 'active' : ''}" data-tab="${idx}-${l}">${l.toUpperCase()}</button>`
    ).join('');
    const langPanes = LANGS.map((l, i) => `
        <div class="lang-pane ${i === 0 ? 'active' : ''}" id="pane-${idx}-${l}">
            <input type="text" class="mx-input" placeholder="כותרת (${l})" value="${escapeAttr(it[l]?.title || '')}" data-f="title" data-i="${idx}" data-l="${l}">
            <textarea class="mx-input" placeholder="תוכן HTML (${l})" data-f="content" data-i="${idx}" data-l="${l}">${escapeHtml(it[l]?.content || '')}</textarea>
        </div>
    `).join('');

    el.innerHTML = `
        <div class="item-head">
            <input type="text" class="mx-input" style="width:60px" value="${escapeAttr(it.icon)}" data-f="icon" data-i="${idx}" title="אייקון">
            <label>סדר <input type="number" class="mx-input" style="width:80px" value="${it.order}" data-f="order" data-i="${idx}"></label>
            <label><input type="checkbox" data-f="published" data-i="${idx}" ${it.published ? 'checked' : ''}> מפורסם</label>
            <button type="button" class="btn danger" data-del="${idx}" style="margin-inline-start:auto;">מחק</button>
        </div>
        <div class="lang-tabs">${langTabs}</div>
        ${langPanes}
    `;

    el.querySelectorAll('.lang-tabs button').forEach(btn => {
        btn.onclick = () => {
            const [i, l] = btn.dataset.tab.split('-');
            el.querySelectorAll('.lang-tabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            el.querySelectorAll('.lang-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(`pane-${i}-${l}`).classList.add('active');
        };
    });
    el.querySelector(`[data-del="${idx}"]`).onclick = () => {
        if (confirm('למחוק את הפריט?')) { syncFromDom(); items.splice(idx, 1); renderItems(); }
    };
    return el;
}

function syncFromDom() {
    document.querySelectorAll('[data-f]').forEach(node => {
        const i = Number(node.dataset.i);
        const f = node.dataset.f;
        if (!items[i]) return;
        if (f === 'published') { items[i].published = node.checked; }
        else if (f === 'order') { items[i].order = Number(node.value) || 100; }
        else if (f === 'icon') { items[i].icon = node.value; }
        else if (f === 'title' || f === 'content') {
            const l = node.dataset.l;
            items[i][l] = items[i][l] || {};
            items[i][l][f] = node.value;
        }
    });
}

// ── One-time seed: load the built-in guide chapters for editing ────
async function seedBuiltin() {
    const msg = document.getElementById('admin-save-msg');
    if (items.length > 0 && !confirm('פעולה זו תוסיף את פרקי המדריך המובנים לרשימה הנוכחית. להמשיך?')) return;
    msg.textContent = '> loading built-in...'; msg.className = 'msg ok';
    try {
        const res = await fetch(`seed_guides.json?ts=${Date.now()}`);
        const data = await res.json();
        const seed = Array.isArray(data.guides) ? data.guides : [];
        if (!seed.length) throw new Error('no built-in content');
        const existing = new Set(items.map(it => it.id));
        let added = 0;
        seed.forEach(it => { if (!existing.has(it.id)) { items.push(it); added++; } });
        items.sort((a, b) => (a.order || 100) - (b.order || 100));
        renderItems();
        msg.textContent = `✓ נטענו ${added} פרקים — בדוק ולחץ "שמור הכל"`; msg.className = 'msg ok';
    } catch (e) {
        msg.textContent = '✗ ' + (e.message || 'load failed'); msg.className = 'msg err';
    }
}

async function save() {
    syncFromDom();
    const msg = document.getElementById('admin-save-msg');
    msg.textContent = '> saving...'; msg.className = 'msg ok';
    try {
        const res = await fetch(`${API}/api/admin/content`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ guides: items }),
        });
        if (res.status === 401 || res.status === 503) { logout(); return; }
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'save failed');
        msg.textContent = `✓ נשמר (${data.count} פריטים)`; msg.className = 'msg ok';
    } catch (e) {
        msg.textContent = '✗ ' + (e.message || 'error'); msg.className = 'msg err';
    }
}

// ── Helpers ────────────────────────────────────────────────────────
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

function showEditor() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-editor').classList.remove('hidden');
    renderStubs();
    loadContent();
}
function logout() {
    adminToken = null; sessionStorage.removeItem('vault_admin_token');
    document.getElementById('admin-editor').classList.add('hidden');
    document.getElementById('admin-login').classList.remove('hidden');
    backToPass();
    document.getElementById('admin-pass').value = '';
    setMsg('> session ended', 'warn');
}

// ── Wire up ────────────────────────────────────────────────────────
document.getElementById('step-pass-btn').onclick = gotoChallenge;
document.getElementById('admin-pass').addEventListener('keypress', e => { if (e.key === 'Enter') gotoChallenge(); });
document.getElementById('admin-login-btn').onclick = adminLogin;
document.getElementById('admin-challenge').addEventListener('keypress', e => { if (e.key === 'Enter') adminLogin(); });
document.getElementById('step-back-btn').onclick = backToPass;
document.getElementById('logout-btn').onclick = logout;

document.getElementById('add-item-btn').onclick = () => { syncFromDom(); items.push(blankItem()); renderItems(); };
document.getElementById('save-btn').onclick = save;
document.getElementById('reload-btn').onclick = loadContent;
document.getElementById('seed-btn').onclick = seedBuiltin;

document.querySelectorAll('#section-nav button').forEach(b => { b.onclick = () => showSection(b.dataset.sec); });

if (adminToken) showEditor();
