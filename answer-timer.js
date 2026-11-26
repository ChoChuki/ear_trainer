/* Answer window shared by the timed exercises outside the focused screens.
 * 2.8.3: one fixed window of about 1.3 s (1183 ms, the two-choice window of 2.8.0, plus 150 ms
 * for the touch and the estimated audio onset), whatever the number of answer buttons, or no limit.
 * The window starts at the estimated onset of the sound that is answered. */
(function (root) {
    'use strict';
    const LIMITS = ['fast', 'off'];  // 2.8.3: older 'strict' / 'relaxed' choices read as 'fast'
    const KEY = 'ear-answer-limit-v1';
    const FAST_MS = 1333;
    function windowMs(limit) {
        return limit === 'off' ? null : FAST_MS;
    }
    function load() {
        try { const saved = localStorage.getItem(KEY); if (LIMITS.includes(saved)) return saved; } catch (_) {}
        return 'fast';
    }
    function save(limit) {
        if (!LIMITS.includes(limit)) return false;
        try { localStorage.setItem(KEY, limit); return true; } catch (_) { return false; }
    }
    // One countdown per screen. A finger that touched an answer before the deadline still
    // decides it (up to 0.8 s later), as in focused AP practice.
    function createClock(bar = null) {
        let deadline = null, total = 0, timer = null, pressedAt = null, expire = null;
        function hide() { if (bar) bar.hidden = true; }
        function stop() {
            clearTimeout(timer); timer = null; deadline = null; pressedAt = null; expire = null; hide();
        }
        function draw() {
            if (!bar) return;
            const fill = bar.firstElementChild, left = deadline - performance.now();
            bar.hidden = false;
            if (!fill) return;
            fill.style.transition = 'none';
            fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, left / total)) + ')';
            void fill.offsetWidth;
            fill.style.transition = 'transform ' + Math.max(0, Math.round(left)) + 'ms linear';
            fill.style.transform = 'scaleX(0)';
        }
        function check() {
            if (deadline === null) return;
            const now = performance.now();
            if (now < deadline) { timer = setTimeout(check, deadline - now + 30); return; }
            if (pressedAt !== null && pressedAt <= deadline && now - deadline < 800) { timer = setTimeout(check, 60); return; }
            const at = deadline, done = expire;
            stop();
            if (done) done(at);
        }
        function start(onset, ms, onExpire) {
            stop();
            if (!Number.isFinite(ms) || !Number.isFinite(onset)) return null;
            total = ms; deadline = onset + ms; expire = onExpire;
            draw();
            timer = setTimeout(check, Math.max(0, deadline - performance.now()) + 30);
            return deadline;
        }
        return {
            start, stop,
            press(at = performance.now()) { if (deadline !== null) pressedAt = at; },
            release() { pressedAt = null; },
            pressed() { return pressedAt; },
            late(at) { return deadline !== null && at > deadline; },
            get deadline() { return deadline; },
            get active() { return deadline !== null; },
            place(element) { if (element && element !== bar) { hide(); bar = element; if (deadline !== null) draw(); } }
        };
    }
    root.AnswerTimer = {LIMITS, KEY, FAST_MS, windowMs, load, save, createClock};
})(typeof window !== 'undefined' ? window : globalThis);
