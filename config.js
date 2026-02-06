/**
 * Configuration for Silver Vault Mini App
 * PUBLIC CONFIGURATION ONLY - No secrets here!
 */

const CONFIG = {
    // Supabase Configuration (Public anon key - safe to expose)
    SUPABASE_URL: 'https://uftkmytmegszggtsrrhz.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdGtteXRtZWdzemdndHNycmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5MDgsImV4cCI6MjA4NTg3MzkwOH0.kd6OIlLeXHN2fwIMYu_HQ5fR50g5LwX_czh6qQcD_D0',
    
    // Mr. D Chat API (Backend endpoint)
    CHAT_API_URL: 'https://web-production-f049.up.railway.app',
    
    // File Categories (Hebrew)
    CATEGORIES: {
        'PDFS': '📄 מסמכי PDF',
        'VIDEOS': '🎥 סרטונים',
        'PHOTOS': '📸 תמונות',
        'DOCUMENTS': '📁 מסמכים'
    },
    
    // File Icons
    ICONS: {
        'pdf': '📄',
        'video': '🎥',
        'photo': '📸',
        'document': '📁'
    },
    
    // UI Messages (Hebrew)
    MESSAGES: {
        loginSuccess: '✓ גישה אושרה',
        loginError: '✗ קוד שגוי',
        loading: 'טוען ארכיון...',
        loadError: '⚠ שגיאה בטעינת הארכיון',
        noFiles: 'אין קבצים בכספת',
        chatPlaceholder: 'שאל משהו על כסף...',
        sendButton: 'שלח'
    },
    
    // Version
    VERSION: '1.4.9 BETA'
};

// Passcode is validated server-side for security
// Do not store sensitive credentials in frontend code
