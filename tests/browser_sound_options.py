"""Sound selection and pre-practice audition integration tests.

Runs the real controller, pointer/click handlers, WebAudioFont presets and
storage writes in Chromium. Random questions/timbres are made deterministic;
audio scheduling itself is not mocked. The ordinary entry is inlined because
managed browsers may block local URL navigation. This does not test PWA updates
or subjective sound quality on a physical phone.
"""
import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ENTRY = sys.argv[1] if len(sys.argv) > 1 else "index.html"
INSTRUMENT = sys.argv[2] if len(sys.argv) > 2 else "violin"
OTHER = "piano" if INSTRUMENT == "violin" else "violin"


def document(instrument, stored=None):
    html = (ROOT / ENTRY).read_text(encoding="utf-8")
    if ENTRY == "index.html":
        def inline(match):
            name = match[1]
            source = (ROOT / name).read_text(encoding="utf-8")
            if name == "app.js":
                source = "\n".join(
                    (ROOT / "vendor" / name).read_text(encoding="utf-8")
                    for name in ["0000_JCLive_sf2_file.js", "0400_JCLive_sf2_file.js"]
                ) + "\n" + source
            return "<script>\n" + source + "\n</script>"
        html = re.sub(r'<script src="\./([^\"]+)"></script>', inline, html)
        html = re.sub(
            r'<link rel="stylesheet" href="\./([^\"]+)">',
            lambda match: "<style>\n" + (ROOT / match[1]).read_text(encoding="utf-8") + "\n</style>",
            html,
        )
    # The storage shim supplies an origin-independent store for real data code.
    storage = json.dumps(stored or {}).replace("</", "<\\/")
    shim = """<head><script>{const store=STORED;
    Object.defineProperty(window,'localStorage',{value:new Proxy(store,{get(t,k){
      if(k==='getItem')return key=>Object.prototype.hasOwnProperty.call(t,key)?t[key]:null;
      if(k==='setItem')return (key,value)=>{t[key]=String(value)};
      if(k==='removeItem')return key=>delete t[key];
      if(k==='clear')return ()=>{for(const k in t)delete t[k]};
      return t[k];}})});}</script>""".replace("STORED", storage)
    return html.replace("<head>", shim, 1).replace(
        "const pageOptions = new URLSearchParams(location.search);",
        f'const pageOptions = new URLSearchParams("instrument={instrument}");',
        1,
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get("EAR_TRAINER_CHROMIUM", "/usr/bin/chromium"), headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
    )
    context = browser.new_context(
        viewport={"width": 320 if INSTRUMENT == "piano" else 390, "height": 844},
        is_mobile=True, has_touch=True, service_workers="block",
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_content(document(INSTRUMENT), wait_until="domcontentloaded")
    page.wait_for_function("ready", timeout=20000)
    assert page.text_content("#appVersion") == "3.0.8"
    assert page.locator("#soundSelect option").evaluate_all("options=>options.map(o=>o.value)") == ["piano", "violin", "mixed"]
    assert page.locator("#soundSelect").input_value() == INSTRUMENT
    page.evaluate("""() => {
      window.sounds=[];window.timbreDraws=[];window.mixedSound='piano';window.mixedQueue=[];
      window.cancelCalls=0;
      const original=player.queueWaveTable.bind(player);
      player.queueWaveTable=(context,destination,preset,at,midi,duration,volume,...rest)=>{
        const sound=preset===window._tone_0000_JCLive_sf2_file?'piano':
          (preset===violinTuned||preset===window._tone_0400_JCLive_sf2_file)?'violin':'unknown';
        const voice=original(context,destination,preset,at,midi,duration,volume,...rest);
        sounds.push({sound,midi,at,duration,phase});
        return voice;
      };
      const cancel=player.cancelQueue.bind(player);
      player.cancelQueue=(...args)=>{cancelCalls++;return cancel(...args);};
      const draw=UnifiedModel.drawTimbre;
      UnifiedModel.drawTimbre=mode=>{
        const sound=mode==='mixed'?(mixedQueue.shift()??mixedSound):draw(mode);
        timbreDraws.push({mode,sound});return sound;
      };
      let ap=0;
      UnifiedModel.drawAP=()=>[65,67][ap++%2];
      UnifiedModel.drawRP=()=>({reference:60,target:67,size:7,direction:'higher'});
    }""")

    def tap(selector):
        page.locator(selector).tap()

    def clear():
        page.evaluate("sounds=[]")

    def played():
        return page.evaluate("sounds.map(({sound,midi})=>({sound,midi}))")

    def wait_sounds(count):
        page.wait_for_function("count=>sounds.length>=count", arg=count)

    def expect_notes(notes, sound):
        wait_sounds(len(notes))
        expected = [{"sound": sound, "midi": midi} for midi in notes]
        assert played() == expected, (played(), expected)

    def select_sound(sound):
        page.locator("#soundSelect").select_option(sound)
        page.wait_for_function("ready")
        assert page.evaluate("cfg.timbre") == sound

    def answer_phase():
        page.wait_for_function("phase==='answer'", timeout=15000)

    def done():
        page.wait_for_function("phase==='done'")

    def start():
        tap("#playButton")
        answer_phase()

    def stop():
        tap("#playButton")
        assert page.evaluate("!testActive&&phase==='idle'")

    def ap_correct():
        pitch = page.evaluate("trial.target")
        if pitch % 12 in page.evaluate("session.known"):
            tap(f'#apNameKeys [data-pc="{pitch % 12}"]')
            tap(f'#apOctaveKeys [data-octave="{pitch // 12 - 1}"]')
        else:
            tap("#otherButton")
        done()
        assert page.evaluate("trial.correct")

    # Settings preview: explicit pitches, arbitrary order, no autoplay.
    def preview(midi):
        tap(f'#selectionPreviewKeys [data-preview-midi="{midi}"]')

    def available():
        return page.locator('#selectionPreviewKeys button').evaluate_all(
            'buttons=>buttons.map(b=>Number(b.dataset.previewMidi))')

    select_sound(OTHER)
    assert available() == [65,77]
    clear()
    preview(77)
    expect_notes([77],OTHER)
    page.wait_for_function("document.getElementById('selectionPreviewLabel').textContent.includes('F5')")
    page.wait_for_timeout(1100)
    expect_notes([77],OTHER)  # no automatically scheduled next note
    preview(77)
    expect_notes([77,77],OTHER)
    preview(65)
    expect_notes([77,77,65],OTHER)
    assert page.evaluate("!testActive&&session===null&&trial===null")
    page.wait_for_function("TrainingCore.recentLabel(instrumentMode)===65")
    assert page.evaluate("S.lastLabelAt(instrumentMode)") > 0

    # Both answer interfaces expose identical manual audition keys.
    page.locator('#displaySelect').select_option('instrument')
    assert available() == [65,77]
    page.locator('#displaySelect').select_option('buttons')
    tap('#learningNotes [data-pc="4"]')
    assert available() == [64,65,76,77]
    select_sound('mixed')
    page.evaluate("mixedQueue=['piano','violin','piano','violin']")
    clear()
    for i,midi in enumerate([77,64,77,76]):
        preview(midi)
        wait_sounds(i+1)
    assert played() == [
        {"sound":"piano","midi":77},{"sound":"violin","midi":64},
        {"sound":"piano","midi":77},{"sound":"violin","midi":76},
    ], played()
    page.wait_for_timeout(1000)
    assert len(played()) == 4

    # Settings changes cancel playback; a removed pitch is no longer offered.
    clear()
    preview(64)
    wait_sounds(1)
    select_sound(OTHER)
    page.wait_for_timeout(900)
    assert len(played()) == 1
    assert page.evaluate('selectionPreview===null')
    clear()
    preview(64)
    wait_sounds(1)
    tap('#learningNotes [data-pc="4"]')
    assert available() == [65,77]
    page.wait_for_timeout(900)
    assert len(played()) == 1
    assert page.locator('#selectionPreviewKeys .audition,#learningNotes .audition,#octaves .audition').count() == 0

    # Partial octaves must not introduce out-of-range preview keys.
    partial = 8 if INSTRUMENT == 'piano' else 6
    tap(f'#octaves [data-octave="{partial}"]')
    tap('#octaves [data-octave="4"]')
    tap('#octaves [data-octave="5"]')
    assert available() == []
    tap('#octaves [data-octave="4"]')
    tap('#octaves [data-octave="5"]')
    tap(f'#octaves [data-octave="{partial}"]')
    assert available() == [65,77]

    # A lifecycle interruption also stops preview without creating a session.
    clear()
    preview(65)
    wait_sounds(1)
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    page.wait_for_timeout(900)
    assert len(played()) == 1
    assert page.evaluate("!testActive&&session===null&&trial===null&&selectionPreview===null")

    # Fixed sound: AP question, replay, correction and button audition all agree.
    page.locator("#displaySelect").select_option("buttons")
    page.locator("#answerLimitSelect").fill("0")
    page.locator("#answerLimitSelect").press("Tab")
    tap("#commonSettings details summary")
    page.locator("#autoNextCheck").uncheck()
    page.locator("#maskCheck").check()
    clear()
    start()
    assert page.evaluate("trial.timbre") == OTHER
    assert played()[-1] == {"sound": OTHER, "midi": 65}, played()
    assert page.evaluate("trial.sampleId===APFocusModel.sampleId(trial.timbre,trial.pitch)")
    assert page.evaluate("trial.source") == INSTRUMENT
    clear()
    tap("#replayButton")
    answer_phase()
    expect_notes([65], OTHER)
    clear()
    tap("#otherButton")  # F belongs to the selected learning set, so this is wrong.
    done()
    assert page.evaluate("!trial.correct&&session.total===1")
    expect_notes([65], OTHER)
    clear()
    tap('#apNameKeys [data-pc="7"]')
    expect_notes([67], OTHER)
    assert page.evaluate("session.total===1&&session.reviewPaused")
    clear()
    tap("#nextButton")
    answer_phase()
    assert page.evaluate("3<=trial.resetNoteCount&&trial.resetNoteCount<=4")
    assert len(played()) == page.evaluate("trial.resetNoteCount+1")
    assert all(note["sound"] == OTHER for note in played()), played()
    ap_correct()
    stop()
    select_sound(INSTRUMENT)
    clear()
    tap('#apNameKeys [data-pc="0"]')
    expect_notes([60], INSTRUMENT)

    # Mixed AP is chosen per question and retained on replay/review.
    select_sound("mixed")
    page.evaluate("mixedSound='piano';mixedQueue=[]")
    clear()
    start()
    assert page.evaluate("session.timbre==='mixed'&&trial.timbre==='piano'")
    assert played()[-1]["sound"] == "piano"
    draws = page.evaluate("timbreDraws.length")
    page.evaluate("mixedSound='violin'")
    clear()
    tap("#replayButton")
    answer_phase()
    expect_notes([65], "piano")
    assert page.evaluate("timbreDraws.length") == draws
    ap_correct()
    clear()
    tap('#apNameKeys [data-pc="2"]')
    expect_notes([62], "piano")
    tap("#nextButton")
    answer_phase()
    assert page.evaluate("trial.timbre==='violin'")
    assert played()[-1] == {"sound": "violin", "midi": 67}
    ap_correct()
    stop()

    # RP mixes between questions, never between the two notes of one question.
    page.locator("#modeSelect").select_option("interval")
    page.locator("#displaySelect").select_option("buttons")
    page.locator("#minIntervalSelect").select_option("5")
    page.locator("#maxIntervalSelect").select_option("7")
    page.locator("#answerLimitSelect").fill("0")
    page.locator("#answerLimitSelect").press("Tab")
    assert page.evaluate("[rpLo,rpHi]") == ([21, 108] if INSTRUMENT == "piano" else [55, 88])
    page.evaluate("mixedSound='piano'")
    clear()
    start()
    expect_notes([60, 67], "piano")
    draws = page.evaluate("timbreDraws.length")
    page.evaluate("mixedSound='violin'")
    clear()
    tap("#replayButton")
    answer_phase()
    expect_notes([60, 67], "piano")
    assert page.evaluate("timbreDraws.length") == draws
    clear()
    tap('#intervalAnswers [data-interval="7"]')
    done()
    expect_notes([60, 67], "piano")
    clear()
    tap('#intervalAnswers [data-interval="5"]')
    expect_notes([60, 65], "piano")
    assert page.evaluate("session.total===1&&session.reviewPaused")
    clear()
    tap("#replayButton")
    expect_notes([60, 67], "piano")
    assert page.evaluate("timbreDraws.length") == draws
    clear()
    tap("#nextButton")
    answer_phase()
    expect_notes([60, 67], "violin")
    clear()
    tap('#intervalAnswers [data-interval="6"]')
    done()
    expect_notes([60, 67], "violin")
    stop()
    clear()
    tap('#intervalAnswers [data-interval="5"]')
    expect_notes([60, 65], "violin")
    select_sound("piano")
    clear()
    tap('#intervalAnswers [data-interval="5"]')
    expect_notes([60, 65], "piano")

    # Instrument answers and stopped board audition route through the same choice.
    page.locator("#displaySelect").select_option("instrument")
    select_sound(OTHER)
    clear()
    start()
    expect_notes([60, 67], OTHER)
    clear()
    page.locator('#keyboard [data-midi="67"]').first.tap()
    done()
    expect_notes([60, 67], OTHER)
    clear()
    page.locator('#keyboard [data-midi="60"]').first.tap()
    expect_notes([60], OTHER)
    assert page.evaluate("session.total===1&&trial.correct")
    stop()
    clear()
    page.locator('#keyboard [data-midi="60"]').first.tap()
    expect_notes([60], OTHER)
    select_sound(INSTRUMENT)
    clear()
    page.locator('#keyboard [data-midi="60"]').first.tap()
    expect_notes([60], INSTRUMENT)

    # Free Play keeps full board range and draws fresh mixed sound per press.
    page.locator("#modeSelect").select_option("free")
    select_sound("mixed")
    for sound in ["piano", "violin"]:
        page.evaluate("sound=>{mixedSound=sound}", sound)
        clear()
        page.locator('#keyboard [data-midi="60"]').first.tap()
        expect_notes([60], sound)
    select_sound(OTHER)
    for midi in ([21, 108] if INSTRUMENT == "piano" else [55, 88]):
        clear()
        page.locator(f'#keyboard [data-midi="{midi}"]').first.tap()
        expect_notes([midi], OTHER)

    records = page.evaluate("""async()=>{
      await writeQueue;
      return {ap:await S.allRows(instrumentMode,'trials'),
        iv:await S.allRows(instrumentMode,'trials','iv'),
        sessions:await S.allRows(instrumentMode,'sessions','iv')};
    }""")
    assert len(records["ap"]) == 4 and len(records["iv"]) == 3, records
    assert all(row["source"] == INSTRUMENT for row in records["ap"] + records["iv"])
    assert any(row["timbre"] == "mixed" for row in records["sessions"])
    assert {row["timbre"] for row in records["iv"]} == {"piano", "violin"}

    # Sound choice survives a fresh document and a different instrument board.
    select_sound("mixed")
    stored = page.evaluate("Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))")
    other_page = context.new_page()
    other_page.on("pageerror", lambda error: errors.append(str(error)))
    other_page.set_content(document(OTHER, stored), wait_until="domcontentloaded")
    other_page.wait_for_function("ready", timeout=20000)
    assert other_page.locator("#soundSelect").input_value() == "mixed"
    assert other_page.evaluate("instrumentMode") == OTHER
    assert other_page.evaluate("cfg.timbre") == "mixed"
    assert not errors, errors
    print("PASS", ENTRY, INSTRUMENT,
          "sound selection/persistence, selected-note preview/cancellation, real presets, AP masks/replay, RP same-timbre pairs, review, free play, history", flush=True)
    browser.close()
