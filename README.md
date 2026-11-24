# Ear Trainer · Violin & Piano 2.8.0

[Open focused AP practice](./#ap)

## 2.8.0: closing the interval routes in AP practice

In 2.7.0 a note could still be named from the previous one. Four routes stayed open, and 2.8.0 closes or narrows each:

1. **The sequence gave answers away.** Consecutive questions never shared a note name, and the first question after an example never used the example's name. With one learned name, F was always followed by “Other”. Note names are now drawn independently of the previous question: a name may follow itself as often as chance predicts. In focused practice a block is a plain shuffle; in the classic AP modes each name is drawn with its weight.
2. **Successive notes were often a semitone apart.** Only the register now depends on the previous note (or on the last labelled example): the next note is more than 12 semitones away whenever the selected octaves allow, otherwise as far as possible. Pitch-naming tests use the same rule to blunt interval judgements (for example the pre/post tests of Wong et al. 2025). The default octaves 4–6 allow it for almost every note; with less than three octaves a hint appears.
3. **The interference was easy to hold through.** The reset before a question now lasts 2.4 s: about 18 short, non-tempered tones over the practice register, roughly 40% of them 0.3–1.2 semitones from the previous note (where an intervening tone disturbs pitch memory most; Deutsch 1970, 1972) and none on the previous note itself in any octave, then a fast Shepard glide through every chroma, then a 0.7–1.2 s pause. When a block without feedback (consolidation or the independent check) starts within five minutes of a labelled sound (examples, “Hear the answer” or active-learning feedback), a 20 s Shepard glide plays first, as between sample tones and no-feedback levels in Wong et al. (2025). The reset setting uses a new storage key, so it is on again for everyone; it can still be switched off.
4. **There was no time pressure.** “I used an interval” relies on noticing it. Focused practice now has an answer window, timed from the estimated audible onset: **Strict** (default) follows Wong et al. (2025), 1,183 ms with one learned name rising linearly to 2,028 ms with twelve, plus 150 ms for touch input and onset uncertainty; **Relaxed** adds 0.7 s; **Off** removes it. A countdown bar shows the window. A tap after the window, or none, is recorded as *too slow*: an attempt without a hit. Active learning then shows the name and waits for Next; the other modes reveal it at the end. A finger already on a button when the window closes still counts by its touch time. Learning feedback and the block review show each response time, and the summary adds late answers and the median correct time. A replay cancels the window (a replayed note is already assisted).

Focused records now carry protocol 8 and add `limitMs`, `lateGuess`, `reset` (`short`/`long`) and `jump` (semitones from the previous sound); sessions add `late`, `limit`, `limitMs` and `resetOn`. Protocol 7 blocks stay in the history and statistics but no longer count towards a new-note suggestion, because interval routes could raise their scores. The classic AP modes share the sequence, register and reset changes (protocol 7 there); their response limit is unchanged. Tests: `tests/test_ap_sequence.cjs` (replaces `test_ap_no_repeat.cjs`), `tests/test_ap_reset.cjs` and an updated `tests/test_ap_focus.cjs`.

References: Deutsch, D. (1970). Tones and numbers: Specificity of interference in immediate memory. *Science*, 168, 1604–1605 · Deutsch, D. (1972). Mapping of interactions in the pitch memory store. *Science*, 175, 1020–1022 · Shepard, R. N. (1964). Circularity in judgments of relative pitch. *JASA*, 36, 2346–2353 · Wong, Y. K., Cheung, L. Y. T., Ngan, V. S. H., & Wong, A. C.-N. (2025). Learning fast and accurate absolute pitch judgment in adulthood. *Psychonomic Bulletin & Review*, 32, 1676–1688.

## How it works

Choose **Violin** or **Piano** in the header. The main link opens on violin. The [piano link](./?instrument=piano#ap) opens the same app on piano. Switching during a focused block saves the answered questions and ends that block. Each instrument uses its original practice history on the same browser origin.

**Relative pitch course** and **Two notes** start with all twelve pitch classes across G3–E6 on violin or C2–B6 on piano. Change **From**, **To**, or **Notes** to narrow the selection for that instrument. The course starts with all its intervals (unison through two octaves). An explicit level limits the interval set. Each new question excludes the preceding target note name in every octave, including after reopening the app or switching instruments. This also applies to single-note tests, but no longer to AP exercises (see 2.8.0 above). Relative exercises can still test a unison or an octave within one question. Relative questions also change the interval when the settings provide another choice. Replay repeats the current question.

The focused course is integrated into the existing trainer. Open **Focused AP practice** on the home screen. On the first day you can listen to labelled examples and start active learning. On subsequent days the independent check has 12 single-listen questions before practice. Active learning gives immediate feedback. Consolidation gives feedback at the end of each block. Set the note names yourself, or accept the suggested next name when the practice evidence supports it.

All instrument notes in focused practice use the two original [WebAudioFont presets](THIRD_PARTY.md) and the same player as the regular exercises. Choose any combination of practice octaves on the focused home screen. The initial selection is 4, 5 and 6. Available notes run from G3 to C8 for violin and A0 to C8 for piano. Each instrument remembers its selection. The two-instrument mix uses pitches both can play. Guide examples, checks and practice use the selected octaves. Active learning and consolidation default to 24 questions. With two or more learned names and available outside notes, a quarter of each block comes from outside the set. With a single learned name, about 34–41% of questions use it. Any name, learned or outside, can follow itself. “Other” means outside the set. “Not sure” records uncertainty. The second instrument can be mixed at 20% or 50% after hearing its examples. Independent checks use the instrument selected in the header.

With the reset enabled, new focused questions follow the 2.4 s reset and pause described above, and the first question of a block without feedback after a labelled sound follows the 20 s glide. The first question before any practice sound that day, examples and replays play directly. “I used an interval” records how you answered. A target identified this way counts as an attempt and earns no independent hit. Its name appears immediately in active learning and at the end of the block in the other modes. Response time starts at the estimated audible onset of the note.

A new-note suggestion uses up to six completed protocol 8 focused practice blocks with the same learning set from the last fourteen days. The primary instrument needs two blocks, at least five first responses to each target and ten first responses outside the set. Default thresholds are a 75% equal-weight target hit rate and at most 25% false alarms. Replays, late answers and interrupted audio are identified separately. Thresholds and the learning set are editable. Each block and each trial retain the primary site, sound source and actual instrument.

Answers use the original site's device-local AP database. The first visit picks up an existing course level or previous course evidence when available. Earlier course versions and scores remain available in the original AP history. Each site's focused records can be exported and restored under **Practice records**. The existing tracker combines active training across instruments and sessions. At 60 minutes per Tokyo calendar day it shows a dismissible in-app reminder, including during a round. Background time is excluded. The reminder is shown once per day in this browser. On a shared origin the two trainers can observe a previous local audio exposure; other devices or origins have separate histories.

## Previous release notes

Independent PWA deployment. All files in this directory belong in the site's Cloudflare deployment root.
Deploy the files at one site root with `vendor/` beside `index.html`. Both instrument presets and the player are included there. The release ZIP also includes `single-file/index.html`, which embeds those same files. HTTPS is required for PWA installation and for the optional microphone check.

Round 3 (Claude) changes from 2.3.1, in short:

- AP rounds show their prompt, right/wrong and the note name beside the answers (in 2.3.1 the violin site hid them).
- The cold check uses the selected range and no longer rewrites From/To.
- Optional interference burst before each AP question; "Other" notes lean towards neighbours of the learned names.
- Day-scale review intervals need a recall made after a break; recent errors and confusions drive review weights.
- "Weak intervals" is a real error-driven review; references cover the whole register in each direction.
- New activity "Sing / play first" (self-check, optional experimental microphone check).
- One tap per question (automatic continue after a hit; a miss waits for Next); no scrolling during a round on 320–430 px screens.
- A waiting new version is offered through an "Update" button, never applied during a round.

Previous versions preserved the Demo score and tempo, Cloudflare training-time protocol,
RP level structure, six languages, stored history formats (new fields are additive; new rows carry protocol 6).

Updating an installed PWA: open it online once; when "Update to the new version" appears in the header, tap it
outside a round (or close every window of the app and reopen it).

See the full source package: README_START_HERE.md and docs/CLAUDE_ROUND3_REPORT_zh.md.
