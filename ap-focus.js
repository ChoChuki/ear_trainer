(function (root) {
    'use strict';
    const M = APFocusModel, S = APPitchScience;
    const $ = id => document.getElementById('focus' + id);
    const modes = ['cold','learn','consolidate'];
    let host, sound, settings, session = null, trial = null, lastBlock = null;
    let phase = 'home', visible = false, initialized = false, screenToken = 0, audioToken = 0;
    let autoTimer, pendingWrites = Promise.resolve(), firstOnset = null, lastOnset = null;
    // Answer window of the current question (performance-clock time) and its timer.
    let deadline = null, deadlineTimer, pressedAt = null, pendingReset = null;
    // Last labelled sound (example, "Hear the answer" or learning feedback). A block without
    // feedback that starts soon afterwards opens with the long reset.
    let labelledAt = 0;
    let guideInstrument, guideNote, displayInstrument, evidence, hasPastTraining, lastExample = null;
    const trials = new Map(), sessions = new Map();
    const kv = k => 'ap-focus-' + k + '-' + host.site;
    const tr = (key, args) => APFocusCopy.t(host.language(), key, args);
    const read = key => {try {return JSON.parse(localStorage.getItem(key));} catch (_) {return null;}};
    const percent = n => n === null ? '—' : Math.round(n * 100) + '%';
    const seconds = ms => tr('sec',{s:new Intl.NumberFormat(host.language(),{minimumFractionDigits:1,maximumFractionDigits:1}).format(ms / 1000)});
    const LABEL_MEMORY_MS = 5 * 60000;
    const firstSoundToday = () => {
        const at = S.lastPracticeAt(host.site);
        return at === null || S.day(new Date(at)) !== S.day();
    };
    function button(text, action, cls = 'secondary') {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.textContent = text;
        b.addEventListener('click', action);
        return b;
    }
    function save(store, row) {
        const copy = {...row}, key = kv('pending') + ':' + store + ':' + row.id;
        const raw = JSON.stringify(copy);
        (store === 'trials' ? trials : sessions).set(copy.id, copy);
        // Keep the last tap if Safari closes before the IndexedDB transaction commits.
        try { localStorage.setItem(key, raw); } catch (_) {}
        pendingWrites = pendingWrites.then(async () => {
            const stored = await S.putRows(host.site,store,[copy]);
            if (stored !== false && localStorage.getItem(key) === raw) localStorage.removeItem(key);
        }).catch(TrainingCore.storageError);
    }
    function newer(store, incoming, existing) {
        if (!existing) return true;
        if (store === 'sessions') {
            return !existing.completed && (incoming.completed || incoming.attempted > existing.attempted);
        }
        const final = row => row.result === 'answered' || row.result === 'timeout';
        if (final(existing)) return false;
        if (final(incoming)) return true;
        return (incoming.submittedAt || incoming.playedAt || 0) > (existing.submittedAt || existing.playedAt || 0) ||
            (incoming.replayed > existing.replayed && existing.submittedAt === null);
    }
    async function recoverJournal() {
        const prefix = kv('pending') + ':';
        let keys;
        try {keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));} catch (_) {return;}
        for (const key of keys) {
            const store = key.slice(prefix.length).split(':')[0];
            if (!['trials','sessions'].includes(store)) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            let item;
            try {item = JSON.parse(raw);} catch (_) {continue;}
            if (!M.isFocus(item) || item.source !== host.site) continue;
            const map = store === 'trials' ? trials : sessions;
            if (newer(store,item,map.get(item.id))) {
                map.set(item.id,item);
                if (await S.putRows(host.site,store,[item]) === false) continue;
            }
            if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
        }
    }
    function updateSettings(changes) {
        const next = {...settings, ...changes};
        if (!M.validSettings(next,host.site) || !TrainingCore.write(kv('settings'), next)) return;
        settings = next;
        guideNote = settings.known.includes(guideNote) ? guideNote : settings.known.at(-1);
        render();
    }
    async function loadHistory() {
        await pendingWrites;
        const [rows, blocks] = await Promise.all(['trials','sessions'].map(store => S.allRows(host.site,store)));
        trials.clear(); sessions.clear();
        for (const row of rows) if (M.isFocus(row)) trials.set(row.id,row);
        for (const block of blocks) if (M.isFocus(block)) sessions.set(block.id,block);
        await recoverJournal();
        hasPastTraining = rows.length > 0 || blocks.length > 0 || trials.size > 0;
        const saved = read(kv('settings'));
        if (M.validSettings(saved,host.site)) settings = {...M.defaults(), ...saved};
        else {
            const oldLevel = read('ap-course-v1-' + host.site)?.level;
            const previous = blocks.filter(s => ['learn','cold'].includes(s.kind) && (M.validSet(s.known) || Number.isInteger(s.level)))
                .sort((a,b) => b.started - a.started)[0];
            const lastTrial = rows.filter(r => ['learn','cold'].includes(r.kind) && Number.isInteger(r.level))
                .sort((a,b) => b.submittedAt - a.submittedAt)[0];
            const level = oldLevel ?? previous?.level ?? lastTrial?.level;
            const known = !oldLevel && M.validSet(previous?.known) ? previous.known :
                Number.isInteger(level) && level >= 1 && level <= 12 ? S.learned(level) : [5];
            settings = M.defaults(known);
        }
    }
    function progress() {
        return M.promotion([...trials.values()], [...sessions.values()], settings, host.site);
    }
    function introduce(pc) {
        if (!progress().ready || progress().next !== pc) return;
        guideNote = pc; guideInstrument = host.site;
        phase = 'home'; lastBlock = null;
        updateSettings({known:[...settings.known, pc]});
        $('Guide').open = true;
        $('Guide').scrollIntoView({block:'nearest'});
    }
    function guide() {
        const box = $('Examples'); box.replaceChildren();
        const instruments = document.createElement('div'); instruments.className = 'af-actions';
        for (const inst of [host.site, M.otherInstrument(host.site)]) {
            const b = button(tr(inst), () => {sound.stop(); guideInstrument = inst; guide();});
            b.setAttribute('aria-pressed', String(guideInstrument === inst)); instruments.append(b);
        }
        box.append(instruments);
        const names = document.createElement('div'); names.className = 'af-notes';
        for (const pc of settings.known) {
            const b = button(M.notes[pc], () => {guideNote = pc; guide();});
            b.setAttribute('aria-pressed', String(guideNote === pc)); names.append(b);
        }
        box.append(names);
        const sounds = document.createElement('div'); sounds.className = 'af-example';
        for (const midi of M.pitchPool(settings.octaves,guideInstrument).filter(p => p % 12 === guideNote)) {
            sounds.append(button('▶ ' + M.label(midi), () => demo(guideInstrument, midi)));
        }
        if (!sounds.children.length) sounds.textContent = tr('rangeHint');
        box.append(sounds);
        if (guideInstrument !== host.site && settings.share === 0) {
            box.append(button(tr('mix20'), () => updateSettings({share:.2}), 'primary'));
        }
    }
    async function demo(instrument, pitch) {
        clearTimeout(autoTimer);
        const token = ++audioToken;
        try {
            await sound.play(instrument,pitch);
            if (token !== audioToken) return;
            lastExample = pitch; labelledAt = Date.now();
            S.markPractice(host.site); TrainingTracker.activity('ap-learning');
            $('Notice').textContent = tr(instrument) + ' · ' + M.label(pitch);
            if (phase === 'home') renderModes();
        } catch (_) {if (token === audioToken) $('Notice').textContent = tr('exampleAudioError');}
    }
    function renderModes() {
        const fresh = !hasPastTraining && S.lastPracticeAt(host.site) === null;
        const cold = firstSoundToday(), preferred = cold && !fresh ? 'cold' : 'learn';
        $('Daily').textContent = tr(fresh ? 'firstVisit' : cold ? 'coldToday' : 'warmToday');
        const primary = M.pitchPool(settings.octaves,host.site);
        const practice = settings.share ? M.pitchPool(settings.octaves,host.site,true) : primary;
        const validPrimary = M.playable(primary,settings.known), validPractice = M.playable(practice,settings.known);
        const hints = [];
        if (practice.length !== primary.length) hints.push(tr('mixRange',{range:M.rangeText(practice) || '—'}));
        if (!validPrimary || !validPractice) hints.push(tr('rangeHint'));
        // Successive notes can only stay more than an octave apart across three octaves.
        else if (practice.at(-1) - practice[0] < 35) hints.push(tr('jumpHint'));
        $('RangeHint').hidden = !hints.length; $('RangeHint').textContent = hints.join(' · ');
        $('Modes').replaceChildren(...modes.map(mode => {
            const b = button('', () => start(mode), mode === preferred ? 'primary' : 'secondary');
            b.disabled = !(mode === 'cold' ? validPrimary : validPractice);
            const title = document.createElement('strong'); title.textContent = tr(mode);
            const hint = document.createElement('small');
            hint.textContent = tr({cold:'coldHelp',learn:'learnHelp',consolidate:'conHelp'}[mode], {n:settings.size});
            b.dataset.mode = mode; b.append(title,hint); return b;
        }));
        const limitMs = M.answerWindow(settings.limit, settings.known.length);
        $('Rules').textContent = limitMs === null ? tr('rulesOff') : tr('rules',{s:seconds(limitMs)});
    }
    function renderEvidence() {
        evidence = progress();
        $('Progress').textContent = tr('progress',{blocks:evidence.blocks,first:Math.min(...evidence.perNote.map(p => p.first)),outside:evidence.outside});
        $('Rates').textContent = tr('rates',{hit:evidence.blocks ? percent(evidence.hit) : '—',fa:percent(evidence.fa)});
        const oct = $('FilterOctave').value;
        const list = [...trials.values()].filter(r => M.attempted(r) && r.timbre === displayInstrument &&
            (oct === 'all' || Math.floor(r.pitch / 12) - 1 === Number(oct)));
        const daily = list.filter(r => r.kind === 'cold' && r.firstOfDay);
        $('First').textContent = tr('dayFirst',{hits:daily.filter(r => M.first(r) && M.correct(r)).length,n:daily.length});
        const body = $('Stats'); body.replaceChildren();
        for (const pc of M.order) {
            const pool = list.filter(r => r.pitch % 12 === pc && M.isTarget(r));
            if (!settings.known.includes(pc) && !pool.length) continue;
            const checks = pool.filter(r => r.kind === 'cold'), practice = pool.filter(r => r.kind !== 'cold');
            const format = a => a.filter(r => M.first(r) && M.correct(r)).length + '/' + a.length;
            const row = document.createElement('tr');
            for (const value of [M.notes[pc],format(practice),format(checks),new Set(checks.map(r => r.day)).size]) {
                const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
            }
            body.append(row);
        }
        $('Add').hidden = !evidence.ready;
        if (evidence.ready) $('Add').textContent = tr('newNote',{note:M.notes[evidence.next]});
    }
    function renderHome() {
        renderModes();
        $('Octaves').replaceChildren(...M.octaveChoices(host.site).map(o => {
            const on = settings.octaves.includes(o);
            const pitches = M.pitchPool([o],host.site), range = M.rangeText(pitches);
            const b = button(pitches.length === 12 ? String(o) : range, () => {
                updateSettings({octaves:on ? settings.octaves.filter(x => x !== o) : [...settings.octaves,o].sort((a,b)=>a-b)});
                $('Octaves').querySelector('[data-octave="' + o + '"]')?.focus();
            });
            b.dataset.octave = String(o); b.title = range; b.setAttribute('aria-label',range);
            b.setAttribute('aria-pressed',String(on)); b.disabled = on && settings.octaves.length === 1;
            return b;
        }));
        $('Current').textContent = settings.known.map(pc => M.notes[pc]).join(' · ');
        $('Picker').replaceChildren(...M.notes.map((name,pc) => {
            const on = settings.known.includes(pc);
            const b = button(name, () => updateSettings({known:on ? settings.known.filter(x => x !== pc) : [...settings.known,pc]}));
            b.setAttribute('aria-pressed', String(on)); b.disabled = on && settings.known.length === 1; return b;
        }));
        $('Share').value = String(settings.share); $('Size').value = String(settings.size);
        $('Hit').value = settings.hit; $('Fa').value = settings.falseAlarm;
        $('Auto').checked = document.getElementById('autoNextCheck').checked;
        $('AutoText').textContent = host.text('autoNextText');
        $('Mask').checked = document.getElementById('apMaskCheck').checked;
        for (const option of $('Limit').options) {
            const ms = M.answerWindow(option.value, settings.known.length);
            option.textContent = ms === null ? tr('limitOff') : tr(option.value === 'strict' ? 'limitStrict' : 'limitRelaxed',{s:seconds(ms)});
        }
        $('Limit').value = settings.limit;
        $('Invite').hidden = settings.known.length < 2 || settings.share > 0;
        $('Invitation').textContent = tr('secondHint',{instrument:tr(M.otherInstrument(host.site))});
        $('FilterTimbre').replaceChildren(...[host.site,M.otherInstrument(host.site)].map(inst => new Option(tr(inst),inst)));
        $('FilterTimbre').value = displayInstrument;
        renderOctaveFilter();
        guide(); renderEvidence();
    }
    function renderOctaveFilter() {
        const filter = $('FilterOctave'), old = filter.value, choices = M.octaveChoices(displayInstrument);
        filter.replaceChildren(new Option(tr('all'),'all'),...choices.map(o => new Option(String(o),String(o))));
        filter.value = old !== 'all' && choices.includes(Number(old)) && old !== '' ? old : 'all';
    }
    function summaryRecord(complete) {
        const items = session.rows;
        const eligible = items.filter(M.attempted);
        const good = eligible.filter(r => M.first(r) && M.correct(r));
        const times = good.map(r => r.rtMs).filter(Number.isFinite).sort((a,b) => a-b);
        return {id:session.id, protocol:M.protocol, sourceVersion:M.sourceVersion, source:host.site, kind:session.mode,
            started:session.started, day:session.day, finished:Date.now(), completed:complete,
            interrupted:!complete || items.some(r => ['interrupted','audio-error'].includes(r.result)), attempted:items.length, total:eligible.length,
            planned:session.plan.length, correct:good.length, medianRt:times.length ? times[Math.floor(times.length/2)] : null,
            known:[...settings.known], level:settings.known.length, share:session.mode === 'cold' ? 0 : settings.share, timbre:host.site,
            octaves:[...settings.octaves], effectiveRange:[session.pitches[0],session.pitches.at(-1)],
            relative:items.filter(r => r.result === 'relative').length,
            late:items.filter(r => r.result === 'timeout').length, limit:settings.limit,
            limitMs:M.answerWindow(settings.limit,settings.known.length), resetOn:$('Mask').checked,
            eligible:items.some(r => r.firstOfDay && r.kind === 'cold' && M.first(r))};
    }
    function stopSound() {++audioToken; sound.stop(); clearTimeout(autoTimer); disarm();}
    function disarm() {
        clearTimeout(deadlineTimer); deadline = null; pressedAt = null;
        if (initialized) $('Timer').hidden = true;
    }
    // A visible countdown: names that take longer than the window are worked out, not heard.
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
    function start(mode) {
        stopSound(); $('Notice').textContent = ''; $('Guide').open = false;
        const weights = Object.fromEntries(APMemory.due(host.site,settings.known).map(p => [p.pc,TrainingCore.weight(p)]));
        const previous = TrainingCore.lastQuestion(host.site)?.target;
        const plan = M.plan(settings,mode,host.site,weights,previous);
        if (!plan.length) {renderHome(); return;}
        session = {id:host.site + '-focus-' + (crypto.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2)),
            mode, started:Date.now(), day:S.day(), rows:[], plan, pitches:M.pitchPool(settings.octaves,host.site,mode !== 'cold' && settings.share > 0)};
        lastBlock = null; trial = null; next();
    }
    function next() {
        if (!session) return;
        if (session.rows.length === session.plan.length) {finish(true); return;}
        stopSound(); $('Notice').textContent = ''; firstOnset = lastOnset = null;
        const tone = session.plan[session.rows.length];
        const prev = TrainingCore.lastQuestion(host.site)?.target ?? null;
        const pitch = M.pickMidi(tone.pc,session.pitches,prev,settings.known,lastExample);
        trial = {protocol:M.protocol,sourceVersion:M.sourceVersion,source:host.site,
            id:session.id + '-' + (session.rows.length + 1),sessionId:session.id,ordinal:session.rows.length + 1,
            kind:session.mode,timbre:tone.instrument,level:settings.known.length,known:[...settings.known],pitch,
            sampleId:M.sampleId(tone.instrument,pitch),day:S.day(),previousPitch:prev,guess:null,correct:false,
            result:'interrupted',repair:false,replayed:0,rtMs:null,assistedRtMs:null,timing:null,firstOfDay:false,
            eligibleCold:false,gapSincePracticeMs:null,playedAt:null,submittedAt:null,resetSoundOn:false,
            reset:null,limitMs:null,lateGuess:null,
            jump:Number.isInteger(lastExample ?? prev) ? Math.abs(pitch - (lastExample ?? prev)) : null};
        playQuestion(false);
    }
    async function playQuestion(replay) {
        if (!trial || !session || (replay && (phase !== 'answer' || session.mode === 'cold'))) return;
        clearTimeout(autoTimer);
        if (replay) {
            trial.replayed++; trial.result = 'assisted';
            disarm();  // a replayed note is already assisted, so it is not timed
            save('trials',trial);  // Keep a request for help even if the tab is closed before a response.
        }
        const row = trial;
        const mask = !replay && $('Mask').checked && (row.ordinal > 1 || !firstSoundToday());
        const long = mask && row.ordinal === 1 && session.mode !== 'learn' && labelledAt > 0 &&
            Date.now() - labelledAt < LABEL_MEMORY_MS;
        pendingReset = mask ? (long ? 'long' : 'short') : null;
        phase = 'loading'; render();
        const token = ++audioToken;
        try {
            const reset = mask ? {long, previous:lastExample ?? row.previousPitch,
                low:session.pitches[0], high:session.pitches.at(-1)} : null;
            const clock = await sound.play(row.timbre,row.pitch,reset);
            if (long) labelledAt = 0;
            if (token !== audioToken || row !== trial) return;
            const now = Date.now(), last = S.lastPracticeAt(host.site);
            if (!replay) {
                firstOnset = clock.when;
                row.playedAt = Math.round(now + clock.when - performance.now());
                row.day = S.day(new Date(row.playedAt));
                row.gapSincePracticeMs = last === null ? null : Math.max(0,row.playedAt - last);
                row.firstOfDay = row.kind === 'cold' && row.ordinal === 1 && firstSoundToday();
                row.eligibleCold = row.firstOfDay; row.timing = clock.method; row.resetSoundOn = mask;
                row.reset = pendingReset; row.limitMs = M.answerWindow(settings.limit,settings.known.length);
                save('trials',row); // A reload before the response leaves an excluded trial.
            }
            lastOnset = clock.when;
            TrainingTracker.activity(row.kind === 'learn' ? 'ap-learning' : 'ap-check');
            const delay = Math.max(0, clock.when - performance.now());
            await new Promise(resolve => setTimeout(resolve, delay));
            if (token !== audioToken || row !== trial) return;
            if (document.hidden || host.context.state !== 'running') {invalidate('interrupted'); return;}
            if (!replay) {host.remember(row.pitch); lastExample = null;}
            S.markPractice(host.site);
            pendingReset = null; phase = 'answer'; render();
            if (!replay && row.limitMs !== null) {deadline = firstOnset + row.limitMs; arm(row);}
        } catch (_) {if (token === audioToken && row === trial) invalidate('audio-error');}
    }
    function submit(guess, when) {
        if (phase !== 'answer' || !trial || when < lastOnset) return;
        // Past the window the note counts as missed, whatever is chosen afterwards.
        const late = guess === 'timeout' || (deadline !== null && !trial.replayed && when > deadline);
        stopSound();
        const inferred = !late && guess === 'relative';
        if (late) {
            trial.guess = null; trial.result = 'timeout'; trial.correct = false;
            trial.lateGuess = guess === 'timeout' ? null : guess;
        } else {
            trial.guess = inferred ? null : guess; trial.result = inferred ? 'relative' : 'answered'; trial.correct = M.correct(trial);
        }
        trial.submittedAt = Date.now();
        if (trial.replayed) trial.assistedRtMs = Math.max(0,Math.round(when - lastOnset));
        else if (guess !== 'timeout') trial.rtMs = Math.max(0,Math.round(when - firstOnset));
        if (session.mode === 'learn') labelledAt = Date.now();  // the name is shown now
        if (!inferred && trial.timbre === host.site && session.mode === 'learn') {
            const pc = trial.pitch % 12;
            if (M.isTarget(trial)) APMemory.record(host.site,pc,trial.correct,Date.now(),!M.first(trial),false);
            if (Number.isInteger(guess) && guess !== pc) APMemory.confuse(host.site,guess,pc);
        }
        TrainingTracker.activity('ap-answer');
        settle();
        if (document.getElementById('autoNextCheck').checked && (trial.kind !== 'learn' || trial.correct)) {
            autoTimer = setTimeout(() => {if (phase === 'done' && !document.hidden) next();}, trial.kind === 'learn' ? 1300 : 550);
        }
    }
    function settle() {
        session.rows.push(trial); save('trials',trial); save('sessions',summaryRecord(session.rows.length === session.plan.length));
        phase = 'done'; render();
    }
    function invalidate(reason) {
        if (!session || !trial || !['loading','answer'].includes(phase)) return;
        stopSound();
        trial.result = reason; trial.correct = false; trial.submittedAt = Date.now(); settle();
    }
    function finish(complete = false, home = false) {
        if (!session) return;
        stopSound();
        if (trial && ['loading','answer'].includes(phase)) {
            trial.result = trial.replayed ? 'assisted' : 'interrupted'; trial.submittedAt = Date.now();
            save('trials',trial); session.rows.push(trial);
        }
        const all = complete || (session.rows.length === session.plan.length && session.rows.every(row => row.submittedAt !== null));
        save('sessions',summaryRecord(all));
        lastBlock = session; session = null; trial = null;
        phase = home ? 'home' : 'summary'; TrainingTracker.pause(); $('Notice').textContent = ''; render();
    }
    function answerLabel(answer) {return answer === 'out' || answer === 'unsure' ? tr(answer) : Number.isInteger(answer) ? M.notes[answer] : '—';}
    function renderRound() {
        const loading = phase === 'loading', done = phase === 'done';
        $('Index').textContent = tr(session.mode) + ' · ' + trial.ordinal + ' / ' + session.plan.length;
        const prompt = $('Prompt');
        const named = () => M.label(trial.pitch) + (M.isTarget(trial) ? '' : ' (' + tr('out') + ')');
        if (loading) prompt.textContent = tr(pendingReset === 'long' ? 'clearing' : pendingReset ? 'resetting' : 'wait');
        else if (!done) prompt.textContent = tr('choose');
        else if (trial.result === 'relative') prompt.textContent = tr('relativeSaved') + (session.mode === 'learn' ? ' · ' + M.label(trial.pitch) : '');
        else if (trial.result === 'timeout') prompt.textContent = session.mode === 'learn' ? tr('tooSlow') + ' · ' + named() : tr('timeUp');
        else if (trial.result !== 'answered') prompt.textContent = tr(trial.result === 'audio-error' ? 'audioError' : 'interrupted');
        else if (session.mode !== 'learn') prompt.textContent = tr('recorded');
        else {
            prompt.textContent = tr(trial.correct ? 'right' : 'wrong') + ' · ' + named() +
                (trial.replayed ? ' · ' + tr('aided') : Number.isFinite(trial.rtMs) ? ' · ' + seconds(trial.rtMs) : '');
        }
        const choices = [...settings.known];
        if (choices.length < 12) choices.push('out');
        choices.push('unsure');
        const buttons = choices.map(choice => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary';
            b.textContent = answerLabel(choice); b.dataset.answer = String(choice);
            b.disabled = phase !== 'answer';
            let touched = null;
            b.addEventListener('pointerdown', e => {touched = pressedAt = e.timeStamp;});
            b.addEventListener('pointercancel', () => {touched = pressedAt = null;});
            b.addEventListener('click', e => {
                const at = e.detail && touched !== null ? touched : e.timeStamp;
                pressedAt = null;
                submit(choice,Math.abs(at - performance.now()) < 60000 ? at : performance.now());
            });
            return b;
        });
        $('Answers').replaceChildren(...buttons); $('Answers').hidden = done;
        $('AnswerHint').hidden = done || settings.known.length === 12;
        $('Next').hidden = !done;
        $('Next').textContent = tr(trial.ordinal === session.plan.length ? 'results' : 'next');
        if (phase !== 'answer') $('Timer').hidden = true;
        $('Fault').hidden = phase !== 'answer';
        $('Relative').hidden = phase !== 'answer';
        $('Replay').hidden = session.mode === 'cold' || phase !== 'answer';
        $('AnswerSound').hidden = session.mode !== 'learn' || !done || !['answered','relative','timeout'].includes(trial.result);
    }
    function renderSummary() {
        if (!lastBlock) return;
        const c = M.counts(lastBlock.rows);
        $('SummaryTitle').textContent = tr(lastBlock.mode) + ' · ' + lastBlock.rows.length + '/' + lastBlock.plan.length;
        $('Score').textContent = tr('summary',{hits:c.hits,total:c.targets,alarms:c.alarms,outside:c.outside,aided:c.assisted});
        const inferred = lastBlock.rows.filter(r => r.result === 'relative').length;
        if (inferred) $('Score').textContent += ' · ' + tr('relativeCount',{n:inferred});
        if (c.late) $('Score').textContent += ' · ' + tr('lateCount',{n:c.late});
        const times = lastBlock.rows.filter(r => M.first(r) && M.correct(r)).map(r => r.rtMs).filter(Number.isFinite).sort((a,b) => a-b);
        if (times.length) $('Score').textContent += ' · ' + tr('medianTime',{s:seconds(times[Math.floor(times.length/2)])});
        const goHome = () => {stopSound(); phase = 'home'; lastBlock = null; $('Notice').textContent = ''; render();};
        const actions = $('Continue'); actions.replaceChildren();
        const rec = progress();
        if (rec.ready) actions.append(button(tr('newNote',{note:M.notes[rec.next]}),() => introduce(rec.next),'primary'));
        if (lastBlock.mode === 'cold') actions.append(button(tr('learn'),() => start('learn'),'primary'));
        actions.append(button(tr('finish'),goHome,lastBlock.mode === 'cold' ? 'secondary' : 'primary'));
        if (lastBlock.mode === 'learn') actions.append(button(tr('consolidate'),() => start('consolidate')));
        $('Review').replaceChildren(...lastBlock.rows.map(row => {
            const li = document.createElement('li');
            li.textContent = row.ordinal + ' · ' + tr(row.timbre) + ' ' + M.label(row.pitch) + ' · ' +
                (M.scored(row) ? tr('answer') + ' ' + answerLabel(row.guess) +
                    (row.replayed ? ' · ' + tr('aided') : Number.isFinite(row.rtMs) ? ' · ' + seconds(row.rtMs) : '') :
                    row.result === 'timeout' ? tr('tooSlow') + (row.lateGuess === null || row.lateGuess === undefined ? '' :
                        ' · ' + tr('answer') + ' ' + (row.lateGuess === 'relative' ? tr('relative') : answerLabel(row.lateGuess))) :
                    tr(row.result === 'relative' ? 'relative' : row.result === 'audio-error' ? 'audioError' : 'interrupted'));
            return li;
        }));
    }
    function render() {
        if (!visible || !settings) return;
        $('Instrument').textContent = tr(host.site) + ' · ' + M.rangeText(session?.pitches || M.pitchPool(settings.octaves,host.site));
        $('Home').hidden = phase !== 'home'; $('Round').hidden = !session; $('Summary').hidden = phase !== 'summary';
        document.querySelector('.app-shell').classList.toggle('focus-round',!!session);
        if (session) renderRound();
        else if (phase === 'home') renderHome();
        else if (phase === 'summary') renderSummary();
    }
    async function route() {
        const open = location.hash === '#ap';
        if (open === visible) return;
        const token = ++screenToken;
        visible = open;
        if (!open) {
            stopSound(); if (session) finish(false,true);
            TrainingTracker.pause(); phase = 'home'; lastBlock = null; settings = null;
            document.querySelector('.app-shell').classList.remove('focus-open','focus-round');
            $('Panel').hidden = true; host.onExit(); return;
        }
        host.onEnter();
        $('Panel').hidden = false; $('Home').hidden = $('Round').hidden = $('Summary').hidden = true;
        document.querySelector('.app-shell').classList.add('focus-open');
        $('Notice').textContent = ''; $('Guide').open = false;
        await loadHistory(); if (token !== screenToken || !visible) return;
        guideNote = settings.known.at(-1); guideInstrument = displayInstrument = host.site;
        phase = 'home'; translate(); window.scrollTo(0,0);
    }
    function translate() {
        if (!initialized) return;
        $('Entry').textContent = tr('focus'); $('Title').textContent = tr('focus');
        $('Panel').querySelectorAll('[data-af]').forEach(el => {el.textContent = tr(el.dataset.af);});
        render();
    }
    function exportBackup() {
        const blob = new Blob([JSON.stringify({format:'focused-ap',version:1,site:host.site,settings,
            trials:[...trials.values()],sessions:[...sessions.values()]})],{type:'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'ap-' + host.site + '-' + S.day() + '.json';
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1500);
    }
    function validBackup(data) {
        if (data?.format !== 'focused-ap' || data.version !== 1 || data.site !== host.site || !M.validSettings(data.settings,host.site) ||
            !Array.isArray(data.trials) || !Array.isArray(data.sessions)) return false;
        const base = r => M.isFocus(r) && r.source === host.site && typeof r.id === 'string' &&
            r.id.startsWith(host.site + '-focus-') && typeof r.day === 'string' && modes.includes(r.kind) && M.validSet(r.known);
        const byId = new Map(data.sessions.map(s => [s?.id,s]));
        return data.sessions.every(s => base(s) && typeof s.completed === 'boolean' && Number.isFinite(s.started) &&
            Number.isInteger(s.attempted) && Number.isInteger(s.planned) && s.attempted <= s.planned) &&
            data.trials.every(r => {
                const block = byId.get(r.sessionId);
                const match = block ? r.kind === block.kind && r.sourceVersion === block.sourceVersion && M.sameSet(r.known,block.known) :
                    ['interrupted','assisted'].includes(r.result);
                return base(r) && match && Number.isInteger(r.ordinal) && r.ordinal >= 1 && r.ordinal <= 60 &&
                    r.id === r.sessionId + '-' + r.ordinal && M.supports(r.timbre,r.pitch,r.sourceVersion) &&
                    ['piano','violin'].includes(r.timbre) && r.sampleId === M.sampleId(r.timbre,r.pitch,r.sourceVersion) &&
                    ['answered','relative','assisted','interrupted','audio-error','timeout'].includes(r.result) && Number.isInteger(r.replayed) && r.replayed >= 0 &&
                    (r.result !== 'answered' || r.known.includes(r.guess) || r.guess === 'unsure' || r.guess === 'out');
            });
    }
    async function importBackup(file) {
        if (!file || phase !== 'home') return;
        const token = screenToken;
        try {
            if (file.size > 64 * 1024 * 1024) throw Error();
            const data = JSON.parse(await file.text());
            if (!validBackup(data) || token !== screenToken || phase !== 'home') throw Error();
            for (const [key, map] of [['trials',trials],['sessions',sessions]]) {
                const fresh = data[key].filter(r => newer(key,r,map.get(r.id)));
                if (fresh.length && await S.putRows(host.site,key,fresh) === false) throw Error();
                fresh.forEach(r => map.set(r.id,r));
            }
            if (token !== screenToken || phase !== 'home') return;
            updateSettings({...M.defaults(), ...data.settings});
            $('Notice').textContent = tr('importOk');
        } catch (_) {if (visible) $('Notice').textContent = tr('importBad');}
    }
    function init(options) {
        host = options; sound = APFocusAudio.create(host.context,host.loadInstrumentPreset,host.queueInstrumentNote); initialized = true;
        $('Add').onclick = () => {if (evidence?.ready) introduce(evidence.next);};
        $('Second').onclick = () => {
            guideInstrument = M.otherInstrument(host.site); $('Guide').open = true; $('Settings').open = true;
            guide(); $('Guide').scrollIntoView({block:'start'});
        };
        for (const [id,key] of [['Size','size'],['Share','share'],['Hit','hit'],['Fa','falseAlarm']]) {
            $(id).onchange = () => {updateSettings({[key]:Number($(id).value)}); $(id).value = settings[key];};
        }
        $('Limit').onchange = () => {updateSettings({limit:$('Limit').value}); $('Limit').value = settings.limit;};
        $('Auto').onchange = () => {
            const original = document.getElementById('autoNextCheck'); original.checked = $('Auto').checked;
            original.dispatchEvent(new Event('change'));
        };
        $('Mask').onchange = () => {
            const original = document.getElementById('apMaskCheck'); original.checked = $('Mask').checked;
            original.dispatchEvent(new Event('change'));
        };
        $('FilterTimbre').onchange = () => {displayInstrument = $('FilterTimbre').value; renderOctaveFilter(); renderEvidence();};
        $('FilterOctave').onchange = renderEvidence;
        $('Next').onclick = () => {if (phase === 'done') next();};
        $('Replay').onclick = () => playQuestion(true);
        $('Relative').onclick = () => submit('relative',performance.now());
        $('Fault').onclick = () => invalidate('audio-error');
        $('AnswerSound').onclick = () => {if (trial && phase === 'done') demo(trial.timbre,trial.pitch);};
        $('End').onclick = () => finish();
        $('Backup').onclick = exportBackup; $('Restore').onclick = () => $('File').click();
        $('File').onchange = () => {importBackup($('File').files[0]); $('File').value = '';};
        function hide() {
            if (!visible) return;
            clearTimeout(autoTimer);
            if (session) invalidate('interrupted');
            stopSound(); TrainingTracker.pause();
        }
        document.addEventListener('visibilitychange',() => {
            if (document.hidden) hide();
            else if (visible && phase === 'home' && settings) renderModes();
        });
        host.context.addEventListener('statechange',() => {
            if (visible && host.context.state !== 'running' && phase === 'answer') invalidate('interrupted');
        });
        window.addEventListener('pagehide',hide);
        window.addEventListener('hashchange',route);
        window.addEventListener('storage', e => {
            if (visible && phase === 'home' && settings && e.key?.startsWith('ap-last-practice-at-')) renderModes();
        });
        translate(); route();
    }
    function leaveInstrument() {
        if (session) finish(false, true);
        else stopSound();
        return pendingWrites;
    }
    root.APFocus = {init,translate,leaveInstrument,busy:() => !!session};
})(window);
