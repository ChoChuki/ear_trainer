/* Focused trials use the host's instrument and the shared pitch-memory reset. */
(function (root) {
    'use strict';
    function create(context, loadInstrumentPreset = root.loadInstrumentPreset, queueInstrumentNote = root.queueInstrumentNote) {
        let source = null, generation = 0;
        function stop() {
            generation++;
            if (source) {try {source.stop();} catch (_) {} source = null;}
            TrainingCore.cancelAudio();
        }
        // A freshly labelled reference gets a longer phrase before the next check.
        async function play(instrument, midi, reset = null) {
            stop();
            const token = generation;
            // Start resume within the tap handler, including on the first visit in Safari.
            await Promise.all([context.state === 'running' ? undefined : context.resume(), loadInstrumentPreset(instrument)]);
            if (token !== generation || document.hidden || context.state !== 'running') throw Error('Playback interrupted');
            const ready = context.currentTime + .04;
            try {
                let at = ready;
                if (reset) {
                    const options = reset === true ? {} : reset;
                    const queueMaskNote = (pitch, when, length, volume) =>
                        queueInstrumentNote(instrument, pitch, when, length, volume);
                    at = TrainingCore.resetTones(queueMaskNote, ready, options);
                    at += TrainingCore.resetGap();
                }
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
