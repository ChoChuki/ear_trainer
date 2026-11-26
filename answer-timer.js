/* Answer window shared by the timed exercises outside the focused screens.
 * 2.8.4: the window is a number of seconds typed by the user (default 1.3), kept in ms;
 * an empty field or 0 means no limit. It starts at the estimated onset of the sound answered. */
(function (root) {
    'use strict';
    const KEY = 'ear-answer-limit-v2';
    const DEFAULT_MS = 1300, MIN_MS = 100, MAX_MS = 60000;
    // Any stored value as ms or null: older named choices ("fast", "strict", "relaxed") read as 1.3 s.
    function normalize(limit) {
        if (limit === null || limit === 'off' || limit === 0) return null;
        if (Number.isFinite(limit) && limit > 0) return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, limit)));
        return DEFAULT_MS;
    }
    const windowMs = limit => normalize(limit);
    // Typed text: empty or 0 is no limit; "1.3", "1,3" or "1.3 s" are seconds; anything else keeps `current`.
    function parse(text, current = DEFAULT_MS) {
        const raw = String(text ?? '').trim();
        if (raw === '') return null;
        const s = Number(raw.replace(',', '.').replace(/\s*(s|sec|秒|δ)\.?$/i, ''));
        if (!Number.isFinite(s) || s < 0) return normalize(current);
        return s === 0 ? null : normalize(Math.round(s * 1000));
    }
    function text(ms, language = 'en') {
        if (ms === null || ms === undefined) return '';
        try { return new Intl.NumberFormat(language || 'en', {maximumFractionDigits: 3, useGrouping: false}).format(ms / 1000); }
        catch (_) { return String(ms / 1000); }
    }
    function load() {
        try {
            const saved = localStorage.getItem(KEY);
            if (saved === 'off') return null;
            if (saved !== null && saved !== '' && Number.isFinite(Number(saved))) return normalize(Number(saved));
            if (localStorage.getItem('ear-answer-limit-v1') === 'off') return null;
        } catch (_) {}
        return DEFAULT_MS;
    }
    function save(limit) {
        const ms = normalize(limit);
        try { localStorage.setItem(KEY, ms === null ? 'off' : String(ms)); return true; } catch (_) { return false; }
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
    root.AnswerTimer = {KEY, DEFAULT_MS, MIN_MS, MAX_MS, normalize, windowMs, parse, text, load, save, createClock};
})(typeof window !== 'undefined' ? window : globalThis);
