/* Focused trials use the host's instrument player, with optional noise and an onset timestamp. */
(function (root) {
    'use strict';
    function create(context, loadInstrumentPreset = root.loadInstrumentPreset, queueInstrumentNote = root.queueInstrumentNote) {
        let source = null, noiseSource = null, noiseBuffer = null, generation = 0;
        function stop() {
            generation++;
            if (source) {try {source.stop();} catch (_) {} source = null;}
            if (noiseSource) {try {noiseSource.stop();} catch (_) {} noiseSource = null;}
        }
        function playNoise(at) {
            if (!noiseBuffer) {
                const length = Math.round(context.sampleRate * .25);
                noiseBuffer = context.createBuffer(1, length, context.sampleRate);
                const samples = noiseBuffer.getChannelData(0);
                const ramp = Math.max(1, Math.round(context.sampleRate * .012));
                for (let i = 0; i < length; i++) {
                    const envelope = Math.min(1, i / ramp, (length - 1 - i) / ramp);
                    samples[i] = (2 * Math.random() - 1) * .07 * envelope;
                }
            }
            const noise = context.createBufferSource();
            noise.buffer = noiseBuffer;
            noise.connect(context.destination);
            noise.onended = () => {noise.disconnect(); if (noiseSource === noise) noiseSource = null;};
            noise.start(at);
            noiseSource = noise;
            return at + noiseBuffer.duration + .06;
        }
        async function play(instrument, midi, mask = false) {
            stop();
            const token = generation;
            // Start resume within the tap handler, including on the first visit in Safari.
            await Promise.all([context.state === 'running' ? undefined : context.resume(), loadInstrumentPreset(instrument)]);
            if (token !== generation || document.hidden || context.state !== 'running') throw Error('Playback interrupted');
            const ready = context.currentTime + .04;
            try {
                const at = mask ? playNoise(ready) : ready;
                const voice = queueInstrumentNote(instrument, midi, at);
                const node = voice.audioBufferSourceNode;
                source = node;
                node.onended = () => {if (source === node) source = null;};
                return {...APFocusModel.outputClock(context, voice.when), id: APFocusModel.sampleId(instrument, midi)};
            } catch (error) {
                stop();
                throw error;
            }
        }
        return {play, stop};
    }
    root.APFocusAudio = {create};
})(window);
