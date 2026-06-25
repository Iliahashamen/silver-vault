// ═══════════════════════════════════════════════════════════════════
// מסוף ניהול // הכספת — synthwave content panel (Hebrew only)
// Collections: guides (structured) · quiz (structured) · mints (JSON).
// Two-step gate (code + challenge), both validated server-side.
// ═══════════════════════════════════════════════════════════════════

const API = CONFIG.CHAT_API_URL;
let adminToken = sessionStorage.getItem('vault_admin_token') || null;
let pendingPass = '';
let current = 'guides';
const data = { guides: [], quiz: [], mints: [] };
const LANGS = ['he', 'en', 'ru'];

// ── synthwave rain (green + purple) ────────────────────────────────
(function rain() {
    const c = document.getElementById('rain'); if (!c) return;
    const x = c.getContext('2d'); let cols, drops, fs = 14;
    const g = 'アイウエオ01﻿$£¥₿▲▼◆<>/\\'.split('');
    function rs() { c.width = innerWidth; c.height = innerHeight; cols = Math.floor(c.width / fs); drops = Array(cols).fill(1); }
    rs(); addEventListener('resize', rs);
    setInterval(() => {
        x.fillStyle = 'rgba(13,2,33,0.10)'; x.fillRect(0, 0, c.width, c.height);
        x.font = fs + 'px monospace';
        for (let i = 0; i < drops.length; i++) {
            x.fillStyle = i % 5 === 0 ? '#c061ff' : '#00ff9c';
            x.fillText(g[Math.floor(Math.random() * g.length)], i * fs, drops[i] * fs);
            if (drops[i] * fs > c.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
    }, 60);
})();

// ── auth ───────────────────────────────────────────────────────────
function setMsg(t, cls) { const m = document.getElementById('admin-login-msg'); m.textContent = t || ''; m.className = 'msg' + (cls ? ' ' + cls : ''); }
function saveMsg(t, cls) { const m = document.getElementById('save-msg'); m.textContent = t || ''; m.className = 'msg' + (cls ? ' ' + cls : ''); }

function gotoChallenge() {
    pendingPass = document.getElementById('admin-pass').value.trim();
    if (!pendingPass) { setMsg('לא הוזן קוד', 'err'); return; }
    document.getElementById('step-pass').classList.add('hidden');
    document.getElementById('step-challenge').classList.remove('hidden');
    setMsg(''); setTimeout(() => document.getElementById('admin-challenge').focus(), 50);
}
function backToPass() {
    document.getElementById('step-challenge').classList.add('hidden');
    document.getElementById('step-pass').classList.remove('hidden');
    document.getElementById('admin-challenge').value = ''; setMsg('');
}
async function adminLogin() {
    const challenge = document.getElementById('admin-challenge').value.trim();
    setMsg('מאמת...', 'ok');
    try {
        const res = await fetch(`${API}/api/admin/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: pendingPass, challenge }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(res.status === 503 ? 'הפאנל אינו מוגדר' : 'הגישה נדחתה');
        adminToken = d.token; sessionStorage.setItem('vault_admin_token', adminToken); pendingPass = '';
        showEditor();
    } catch (e) { setMsg('✗ ' + (e.message || 'שגיאת חיבור'), 'err'); document.getElementById('admin-challenge').value = ''; }
}
function authHeaders() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }; }

// ── sections ───────────────────────────────────────────────────────
function showSection(sec) {
    syncSection(current);
    current = sec;
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + sec).classList.add('active');
    document.getElementById('add-btn').style.display = (sec === 'mints') ? 'none' : '';
    renderSection(sec);
    saveMsg('');
}

async function loadSection(sec) {
    saveMsg('טוען...', 'ok');
    try {
        const res = await fetch(`${API}/api/admin/content?type=${sec}`, { headers: authHeaders() });
        if (res.status === 401 || res.status === 503) { logout(); return; }
        const d = await res.json();
        data[sec] = Array.isArray(d.items) ? d.items : [];
        if (sec === 'guides' || sec === 'quiz') data[sec].sort((a, b) => (a.order || 100) - (b.order || 100));
        renderSection(sec); saveMsg('');
    } catch (e) { saveMsg('✗ ' + (e.message || 'טעינה נכשלה'), 'err'); }
}

function renderSection(sec) {
    if (sec === 'guides') renderGuides();
    else if (sec === 'quiz') renderQuiz();
    else if (sec === 'mints') document.getElementById('mints-json').value = JSON.stringify(data.mints || [], null, 2);
}

function syncSection(sec) {
    if (sec === 'guides') syncGuides();
    else if (sec === 'quiz') syncQuiz();
    else if (sec === 'mints') { /* parsed on save */ }
}

// ── GUIDES (structured) ────────────────────────────────────────────
function blankGuide() { const it = { id: 'g_' + Date.now().toString(36), icon: '📘', order: (data.guides.length + 1) * 10, published: true }; LANGS.forEach(l => it[l] = { title: '', content: '' }); return it; }
function renderGuides() {
    const box = document.getElementById('box-guides'); box.innerHTML = '';
    data.guides.forEach((it, idx) => {
        const el = document.createElement('div'); el.className = 'item';
        const tabs = LANGS.map((l, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-tab="${idx}-${l}">${l.toUpperCase()}</button>`).join('');
        const panes = LANGS.map((l, i) => `
            <div class="lang-pane ${i === 0 ? 'active' : ''}" id="gp-${idx}-${l}">
                <input type="text" class="inp" placeholder="כותרת (${l})" value="${escAttr(it[l]?.title)}" data-g="title" data-i="${idx}" data-l="${l}">
                <textarea class="inp" placeholder="תוכן HTML (${l})" data-g="content" data-i="${idx}" data-l="${l}">${escHtml(it[l]?.content)}</textarea>
            </div>`).join('');
        el.innerHTML = `
            <div class="item-head">
                <input type="text" class="inp" style="width:60px" value="${escAttr(it.icon)}" data-g="icon" data-i="${idx}" title="אייקון">
                <label>סדר <input type="number" class="inp" style="width:78px" value="${it.order}" data-g="order" data-i="${idx}"></label>
                <label><input type="checkbox" data-g="published" data-i="${idx}" ${it.published ? 'checked' : ''}> מפורסם</label>
                <button type="button" class="btn danger" data-delg="${idx}" style="margin-inline-start:auto;">מחק</button>
            </div>
            <div class="lang-tabs">${tabs}</div>${panes}`;
        el.querySelectorAll('.lang-tabs button').forEach(b => b.onclick = () => {
            const [i, l] = b.dataset.tab.split('-');
            el.querySelectorAll('.lang-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active');
            el.querySelectorAll('.lang-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(`gp-${i}-${l}`).classList.add('active');
        });
        el.querySelector(`[data-delg="${idx}"]`).onclick = () => { if (confirm('למחוק את הפריט?')) { syncGuides(); data.guides.splice(idx, 1); renderGuides(); } };
        box.appendChild(el);
    });
}
function syncGuides() {
    document.querySelectorAll('[data-g]').forEach(n => {
        const i = +n.dataset.i, f = n.dataset.g, it = data.guides[i]; if (!it) return;
        if (f === 'published') it.published = n.checked;
        else if (f === 'order') it.order = +n.value || 100;
        else if (f === 'icon') it.icon = n.value;
        else { const l = n.dataset.l; it[l] = it[l] || {}; it[l][f] = n.value; }
    });
}

// ── QUIZ (structured) ──────────────────────────────────────────────
function blankQuiz() { return { id: 'q_' + Date.now().toString(36), q: '', a: ['', '', '', ''], correct: 0, published: true, order: data.quiz.length + 1 }; }
function renderQuiz() {
    const box = document.getElementById('box-quiz'); box.innerHTML = '';
    data.quiz.forEach((it, idx) => {
        const el = document.createElement('div'); el.className = 'item';
        const ans = [0, 1, 2, 3].map(j => `
            <div class="ans-row">
                <input type="radio" name="correct-${idx}" value="${j}" ${(+it.correct === j) ? 'checked' : ''} data-q="correct" data-i="${idx}" title="התשובה הנכונה">
                <input type="text" class="inp" placeholder="תשובה ${j + 1}" value="${escAttr((it.a || [])[j])}" data-q="a" data-i="${idx}" data-j="${j}">
            </div>`).join('');
        el.innerHTML = `
            <div class="item-head">
                <span style="color:var(--green-dim);font-size:12px;">שאלה ${idx + 1}</span>
                <label style="margin-inline-start:auto;"><input type="checkbox" data-q="published" data-i="${idx}" ${it.published !== false ? 'checked' : ''}> מפורסם</label>
                <button type="button" class="btn danger" data-delq="${idx}">מחק</button>
            </div>
            <input type="text" class="inp" placeholder="נוסח השאלה" value="${escAttr(it.q)}" data-q="q" data-i="${idx}">
            ${ans}`;
        el.querySelector(`[data-delq="${idx}"]`).onclick = () => { if (confirm('למחוק את השאלה?')) { syncQuiz(); data.quiz.splice(idx, 1); renderQuiz(); } };
        box.appendChild(el);
    });
}
function syncQuiz() {
    document.querySelectorAll('[data-q]').forEach(n => {
        const i = +n.dataset.i, f = n.dataset.q, it = data.quiz[i]; if (!it) return;
        if (f === 'q') it.q = n.value;
        else if (f === 'published') it.published = n.checked;
        else if (f === 'correct') { if (n.checked) it.correct = +n.value; }
        else if (f === 'a') { it.a = it.a || ['', '', '', '']; it.a[+n.dataset.j] = n.value; }
    });
}

// ── save / reload / seed ───────────────────────────────────────────
async function save() {
    syncSection(current);
    let items;
    if (current === 'mints') {
        try { const parsed = JSON.parse(document.getElementById('mints-json').value); items = Array.isArray(parsed) ? parsed : parsed.items; }
        catch (e) { saveMsg('✗ JSON לא תקין: ' + e.message, 'err'); return; }
        if (!Array.isArray(items)) { saveMsg('✗ נדרש מערך items', 'err'); return; }
        data.mints = items;
    } else { items = data[current]; }
    saveMsg('שומר...', 'ok');
    try {
        const res = await fetch(`${API}/api/admin/content?type=${current}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ items }) });
        if (res.status === 401 || res.status === 503) { logout(); return; }
        const d = await res.json();
        if (!d.success) throw new Error(d.error || 'שמירה נכשלה');
        saveMsg(`✓ נשמר (${d.count} פריטים)`, 'ok');
    } catch (e) { saveMsg('✗ ' + (e.message || 'שגיאה'), 'err'); }
}

async function seed() {
    const file = `seed_${current}.json?ts=${Date.now()}`;
    saveMsg('טוען מובנה...', 'ok');
    try {
        const res = await fetch(file); const d = await res.json();
        const items = Array.isArray(d.items) ? d.items : (Array.isArray(d.guides) ? d.guides : []);
        if (!items.length) throw new Error('אין תוכן מובנה');
        if (current === 'mints') { data.mints = items; renderSection('mints'); saveMsg(`✓ נטענו ${items.length} — בדוק ולחץ שמור`, 'ok'); return; }
        syncSection(current);
        const existing = new Set(data[current].map(it => it.id)); let added = 0;
        items.forEach(it => { if (!existing.has(it.id)) { data[current].push(it); added++; } });
        data[current].sort((a, b) => (a.order || 100) - (b.order || 100));
        renderSection(current);
        saveMsg(`✓ נטענו ${added} — בדוק ולחץ שמור`, 'ok');
    } catch (e) { saveMsg('✗ ' + (e.message || 'טעינה נכשלה'), 'err'); }
}

function addItem() {
    syncSection(current);
    if (current === 'guides') { data.guides.push(blankGuide()); renderGuides(); }
    else if (current === 'quiz') { data.quiz.push(blankQuiz()); renderQuiz(); }
}

// ── helpers / lifecycle ────────────────────────────────────────────
function escHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

function showEditor() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-editor').classList.remove('hidden');
    showSection('guides'); loadSection('guides');
}
function logout() {
    adminToken = null; sessionStorage.removeItem('vault_admin_token');
    document.getElementById('admin-editor').classList.add('hidden');
    document.getElementById('admin-login').classList.remove('hidden');
    backToPass(); document.getElementById('admin-pass').value = ''; setMsg('ההתחברות הסתיימה', 'warn');
}

document.getElementById('step-pass-btn').onclick = gotoChallenge;
document.getElementById('admin-pass').addEventListener('keypress', e => { if (e.key === 'Enter') gotoChallenge(); });
document.getElementById('admin-login-btn').onclick = adminLogin;
document.getElementById('admin-challenge').addEventListener('keypress', e => { if (e.key === 'Enter') adminLogin(); });
document.getElementById('step-back-btn').onclick = backToPass;
document.getElementById('logout-btn').onclick = logout;
document.getElementById('add-btn').onclick = addItem;
document.getElementById('save-btn').onclick = save;
document.getElementById('reload-btn').onclick = () => loadSection(current);
document.getElementById('seed-btn').onclick = seed;
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { showSection(b.dataset.sec); loadSection(b.dataset.sec); });

if (adminToken) showEditor();
