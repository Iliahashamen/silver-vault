// ===========================
// THE SILVER VAULT - MAIN APP
// Config is loaded from config.js
// ===========================

// Initialize Telegram Web App
let tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

// State
let filesData = [];

// ===== LOGIN FUNCTIONALITY =====
document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('passcode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
    const passcode = document.getElementById('passcode').value;
    const errorMsg = document.getElementById('error-msg');
    
    // Demo passcode validation (In production: validate server-side)
    const validPasscode = 'DemoD69';
    
    if (passcode === validPasscode) {
        // Success
        errorMsg.textContent = '✓ גישה אושרה';
        errorMsg.style.color = '#00ff00';
        
        setTimeout(() => {
            document.getElementById('login-screen').classList.remove('active');
            document.getElementById('dashboard-screen').classList.add('active');
            // Hide footer after login
            const footer = document.querySelector('.footer');
            if (footer) footer.style.display = 'none';
            loadFiles();
        }, 1000);
    } else {
        // Failure
        errorMsg.textContent = '✗ גישה נדחתה - קוד שגוי';
        errorMsg.style.color = '#ff0000';
        document.getElementById('passcode').value = '';
        
        // Shake effect
        const terminal = document.querySelector('.terminal-container');
        terminal.style.animation = 'shake 0.5s';
        setTimeout(() => {
            terminal.style.animation = '';
        }, 500);
    }
}

// Shake animation
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
`;
document.head.appendChild(style);

// ===== NAVIGATION =====
const navButtons = document.querySelectorAll('.nav-btn');
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const sectionName = btn.dataset.section;
        switchSection(sectionName);
    });
});

function switchSection(sectionName) {
    // Update buttons
    navButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');
}

// ===== LOAD FILES FROM SUPABASE =====
async function loadFiles() {
    const container = document.getElementById('files-container');
    container.innerHTML = '<div class="loading">טוען ארכיון...</div>';
    
    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/files?select=*&order=created_at.desc`, {
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch files');
        
        filesData = await response.json();
        displayFiles(filesData);
    } catch (error) {
        console.error('Error loading files:', error);
        container.innerHTML = '<div class="loading">⚠ שגיאה בטעינת הארכיון</div>';
    }
}

function displayFiles(files) {
    const container = document.getElementById('files-container');
    
    if (files.length === 0) {
        container.innerHTML = '<div class="loading">אין קבצים בכספת</div>';
        return;
    }
    
    // Organize files by category/folder
    const filesByCategory = {
        'PDFS': files.filter(f => f.category === 'PDFS' || f.file_type === 'pdf'),
        'VIDEOS': files.filter(f => f.category === 'VIDEOS' || f.file_type === 'video'),
        'PHOTOS': files.filter(f => f.category === 'PHOTOS' || f.file_type === 'photo'),
        'DOCUMENTS': files.filter(f => f.category === 'DOCUMENTS' || (f.category !== 'PDFS' && f.category !== 'VIDEOS' && f.category !== 'PHOTOS' && f.file_type === 'document'))
    };
    
    let html = '';
    
    // Display each category if it has files
    Object.keys(filesByCategory).forEach(category => {
        const categoryFiles = filesByCategory[category];
        if (categoryFiles.length > 0) {
            // Get Hebrew category name
            let categoryNameHe = '';
            switch(category) {
                case 'PDFS': categoryNameHe = '📄 מסמכי PDF'; break;
                case 'VIDEOS': categoryNameHe = '🎥 סרטונים'; break;
                case 'PHOTOS': categoryNameHe = '📸 תמונות'; break;
                case 'DOCUMENTS': categoryNameHe = '📁 מסמכים'; break;
            }
            
            html += `<div class="file-category">
                        <div class="category-header">${categoryNameHe}</div>
                        <div class="files-grid">
                            ${categoryFiles.map(file => createFileCard(file)).join('')}
                        </div>
                     </div>`;
        }
    });
    
    container.innerHTML = html || '<div class="loading">אין קבצים בכספת</div>';
}

function createFileCard(file) {
    const icon = getFileIcon(file.file_type);
    const date = new Date(file.created_at).toLocaleDateString('he-IL');
    
    return `
        <div class="file-card" onclick="openFile('${file.file_url}', '${file.file_type}')">
            <div class="file-icon">${icon}</div>
            <div class="file-name">${escapeHtml(file.file_name)}</div>
            <div class="file-meta">
                סוג: ${file.file_type.toUpperCase()}<br>
                תאריך: ${date}
            </div>
        </div>
    `;
}

function getFileIcon(fileType) {
    const icons = {
        'pdf': '📄',
        'video': '🎥',
        'photo': '🖼️',
        'document': '📋'
    };
    return icons[fileType] || '📁';
}

function openFile(url, type) {
    if (tg) {
        tg.openLink(url);
    } else {
        window.open(url, '_blank');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== SEARCH FUNCTIONALITY =====
document.getElementById('search-input').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = filesData.filter(file => 
        file.file_name.toLowerCase().includes(searchTerm) ||
        file.file_type.toLowerCase().includes(searchTerm)
    );
    displayFiles(filtered);
});

// ===== CHAT FUNCTIONALITY (Connected to Mr. D AI) =====
let userId = tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 1000000);
let chatInitialized = false;

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Show intro on first message
    if (!chatInitialized) {
        chatInitialized = true;
        addChatMessage('MR. D', `היי! אני דמיאן בל - המדריך שלך לבניית עושר אמיתי דרך כסף ומתכות יקרות.

💡 הכלל הזהב שלי: קנה לפחות אונקיה אחת של כסף כל חודש.

שאל אותי הכל על כסף, זהב, קריפטו - במיוחד בישראל! 🚀`, 'bot');
    }
    
    // Add user message
    addChatMessage('אתה', message, 'user');
    input.value = '';
    
    // Show typing indicator
    const typingMsg = addChatMessage('MR. D', 'מקליד...', 'bot typing');
    
    try {
        // Call Mr. D API
        const response = await fetch(`${CONFIG.CHAT_API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                message: message
            })
        });
        
        if (!response.ok) {
            throw new Error('API connection failed');
        }
        
        const data = await response.json();
        
        // Remove typing indicator
        typingMsg.remove();
        
        // Add Mr. D's real AI response
        addChatMessage('MR. D', data.response, 'bot');
        
    } catch (error) {
        console.error('Chat error:', error);
        typingMsg.remove();
        
        // Fallback response if API is down
        addChatMessage('MR. D', 'סליחה, יש לי רגע טכני כאן. נסה לשאול אותי שוב בעוד שנייה! 🔧', 'bot error');
    }
}

function addChatMessage(author, text, type) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${type}`;
    
    // Format message for RTL (Hebrew) - better layout
    messageEl.innerHTML = `
        <div style="line-height: 1.8; margin-bottom: 8px; white-space: pre-wrap;">${escapeHtml(text)}</div>
        <div style="font-size: 10px; opacity: 0.5; text-align: left; white-space: nowrap;">— ${author}</div>
    `;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return messageEl;
}

// ===== INITIALIZATION =====
console.log('◢◤ כספת הכסף - מערכת מאותחלת ◢◤');
