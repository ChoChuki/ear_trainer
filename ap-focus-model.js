/* The focused AP course uses the same pitch classes, database and clock as the host. */
(function (root) {
    'use strict';
    // Protocol 8: note names independent of the previous question, successive notes more
    // than an octave apart, a timed answer window and a longer pitch-memory reset.
    // Protocol 7 rows stay readable but no longer count towards a new-note suggestion.
    const protocol = 8;
    const readable = [7, 8];
    const sourceVersion = 'jclive-sf2-v1';
    const legacySourceVersion = 'iowa-prototype-1';
    const notes = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const limits = {violin: [55,108], piano: [21,108]};
    const octaveOf = pitch => Math.floor(pitch / 12) - 1;
    const order = root.APPitchScience.ORDER;
    const validSet = a => Array.isArray(a) && a.length > 0 && a.length <= 12 &&
        a.every(n => Number.isInteger(n) && n >= 0 && n < 12) && new Set(a).size === a.length;
    const sameSet = (a,b) => validSet(a) && a.length === b.length && b.every(n => a.includes(n));
    const otherInstrument = instrument => instrument === 'violin' ? 'piano' : 'violin';
    const label = midi => notes[midi % 12] + octaveOf(midi);
    const isFocus = row => readable.includes(row?.protocol) && [sourceVersion, legacySourceVersion].includes(row.sourceVersion);
    function sampleId(instrument, pitch, version = sourceVersion) {
        return version === legacySourceVersion ? instrument + '-' + pitch + '-1' : 'jclive-' + instrument + '-' + pitch;
    }
    const scored = row => row.result === 'answered' || row.result === 'assisted';
    // A late answer is an attempt without a hit, like a wrong one.
    const attempted = row => scored(row) || row.result === 'relative' || row.result === 'timeout';
    const first = row => row.result === 'answered' && row.replayed === 0;
    const isTarget = row => row.known.includes(row.pitch % 12);
    const correct = row => row.result === 'answered' && row.guess === (isTarget(row) ? row.pitch % 12 : 'out');
    function defaults(known = [5]) {
        return {known: [...known], octaves: [4,5,6], share: 0, size: 24, hit: 75, falseAlarm: 25, limit: 'strict'};
    }
    // Answer windows of Wong et al. (2025): 1,183 ms with one learned name, rising
    // linearly to 2,028 ms with twelve. Answers after the window count as misses, which
    // leaves little time to work a name out from an interval. 150 ms covers touch input
    // and the uncertainty of the audible-onset estimate; "relaxed" adds 0.7 s.
    const windows = ['strict', 'relaxed', 'off'];
    function answerWindow(limit, names) {
        if (limit === 'off') return null;
        const k = Math.max(1, Math.min(12, names));
        return Math.round(1183 + (2028 - 1183) * (k - 1) / 11 + 150 + (limit === 'relaxed' ? 700 : 0));
    }
    function octaveChoices(instrument) {
        const [low, high] = limits[instrument];
        return Array.from({length: octaveOf(high) - octaveOf(low) + 1}, (_, i) => octaveOf(low) + i);
    }
    function validSettings(s, instrument) {
        return s && validSet(s.known) && [0, .2, .5].includes(s.share) && [12,24,36,48,60].includes(s.size) &&
            (s.octaves === undefined || (Array.isArray(s.octaves) && s.octaves.length > 0 &&
                new Set(s.octaves).size === s.octaves.length && s.octaves.every(o => octaveChoices(instrument).includes(o)))) &&
            Number.isInteger(s.hit) && s.hit >= 50 && s.hit <= 100 &&
            Number.isInteger(s.falseAlarm) && s.falseAlarm >= 0 && s.falseAlarm <= 50 &&
            (s.limit === undefined || windows.includes(s.limit));
    }
    function supports(instrument, pitch, version = sourceVersion) {
        if (!limits[instrument] || !Number.isInteger(pitch)) return false;
        const [low, high] = version === legacySourceVersion ? [60,95] : limits[instrument];
        return pitch >= low && pitch <= high;
    }
    function pitchPool(octaves, instrument, mixed = false) {
        const [low, high] = limits[instrument];
        const pitches = [];
        for (let midi = low; midi <= high; midi++) {
            if (octaves.includes(octaveOf(midi)) && (!mixed || supports(otherInstrument(instrument), midi))) pitches.push(midi);
        }
        return pitches;
    }
    function rangeText(pitches) {
        const ranges = [];
        for (let i = 0; i < pitches.length; i++) {
            const start = pitches[i];
            while (pitches[i+1] === pitches[i]+1) i++;
            ranges.push(start === pitches[i] ? label(start) : label(start) + '–' + label(pitches[i]));
        }
        return ranges.join(' · ');
    }
    function playable(pitches, known) {
        const pcs = new Set(pitches.map(p => p % 12));
        return pcs.size >= 2 && known.every(pc => pcs.has(pc));
    }
    function shuffle(items) {
        const result = [...items];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    // The planned name is kept; only its octave depends on the most recent sound
    // (the last labelled example if one followed the last question).
    function pickMidi(pc, pitches, previous, known, example = null) {
        const recent = Number.isInteger(example) ? example : previous;
        const preferred = pitches.filter(p => p % 12 === pc);
        if (preferred.length) return TrainingCore.farPitch(preferred, recent);
        // Another tab or a changed range can remove the planned name from the pool.
        const sameGroup = pitches.filter(p => known.includes(p % 12) === known.includes(pc));
        return TrainingCore.farPitch(sameGroup.length ? sameGroup : pitches, recent);
    }
    function plan(settings, mode, instrument, weights = {}, previousMidi = null) {
        const n = mode === 'cold' ? 12 : settings.size;
        const known = settings.known;
        const pitches = pitchPool(settings.octaves, instrument, mode !== 'cold' && settings.share > 0);
        if (!playable(pitches, known)) return [];
        const available = new Set(pitches.map(p => p % 12));
        const outside = order.filter(pc => available.has(pc) && !known.includes(pc));
        let nTarget = outside.length ? n - Math.round(n / 4) : n;
        // A single name keeps a little over a third of the block, as in earlier releases.
        if (known.length === 1) nTarget = Math.round(n * (.34 + Math.random() * .07));
        const nOther = n - nTarget;
        const extra = mode === 'learn' ? Math.min(Math.floor(nTarget / 5), Math.max(0, nTarget - known.length)) : 0;
        let targetPCs = [];
        while (targetPCs.length < nTarget - extra) targetPCs.push(...shuffle(known));
        targetPCs = targetPCs.slice(0, nTarget - extra);
        for (let i = 0; i < extra; i++) {
            targetPCs.push(root.TrainingCore.choose(known, known.map(pc => weights[pc] || 1)));
        }
        const foilWeights = outside.map(pc => {
            const d = Math.min(...known.map(k => root.APPitchScience.chromaDistance(pc,k)));
            return d === 1 ? 3 : d === 2 ? 2 : 1;
        });
        const remaining = Array(12).fill(0);
        for (const pc of targetPCs) remaining[pc]++;
        for (let i = 0; i < nOther; i++) {
            const eligible = outside.filter(pc => remaining[pc] < n/2);  // no single outside name dominates
            const pc = TrainingCore.choose(eligible, eligible.map(pc => foilWeights[outside.indexOf(pc)]));
            remaining[pc]++;
        }
        const secondary = mode === 'cold' ? 0 : Math.round(n * settings.share);
        const instruments = shuffle([...Array(secondary).fill(otherInstrument(instrument)), ...Array(n - secondary).fill(instrument)]);
        // Plain shuffle: a name may follow itself, so the previous answer carries no
        // information about the next one (no "never the same name twice" rule).
        const names = shuffle(remaining.flatMap((count, pc) => Array(count).fill(pc)));
        return instruments.map((name, i) => ({pc: names[i], instrument: name}));
    }
    function counts(rows) {
        const usable = rows.filter(attempted);
        const targets = usable.filter(isTarget);
        const outsiders = usable.filter(row => !isTarget(row) && first(row));
        return {hits: targets.filter(row => first(row) && correct(row)).length, targets: targets.length,
            alarms: outsiders.filter(row => row.known.includes(row.guess)).length, outside: outsiders.length,
            assisted: usable.filter(row => row.replayed > 0).length, total: usable.length,
            late: usable.filter(row => row.result === 'timeout').length};
    }
    function promotion(rows, sessions, settings, instrument, now = Date.now()) {
        const practiced = new Set(rows.filter(r => isFocus(r) && r.timbre === instrument && first(r)).map(r => r.sessionId));
        const blocks = sessions.filter(s => isFocus(s) && s.protocol === protocol && practiced.has(s.id) && s.completed && s.source === instrument &&
            ['learn','consolidate'].includes(s.kind) && sameSet(s.known, settings.known) &&
            s.started >= now - 14 * 86400000 && s.started <= now)
            .sort((a,b) => b.started - a.started).slice(0,6);
        const ids = new Set(blocks.map(s => s.id));
        const recent = rows.filter(r => isFocus(r) && ids.has(r.sessionId) && r.timbre === instrument && attempted(r));
        const perNote = settings.known.map(pc => {
            const items = recent.filter(r => r.pitch % 12 === pc);
            return {pc, first: items.filter(first).length,
                rate: items.length ? items.filter(r => first(r) && correct(r)).length / items.length : 0};
        });
        const c = counts(recent);
        const hit = perNote.reduce((sum,p) => sum + p.rate, 0) / perNote.length;
        const fa = c.outside ? c.alarms / c.outside : null;
        const next = order.find(pc => !settings.known.includes(pc));
        return {blocks: ids.size, perNote, outside: c.outside, hit, fa, next,
            ready: next !== undefined && ids.size >= 2 && perNote.every(p => p.first >= 5) && c.outside >= 10 &&
                hit * 100 + 1e-9 >= settings.hit && fa * 100 <= settings.falseAlarm + 1e-9};
    }
    function outputClock(ctx, start, now = performance.now()) {
        const stamp = ctx.getOutputTimestamp?.();
        if (stamp && stamp.performanceTime > 0 && stamp.contextTime > 0) {
            const when = stamp.performanceTime + (start - stamp.contextTime) * 1000;
            if (Number.isFinite(when) && when >= now - 10 && when < now + 1500 + 1000 * (start - ctx.currentTime))
                return {when, method: 'output-estimate'};
        }
        return {when: now + (start - ctx.currentTime + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000,
            method: 'context-estimate'};
    }
    root.APFocusModel = {protocol,sourceVersion,notes,order,label,validSet,sameSet,defaults,windows,answerWindow,validSettings,otherInstrument,
        isFocus,sampleId,scored,attempted,first,correct,isTarget,octaveChoices,octaveOf,supports,pitchPool,rangeText,playable,pickMidi,plan,counts,promotion,outputClock};
})(typeof window === 'undefined' ? globalThis : window);
