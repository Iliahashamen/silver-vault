/**
 * Quiet trivia feedback clicks (Web Audio - no external files).
 */
let _quizAudioCtx = null;

function _quizAudioContext() {
    if (!_quizAudioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        _quizAudioCtx = new Ctx();
    }
    if (_quizAudioCtx.state === 'suspended') {
        _quizAudioCtx.resume().catch(() => {});
    }
    return _quizAudioCtx;
}

function _quizClick({ startHz, endHz, duration, type, peak }) {
    try {
        const ctx = _quizAudioContext();
        if (!ctx) return;

        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(startHz, t0);
        if (endHz && endHz !== startHz) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(endHz, 40), t0 + duration);
        }

        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.03);
    } catch (_) { /* ignore */ }
}

function playQuizCorrectSound() {
    _quizClick({ startHz: 640, endHz: 920, duration: 0.055, type: 'sine', peak: 0.045 });
    setTimeout(() => {
        _quizClick({ startHz: 920, endHz: 1180, duration: 0.06, type: 'sine', peak: 0.038 });
    }, 48);
}

function playQuizWrongSound() {
    _quizClick({ startHz: 200, endHz: 120, duration: 0.1, type: 'triangle', peak: 0.042 });
    setTimeout(() => {
        _quizClick({ startHz: 150, endHz: 95, duration: 0.08, type: 'triangle', peak: 0.028 });
    }, 70);
}
