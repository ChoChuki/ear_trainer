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
  lastInPage = {reference, target};
  try {
   localStorage.setItem(questionKey, JSON.stringify(lastInPage));
   questionWriteFailed = false;
  } catch (_) { questionWriteFailed = true; }
  try { localStorage.setItem('ap-last-midi-' + site, String(target)); } catch (_) {}
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
 const hz = midi => 440 * 2 ** ((midi - 69) / 12);
 function track(source, ...nodes) {
  voices.add(source);
  source.onended = () => {
   voices.delete(source);
   for (const node of [source, ...nodes]) { try { node.disconnect(); } catch (_) {} }
  };
 }
 // Shepard-type glide (Shepard 1964): octave-spaced partials under a fixed spectral
 // envelope move continuously through every chroma, so there is no stable pitch left
 // to keep as a reference. A partial re-enters at the far end only where it is silent.
 function shepardGlide(context, at, seconds, {octavesPerSecond = .3, direction = -1, level = .07} = {}) {
  const base = 27.5, span = 8, centre = 4, width = 1.15;
  const speed = octavesPerSecond * (direction < 0 ? -1 : 1), offset = Math.random();
  function segment(t0, t1, x0, x1) {
   const duration = t1 - t0;
   if (duration < .02) return;
   const oscillator = context.createOscillator(), gain = context.createGain();
   oscillator.type = 'sine';
   oscillator.frequency.setValueAtTime(base * 2 ** x0, at + t0);
   oscillator.frequency.exponentialRampToValueAtTime(base * 2 ** x1, at + t1);
   const points = Math.max(4, Math.ceil(duration * 50)), curve = new Float32Array(points);
   for (let i = 0; i < points; i++) {
    const u = i / (points - 1), t = t0 + u * duration, x = x0 + (x1 - x0) * u;
    const fade = Math.max(0, Math.min(1, t / .08, (seconds - t) / .12));
    curve[i] = level * fade * Math.exp(-.5 * ((x - centre) / width) ** 2);
   }
   gain.gain.setValueCurveAtTime(curve, at + t0, duration);
   oscillator.connect(gain); gain.connect(context.destination);
   track(oscillator, gain);
   oscillator.start(at + t0); oscillator.stop(at + t1);
  }
  for (let k = 0; k < span; k++) {
   let t = 0, x = (k + offset) % span;
   while (t < seconds - 1e-3) {
    const wrap = speed < 0 ? x / -speed : (span - x) / speed;
    const t1 = Math.min(seconds, t + wrap);
    segment(t, t1, x, x + speed * (t1 - t));
    t = t1; x = speed < 0 ? span : 0;
   }
  }
  return at + seconds;
 }
 function blip(context, start, duration, frequency, type) {
  const oscillator = context.createOscillator(), gain = context.createGain();
  const peak = type === 'sawtooth' ? .05 : .09, nodes = [gain];
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + .008);
  gain.gain.setValueAtTime(peak, start + Math.max(.01, duration - .025));
  gain.gain.linearRampToValueAtTime(0, start + duration);
  if (type === 'sawtooth' && context.createBiquadFilter) {
   const filter = context.createBiquadFilter();
   filter.type = 'lowpass'; filter.frequency.setValueAtTime(Math.min(4000, frequency * 4), start);
   oscillator.connect(filter); filter.connect(gain); nodes.push(filter);
  } else oscillator.connect(gain);
  gain.connect(context.destination);
  track(oscillator, ...nodes);
  oscillator.start(start); oscillator.stop(start + duration);
 }
 // Pitch-memory reset before a new question. Unlabelled, non-tempered tones spread over
 // the practice register; about 40% fall 0.3-1.2 semitones from the previous note, where
 // an intervening tone disturbs its memory most (Deutsch 1970, 1972). A fast Shepard glide
 // then sweeps every chroma. It weakens, but cannot rule out, relative-pitch carry-over.
 function resetTones(context, at, {previous = null, low = 60, high = 84, seconds = 2.4} = {}) {
  let lo = Math.max(110, hz(low) / 1.2), hi = Math.min(3000, hz(high) * 1.2);
  if (!(hi > lo * 2)) {
   const middle = Math.min(2000, Math.max(160, Math.sqrt(hz(low) * hz(high))));
   lo = middle / Math.SQRT2; hi = middle * Math.SQRT2;
  }
  const known = Number.isInteger(previous);
  const nearby = known && hz(previous) >= 90 && hz(previous) <= 3200;
  // A tone matching the previous note (in any octave) would refresh its memory instead.
  const echoes = f => {
   if (!known) return false;
   const cents = ((1200 * Math.log2(f / hz(previous))) % 1200 + 1200) % 1200;
   return Math.min(cents, 1200 - cents) < 30;
  };
  const band = () => {
   let f;
   for (let i = 0; i < 12; i++) { f = lo * (hi / lo) ** Math.random(); if (!echoes(f)) break; }
   return f;
  };
  const glide = Math.min(.9, seconds * .4), end = seconds - glide + .1;
  for (const stream of [0, 1]) {
   let t = stream ? .05 + Math.random() * .08 : 0;
   while (t < end - .07) {
    const duration = Math.min(.06 + Math.random() * .12, end - t);
    const frequency = nearby && Math.random() < .4
     ? hz(previous + (Math.random() < .5 ? -1 : 1) * (.3 + Math.random() * .9))
     : band();
    blip(context, at + t, duration, frequency, stream ? 'sawtooth' : 'triangle');
    t += duration + .02 + Math.random() * .07;
   }
  }
  shepardGlide(context, at + seconds - glide, glide, {octavesPerSecond: 1.3, direction: Math.random() < .5 ? -1 : 1, level: .06});
  return at + seconds;
 }
 // A variable silence lets the reset fade and keeps the onset unpredictable.
 const resetGap = () => .7 + Math.random() * .5;
 // Earlier releases called the reset maskTone; the name stays for compatibility.
 function maskTone(context, at, duration = 2.4, previous = null, low, high) {
  return resetTones(context, at, {previous, low, high, seconds: duration});
 }
 function cancelAudio() { for (const voice of voices) { try {voice.stop();} catch (_) {} } voices.clear(); }
 root.TrainingCore = {DELAYS, SESSION_RUNGS, choose, sameNoteName, review, weight, recentMiss, confuse, queueRepair, takeRepair, write, storageError, lastQuestion, rememberQuestion, decodePreset, waitForAudio, neutralTone, maskTone, resetTones, resetGap, shepardGlide, farPitch, cancelAudio};
})(typeof window !== 'undefined' ? window : globalThis);
