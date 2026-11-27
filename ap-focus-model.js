/* The focused AP course uses the same pitch classes, database and clock as the host. */
(function (root) {
    'use strict';
    // Protocol 9 separates unrestricted pitch naming from target recognition.
    const protocol = 9;
    const readable = [7, 8, 9];
    const sourceVersion = 'jclive-sf2-v1';
    const legacySourceVersion = 'iowa-prototype-1';
    const notes = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const keyColumns = [1,2,3,4,5,7,8,9,10,11,12,13];
    const blackKeys = [1,3,6,8,10];
    const keyOrder = [...blackKeys,0,2,4,5,7,9,11];
    const limits = {violin: [55,108], piano: [21,108]};
    const octaveOf = pitch => Math.floor(pitch / 12) - 1;
    const order = root.APPitchScience.ORDER;
    const validSet = a => Array.isArray(a) && a.length > 0 && a.length <= 12 &&
        a.every(n => Number.isInteger(n) && n >= 0 && n < 12) && new Set(a).size === a.length;
    const sameSet = (a,b) => validSet(a) && validSet(b) && a.length === b.length && b.every(n => a.includes(n));
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
    const isNaming = row => row.protocol === protocol && row.kind === 'cold';
    // 2.8.6: every mode judges a note against the learning set at the time ("learned", stored since 2.8.5;
    // older rows use "known", which held all 12 names on older blind checks). A note in the set needs its
    // exact name. For any other note, "Other" and every name outside the set mean the same thing, "other",
    // and count as right; only a name from the set is a false alarm. "Not sure" is neither.
    const setOf = row => Array.isArray(row.learned) ? row.learned : row.known;
    const isTarget = row => setOf(row).includes(row.pitch % 12);
    const exactTask = row => isNaming(row) || (row.protocol === protocol && row.responseMode === 'name');
    const namesFor = (style, known) => style === 'name' ? notes.map((_, pc) => pc) : [...known];
    const correct = row => row.result === 'answered' && TrainingCore.matchesLearningSet(row.pitch % 12, row.guess, setOf(row), 0, 11);
    function defaults(known = [5]) {
        return {known: [...known], octaves: [4,5,6], share: 0, size: 24, hit: 75, falseAlarm: 25, limit: 1300, allowRepeats: false, responseMode: 'name'};
    }
    // Older backups can contain the former named limit choices.
    const windows = ['strict', 'relaxed', 'fast', 'off'];
    function answerWindow(limit) {
        // 2.8.4: the typed window in ms; null, 0 or 'off' is no limit, older named choices read as the default.
        if (limit === null || limit === 'off' || limit === 0) return null;
        if (Number.isFinite(limit) && limit > 0) return Math.round(Math.min(60000, Math.max(100, limit)));
        return 1300;
    }
    const windowOf = s => s.limitMs === null || Number.isFinite(s.limitMs) ? s.limitMs : answerWindow(s.limit);
    const sameWindow = (a, b) => a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 50);
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
            (s.limit === undefined || s.limit === null || windows.includes(s.limit) || (Number.isFinite(s.limit) && s.limit >= 100 && s.limit <= 60000)) &&
            (s.allowRepeats === undefined || typeof s.allowRepeats === 'boolean') &&
            (s.responseMode === undefined || ['name','set'].includes(s.responseMode));
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
    function pickMidi(pc, pitches, previous, known, example = null, {blind = false, avoid = null, active = false, recent = []} = {}) {
        const available = [...new Set(pitches.map(midi => midi % 12))];
        let legal = available.filter(name => !TrainingCore.sameNoteName(name, previous));
        // 2.8.2: a labelled example heard just before the question counts as its previous note too.
        const label = Number.isInteger(avoid) ? avoid : example;
        if (Number.isInteger(label)) {
            const clear = legal.filter(name => !TrainingCore.sameNoteName(name, label));
            if (clear.length) legal = clear;
        }
        if (!legal.length) return null;
        if (!legal.includes(pc)) {
            // A stopped question or a different tab can change the last audible target after planning.
            const sameGroup = legal.filter(name => known.includes(name) === known.includes(pc));
            pc = TrainingCore.choose(sameGroup.length ? sameGroup : legal);
        }
        const choices = pitches.filter(midi => midi % 12 === pc);
        if (active) {
            // A hard register jump creates a predictable low/high cycle in two-octave pools.
            // Keep distance as a preference, never as a filter. Suppress, but do not ban,
            // a recently heard exact pitch. This keeps both registers genuinely possible.
            const anchor = example ?? previous;
            return TrainingCore.choose(choices, choices.map(midi => {
                const distance = Number.isInteger(anchor) && Math.abs(midi - anchor) >= 13 ? 1.5 : 1;
                const age = [...recent].reverse().indexOf(midi);
                return distance * (age >= 0 && age <= 1 ? .25 : age >= 2 && age <= 3 ? .65 : 1);
            }));
        }
        return blind ? TrainingCore.choose(choices) : TrainingCore.farPitch(choices, example ?? previous);
    }
    function plan(settings, mode, instrument, weights = {}, previousMidi = null) {
        const n = mode === 'cold' ? 12 : settings.size;
        const known = settings.known;
        const pitches = pitchPool(settings.octaves, instrument, mode !== 'cold' && settings.share > 0);
        const available = new Set(pitches.map(p => p % 12));
        if (available.size < 2) return [];
        if (mode === 'cold') {
            // Sample pitch names, not MIDI numbers, so partial octaves do not bias the test.
            // There is no block quota to solve by elimination on the last question.
            let previous = previousMidi;
            return Array.from({length:n}, () => {
                const names = [...available].filter(pc => !TrainingCore.sameNoteName(pc, previous));
                const pc = TrainingCore.choose(names);
                previous = pc;
                return {pc, instrument};
            });
        }
        if (!playable(pitches, known)) return [];
        const outside = order.filter(pc => available.has(pc) && !known.includes(pc));
        let nTarget = outside.length ? n - Math.round(n / 4) : n;
        // A single name keeps a little over a third of the block, as in earlier releases.
        if (known.length === 1) nTarget = outside.length === 1 ? n / 2 : Math.round(n * (.34 + Math.random() * .07));
        // Two target names otherwise consume 75% of a block, making their alternation
        // too easy to anticipate. Insert more actual outside questions, not new learned names.
        if (mode === 'learn' && known.length === 2 && outside.length >= 2) nTarget = Math.round(n * .60);
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
            const eligible = outside.filter(pc => outside.length === 1 || remaining[pc] < n/2);
            const pc = TrainingCore.choose(eligible, eligible.map(pc => foilWeights[outside.indexOf(pc)]));
            remaining[pc]++;
        }
        const secondary = Math.round(n * settings.share);
        const instruments = shuffle([...Array(secondary).fill(otherInstrument(instrument)), ...Array(n - secondary).fill(instrument)]);
        // Reserve a slot for any name that could otherwise occupy two adjacent draws.
        let previous = previousMidi;
        const recent = Number.isInteger(previousMidi) ? [previousMidi % 12] : [];
        return instruments.map((name, i) => {
            const legal = [...available].filter(pc => !TrainingCore.sameNoteName(pc, previous));
            const unused = legal.filter(pc => remaining[pc] > 0);
            const required = unused.find(pc => remaining[pc] > (n - i) / 2);
            const choices = unused.length ? unused : legal;
            // Soft anti-pattern weights: a name two questions back is less likely, but
            // remains possible. A hard two-back ban would create a new predictable cycle.
            const weights = choices.map(pc => {
                const count = unused.length ? remaining[pc] : 1;
                if (mode !== 'learn') return count;
                return count * (pc === recent.at(-2) ? .35 : pc === recent.at(-3) || pc === recent.at(-4) ? .8 : 1);
            });
            const pc = required ?? TrainingCore.choose(choices, weights);
            remaining[pc]--; previous = pc;
            recent.push(pc);
            if (recent.length > 4) recent.shift();
            return {pc, instrument:name};
        });
    }
    function namingScores(rows) {
        const checks = rows.filter(row => isNaming(row) && attempted(row));
        const score = group => ({hits:group.filter(row => first(row) && correct(row)).length, total:group.length});
        return {
            rested:score(checks.filter(row => row.eligibleCold && row.poolSize === 12)),
            limited:score(checks.filter(row => row.eligibleCold && row.poolSize < 12)),
            firstUse:score(checks.filter(row => row.firstRecorded)),
            warm:score(checks.filter(row => !row.eligibleCold && !row.firstRecorded))
        };
    }
    function counts(rows) {
        const usable = rows.filter(attempted);
        const targets = usable.filter(isTarget);
        const outsiders = usable.filter(row => !isTarget(row) && first(row));
        return {hits: targets.filter(row => first(row) && correct(row)).length, targets: targets.length,
            alarms: outsiders.filter(row => setOf(row).includes(row.guess)).length, outside: outsiders.length,
            assisted: usable.filter(row => row.replayed > 0).length, total: usable.length,
            late: usable.filter(row => row.result === 'timeout').length};
    }
    function promotion(rows, sessions, settings, instrument, now = Date.now()) {
        const practiced = new Set(rows.filter(r => isFocus(r) && r.timbre === instrument && first(r)).map(r => r.sessionId));
        const blocks = sessions.filter(s => isFocus(s) && s.protocol === protocol && practiced.has(s.id) && s.completed && s.source === instrument &&
            ['learn','consolidate'].includes(s.kind) && sameSet(s.known, settings.known) &&
            s.allowRepeats === settings.allowRepeats &&
            sameWindow(windowOf(s), answerWindow(settings.limit)) && sameSet(s.octaves, settings.octaves) &&
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
    root.APFocusModel = {protocol,sourceVersion,notes,order,keyColumns,blackKeys,keyOrder,label,validSet,sameSet,defaults,windows,answerWindow,validSettings,otherInstrument,
        isFocus,isNaming,exactTask,namesFor,namingScores,sampleId,scored,attempted,first,correct,isTarget,octaveChoices,octaveOf,supports,pitchPool,rangeText,playable,pickMidi,plan,counts,promotion,outputClock};
})(typeof window === 'undefined' ? globalThis : window);
