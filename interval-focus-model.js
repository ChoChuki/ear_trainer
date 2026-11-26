/* Focused interval practice (2.8.2): plan, scoring and answer windows follow focused AP
 * practice. Sizes are semitones 1-12 (m2 ... P8); the direction is a setting. */
(function (root) {
    'use strict';
    const protocol = 1;
    const SHORT = ['P1','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','P8'];
    // Suggested order for new intervals: wide consonances, thirds, steps, sixths, sevenths, tritone.
    const ORDER = [7, 12, 4, 3, 5, 2, 9, 1, 8, 10, 11, 6];
    const SIZES = Array.from({length: 12}, (_, i) => i + 1);
    const limits = {violin: [55, 108], piano: [21, 108]};
    const directions = ['up', 'down', 'both', 'harmonic'];
    const sizes = [12, 24, 36, 48, 60];
    const windows = ['strict', 'relaxed', 'fast', 'off'];
    const octaveOf = midi => Math.floor(midi / 12) - 1;
    const sameName = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a % 12 === b % 12;
    const validSet = a => Array.isArray(a) && a.length > 0 && a.length <= 12 &&
        a.every(d => Number.isInteger(d) && d >= 1 && d <= 12) && new Set(a).size === a.length;
    const sameSet = (a, b) => validSet(a) && validSet(b) && a.length === b.length && b.every(d => a.includes(d));
    const choose = (items, weights) => root.TrainingCore.choose(items, weights);
    function shuffle(items) {
        const result = [...items];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    function defaults(known = [7]) {
        return {known: [...known], octaves: [4, 5], direction: 'up', size: 24, hit: 75, falseAlarm: 25,
            limit: 'fast', allowRepeats: false, responseMode: 'name'};
    }
    function octaveChoices(instrument) {
        const [low, high] = limits[instrument] || limits.piano;
        return Array.from({length: octaveOf(high) - octaveOf(low) + 1}, (_, i) => octaveOf(low) + i);
    }
    function validSettings(s, instrument) {
        return !!s && validSet(s.known) && Array.isArray(s.octaves) && s.octaves.length > 0 &&
            new Set(s.octaves).size === s.octaves.length && s.octaves.every(o => octaveChoices(instrument).includes(o)) &&
            directions.includes(s.direction) && sizes.includes(s.size) &&
            Number.isInteger(s.hit) && s.hit >= 50 && s.hit <= 100 &&
            Number.isInteger(s.falseAlarm) && s.falseAlarm >= 0 && s.falseAlarm <= 50 &&
            windows.includes(s.limit) && typeof s.allowRepeats === 'boolean' && ['name', 'set'].includes(s.responseMode);
    }
    function pitchPool(octaves, instrument) {
        const [low, high] = limits[instrument] || limits.piano;
        const out = [];
        for (let midi = low; midi <= high; midi++) if (octaves.includes(octaveOf(midi))) out.push(midi);
        return out;
    }
    // Sizes with at least one pair inside the pool (a descending pair is the same two notes).
    function available(pitches) {
        const set = new Set(pitches);
        return SIZES.filter(d => pitches.some(p => set.has(p + d)));
    }
    function namesFor(responseMode, known, pitches) {
        return responseMode === 'name' ? available(pitches) : [...known].sort((a, b) => a - b);
    }
    // The same windows as focused AP practice and AnswerTimer: wider with more choices.
    function answerWindow(limit) {
        // 2.8.3: one fixed window (1183 ms + 150 ms), however many buttons are shown.
        return limit === 'off' ? null : 1333;
    }
    const intervalOf = q => Number.isInteger(q?.reference) && Number.isInteger(q?.target) &&
        Math.abs(q.target - q.reference) >= 1 && Math.abs(q.target - q.reference) <= 12 ? Math.abs(q.target - q.reference) : null;
    function plan(settings, mode, instrument, weights = {}, previous = null) {
        const pitches = pitchPool(settings.octaves, instrument);
        const avail = available(pitches);
        if (avail.length < 2) return [];
        const n = mode === 'cold' ? 12 : settings.size;
        let prev = previous;
        if (mode === 'cold') {
            // Sizes, not pairs, are sampled, so narrow sizes do not dominate the check.
            return Array.from({length: n}, () => {
                const options = avail.filter(d => settings.allowRepeats || d !== prev);
                const d = choose(options);
                prev = d;
                return d;
            });
        }
        const known = settings.known;
        if (!known.every(d => avail.includes(d))) return [];
        const outside = ORDER.filter(d => avail.includes(d) && !known.includes(d));
        let nTarget = outside.length ? n - Math.round(n / 4) : n;
        if (known.length === 1) nTarget = outside.length === 1 && !settings.allowRepeats ? n / 2 : Math.round(n * (.34 + Math.random() * .07));
        const nOther = n - nTarget;
        const extra = mode === 'learn' ? Math.min(Math.floor(nTarget / 5), Math.max(0, nTarget - known.length)) : 0;
        let targets = [];
        while (targets.length < nTarget - extra) targets.push(...shuffle(known));
        targets = targets.slice(0, nTarget - extra);
        for (let i = 0; i < extra; i++) targets.push(choose(known, known.map(d => weights[d] || 1)));
        // "Other" leans towards sizes next to the learned ones, as AP foils lean towards neighbours.
        const foil = outside.map(d => {
            const gap = Math.min(...known.map(k => Math.abs(k - d)));
            return gap === 1 ? 3 : gap === 2 ? 2 : 1;
        });
        const remaining = Array(13).fill(0);
        for (const d of targets) remaining[d]++;
        for (let i = 0; i < nOther; i++) {
            const eligible = outside.filter(d => outside.length === 1 || remaining[d] < n / 2);
            const d = choose(eligible, eligible.map(x => foil[outside.indexOf(x)]));
            remaining[d]++;
        }
        if (settings.allowRepeats) return shuffle(remaining.flatMap((count, d) => Array(count).fill(d)));
        // Consecutive sizes differ; a size that could otherwise collide gets its slot first.
        const out = [];
        for (let i = 0; i < n; i++) {
            const legal = avail.filter(d => d !== prev);
            const unused = legal.filter(d => remaining[d] > 0);
            const required = unused.find(d => remaining[d] > (n - i) / 2);
            const d = required ?? (unused.length ? choose(unused, unused.map(k => remaining[k])) : choose(legal));
            remaining[d]--; prev = d; out.push(d);
        }
        return out;
    }
    // The last sound may have changed after planning (another exercise, a stopped question).
    function adjust(size, previous, avail, known, allowRepeats) {
        if (allowRepeats || size !== previous) return size;
        const legal = avail.filter(d => d !== previous);
        if (!legal.length) return size;
        const same = legal.filter(d => known.includes(d) === known.includes(size));
        return choose(same.length ? same : legal);
    }
    // A pair in a random register. It never continues from the last question: the second note
    // avoids the last target's note name and, where possible, the first note avoids both last names.
    function pickPair(size, pitches, direction, previous = null) {
        const set = new Set(pitches);
        const order = direction === 'both' ? shuffle(['up', 'down']) : [direction];
        const prev = Number.isInteger(previous?.target) ? previous : null;
        for (const dir of order) {
            const pairs = [];
            for (const p of pitches) {
                const reference = dir === 'down' ? p + size : p, target = dir === 'down' ? p : p + size;
                if (set.has(reference) && set.has(target)) pairs.push({reference, target});
            }
            if (!pairs.length) continue;
            const moved = prev ? pairs.filter(q => !sameName(q.target, prev.target)) : pairs;
            const fresh = prev ? moved.filter(q => !sameName(q.reference, prev.target) && !sameName(q.reference, prev.reference)) : moved;
            const pick = choose(fresh.length ? fresh : moved.length ? moved : pairs);
            return {...pick, size, direction: dir};
        }
        return null;
    }
    // The question for a planned size. In a narrow range a size may have only pairs that repeat
    // the last note name; then a size of the same group (learned or other) takes its place.
    function pickQuestion(size, pitches, direction, previous, known, allowRepeats) {
        const before = intervalOf(previous), avail = available(pitches);
        const planned = adjust(size, before, avail, known, allowRepeats);
        const clean = d => {
            const q = pickPair(d, pitches, direction, previous);
            return q && !(Number.isInteger(previous?.target) && sameName(q.target, previous.target)) ? q : null;
        };
        let q = clean(planned);
        if (q) return q;
        const others = avail.filter(d => d !== planned && (allowRepeats || d !== before));
        const group = d => known.includes(d) === known.includes(planned);
        for (const d of [...shuffle(others.filter(group)), ...shuffle(others.filter(d => !group(d)))]) {
            q = clean(d);
            if (q) return q;
        }
        return pickPair(planned, pitches, direction, previous);
    }
    const scored = row => row.result === 'answered' || row.result === 'assisted';
    const attempted = row => scored(row) || row.result === 'timeout';
    const first = row => row.result === 'answered' && row.replayed === 0;
    const exactTask = row => row.kind === 'cold' || row.responseMode === 'name';
    const isTarget = row => row.kind === 'cold' || row.known.includes(row.size);
    const correct = row => row.result === 'answered' && (row.guess === row.size ||
        (!exactTask(row) && !isTarget(row) && row.guess === 'out'));
    function counts(rows) {
        const usable = rows.filter(attempted);
        const targets = usable.filter(isTarget);
        const outsiders = usable.filter(row => !isTarget(row) && first(row));
        return {hits: targets.filter(row => first(row) && correct(row)).length, targets: targets.length,
            alarms: outsiders.filter(row => row.known.includes(row.guess)).length, outside: outsiders.length,
            assisted: usable.filter(row => row.replayed > 0).length, total: usable.length,
            named: usable.filter(row => first(row) && correct(row)).length,
            late: usable.filter(row => row.result === 'timeout').length};
    }
    // Recent misses of a learned size make it a little more likely in active learning.
    function weights(rows, known) {
        const out = {};
        for (const d of known) {
            const items = rows.filter(r => r.size === d && r.kind !== 'cold' && attempted(r))
                .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0)).slice(0, 12);
            const miss = items.length ? 1 - items.filter(r => first(r) && correct(r)).length / items.length : .5;
            out[d] = 1 + 2 * miss;
        }
        return out;
    }
    function promotion(rows, sessions, settings, now = Date.now()) {
        const blocks = sessions.filter(s => s.protocol === protocol && s.completed && ['learn', 'consolidate'].includes(s.kind) &&
            sameSet(s.known, settings.known) && s.responseMode === settings.responseMode && s.allowRepeats === settings.allowRepeats &&
            s.limit === settings.limit && s.direction === settings.direction && Array.isArray(s.octaves) &&
            s.octaves.length === settings.octaves.length && settings.octaves.every(o => s.octaves.includes(o)) &&
            s.started >= now - 14 * 86400000 && s.started <= now)
            .sort((a, b) => b.started - a.started).slice(0, 6);
        const ids = new Set(blocks.map(s => s.id));
        const recent = rows.filter(r => ids.has(r.sessionId) && attempted(r));
        const perSize = settings.known.map(d => {
            const items = recent.filter(r => r.size === d);
            return {size: d, first: items.filter(first).length,
                rate: items.length ? items.filter(r => first(r) && correct(r)).length / items.length : 0};
        });
        const c = counts(recent);
        const hit = perSize.reduce((sum, p) => sum + p.rate, 0) / perSize.length;
        const fa = c.outside ? c.alarms / c.outside : null;
        const next = ORDER.find(d => !settings.known.includes(d));
        return {blocks: ids.size, perSize, outside: c.outside, hit, fa, next,
            ready: next !== undefined && ids.size >= 2 && perSize.every(p => p.first >= 5) && c.outside >= 10 &&
                hit * 100 + 1e-9 >= settings.hit && fa !== null && fa * 100 <= settings.falseAlarm + 1e-9};
    }
    function checkReport(rows, sessions) {
        const checks = rows.filter(r => r.kind === 'cold' && attempted(r));
        const last = sessions.filter(s => s.kind === 'cold' && s.completed).sort((a, b) => b.started - a.started)[0] || null;
        return {hits: checks.filter(r => first(r) && correct(r)).length, total: checks.length,
            days: new Set(checks.map(r => r.day)).size, last};
    }
    root.IntervalFocusModel = {protocol, SHORT, ORDER, SIZES, directions, sizes, windows, defaults, validSet, sameSet,
        octaveChoices, octaveOf, validSettings, pitchPool, available, namesFor, answerWindow, intervalOf, plan, adjust,
        pickPair, pickQuestion, scored, attempted, first, exactTask, isTarget, correct, counts, weights, promotion, checkReport};
})(typeof window === 'undefined' ? globalThis : window);
