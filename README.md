# Ear Trainer · Violin & Piano 2.7.0

[Open focused AP practice](./#ap)

Choose **Violin** or **Piano** in the header. The main link opens on violin. The [piano link](./?instrument=piano#ap) opens the same app on piano. Switching during a focused block saves the answered questions and ends that block. Each instrument uses its original practice history on the same browser origin.

**Relative pitch course** and **Two notes** start with all twelve pitch classes across G3–E6 on violin or C2–B6 on piano. Change **From**, **To**, or **Notes** to narrow the selection for that instrument. The course starts with all its intervals (unison through two octaves). An explicit level limits the interval set. Each new question excludes the preceding target note name in every octave, including after reopening the app or switching instruments. This also applies to single-note tests and AP exercises. Relative exercises can still test a unison or an octave within one question. Relative questions also change the interval when the settings provide another choice. Replay repeats the current question.

The focused course is integrated into the existing trainer. Open **Focused AP practice** on the home screen. On the first day you can listen to labelled examples and start active learning. On subsequent days the independent check has 12 single-listen questions before practice. Active learning gives immediate feedback. Consolidation gives feedback at the end of each block. Set the note names yourself, or accept the suggested next name when the practice evidence supports it.

All instrument notes in focused practice use the two original [WebAudioFont presets](THIRD_PARTY.md) and the same player as the regular exercises. Choose any combination of practice octaves on the focused home screen. The initial selection is 4, 5 and 6. Available notes run from G3 to C8 for violin and A0 to C8 for piano. Each instrument remembers its selection. The two-instrument mix uses pitches both can play. Guide examples, checks and practice use the selected octaves. Active learning and consolidation default to 24 questions. With two or more learned names and available outside notes, a quarter of each block comes from outside the set. With a single learned name, about 34–41% of questions use it. Different outside notes can follow one another. “Other” means outside the set. “Not sure” records uncertainty. The second instrument can be mixed at 20% or 50% after hearing its examples. Independent checks use the instrument selected in the header.

With interference enabled, new focused questions follow a one-second sequence of randomly pitched tones and a 250–650 ms pause. The first question before any practice sound that day, examples and replays play directly. “I used an interval” records how you answered. A target identified this way counts as an attempt and earns no independent hit. Its name appears immediately in active learning and at the end of the block in the other modes. Response time starts at the estimated audible onset of the note.

A new-note suggestion uses up to six completed focused practice blocks with the same learning set from the last fourteen days. The primary instrument needs two blocks, at least five first responses to each target and ten first responses outside the set. Default thresholds are a 75% equal-weight target hit rate and at most 25% false alarms. Replays and interrupted audio are identified separately. Thresholds and the learning set are editable. Each block and each trial retain the primary site, sound source and actual instrument.

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
