/* Focused trials use the host's instrument and interference players. */
(function (root) {
    'use strict';
    function create(context, loadInstrumentPreset = root.loadInstrumentPreset, queueInstrumentNote = root.queueInstrumentNote) {
        let source = null, generation = 0;
        function stop() {
            generation++;
            if (source) {try {source.stop();} catch (_) {} source = null;}
            TrainingCore.cancelAudio();
        }
        async function play(instrument, midi, mask = false) {
            stop();
            const token = generation;
            // Start resume within the tap handler, including on the first visit in Safari.
            await Promise.all([context.state === 'running' ? undefined : context.resume(), loadInstrumentPreset(instrument)]);
            if (token !== generation || document.hidden || context.state !== 'running') throw Error('Playback interrupted');
            const ready = context.currentTime + .04;
            try {
                const at = mask ? TrainingCore.maskTone(context, ready, 1) + .25 + Math.random() * .4 : ready;
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
