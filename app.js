const APP_VERSION = "2.8.10";
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
const VIOLIN_ROUND_CHROME = 204; // px above and around the board in the tallest round layout (RP locate)

const PITCH_NAMES = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
];

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

const LETTER_PITCH_CLASSES = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
};

const SOLFEGE_NAMES = {
    C: "Do",
    D: "Re",
    E: "Mi",
    F: "Fa",
    G: "Sol",
    A: "La",
    B: "Si"
};

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

const SHARP_SPELLINGS = {
    0: ["C", 0],
    1: ["C", 1],
    2: ["D", 0],
    3: ["D", 1],
    4: ["E", 0],
    5: ["F", 0],
    6: ["F", 1],
    7: ["G", 0],
    8: ["G", 1],
    9: ["A", 0],
    10: ["A", 1],
    11: ["B", 0]
};

const FLAT_SPELLINGS = {
    0: ["C", 0],
    1: ["D", -1],
    2: ["D", 0],
    3: ["E", -1],
    4: ["E", 0],
    5: ["F", 0],
    6: ["G", -1],
    7: ["G", 0],
    8: ["A", -1],
    9: ["A", 0],
    10: ["B", -1],
    11: ["B", 0]
};

const KEY_FIFTHS = {
    "Cb major": -7,
    "Gb major": -6,
    "Db major": -5,
    "Ab major": -4,
    "Eb major": -3,
    "Bb major": -2,
    "F major": -1,
    "C major": 0,
    "G major": 1,
    "D major": 2,
    "A major": 3,
    "E major": 4,
    "B major": 5,
    "F# major": 6,
    "C# major": 7,
    "Ab minor": -7,
    "Eb minor": -6,
    "Bb minor": -5,
    "F minor": -4,
    "C minor": -3,
    "G minor": -2,
    "D minor": -1,
    "A minor": 0,
    "E minor": 1,
    "B minor": 2,
    "F# minor": 3,
    "C# minor": 4,
    "G# minor": 5,
    "D# minor": 6,
    "A# minor": 7
};

const KEY_OPTIONS = [
    "C major",
    "G major",
    "D major",
    "A major",
    "E major",
    "B major",
    "F# major",
    "C# major",
    "F major",
    "Bb major",
    "Eb major",
    "Ab major",
    "Db major",
    "Gb major",
    "Cb major",
    "A minor",
    "E minor",
    "B minor",
    "F# minor",
    "C# minor",
    "G# minor",
    "D# minor",
    "A# minor",
    "D minor",
    "G minor",
    "C minor",
    "F minor",
    "Bb minor",
    "Eb minor",
    "Ab minor"
];

// A complete piano, always laid out in seven fixed rows, low to high.
// Edge octaves are partial: attach A0-B0 to octave 1 and C8 to octave 7.
const PIANO_ROWS = [[21,35], [36,47], [48,59], [60,71], [72,83], [84,95], [96,108]];
const PIANO_BLACK_RATIO = 0.70;

const elements = {
    status: document.getElementById("status"),
    answerText: document.getElementById("answerText"),
    startNote: document.getElementById("startNote"),
    endNote: document.getElementById("endNote"),
    keySelect: document.getElementById("keySelect"),
    clefSelect: document.getElementById("clefSelect"),
    modeSelect: document.getElementById("modeSelect"),
    maxIntervalSelect: document.getElementById("maxIntervalSelect"),
    minIntervalSelect: document.getElementById("minIntervalSelect"),
    directionSelect: document.getElementById("directionSelect"),
    intervalPicker: document.getElementById("intervalPicker"),
    apPicker: document.getElementById("apPicker"),
    apTrialsSelect: document.getElementById("apTrialsSelect"),
    apTimeSelect: document.getElementById("apTimeSelect"),
    apAnswerPanel: document.getElementById("apAnswerPanel"),
    apAnswers: document.getElementById("apAnswers"),
    apReview: document.getElementById("apReview"),
    instrumentSelect: document.getElementById("instrumentSelect"),
    applyButton: document.getElementById("applyButton"),
    playButton: document.getElementById("playButton"),
    nextButton: document.getElementById("nextButton"),
    staff: document.getElementById("staff"),
    intervalReplayButton: document.getElementById("intervalReplayButton"),
    keyboard: document.getElementById("keyboard"),
    keyboardScroller: document.getElementById("keyboardScroller")
};

let minMidi = DEFAULT_MIN_MIDI;
let maxMidi = DEFAULT_MAX_MIDI;
let keyName = "C major";
let clefMode = "Treble";
let testMode = "single";
let currentReferenceMidi = null;
let maxIntervalSemitones = null; // null = unlimited
let minIntervalSemitones = 1;
let targetDirection = "both"; // higher / lower / both, compared with reference pitch
let questionSerial = 0;
let currentMidi = null;
let answered = false;
let testActive = false;
let legacyAudioReady = false;
let legacyPlayback = 0;
let ready = false;
let demoRunning = false;
let demoCancelled = false;
let demoTimer = null;
let demoResolve = null;
const demoWaits = new Set();
let currentLanguage = "en";
let statusMessage = { key: "loading", args: {} };
let answerMessage = { key: "free", args: {} };
let freeDisplayTimeout = null;

const keyElements = new Map();
const activePointers = new Map();
const activeVoices = new Map();

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

function resolveInitialLanguage() {
    const legacyKey = instrumentMode === "piano" ? "pitchTrainerLanguage" : "violinEarTrainerLanguage";
    const saved = localStorage.getItem("earTrainerLanguage") || localStorage.getItem(legacyKey);
    if (saved && TRANSLATIONS[saved]) {
        return saved;
    }
    const detected = navigator.language.toLowerCase();
    if (detected.startsWith("zh")) {
        return "zh-TW";
    }
    const base = detected.split("-")[0];
    return TRANSLATIONS[base] ? base : "en";
}

function t(key, args = {}) {
    if (key === "apFocus" || key === "apConsolidate")
        return APFocusCopy.t(currentLanguage, key === "apFocus" ? "focus" : "consolidate", args);
    if (key === "freeMode" || key === "drawNote") return APFocusCopy.t(currentLanguage, key);
    if (key === "ivFocus") return IntervalFocusCopy.t(currentLanguage, "focus", args);
    if (instrumentMode === "violin") {
        if (key === "choose") key = "chooseViolin";
        if (key === "hint") key = "violinHint";
    }
    let text = TRANSLATIONS[currentLanguage][key] ?? TRANSLATIONS.en[key] ?? key;
    for (const [name, value] of Object.entries(args)) {
        text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
}

function setStatus(key, args = {}) {
    statusMessage = { key, args };
    elements.status.textContent = key === "raw" ? args.text : t(key, args);
}

function setAnswer(key, args = {}) {
    answerMessage = { key, args };
    elements.answerText.textContent = key === "raw" ? args.text : t(key, args);
}

function setLanguage(language) {
    currentLanguage = TRANSLATIONS[language] ? language : "en";
    document.getElementById("audioReload").textContent = t("audioReload");
    if (window.TrainingTracker?.setLanguage) window.TrainingTracker.setLanguage(currentLanguage);
    localStorage.setItem("earTrainerLanguage", currentLanguage);
    document.documentElement.lang = currentLanguage;
    document.getElementById("languageSelect").value = currentLanguage;
    const labels = {
        languageLabel: "language", instrumentLabel: "instrument", fromLabel: "from", toLabel: "to",
        keyLabel: "key", clefLabel: "clef", modeLabel: "mode", maxIntervalLabel: "maxInterval", minIntervalLabel: "minInterval", targetDirectionLabel: "targetDirection", applyButton: "apply",
        apTrialsLabel: "apTrials", apTimeLabel: "apTime", apDescription: "apDescription",
        playButton: "play", nextButton: "next", demoButton: "demo", helpText: "hint"
    };
    for (const [id, key] of Object.entries(labels)) {
        document.getElementById(id).textContent = t(key);
    }
    for (const option of elements.instrumentSelect.options) option.textContent = t(option.value);
    renderRelativeNotes();
    const keySelect = elements.keySelect;
    for (const option of keySelect.options) {
        const [tonic, mode] = option.value.split(" ");
        option.textContent = `${tonic} ${t(mode)}`;
    }
    for (const option of elements.modeSelect.options) {
        const englishFreeModes = {single: "One Note", interval: "Two Notes", free: "Free Play"};
        option.textContent = currentLanguage === "en" && englishFreeModes[option.value]
            ? englishFreeModes[option.value]
            : option.value === "free" ? t("freeMode") : option.value === "rpCourse"
            ? RelativePitchCourse.T(currentLanguage,"course") : t(option.value);
    }
    elements.maxIntervalSelect.options[0].textContent = t("unlimited");
    elements.apTimeSelect.options[0].textContent = t("apSeconds");
    elements.apTimeSelect.options[1].textContent = t("apTwoSeconds");
    elements.apTimeSelect.options[2].textContent = t("apUnlimited");
    const otherButton = elements.apAnswers.querySelector('[data-pitch-class="out"]');
    if (otherButton) otherButton.textContent = t("apNoteOther");
    const unsure = elements.apAnswers.querySelector('[data-pitch-class="unsure"]');
    if (unsure) unsure.textContent = APFocusCopy.t(currentLanguage,"unsure");
    document.getElementById("apNameKeys").setAttribute("aria-label", APFocusCopy.t(currentLanguage,"noteGroup"));
    document.getElementById("apOctaveKeys").setAttribute("aria-label", APFocusCopy.t(currentLanguage,"octaveGroup"));
    for (const option of elements.directionSelect.options) {
        option.textContent = t(`direction${option.value.charAt(0).toUpperCase()}${option.value.slice(1)}`);
    }
    const clefSelect = elements.clefSelect;
    for (const option of clefSelect.options) {
        option.textContent = t(option.value.toLowerCase());
    }
    if (instrumentMode === "violin") {
        elements.keyboard.querySelectorAll(".violin-note").forEach((button) => {
            button.setAttribute("aria-label", `${button.dataset.string} \u00b7 ${t("violinPosition", { position: button.dataset.position })}`);
        });
    }
    updatePlayButton();
    setStatus(statusMessage.key, statusMessage.args);
    setAnswer(answerMessage.key, answerMessage.args);
    if (ready) {
        if (!testActive && activePointers.size > 0) {
            renderHeldNotes();
        } else if (!isApMode() && testMode !== "rpCourse" && testActive && answered && currentMidi !== null) {
            setAnswer("raw", { text: formatAnswerText() });
        }
    }
    if (typeof drawStaff === "function" && !demoRunning) {
        if (!testActive && activePointers.size > 0) {
            drawStaff([...new Set(activePointers.values())]);
        } else if (!isApMode() && testMode !== "rpCourse" && answered && currentMidi !== null) {
            drawAnsweredStaff();
        } else {
            drawQuestionStaff();
        }
    }
    updateStaffReplayAccess();
    updateApView();
    document.getElementById("autoNextText").textContent = t("autoNextText");
    document.getElementById("updateButton").textContent = t("updateReady");
    if (apMessageBuild) setApMessage(apMessageBuild);
    if (window.RPUI) RPUI.changedLanguage();
    APFocus.translate();
    IntervalFocus.translate();
    renderAnswerLimit();
    renderApMemory();
}
function noteName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    return `${PITCH_NAMES[midi % 12]}${octave}`;
}

function isWhiteKey(midi) {
    return WHITE_PITCH_CLASSES.has(midi % 12);
}

function keySignature(fifths) {
    const accidentals = {
        C: 0,
        D: 0,
        E: 0,
        F: 0,
        G: 0,
        A: 0,
        B: 0
    };

    if (fifths > 0) {
        SHARP_ORDER.slice(0, fifths).forEach((letter) => {
            accidentals[letter] = 1;
        });
    } else if (fifths < 0) {
        FLAT_ORDER.slice(0, -fifths).forEach((letter) => {
            accidentals[letter] = -1;
        });
    }

    return accidentals;
}

function spelledNote(midi, fifths) {
    const pitchClass = midi % 12;
    const signature = keySignature(fifths);

    let letter = null;
    let accidental = null;

    for (const candidate of Object.keys(LETTER_PITCH_CLASSES)) {
        const candidatePitch = (
            LETTER_PITCH_CLASSES[candidate] + signature[candidate] + 12
        ) % 12;

        if (candidatePitch === pitchClass) {
            letter = candidate;
            accidental = signature[candidate];
            break;
        }
    }

    if (letter === null) {
        const spelling = fifths >= 0
            ? SHARP_SPELLINGS[pitchClass]
            : FLAT_SPELLINGS[pitchClass];

        [letter, accidental] = spelling;
    }

    for (let octave = -1; octave <= 9; octave += 1) {
        const naturalMidi = (
            12 * (octave + 1) + LETTER_PITCH_CLASSES[letter]
        );

        if (naturalMidi + accidental === midi) {
            return { letter, accidental, octave };
        }
    }

    throw new Error("Unable to spell MIDI note.");
}

function accidentalText(accidental) {
    if (accidental === 1) {
        return "#";
    }

    if (accidental === -1) {
        return "b";
    }

    return "";
}

function spelledNoteName(midi, fifths) {
    const note = spelledNote(midi, fifths);
    return `${note.letter}${accidentalText(note.accidental)}${note.octave}`;
}

function solfegeName(midi, fifths) {
    const note = spelledNote(midi, fifths);
    return `${SOLFEGE_NAMES[note.letter]}${accidentalText(note.accidental)}${note.octave}`;
}

function keySignatureLabel(name) {
    const [tonic, mode] = name.split(" ");
    return `${tonic} ${t(mode)}`;
}

function drawStaff() {
    elements.staff.replaceChildren();
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
            key.className = `violin-note${step === 0 ? " open-string" : ""}${midi < minMidi || midi > maxMidi ? " out-of-range" : ""}`;
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
                pressKey(midi,event.pointerId);
            });
            key.addEventListener("pointerup", event => releasePointer(event.pointerId));
            key.addEventListener("pointercancel", event => releasePointer(event.pointerId));
            key.addEventListener("lostpointercapture", event => releasePointer(event.pointerId));
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
            key.className = `piano-key ${bounds.black ? "black-key" : "white-key"}${midi < minMidi || midi > maxMidi ? " out-of-range" : ""}`;
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
                pressKey(midi, event.pointerId);
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

function setControlsEnabled(enabled) {
    elements.applyButton.disabled = !enabled;
    elements.playButton.disabled = !enabled;
    elements.nextButton.disabled = !enabled;
    elements.startNote.disabled = !enabled;
    elements.endNote.disabled = !enabled;
    elements.keySelect.disabled = !enabled;
    elements.clefSelect.disabled = !enabled;
    elements.maxIntervalSelect.disabled = !enabled;
    elements.minIntervalSelect.disabled = !enabled;
    elements.directionSelect.disabled = !enabled;
    elements.apTrialsSelect.disabled = !enabled;
    elements.apTimeSelect.disabled = !enabled;
    document.getElementById("answerLimitSelect").disabled = !enabled;
    elements.modeSelect.disabled = !enabled;
    document.getElementById("demoButton").disabled = !enabled;
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
    if (!testActive && !demoRunning) {
        renderHeldNotes();
    }
}

function renderNotes(midis, options = {}) {
    const unique = [...new Set(midis)].sort((a, b) => a - b);
    resetKeyboardColors();
    unique.forEach((midi) => markPitch(midi, "active"));
    if (unique.length) {
        const fifths = KEY_FIFTHS[keyName];
        const names = unique.length === 1
            ? `${solfegeName(unique[0], fifths)} / ${spelledNoteName(unique[0], fifths)}`
            : unique.map((midi) => spelledNoteName(midi, fifths)).join("  ");
        setAnswer("raw", { text: names });
    } else {
        setAnswer(options.keepStatus ? "raw" : "free", options.keepStatus ? { text: "" } : {});
    }
    drawStaff(unique);
    if (!options.keepStatus) {
        setStatus(unique.length ? "held" : "free", { count: unique.length });
    }
}

function renderHeldNotes() {
    window.clearTimeout(freeDisplayTimeout);
    const midis = [...activePointers.values()];
    if (midis.length === 0) {
        resetKeyboardColors();
        freeDisplayTimeout = window.setTimeout(() => {
            if (!testActive && !demoRunning && activePointers.size === 0) {
                renderNotes([]);
            }
        }, 250);
        return;
    }
    renderNotes(midis);
}

function drawQuestionStaff() {
    if (testActive && !answered && testMode === "interval" && currentReferenceMidi !== null) {
        drawStaff(currentReferenceMidi);
    } else {
        drawStaff(null, testActive && !answered);
    }
}

// The reference is public information: make it discoverable on the keyboard.
function markReferenceKey() {
    if (testActive && testMode === "interval" && currentReferenceMidi !== null) {
        markPitch(currentReferenceMidi, "reference");
    }
}

function drawAnsweredStaff() {
    if (testMode === "interval" && currentReferenceMidi !== null) {
        drawStaff([currentReferenceMidi, currentMidi]);
    } else {
        drawStaff(currentMidi);
    }
}

function updateStaffReplayAccess() {
    const canReplay = testActive && testMode === "interval" && currentReferenceMidi !== null;
    elements.intervalReplayButton.hidden = !canReplay;
    elements.intervalReplayButton.textContent = t("replay");
    elements.intervalReplayButton.setAttribute("aria-label", t("replayInterval"));
    const chip = document.getElementById("referenceChip");
    chip.hidden = !canReplay;
    if (canReplay) {
        const pos = instrumentMode === "violin" ? violinPositionForMidi(currentReferenceMidi) : null;
        const string = pos ? VIOLIN_OPEN_STRINGS[pos.row].name + " +" + pos.step : "";
        chip.textContent = `${RelativePitchCourse.T(currentLanguage,"reference")} ${noteName(currentReferenceMidi)}${string ? " · " + string : ""}`;
    }
}

function formatAnswerText() {
    const fifths = KEY_FIFTHS[keyName];
    if (testMode === "interval" && currentReferenceMidi !== null) {
        const difference = currentMidi - currentReferenceMidi;
        const direction = t(difference > 0 ? "intervalUp" : "intervalDown", { count: Math.abs(difference) });
        return `${spelledNoteName(currentReferenceMidi, fifths)} \u2192 ${spelledNoteName(currentMidi, fifths)} (${direction})`;
    }
    return `${solfegeName(currentMidi, fifths)}    ${spelledNoteName(currentMidi, fifths)}`;
}

async function playQuestion(replay = false) {
    if (!ready || currentMidi === null) return;
    APPitchScience.markPractice(AP_APP_ID);
    const serial=questionSerial,target=currentMidi,reference=currentReferenceMidi;
    if (replay && !answered && answerClock.late(performance.now())) {answerTimeout(); return;}
    const playback = ++legacyPlayback;
    const active = () => playback === legacyPlayback && serial === questionSerial && testActive && !document.hidden;
    legacyAudioReady=false;
    if (!answered) answerClock.stop();
    await ensureAudio();
    if (!active()) return;
    player.cancelQueue(audioContext); TrainingCore.cancelAudio();
    const start=audioContext.currentTime+.05;
    const pair=testMode==='interval' && reference!==null;
    if (pair) queueInstrumentNote(instrumentMode, reference, start, .6);
    const at = start + (pair ? .8 : 0);
    queueInstrumentNote(instrumentMode, target, at);
    if (answered || demoRunning) return;
    const clock = APFocusModel.outputClock(audioContext, at);
    const audibleAt = audioContext.currentTime + (clock.when - performance.now()) / 1000;
    if (!await TrainingCore.waitForAudio(audioContext, audibleAt, active) || !active()) return;
    legacyAudioReady=true;
    if (!replay) TrainingCore.rememberQuestion(AP_APP_ID, reference, target);
    startAnswerClock(clock.when, answerTimeout);
}

async function playTone(midi) {
    if (!ready) {
        return;
    }

    await ensureAudio();
    player.cancelQueue(audioContext); TrainingCore.cancelAudio();

    queueInstrumentNote(instrumentMode, midi, 0);
    APPitchScience.markLabel(AP_APP_ID);
    TrainingCore.rememberLabel(midi);
}

// Protocol 4: learning gives labelled feedback; independent checks reveal
// answers only after the round. Legacy history remains readable.
const AP_PITCH_LABELS = ["C", "C\u266f/D\u266d", "D", "D\u266f/E\u266d", "E", "F",
    "F\u266f/G\u266d", "G", "G\u266f/A\u266d", "A", "A\u266f/B\u266d", "B"];
const AP_APP_ID = instrumentMode;
let apCourse = APPitchScience.loadCourse(AP_APP_ID);
let apSession = null;

let apTimer = null;
let apDeadline = null;
let apAudioReady = false;
let apFeedbackPlaying = false;
let apFeedbackTimer = null;
let apSoundStart = null;
let apAudioLatencyMs = 0;
const AP_COLD_MIN_REST_MS = APPitchScience.restMs; // conservative product assumption, not a validated cut-off
// Protocol 5: interference burst, neighbouring "Other" notes, spacing that needs
// after-break evidence, selectable round length and sound, automatic continue.
// Protocol 7: note names drawn independently of the previous question, successive notes
// more than an octave apart where the range allows, with optional sampled intervening tones.
const AP_PROTOCOL = 8;
// A new key turns the stronger reset on once for everyone; it can still be switched off.
const AP_MASK_KEY = "ear-ap-mask-v2";
const AUTO_NEXT_KEY = "ear-auto-next";
let apHideColdAnswers = false;
let apStudyOctave = null; // C of the octave played by the labelled study cards
let apMessageBuild = null;
let autoNextTimer = null;
// 2.8.2: one answer window for single notes, two notes, the AP checks and the interval course,
// as in focused AP practice, from the estimated audible onset.
const answerClock = AnswerTimer.createClock(document.getElementById("answerTimer"));
let answerLimit = AnswerTimer.load();
function placeAnswerTimer() {
    const bar = document.getElementById("answerTimer");
    const [parent, before] = isApMode() ? [elements.apAnswerPanel, elements.apAnswers]
        : testMode === "rpCourse" ? [document.getElementById("rpPanel"), document.getElementById("rpReference")]
        : [document.querySelector(".answer-card"), null];
    if (bar.parentElement !== parent || bar.nextElementSibling !== before) parent.insertBefore(bar, before);
}
function startAnswerClock(onsetAt, onExpire) {
    answerClock.stop();
    const ms = AnswerTimer.windowMs(answerLimit);
    if (ms === null) return null;
    placeAnswerTimer();
    answerClock.start(onsetAt, ms, onExpire);
    return ms;
}
function renderAnswerLimit() {
    const select = document.getElementById("answerLimitSelect");
    if (!select) return;
    const mode = elements.modeSelect.value;
    const timed = ["free", "single", "interval", "ap", "apLearn", "apCold", "rpCourse"].includes(mode);
    document.getElementById("answerLimitRow").hidden = !timed;
    document.getElementById("answerLimitHelp").hidden = !timed;
    if (document.activeElement !== select) select.value = AnswerTimer.text(answerLimit, currentLanguage);
    select.placeholder = APFocusCopy.t(currentLanguage, "limitNone");
    document.getElementById("answerLimitLabel").textContent = APFocusCopy.t(currentLanguage, "limitSeconds");
    document.getElementById("answerLimitHelp").textContent = IntervalFocusCopy.t(currentLanguage, "limitScale");
}
// A single note or a pair that was not answered in time: shown like a miss, waits for Next.
function answerTimeout() {
    if (!testActive || answered || isApMode() || testMode === "rpCourse" || demoRunning) return;
    answerClock.stop();
    TrainingTracker.activity("answer");
    answered = true;
    if (testMode === "free" && !demoRunning) testActive = false;
    questionSerial += 1;
    updatePlayButton();
    updateStaffReplayAccess();
    resetKeyboardColors();
    markReferenceKey();
    markPitch(currentMidi, "correct");
    setStatus("raw", {text: APFocusCopy.t(currentLanguage, "timeUp")});
    setAnswer("raw", {text: formatAnswerText()});
    if (testMode === "interval") {
        drawAnsweredStaff();
        playQuestion(true).catch(() => setStatus("audioRetry"));
    } else {
        drawStaff(currentMidi);
        playTone(currentMidi);
    }
}


function isApMode(mode = testMode) { return ["ap", "apLearn", "apCold"].includes(mode); }
function clearApTimer() { window.clearTimeout(apTimer); apTimer = null; apDeadline = null; answerClock.stop(); }
function clearApFeedback() {
    window.clearTimeout(apFeedbackTimer); apFeedbackTimer = null;
    apFeedbackPlaying = false;
}
function apEligiblePitches(from = minMidi, to = maxMidi) {
    // Preserve equal register support across pitch classes; an arbitrary
    // 12-note range (e.g. C#4–C5) is not a complete aligned C–B octave.
    const range = APPitchScience.effectiveRange(from, to);
    if (!range) return [];
    return Array.from({length: range.to - range.from + 1}, (_, i) => range.from + i);
}
function apCorrect(record, session = apSession) {
    if (record.result !== "answered") return false;
    const learned = record.learned ?? session?.learned ?? session?.known;
    return learned ? TrainingCore.matchesLearningSet(record.pitch % 12, record.guess, learned, 0, 11)
        : record.guess === record.pitch % 12;
}
function apMetricFor(session) {
    return APPitchScience.metrics(session.records.map((r) => ({...r, correct: apCorrect(r, session), target: r.pitch})));
}
const AP_RANGE_COPY = {
    en: "Actual AP question range",
    de: "Tatsächlicher AP-Testbereich",
    ja: "AP出題の実際の音域",
    it: "Estensione effettiva delle domande AP",
    el: "Πραγματικό εύρος ερωτήσεων AP",
    "zh-TW": "AP 實際出題音域"
};
const AP_MEMORY_COPY = {
    en: ["1 · Listen and remember", "Tap each labelled note as often as needed. Then press Play to practise recall; mistakes return sooner.", "Due now", "Next review", "Replay correct note"],
    de: ["1 · Anhören und merken", "Beschriftete Töne mehrfach hören. Danach aus dem Gedächtnis antworten; Fehler werden früher wiederholt.", "Jetzt wiederholen", "Nächste Wiederholung", "Richtigen Ton anhören"],
    ja: ["1 · 聴いて覚える", "音名を見ながら何度でも試聴。Playで聞き取り練習へ。間違えた音を早めに復習。", "復習する", "次の復習", "正しい音をもう一度"],
    it: ["1 · Ascolta e memorizza", "Riascolta le note etichettate. Poi prova a riconoscerle; ripassa presto gli errori.", "Ripasso ora", "Prossimo ripasso", "Riascolta nota corretta"],
    el: ["1 · Άκουσε και θυμήσου", "Άκουσε επανειλημμένα τις νότες με ετικέτα και μετά εξασκήσου στην αναγνώριση.", "Επανάληψη τώρα", "Επόμενη επανάληψη", "Άκουσε ξανά τη σωστή νότα"],
    "zh-TW": ["1 · 先聽再記", "先反覆聆聽有名稱的音，再按 Play 開始限時辨音；錯音會安排較早複習。", "現在應複習", "下次複習", "重聽正確音"]
};
function apMemoryText(which) {
    const copy = AP_MEMORY_COPY[currentLanguage] || AP_MEMORY_COPY.en;
    return copy[{title:0,subtitle:1,due:2,next:3,replay:4}[which]];
}
function setApMessage(build) {
    // The panel carries its own prompt and feedback: the header is hidden during a round.
    apMessageBuild = build;
    const box = document.getElementById("apMessage");
    if (box) box.textContent = build ? build() : "";
}
function apGuessLabel(guess) {
    return guess === null ? t("apEmpty") : guess === "out" ? t("apNoteOther") : guess === "unsure" ? APFocusCopy.t(currentLanguage,"unsure") : AP_PITCH_LABELS[guess];
}
function apStudyBases() {
    const bases = APPitchScience.octaveBases(Number(elements.startNote.value), Number(elements.endNote.value));
    return bases.length ? bases : [60];
}
function apBreakText() {
    const last = APPitchScience.lastPracticeAt(AP_APP_ID);
    if (last === null) return `${t("apBreakLabel")}: \u2014 \xb7 ${t("ordinaryCheck")}`;
    const minutes = Math.max(0, Math.floor((Date.now() - last) / 60000));
    const rested = minutes * 60000 >= AP_COLD_MIN_REST_MS;
    return `${t("apBreakLabel")}: ${Math.floor(minutes / 60)} h ${minutes % 60} min \xb7 ${t(rested ? "afterBreak" : "ordinaryCheck")}`;
}
function renderApMemory() {
    const panel = document.getElementById("apStudyPanel");
    if (!panel) return;
    const selectedMode = elements.modeSelect.value;
    panel.hidden = selectedMode !== "apLearn" || Boolean(apSession && !apSession.finished);
    if (panel.hidden) return;
    document.getElementById("apStudyTitle").textContent = apMemoryText("title");
    document.getElementById("apStudySubtitle").textContent = t("apLearnDesc");
    // A study card is a stable anchor: it stays in one octave (C4–B4 when available)
    // until the learner deliberately switches to another complete octave of the range.
    const bases = apStudyBases();
    if (!bases.includes(apStudyOctave)) apStudyOctave = bases.includes(60) ? 60 : bases[0];
    const octaves = document.getElementById("apStudyOctaves");
    octaves.replaceChildren();
    octaves.hidden = bases.length < 2;
    if (!octaves.hidden) {
        const label = document.createElement("span");
        label.textContent = t("apStudyOctave");
        octaves.appendChild(label);
        for (const base of bases) {
            const choice = document.createElement("button");
            choice.type = "button";
            choice.className = `secondary ap-study-octave${base === apStudyOctave ? " current" : ""}`;
            choice.textContent = `${noteName(base)}\u2013${noteName(base + 11)}`;
            choice.setAttribute("aria-pressed", String(base === apStudyOctave));
            choice.addEventListener("click", () => {
                if (demoRunning || testActive) return;
                apStudyOctave = base;
                renderApMemory();
            });
            octaves.appendChild(choice);
        }
    }
    const cards = document.getElementById("apStudyCards");
    cards.replaceChildren();
    const available = APPitchScience.learned(apCourse.level);
    const items = APMemory.due(AP_APP_ID,available).sort((a,b)=>available.indexOf(a.pc)-available.indexOf(b.pc));
    const newest = available[available.length - 1];
    for (const entry of items) {
        const button = document.createElement("button");
        button.type = "button";
        // The newest name of a level has hardly been heard yet: listen before recalling.
        const fresh = entry.pc === newest && entry.attempts < 6;
        button.className = `secondary ap-study-note${entry.nextAt <= Date.now() ? " due" : ""}${fresh ? " fresh" : ""}`;
        const studyMidi = apStudyOctave + entry.pc;
        button.textContent = `\u25b6 ${AP_PITCH_LABELS[entry.pc]}${Math.floor(studyMidi / 12) - 1} \xb7 ${entry.hits}/${entry.attempts}${fresh ? ` \xb7 ${t("apNewNote")}` : ""}`;
        button.addEventListener("click", async () => {
            if (demoRunning || testActive || elements.modeSelect.value !== "apLearn") return;
            TrainingTracker.activity("ap-learning");
            await playTone(studyMidi);
        });
        cards.appendChild(button);
    }
    const due = items.filter(x => x.nextAt <= Date.now());
    const next = items.filter(x => x.nextAt > Date.now()).sort((a,b)=>a.nextAt-b.nextAt)[0];
    const time = next ? new Date(next.nextAt).toLocaleString(currentLanguage,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : "\u2014";
    document.getElementById("apStudyDue").textContent = `${apMemoryText("due")}: ${due.length ? due.map(x=>AP_PITCH_LABELS[x.pc]).join(", ") : "\u2014"} \xb7 ${apMemoryText("next")}: ${time}`;
}
function refreshApCourseUI() {
    const mode = elements.modeSelect.value;
    const pane = document.getElementById("apCourseInfo");
    document.getElementById("apDescription").hidden = mode !== "ap";
    if (!pane) return;
    pane.hidden = !["apLearn", "apCold"].includes(mode);
    const level = APPitchScience.learned(apCourse.level).map((x) => AP_PITCH_LABELS[x]).join(" \xb7 ");
    document.getElementById("apCourseLevel").textContent = t("apCourseLevel", {level: apCourse.level, names: level});
    document.getElementById("apColdConfirmation").hidden = mode !== "apCold";
    document.getElementById("apLevelPicker").hidden = !["apLearn", "apCold"].includes(mode);
    document.getElementById("apLevelSelect").value = String(apCourse.level);
    document.getElementById("apLevelLabel").textContent = t("apLevelLabel");
    // The study panel already shows the learning description; do not print it twice.
    const description = document.getElementById("apCourseDescription");
    description.hidden = mode === "apLearn";
    description.textContent = t(mode === "apLearn" ? "apLearnDesc" : "apColdDesc");
    document.getElementById("apColdDeviceLabel").textContent = t("apColdDeviceLabel");
    for (const option of document.getElementById("apColdDevice").options) {
        option.textContent = t("apDevice" + option.value.charAt(0).toUpperCase() + option.value.slice(1));
    }
    document.getElementById("apHideColdText").textContent = t("apHideColdText");
    document.getElementById("apColdRangeText").textContent = t("apColdRangeText");
    document.getElementById("apBreakInfo").textContent = mode === "apCold" ? apBreakText() : "";
    // Every AP mode, the cold check included, draws from the range the user selected.
    const range = APPitchScience.effectiveRange(Number(elements.startNote.value), Number(elements.endNote.value));
    const describe = range ? `${noteName(range.from)}\u2013${noteName(range.to)}` : "\u2014";
    document.getElementById("apEffectiveRange").textContent = `${AP_RANGE_COPY[currentLanguage] || AP_RANGE_COPY.en}: ${describe}`;
    document.getElementById("apExportButton").textContent = t("apExportButton");
    document.getElementById("apProgressTitle").textContent = t("apProgressTitle");
    // The sound is part of the recorded condition: compare rounds with the same sound only.
    document.getElementById("apTimbreLabel").textContent = t("apSoundLabel");
    for (const option of document.getElementById("apTimbre").options) option.textContent = t(option.value);
    document.getElementById("apMaskText").textContent = t("apMaskText");
    renderApMemory();
}
function updateClassicKeys() {
    const readyForAnswer = ready && isApMode() && !demoRunning && testActive && !answered && apAudioReady;
    const range = apSession?.effectiveRange;
    for (const button of elements.apAnswers.querySelectorAll("button")) {
        const octave = button.dataset.octave, pc = Number(button.dataset.pitchClass);
        button.classList.toggle("af-set", Number.isInteger(pc) && !!apSession?.learned?.includes(pc));
        if (octave !== undefined) {
            const o = Number(octave);
            button.disabled = !readyForAnswer || !range || o < APFocusModel.octaveOf(range[0]) || o > APFocusModel.octaveOf(range[1]);
            button.setAttribute("aria-pressed",String(o === apSession?.pickOctave));
        } else {
            button.disabled = !readyForAnswer;
            if (Number.isInteger(pc)) button.setAttribute("aria-pressed",String(pc === apSession?.pickName));
        }
    }
}
function updateApView() {
    const isAp = isApMode() && !demoRunning;
    const running = Boolean(apSession && !apSession.finished);
    document.querySelector(".app-shell").classList.toggle("ap-mode", isAp);
    document.querySelector(".app-shell").classList.toggle("ap-complete", Boolean(isAp && apSession?.finished));
    elements.apAnswerPanel.hidden = !isAp || !apSession;
    updateClassicKeys();
    document.getElementById("apLevelSelect").disabled = running;
    if (ready) {
        elements.nextButton.disabled = isAp && (!testActive || !answered || apSession?.finished || apFeedbackPlaying);
    }
    if (isAp) {
        elements.apReview.hidden = !apSession?.finished;
        if (apSession?.finished) renderApResults();
        else elements.apReview.replaceChildren();
    }
    refreshApCourseUI();
    const replayNote = document.getElementById("apRepeatNote");
    replayNote.hidden = !(isAp && testMode === "apLearn" && running && !apFeedbackPlaying && (apAudioReady || answered));
    if (!replayNote.hidden) replayNote.textContent = answered ? apMemoryText("replay") : t("replayTarget");
}
function markApButtons(record) {
    // Learning shows right and wrong; checks only confirm which button was taken.
    const feedback = apSession.kind === "learn" && (record.result === "answered" || record.result === "timeout");
    const target = apSession.learned && !apSession.learned.includes(record.pitch % 12) ? "out" : String(record.pitch % 12);
    elements.apAnswers.querySelectorAll("button").forEach((button) => {
        const value = button.dataset.pitchClass;
        button.classList.remove("ap-picked", "ap-right", "ap-wrong");
        if (button.dataset.octave !== undefined) {
            const o = Number(button.dataset.octave);
            if (o === record.guessOctave) button.classList.add(feedback ? (record.octaveCorrect ? "ap-right" : "ap-wrong") : "ap-picked");
            if (feedback && Number.isInteger(record.guessOctave) && o === APFocusModel.octaveOf(record.pitch)) button.classList.add("ap-right");
            return;
        }
        if (record.guess !== null && value === String(record.guess)) {
            button.classList.add(feedback ? (apCorrect(record) ? "ap-right" : "ap-wrong") : "ap-picked");
        }
        if (feedback && value === target) button.classList.add("ap-right");
    });
}
function clearApButtons() {
    elements.apAnswers.querySelectorAll("button").forEach((button) => button.classList.remove("ap-picked", "ap-right", "ap-wrong"));
}
function renderApResults() {
    if (!apSession?.finished) return;
    const results = elements.apReview;
    results.replaceChildren();
    const summary = document.createElement("h3");
    const metric = apMetricFor(apSession);
    const rt = metric.medianRt === null ? "\u2014" : `${(metric.medianRt / 1000).toFixed(2)}s`;
    summary.textContent = `${t("apReview")} \xb7 ${metric.correct}/${metric.total} \xb7 ${t("apMedianRT")}: ${rt}`;
    results.appendChild(summary);
    const fresh=apSession.records.filter(r=>!r.repair&&!r.replayed&&(r.result==='answered'||r.result==='timeout'));
    const detail=document.createElement('p');
    detail.textContent=`${t('fresh')}: ${fresh.filter(r=>apCorrect(r)).length}/${fresh.length} · ${t(apSession.timbre)}`;
    results.appendChild(detail);
    const aided=apSession.records.filter(r=>r.repair||r.replayed);
    detail.textContent+=` · ${t('assisted')}: ${aided.filter(r=>apCorrect(r)).length}/${aided.length}`;
    const counts=document.createElement('p');
    const known=apSession.learned || apSession.known || Array.from({length:12},(_,i)=>i);
    counts.textContent=t('coverage')+': '+known.map(pc=>`${AP_PITCH_LABELS[pc]}=${apSession.records.filter(r=>r.pitch%12===pc).length}`).join(' · ');
    results.appendChild(counts);
    if(known.length<12){
        const named=apSession.records.filter(r=>known.includes(r.pitch%12));
        const other=apSession.records.filter(r=>!known.includes(r.pitch%12));
        const split=document.createElement('p');split.textContent=`${t('apKnownScore')}: ${named.filter(r=>apCorrect(r)).length}/${named.length} · ${t('apOtherScore')}: ${other.filter(r=>apCorrect(r)).length}/${other.length}`;results.appendChild(split);
    }
    const guide=document.createElement('p');
    // 90 % follows the criterion of adult pitch-naming studies; 60 % is a product heuristic.
    const freshRate=fresh.length?fresh.filter(r=>apCorrect(r)).length/fresh.length:0;
    guide.textContent=t(freshRate<.6?'lowerLevelHint':freshRate>=.9?'nextLevelHint':'keepLevelHint')+' '+t('roundBreak');results.appendChild(guide);
    if (apSession.effectiveRange) {
        const where=document.createElement('p');
        where.textContent=`${AP_RANGE_COPY[currentLanguage] || AP_RANGE_COPY.en}: ${noteName(apSession.effectiveRange[0])}\u2013${noteName(apSession.effectiveRange[1])}`;
        results.appendChild(where);
    }
    if (apSession.kind === "cold") {
        const note = document.createElement("p");
        note.textContent = apSession.interrupted ? t("apInterrupted")
            : apSession.eligible ? t("apColdFirstResult") : t("apColdPracticeResult");
        results.appendChild(note);
    }
    if (apSession.kind === "cold" && apHideColdAnswers) {
        const reveal = document.createElement("button");
        reveal.type = "button";
        reveal.className = "secondary";
        reveal.textContent = t("apRevealColdAnswers");
        reveal.addEventListener("click", () => {apHideColdAnswers = false; renderApResults();});
        results.appendChild(reveal);
        return;
    }
    const list = document.createElement("ol");
    for (const result of apSession.records) {
        const item = document.createElement("li");
        const correct = apCorrect(result);
        const label = result.guess === null ? t("apResultMiss") : t(correct ? "apResultCorrect" : "apResultWrong");
        let picked = apGuessLabel(result.guess);
        if (Number.isInteger(result.guessOctave)) picked += result.guessOctave;
        else if (Number.isInteger(result.guess) && result.learned && !result.learned.includes(result.guess)) picked = t("apNoteOther") + " (" + picked + ")";
        item.textContent = `${label} \xb7 ${t("apTarget")}: ${noteName(result.pitch)} \xb7 ${t("apPicked")}: ${picked}`;
        list.appendChild(item);
    }
    results.appendChild(list);
}
function finishApRound() {
    if (!apSession || apSession.finished) return;
    clearApTimer(); clearApFeedback();
    window.clearTimeout(autoNextTimer);
    apSession.finished = true;
    TrainingTracker.pause();
    testActive = false; answered = true; currentMidi = null;
    questionSerial += 1; apAudioReady = false;
    player.cancelQueue(audioContext); TrainingCore.cancelAudio();
    const metric = apMetricFor(apSession);
    const session = apSession;
    session.completedAt = Date.now();
    // Checks measure progress without deciding what the user may learn.
    // Existing history stays on the device; level selection is explicit.
    APPitchScience.putRows(AP_APP_ID, "sessions", [{id: session.id, kind: session.kind,
        protocol:AP_PROTOCOL, timbre:session.timbre, gapSincePracticeMs:session.gapSincePracticeMs,
        range:[minMidi,maxMidi],effectiveRange:session.effectiveRange,
        limitMs:session.limitMs,known:session.known,masked:session.masked,afterBreak:session.afterBreak,
        day: session.day, level: session.level, started: session.startAt,
        finished: session.completedAt, eligible: session.eligible, interrupted: session.interrupted,
        total: session.total, attempted:session.records.length, ...metric}]);
    setStatus("apSummary", {score: metric.correct, total: session.total});
    setAnswer("apSummary", {score: metric.correct, total: session.total});
    setApMessage(() => t("apSummary", {score: metric.correct, total: session.total}));
    clearApButtons();
    drawStaff(); updatePlayButton(); updateApView();
    refreshApHistory();
}
// Spacing evidence. In a feedback round only the very first note after a break is
// free of a labelled reference; in a no-feedback check after a break every note is.
function updateApMemory(record) {
    const known = apSession.known || [], pc = record.pitch % 12;
    const correct = apCorrect(record);
    const assisted = !!record.repair || record.replayed > 0;
    const cold = !!apSession.afterBreak && (apSession.kind === "cold" || apSession.records.length === 1);
    const guessed = typeof record.guess === "number" ? record.guess : null;
    if (known.includes(pc)) {
        APMemory.record(AP_APP_ID, pc, correct, Date.now(), assisted, cold);
        if (!correct && guessed !== null) APMemory.confuse(AP_APP_ID, pc, guessed);
        if (!correct && apSession.kind === "learn") TrainingCore.queueRepair(apSession.repairs, pc, apSession.records.length);
    }
    // A learned name given to a different note: that name's boundary is unsure as well.
    if (!correct && guessed !== null && guessed !== pc && known.includes(guessed)) {
        APMemory.record(AP_APP_ID, guessed, false, Date.now(), false, false);
        APMemory.confuse(AP_APP_ID, guessed, pc);
        if (apSession.kind === "learn") TrainingCore.queueRepair(apSession.repairs, guessed, apSession.records.length);
    }
}
function recordApAnswer(guess = null, result = null, inputEvent = null, octave = null) {
    if (!isApMode() || !apSession || apSession.finished || !testActive || answered) return;
    const responseTime = AnswerTimer.stamp(inputEvent);
    if (result === null && (!apAudioReady || responseTime < apSoundStart)) return;
    // 2.8.2: past the answer window the note counts as missed, whatever is chosen afterwards.
    const lateGuess = result === null && guess !== null && answerClock.late(responseTime) ? guess : null;
    if (lateGuess !== null) guess = null;
    clearApTimer();
    TrainingTracker.activity("ap-answer");
    const pitch = currentMidi;
    const now = Date.now();
    const status = result || (guess === null ? "timeout" : "answered");
    const rtMs = apSoundStart === null || status === "timeout" ? null : Math.max(0, Math.round(responseTime - apSoundStart));
    const scored = status === "answered" || status === "timeout";
    const record = {protocol:AP_PROTOCOL, timbre:apSession.trialTimbre || apSession.timbre, repair:!!apSession.currentRepair, replayed:apSession.replayed||0, id: `${apSession.id}-${apSession.records.length + 1}`, sessionId: apSession.id,
        kind: apSession.kind, level: apSession.level, day: apSession.day,
        ordinal: apSession.records.length + 1, learned:[...apSession.learned], pitch, guess, guessOctave:octave, octaveCorrect:Number.isInteger(octave) ? octave === APFocusModel.octaveOf(pitch) : null, result: status, rtMs, limitMs: apSession.limitMs, lateGuess,
        playedAt: apSoundStart === null ? null : Math.round(now + apSoundStart - performance.now()), submittedAt: now,
        audibleLatencyEstimateMs: apAudioLatencyMs, source: AP_APP_ID,
        previousPitch: apSession.records.length ? apSession.records[apSession.records.length - 1].pitch : null,
        eligibleCold: apSession.eligible, afterBreak: apSession.afterBreak, resetSoundOn: !!apSession.actualReset, reset:apSession.actualReset,
        pointerTimeStamp: inputEvent?.timeStamp ?? null,
        pointerX: inputEvent?.clientX ?? null, pointerY: inputEvent?.clientY ?? null,
        buttonIndex: guess === "out" ? 12 : guess === "unsure" ? 13 : guess,
        baseLatencyRaw: audioContext.baseLatency ?? null,
        outputLatencyRaw: audioContext.outputLatency ?? null,
        sampleRate: audioContext.sampleRate ?? null,
        outputDevice: apSession.outputDevice,
        hiddenCount: apSession.hiddenCount || 0,
        gapSincePracticeMs: apSession.gapSincePracticeMs,
        coldSourceRange: apSession.kind === "cold" && apSession.effectiveRange
            ? `${noteName(apSession.effectiveRange[0])}-${noteName(apSession.effectiveRange[1])}` : "configured"};
    apSession.records.push(record);
    APPitchScience.putRows(AP_APP_ID, "trials", [{...record, correct: apCorrect(record)}]);
    if (scored && apSession.kind !== "assessment") updateApMemory(record);
    if (status === "interrupted" || status === "audio-error") apSession.interrupted = true;
    answered = true; apAudioReady = false;
    questionSerial += 1;
    player.cancelQueue(audioContext); TrainingCore.cancelAudio();
    resetKeyboardColors(); drawStaff();
    markApButtons(record);
    const last = apSession.records.length >= apSession.total;
    if (last && apSession.kind !== "learn") {finishApRound(); return;}
    if (apSession.kind === "learn" && scored) {
        APPitchScience.markLabel(AP_APP_ID);
        apSession.pendingFinish = last;
        const correct = apCorrect(record);
        const note = AP_PITCH_LABELS[pitch % 12];
        setStatus(correct ? "apLearnCorrect" : "apLearnWrong", {note});
        setAnswer(correct ? "apLearnCorrect" : "apLearnWrong", {note});
        setApMessage(() => correct ? `\u2713 ${t("apLearnCorrect", {note})}`
            : status === "timeout" ? `\u2717 ${APFocusCopy.t(currentLanguage, "tooSlow")} \xb7 ${t("apLearnWrong", {note})}`
            : `\u2717 ${t("apLearnWrong", {note})} \xb7 ${t("apPicked")}: ${apGuessLabel(guess)}`);
        playApLearningFeedback(pitch, correct).catch(() => {
            apFeedbackPlaying = false;
            if (apSession?.pendingFinish) finishApRound(); else updateApView();
        });
    } else {
        if (last) {finishApRound(); return;}
        const auto = autoNextEnabled();
        const key = status === "interrupted" ? "apInterrupted" : guess === null
            ? (auto ? "apTimedOutShort" : "apTimedOut") : (auto ? "apRecordedShort" : "apRecorded");
        const done = apSession.records.length, total = apSession.total;
        setStatus(key);
        setAnswer(key);
        setApMessage(() => `${done} / ${total} \xb7 ${t(key)}`);
        // An interrupted or silent question waits for the learner; it never chains on.
        if (scored) scheduleAutoNext(350);
    }
    updateApView();
}
async function playApLearningFeedback(pitch, correct = false) {
    const serial = questionSerial;
    apFeedbackPlaying = true; updateApView();
    await ensureAudio();
    if (serial !== questionSerial || !apSession || apSession.finished || testMode !== "apLearn") return;
    const start = audioContext.currentTime + 0.04;
    // The labelled answer sounds exactly like the question that was just heard.
    if (apSession.trialTimbre === "neutral") TrainingCore.neutralTone(audioContext, start, pitch, 0.7);
    else queueInstrumentNote(instrumentMode, pitch, start, PLAY_DURATION, 0.7);
    // One correct pitch only: no additional octave playback after answering.
    const waitMs = 840;
    apFeedbackTimer = window.setTimeout(() => {
        if (serial !== questionSerial) return;
        apFeedbackPlaying = false;
        if (apSession?.pendingFinish) { finishApRound(); return; }
        updateApView();
        // A miss waits for Next so the labelled note can be replayed and compared.
        if (correct) scheduleAutoNext(300);
    }, waitMs);
}
async function playApPitch(midi, serial, withMask = true) {
    await ensureAudio();
    if (serial !== questionSerial || !testActive || !isApMode() ||
        currentMidi !== midi || !apSession || apSession.finished || document.hidden) return;
    player.cancelQueue(audioContext); TrainingCore.cancelAudio();
    const scheduledAt = audioContext.currentTime + 0.05;
    // The pitch-memory reset precedes each new question, never a replay of the same note.
    const queueMaskNote = (pitch, when, length, volume) =>
        queueInstrumentNote(instrumentMode, pitch, when, length, volume);
    if (withMask) {
        const first = apSession.records.length === 0;
        const coldStart = first && (apSession.gapSincePracticeMs === null || apSession.afterBreak);
        const labelAt = APPitchScience.lastLabelAt();
        const long = first && apSession.kind !== "learn" && labelAt > 0 && Date.now() - labelAt < 5 * 60000;
        apSession.actualReset = apSession.masked && !coldStart ? (long ? "long" : "short") : null;
    }
    const startAt = withMask && apSession.actualReset
        ? TrainingCore.resetTones(queueMaskNote, scheduledAt, {previous: TrainingCore.recentLabel(AP_APP_ID) ?? apSession.previousTarget, long: apSession.actualReset === "long"}) + TrainingCore.resetGap()
        : scheduledAt;
    if (apSession.trialTimbre === "neutral") TrainingCore.neutralTone(audioContext, startAt, midi, PLAY_DURATION);
    else queueInstrumentNote(instrumentMode, midi, startAt);
    const clock = APFocusModel.outputClock(audioContext, startAt);
    apSoundStart = clock.when;
    apAudioLatencyMs = Math.max(0, clock.when - performance.now() - 1000 * (startAt - audioContext.currentTime));
    const active = () => serial === questionSerial && testActive && !document.hidden;
    const atOnset = await TrainingCore.waitForAudio(audioContext, startAt + apAudioLatencyMs / 1000, active);
    if (atOnset) {
        if (withMask) TrainingCore.rememberQuestion(AP_APP_ID, null, midi);
        APPitchScience.markPractice(AP_APP_ID);
        // Each permitted playback gets the same window; its replay count stays in the record.
        if (!answered) {
            apAudioReady = true;
            if (apSession.limitMs !== null) {
                placeAnswerTimer();
                answerClock.start(apSoundStart, apSession.limitMs, () => recordApAnswer(null, "timeout"));
            }
            updateApView();
        }
    }
    const played = atOnset && await TrainingCore.waitForAudio(audioContext, startAt + PLAY_DURATION + apAudioLatencyMs/1000, active);
    if (!played) {
        if (serial === questionSerial && testActive && !answered && !document.hidden) throw new Error("Audio paused");
        return;
    }
    updateApView();
}
function startApQuestion() {
    window.clearTimeout(autoNextTimer);
    if (!apSession || apSession.finished) {
        const kind = testMode === "apLearn" ? "learn" : testMode === "apCold" ? "cold" : "assessment";
        const known = kind === "assessment" ? null : APPitchScience.learned(apCourse.level);
        const learned = known ?? APFocus.learningSet();
        const total = kind === "cold" ? 20 : Number(elements.apTrialsSelect.value);
        // All three kinds use the selected range; nothing rewrites From/To.
        const plan = APPitchScience.makeSequence({from: minMidi, to: maxMidi, total, known,
            avoid: TrainingCore.recentLabel(AP_APP_ID),
            previousMidi: TrainingCore.lastQuestion(AP_APP_ID)?.target,
            knownWeights: kind === "learn" ? Object.fromEntries(
                APMemory.due(AP_APP_ID,known || []).map(x => [x.pc, x.nextAt <= Date.now() ? 2.5 : 1])) : null});
        if (plan.length !== total) {setStatus("apNeedRange"); return;}
        const lastPractice = APPitchScience.lastPracticeAt(AP_APP_ID);
        const gapSincePracticeMs = lastPractice === null ? null : Date.now() - lastPractice;
        // Informational only: evidence gathered after a break weighs more. Never a gate.
        const afterBreak = gapSincePracticeMs !== null && gapSincePracticeMs >= AP_COLD_MIN_REST_MS;
        const eligible = kind === "cold" && afterBreak;
        apHideColdAnswers = kind === "cold" && document.getElementById("apHideColdCheck").checked;
        const range = APPitchScience.effectiveRange(minMidi, maxMidi);
        apSession = {id: `${AP_APP_ID}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            kind, total, plan, records: [], known, learned, protocol:AP_PROTOCOL, repairs:[],
            timbre: document.getElementById("apTimbre").value,
            masked: document.getElementById("apMaskCheck").checked,
            limitMs: AnswerTimer.windowMs(answerLimit),
            finished: false, eligible, afterBreak, interrupted: false, hiddenCount: 0,
            gapSincePracticeMs,
            outputDevice: document.getElementById("apColdDevice").value,
            level: apCourse.level, day: APPitchScience.day(), startAt: Date.now(),
            effectiveRange: range ? [range.from, range.to] : null};
        // The local timestamp is only a break indicator; other devices are unknown.
        APPitchScience.markPractice(AP_APP_ID);
    }
    TrainingTracker.activity(apSession.kind === "learn" ? "ap-learning" : "ap-check");
    if (testActive && !answered) return;
    if (apFeedbackPlaying) return;
    clearApTimer(); clearApFeedback();
    apSession.currentRepair = false;
    apSession.pickName = apSession.pickOctave = null;
    apSession.replayed = 0;
    apSession.trialTimbre = apSession.timbre === "mixed"
        ? TrainingCore.choose(["instrument", "neutral"]) : apSession.timbre;
    if (apSession.kind === "learn" && apSession.records.length < apSession.total) {
        const repair = TrainingCore.takeRepair(apSession.repairs, apSession.records.length);
        const weights = Object.fromEntries(APMemory.due(AP_APP_ID, apSession.known).map(x=>[x.pc,TrainingCore.weight(x)]));
        const normalOptions={from:minMidi,to:maxMidi,total:1,known:apSession.known,
            knownWeights:weights,previousMidi:TrainingCore.lastQuestion(AP_APP_ID)?.target,avoid:TrainingCore.recentLabel(AP_APP_ID)};
        let next;
        if (repair !== null) {
            next=APPitchScience.makeSequence({...normalOptions,forcedPC:repair})[0];
            if (next !== undefined) apSession.currentRepair=true;
            else TrainingCore.queueRepair(apSession.repairs, repair, apSession.records.length);
        }
        if (next === undefined) next=APPitchScience.makeSequence(normalOptions)[0];
        apSession.plan[apSession.records.length]=next;
    }
    const ordinal = apSession.records.length;
    const previous = TrainingCore.lastQuestion(AP_APP_ID)?.target;
    // Recheck the last target at playback; a queued repair or another mode may have changed it.
    if (apSession.plan[ordinal] !== undefined) {
        const draw = {from:minMidi,to:maxMidi,total:1,known:apSession.known,previousMidi:previous,avoid:TrainingCore.recentLabel(AP_APP_ID)};
        const planned = APPitchScience.makeSequence({...draw,forcedPC:apSession.plan[ordinal] % 12});
        apSession.plan[ordinal] = planned[0] ?? APPitchScience.makeSequence(draw)[0];
    }
    apSession.previousTarget = Number.isInteger(previous) ? previous : null;
    const target = apSession.plan[ordinal];
    if (target === undefined) {finishApRound(); return;}
    releaseAllKeys(); window.clearTimeout(freeDisplayTimeout);
    player.cancelQueue(audioContext); TrainingCore.cancelAudio(); resetKeyboardColors();
    currentMidi = target; currentReferenceMidi = null;
    testActive = true; answered = false; apAudioReady = false; apSoundStart = null;
    questionSerial += 1;
    const serial = questionSerial;
    updatePlayButton();
    const index = apSession.records.length + 1, total = apSession.total;
    const listenKey = apSession.kind === "learn" ? "apLearnListen" : "apListen";
    setStatus(listenKey, {index, total});
    setAnswer("apChoose");
    setApMessage(() => t(listenKey, {index, total}));
    clearApButtons();
    drawStaff(null, true); updateStaffReplayAccess(); updateApView();
    playApPitch(target, serial).catch(() => {
        if (serial === questionSerial) recordApAnswer(null, "audio-error");
    });
}
function autoNextEnabled() {
    return document.getElementById("autoNextCheck").checked;
}
// One tap per question: the next one starts by itself unless the learner has
// stopped, moved on by hand, or left the page in the meantime.
function scheduleAutoNext(ms) {
    window.clearTimeout(autoNextTimer);
    if (!autoNextEnabled() || demoRunning) return;
    const serial = questionSerial;
    autoNextTimer = window.setTimeout(() => {
        if (serial === questionSerial && testActive && answered && !demoRunning && !document.hidden) newQuestion();
    }, ms);
}
function rememberToggle(id, key) {
    const box = document.getElementById(id);
    try {
        const saved = localStorage.getItem(key);
        if (saved !== null) box.checked = saved === "1";
    } catch (_) {}
    box.addEventListener("change", () => {
        try { localStorage.setItem(key, box.checked ? "1" : "0"); } catch (_) {}
    });
}
function createApAnswerButtons() {
    const keys = document.getElementById("apNameKeys"), digits = document.getElementById("apOctaveKeys");
    const extra = document.getElementById("apExtraKeys");
    function add(group, kind, value, text) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "secondary ap-note-button"; button.disabled = true;
        button.textContent = text; button.dataset[kind] = String(value);
        // Touch commits on contact. A keyboard or assistive-technology click follows the same path.
        button.addEventListener("pointerdown", unlessDemo(event => {
            if (!event.isPrimary || event.button !== 0) return;
            event.preventDefault(); pickClassic(kind,value,event);
        }));
        button.addEventListener("click", unlessDemo(event => {
            if (!event.detail) pickClassic(kind,value,event);
        }));
        group.appendChild(button);
        return button;
    }
    for (const pc of APFocusModel.keyOrder) {
        const black = APFocusModel.blackKeys.includes(pc);
        const key = add(keys, "pitchClass", pc, APFocusModel.notes[pc]);
        key.classList.toggle("af-black", black);
        key.style.gridRow = black ? "1" : "2";
        key.style.gridColumn = APFocusModel.keyColumns[pc] + " / span 2";
    }
    for (const octave of APFocusModel.octaveChoices("piano")) add(digits, "octave", octave, String(octave));
    add(extra, "pitchClass", "out", t("apNoteOther"));
    add(extra, "pitchClass", "unsure", APFocusCopy.t(currentLanguage,"unsure"));
}
function pickClassic(kind, value, event) {
    if (!testActive || answered || !apAudioReady || !apSession) return;
    const at = AnswerTimer.stamp(event);
    if (at < apSoundStart) return;
    if (answerClock.late(at)) {recordApAnswer(null,"timeout",event); return;}
    if (kind === "pitchClass" && !apSession.learned.includes(value)) {
        recordApAnswer(value,null,event); return;
    }
    if (kind === "pitchClass") apSession.pickName = value;
    else apSession.pickOctave = value;
    if (apSession.pickName !== null && apSession.pickOctave !== null) {
        recordApAnswer(apSession.pickName,null,event,apSession.pickOctave);
    } else updateClassicKeys();
}
async function exportApCSV() {
    const rows = await APPitchScience.allRows(AP_APP_ID, "trials");
    const fields = ["protocol", "timbre", "repair", "replayed", "sessionId", "day", "kind", "level", "ordinal", "pitch", "guess", "result", "correct", "rtMs", "playedAt", "submittedAt", "audibleLatencyEstimateMs", "previousPitch", "eligibleCold", "afterBreak", "source", "resetSoundOn", "pointerTimeStamp",
        "pointerX", "pointerY", "buttonIndex", "baseLatencyRaw", "outputLatencyRaw",
        "sampleRate", "outputDevice", "hiddenCount", "gapSincePracticeMs", "coldSourceRange",
        "known", "sampleId", "sourceVersion", "qualityStatus", "firstOfDay", "assistedRtMs", "timing",
        "limitMs", "lateGuess", "reset", "jump", "learned", "guessOctave", "octaveCorrect"];
    const csv = [fields.join(","), ...rows.map((row) => fields.map((name) => {
        const v = row[name] === undefined || row[name] === null ? "" : String(row[name]);
        return `"${v.replaceAll('"', '""')}"`;
    }).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url;
    link.download = `ap-${AP_APP_ID}-${APPitchScience.day()}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshApHistory() {
    const box = document.getElementById("apRecentHistory");
    if (!box) return;
    const sessions = await APPitchScience.allRows(AP_APP_ID, "sessions");
    box.replaceChildren();
    for (const s of sessions.sort((a, b) => b.started - a.started).slice(0, 8)) {
        const p = document.createElement("p");
        const where = Array.isArray(s.effectiveRange) ? ` · ${noteName(s.effectiveRange[0])}\u2013${noteName(s.effectiveRange[1])}` : "";
        p.textContent = `${s.day} · ${s.protocol >= 4 ? "v" + s.protocol : "legacy"} · L${s.level} · ${t({learn:"apLearn",cold:"apCold",consolidate:"apConsolidate",assessment:"ap"}[s.kind] || "ap")} · ${(APFocusModel.isFocus(s) ? APFocusCopy.t(currentLanguage,s.source) : t(s.timbre || "instrument"))}${where} · ${s.correct}/${s.total} \xb7 ${s.medianRt == null ? "\u2014" : (s.medianRt / 1000).toFixed(2) + "s"}`;
        if (s.kind === "cold" && !s.interrupted && !APFocusModel.isFocus(s)) p.textContent += ` · ${t(s.eligible ? "afterBreak" : "ordinaryCheck")}`;
        if (s.interrupted) p.textContent += ` · interrupted (${s.attempted ?? 0}/${s.total})`;
        box.appendChild(p);
    }
}

function updatePlayButton() {
    const shell = document.querySelector(".app-shell");
    shell.classList.toggle("training-round", testActive && !demoRunning);
    document.getElementById("demoButton").disabled = !ready || (testActive && !demoRunning);
    elements.nextButton.disabled = !ready || !testActive || !answered;
    document.querySelector(".app-shell").classList.toggle("board-test",
        testActive && (testMode === "interval" || (testMode === "rpCourse" && document.getElementById("rpActivity").value === "locate")));
    elements.playButton.textContent = t(testActive ? "stop" : testMode === "free" ? "drawNote" : "play");
    elements.playButton.classList.toggle("danger", testActive);
    elements.playButton.classList.toggle("primary", !testActive);
}

function updateIntervalPickerVisibility() {
    const visible = elements.modeSelect.value === "interval";
    document.getElementById("relativeNotes").hidden = !isRelativeMode(elements.modeSelect.value);
    elements.intervalPicker.hidden = !visible;
    elements.apPicker.hidden = !["ap", "apLearn", "apCold"].includes(elements.modeSelect.value);
    // Sound is chosen in every AP mode, round length for learning and assessment,
    // the classic menu uses the shared numeric answer-limit input.
    document.getElementById("apAssessmentOptions").hidden = !isApMode(elements.modeSelect.value);
    document.getElementById("apTrialsPicker").hidden = elements.modeSelect.value === "apCold";
    document.getElementById("apTimePicker").hidden = true; // 2.8.2: the shared answer window replaces it
    refreshApCourseUI();
    if (window.RPUI) RPUI.modeChanged();
    renderAnswerLimit();
}

function intervalTargetPools(from, to, minDistance, maxDistance, direction) {
    // Collect only feasible target/reference choices; no retry loops, even at boundaries.
    const limit = Math.min(maxDistance ?? (to - from), to - from);
    const higher = [];
    const lower = [];
    for (let target = from; target <= to; target += 1) {
        if (direction !== "lower") {
            const refMin = Math.max(from, target - limit);
            const refMax = target - minDistance;
            if (refMin <= refMax) higher.push({ target, refMin, refMax });
        }
        if (direction !== "higher") {
            const refMin = target + minDistance;
            const refMax = Math.min(to, target + limit);
            if (refMin <= refMax) lower.push({ target, refMin, refMax });
        }
    }
    return [higher, lower].filter((pool) => pool.length > 0);
}

function pickIntervalQuestion() {
    const maximum = Math.min(maxIntervalSemitones ?? Infinity, maxMidi-minMidi);
    const distances = [];
    for (let d=minIntervalSemitones; d<=maximum; d++) distances.push(d);
    return RelativePitchCourse.drawPair({low:minMidi, high:maxMidi, distances, pitchClasses:relativePitchClasses, direction:targetDirection,
        previous:TrainingCore.lastQuestion(AP_APP_ID)});
}

function newQuestion() {
    if (!ready || (testActive && !answered)) return;
    answerClock.stop();
    TrainingTracker.activity("question");
    if (isApMode()) { startApQuestion(); return; }
    if (testMode === "rpCourse") { RPUI.startNext(); return; }
    APPitchScience.markPractice(AP_APP_ID);
    releaseAllKeys();
    window.clearTimeout(freeDisplayTimeout);
    resetKeyboardColors();

    let target;
    if (testMode === "interval") {
        const pair = pickIntervalQuestion();
        if (!pair) {
            setStatus("intervalNoRepeat");
            return;
        }
        target = pair.target;
        currentReferenceMidi = pair.reference;
    } else {
        const targets = [];
        const previous = TrainingCore.lastQuestion(AP_APP_ID)?.target;
        // 2.8.2: a labelled note heard just before (free play, feedback) counts as the previous note too.
        const label = TrainingCore.recentLabel(AP_APP_ID);
        for (let pitch = minMidi; pitch <= maxMidi; pitch += 1) {
            if (!TrainingCore.sameNoteName(pitch, previous) && !TrainingCore.sameNoteName(pitch, label)) targets.push(pitch);
        }
        if (!targets.length) for (let pitch = minMidi; pitch <= maxMidi; pitch += 1) {
            if (!TrainingCore.sameNoteName(pitch, previous)) targets.push(pitch);
        }
        if (!targets.length) {
            setStatus("distinctRangeError");
            return;
        }
        target = targets[Math.floor(Math.random() * targets.length)];
        currentReferenceMidi = null;
    }

    testActive = true;
    answered = false;
    legacyAudioReady = false;
    questionSerial += 1;
    updatePlayButton();
    currentMidi = target;
    if (testMode === "interval") {
        setStatus("listenInterval", { note: spelledNoteName(currentReferenceMidi, KEY_FIFTHS[keyName]) });
        setAnswer("chooseInterval");
        markReferenceKey();
    } else {
        setStatus("listen");
        setAnswer("choose");
    }
    drawQuestionStaff();
    updateStaffReplayAccess();
    playQuestion().catch(() => setStatus("audioRetry"));
}

function abandonQualifyingCold() {
    // No streak or promotion penalty: the cold check is now optional.
    if (apSession?.kind === "cold" && !apSession.finished) {
        apSession.interrupted = true;
    }
}
function saveInterruptedApSession() {
    if (!apSession || apSession.finished) return;
    const session = apSession, metric = apMetricFor(session);
    session.interrupted = true;
    session.finished = true;
    APPitchScience.putRows(AP_APP_ID, "sessions", [{
        id:session.id, kind:session.kind, protocol:AP_PROTOCOL, timbre:session.timbre,
        day:session.day, level:session.level, started:session.startAt,
        finished:Date.now(), interrupted:true, eligible:false,
        total:session.total, attempted:session.records.length, effectiveRange:session.effectiveRange,
        range:[minMidi,maxMidi], limitMs:session.limitMs, known:session.known, ...metric
    }]);
}
function stopTest() {
    if (testMode === "rpCourse") { RPUI.stop(); return; }
    abandonQualifyingCold();
    saveInterruptedApSession();
    TrainingTracker.pause();
    clearApTimer();
    window.clearTimeout(autoNextTimer);
    setApMessage(null);
    apSession = null;
    apAudioReady = false;
    clearApFeedback();
    if (!ready) {
        return;
    }

    player.cancelQueue(audioContext); TrainingCore.cancelAudio();
    releaseAllKeys();
    testActive = false;
    currentMidi = null;
    currentReferenceMidi = null;
    questionSerial += 1;
    answered = false;
    updatePlayButton();
    updateStaffReplayAccess();

    resetKeyboardColors();
    drawStaff();

    setStatus("stopped");
    setAnswer(isApMode() ? "apStart" : "free");
    updateApView();
}

function freePlay(midi, pointerId) {
    TrainingTracker.activity("free-play");
    APPitchScience.markLabel(AP_APP_ID);
    TrainingCore.rememberLabel(midi);
    activePointers.set(pointerId, midi);
    if (!activeVoices.has(midi) && !pendingVoices.has(midi)) {
        pendingVoices.add(midi);
        ensureAudio().then(() => {
            pendingVoices.delete(midi);
            if (!testActive && !demoRunning && [...activePointers.values()].includes(midi)
                && !activeVoices.has(midi)) {
                playFreeVoice(midi);
            }
        }).catch(() => pendingVoices.delete(midi));
    }
    renderHeldNotes();
}

function answer(selectedMidi) {
    if (!demoRunning && (!testActive || answered || !legacyAudioReady)) return;
    if (!demoRunning && answerClock.late(performance.now())) { answerTimeout(); return; }
    answerClock.stop();
    TrainingTracker.activity("answer");
    answered = true;
    if (testMode === "free" && !demoRunning) testActive = false;
    questionSerial += 1;
    updatePlayButton();
    updateStaffReplayAccess();

    const correctAnswer = selectedMidi === currentMidi;
    const fifths = KEY_FIFTHS[keyName];
    const targetName = spelledNoteName(currentMidi, fifths);

    resetKeyboardColors();
    markReferenceKey();

    if (correctAnswer) {
        markPitch(selectedMidi, "correct");
    } else {
        markPitch(selectedMidi, "wrong");
        markPitch(currentMidi, "correct");
    }

    if (testMode === "interval" && currentReferenceMidi !== null) {
        const selectedDistance = selectedMidi - currentReferenceMidi;
        const correctDistance = currentMidi - currentReferenceMidi;
        const distanceText = (value) => `${value > 0 ? "+" : ""}${value}`;
        setStatus(correctAnswer ? "correctInterval" : "wrongInterval", {
            selected: distanceText(selectedDistance),
            correct: distanceText(correctDistance)
        });
        setAnswer("raw", { text: formatAnswerText() });
        drawAnsweredStaff();
        playQuestion().catch(() => setStatus("audioRetry"));
    } else {
        setStatus(correctAnswer ? "correct" : "wrong", { note: targetName });
        setAnswer("raw", { text: formatAnswerText() });
        drawStaff(currentMidi);
        playTone(currentMidi);
    }
    // A miss stays on screen until Next; a hit moves on after its feedback sound.
    if (testMode !== "free" && correctAnswer) scheduleAutoNext(testMode === "interval" ? 2000 : 1100);
}

function pressKey(midi, pointerId) {
    if (testMode === "rpCourse" && !demoRunning && RPUI.answerPosition(midi)) return;
    if (isApMode() && !demoRunning) return; // Never play a reference note in the assessment.
    if (!ready) {
        return;
    }

    if (instrumentMode === "piano" && testActive && (midi < minMidi || midi > maxMidi)) return;

    if (testActive && currentMidi !== null && !answered) {
        if (testMode === "interval" && midi === currentReferenceMidi) {
            // A marked reference key is a replay control, not a valid answer; the pair remains a replay.
            playQuestion(true).catch(() => setStatus("audioRetry"));
        } else {
            answer(midi);
        }
        return;
    }

    if (testActive) {
        playTone(midi);
        return;
    }

    freePlay(midi, pointerId);
}

function applySettings() {
    if (player) player.cancelQueue(audioContext);
    TrainingCore.cancelAudio();
    abandonQualifyingCold();
    saveInterruptedApSession();
    const startMidi = Number(elements.startNote.value);
    const endMidi = Number(elements.endNote.value);

    if (instrumentMode === "violin" &&
        (startMidi < SUPPORTED_MIN_MIDI || endMidi > SUPPORTED_MAX_MIDI)) {
        setStatus("violinRangeError");
        return;
    }
    if (startMidi > endMidi) {
        setStatus("invalidRange");
        return;
    }
    if (startMidi === endMidi) {
        setStatus("distinctRangeError");
        return;
    }
    if (["ap", "apLearn", "apCold"].includes(elements.modeSelect.value) && apEligiblePitches(startMidi, endMidi).length < 2) {
        setStatus("apNeedRange");
        return;
    }
    if (elements.modeSelect.value === "interval") {
        const minDistance = Number(elements.minIntervalSelect.value);
        const maxDistance = elements.maxIntervalSelect.value === "unlimited"
            ? null : Number(elements.maxIntervalSelect.value);
        if (maxDistance !== null && minDistance > maxDistance) {
            setStatus("invalidIntervalLimits");
            return;
        }
        const pools = intervalTargetPools(startMidi, endMidi, minDistance,
            maxDistance, elements.directionSelect.value);
        if (!pools.length) {
            setStatus("intervalNoPairs");
            return;
        }
    
    }

    if (window.RPUI) RPUI.configurationApplied();
    document.getElementById("helpText").textContent = t("hint");
    minMidi = startMidi;
    maxMidi = endMidi;
    if (isRelativeMode(elements.modeSelect.value) && !demoRunning) {
        TrainingCore.write(relativeRangeKey, [minMidi, maxMidi]);
    }
    keyName = elements.keySelect.value;
    clefMode = elements.clefSelect.value;
    testMode = elements.modeSelect.value;
    clearApTimer();
    window.clearTimeout(autoNextTimer);
    setApMessage(null);
    apSession = null;
    apAudioReady = false;
    clearApFeedback();
    maxIntervalSemitones = elements.maxIntervalSelect.value === "unlimited"
        ? null : Number(elements.maxIntervalSelect.value);
    minIntervalSemitones = Number(elements.minIntervalSelect.value);
    targetDirection = elements.directionSelect.value;
    updateIntervalPickerVisibility();

    releaseAllKeys();
    window.clearTimeout(freeDisplayTimeout);
    currentMidi = null;
    currentReferenceMidi = null;
    questionSerial += 1;
    answered = false;
    testActive = false;
    updatePlayButton();
    updateStaffReplayAccess();

    resetKeyboardColors();
    drawKeyboard();
    drawStaff();

    setStatus("range", {
        from: noteName(minMidi), to: noteName(maxMidi),
        key: keySignatureLabel(keyName), clef: t(clefMode.toLowerCase())
    });
    setAnswer(isApMode() ? "apStart" : "free");
    updateApView();
    RPUI.modeChanged();
    renderAnswerLimit();
}

const isRelativeMode = mode => mode === 'interval' || mode === 'rpCourse';
const relativeRangeKey = 'ear-relative-range-' + instrumentMode;
const relativeNotesKey = 'ear-relative-notes-' + instrumentMode;
const allPitchClasses = APFocusModel.notes.map((_, pc) => pc);
function readRelativeNotes() {
    try {
        const saved = JSON.parse(localStorage.getItem(relativeNotesKey));
        if (APFocusModel.validSet(saved)) return saved;
    } catch (_) {}
    return allPitchClasses;
}
let relativePitchClasses = readRelativeNotes();
function setRelativeNotes(next) {
    relativePitchClasses = next;
    TrainingCore.write(relativeNotesKey, next);
    renderRelativeNotes();
    RPUI.modeChanged();
    renderAnswerLimit();
}
function renderRelativeNotes() {
    const buttons = document.getElementById('relativeNoteButtons');
    buttons.replaceChildren(...allPitchClasses.map(pc => {
        const button = document.createElement('button');
        const selected = relativePitchClasses.includes(pc);
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = APFocusModel.notes[pc];
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = selected && relativePitchClasses.length === 1;
        button.onclick = () => setRelativeNotes(selected ? relativePitchClasses.filter(p=>p!==pc) : [...relativePitchClasses,pc]);
        return button;
    }));
    document.getElementById('relativeNotesLabel').textContent = APFocusCopy.t(currentLanguage,'noteFilter') + ' · ' + relativePitchClasses.length + '/12';
    const all = document.getElementById('relativeAllNotes');
    all.textContent = APFocusCopy.t(currentLanguage,'selectAll');
    all.disabled = relativePitchClasses.length === 12;
}
document.getElementById('relativeAllNotes').onclick = () => setRelativeNotes(allPitchClasses);
let priorRange = [DEFAULT_MIN_MIDI, DEFAULT_MAX_MIDI];
let customRangeEntered = false;
function relativeRange() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(relativeRangeKey)); } catch (_) {}
    if (Array.isArray(saved) && saved.length === 2 && saved.every(Number.isInteger) &&
        saved[0] >= SUPPORTED_MIN_MIDI && saved[0] < saved[1] && saved[1] <= SUPPORTED_MAX_MIDI) return saved;
    // Legacy RP course default; Two Notes has its own full-register entry rule below.
    return instrumentMode === "piano" ? [36, 95] : [SUPPORTED_MIN_MIDI, SUPPORTED_MAX_MIDI];
}
function selectExercise(mode) {
    const wasRelative = isRelativeMode(testMode), nextRelative = isRelativeMode(mode);
    const enteringTwoNotes = mode === "interval" && testMode !== "interval";
    if (wasRelative !== nextRelative || enteringTwoNotes) {
        let range = priorRange;
        if (nextRelative) {
            if (!wasRelative) priorRange = [Number(elements.startNote.value), Number(elements.endNote.value)];
            // Every entry into Two Notes starts at the instrument's complete playable range.
            // Neither a previous single-note range nor a saved legacy range can narrow it.
            // Applying a manual range while in Two Notes is still supported.
            range = enteringTwoNotes ? [SUPPORTED_MIN_MIDI, SUPPORTED_MAX_MIDI]
                : customRangeEntered ? priorRange : relativeRange();
        }
        elements.startNote.value = String(range[0]);
        elements.endNote.value = String(range[1]);
        customRangeEntered = false;
    }
    if (ready) applySettings();
    else updateIntervalPickerVisibility();
}
for (const control of [elements.startNote, elements.endNote]) {
    control.addEventListener('change', () => {customRangeEntered = true;});
}

function populateSelectors() {
    for (
        let midi = SUPPORTED_MIN_MIDI;
        midi <= SUPPORTED_MAX_MIDI;
        midi += 1
    ) {
        const startOption = document.createElement("option");
        startOption.value = String(midi);
        startOption.textContent = noteName(midi);
        elements.startNote.appendChild(startOption);

        const endOption = document.createElement("option");
        endOption.value = String(midi);
        endOption.textContent = noteName(midi);
        elements.endNote.appendChild(endOption);
    }

    KEY_OPTIONS.forEach((key) => {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = key;
        elements.keySelect.appendChild(option);
    });

    elements.startNote.value = String(DEFAULT_MIN_MIDI);
    elements.endNote.value = String(DEFAULT_MAX_MIDI);
    elements.keySelect.value = "C major";
    elements.clefSelect.value = "Treble";
    const unlimited = document.createElement("option");
    unlimited.value = "unlimited";
    elements.maxIntervalSelect.appendChild(unlimited);
    for (let semitones = 1; semitones <= 24; semitones += 1) {
        const option = document.createElement("option");
        option.value = String(semitones);
        option.textContent = String(semitones);
        elements.maxIntervalSelect.appendChild(option);
    }
    elements.maxIntervalSelect.value = "unlimited";
    for (let semitones = 1; semitones <= 24; semitones += 1) {
        const option = document.createElement("option");
        option.value = String(semitones);
        option.textContent = String(semitones);
        elements.minIntervalSelect.appendChild(option);
    }
    elements.minIntervalSelect.value = "1";
    elements.directionSelect.value = "both";
    elements.modeSelect.value = "single";
    elements.instrumentSelect.value = instrumentMode;
}

function initializeAudio() {
    document.getElementById("audioReload").hidden=true;
    setStatus("loading");
    setControlsEnabled(false);
    if (player === null) {
        setStatus("audioError");
        document.getElementById("audioReload").hidden=false;
        return;
    }
    loadInstrumentPreset().then(() => {
        ready = true;
        setControlsEnabled(true);
        const initialMode = pageOptions.get("mode");
        if (!["#ap", "#iv"].includes(location.hash) && ["single", "interval", "free"].includes(initialMode)) {
            elements.modeSelect.value = initialMode;
            selectExercise(initialMode);
        }
        setStatus("ready");
        setAnswer("free");
        document.getElementById("demoButton").disabled = false;
        updatePlayButton();updateApView();
    }).catch(() => {
        setStatus("audioError");document.getElementById("audioReload").hidden=false;
    });
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const button = document.getElementById("updateButton");
    let reloading = false, lastCheck = Date.now();
    // A new version never takes over during training. It waits until the learner
    // taps the button (outside a round) or closes every window of the app.
    const offer = (registration) => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;
        button.hidden = false;
        button.onclick = () => {
            if (testActive || demoRunning || APFocus.busy() || IntervalFocus.busy() || !registration.waiting) return;
            reloading = true; button.disabled = true;
            registration.waiting.postMessage({type: "SKIP_WAITING"});
        };
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) location.reload(); });
    navigator.serviceWorker.register("./service-worker.js").then((registration) => {
        offer(registration);
        registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (worker) worker.addEventListener("statechange", () => { if (worker.state === "installed") offer(registration); });
        });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden || testActive || Date.now() - lastCheck < 3600000) return;
            lastCheck = Date.now();
            registration.update().catch(() => {});
        });
    }).catch(() => {});
}

const unlessDemo = (callback) => (event) => {
    if (!demoRunning) callback(event);
};

async function switchInstrument() {
    const next = elements.instrumentSelect.value;
    if (next === instrumentMode) return;
    if (testActive || demoRunning) {
        elements.instrumentSelect.value = instrumentMode;
        return;
    }
    const url = new URL(location.href);
    if (next === "piano") url.searchParams.set("instrument", "piano");
    else url.searchParams.delete("instrument");
    if (!["#ap", "#iv"].includes(location.hash) && testMode !== "single") url.searchParams.set("mode", testMode);
    else url.searchParams.delete("mode");

    const shell = document.querySelector(".app-shell");
    shell.inert = true;
    try {
        await APFocus.leaveInstrument();
        await IntervalFocus.leaveInstrument();
        TrainingTracker.pause();
        await RelativePitchCourse.whenSaved(instrumentMode);
        await APPitchScience.flushWrites();
        location.replace(url.href);
    } catch (_) {
        shell.inert = false;
        elements.instrumentSelect.value = instrumentMode;
        TrainingCore.storageError();
    }
}
elements.instrumentSelect.addEventListener("change", switchInstrument);
window.addEventListener("pageshow", () => {
    document.querySelector(".app-shell").inert = false;
    elements.instrumentSelect.value = instrumentMode;
});

// Users choose difficulty directly; cold checks remain a measurement, not a lock.
const apLevelSelect = document.getElementById("apLevelSelect");
for (let level = 1; level <= 12; level++) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `${level} / 12`;
    apLevelSelect.appendChild(option);
}
apLevelSelect.value = String(apCourse.level);
apLevelSelect.addEventListener("change", unlessDemo(() => {
    if (apSession && !apSession.finished) {
        apLevelSelect.value = String(apCourse.level);
        return;
    }
    const selected = Number(apLevelSelect.value);
    if (!Number.isInteger(selected) || selected < 1 || selected > 12) return;
    apCourse.level = selected;
    apCourse.courseVersion = 4;
    APPitchScience.saveCourse(AP_APP_ID, apCourse);
    apSession = null;
    testActive = false;
    answered = false;
    updateApView();
    renderAnswerLimit();
}));
elements.applyButton.addEventListener("click", unlessDemo(applySettings));
elements.modeSelect.addEventListener("change", unlessDemo(() => {
    selectExercise(elements.modeSelect.value);
}));
elements.playButton.addEventListener("click", unlessDemo(() => {
    if (testActive) stopTest();
    else newQuestion();
}));
elements.nextButton.addEventListener("click", unlessDemo(newQuestion));
elements.intervalReplayButton.addEventListener("click", unlessDemo(() => {
    if (testActive && testMode === "interval") {
        TrainingTracker.activity("question");
        playQuestion(true);
    }
}));
document.getElementById("languageSelect").addEventListener("change", unlessDemo((event) => setLanguage(event.target.value)));
function invalidateHiddenAp() {
    if (!apSession || apSession.finished || !isApMode()) return;
    if (apSession.kind === "cold") {
        apSession.interrupted = true;
        apSession.hiddenCount = (apSession.hiddenCount || 0) + 1;
        if (answered) setStatus("apColdInvalidated");
    }
    if (testActive && !answered) recordApAnswer(null, "interrupted");
}
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        if (testActive && !isApMode() && testMode !== "rpCourse" && !demoRunning) stopTest();
        invalidateHiddenAp();
        releaseAllKeys();
        if (demoRunning) {
            cancelDemo();
        }
    }
});
window.addEventListener("blur", () => {
    invalidateHiddenAp();
    if (testActive && !isApMode() && testMode !== "rpCourse" && !demoRunning) stopTest();
    releaseAllKeys();
});
window.addEventListener("pagehide", abandonQualifyingCold);

document.getElementById("audioReload").addEventListener("click", () => location.reload());
document.getElementById("appVersion").textContent = APP_VERSION;
populateSelectors();
createApAnswerButtons();
rememberToggle("apMaskCheck", AP_MASK_KEY);
rememberToggle("autoNextCheck", AUTO_NEXT_KEY);
RPUI.init();
document.getElementById("answerLimitSelect").addEventListener("change", (event) => {
    answerLimit = AnswerTimer.parse(event.target.value, answerLimit);
    AnswerTimer.save(answerLimit);
    event.target.value = AnswerTimer.text(answerLimit, currentLanguage);
    renderAnswerLimit();
});
for (const id of ["rpLevel", "rpActivity"]) document.getElementById(id).addEventListener("change", renderAnswerLimit);
// The touch that starts an interval answer decides it, even if the click lands after the deadline.
document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Element && event.target.closest(".rp-choice")) answerClock.press(AnswerTimer.stamp(event));
}, true);
document.addEventListener("pointercancel", () => answerClock.release(), true);
document.getElementById("apExportButton").addEventListener("click", exportApCSV);
document.getElementById("apRepeatNote").addEventListener("click", unlessDemo(() => {
    if (testMode !== "apLearn" || !apSession || apSession.finished || apFeedbackPlaying || currentMidi === null) return;
    TrainingTracker.activity("ap-learning");
    if (answered) playTone(currentMidi).catch(() => setStatus("audioRetry"));
    else if (apAudioReady) {
        if (answerClock.late(performance.now())) {recordApAnswer(null, "timeout"); return;}
        apSession.pickName = apSession.pickOctave = null;
        apSession.replayed=(apSession.replayed||0)+1;apAudioReady=false;answerClock.stop();updateApView();
        playApPitch(currentMidi,questionSerial,false).catch(()=>setStatus("audioRetry"));
    }
}));
window.addEventListener("training-storage-error", () => {
    const warning=document.getElementById("storageWarning");warning.hidden=false;warning.textContent=t("storageWarning");
});

refreshApHistory();
updateIntervalPickerVisibility();
setLanguage(resolveInitialLanguage());
drawKeyboard();
drawStaff();
function redrawViolinBoard() {
    releaseAllKeys();
    drawKeyboard();
    if (testActive && testMode === "interval" && currentReferenceMidi !== null) markPitch(currentReferenceMidi,"reference");
    if (testActive && ["single","interval"].includes(testMode) && answered && currentMidi !== null) markPitch(currentMidi,"correct");
    if (testMode === "rpCourse") RPUI.redraw();
}
if (window.ResizeObserver) {
    // v2.3.1 drew the board 300 px wide whenever it was hidden at draw time (after any AP
    // mode): the E string was cut off on 320 px screens and a blank strip appeared on wider ones.
    new ResizeObserver(() => {
        const width = elements.keyboardScroller.clientWidth;
        if (instrumentMode !== "violin" || demoRunning || !width || width === violinDrawnWidth) return;
        redrawViolinBoard();
    }).observe(elements.keyboardScroller);
}
window.addEventListener("resize", () => {
    if (!demoRunning && instrumentMode === "violin") redrawViolinBoard();
});
initializeAudio();
registerServiceWorker();
APFocus.init({
    site: AP_APP_ID, context: audioContext, language: () => currentLanguage, text: t,
    loadInstrumentPreset, queueInstrumentNote,
    onEnter() {
        if (demoRunning) cancelDemo();
        if (testActive || (apSession && !apSession.finished)) stopTest();
        releaseAllKeys();
        player?.cancelQueue(audioContext);
        TrainingCore.cancelAudio();
    },
    remember(midi) {
        TrainingCore.rememberQuestion(AP_APP_ID, null, midi);
    },
    onExit: refreshApHistory
});
// 2.8.2: focused interval practice shares the clock, the instrument and the last-question record.
IntervalFocus.init({
    site: AP_APP_ID, context: audioContext, language: () => currentLanguage, text: t,
    loadInstrumentPreset, queueInstrumentNote,
    onEnter() {
        if (demoRunning) cancelDemo();
        if (testActive || (apSession && !apSession.finished)) stopTest();
        releaseAllKeys();
        player?.cancelQueue(audioContext);
        TrainingCore.cancelAudio();
    },
    remember(reference, target) {
        TrainingCore.rememberQuestion(AP_APP_ID, reference, target);
    },
    onExit: refreshApHistory
});


function midiFromName(name) {
    const match = name.match(/^([A-G])(#|b)?(-?\d+)$/);

    if (!match) {
        throw new Error(`Invalid note name: ${name}`);
    }

    const pitchClasses = {
        C: 0,
        D: 2,
        E: 4,
        F: 5,
        G: 7,
        A: 9,
        B: 11
    };

    let pitchClass = pitchClasses[match[1]];

    if (match[2] === "#") {
        pitchClass += 1;
    } else if (match[2] === "b") {
        pitchClass -= 1;
    }

    const octave = Number(match[3]);

    return 12 * (octave + 1) + pitchClass;
}

function sleep(ms) {
    return new Promise((resolve) => {
        const finish = () => {
            window.clearTimeout(timer);
            demoWaits.delete(finish);
            resolve();
        };
        const timer = window.setTimeout(finish, ms);
        demoWaits.add(finish);
    });
}

function cancelDemo() {
    demoCancelled = true;
    if (player) player.cancelQueue(audioContext); TrainingCore.cancelAudio();
    if (demoTimer !== null) {
        window.clearInterval(demoTimer);
        demoTimer = null;
    }
    if (demoResolve !== null) {
        const resolve = demoResolve;
        demoResolve = null;
        resolve();
    }
    for (const finish of [...demoWaits]) finish();
}

function createDemoInterface() {
    const button = document.getElementById("demoButton");
    button.addEventListener("click", () => {
        if (demoRunning) {
            cancelDemo();
        } else {
            runDemo();
        }
    });
    const pointer = document.createElement("div");
    pointer.id = "demoPointer";
    document.body.appendChild(pointer);
}

function demoPointer() {
    return document.getElementById("demoPointer");
}

async function pointToElement(element, tap = true) {
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    const pointer = demoPointer();
    const rect = element.getBoundingClientRect();

    pointer.style.left = `${rect.left + rect.width / 2}px`;
    pointer.style.top = `${rect.top + rect.height / 2}px`;
    pointer.classList.add("visible");

    await sleep(330);

    if (tap) {
        pointer.classList.add("tap");
        await sleep(150);
        pointer.classList.remove("tap");
    }
}

function hideDemoPointer() {
    const pointer = demoPointer();
    pointer.classList.remove("visible", "tap");
}

function setDemoControlsLocked(locked) {
    const button = document.getElementById("demoButton");
    button.disabled = !ready;
    button.textContent = locked ? t("stopDemo") : t("demo");
}

function startDemoQuestion(midi, referenceMidi = null) {
    resetKeyboardColors();
    testActive = true;
    questionSerial += 1;
    currentMidi = midi;
    currentReferenceMidi = testMode === "interval" ? referenceMidi : null;
    answered = false;
    updatePlayButton();
    drawQuestionStaff();
    updateStaffReplayAccess();
    if (testMode === "interval") {
        setStatus("listenInterval", { note: spelledNoteName(referenceMidi, KEY_FIFTHS[keyName]) });
        setAnswer("chooseInterval");
        markReferenceKey();
    } else {
        setStatus("listen");
        setAnswer("choose");
    }
    playQuestion();
}

async function demoAnswer(selectedMidi) {
    const key = keyElements.get(selectedMidi);
    if (instrumentMode === "piano") key?.scrollIntoView({block: "nearest", behavior: "instant"});
    await pointToElement(key);
    answer(selectedMidi);
}

const demoScore = DEMO_SCORES[instrumentMode];
const DEMO_TEMPO = instrumentMode === "violin" ? 132 : 100;
const DEMO_GAP_SECONDS = 0.025;
const DEMO_MELODY_VOLUME = 0.72;

function prepareDemoEvents(data) {
    return data.events
        .filter((event) => event.part === "melody")
        .map((event) => ({ ...event, volume: DEMO_MELODY_VOLUME }))
        .sort((a, b) => a.start - b.start || a.midi - b.midi);
}

const DEMO_EVENTS = prepareDemoEvents(demoScore);

function buildDemoMusicPointers() {
    if (document.querySelector(".demo-music-pointer")) return;
    for (let i = 0; i < 5; i += 1) {
        const pointer = document.createElement("div");
        pointer.className = "demo-music-pointer";
        document.body.appendChild(pointer);
    }
}

function hideDemoMusicPointers() {
    document.querySelectorAll(".demo-music-pointer").forEach((pointer) => {
        pointer.classList.remove("visible");
    });
}

function renderDemoChord(events) {
    const midis = [...new Set(events.map((event) => event.midi))].sort((a, b) => a - b);
    renderNotes(midis, { keepStatus: true });
    const view = elements.keyboardScroller.getBoundingClientRect();
    const visible = midis.map((midi) => keyElements.get(midi)?.getBoundingClientRect()).filter(
        (rect) => rect && rect.right > view.left + 6 && rect.left < view.right - 6
    );
    const pointers = [...document.querySelectorAll(".demo-music-pointer")];
    pointers.forEach((pointer, index) => {
        const rect = visible[index];
        if (!rect) {
            pointer.classList.remove("visible");
            return;
        }
        pointer.style.left = `${(Math.max(rect.left, view.left) + Math.min(rect.right, view.right)) / 2}px`;
        pointer.style.top = `${rect.top + Math.min(rect.height * 0.7, 150)}px`;
        pointer.classList.add("visible");
    });
}

async function playInstrumentDemo() {
    await ensureAudio();
    if (demoCancelled) return;
    player.cancelQueue(audioContext); TrainingCore.cancelAudio();
    buildDemoMusicPointers();
    setStatus("demoTitle");
    const data = demoScore;
    const secondsPerTick = (60 / DEMO_TEMPO) / data.ticksPerQuarter;
    const startTime = audioContext.currentTime + 0.18;
    const events = DEMO_EVENTS;
    const finalTick = data.stopTick;
    let next = 0;
    let previousSignature = null;

    await new Promise((resolve) => {
        demoResolve = resolve;
        demoTimer = window.setInterval(() => {
            if (demoCancelled || document.hidden) {
                cancelDemo();
                return;
            }
            const now = audioContext.currentTime;
            const tick = Math.max(0, (now - startTime) / secondsPerTick);
            const horizon = now + 0.20;
            while (next < events.length && startTime + events[next].start * secondsPerTick < horizon) {
                const event = events[next++];
                const duration = Math.max(
                    0.05,
                    (event.end - event.start) * secondsPerTick - DEMO_GAP_SECONDS
                );
                player.queueWaveTable(
                    audioContext, audioContext.destination, demoPreset(),
                    startTime + event.start * secondsPerTick,
                    event.midi, duration, event.volume
                );
            }
            const sounding = events.filter((event) => event.start <= tick && tick < event.end);
            const signature = sounding.map((event) => event.midi).sort((a, b) => a - b).join(",");
            if (signature !== previousSignature) {
                renderDemoChord(sounding);
                previousSignature = signature;
            }
            if (tick >= finalTick + 0.25 * data.ticksPerQuarter) {
                window.clearInterval(demoTimer);
                demoTimer = null;
                demoResolve = null;
                resolve();
            }
        }, 25);
    });
    hideDemoMusicPointers();
    resetKeyboardColors();
}


function captureDemoSnapshot() {
    return {
        applied: { minMidi, maxMidi, keyName, clefMode, testMode, maxIntervalSemitones, minIntervalSemitones, targetDirection },
        form: {
            startNote: elements.startNote.value,
            endNote: elements.endNote.value,
            keySelect: elements.keySelect.value,
            clefSelect: elements.clefSelect.value,
            modeSelect: elements.modeSelect.value,
            maxIntervalSelect: elements.maxIntervalSelect.value,
            minIntervalSelect: elements.minIntervalSelect.value,
            directionSelect: elements.directionSelect.value,
            apTrialsSelect: elements.apTrialsSelect.value,
            apTimeSelect: elements.apTimeSelect.value
        },
        state: { testActive, answered, currentMidi, currentReferenceMidi },
        ap: {session: apSession ? { ...apSession, records: apSession.records.map((entry) => ({...entry})) } : null,
            remainingMs: apDeadline === null ? null : Math.max(0, apDeadline - Date.now()),
            audioReady: apAudioReady, message: apMessageBuild},
        status: { ...statusMessage },
        answer: { ...answerMessage },
        keyClasses: [...keyElements.entries()].map(([midi, element]) => ({
            midi,
            state: ["correct", "wrong", "reference"].filter((name) => element.classList.contains(name))
        })),
        pageScrollY: window.scrollY
    };
}

function restoreDemoSnapshot(snapshot) {
    const { applied, form, state } = snapshot;
    elements.startNote.value = String(applied.minMidi);
    elements.endNote.value = String(applied.maxMidi);
    elements.keySelect.value = applied.keyName;
    elements.clefSelect.value = applied.clefMode;
    elements.modeSelect.value = applied.testMode;
    elements.maxIntervalSelect.value = applied.maxIntervalSemitones === null
        ? "unlimited" : String(applied.maxIntervalSemitones);
    elements.minIntervalSelect.value = String(applied.minIntervalSemitones);
    elements.directionSelect.value = applied.targetDirection;
    elements.apTrialsSelect.value = form.apTrialsSelect;
    elements.apTimeSelect.value = form.apTimeSelect;
    applySettings();

    elements.startNote.value = form.startNote;
    elements.endNote.value = form.endNote;
    elements.keySelect.value = form.keySelect;
    elements.clefSelect.value = form.clefSelect;
    elements.modeSelect.value = form.modeSelect;
    elements.maxIntervalSelect.value = form.maxIntervalSelect;
    elements.minIntervalSelect.value = form.minIntervalSelect;
    elements.directionSelect.value = form.directionSelect;
    elements.apTrialsSelect.value = form.apTrialsSelect;
    elements.apTimeSelect.value = form.apTimeSelect;
    updateIntervalPickerVisibility();
    testActive = state.testActive;
    answered = state.answered;
    currentMidi = state.currentMidi;
    currentReferenceMidi = state.currentReferenceMidi;
    apSession = snapshot.ap.session;
    apAudioReady = snapshot.ap.audioReady;
    setApMessage(snapshot.ap.message);
    if (apSession && isApMode() && testActive && !answered && snapshot.ap.remainingMs !== null) {
        const remaining = Math.max(1, snapshot.ap.remainingMs);
        apDeadline = Date.now() + remaining;
        apTimer = window.setTimeout(() => recordApAnswer(null), remaining);
    }
    questionSerial += 1;
    updatePlayButton();
    updateStaffReplayAccess();

    resetKeyboardColors();
    snapshot.keyClasses.forEach(({ midi, state: classNames }) => {
        const key = keyElements.get(midi);
        if (key) classNames.forEach((name) => markPitch(midi, name));
    });
    if (!isApMode() && testActive && currentMidi !== null && answered) {
        drawAnsweredStaff();
    } else {
        drawQuestionStaff();
    }
    setStatus(snapshot.status.key, snapshot.status.args);
    setAnswer(snapshot.answer.key, snapshot.answer.args);
    updateApView();
    window.scrollTo({ top: snapshot.pageScrollY, behavior: "instant" });
}

async function runDemo() {
    if (!ready || demoRunning) return;
    if (testActive) { setStatus("apBlockedDuringTest"); return; }
    APPitchScience.markPractice(AP_APP_ID);
    TrainingTracker.pause();
    const snapshot = captureDemoSnapshot();
    clearApTimer();
    demoRunning = true;
    demoCancelled = false;
    document.querySelector(".app-shell").classList.remove("ap-mode");
    document.querySelector(".app-shell").classList.add("demo-running");
    setDemoControlsLocked(true);

    try {
        await ensureAudio();
        if (demoCancelled) return;
        player.cancelQueue(audioContext); TrainingCore.cancelAudio();
        releaseAllKeys();
        elements.startNote.value = String(midiFromName("C4"));
        elements.endNote.value = String(midiFromName("B4"));
        elements.keySelect.value = "C major";
        elements.clefSelect.value = "Treble";
        elements.modeSelect.value = "single";

        await pointToElement(elements.applyButton);
        if (demoCancelled) return;
        applySettings();
        await sleep(400);

        if (demoCancelled) return;
        await pointToElement(elements.playButton);
        if (demoCancelled) return;
        startDemoQuestion(midiFromName("F#4"));
        await sleep(750);

        if (demoCancelled) return;
        await demoAnswer(midiFromName("G4"));
        if (demoCancelled) return;
        await sleep(750);

        if (demoCancelled) return;
        await pointToElement(elements.nextButton);
        if (demoCancelled) return;
        startDemoQuestion(midiFromName("A4"));
        await sleep(720);

        if (demoCancelled) return;
        await demoAnswer(midiFromName("A4"));
        if (demoCancelled) return;
        await sleep(720);

        if (demoCancelled) return;
        await pointToElement(elements.playButton);
        if (demoCancelled) return;
        stopTest();
        await sleep(280);

        // Demonstrate two-note training before the instrument's score excerpt.
        if (demoCancelled) return;
        elements.modeSelect.value = "interval";
        await pointToElement(elements.modeSelect);
        if (demoCancelled) return;
        await pointToElement(elements.applyButton);
        if (demoCancelled) return;
        applySettings();
        await sleep(230);
        if (demoCancelled) return;
        await pointToElement(elements.playButton);
        if (demoCancelled) return;
        startDemoQuestion(midiFromName("A4"), midiFromName("F4"));
        await sleep(1850);
        if (demoCancelled) return;
        await demoAnswer(midiFromName("A4"));
        if (demoCancelled) return;
        await sleep(1950); // Let the two-note feedback replay complete.
        if (demoCancelled) return;
        await pointToElement(elements.playButton);
        if (demoCancelled) return;
        stopTest();
        await sleep(280);

        if (demoCancelled) return;
        elements.startNote.value = String(midiFromName("C4"));
        elements.endNote.value = String(midiFromName(instrumentMode === "violin" ? "E5" : "B5"));
        elements.keySelect.value = instrumentMode === "violin" ? "D major" : "Db major";
        elements.clefSelect.value = "Treble";
        elements.modeSelect.value = "single";
        await pointToElement(elements.applyButton);
        if (demoCancelled) return;
        applySettings();
        await sleep(350);

        if (demoCancelled) return;
        hideDemoPointer();
        setStatus("demoFree");
        setAnswer("raw", { text: t("demoTitle") });
        await sleep(320);
        if (demoCancelled) return;
        document.querySelector(".keyboard-card").scrollIntoView({ block: "end", behavior: "instant" });
        await playInstrumentDemo();
    } finally {
        hideDemoPointer();
        hideDemoMusicPointers();
        if (demoTimer !== null) {
            window.clearInterval(demoTimer);
            demoTimer = null;
        }
        demoResolve = null;
        player.cancelQueue(audioContext); TrainingCore.cancelAudio();
        demoRunning = false;
        demoCancelled = false;
        releaseAllKeys();
        window.clearTimeout(freeDisplayTimeout);
        document.querySelector(".app-shell").classList.remove("demo-running", "demo-music");
        restoreDemoSnapshot(snapshot);
        setDemoControlsLocked(false);
    }
}


createDemoInterface();
