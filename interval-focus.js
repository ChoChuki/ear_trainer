/* Focused interval practice (2.8.2): the focused AP screen applied to interval sizes.
 * Two notes in a random register of the chosen octaves. The answer window starts at the
 * second note (at both notes when they sound together) and widens with the number of answers.
 * Records stay in this browser (IndexedDB "iv-training-data-<instrument>"). */
(function (root) {
    'use strict';
    const M = root.IntervalFocusModel, S = root.APPitchScience, A = root.APFocusModel;
    const $ = id => document.getElementById('iv' + id);
    const modes = ['cold', 'learn', 'consolidate'];
    let host, settings = null, session = null, trial = null, lastBlock = null;
    let phase = 'home', visible = false, initialized = false, screenToken = 0, audioToken = 0, generation = 0;
    let autoTimer, deadlineTimer, pendingWrites = Promise.resolve(), voices = [];
    let firstOnset = null, lastOnset = null, deadline = null, pressedAt = null;
    const trials = new Map(), sessions = new Map();
    const kv = k => 'iv-focus-' + k + '-' + host.site;
    const lang = () => host.language();
    const tr = (key, args) => root.IntervalFocusCopy.t(lang(), key, args);
    const ap = (key, args) => root.APFocusCopy.t(lang(), key, args);
    const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } };
    const percent = n => n === null || !Number.isFinite(n) ? '—' : Math.round(n * 100) + '%';
    const seconds = ms => ap('sec', {s: new Intl.NumberFormat(lang(), {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(ms / 1000)});
    const nameOf = d => root.RelativePitchCourse.name(d, lang());
    const labelOf = d => nameOf(d) + ' (' + M.SHORT[d] + ')';
    const way = dir => dir === 'harmonic' ? tr('harmonicShort') : dir === 'down' ? '↓' : '↑';
    const modeName = mode => mode === 'cold' ? tr('cold') : ap(mode);
    const rowsNow = () => [...trials.values()];
    const blocksNow = () => [...sessions.values()];
    const ours = row => !!row && row.protocol === M.protocol && row.source === host.site && typeof row.id === 'string';

    function button(text, action, cls = 'secondary') {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.textContent = text;
        if (action) b.addEventListener('click', action);
        return b;
    }
    function intervalButton(d, action, prefix = '') {
        const b = button('', action);
        const code = document.createElement('span'), name = document.createElement('span');
        code.className = 'iv-code'; code.textContent = prefix + M.SHORT[d];
        name.className = 'iv-name'; name.textContent = nameOf(d);
        b.append(code, name);
        b.setAttribute('aria-label', labelOf(d));
        return b;
    }

    // ---- Sound: this site's instrument, two notes per question ----
    function stopVoices() {
        generation++;
        for (const voice of voices) { try { voice?.audioBufferSourceNode?.stop(); } catch (_) {} }
        voices = [];
        TrainingCore.cancelAudio();
    }
    async function playPair(reference, target, harmonic) {
        stopVoices();
        const token = generation, context = host.context;
        await Promise.all([context.state === 'running' ? undefined : context.resume(), host.loadInstrumentPreset(host.site)]);
        if (token !== generation || document.hidden || context.state !== 'running') throw Error('Playback interrupted');
        const at = context.currentTime + .06, second = harmonic ? at : at + .8, level = harmonic ? .55 : .75;
        voices = [host.queueInstrumentNote(host.site, reference, at, harmonic ? 1.3 : .62, level),
            host.queueInstrumentNote(host.site, target, second, harmonic ? 1.3 : .8, level)];
        return A.outputClock(context, Number.isFinite(voices[1]?.when) ? voices[1].when : second);
    }
    function disarm() {
        clearTimeout(deadlineTimer); deadline = null; pressedAt = null;
        if (initialized) $('Timer').hidden = true;
    }
    function stopSound() { ++audioToken; stopVoices(); clearTimeout(autoTimer); disarm(); }
    // As in focused AP practice: the touch time is compared with the estimated onset.
    function arm(row) {
        clearTimeout(deadlineTimer);
        const total = row.limitMs, left = deadline - performance.now();
        const bar = $('Timer'), fill = bar.firstElementChild;
        bar.hidden = false;
        fill.style.transition = 'none';
        fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, left / total)) + ')';
        void fill.offsetWidth;
        fill.style.transition = 'transform ' + Math.max(0, Math.round(left)) + 'ms linear';
        fill.style.transform = 'scaleX(0)';
        const check = () => {
            if (trial !== row || phase !== 'answer' || deadline === null) return;
            // A finger already on a button before the deadline still decides the answer.
            if (pressedAt !== null && pressedAt <= deadline && performance.now() - deadline < 800) {
                deadlineTimer = setTimeout(check, 60); return;
            }
            submit('timeout', deadline);
        };
        deadlineTimer = setTimeout(check, Math.max(0, left) + 30);
    }

    // ---- Records: a localStorage journal keeps the last tap until IndexedDB has it ----
    function save(store, row) {
        const copy = {...row}, key = kv('pending') + ':' + store + ':' + row.id, raw = JSON.stringify(copy);
        (store === 'trials' ? trials : sessions).set(copy.id, copy);
        try { localStorage.setItem(key, raw); } catch (_) {}
        pendingWrites = pendingWrites.then(async () => {
            const stored = await S.putRows(host.site, store, [copy], 'iv');
            if (stored !== false && localStorage.getItem(key) === raw) localStorage.removeItem(key);
        }).catch(TrainingCore.storageError);
    }
    function newer(store, incoming, existing) {
        if (!existing) return true;
        if (store === 'sessions') return !existing.completed && (incoming.completed || incoming.attempted > existing.attempted);
        const final = row => ['answered', 'timeout'].includes(row.result);
        if (final(existing)) return false;
        if (final(incoming)) return true;
        return (incoming.submittedAt || incoming.playedAt || 0) > (existing.submittedAt || existing.playedAt || 0) ||
            (incoming.replayed > existing.replayed && existing.submittedAt === null);
    }
    async function recoverJournal() {
        const prefix = kv('pending') + ':';
        let keys;
        try { keys = Object.keys(localStorage).filter(k => k.startsWith(prefix)); } catch (_) { return; }
        for (const key of keys) {
            const store = key.slice(prefix.length).split(':')[0];
            if (!['trials', 'sessions'].includes(store)) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            let item;
            try { item = JSON.parse(raw); } catch (_) { continue; }
            if (!ours(item)) continue;
            const map = store === 'trials' ? trials : sessions;
            if (newer(store, item, map.get(item.id))) {
                map.set(item.id, item);
                if (await S.putRows(host.site, store, [item], 'iv') === false) continue;
            }
            if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
        }
    }
    function updateSettings(changes) {
        const next = {...settings, ...changes};
        if (!M.validSettings(next, host.site) || !TrainingCore.write(kv('settings'), next)) { render(); return false; }
        settings = next; render();
        return true;
    }
    async function loadHistory() {
        await pendingWrites;
        const [rows, blocks] = await Promise.all(['trials', 'sessions'].map(store => S.allRows(host.site, store, 'iv')));
        trials.clear(); sessions.clear();
        for (const row of rows) if (ours(row)) trials.set(row.id, row);
        for (const block of blocks) if (ours(block)) sessions.set(block.id, block);
        await recoverJournal();
        const saved = read(kv('settings'));
        const merged = {...M.defaults(), ...(saved && typeof saved === 'object' ? saved : {})};
        settings = M.validSettings(merged, host.site) ? merged : M.defaults();
        settings.limit = M.answerWindow(settings.limit);  // 2.8.4: typed seconds kept in ms; null is no limit
    }
    const progress = () => M.promotion(rowsNow(), blocksNow(), settings);
    function introduce(d) {
        const evidence = progress();
        if (!evidence.ready || evidence.next !== d) return;
        phase = 'home'; lastBlock = null;
        updateSettings({known: [...settings.known, d]});
        $('Guide').open = true;
        $('Guide').scrollIntoView({block: 'nearest'});
    }

    // ---- Home ----
    function guide() {
        const box = $('Examples');
        const sounds = document.createElement('div'); sounds.className = 'af-notes';
        for (const d of [...settings.known].sort((a, b) => a - b)) sounds.append(intervalButton(d, () => example(d), '▶ '));
        box.replaceChildren(sounds);
    }
    async function example(d) {
        clearTimeout(autoTimer);
        const pair = M.pickPair(d, M.pitchPool(settings.octaves, host.site), settings.direction, null);
        if (!pair) { $('Notice').textContent = tr('rangeHint'); return; }
        const token = ++audioToken;
        try {
            await playPair(pair.reference, pair.target, pair.direction === 'harmonic');
            if (token !== audioToken) return;
            S.markPractice(host.site);
            TrainingTracker.activity('question');
            $('Notice').textContent = way(pair.direction) + ' ' + labelOf(d);
        } catch (_) { if (token === audioToken) $('Notice').textContent = tr('exampleAudioError'); }
    }
    function renderModes() {
        const pitches = M.pitchPool(settings.octaves, host.site), avail = M.available(pitches);
        const validCheck = avail.length >= 2, validPractice = validCheck && settings.known.every(d => avail.includes(d));
        $('RangeHint').hidden = validPractice; $('RangeHint').textContent = validPractice ? '' : tr('rangeHint');
        const report = M.checkReport(rowsNow(), blocksNow());
        $('Daily').textContent = report.last ? tr('lastCheck', {day: report.last.day, score: report.last.correct + '/' + report.last.total}) : tr('noCheck');
        const today = S.day(), checked = blocksNow().some(s => s.kind === 'cold' && s.completed && s.day === today);
        const preferred = checked ? 'learn' : 'cold';
        $('Modes').replaceChildren(...modes.map(mode => {
            const b = button('', () => start(mode), mode === preferred ? 'primary' : 'secondary');
            b.disabled = !(mode === 'cold' ? validCheck : validPractice);
            const title = document.createElement('strong'); title.textContent = modeName(mode);
            const hint = document.createElement('small');
            hint.textContent = mode === 'cold' ? tr('coldHelp') : mode === 'learn' ?
                tr(settings.responseMode === 'name' ? 'learnExact' : 'learnHelp', {n: settings.size}) : tr('conHelp', {n: settings.size});
            b.dataset.mode = mode; b.append(title, hint);
            return b;
        }));
        const windowMs = M.answerWindow(settings.limit);
        $('Rules').textContent = windowMs === null ? ap('rulesOff') :
            ap('rules', {s: ap('sec', {s: AnswerTimer.text(windowMs, document.documentElement.lang)})});
    }
    function renderEvidence() {
        const evidence = progress(), rows = rowsNow();
        $('Progress').textContent = tr('progress', {blocks: evidence.blocks, first: Math.min(...evidence.perSize.map(p => p.first)), outside: evidence.outside});
        $('Rates').textContent = tr('rates', {hit: evidence.blocks ? percent(evidence.hit) : '—', fa: percent(evidence.fa)});
        const report = M.checkReport(rows, blocksNow());
        $('Checks').textContent = tr('checks', {last: report.last ? report.last.correct + '/' + report.last.total : '—',
            hits: report.hits, total: report.total, days: report.days});
        const body = $('Stats'); body.replaceChildren();
        for (const d of M.SIZES) {
            const pool = rows.filter(r => r.size === d && M.attempted(r) && (M.exactTask(r) || M.isTarget(r)));
            const checks = pool.filter(r => r.kind === 'cold'), practice = pool.filter(r => r.kind !== 'cold');
            if (!settings.known.includes(d) && !checks.length && !practice.length) continue;
            const format = a => a.filter(r => M.first(r) && M.correct(r)).length + '/' + a.length;
            const row = document.createElement('tr');
            for (const value of [labelOf(d), format(practice), format(checks), new Set(checks.map(r => r.day)).size]) {
                const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
            }
            body.append(row);
        }
        $('Add').hidden = !evidence.ready;
        if (evidence.ready) $('Add').textContent = tr('newInterval', {interval: labelOf(evidence.next)});
    }
    function renderHome() {
        renderModes();
        $('Octaves').replaceChildren(...M.octaveChoices(host.site).map(o => {
            const on = settings.octaves.includes(o);
            const pitches = M.pitchPool([o], host.site), range = A.rangeText(pitches);
            const b = button(pitches.length === 12 ? String(o) : range, () => {
                updateSettings({octaves: on ? settings.octaves.filter(x => x !== o) : [...settings.octaves, o].sort((a, b) => a - b)});
                $('Octaves').querySelector('[data-octave="' + o + '"]')?.focus();
            });
            b.dataset.octave = String(o); b.title = range; b.setAttribute('aria-label', range);
            b.setAttribute('aria-pressed', String(on)); b.disabled = on && settings.octaves.length === 1;
            return b;
        }));
        $('Current').textContent = [...settings.known].sort((a, b) => a - b).map(nameOf).join(' · ');
        $('Picker').replaceChildren(...M.SIZES.map(d => {
            const on = settings.known.includes(d);
            const b = intervalButton(d, () => updateSettings({known: on ? settings.known.filter(x => x !== d) : [...settings.known, d]}));
            b.setAttribute('aria-pressed', String(on)); b.disabled = on && settings.known.length === 1;
            return b;
        }));
        for (const option of $('Direction').options) option.textContent = tr(option.value);
        $('Direction').value = settings.direction;
        $('Size').value = String(settings.size); $('Hit').value = settings.hit; $('Fa').value = settings.falseAlarm;
        $('Auto').checked = document.getElementById('autoNextCheck').checked;
        $('AutoText').textContent = host.text('autoNextText');
        $('Recognition').checked = settings.responseMode === 'set';
        $('Repeats').checked = settings.allowRepeats;
        const names = M.namesFor(settings.responseMode, settings.known, M.pitchPool(settings.octaves, host.site)).length;
        if (document.activeElement !== $('Limit')) $('Limit').value = AnswerTimer.text(settings.limit, document.documentElement.lang);
        $('Limit').placeholder = tr('limitNone');
        guide(); renderEvidence();
    }

    // ---- A block ----
    function summaryRecord(complete) {
        const items = session.rows, eligible = items.filter(M.attempted);
        const good = eligible.filter(r => M.first(r) && M.correct(r));
        return {id: session.id, protocol: M.protocol, source: host.site, kind: session.mode, started: session.started,
            day: session.day, finished: Date.now(), completed: complete,
            interrupted: !complete || items.some(r => ['interrupted', 'audio-error'].includes(r.result)),
            attempted: items.length, total: eligible.length, planned: session.plan.length, correct: good.length,
            medianRt: S.median(good.map(r => r.rtMs).filter(Number.isFinite)),
            known: [...session.known], responseMode: session.responseMode, allowRepeats: session.allowRepeats,
            direction: session.direction, octaves: [...session.octaves], limit: session.limit,
            limitMs: M.answerWindow(session.limit, session.names.length), timbre: host.site,
            late: items.filter(r => r.result === 'timeout').length};
    }
    function start(mode) {
        stopSound(); $('Notice').textContent = ''; $('Guide').open = false;
        const previous = M.intervalOf(TrainingCore.lastQuestion(host.site));
        const plan = M.plan(settings, mode, host.site, M.weights(rowsNow(), settings.known), previous);
        if (!plan.length) { renderHome(); return; }
        const pitches = M.pitchPool(settings.octaves, host.site);
        const responseMode = mode === 'cold' ? 'name' : settings.responseMode;
        const names = M.namesFor(responseMode, settings.known, pitches);
        session = {id: host.site + '-iv-' + (crypto.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2)),
            mode, started: Date.now(), day: S.day(), rows: [], plan, pitches, names, responseMode,
            known: mode === 'cold' ? [...names] : [...settings.known], direction: settings.direction,
            octaves: [...settings.octaves], limit: settings.limit, allowRepeats: settings.allowRepeats};
        lastBlock = null; trial = null; next();
    }
    function next() {
        if (!session) return;
        if (session.rows.length === session.plan.length) { finish(true); return; }
        stopSound(); $('Notice').textContent = ''; firstOnset = lastOnset = null;
        const previous = TrainingCore.lastQuestion(host.site), before = M.intervalOf(previous);
        const ordinal = session.rows.length;
        const pair = M.pickQuestion(session.plan[ordinal], session.pitches, session.direction, previous, session.known, session.allowRepeats);
        if (!pair) { finish(false); return; }
        const size = pair.size;
        session.plan[ordinal] = size;
        trial = {protocol: M.protocol, source: host.site, id: session.id + '-' + (ordinal + 1), sessionId: session.id,
            ordinal: ordinal + 1, kind: session.mode, known: [...session.known], responseMode: session.responseMode,
            allowRepeats: session.allowRepeats, size, direction: pair.direction, reference: pair.reference, target: pair.target,
            timbre: host.site, day: S.day(), previousSize: before, guess: null, correct: false, result: 'interrupted',
            replayed: 0, rtMs: null, assistedRtMs: null, timing: null, playedAt: null, submittedAt: null,
            limitMs: null, lateGuess: null};
        playQuestion(false);
    }
    async function playQuestion(replay) {
        if (!trial || !session || (replay && (phase !== 'answer' || session.mode === 'cold'))) return;
        clearTimeout(autoTimer);
        if (replay) {
            trial.replayed++; trial.result = 'assisted';
            disarm();  // a replayed pair is already assisted, so it is not timed
            save('trials', trial);
        }
        const row = trial;
        phase = 'loading'; render();
        const token = ++audioToken;
        try {
            const clock = await playPair(row.reference, row.target, row.direction === 'harmonic');
            if (token !== audioToken || row !== trial) return;
            if (!replay) {
                firstOnset = clock.when;
                row.playedAt = Math.round(Date.now() + clock.when - performance.now());
                row.day = S.day(new Date(row.playedAt)); row.timing = clock.method;
                row.limitMs = M.answerWindow(session.limit, session.names.length);
                save('trials', row);  // a reload before the answer leaves an excluded trial
            }
            lastOnset = clock.when;
            TrainingTracker.activity('question');
            await new Promise(resolve => setTimeout(resolve, Math.max(0, clock.when - performance.now())));
            if (token !== audioToken || row !== trial) return;
            if (document.hidden || host.context.state !== 'running') { invalidate('interrupted'); return; }
            if (!replay) host.remember(row.reference, row.target);
            S.markPractice(host.site);
            phase = 'answer'; render();
            if (!replay && row.limitMs !== null) { deadline = firstOnset + row.limitMs; arm(row); }
        } catch (_) { if (token === audioToken && row === trial) invalidate('audio-error'); }
    }
    function submit(guess, when) {
        if (phase !== 'answer' || !trial || when < lastOnset) return;
        // Past the window the pair counts as missed, whatever is chosen afterwards.
        const late = guess === 'timeout' || (deadline !== null && !trial.replayed && when > deadline);
        stopSound();
        if (late) {
            trial.guess = null; trial.result = 'timeout'; trial.correct = false;
            trial.lateGuess = guess === 'timeout' ? null : guess;
        } else {
            trial.guess = guess; trial.result = 'answered'; trial.correct = M.correct(trial);
        }
        trial.submittedAt = Date.now();
        if (trial.replayed) trial.assistedRtMs = Math.max(0, Math.round(when - lastOnset));
        else if (guess !== 'timeout') trial.rtMs = Math.max(0, Math.round(when - firstOnset));
        TrainingTracker.activity('answer');
        settle();
        if (document.getElementById('autoNextCheck').checked && (trial.kind !== 'learn' || trial.correct)) {
            autoTimer = setTimeout(() => { if (phase === 'done' && !document.hidden) next(); }, trial.kind === 'learn' ? 1300 : 550);
        }
    }
    function settle() {
        session.rows.push(trial); save('trials', trial);
        save('sessions', summaryRecord(session.rows.length === session.plan.length));
        phase = 'done'; render();
    }
    function invalidate(reason) {
        if (!session || !trial || !['loading', 'answer'].includes(phase)) return;
        stopSound();
        trial.result = reason; trial.correct = false; trial.submittedAt = Date.now(); settle();
    }
    function finish(complete = false, home = false) {
        if (!session) return;
        stopSound();
        if (trial && ['loading', 'answer'].includes(phase)) {
            trial.result = trial.replayed ? 'assisted' : 'interrupted'; trial.submittedAt = Date.now();
            save('trials', trial); session.rows.push(trial);
        }
        const all = complete || (session.rows.length === session.plan.length && session.rows.every(row => row.submittedAt !== null));
        save('sessions', summaryRecord(all));
        lastBlock = session; session = null; trial = null;
        phase = home ? 'home' : 'summary'; TrainingTracker.pause(); $('Notice').textContent = ''; render();
    }
    async function replayAnswer() {
        if (!trial || phase !== 'done') return;
        const row = trial, token = ++audioToken;
        try { await playPair(row.reference, row.target, row.direction === 'harmonic'); }
        catch (_) { if (token === audioToken) $('Notice').textContent = tr('exampleAudioError'); }
    }
    function answerLabel(answer) {
        return answer === 'out' ? tr('out') : answer === 'unsure' ? ap('unsure') : Number.isInteger(answer) ? labelOf(answer) : '—';
    }
    function renderRound() {
        const loading = phase === 'loading', done = phase === 'done';
        $('Index').textContent = modeName(session.mode) + ' · ' + trial.ordinal + ' / ' + session.plan.length;
        const named = () => way(trial.direction) + ' ' + labelOf(trial.size) + (M.exactTask(trial) || M.isTarget(trial) ? '' : ' · ' + tr('out'));
        const prompt = $('Prompt');
        if (loading) prompt.textContent = ap('wait');
        else if (!done) prompt.textContent = tr('choose');
        else if (trial.result === 'timeout') prompt.textContent = session.mode === 'learn' ? ap('tooSlow') + ' · ' + named() : ap('timeUp');
        else if (trial.result !== 'answered') prompt.textContent = ap(trial.result === 'audio-error' ? 'audioError' : 'interrupted');
        else if (session.mode !== 'learn') prompt.textContent = ap('recorded');
        else prompt.textContent = ap(trial.correct ? 'right' : 'wrong') + ' · ' + named() +
            (trial.replayed ? ' · ' + ap('aided') : Number.isFinite(trial.rtMs) ? ' · ' + seconds(trial.rtMs) : '');
        // 2.8.3: semitone numbers only, the same buttons whatever the learning set.
        const choices = [...M.available(session.pitches)];
        if (session.responseMode === 'set' && session.mode !== 'cold' && choices.some(d => !session.known.includes(d))) choices.push('out');
        choices.push('unsure');
        const buttons = choices.map(choice => {
            const b = button(Number.isInteger(choice) ? String(choice) : answerLabel(choice), null);
            b.dataset.answer = String(choice);
            b.disabled = phase !== 'answer';
            let touched = null;
            b.addEventListener('pointerdown', e => { touched = pressedAt = e.timeStamp; });
            b.addEventListener('pointercancel', () => { touched = pressedAt = null; });
            b.addEventListener('click', e => {
                const at = e.detail && touched !== null ? touched : e.timeStamp;
                pressedAt = null;
                submit(choice, Math.abs(at - performance.now()) < 60000 ? at : performance.now());
            });
            return b;
        });
        $('Answers').classList.toggle('af-naming', choices.length > 4);
        $('Answers').replaceChildren(...buttons); $('Answers').hidden = done;
        $('AnswerHint').hidden = done || !choices.includes('out');
        $('AnswerHint').textContent = tr('helpAnswer');
        $('Next').hidden = !done;
        $('Next').textContent = trial.ordinal === session.plan.length ? ap('results') : tr('next');
        if (phase !== 'answer') $('Timer').hidden = true;
        $('Fault').hidden = phase !== 'answer';
        $('Replay').hidden = session.mode === 'cold' || phase !== 'answer';
        $('AnswerSound').hidden = session.mode !== 'learn' || !done || !['answered', 'timeout'].includes(trial.result);
    }
    function renderSummary() {
        if (!lastBlock) return;
        const c = M.counts(lastBlock.rows), parts = [];
        $('SummaryTitle').textContent = modeName(lastBlock.mode) + ' · ' + lastBlock.rows.length + '/' + lastBlock.plan.length;
        if (lastBlock.mode === 'cold' || lastBlock.responseMode === 'name') parts.push(tr('named', {hits: c.named, total: c.total}));
        if (lastBlock.mode !== 'cold') parts.push(ap('summary', {hits: c.hits, total: c.targets, alarms: c.alarms, outside: c.outside, aided: c.assisted}));
        if (c.late) parts.push(ap('lateCount', {n: c.late}));
        const times = lastBlock.rows.filter(r => M.first(r) && M.correct(r)).map(r => r.rtMs).filter(Number.isFinite);
        if (times.length) parts.push(ap('medianTime', {s: seconds(S.median(times))}));
        $('Score').textContent = parts.join(' · ');
        const goHome = () => { stopSound(); phase = 'home'; lastBlock = null; $('Notice').textContent = ''; render(); };
        const actions = $('Continue'); actions.replaceChildren();
        const evidence = progress();
        if (evidence.ready) actions.append(button(tr('newInterval', {interval: labelOf(evidence.next)}), () => introduce(evidence.next), 'primary'));
        if (lastBlock.mode === 'cold') actions.append(button(ap('learn'), () => start('learn'), 'primary'));
        actions.append(button(ap('finish'), goHome, lastBlock.mode === 'cold' ? 'secondary' : 'primary'));
        if (lastBlock.mode === 'learn') actions.append(button(ap('consolidate'), () => start('consolidate')));
        $('Review').replaceChildren(...lastBlock.rows.map(row => {
            const li = document.createElement('li');
            li.textContent = row.ordinal + ' · ' + way(row.direction) + ' ' + labelOf(row.size) + ' · ' +
                (M.scored(row) ? ap('answer') + ' ' + answerLabel(row.guess) +
                    (row.replayed ? ' · ' + ap('aided') : Number.isFinite(row.rtMs) ? ' · ' + seconds(row.rtMs) : '') :
                    row.result === 'timeout' ? ap('tooSlow') + (row.lateGuess === null || row.lateGuess === undefined ? '' :
                        ' · ' + ap('answer') + ' ' + answerLabel(row.lateGuess)) :
                    ap(row.result === 'audio-error' ? 'audioError' : 'interrupted'));
            return li;
        }));
    }
    function render() {
        if (!visible || !settings) return;
        $('Instrument').textContent = ap(host.site) + ' · ' + A.rangeText(session?.pitches || M.pitchPool(settings.octaves, host.site));
        $('Home').hidden = phase !== 'home'; $('Round').hidden = !session; $('Summary').hidden = phase !== 'summary';
        document.querySelector('.app-shell').classList.toggle('focus-round', !!session);
        if (session) renderRound();
        else if (phase === 'home') renderHome();
        else if (phase === 'summary') renderSummary();
    }
    async function route() {
        const open = location.hash === '#iv';
        if (open === visible) return;
        const token = ++screenToken;
        visible = open;
        const shell = document.querySelector('.app-shell');
        if (!open) {
            stopSound(); if (session) finish(false, true);
            TrainingTracker.pause(); phase = 'home'; lastBlock = null; settings = null;
            if (location.hash !== '#ap') shell.classList.remove('focus-open', 'focus-round');
            $('Panel').hidden = true; host.onExit?.(); return;
        }
        host.onEnter();
        $('Panel').hidden = false; $('Home').hidden = $('Round').hidden = $('Summary').hidden = true;
        shell.classList.add('focus-open');
        $('Notice').textContent = ''; $('Guide').open = false;
        await loadHistory(); if (token !== screenToken || !visible) return;
        phase = 'home'; translate(); window.scrollTo(0, 0);
    }
    function translate() {
        if (!initialized) return;
        $('Entry').textContent = tr('focus'); $('Title').textContent = tr('focus');
        $('Panel').querySelectorAll('[data-iv]').forEach(el => { el.textContent = tr(el.dataset.iv); });
        render();
    }

    // ---- Backup ----
    function exportBackup() {
        const blob = new Blob([JSON.stringify({format: 'focused-interval', version: 1, site: host.site, settings,
            trials: rowsNow(), sessions: blocksNow()})], {type: 'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'intervals-' + host.site + '-' + S.day() + '.json';
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    function validBackup(data) {
        if (data?.format !== 'focused-interval' || data.version !== 1 || data.site !== host.site ||
            !M.validSettings({...M.defaults(), ...data.settings}, host.site) || !Array.isArray(data.trials) || !Array.isArray(data.sessions)) return false;
        const base = r => ours(r) && r.id.startsWith(host.site + '-iv-') && typeof r.day === 'string' && modes.includes(r.kind) && M.validSet(r.known);
        return data.sessions.every(s => base(s) && typeof s.completed === 'boolean' && Number.isFinite(s.started) &&
                Number.isInteger(s.attempted) && Number.isInteger(s.planned) && s.attempted <= s.planned) &&
            data.trials.every(r => base(r) && Number.isInteger(r.size) && r.size >= 1 && r.size <= 12 &&
                Number.isInteger(r.reference) && Number.isInteger(r.target) && Math.abs(r.target - r.reference) === r.size &&
                ['up', 'down', 'harmonic'].includes(r.direction) && Number.isInteger(r.replayed) && r.replayed >= 0 &&
                ['answered', 'assisted', 'interrupted', 'audio-error', 'timeout'].includes(r.result));
    }
    async function importBackup(file) {
        if (!file || phase !== 'home') return;
        const token = screenToken;
        try {
            if (file.size > 64 * 1024 * 1024) throw Error();
            const data = JSON.parse(await file.text());
            if (!validBackup(data) || token !== screenToken || phase !== 'home') throw Error();
            for (const [key, map] of [['trials', trials], ['sessions', sessions]]) {
                const fresh = data[key].filter(r => newer(key, r, map.get(r.id)));
                if (fresh.length && await S.putRows(host.site, key, fresh, 'iv') === false) throw Error();
                fresh.forEach(r => map.set(r.id, r));
            }
            if (token !== screenToken || phase !== 'home') return;
            updateSettings({...M.defaults(), ...data.settings});
            $('Notice').textContent = ap('importOk');
        } catch (_) { if (visible) $('Notice').textContent = tr('importBad'); }
    }
    function init(options) {
        host = options; initialized = true;
        $('Add').onclick = () => { const evidence = progress(); if (evidence.ready) introduce(evidence.next); };
        for (const [id, key] of [['Size', 'size'], ['Hit', 'hit'], ['Fa', 'falseAlarm']]) {
            $(id).onchange = () => { updateSettings({[key]: Number($(id).value)}); $(id).value = settings[key]; };
        }
        $('Direction').onchange = () => { updateSettings({direction: $('Direction').value}); $('Direction').value = settings.direction; };
        $('Repeats').onchange = () => updateSettings({allowRepeats: $('Repeats').checked});
        $('Recognition').onchange = () => updateSettings({responseMode: $('Recognition').checked ? 'set' : 'name'});
        $('Limit').onchange = () => { updateSettings({limit: AnswerTimer.parse($('Limit').value, settings.limit)});
            $('Limit').value = AnswerTimer.text(settings.limit, document.documentElement.lang); render(); };
        $('Auto').onchange = () => {
            const original = document.getElementById('autoNextCheck'); original.checked = $('Auto').checked;
            original.dispatchEvent(new Event('change'));
        };
        $('Next').onclick = () => { if (phase === 'done') next(); };
        $('Replay').onclick = () => playQuestion(true);
        $('Fault').onclick = () => invalidate('audio-error');
        $('AnswerSound').onclick = replayAnswer;
        $('End').onclick = () => finish();
        $('Backup').onclick = exportBackup; $('Restore').onclick = () => $('File').click();
        $('File').onchange = () => { importBackup($('File').files[0]); $('File').value = ''; };
        function hide() {
            if (!visible) return;
            clearTimeout(autoTimer);
            if (session) invalidate('interrupted');
            stopSound(); TrainingTracker.pause();
        }
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) hide();
            else if (visible && phase === 'home' && settings) renderModes();
        });
        host.context.addEventListener('statechange', () => {
            if (visible && host.context.state !== 'running' && phase === 'answer') invalidate('interrupted');
        });
        window.addEventListener('pagehide', hide);
        window.addEventListener('hashchange', route);
        translate(); route();
    }
    function leaveInstrument() {
        if (session) finish(false, true);
        else if (initialized) stopSound();
        return pendingWrites;
    }
    root.IntervalFocus = {init, translate, leaveInstrument, busy: () => !!session};
})(window);
