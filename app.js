const APP_VERSION = "3.0.3";
const pageOptions = new URLSearchParams(location.search);
const instrumentMode = pageOptions.get("instrument") === "piano" ? "piano" : "violin";
if (instrumentMode === "piano") {
    for (const [locale, copy] of Object.entries(PIANO_TRANSLATIONS)) Object.assign(TRANSLATIONS[locale], copy);
}
const PLAY_DURATION = 0.7;
const SUPPORTED_MIN_MIDI = instrumentMode === "violin" ? 55 : 21;
const SUPPORTED_MAX_MIDI = instrumentMode === "violin" ? 88 : 108;
const DEFAULT_MIN_MIDI = 60;
const DEFAULT_MAX_MIDI = 71;
const VIOLIN_OPEN_STRINGS = [{ name: "E5", midi: 76 }, { name: "A4", midi: 69 }, { name: "D4", midi: 62 }, { name: "G3", midi: 55 }];
const VIOLIN_MAX_POSITION = 12;
let violinDrawnWidth = 0; // scroller width the fingerboard was last drawn for (0 = drawn while hidden)
const VIOLIN_ROUND_CHROME = 160; // px above and around the board in the tallest round layout (RP locate)

const PITCH_NAMES = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
];

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);


const PIANO_ROWS = [[21,35], [36,47], [48,59], [60,71], [72,83], [84,95], [96,108]];
const PIANO_BLACK_RATIO = 0.70;
const elements = { keyboard: document.getElementById("keyboard"), keyboardScroller: document.getElementById("keyboardScroller") };
const keyElements = new Map(), activePointers = new Map(), activeVoices = new Map();
let minMidi=SUPPORTED_MIN_MIDI, maxMidi=SUPPORTED_MAX_MIDI, demoRunning=false, testActive=false;
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContextClass();
const player = typeof WebAudioFontPlayer === "function" ? new WebAudioFontPlayer() : null;

const presetFiles = { violin: "0400_JCLive_sf2_file", piano: "0000_JCLive_sf2_file" };
const presetLoads = new Map();
// Mean rendered pitch of each sample zone in cents against A4 = 440 Hz equal temperament,
// measured in Chromium (frame-wise over one second; the samples carry roughly ±11 cents of
// vibrato). Before the correction A4 sounded about 11 cents flat and neighbouring zones
// differed by up to 8 cents. Training sounds use the corrected copy; the Demo keeps the
// untouched samples. tests/claude_browser.cjs re-measures the result.
const VIOLIN_ZONE_CENTS = [[21,58,-4.0],[59,62,0.5],[63,66,-6.2],[67,67,-11.4],[68,70,-11.4],[71,71,-7.8],
    [72,74,-7.8],[75,78,-3.6],[79,79,3.0],[80,82,3.0],[83,86,-5.5],[87,87,2.0],[88,90,2.0]];
let violinTuned = null;
function demoPreset(instrument = instrumentMode) {
    return window["_tone_" + presetFiles[instrument]];
}
function selectedPreset(instrument = instrumentMode) {
    const original = demoPreset(instrument);
    if (instrument === "piano" || !original) return original;
    if (!violinTuned) {
        // Shallow copies share the decoded buffers; only the fine tuning differs.
        violinTuned = {...original, zones: original.zones.map((zone) => {
            const fix = VIOLIN_ZONE_CENTS.find(([low, high]) => zone.keyRangeLow === low && zone.keyRangeHigh === high);
            return fix ? {...zone, fineTune: (Number(zone.fineTune) || 0) - fix[2]} : zone;
        })};
    }
    return violinTuned;
}
async function decodeInstrument(instrument) {
    const file = presetFiles[instrument];
    if (!file || !player) throw new Error("Instrument unavailable");
    if (!demoPreset(instrument)) {
        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "./vendor/" + file + ".js";
            script.onload = resolve;
            script.onerror = () => {
                script.remove();
                reject(new Error("Instrument sample download failed"));
            };
            document.head.appendChild(script);
        });
    }
    if (!demoPreset(instrument)) throw new Error("Instrument preset missing");
    await TrainingCore.decodePreset(player, audioContext, "_tone_" + file);
}
function loadInstrumentPreset(instrument = instrumentMode) {
    if (!presetLoads.has(instrument)) {
        presetLoads.set(instrument, decodeInstrument(instrument).catch(error => {
            presetLoads.delete(instrument);
            throw error;
        }));
    }
    return presetLoads.get(instrument);
}
function queueInstrumentNote(instrument, midi, at, duration = PLAY_DURATION, volume = 0.75) {
    const voice = player.queueWaveTable(audioContext, audioContext.destination, selectedPreset(instrument), at, midi, duration, volume);
    if (!voice) throw new Error("Audio unavailable");
    return voice;
}

function noteName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    return `${PITCH_NAMES[midi % 12]}${octave}`;
}

function isWhiteKey(midi) {
    return WHITE_PITCH_CLASSES.has(midi % 12);
}

function whiteGlobalIndex(midi) {
    const octave = Math.floor(midi / 12);
    const pitchClass = midi % 12;
    const offsets = {
        0: 0,
        2: 1,
        4: 2,
        5: 3,
        7: 4,
        9: 5,
        11: 6
    };

    return octave * 7 + offsets[pitchClass];
}

function keyBounds(midi) {
    if (isWhiteKey(midi)) {
        const left = whiteGlobalIndex(midi);

        return {
            left,
            right: left + 1,
            black: false
        };
    }

    const pitchClass = midi % 12;
    const octave = Math.floor(midi / 12);
    const leftWhiteOffset = {
        1: 0,
        3: 1,
        6: 3,
        8: 4,
        10: 5
    }[pitchClass];

    const boundary = octave * 7 + leftWhiteOffset + 1;

    return {
        left: boundary - PIANO_BLACK_RATIO / 2,
        right: boundary + PIANO_BLACK_RATIO / 2,
        black: true
    };
}

function resetKeyboardColors() {
    elements.keyboard.querySelectorAll(".piano-key, .violin-note").forEach((element) => {
        element.classList.remove("correct", "wrong", "active", "reference");
    });
}
function markPitch(midi, className) {
    elements.keyboard.querySelectorAll(`[data-midi="${midi}"]`).forEach((key) => key.classList.add(className));
}
function violinPositionForMidi(midi) {
    // Prefer a playable position closest to an open string; one pitch may have several fingerings.
    const positions = VIOLIN_OPEN_STRINGS.map((string, row) => ({ row, step: midi - string.midi }))
        .filter(({ step }) => step >= 0 && step <= VIOLIN_MAX_POSITION);
    return positions.sort((a, b) => a.step - b.step)[0] || null;
}
function drawViolinFingerboard() {
    // Complete four-string vertical board: every open string and every 0-12
    // semitone offset is visible simultaneously. No horizontal pages or auto-jumps.
    const scroller = elements.keyboardScroller;
    const board = elements.keyboard;
    // Thirteen rows must fit below the round controls without scrolling on short
    // screens (browser toolbars included); rows shrink before anything is cut off.
    const header = 25, rowHeight = Math.max(28, Math.min(36, Math.floor((window.innerHeight - VIOLIN_ROUND_CHROME) / 13))), gutter = 25;
    // The board is laid out in pixels. While an AP or RP naming screen hides it the real
    // width is unknown: estimate it now and let the ResizeObserver redraw once it is shown.
    violinDrawnWidth = scroller.clientWidth;
    const viewport = Math.max(280, violinDrawnWidth || Math.min(window.innerWidth, 620) - 36);
    const cell = (viewport - gutter - 4) / VIOLIN_OPEN_STRINGS.length;
    board.replaceChildren();
    board.classList.add("violin-board");
    board.style.width = "100%";
    board.style.minWidth = "0";
    board.style.height = `${header + (VIOLIN_MAX_POSITION + 1) * rowHeight + 4}px`;
    board.style.removeProperty("--white-width");
    board.style.removeProperty("--black-width");
    keyElements.clear();
    scroller.style.overflowX = "hidden";
    scroller.style.overflowY = "visible";
    scroller.onscroll = null;
    scroller.scrollLeft = 0;
    for (let step = 0; step <= VIOLIN_MAX_POSITION; step++) {
        const number = document.createElement("span");
        number.className = "violin-step-label";
        number.textContent = String(step);
        number.style.top = `${header + rowHeight * step + 10}px`;
        board.appendChild(number);
    }
    VIOLIN_OPEN_STRINGS.slice().reverse().forEach((string, col) => {
        const x = gutter + col * cell;
        const line = document.createElement("div");
        line.className = "violin-string-line";
        line.style.left = `${x + cell/2}px`;
        line.style.top = `${header - 2}px`;
        line.style.height = `${(VIOLIN_MAX_POSITION + 1) * rowHeight + 3}px`;
        board.appendChild(line);
        const label = document.createElement("span");
        label.className = "violin-string-label";
        label.style.left = `${x + 2}px`;
        label.style.top = "1px";
        label.style.width = `${cell - 4}px`;
        label.textContent = string.name;
        board.appendChild(label);
        for (let step = 0; step <= VIOLIN_MAX_POSITION; step++) {
            const midi = string.midi + step;
            const key = document.createElement("button");
            key.type = "button";
            key.className = `violin-note${step === 0 ? " open-string" : ""}${!boardPitchEnabled(midi) ? " out-of-range" : ""}`;
            key.style.left = `${x + 3}px`;
            key.style.top = `${header + rowHeight * step + 2}px`;
            key.style.width = `${cell - 6}px`;
            key.style.height = `${rowHeight - 4}px`;
            key.dataset.midi = String(midi);
            key.dataset.string = string.name;
            key.dataset.position = String(step);
            key.setAttribute("aria-label", `${string.name} · ${t("violinPosition", {position:step})}`);
            const dot = document.createElement("span");
            dot.className = "violin-touch-dot";
            dot.setAttribute("aria-hidden", "true");
            key.appendChild(dot);
            key.addEventListener("pointerdown", event => {
                if (demoRunning) return;
                event.preventDefault();
                try { key.setPointerCapture(event.pointerId); } catch (_) { /* pointer already released */ }
                pressKey(midi,event.pointerId,AnswerTimer.stamp(event));
            });
            key.addEventListener("pointerup", event => releasePointer(event.pointerId));
            key.addEventListener("pointercancel", event => releasePointer(event.pointerId));
            key.addEventListener("lostpointercapture", event => releasePointer(event.pointerId));
            key.addEventListener("click", event => {if(event.detail!==0)return; const id=`violin-keyboard-${midi}`; pressKey(midi,id); if(activePointers.has(id)) setTimeout(()=>releasePointer(id),220);});
            board.appendChild(key);
            if (!keyElements.has(midi) || step < Number(keyElements.get(midi).dataset.position)) {
                keyElements.set(midi,key);
            }
        }
    });
}
function drawKeyboard() {
    if (instrumentMode === "violin") {
        drawViolinFingerboard();
        return;
    }
    const board = elements.keyboard;
    board.classList.remove("violin-board");
    board.classList.add("piano-board");
    board.replaceChildren();
    keyElements.clear();
    // Percentage geometry keeps the same keys and feedback across orientation,
    // viewport and panel changes; no resize-driven DOM redraw or scrolling.
    for (const [first, last] of PIANO_ROWS) {
        const row = document.createElement("div");
        row.className = "piano-row";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", `${noteName(first)}–${noteName(last)}`);
        const left = keyBounds(first).left;
        const span = keyBounds(last).right - left;
        for (let midi = first; midi <= last; midi++) {
            const bounds = keyBounds(midi);
            const key = document.createElement("button");
            key.type = "button";
            key.className = `piano-key ${bounds.black ? "black-key" : "white-key"}${!boardPitchEnabled(midi) ? " out-of-range" : ""}`;
            key.style.left = `${100 * (bounds.left - left) / span}%`;
            key.style.width = `${100 * (bounds.right - bounds.left) / span}%`;
            key.dataset.midi = String(midi);
            key.setAttribute("aria-label", noteName(midi));
            // C labels identify every octave without covering the playing surface.
            if (midi % 12 === 0 || midi === SUPPORTED_MIN_MIDI) {
                const label = document.createElement("span");
                label.className = "piano-note-label";
                label.textContent = noteName(midi);
                label.setAttribute("aria-hidden", "true");
                key.appendChild(label);
            }
            key.addEventListener("pointerdown", event => {
                if (demoRunning) return;
                event.preventDefault();
                try { key.setPointerCapture(event.pointerId); } catch (_) { /* pointer already released */ }
                pressKey(midi, event.pointerId,AnswerTimer.stamp(event));
            });
            key.addEventListener("pointerup", event => releasePointer(event.pointerId));
            key.addEventListener("pointercancel", event => releasePointer(event.pointerId));
            key.addEventListener("lostpointercapture", event => releasePointer(event.pointerId));
            // Keyboard/assistive technology activation; pointer clicks must not submit twice.
            key.addEventListener("click", event => {
                if (event.detail !== 0 || demoRunning) return;
                const pointerId = `piano-keyboard-${midi}`;
                pressKey(midi, pointerId);
                if (activePointers.has(pointerId)) window.setTimeout(() => releasePointer(pointerId), 220);
            });
            row.appendChild(key);
            keyElements.set(midi, key);
        }
        board.appendChild(row);
    }
}

async function ensureAudio() {
    if (audioContext.state !== "running") {
        await audioContext.resume();
    }
    if (audioContext.state !== "running") throw new Error("Audio unavailable");
}

function releaseAllKeys() {
    for (const pointerId of [...activePointers.keys()]) {
        releasePointer(pointerId);
    }
}

const masterGain = audioContext.createGain();
masterGain.connect(audioContext.destination);
const pendingVoices = new Set();

function playFreeVoice(midi) {
    releaseVoice(midi);
    const envelope = player.queueWaveTable(audioContext, masterGain, selectedPreset(), 0, midi, 8, 0.76);
    if (envelope) activeVoices.set(midi, envelope);
}

function releaseVoice(midi) {
    const voice = activeVoices.get(midi);
    if (!voice) return;
    voice.cancel();
    activeVoices.delete(midi);
}

function releasePointer(pointerId) {
    if (!activePointers.has(pointerId)) {
        return;
    }
    const midi = activePointers.get(pointerId);
    activePointers.delete(pointerId);
    if (![...activePointers.values()].includes(midi)) {
        releaseVoice(midi);
    }
    if (!testActive) renderHeldNotes();
}


/* Unified controller: both answer interfaces use this state machine. */
const U=UnifiedModel, S=APPitchScience, $=id=>document.getElementById(id);
const shell=document.querySelector('.app-shell');
const read=(k,d=null)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch(_){return d;}};
const get=(k,d=null)=>{try{return localStorage.getItem(k)??d;}catch(_){return d;}};
const write=(k,v)=>TrainingCore.write(k,v);
const id=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const cfgKey='ear-unified-settings-v1-'+instrumentMode;
const [low,high]=U.limits[instrumentMode];
const allOctaves=U.range(U.octave(low),U.octave(high));
const legacy=read('ap-focus-settings-'+instrumentMode,{}), saved=read(cfgKey,{});
function validChoice(a,allowed,def){const out=Array.isArray(a)?[...new Set(a.filter(n=>allowed.includes(n)))]:[];return out.length?out:[...def];}
let cfg={known:validChoice(saved.known??legacy.known,U.range(0,11),[5]),octaves:validChoice(saved.octaves??legacy.octaves,allOctaves,[4,5].filter(o=>allOctaves.includes(o))),
 blind:saved.blind===true, apDisplay:['instrument','buttons'].includes(saved.apDisplay)?saved.apDisplay:'buttons',rpDisplay:['instrument','buttons'].includes(saved.rpDisplay)?saved.rpDisplay:'buttons',
 apLimit:AnswerTimer.normalize(saved.apLimit===undefined?(legacy.limit===undefined?AnswerTimer.load():legacy.limit):saved.apLimit),rpLimit:AnswerTimer.normalize(saved.rpLimit===undefined?AnswerTimer.load():saved.rpLimit),
 min:Number.isInteger(saved.min)?Math.max(1,Math.min(high-low,saved.min)):1,max:saved.max===null?null:Number.isInteger(saved.max)?Math.max(1,Math.min(high-low,saved.max)):Math.min(12,high-low),
 direction:['both','higher','lower'].includes(saved.direction)?saved.direction:'both',auto:saved.auto===undefined?get('ear-auto-next','1')==='1':!!saved.auto,mask:saved.mask===undefined?get('ear-ap-mask-v2','1')==='1':!!saved.mask};
let mode=location.hash==='#ap'?'single':location.hash==='#iv'?'interval':['single','interval','free'].includes(pageOptions.get('mode'))?pageOptions.get('mode'):'single';
let rpLo=low,rpHi=high, ready=false, phase='idle', session=null, trial=null, generation=0, nextTimer=null, pickName=null,pickOctave=null,pickNameAt=null,onset=null,deadline=null;
let pendingSound=null, currentLanguage='en', historyGeneration=0, summarySession=null, importBusy=false;
const answerClock=AnswerTimer.createClock($('answerTimer'));
const journalPrefix='ear-unified-pending-v1:';
let writeQueue=Promise.resolve();
const saveConfig=()=>write(cfgKey,cfg);
const language=()=>{const l=get('earTrainerLanguage')||get(instrumentMode==='piano'?'pitchTrainerLanguage':'violinEarTrainerLanguage')||navigator.language;return l?.startsWith('zh')?'zh-TW':UNIFIED_LANGS.includes(l)?l:UNIFIED_LANGS.includes(l?.split('-')[0])?l.split('-')[0]:'en';};
function tr(k){const a=UNIFIED_COPY[k];return a?a[UNIFIED_LANGS.indexOf(currentLanguage)]||a[0]:TRANSLATIONS[currentLanguage]?.[k]??TRANSLATIONS.en[k]??k;}
function t(key,args={}){let result=tr(key);for(const [name,value] of Object.entries(args))result=result.replaceAll('{'+name+'}',String(value));return result;}
function label(m){return U.names[m%12]+U.octave(m);}
function msg(text,cls=''){ $('answerText').textContent=text;$('answerText').className=cls; }
function status(key){$('status').textContent=tr(key);}
function button(text,fn){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=text;b.addEventListener('click',event=>fn(event));return b;}
function option(select,value,text){const o=document.createElement('option');o.value=String(value);o.textContent=text;select.append(o);return o;}
function display(){return mode==='single'?cfg.apDisplay:cfg.rpDisplay;}
function limit(){return mode==='single'?cfg.apLimit:cfg.rpLimit;}
function currentPool(){return U.pitches(instrumentMode,cfg.octaves);}
function hasOutside(pitches,known){return pitches.some(m=>!known.includes(m%12));}
// Both instrument drills allow post-answer audition, including pitches
// outside the question range. A blind AP test withholds all pitch cues
// until the session is stopped.
function boardReview(){return testActive&&session?.display==='instrument'&&!session.blind&&phase==='done';}
function idleBoardPlay(){return !testActive&&(mode==='free'||display()==='instrument');}
function boardPitchEnabled(midi){if(!testActive||!session||boardReview())return true;return session.mode==='single'?session.pitches.includes(midi):midi>=session.lo&&midi<=session.hi;}
function updateBoardRange(){for(const b of elements.keyboard.querySelectorAll('[data-midi]')){const enabled=boardPitchEnabled(Number(b.dataset.midi));b.classList.toggle('out-of-range',!enabled);b.disabled=testActive&&(!enabled||(phase!=='answer'&&!boardReview()));}}
function toggleChoice(key,value,allowed){if(testActive)return;const current=cfg[key];if(current.includes(value)&&current.length===1)return;cfg[key]=(current.includes(value)?current.filter(n=>n!==value):[...current,value]).filter(n=>allowed.includes(n)).sort((a,b)=>a-b);saveConfig();renderSettings();}
function renderSettings(){
 $('modeSelect').value=mode;$('displayRow').hidden=mode==='free';$('displaySelect').value=display();$('apSettings').hidden=mode!=='single';$('rpSettings').hidden=mode!=='interval';$('commonSettings').hidden=mode==='free';$('maskRow').hidden=mode!=='single';
 $('learningNotes').replaceChildren(...U.names.map((n,pc)=>{const b=button(n,()=>toggleChoice('known',pc,U.range(0,11)));b.dataset.pc=pc;b.setAttribute('aria-pressed',String(cfg.known.includes(pc)));return b;}));
 $('otherHint').hidden=!hasOutside(currentPool(),cfg.known);
 $('octaves').replaceChildren(...U.range(0,8).map(o=>{const b=button(String(o),()=>toggleChoice('octaves',o,allOctaves));b.dataset.octave=o;b.disabled=!allOctaves.includes(o);b.setAttribute('aria-pressed',String(cfg.octaves.includes(o)));return b;}));
 $('blindCheck').checked=cfg.blind;$('autoNextCheck').checked=cfg.auto;$('maskCheck').checked=cfg.mask;$('directionSelect').value=cfg.direction;
 $('minIntervalSelect').value=String(cfg.min);$('maxIntervalSelect').value=cfg.max===null?'unlimited':String(cfg.max);$('maxIntervalSelect').options[0].textContent=tr('unlimited');
 $('startNote').value=String(rpLo);$('endNote').value=String(rpHi);$('rangeLabel').textContent=label(rpLo)+'–'+label(rpHi);
 $('answerLimitSelect').value=AnswerTimer.text(limit(),currentLanguage);$('answerLimitSelect').placeholder='∞';
 validate();render();
}
function validate(){const error=mode==='single'&&!U.apPoolValid(currentPool(),cfg.known)?'rangeError':mode==='interval'&&!U.rpPoolValid(U.rpGroups(rpLo,rpHi,cfg.min,cfg.max,cfg.direction))?'pairError':null;
 $('configError').hidden=!error;$('configError').textContent=error?tr(error):'';$('playButton').disabled=!ready||!!error||importBusy;return !error;}
function translate(){document.documentElement.lang=currentLanguage;for(const e of document.querySelectorAll('[data-i]'))e.textContent=tr(e.dataset.i);$('instrumentLabel').textContent=tr('instrument');$('languageLabel').textContent=t('language');$('audioReload').textContent=t('audioReload');$('updateButton').textContent=t('updateReady');for(const o of $('instrumentSelect').options)o.textContent=t(o.value);TrainingTracker.setLanguage(currentLanguage);status(ready?'ready':'loading');renderSettings();if(summarySession)showSummary(summarySession);if($('statistics').open)refreshHistory();}
function render(){
 shell.classList.toggle('training-round',testActive);shell.classList.toggle('board-test',testActive&&display()==='instrument');
 $('settingsCard').hidden=testActive;$('playButton').hidden=!testActive&&mode==='free';$('playButton').textContent=tr(testActive?'stop':'start');$('playButton').classList.toggle('danger',testActive);$('playButton').classList.toggle('primary',!testActive);if(testActive)$('playButton').disabled=false;
 $('nextButton').hidden=!testActive||!['done','error'].includes(phase);$('nextButton').textContent=tr('next');
 $('replayButton').hidden=!testActive||!!session?.blind||!['answer','done','error'].includes(phase);$('replayButton').textContent=tr('replay');
 $('keyboardCard').hidden=testActive?session.display!=='instrument':!idleBoardPlay();$('answerCard').hidden=!testActive&&mode!=='free';$('buttonBoard').hidden=!testActive||session.display!=='buttons';
 $('extraAnswers').hidden=!testActive||session.mode!=='single';$('relativeButton').hidden=!session?.blind;
 for(const e of $('extraAnswers').querySelectorAll('button'))e.disabled=phase!=='answer';
 // Other is an explicit AP answer, not an uncertainty or skip action.
 // Keep it in a fixed position; disable only when no outside pitch can occur.
 const outside=session?.mode==='single'&&hasOutside(session.pitches,session.known);
 $('otherButton').disabled=phase!=='answer'||!outside;
 $('otherButton').title=tr(outside?'otherHint':'otherUnavailable');
 $('apNameKeys').hidden=mode!=='single';$('apOctaveKeys').hidden=mode!=='single';$('intervalAnswers').hidden=mode!=='interval';
 $('sessionScore').textContent=testActive?session.blind?`${tr('questions')} ${session.total}`:`${tr('score')} ${session.correct}/${session.total}`:'';
 if(!testActive){$('answerTimer').hidden=true;if(mode==='free')msg(tr('freeHint'));}
 if(testActive){for(const b of $('buttonBoard').querySelectorAll('button'))b.disabled=phase!=='answer'||b.dataset.available==='false';}
 updateBoardRange();
}
function buildAnswers(){
 $('apNameKeys').replaceChildren();$('apOctaveKeys').replaceChildren();$('intervalAnswers').replaceChildren();
 if(session.mode==='single'){
  for(const [pc,name] of U.names.entries()){const b=button(name,e=>pickAP('name',pc,answerStamp(e)));b.dataset.pc=pc;b.classList.toggle('learning',session.known.includes(pc));$('apNameKeys').append(b);}
  for(const o of U.range(0,8)){const b=button(String(o),e=>pickAP('octave',o,answerStamp(e)));b.dataset.octave=o;b.dataset.available=String(session.octaves.includes(o));$('apOctaveKeys').append(b);}
 }else if(session.display==='buttons'){
  for(const d of [...new Set(U.rpGroups(session.lo,session.hi,session.min,session.max,session.direction).map(g=>g.distance))]){const b=button(String(d),e=>submit(d,null,null,answerStamp(e)));b.dataset.interval=d;$('intervalAnswers').append(b);}
 }
}
function clearFeedback(){resetKeyboardColors();for(const b of $('buttonBoard').querySelectorAll('button'))b.classList.remove('picked','correct','wrong');}
function markReference(){if(session?.mode==='interval'&&session.display==='instrument'&&trial)markPitch(trial.reference,'reference');}
function cancelAudio(){generation++;clearTimeout(nextTimer);nextTimer=null;answerClock.stop();deadline=null;onset=null;TrainingCore.cancelAudio();player?.cancelQueue(audioContext);pendingSound=null;}
function renderHeldNotes(){const notes=[...new Set(activePointers.values())];resetKeyboardColors();for(const p of notes)markPitch(p,'active');if(!testActive&&mode==='free')msg(notes.length?notes.map(label).join('  '):tr('freeHint'));}
function freePlay(midi,pointerId){if(!ready||!idleBoardPlay())return;TrainingTracker.activity('free-play');S.markLabel(instrumentMode);TrainingCore.rememberLabel(midi);activePointers.set(pointerId,midi);if(!activeVoices.has(midi)&&!pendingVoices.has(midi)){pendingVoices.add(midi);ensureAudio().then(()=>{pendingVoices.delete(midi);if(idleBoardPlay()&&[...activePointers.values()].includes(midi)&&!activeVoices.has(midi))playFreeVoice(midi);}).catch(()=>{pendingVoices.delete(midi);status('audioError');});}renderHeldNotes();}
function clearPreviewMark(){for(const b of elements.keyboard.querySelectorAll('.active'))b.classList.remove('active');}
// As in the legacy instrument drill, a tap after grading plays just that
// pitch. Explicit review takes priority over automatic replay/auto-next;
// preserve the original score, reference and correction markers.
async function previewBoardPitch(midi){if(!ready||!boardReview())return;
 session.reviewPaused=true;cancelAudio();clearPreviewMark();const token=generation;
 try{await ensureAudio();if(!canContinue(token)||!boardReview())return;
  queueInstrumentNote(instrumentMode,midi,audioContext.currentTime+.02,PLAY_DURATION);
  markPitch(midi,'active');S.markLabel(instrumentMode);TrainingCore.rememberLabel(midi);TrainingTracker.activity('free-play');
  setTimeout(()=>{if(generation===token)clearPreviewMark();},PLAY_DURATION*1000+60);
 }catch(_){if(generation===token)status('audioError');}
}
function pressKey(midi,pointerId,when=performance.now()){if(!testActive){freePlay(midi,pointerId);return;}if(boardReview()){previewBoardPitch(midi);return;}if(phase!=='answer'||session.display!=='instrument'||!boardPitchEnabled(midi))return;
 if(session.mode==='single')submit(midi%12,U.octave(midi),null,when);
 else if(midi===trial.reference)replay();else submit(Math.abs(midi-trial.reference),null,midi,when);}
function answerStamp(e){const pressed=answerClock.pressed();return e?.detail!==0&&Number.isFinite(pressed)&&performance.now()-pressed<=800?pressed:AnswerTimer.stamp(e);}
function pickAP(kind,value,now=performance.now()){if(phase!=='answer'||session?.mode!=='single')return;if(deadline!==null&&now>deadline){submit('timeout');return;}
 if(kind==='name'){if(!session.known.includes(value)){pickNameAt=now;submit(value,null,null,now);return;}pickName=value;pickNameAt=now;}else pickOctave=value;
 if(pickName!==null&&pickOctave!==null){submit(pickName,pickOctave,null,now);return;}
 for(const b of $('apNameKeys').children)b.classList.toggle('picked',Number(b.dataset.pc)===pickName);
 for(const b of $('apOctaveKeys').children)b.classList.toggle('picked',Number(b.dataset.octave)===pickOctave);
}
function saveRow(namespace,store,row){const copy={...row},key=journalPrefix+namespace+':'+instrumentMode+':'+store+':'+row.id,raw=JSON.stringify(copy);
 try{localStorage.setItem(key,raw);}catch(_){}
 writeQueue=writeQueue.then(async()=>{if(await S.putRows(instrumentMode,store,[copy],namespace)!==false&&get(key)===raw)localStorage.removeItem(key);}).catch(TrainingCore.storageError);
}
async function recoverJournals(){
 for(const namespace of ['ap','iv'])for(const site of ['piano','violin']){
  const prefixes=[journalPrefix+namespace+':'+site+':', (namespace==='ap'?'ap-focus':'interval-focus')+'-pending-'+site+':','iv-focus-pending-'+site+':'];
  let keys=[];try{keys=Object.keys(localStorage);}catch(_){}
  for(const key of keys){const prefix=prefixes.find(p=>key.startsWith(p));if(!prefix)continue;const store=key.slice(prefix.length).split(':')[0],raw=get(key),row=read(key);if(!['trials','sessions'].includes(store)||!row||typeof row.id!=='string')continue;
   const rows=await S.allRows(site,store,namespace),old=rows.find(r=>r.id===row.id);if(!old||(!['answered','timeout','relative'].includes(old.result)&&!old.completed&&(row.submittedAt||row.finished||row.playedAt||0)>=(old.submittedAt||old.finished||old.playedAt||0))){if(await S.putRows(site,store,[row],namespace)===false)continue;}try{if(get(key)===raw)localStorage.removeItem(key);}catch(_){}
  }
 }
}
function saveSession(done=false,interrupted=false){if(!session||!session.total)return;const a=session;saveRow(a.mode==='single'?'ap':'iv','sessions',{id:a.id,protocol:a.mode==='single'?9:1,sourceVersion:APFocusModel.sourceVersion,source:instrumentMode,unified:1,kind:a.blind?'cold':'learn',started:a.started,day:S.day(new Date(a.started)),finished:Date.now(),completed:done,interrupted,attempted:a.total,total:a.total,correct:a.correct,planned:null,known:[...a.known],octaves:a.octaves??[],limitMs:a.limit,timbre:instrumentMode,responseMode:'set',answerInterface:a.display,direction:a.direction,range:a.mode==='interval'?[a.lo,a.hi]:[a.pitches[0],a.pitches.at(-1)]});}
function canContinue(token){return testActive&&generation===token&&!document.hidden&&audioContext.state==='running';}
const delay=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
async function start(){if(!ready||testActive||mode==='free'||!validate())return;
 releaseAllKeys();$('sessionSummary').hidden=true;summarySession=null;
 const pitches=currentPool();session={id:instrumentMode+(mode==='single'?'-focus-':'-iv-')+id(),mode,display:display(),blind:mode==='single'&&cfg.blind,started:Date.now(),known:mode==='single'?[...cfg.known]:U.range(cfg.min,Math.min(cfg.max??rpHi-rpLo,rpHi-rpLo)),octaves:[...cfg.octaves],pitches,lo:rpLo,hi:rpHi,min:cfg.min,max:cfg.max,direction:cfg.direction,limit:limit(),mask:cfg.mask,auto:cfg.auto,rows:[],recent:[],total:0,correct:0,ordinal:0};
 trial=null;testActive=true;phase=session.mode==='single'?'countdown':'starting';msg(session.mode==='single'?tr('prepare')+' · 3':tr('listen'));clearFeedback();buildAnswers();render();updateBoardRange();
 const token=++generation;
 try{await ensureAudio();if(session?.mode==='single'){for(let i=3;i>=1;i--){if(!canContinue(token))return;msg(tr('prepare')+' · '+i);await delay(1000);}}if(canContinue(token))newQuestion();}catch(_){audioFailure(token);}
}
function newQuestion(){if(!testActive||!session||!['countdown','starting','done','error'].includes(phase))return;cancelAudio();session.reviewPaused=false;clearFeedback();pickName=pickOctave=pickNameAt=null;
 const previous=TrainingCore.lastQuestion(instrumentMode);let q;
 if(session.mode==='single'){const pitch=U.drawAP(session.pitches,session.known,previous?.target,session.recent,session.blind,TrainingCore.recentLabel(instrumentMode));if(pitch!==null)q={pitch,target:pitch,reference:null};}
 else {const pair=U.drawRP(U.rpGroups(session.lo,session.hi,session.min,session.max,session.direction,previous),previous);if(pair)q=pair;}
 if(!q){trial=null;phase='error';msg(tr(session.mode==='single'?'rangeError':'pairError'),'bad');render();return;}
 const a=session,ordinal=++a.ordinal;trial={...q,id:a.id+'-'+ordinal,sessionId:a.id,ordinal,protocol:a.mode==='single'?9:1,sourceVersion:APFocusModel.sourceVersion,source:instrumentMode,timbre:instrumentMode,unified:1,kind:a.blind?'cold':'learn',known:[...a.known],learned:[...a.known],responseMode:'set',answerInterface:a.display,poolSize:a.mode==='single'?new Set(a.pitches.map(p=>p%12)).size:undefined,day:S.day(),previousPitch:previous?.target??null,guess:null,correct:false,octaveCorrect:null,guessOctave:null,replayed:0,rtMs:null,nameRtMs:null,assistedRtMs:null,playedAt:null,submittedAt:null,limitMs:a.limit,result:'interrupted',eligibleCold:false,firstRecorded:false,resetNoteCount:0};
 if(a.mode==='single')trial.sampleId=APFocusModel.sampleId(instrumentMode,q.pitch);
 else trial.direction=q.direction==='higher'?'up':'down';
 playTrial(false);
}
function audioFailure(token){if(token!==generation||!testActive)return;cancelAudio();phase='error';msg(tr('audioError'),'bad');render();}
async function playTrial(replaying){if(!session||!trial||!testActive)return;cancelAudio();const token=generation,row=trial,a=session;phase='loading';pickName=pickOctave=pickNameAt=null;clearFeedback();render();
 try{await ensureAudio();if(!canContinue(token))return;
  const last=S.lastPracticeAt(instrumentMode),rest=last===null||S.rested(last),mask=a.mode==='single'&&!replaying&&a.mask&&(a.ordinal>1||!rest);
  let at=audioContext.currentTime+.05;const firstNoteAt=at;
  if(mask){const n=6+Math.floor(Math.random()*3);row.resetNoteCount=n;row.resetSoundOn=true;msg(tr('interference'));at=TrainingCore.resetTones((m,t,d,v)=>queueInstrumentNote(instrumentMode,m,t,d,v),at,{previous:row.previousPitch,count:n})+TrainingCore.resetGap();}
  else msg(tr('listen'));
  if(a.mode==='interval'){queueInstrumentNote(instrumentMode,row.reference,at,.6);at+=.8;}
  const voice=queueInstrumentNote(instrumentMode,row.target,at);const clock=APFocusModel.outputClock(audioContext,voice.when??at);
  if(!replaying){row.playedAt=Math.round(Date.now()+clock.when-performance.now());row.timing=clock.method;row.gapSincePracticeMs=last===null?null:Math.max(0,row.playedAt-last);row.eligibleCold=a.blind&&a.ordinal===1&&!mask&&S.rested(last,row.playedAt);row.firstRecorded=a.blind&&a.ordinal===1&&!mask&&last===null;row.firstOfDay=a.blind&&a.ordinal===1&&(last===null||S.day(new Date(last))!==row.day);}
  TrainingTracker.activity(a.mode==='single'?'ap-learning':'question');
  // First audible sound (including interference) ends the rest period even if stopped before the target.
  const firstClock=APFocusModel.outputClock(audioContext,firstNoteAt);
  if(!await TrainingCore.waitForAudio(audioContext,audioContext.currentTime+(firstClock.when-performance.now())/1000,()=>canContinue(token))){audioFailure(token);return;}
  if(!canContinue(token)||trial!==row)return;
  // The first RP note is the public reference. Reveal its position at its
  // audible onset, not at the second note when the answer window opens.
  markReference();
  S.markPractice(instrumentMode);
  if(!await TrainingCore.waitForAudio(audioContext,audioContext.currentTime+(clock.when-performance.now())/1000,()=>canContinue(token))){audioFailure(token);return;}
  if(!canContinue(token)||trial!==row)return;
  if(!replaying){TrainingCore.rememberQuestion(instrumentMode,row.reference,row.target);a.recent.push(row.target);if(a.recent.length>4)a.recent.shift();}
  saveRow(a.mode==='single'?'ap':'iv','trials',row);
  onset=clock.when;deadline=a.limit===null?null:onset+a.limit;phase='answer';markReference();msg(tr(a.mode==='single'?(hasOutside(a.pitches,a.known)?(a.display==='buttons'?'apAnswer':'apBoardAnswer'):'answer'):(a.display==='buttons'?'rpAnswer':'rpBoard')));render();if(a.limit!==null)answerClock.start(onset,a.limit,()=>submit('timeout'));
 }catch(_){audioFailure(token);}
}
function feedbackText(row,a){const actual=a.mode==='single'?label(row.target):String(row.size)+' · '+label(row.reference)+' → '+label(row.target);const key=row.result==='timeout'?'timeout':row.correct?(row.octaveCorrect===false?'octaveWrong':'correct'):'wrong';return tr(key)+' · '+actual;}
function paintFeedback(row,a){
 if(a.mode==='single'){
  const actual=U.names[row.target%12];const nameKey=$('apNameKeys').querySelector(`[data-pc="${row.target%12}"]`);nameKey?.classList.add('correct');if(Number.isInteger(row.guess)&&row.guess!==row.target%12&&!row.correct)$('apNameKeys').querySelector(`[data-pc="${row.guess}"]`)?.classList.add('wrong');
  $('apOctaveKeys').querySelector(`[data-octave="${U.octave(row.target)}"]`)?.classList.add('correct');if(Number.isInteger(row.guessOctave)&&row.octaveCorrect===false)$('apOctaveKeys').querySelector(`[data-octave="${row.guessOctave}"]`)?.classList.add('wrong');
  if(Number.isInteger(row.guess)&&Number.isInteger(row.guessOctave)&&(!row.correct||row.octaveCorrect===false))markPitch(12*(row.guessOctave+1)+row.guess,'wrong');markPitch(row.target,'correct');
 }else {markReference();markPitch(row.target,'correct');if(row.guessMidi!==null&&row.guessMidi!==undefined&&!row.correct)markPitch(row.guessMidi,'wrong');$('intervalAnswers').querySelector(`[data-interval="${row.size}"]`)?.classList.add('correct');if(Number.isInteger(row.guess)&&!row.correct)$('intervalAnswers').querySelector(`[data-interval="${row.guess}"]`)?.classList.add('wrong');}
}
function submit(guess,octave=null,selectedMidi=null,now=performance.now()){if(!testActive||phase!=='answer'||!trial)return;const row=trial,a=session;const late=guess==='timeout'||(deadline!==null&&now>deadline),relative=guess==='relative';
 row.result=late?'timeout':relative?'relative':'answered';row.guess=late||relative?null:guess;row.guessOctave=late?null:octave;row.guessMidi=selectedMidi;row.partialName=late?pickName:null;row.nameRtMs=a.mode==='single'&&Number.isFinite(pickNameAt)?Math.max(0,Math.round(pickNameAt-onset)):a.mode==='single'&&!late?Math.max(0,Math.round(now-onset)):null;
 if(!late&&!relative){if(a.mode==='single')Object.assign(row,U.gradeAP(row.target,guess,octave,a.known));else row.correct=selectedMidi!==null?selectedMidi===row.target:guess===row.size;}
 if(!late){const rt=Math.max(0,Math.round(now-onset));if(row.replayed)row.assistedRtMs=rt;else row.rtMs=rt;}
 row.submittedAt=Date.now();cancelAudio();phase='done';a.total++;if(row.correct)a.correct++;a.rows.push({...row});saveRow(a.mode==='single'?'ap':'iv','trials',row);saveSession();TrainingTracker.activity('answer');
 let nextDelay=a.blind?420:row.correct&&row.octaveCorrect!==false?750:a.mode==='interval'?1850:1250;
 if(a.blind){msg(tr('recorded'));}else{msg(feedbackText(row,a),row.correct&&row.octaveCorrect!==false?'good':'bad');paintFeedback(row,a);S.markLabel(instrumentMode);TrainingCore.rememberLabel(row.target);
  // Restore the original Two Notes reinforcement: a correct answer also
  // replays the whole interval, with the same spacing as the question.
  // Preserve the existing correction playback for misses and all AP behavior.
  if(a.mode==='interval'||!row.correct||row.octaveCorrect===false){try{const at=audioContext.currentTime+.03;
   if(a.mode==='interval'&&row.correct){
    queueInstrumentNote(instrumentMode,row.reference,at,.6);
    const voice=queueInstrumentNote(instrumentMode,row.target,at+.8,PLAY_DURATION);
    // Allow the full feedback phrase to reach the output before auto-next.
    const end=APFocusModel.outputClock(audioContext,(voice.when??at+.8)+PLAY_DURATION);
    nextDelay=Math.max(2000,end.when-performance.now()+250);
   }else if(a.mode==='interval'){queueInstrumentNote(instrumentMode,row.reference,at,.55);queueInstrumentNote(instrumentMode,row.target,at+.7,.6);}else queueInstrumentNote(instrumentMode,row.target,at,.7);
  }catch(_){}}
 }
 render();if(a.auto){const token=generation;nextTimer=setTimeout(()=>{if(canContinue(token)&&phase==='done')newQuestion();},nextDelay);}
}
function replay(){if(!testActive||session?.blind||!trial)return;
 if(phase==='answer'){if(deadline!==null&&performance.now()>deadline){submit('timeout');return;}trial.replayed++;playTrial(true);}
 else if(phase==='error'){playTrial(false);}
 else if(phase==='done'){cancelAudio();clearPreviewMark();const token=generation;try{const at=audioContext.currentTime+.04;if(session.mode==='interval'){queueInstrumentNote(instrumentMode,trial.reference,at,.6);queueInstrumentNote(instrumentMode,trial.target,at+.8);}else queueInstrumentNote(instrumentMode,trial.target,at);S.markLabel(instrumentMode);TrainingCore.rememberLabel(trial.target);TrainingTracker.activity('answer');if(session.auto&&!session.reviewPaused)nextTimer=setTimeout(()=>{if(canContinue(token)&&phase==='done')newQuestion();},session.mode==='interval'?1800:1100);}catch(_){msg(tr('audioError'),'bad');}}
}
function stop(interrupted=false){if(!testActive)return;cancelAudio();releaseAllKeys();if(trial&&phase==='answer'){trial.result='interrupted';trial.submittedAt=Date.now();saveRow(session.mode==='single'?'ap':'iv','trials',trial);}saveSession(!interrupted,interrupted);TrainingTracker.pause();const done=session;testActive=false;phase='idle';session=null;trial=null;clearFeedback();render();summarySession=done;if(done.total)showSummary(done);status(interrupted?'interrupted':'ready');if($('statistics').open)refreshHistory();}
function percent(n,d){return d?`${n}/${d} (${Math.round(100*n/d)}%)`:'—';}
function line(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);}
function scoreLines(parent,rows,isAP){const attempts=rows.filter(r=>['answered','timeout','relative','assisted'].includes(r.result));if(!attempts.length){line(parent,tr('noHistory'));return;}
 const unassisted=attempts.filter(r=>!r.replayed);const hits=unassisted.filter(r=>r.correct);line(parent,`${tr('firstTry')}: ${percent(hits.length,unassisted.length)} · ${tr('assisted')}: ${attempts.length-unassisted.length}`);
 if(isAP){const set=r=>Array.isArray(r.learned)?r.learned:r.known;const pitch=r=>r.pitch??r.target;const usable=attempts.filter(r=>Array.isArray(set(r))&&Number.isInteger(pitch(r)));const targets=usable.filter(r=>set(r).includes(pitch(r)%12));const outside=usable.filter(r=>!set(r).includes(pitch(r)%12));line(parent,`${tr('hits')}: ${percent(targets.filter(r=>r.correct&&!r.replayed).length,targets.filter(r=>!r.replayed).length)}`);const byPc=U.range(0,11).map(pc=>{const group=targets.filter(r=>pitch(r)%12===pc);return group.length?`${U.names[pc]} ${percent(group.filter(r=>r.correct&&!r.replayed).length,group.filter(r=>!r.replayed).length)}`:null;}).filter(Boolean);if(byPc.length)line(parent,byPc.join(' · '));line(parent,`${tr('alarms')}: ${percent(outside.filter(r=>!r.replayed&&set(r).includes(r.guess)).length,outside.filter(r=>!r.replayed).length)}`);const placed=usable.filter(r=>r.octaveCorrect!==null&&r.octaveCorrect!==undefined&&r.correct&&!r.replayed);line(parent,`${tr('octaveScore')}: ${percent(placed.filter(r=>r.octaveCorrect).length,placed.length)}`);const rested=usable.filter(r=>r.eligibleCold);line(parent,`${tr('rested')}: ${percent(rested.filter(r=>r.correct&&!r.replayed).length,rested.length)}`);}
 const median=S.median(hits.map(r=>r.nameRtMs??r.rtMs).filter(Number.isFinite));if(Number.isFinite(median))line(parent,`${tr('latency')}: ${(median/1000).toFixed(2)} s`);
}
function showSummary(a){$('sessionSummary').hidden=false;const body=$('summaryBody');body.replaceChildren();scoreLines(body,a.rows,a.mode==='single');$('reviewDetails').hidden=!a.rows.length;$('reviewDetails').open=false;$('reviewList').replaceChildren(...a.rows.slice(-200).map(r=>{const li=document.createElement('li');const guessed=a.mode==='single'?(Number.isInteger(r.guess)?U.names[r.guess]+(r.guessOctave??''):r.guess==='out'?tr('other'):r.guess==='unsure'?tr('unsure'):'—'):(r.guess??'—');li.textContent=feedbackText(r,a)+' · '+guessed;return li;}));}
async function refreshHistory(){const token=++historyGeneration;await writeQueue;const [ap,iv,rp]=await Promise.all([S.allRows(instrumentMode,'trials'),S.allRows(instrumentMode,'trials','iv'),RelativePitchCourse.history(instrumentMode)]);if(token!==historyGeneration)return;const box=$('historyBody');box.replaceChildren();line(box,tr('historyNote'));const heading=document.createElement('strong');heading.textContent=tr('one');box.append(heading);scoreLines(box,ap,true);const h=document.createElement('strong');h.textContent=tr('two');box.append(h);scoreLines(box,iv,false);if(rp.records.length)line(box,tr('legacyRP')+': '+rp.records.length);}
async function exportHistory(){await writeQueue;const data={format:'ear-trainer-unified',version:1,created:Date.now(),data:{}};for(const site of ['piano','violin'])for(const ns of ['ap','iv','rp']){if(ns==='rp'){const rp=await RelativePitchCourse.history(site);data.data[site+':'+ns]={trials:rp.records.map((r,i)=>({...r,id:r.id??site+'-legacy-rp-trial-'+i})),sessions:rp.sessions.map((r,i)=>({...r,id:r.id??site+'-legacy-rp-session-'+i}))};}else data.data[site+':'+ns]={trials:await S.allRows(site,'trials',ns),sessions:await S.allRows(site,'sessions',ns)};}const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Ear-Trainer-'+S.day()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function importHistory(file){if(!file||testActive||importBusy)return;importBusy=true;validate();try{if(file.size>64*1024*1024)throw Error();const data=JSON.parse(await file.text());let groups;
 if(data.format==='ear-trainer-unified'&&data.version===1&&data.data&&typeof data.data==='object')groups=data.data;else if(['focused-ap','focused-interval'].includes(data.format)&&data.version===1&&['piano','violin'].includes(data.site))groups={[data.site+':'+(data.format==='focused-ap'?'ap':'iv')]:data};else throw Error();
 // Validate shape before writing; never overwrite an existing final record.
 for(const [key,g] of Object.entries(groups)){if(!/^(piano|violin):(ap|iv|rp)$/.test(key)||!g||!['trials','sessions'].every(store=>Array.isArray(g[store])&&g[store].every(r=>r&&typeof r==='object'&&typeof r.id==='string'&&r.id.length<250)))throw Error();}
 for(const [key,g] of Object.entries(groups)){const [site,ns]=key.split(':');for(const store of ['trials','sessions']){const existing=new Map((await S.allRows(site,store,ns)).map(r=>[r.id,r]));const rows=g[store].filter(r=>{const old=existing.get(r.id);return !old||(store==='trials'&&!['answered','relative','timeout'].includes(old.result)&&['answered','relative','timeout'].includes(r.result))||(store==='sessions'&&!old.completed&&Number(r.attempted)>Number(old.attempted));});if(rows.length&&await S.putRows(site,store,rows,ns)===false)throw Error();}}
 $('historyNotice').textContent=tr('backupOk');refreshHistory();}catch(_){$('historyNotice').textContent=tr('backupBad');}finally{importBusy=false;validate();$('importFile').value='';}}
function changeMode(next){if(testActive||!['single','interval','free'].includes(next))return;releaseAllKeys();cancelAudio();if(next==='interval'&&mode!=='interval'){rpLo=low;rpHi=high;}$('sessionSummary').hidden=true;summarySession=null;mode=next;renderSettings();}
function setup(){
 currentLanguage=language();$('appVersion').textContent=APP_VERSION;$('instrumentSelect').value=instrumentMode;$('languageSelect').value=currentLanguage;
 for(let p=low;p<=high;p++){option($('startNote'),p,label(p));option($('endNote'),p,label(p));}option($('maxIntervalSelect'),'unlimited',tr('unlimited'));for(let d=1;d<=high-low;d++){option($('minIntervalSelect'),d,d);option($('maxIntervalSelect'),d,d);}
 $('modeSelect').onchange=e=>changeMode(e.target.value);$('displaySelect').onchange=e=>{releaseAllKeys();cfg[mode==='single'?'apDisplay':'rpDisplay']=e.target.value;saveConfig();renderSettings();};
 $('blindCheck').onchange=e=>{cfg.blind=e.target.checked;saveConfig();};$('autoNextCheck').onchange=e=>{cfg.auto=e.target.checked;saveConfig();};$('maskCheck').onchange=e=>{cfg.mask=e.target.checked;saveConfig();};$('answerLimitSelect').onchange=e=>{const k=mode==='single'?'apLimit':'rpLimit';cfg[k]=AnswerTimer.parse(e.target.value,cfg[k]);e.target.value=AnswerTimer.text(cfg[k],currentLanguage);saveConfig();};
 $('minIntervalSelect').onchange=e=>{cfg.min=Number(e.target.value);if(cfg.max!==null&&cfg.max<cfg.min)cfg.max=cfg.min;saveConfig();renderSettings();};$('maxIntervalSelect').onchange=e=>{cfg.max=e.target.value==='unlimited'?null:Number(e.target.value);if(cfg.max!==null&&cfg.min>cfg.max)cfg.min=cfg.max;saveConfig();renderSettings();};$('directionSelect').onchange=e=>{cfg.direction=e.target.value;saveConfig();renderSettings();};
 $('startNote').onchange=e=>{rpLo=Number(e.target.value);if(rpLo>=rpHi)rpHi=Math.min(high,rpLo+1);if(rpLo>=rpHi)rpLo=rpHi-1;renderSettings();};$('endNote').onchange=e=>{rpHi=Number(e.target.value);if(rpHi<=rpLo)rpLo=Math.max(low,rpHi-1);if(rpHi<=rpLo)rpHi=rpLo+1;renderSettings();};
 $('playButton').onclick=()=>testActive?stop():start();$('nextButton').onclick=()=>newQuestion();$('replayButton').onclick=replay;$('otherButton').onclick=e=>submit('out',null,null,answerStamp(e));$('unsureButton').onclick=e=>submit('unsure',null,null,answerStamp(e));$('relativeButton').onclick=e=>submit('relative',null,null,answerStamp(e));
 for(const box of [$('buttonBoard'),$('extraAnswers')]){box.addEventListener('pointerdown',e=>{if(phase==='answer'&&e.target.closest('button:not(:disabled)'))answerClock.press(AnswerTimer.stamp(e));},true);box.addEventListener('pointercancel',()=>answerClock.release(),true);box.addEventListener('click',()=>answerClock.release());}
 $('statistics').ontoggle=()=>{if($('statistics').open)refreshHistory();};$('exportButton').onclick=()=>exportHistory().catch(TrainingCore.storageError);$('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=e=>importHistory(e.target.files[0]);
 $('languageSelect').onchange=e=>{if(testActive)return;currentLanguage=e.target.value;try{localStorage.setItem('earTrainerLanguage',currentLanguage);}catch(_){}translate();};
 $('instrumentSelect').onchange=async e=>{if(testActive||importBusy){e.target.value=instrumentMode;return;}releaseAllKeys();cancelAudio();TrainingTracker.pause();shell.inert=true;await writeQueue;await S.flushWrites();const url=new URL(location.href);url.hash='';if(e.target.value==='piano')url.searchParams.set('instrument','piano');else url.searchParams.delete('instrument');url.searchParams.set('mode',mode);location.replace(url.href);};
 $('audioReload').onclick=()=>location.reload();window.addEventListener('training-storage-error',()=>{$('storageWarning').hidden=false;$('storageWarning').textContent=tr('storageWarning');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop(true);releaseAllKeys();}});window.addEventListener('blur',()=>{stop(true);releaseAllKeys();});window.addEventListener('pagehide',()=>{stop(true);releaseAllKeys();});window.addEventListener('pageshow',()=>{shell.inert=false;});
 if(location.hash==='#ap'||location.hash==='#iv'||location.hash==='#tools')try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}
 drawKeyboard();translate();if(instrumentMode==='violin'&&window.ResizeObserver)new ResizeObserver(()=>{if(elements.keyboardScroller.clientWidth&&elements.keyboardScroller.clientWidth!==violinDrawnWidth){releaseAllKeys();drawKeyboard();updateBoardRange();if(testActive&&phase==='done'&&!session.blind)paintFeedback(trial,session);else markReference();}}).observe(elements.keyboardScroller);
 recoverJournals().then(()=>{if($('statistics').open)refreshHistory();}).catch(TrainingCore.storageError);
 loadInstrumentPreset().then(()=>{ready=true;status('ready');validate();render();}).catch(()=>{status('audioError');$('audioReload').hidden=false;});
 if('serviceWorker' in navigator&&location.protocol!=='file:'&&!document.documentElement.dataset.single){let reloading=false;const offer=r=>{if(!r.waiting||!navigator.serviceWorker.controller)return;$('updateButton').hidden=false;$('updateButton').onclick=()=>{if(testActive||importBusy||!r.waiting)return;reloading=true;r.waiting.postMessage({type:'SKIP_WAITING'});};};navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)location.reload();});navigator.serviceWorker.register('./service-worker.js').then(r=>{offer(r);r.addEventListener('updatefound',()=>r.installing?.addEventListener('statechange',()=>offer(r)));}).catch(()=>{});}
}
setup();
