// ===========================
// THE SILVER VAULT - MAIN APP
// ===========================

// Configuration
const CONFIG = {
    PASSCODE: 'DemoD69',
    SUPABASE_URL: 'https://uftkmytmegszggtsrrhz.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdGtteXRtZWdzemdndHNycmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5MDgsImV4cCI6MjA4NTg3MzkwOH0.kd6OIlLeXHN2fwIMYu_HQ5fR50g5LwX_czh6qQcD_D0'
};

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
    
    if (passcode === CONFIG.PASSCODE) {
        // Success
        errorMsg.textContent = '✓ ACCESS GRANTED';
        errorMsg.style.color = '#00ff00';
        
        setTimeout(() => {
            document.getElementById('login-screen').classList.remove('active');
            document.getElementById('dashboard-screen').classList.add('active');
            loadFiles();
        }, 1000);
    } else {
        // Failure
        errorMsg.textContent = '✗ ACCESS DENIED - INVALID PASSCODE';
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
    container.innerHTML = '<div class="loading">LOADING ARCHIVES...</div>';
    
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
        container.innerHTML = '<div class="loading">⚠ ERROR LOADING ARCHIVES</div>';
    }
}

function displayFiles(files) {
    const container = document.getElementById('files-container');
    
    if (files.length === 0) {
        container.innerHTML = '<div class="loading">NO FILES IN VAULT</div>';
        return;
    }
    
    container.innerHTML = files.map(file => createFileCard(file)).join('');
}

function createFileCard(file) {
    const icon = getFileIcon(file.file_type);
    const date = new Date(file.created_at).toLocaleDateString();
    
    return `
        <div class="file-card" onclick="openFile('${file.file_url}', '${file.file_type}')">
            <div class="file-icon">${icon}</div>
            <div class="file-name">${escapeHtml(file.file_name)}</div>
            <div class="file-meta">
                TYPE: ${file.file_type.toUpperCase()}<br>
                DATE: ${date}
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

// ===== CHAT FUNCTIONALITY (Placeholder) =====
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addChatMessage('YOU', message, 'user');
    input.value = '';
    
    // Simulate bot response (placeholder)
    setTimeout(() => {
        const response = getBotResponse(message);
        addChatMessage('MR. D', response, 'bot');
    }, 1000);
}

function addChatMessage(author, text, type) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${type}`;
    messageEl.innerHTML = `
        <span class="message-author">${author}:</span>
        <span class="message-text">${escapeHtml(text)}</span>
    `;
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getBotResponse(message) {
    // Simple placeholder responses
    const responses = {
        'silver': 'Silver is an excellent investment for diversification. In Israel, you should consider tax implications and storage options.',
        'price': 'Silver prices fluctuate based on market conditions. Check the current spot price and consider dollar-cost averaging.',
        'tax': 'In Israel, precious metals have specific tax regulations. I recommend consulting with a tax advisor for your specific situation.',
        'buy': 'You can purchase silver through authorized dealers in Israel. Look for reputable sources and compare premiums.',
        'store': 'Storage options include home safes, bank vaults, or allocated storage with dealers. Each has pros and cons.',
        'gold': 'Gold and silver serve different purposes in a portfolio. Silver has more industrial demand and higher volatility.'
    };
    
    const lowerMessage = message.toLowerCase();
    for (const [keyword, response] of Object.entries(responses)) {
        if (lowerMessage.includes(keyword)) {
            return response;
        }
    }
    
    return 'Interesting question. For detailed advice on this topic, I recommend reviewing the archives or consulting directly with our team.';
}

// ===== INITIALIZATION =====
console.log('◢◤ THE SILVER VAULT - SYSTEM INITIALIZED ◢◤');
