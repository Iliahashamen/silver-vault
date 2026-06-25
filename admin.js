// ═══════════════════════════════════════════════════════════════════
// The Vault — Content Admin Panel
// Manages guide chapters stored server-side (Supabase Storage). No code,
// no hardcoding: add / edit / remove guide items here and Save.
// ═══════════════════════════════════════════════════════════════════

const API = CONFIG.CHAT_API_URL;
let adminToken = sessionStorage.getItem('vault_admin_token') || null;
let items = [];            // working copy of guide items
const LANGS = ['he', 'en', 'ru'];

// ── Auth ───────────────────────────────────────────────────────────
async function adminLogin() {
    const pass = document.getElementById('admin-pass').value.trim();
    const msg = document.getElementById('admin-login-msg');
    if (!pass) return;
    msg.textContent = 'מתחבר...';
    try {
        const res = await fetch(`${API}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: pass }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'קוד שגוי');
        adminToken = data.token;
        sessionStorage.setItem('vault_admin_token', adminToken);
        showEditor();
    } catch (e) {
        msg.textContent = '✗ ' + (e.message || 'שגיאת חיבור');
        msg.style.color = '#C04040';
    }
}

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
}

// ── Load / render ──────────────────────────────────────────────────
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
    el.className = 'admin-item';
    const langTabs = LANGS.map((l, i) =>
        `<button type="button" class="${i === 0 ? 'active' : ''}" data-tab="${idx}-${l}">${l.toUpperCase()}</button>`
    ).join('');
    const langPanes = LANGS.map((l, i) => `
        <div class="admin-lang-pane ${i === 0 ? 'active' : ''}" id="pane-${idx}-${l}">
            <input type="text" placeholder="כותרת (${l})" value="${escapeAttr(it[l]?.title || '')}" data-f="title" data-i="${idx}" data-l="${l}">
            <textarea placeholder="תוכן HTML (${l})" data-f="content" data-i="${idx}" data-l="${l}">${escapeHtml(it[l]?.content || '')}</textarea>
        </div>
    `).join('');

    el.innerHTML = `
        <div class="admin-item-head">
            <input type="text" style="width:60px" value="${escapeAttr(it.icon)}" data-f="icon" data-i="${idx}" title="אייקון">
            <label>סדר <input type="number" style="width:80px" value="${it.order}" data-f="order" data-i="${idx}"></label>
            <label><input type="checkbox" data-f="published" data-i="${idx}" ${it.published ? 'checked' : ''}> מפורסם</label>
            <button type="button" class="btn-sm btn-danger" data-del="${idx}" style="margin-inline-start:auto;">מחק</button>
        </div>
        <div class="admin-lang-tabs">${langTabs}</div>
        ${langPanes}
    `;

    el.querySelectorAll('.admin-lang-tabs button').forEach(btn => {
        btn.onclick = () => {
            const [i, l] = btn.dataset.tab.split('-');
            el.querySelectorAll('.admin-lang-tabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            el.querySelectorAll('.admin-lang-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(`pane-${i}-${l}`).classList.add('active');
        };
    });
    el.querySelector(`[data-del="${idx}"]`).onclick = () => {
        if (confirm('למחוק את הפריט?')) { items.splice(idx, 1); renderItems(); }
    };
    return el;
}

// ── Collect edits from DOM back into `items` ───────────────────────
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
// Pulls seed_guides.json (the built-in content, exported from the app) into the
// editor so the admin can review and Save it into the store. After this, guides
// live entirely in the store and the built-in copy is just an offline fallback.
async function seedBuiltin() {
    const msg = document.getElementById('admin-save-msg');
    if (items.length > 0 && !confirm('פעולה זו תוסיף את פרקי המדריך המובנים לרשימה הנוכחית. להמשיך?')) return;
    msg.textContent = 'טוען מדריך מובנה...'; msg.style.color = '';
    try {
        const res = await fetch(`seed_guides.json?ts=${Date.now()}`);
        const data = await res.json();
        const seed = Array.isArray(data.guides) ? data.guides : [];
        if (!seed.length) throw new Error('לא נמצא תוכן מובנה');
        const existing = new Set(items.map(it => it.id));
        let added = 0;
        seed.forEach(it => { if (!existing.has(it.id)) { items.push(it); added++; } });
        items.sort((a, b) => (a.order || 100) - (b.order || 100));
        renderItems();
        msg.textContent = `✓ נטענו ${added} פרקים — בדוק ולחץ "שמור הכל"`; msg.style.color = '#2e8b57';
    } catch (e) {
        msg.textContent = '✗ ' + (e.message || 'טעינה נכשלה'); msg.style.color = '#C04040';
    }
}

async function save() {
    syncFromDom();
    const msg = document.getElementById('admin-save-msg');
    msg.textContent = 'שומר...'; msg.style.color = '';
    try {
        const res = await fetch(`${API}/api/admin/content`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ guides: items }),
        });
        if (res.status === 401 || res.status === 503) { logout(); return; }
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'שמירה נכשלה');
        msg.textContent = `✓ נשמר (${data.count} פריטים)`; msg.style.color = '#2e8b57';
    } catch (e) {
        msg.textContent = '✗ ' + (e.message || 'שגיאה'); msg.style.color = '#C04040';
    }
}

// ── Helpers ────────────────────────────────────────────────────────
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

function showEditor() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-editor').classList.remove('hidden');
    loadContent();
}
function logout() {
    adminToken = null; sessionStorage.removeItem('vault_admin_token');
    document.getElementById('admin-editor').classList.add('hidden');
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-login-msg').textContent = 'החיבור פג — התחבר שוב.';
}

// ── Wire up ────────────────────────────────────────────────────────
document.getElementById('admin-login-btn').onclick = adminLogin;
document.getElementById('admin-pass').addEventListener('keypress', e => { if (e.key === 'Enter') adminLogin(); });
document.getElementById('add-item-btn').onclick = () => { syncFromDom(); items.push(blankItem()); renderItems(); };
document.getElementById('save-btn').onclick = save;
document.getElementById('reload-btn').onclick = loadContent;
document.getElementById('seed-btn').onclick = seedBuiltin;

if (adminToken) showEditor();
