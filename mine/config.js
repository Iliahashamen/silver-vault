/**
 * Configuration for GROUPTECH — The Mine module (gold)
 */

const CONFIG = {
    SUPABASE_URL: 'https://uftkmytmegszggtsrrhz.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdGtteXRtZWdzemdndHNycmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5MDgsImV4cCI6MjA4NTg3MzkwOH0.kd6OIlLeXHN2fwIMYu_HQ5fR50g5LwX_czh6qQcD_D0',

    // Backend API
    CHAT_API_URL: 'https://web-production-f049.up.railway.app',

    // Gold-specific endpoints (relative to CHAT_API_URL)
    GOLD_PRICE_PATH:   '/api/gold-price',
    GOLD_HISTORY_PATH: '/api/gold-history',
    CHAT_PATH:         '/chat/mine',

    MESSAGES: {
        loginSuccess: ' גישה אושרה',
        loginError: ' קוד שגוי',
        loading: 'טוען מכרה...',
        loadError: ' שגיאה בטעינת המכרה',
        noFiles: 'אין נתונים',
        chatPlaceholder: 'שאל משהו על זהב...',
        sendButton: 'שלח',
    },

    VERSION: '1.0.0',
};

// Local sandbox override
if (typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    CONFIG.CHAT_API_URL = 'http://localhost:8082';
}
