/* Shared learning rules. Intervals and weights are product heuristics, not diagnostic cutoffs. */
(function(root) {
 'use strict';
 const DELAYS = [60000, 3*60000, 12*60000, 3600000, 86400000, 3*86400000, 7*86400000];
 function choose(items, weights = items.map(() => 1)) {
  let pick = Math.random() * weights.reduce((a,b) => a+b, 0);
  for (let i=0; i<items.length; i++) { pick -= weights[i]; if (pick < 0) return items[i]; }
  return items[items.length-1];
 }
 function sameNoteName(pitch, previous) {
  return Number.isInteger(pitch) && Number.isInteger(previous) && pitch % 12 === previous % 12;
 }
 // One answer category covers every pitch or interval outside this trial's learning set.
 function matchesLearningSet(target, guess, learned, lowest, highest) {
  const valid = Number.isInteger(guess) && guess >= lowest && guess <= highest;
  if (learned.includes(target)) return valid && guess === target;
  return guess === 'out' || (valid && !learned.includes(guess));
 }
 // Rungs 1-4 (1, 3, 12, 60 min) can be earned inside one sitting. Day-scale rungs
 // need a recall made after a break ("cold"): a success right after labelled
 // feedback may rest on the previous note rather than on long-term memory.
 const SESSION_RUNGS = 4;
 function recentMiss(item) {
  if (!item) return null;
  if (typeof item.miss === 'number') return item.miss;
  return item.attempts ? 1 - (item.hits || 0) / item.attempts : null;
 }
 function fade(conf, factor) {
  const out = {};
  for (const [key, value] of Object.entries(conf || {})) if (value * factor >= .05) out[key] = value * factor;
  return out;
 }
 function review(old = {}, correct, at = Date.now(), assisted = false, cold = true) {
  const due = at >= (old.nextAt || 0);
  const success = correct && !assisted;
  let streak = success ? Math.min(DELAYS.length, (old.streak || 0) + (due ? 1 : 0)) : 0;
  if (success && due && !cold) streak = Math.min(streak, Math.max(old.streak || 0, SESSION_RUNGS));
  // Recency-weighted miss rate: lifetime totals stop reacting after long histories.
  const before = recentMiss(old), error = success ? 0 : correct ? .5 : 1;
  const miss = before === null ? (error ? .5 + error / 4 : .25) : before * .75 + error * .25;
  const next = {...old, streak, attempts:(old.attempts || 0)+1, hits:(old.hits || 0)+(correct?1:0), miss,
   nextAt: success && !due ? old.nextAt : at + DELAYS[Math.max(0, streak - 1)], lastAt:at};
  if (success && old.conf) next.conf = fade(old.conf, .85);
  return next;
 }
 // Remember what an item was mistaken for; older confusions fade.
 function confuse(old = {}, other) {
  const conf = fade(old.conf, .9);
  conf[other] = (conf[other] || 0) + 1;
  return {...old, conf};
 }
 function weight(item, at = Date.now()) {
  if (!item) return 2;
  const miss = recentMiss(item);
  return (item.nextAt <= at ? 2 : 1) + 2 * (miss === null ? .5 : miss);
 }
 function queueRepair(queue, key, ordinal) {
  if (!queue.some(x => x.key === key)) queue.push({key, after:ordinal+2+Math.floor(Math.random()*3)});
 }
 function takeRepair(queue, ordinal) {
  const eligible = queue.filter(x => x.after <= ordinal);
  if (!eligible.length || Math.random() >= .5) return null;
  const item = choose(eligible); queue.splice(queue.indexOf(item),1); return item.key;
 }
 function storageError() { if (root.dispatchEvent) root.dispatchEvent(new Event('training-storage-error')); }
 function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (_) { storageError(); return false; }
 }
 const questionKey = 'ear-trainer-last-question-v1';
 let lastInPage = null;
 let questionWriteFailed = false;
 function lastQuestion(site) {
  if (questionWriteFailed) return lastInPage;
  try {
   const saved = JSON.parse(localStorage.getItem(questionKey));
   if (Number.isInteger(saved?.target)) return saved;
   const legacy = JSON.parse(localStorage.getItem('ap-last-midi-' + site));
   if (Number.isInteger(legacy)) return {reference:null, target:legacy};
  } catch (_) {}
  return lastInPage;
 }
 function rememberQuestion(site, reference, target) {
  lastInPage = {reference, target, at: Date.now()};
  try {
   localStorage.setItem(questionKey, JSON.stringify(lastInPage));
   questionWriteFailed = false;
  } catch (_) { questionWriteFailed = true; }
  try { localStorage.setItem('ap-last-midi-' + site, String(target)); } catch (_) {}
 }
 // 2.8.2: the last labelled note (example, free play, feedback). Heard after the last question
 // and within maxAge, its note name is avoided by the next question as well (not its register).
 const labelKey = 'ear-trainer-last-label-v1';
 let labelInPage = null;
 function rememberLabel(midi) {
  if (!Number.isInteger(midi)) return;
  labelInPage = {midi, at: Date.now()};
  try { localStorage.setItem(labelKey, JSON.stringify(labelInPage)); } catch (_) {}
 }
 function recentLabel(site, maxAge = 5 * 60000, now = Date.now()) {
  let label = labelInPage;
  try {
   const saved = JSON.parse(localStorage.getItem(labelKey));
   if (Number.isInteger(saved?.midi) && Number.isFinite(saved.at) && (!label || saved.at > label.at)) label = saved;
  } catch (_) {}
  if (!label || now - label.at > maxAge || label.at > now + 1000) return null;
  const last = lastQuestion(site);
  if (Number.isFinite(last?.at) && last.at >= label.at) return null;
  return label.midi;
 }
 function decodePreset(player, context, name) {
  player.loader.decodeAfterLoading(context,name);
  const deadline=Date.now()+15000;
  return new Promise((resolve,reject)=>{
   function check() {
    if (player.loader.loaded(name)) {resolve();return;}
    if (Date.now()>deadline) {reject(new Error('Sample decoding timed out'));return;}
    setTimeout(check,30);
   }
   check();
  });
 }
 function waitForAudio(context, at, valid) {
  return new Promise(resolve => {
   function check() {
    if (!valid() || context.state !== 'running') { resolve(false); return; }
    if (context.currentTime >= at) { resolve(true); return; }
    setTimeout(check, 20);
   }
   check();
  });
 }
 const voices = new Set();
 function neutralTone(context, at, midi, duration = .7) {
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 440 * 2 ** ((midi-69)/12);
  gain.gain.setValueAtTime(0,at);
  gain.gain.linearRampToValueAtTime(.16,at+.025);
  gain.gain.setValueAtTime(.16,at+duration-.05);
  gain.gain.linearRampToValueAtTime(0,at+duration);
  oscillator.connect(gain); gain.connect(context.destination);
  voices.add(oscillator);
  oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(at); oscillator.stop(at+duration);
 }
 // Register of the next note: more than an octave away from the previous note whenever
 // the candidates allow it, otherwise as far as possible. Pitch-naming tests separate
 // successive tones this way to blunt interval judgements (e.g. the pre/post tests of
 // Wong et al. 2025). Only the octave is chosen here, never the note name.
 function farPitch(candidates, previous, min = 13) {
  if (!candidates.length) return undefined;
  if (!Number.isInteger(previous)) return choose(candidates);
  const far = candidates.filter(p => Math.abs(p - previous) >= min);
  if (far.length) return choose(far);
  const best = Math.max(...candidates.map(p => Math.abs(p - previous)));
  return choose(candidates.filter(p => Math.abs(p - previous) === best));
 }
 // An unlabelled phrase uses the loaded instrument samples. Its pitches never depend
 // on the upcoming target. Excluding the preceding labelled pitch avoids echoing it.
 function resetTones(queueNote, at, {long = false, previous = null, count:requestedCount, duration:noteDuration = .7} = {}) {
  const count = Number.isInteger(requestedCount) && requestedCount >= 3 && requestedCount <= 8 ? requestedCount : long ? 6 : 4;
  const register = Array.from({length: 25}, (_, i) => 55 + i);
  const used = new Set();
  if (Number.isInteger(previous)) used.add(previous % 12);
  let last = null;
  for (let i = 0; i < count; i++) {
   const unused = register.filter(p => !used.has(p % 12));
   const separated = unused.filter(p => last === null || (Math.abs(p - last) >= 3 && Math.abs(p - last) <= 13));
   const midi = choose(separated.length ? separated : unused);
   // Use the same note length as the target; the caller passes its actual duration.
   const duration = Number.isFinite(noteDuration) && noteDuration > 0 ? noteDuration : .7;
   const voice = queueNote(midi, at, duration, .46);
   const source = voice.audioBufferSourceNode;
   voices.add(source);
   const oldEnd = source.onended;
   source.onended = function(event) {
    voices.delete(source);
    if (oldEnd) oldEnd.call(this, event);
   };
   used.add(midi % 12);
   last = midi;
   at += duration;
   if (i + 1 < count) at += .09 + Math.random() * .07;
  }
  return at;
 }
 // The silence after the final sample separates the question from the phrase.
 const resetGap = () => .38 + Math.random() * .12;
 function cancelAudio() { for (const voice of voices) { try {voice.stop();} catch (_) {} } voices.clear(); }
 root.TrainingCore = {DELAYS, SESSION_RUNGS, choose, sameNoteName, matchesLearningSet, review, weight, recentMiss, confuse, queueRepair, takeRepair, write, storageError, lastQuestion, rememberQuestion, decodePreset, waitForAudio, neutralTone, resetTones, resetGap, farPitch, cancelAudio, rememberLabel, recentLabel};
})(typeof window !== 'undefined' ? window : globalThis);
