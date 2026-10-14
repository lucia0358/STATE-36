
/*
 * STATE#36 / PULSE RESPONSE
 * Generative Music + Ambient Samples
 *
 * Ambient:
 *   Instrument.wav + Wind.wav loop continuously.
 *   Shimmer.wav plays intermittently.
 *   Exactly one long sustained synth note at a time.
 *   No Ambient bass, no generated melody, no synth percussion.
 *
 * Techno / EDM:
 *   Generated synth music.
 *
 * Cymbal.wav:
 *   Dedicated long reverb, independent of other samples.
 *
 * Drums:
 *   Triggered only by effects.js touch combinations.
 */

(() => {
  'use strict';

  const KEYS = [
    'C', 'C#', 'D', 'D#', 'E', 'F',
    'F#', 'G', 'G#', 'A', 'A#', 'B'
  ];

  const SCALE = [0, 2, 3, 5, 7, 8, 10];

  // i → VI → III → VII
  const CHORDS = [
    { root: 0, tones: [0, 3, 7] },
    { root: 8, tones: [8, 12, 15] },
    { root: 3, tones: [3, 7, 10] },
    { root: 10, tones: [10, 14, 17] }
  ];

const GENRES = [
  {
    id: 'AMBIENT',
    name: 'Ambient',
    cutoff: 2200,
    stepBeats: 2,
    tempoMultiplier: 0.68
  },
  {
    id: 'TECHNO',
    name: 'Techno',
    cutoff: 1900,
    stepBeats: 0.5,
    tempoMultiplier: 0.95
  },
  {
    id: 'EDM',
    name: 'EDM',
    cutoff: 5600,
    stepBeats: 0.25,
    tempoMultiplier: 1.05
  },
  {
    id: 'FUTURE',
    name: 'Future',
    cutoff: 2200,
    stepBeats: 1,
    tempoMultiplier: 1
  }
];

  // 사용할 장르: 'AMBIENT' 또는 'FUTURE'
const ACTIVE_GENRE = 'FUTURE';

  const TIMBRES = [
    { id: 'WARM', name: 'Warm', brightness: 0.78, detune: 5 },
    { id: 'GLASS', name: 'Glass', brightness: 1.2, detune: 7 },
    { id: 'GRAIN', name: 'Grain', brightness: 0.95, detune: 13 },
    { id: 'METAL', name: 'Metal', brightness: 1.32, detune: 10 }
  ];

  const STORAGE = {
    genre: 'pulseResponse_lastGenre',
    timbre: 'pulseResponse_lastTimbre',
    key: 'pulseResponse_lastKey'
  };

  const SAMPLE_PATH = 'audio/Ancient/';

  const SAMPLE_FILES = [
    'Instrument.wav',
    'Wind.wav',
    'Shimmer.wav',
    'Kick.wav',
    'Snare.wav',
    'Perc.wav',
    'Cymbal.wav'
  ];

  let ctx = null;
  let outputBus = null;
  let compressor = null;

  let reverbInput = null;
  let reverbReturn = null;
  let convolver = null;

  // Cymbal-only reverb path
  let cymbalReverb = null;
  let cymbalReverbReturn = null;

  let noiseBuffer = null;
  let distortionCurve = null;

  let profile = null;
  let initialized = false;

  let schedulerTimer = null;
  let shimmerTimer = null;
  let ambientRunId = 0;

  const sampleBuffers = Object.create(null);
  const ambientLoops = Object.create(null);

  let lastBpm = 72;
  let smoothBpm = 72;

  let state = 'STEADY';
  let density = 0.35;

  let stepIndex = 0;
  let nextStepTime = 0;
  let lastChordIndex = -1;
  let rngState = 1;

  // --------------------------------------------------
  // Utilities
  // --------------------------------------------------

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand() {
    rngState = (
      Math.imul(1664525, rngState) + 1013904223
    ) >>> 0;

    return rngState / 4294967296;
  }

  function randInt(max) {
    return Math.floor(rand() * max);
  }

  function pick(arr) {
    return arr[randInt(arr.length)];
  }

  function chance(p) {
    return rand() < clamp(p, 0, 1);
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      // Storage may be unavailable.
    }
  }

  function chooseDifferent(items, previousId) {
    const choices = items.filter(
      item => item.id !== previousId
    );

    return pick(choices.length ? choices : items);
  }

  function midiHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function sampleKey(name) {
    return String(name)
      .split('/')
      .pop()
      .replace(/\.wav$/i, '')
      .toLowerCase();
  }

  // --------------------------------------------------
  // Audio setup
  // --------------------------------------------------

  function createImpulse(seconds = 2.7, decay = 2.4) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);

      for (let i = 0; i < length; i++) {
        const t = i / length;

        data[i] = (Math.random() * 2 - 1) *
          Math.pow(1 - t, decay);
      }
    }

    return buffer;
  }

  function createNoise(seconds = 1) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  function createDistortion(amount = 20) {
    const size = 44100;
    const curve = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      const x = (2 * i / size) - 1;

      curve[i] = Math.tanh((1 + amount) * x) /
        Math.tanh(1 + amount);
    }

    return curve;
  }

  async function init() {
    if (!ctx) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported.');
      }

      ctx = new AudioContextClass();

      outputBus = ctx.createGain();

      // Generated music and samples only.
      // This does not change the separate 0922.wav volume.
      outputBus.gain.value = 1.2;

      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 16;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.2;

      outputBus.connect(compressor);
      compressor.connect(ctx.destination);

      // General reverb used by generated voices and other samples
      reverbInput = ctx.createGain();
      reverbInput.gain.value = 0.22;

      convolver = ctx.createConvolver();
      convolver.buffer = createImpulse();

      reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0;

      reverbInput.connect(convolver);
      convolver.connect(reverbReturn);
      reverbReturn.connect(outputBus);

      // Dedicated Cymbal reverb.
      // Longer and brighter than the general reverb.
      cymbalReverb = ctx.createConvolver();
      cymbalReverb.buffer = createImpulse(3.6, 3.0);

      cymbalReverbReturn = ctx.createGain();
      cymbalReverbReturn.gain.value = 0.42;

      cymbalReverb.connect(cymbalReverbReturn);
      cymbalReverbReturn.connect(outputBus);

      noiseBuffer = createNoise();
      distortionCurve = createDistortion();

      initialized = true;

      await loadSampleBuffers();
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    return ctx;
  }

  // --------------------------------------------------
  // Load WAV samples
  // --------------------------------------------------

  async function loadSampleBuffers() {
    const results = await Promise.allSettled(
      SAMPLE_FILES.map(async filename => {
        const response = await fetch(SAMPLE_PATH + filename);

        if (!response.ok) {
          throw new Error(
            `${filename}: HTTP ${response.status}`
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);

        sampleBuffers[sampleKey(filename)] = decoded;

        return filename;
      })
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(
          '[PulseMusic] Sample could not be loaded:',
          SAMPLE_FILES[index],
          result.reason
        );
      } else {
        console.info(
          '[PulseMusic] Loaded sample:',
          result.value
        );
      }
    });
  }

  // --------------------------------------------------
  // Shared audio output routing
  // --------------------------------------------------

  function connectVoice(node) {
    node.connect(outputBus);

    if (profile && profile.reverbEnabled) {
      node.connect(reverbInput);
    }
  }

  // --------------------------------------------------
  // Sample playback API
  //
  // Cymbal.wav automatically receives a dedicated
  // reverb send of 0.8. Other samples are unchanged.
  //
  // Pass options.reverb to override the default.
  // --------------------------------------------------

  function playSample(name, options = {}) {
    if (!ctx || !outputBus || ctx.state !== 'running') {
      return false;
    }

    const key = sampleKey(name);
    const buffer = sampleBuffers[key];

    if (!buffer) {
      console.warn('[PulseMusic] Missing sample:', name);
      return false;
    }

    const gainValue = clamp(
      Number(options.gain ?? 0.12),
      0,
      1
    );

    const delay = clamp(
      Number(options.delay ?? 0),
      0,
      5
    );

    // Dedicated reverb is automatic for Cymbal.wav.
    const defaultReverb = key === 'cymbal' ? 0.8 : 0;

    const reverbAmount = clamp(
      Number(options.reverb ?? defaultReverb),
      0,
      1
    );

    const startAt = ctx.currentTime + delay;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.loop = false;

    gain.gain.setValueAtTime(0.0001, startAt);

    gain.gain.linearRampToValueAtTime(
      Math.max(0.0001, gainValue),
      startAt + 0.008
    );

    source.connect(gain);

    const pan = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;

    let outputNode = gain;

    if (pan) {
      pan.pan.setValueAtTime(
        clamp(Number(options.pan ?? 0), -1, 1),
        startAt
      );

      gain.connect(pan);
      outputNode = pan;
    }

    // Original dry signal and the existing general reverb
    connectVoice(outputNode);

    // Dedicated wet send only for samples requesting reverb.
    let wetSend = null;

    if (reverbAmount > 0 && cymbalReverb) {
      wetSend = ctx.createGain();
      wetSend.gain.value = reverbAmount;

      outputNode.connect(wetSend);
      wetSend.connect(cymbalReverb);
    }

    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
      try { outputNode.disconnect(); } catch (_) {}

      if (wetSend) {
        try { wetSend.disconnect(); } catch (_) {}
      }
    };

    source.start(startAt);

    return true;
  }

  // --------------------------------------------------
  // Ambient sample loops
  // Instrument.wav + Wind.wav loop continuously.
  // Shimmer.wav is triggered at irregular intervals.
  // --------------------------------------------------

  function startLoopSample(name, gainValue) {
    const key = sampleKey(name);
    const buffer = sampleBuffers[key];

    if (!buffer || !ctx || !profile) return null;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.loop = true;

    const now = ctx.currentTime;

    gain.gain.setValueAtTime(0.0001, now);

    gain.gain.linearRampToValueAtTime(
      gainValue,
      now + 0.65
    );

    source.connect(gain);
    connectVoice(gain);
    source.start(now);

    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
    };

    return { source, gain };
  }

  function updateWindGain() {
    if (!profile || !ambientLoops.wind || !ctx) return;

    const delta = smoothBpm - profile.averageBpm;

    // Wind gets louder as BPM rises above the initial average.
    const targetGain = clamp(
      0.10 + Math.max(0, delta) * 0.014,
      0.10,
      0.40
    );

    ambientLoops.wind.gain.gain.setTargetAtTime(
      targetGain,
      ctx.currentTime,
      0.75
    );
  }

  function scheduleNextShimmer(runId) {
    if (
      runId !== ambientRunId ||
      !profile ||
      profile.genre.id !== 'AMBIENT'
    ) {
      return;
    }

    const delayMs = 8500 + Math.random() * 11000;

    shimmerTimer = setTimeout(() => {
      shimmerTimer = null;

      if (
        runId !== ambientRunId ||
        !profile ||
        profile.genre.id !== 'AMBIENT'
      ) {
        return;
      }

      playSample('Shimmer.wav', {
        gain: 0.08 + Math.random() * 0.075,
        pan: Math.random() * 1.2 - 0.6
      });

      scheduleNextShimmer(runId);
    }, delayMs);
  }

  function stopAmbientSamples() {
    ambientRunId++;

    if (shimmerTimer !== null) {
      clearTimeout(shimmerTimer);
      shimmerTimer = null;
    }

    const now = ctx ? ctx.currentTime : 0;

    Object.values(ambientLoops).forEach(loop => {
      try {
        loop.gain.gain.cancelScheduledValues(now);

        loop.gain.gain.setTargetAtTime(
          0.0001,
          now,
          0.12
        );

        loop.source.stop(now + 0.45);
      } catch (_) {}
    });

    Object.keys(ambientLoops).forEach(key => {
      delete ambientLoops[key];
    });
  }

  function startAmbientSamples() {
    stopAmbientSamples();

    if (
      !profile ||
      profile.genre.id !== 'AMBIENT' ||
      !ctx ||
      ctx.state !== 'running'
    ) {
      return;
    }

    // Texture loops; playback rate is unchanged.
    ambientLoops.instrument =
      startLoopSample('Instrument.wav', 0.16);

    ambientLoops.wind =
      startLoopSample('Wind.wav', 0.10);

    updateWindGain();

    scheduleNextShimmer(ambientRunId);
  }

  // --------------------------------------------------
  // Session-specific melodies
  // Ambient intentionally has no generated melody.
  // --------------------------------------------------

  function makeMotif(template, length) {
    const shift = randInt(7);
    const result = [];

    for (let i = 0; i < length; i++) {
      let degree = template[i % template.length];

      if (chance(0.19)) {
        degree += pick([-2, -1, 1, 2]);
      }

      degree = (degree + shift) % 7;
      if (degree < 0) degree += 7;

      result.push(degree);
    }

    return result;
  }

  function createMotifs() {
    return {
      TECHNO: makeMotif(
        [0, 0, 3, 0, 5, 3, 0, 6],
        16
      ),

      EDM: makeMotif(
        [0, 2, 4, 6, 4, 3, 2, 5, 6, 4, 3, 2, 0, 2, 3, 5],
        32
      )
    };
  }

  function createProfile(samples, participantName = '') {
    if (!initialized) {
      console.warn('[PulseMusic] Call init() first.');
      return null;
    }

    stopAmbientSamples();

    const bpmSamples = (Array.isArray(samples) ? samples : [])
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0);

    const averageBpm = bpmSamples.length
      ? bpmSamples.reduce((a, b) => a + b, 0) /
        bpmSamples.length
      : lastBpm;

    const variance = bpmSamples.length
      ? bpmSamples.reduce(
          (sum, bpm) => sum + Math.pow(bpm - averageBpm, 2),
          0
        ) / bpmSamples.length
      : 0;

    const previousTimbre = readStorage(STORAGE.timbre);
    const previousKey = readStorage(STORAGE.key);

    rngState = (
      (Date.now() >>> 0) ^
      Math.floor(Math.random() * 0xffffffff)
    ) >>> 0;

    if (!rngState) rngState = 137;

    // Ambient is currently fixed by design.
    const genre =
  GENRES.find(item => item.id === ACTIVE_GENRE) ||
  GENRES[0];

    const timbre = chooseDifferent(
      TIMBRES,
      previousTimbre
    );

    let keyIndex = randInt(12);

    if (String(keyIndex) === previousKey) {
      keyIndex = (keyIndex + 1 + randInt(11)) % 12;
    }

    profile = {
      participantName: String(participantName || ''),
      averageBpm,
      standardDeviation: Math.sqrt(variance),

      rootMidi: 48 + keyIndex,
      rootNote: KEYS[keyIndex],
      keyName: `${KEYS[keyIndex]} minor`,

      genre: { ...genre },
      timbre: { ...timbre },

      reverbEnabled: Math.random() < 0.5,
      reverbAmount: 0.14 + Math.random() * 0.16,

      variability: clamp(
        0.3 + Math.sqrt(variance) / 20 +
        Math.random() * 0.3,
        0.25,
        0.9
      ),

      seed: rngState,
      motifs: null,
      liveCutoff: genre.cutoff
    };

    writeStorage(STORAGE.genre, genre.id);
    writeStorage(STORAGE.timbre, timbre.id);
    writeStorage(STORAGE.key, String(keyIndex));

    rngState = profile.seed;
    profile.motifs = createMotifs();

    reverbInput.gain.setTargetAtTime(
      timbre.id === 'GLASS' ? 0.28 : 0.20,
      ctx.currentTime,
      0.25
    );

    reverbReturn.gain.setTargetAtTime(
      profile.reverbEnabled ? profile.reverbAmount : 0,
      ctx.currentTime,
      0.25
    );

    smoothBpm = lastBpm;
    density = 0.35;
    state = 'STEADY';

    stepIndex = 0;
    lastChordIndex = -1;
    nextStepTime = ctx.currentTime + 0.08;

    if (schedulerTimer) {
      clearInterval(schedulerTimer);
    }

    schedulerTimer = setInterval(scheduleAhead, 25);

    window.musicProfile = profile;

    if (profile.genre.id === 'AMBIENT') {
      startAmbientSamples();
    }

    console.info('[PulseMusic] Session', {
      genre: profile.genre.name,
      timbre: profile.timbre.name,
      key: profile.keyName,
      reverb: profile.reverbEnabled ? 'ON' : 'OFF'
    });

    return profile;
  }

  // --------------------------------------------------
  // Heart-rate response
  // --------------------------------------------------

  function updateBpm(bpm) {
    const value = Number(bpm);

    if (!Number.isFinite(value) || value <= 0) return;

    lastBpm = clamp(value, 35, 190);
    smoothBpm += (lastBpm - smoothBpm) * 0.12;

    if (!profile) return;

    const delta = smoothBpm - profile.averageBpm;

    if (delta >= 15) {
      state = 'HIGH';
    } else if (delta >= 7) {
      state = 'ELEVATED';
    } else if (delta <= -10) {
      state = 'LOW';
    } else {
      state = 'STEADY';
    }

    const targetDensity = clamp(
      0.28 + Math.max(0, delta) / 32 +
      profile.variability * 0.13,
      0.2,
      0.82
    );

    density += (targetDensity - density) * 0.08;

    profile.liveCutoff = clamp(
      profile.genre.cutoff + delta * 22,
      450,
      10000
    );

    updateWindGain();
  }

  // --------------------------------------------------
  // Harmony helpers
  // --------------------------------------------------

  function chordIndexForStep(step) {
    if (!profile) return 0;

    const stepsPerBar = Math.max(
      1,
      Math.round(4 / profile.genre.stepBeats)
    );

    return Math.floor(step / (stepsPerBar * 2)) % 4;
  }

  function chordRoot(chordIndex) {
    return profile.rootMidi + CHORDS[chordIndex].root;
  }

  function chordMidi(chordIndex, toneIndex, octave = 0) {
    const tones = CHORDS[chordIndex].tones;

    const index =
      ((toneIndex % tones.length) + tones.length) %
      tones.length;

    return profile.rootMidi + tones[index] + octave * 12;
  }

  function scaleMidi(degree, octave = 0) {
    const scaleDegree = ((degree % 7) + 7) % 7;
    const scaleOctave = Math.floor(degree / 7);

    return profile.rootMidi +
      SCALE[scaleDegree] +
      (octave + scaleOctave) * 12;
  }

  function motifDegree(step, offset = 0) {
    const motif = profile.motifs[profile.genre.id];

    const index = (
      (step + offset) % motif.length + motif.length
    ) % motif.length;

    return motif[index];
  }

  function getChordTones() {
    if (!profile) return [];

    return CHORDS[chordIndexForStep(stepIndex)].tones.map(
      offset => profile.rootMidi + offset
    );
  }

  // --------------------------------------------------
  // Synth voice helpers
  // --------------------------------------------------

  function tone(midi, time, duration, options = {}) {
    if (!ctx || !profile || !Number.isFinite(midi)) return;

    const o = {
      wave: 'triangle',
      volume: 0.04,
      attack: 0.01,
      decay: 0.12,
      sustain: 0.25,
      release: 0.15,
      cutoff: 2400,
      q: 0.8,
      unison: 1,
      spread: 0,
      detune: 0,
      pan: 0,
      fmRatio: 0,
      fmIndex: 0,
      fmIndexEnd: 0,
      drive: false,
      filterType: 'lowpass',
      ...options
    };

    const safeDuration = Math.max(0.035, duration);
    const end = time + safeDuration;
    const release = Math.max(0.025, o.release);

    const attack = Math.min(
      Math.max(0.003, o.attack),
      safeDuration * 0.65
    );

    const frequency = clamp(midiHz(midi), 20, 18000);

    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();

    filter.type = o.filterType;

    filter.frequency.setValueAtTime(
      clamp(
        o.cutoff * profile.timbre.brightness *
        (profile.liveCutoff / profile.genre.cutoff),
        100,
        18000
      ),
      time
    );

    filter.Q.setValueAtTime(clamp(o.q, 0.1, 15), time);

    let finalNode = filter;

    if (o.drive && distortionCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve;
      shaper.oversample = '2x';

      filter.connect(shaper);
      finalNode = shaper;
    }

    finalNode.connect(amp);

    const sustainTime = Math.min(
      end,
      time + attack + o.decay
    );

    const peak = Math.max(0.0001, o.volume);
    const sustainGain = Math.max(
      0.0001,
      peak * o.sustain
    );

    amp.gain.setValueAtTime(0.0001, time);

    amp.gain.linearRampToValueAtTime(
      peak,
      time + attack
    );

    if (sustainTime > time + attack) {
      amp.gain.linearRampToValueAtTime(
        sustainGain,
        sustainTime
      );
    }

    amp.gain.setValueAtTime(sustainGain, end);
    amp.gain.setTargetAtTime(0.0001, end, release / 3);

    const pan = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;

    if (pan) {
      pan.pan.setValueAtTime(clamp(o.pan, -1, 1), time);
      amp.connect(pan);
      connectVoice(pan);
    } else {
      connectVoice(amp);
    }

    if (o.fmRatio > 0) {
      const carrier = ctx.createOscillator();
      const modulator = ctx.createOscillator();
      const modGain = ctx.createGain();

      carrier.type = o.wave;
      carrier.frequency.setValueAtTime(frequency, time);

      modulator.type = 'sine';

      modulator.frequency.setValueAtTime(
        frequency * o.fmRatio,
        time
      );

      modGain.gain.setValueAtTime(
        frequency * o.fmIndex,
        time
      );

      modGain.gain.linearRampToValueAtTime(
        frequency * o.fmIndexEnd,
        end
      );

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(filter);

      carrier.start(time);
      modulator.start(time);

      carrier.stop(end + release + 0.05);
      modulator.stop(end + release + 0.05);
    } else {
      const count = clamp(Math.round(o.unison), 1, 7);

      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator();
        const mix = ctx.createGain();

        const spreadOffset = count === 1
          ? 0
          : (i / (count - 1) - 0.5) * 2;

        osc.type = o.wave;
        osc.frequency.setValueAtTime(frequency, time);

        osc.detune.setValueAtTime(
          o.detune + spreadOffset * o.spread,
          time
        );

        mix.gain.value = 1 / count;

        osc.connect(mix);
        mix.connect(filter);

        osc.start(time);
        osc.stop(end + release + 0.05);
      }
    }
  }

  function noise(time, duration, options = {}) {
    if (!noiseBuffer || !profile) return;

    const o = {
      volume: 0.008,
      cutoff: 4500,
      q: 1,
      release: 0.06,
      pan: 0,
      type: 'bandpass',
      ...options
    };

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.setValueAtTime(o.cutoff, time);
    filter.Q.value = o.q;

    const amp = ctx.createGain();

    amp.gain.setValueAtTime(
      Math.max(0.0001, o.volume),
      time
    );

    amp.gain.setTargetAtTime(
      0.0001,
      time + duration,
      o.release / 3
    );

    source.connect(filter);
    filter.connect(amp);

    const pan = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;

    if (pan) {
      pan.pan.value = clamp(o.pan, -1, 1);
      amp.connect(pan);
      connectVoice(pan);
    } else {
      connectVoice(amp);
    }

    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      try { filter.disconnect(); } catch (_) {}
      try { amp.disconnect(); } catch (_) {}

      if (pan) {
        try { pan.disconnect(); } catch (_) {}
      }
    };

    source.start(time);
    source.stop(time + duration + o.release + 0.05);
  }

  // --------------------------------------------------
  // AMBIENT: sample textures + one sustained synth note
  // --------------------------------------------------

  function runAmbient(step, time) {
    const stepsPerBar = Math.max(
      1,
      Math.round(4 / profile.genre.stepBeats)
    );

    const stepsPerChord = stepsPerBar * 2;

    // One note only when a new two-bar chord section begins.
    if (step % stepsPerChord !== 0) return;

    const chord = chordIndexForStep(step);
    const chordTones = CHORDS[chord].tones;
    const toneIndex = randInt(chordTones.length);

    // High register; no Ambient bass.
    const note =
      profile.rootMidi + chordTones[toneIndex] + 24;

    const effectiveBpm = clamp(
      smoothBpm * profile.genre.tempoMultiplier,
      40,
      210
    );

    const twoBarsSeconds = (60 / effectiveBpm) * 8;

    tone(note, time, twoBarsSeconds * 0.93, {
      wave: 'triangle',
      volume: 0.024,
      attack: 2.4,
      decay: 2.0,
      sustain: 0.62,
      release: 0.55,
      cutoff: 1500,
      q: 0.45,
      unison: 1,
      spread: 0,
      detune: 0,
      fmRatio: 0,
      pan: 0
    });
  }

  // --------------------------------------------------
  // TECHNO: repetitive mono bass and resonant accents
  // --------------------------------------------------

  function technoBass(midi, time, duration, volume) {
    tone(midi - 12, time, duration, {
      wave: 'sawtooth',
      volume,
      attack: 0.004,
      decay: 0.10,
      sustain: 0.2,
      release: 0.08,
      cutoff: 900,
      q: 5.2,
      drive: true
    });

    tone(midi, time, duration * 0.8, {
      wave: 'square',
      volume: volume * 0.20,
      attack: 0.003,
      decay: 0.04,
      sustain: 0.10,
      release: 0.06,
      cutoff: 1450,
      q: 3.8
    });
  }

  function technoPulse(midi, time, duration, volume) {
    tone(midi, time, duration, {
      wave: 'sawtooth',
      volume,
      attack: 0.003,
      decay: 0.07,
      sustain: 0.10,
      release: 0.055,
      cutoff: 1200 + rand() * 1000,
      q: 4.2 + rand() * 2.5
    });
  }

  function runTechno(step, time) {
    const chord = chordIndexForStep(step);
    const s = step % 16;
    const root = chordRoot(chord);

    const bassPattern = [
      0, -1, 0, 0, 7, 0, -2, 0,
      0, 0, 3, 0, 7, -1, 0, 5
    ];

    if ([0, 2, 4, 6, 8, 10, 12, 14].includes(s)) {
      technoBass(
        root - 12 + bassPattern[s],
        time,
        s % 4 === 0 ? 0.23 : 0.15,
        s % 4 === 0 ? 0.085 : 0.061
      );
    }

    if ([3, 7, 11, 15].includes(s) && chance(0.78)) {
      technoPulse(
        scaleMidi(motifDegree(step, Math.floor(step / 4)), 1),
        time,
        0.12,
        0.025 + density * 0.015
      );
    }

    if ([4, 12].includes(s) && chance(0.68)) {
      technoPulse(
        chordMidi(chord, s === 4 ? 1 : 2, 1),
        time,
        0.16,
        0.027
      );
    }

    if (s === 15 && chance(0.22)) {
      noise(time, 0.035, {
        volume: 0.005,
        cutoff: 2400 + rand() * 1500,
        q: 2.6,
        type: 'lowpass'
      });
    }
  }

  // --------------------------------------------------
  // EDM: supersaw, chord stabs and melodic hook
  // --------------------------------------------------

  function edmSupersaw(midi, time, duration, volume) {
    tone(midi, time, duration, {
      wave: 'sawtooth',
      volume,
      attack: 0.015,
      decay: 0.15,
      sustain: 0.42,
      release: 0.20,
      cutoff: 5200,
      unison: 5,
      spread: 13,
      detune: profile.timbre.detune
    });
  }

  function edmSub(midi, time, duration, volume) {
    tone(midi - 12, time, duration, {
      wave: 'sine',
      volume,
      attack: 0.004,
      decay: 0.09,
      sustain: 0.65,
      release: 0.10,
      cutoff: 180
    });
  }

  function edmChord(midi, time, duration, volume) {
    edmSupersaw(midi, time, duration, volume);
    edmSupersaw(midi + 7, time, duration, volume * 0.72);
    edmSupersaw(midi + 12, time, duration, volume * 0.62);
  }

  function runEdm(step, time) {
    const chord = chordIndexForStep(step);
    const s = step % 32;
    const root = chordRoot(chord);

    if ([0, 8, 16, 24].includes(s)) {
      edmSub(root, time, 0.28, 0.09);

      edmChord(
        root + 12,
        time,
        s % 16 === 0 ? 0.32 : 0.23,
        0.045
      );
    }

    if ([4, 12, 20, 28].includes(s)) {
      edmSub(root, time, 0.20, 0.062);
    }

    const melody = [
      0, -1, 2, -1, 4, -1, 6, 4,
      3, -1, 5, -1, 4, 2, 1, -1,
      0, -1, 2, 4, 6, -1, 5, 4,
      3, 2, -1, 4, 5, -1, 2, 1
    ];

    const degree = melody[s];

    if (degree >= 0 && chance(0.83)) {
      const variation =
        motifDegree(step, Math.floor(step / 8)) % 3;

      edmSupersaw(
        scaleMidi(degree + variation, 2),
        time,
        0.13 + (s % 8 === 0 ? 0.05 : 0),
        [0, 8, 16, 24].includes(s) ? 0.055 : 0.037
      );

      if ([6, 14, 22, 30].includes(s) && chance(0.42)) {
        edmSupersaw(
          scaleMidi(motifDegree(step, 2), 3),
          time + 0.025,
          0.12,
          0.026
        );
      }
    }
  }

  // --------------------------------------------------
  // Scheduler
  // --------------------------------------------------

  function processStep(time) {
    if (!profile) return;

    const chord = chordIndexForStep(stepIndex);
    lastChordIndex = chord;

    const delta = smoothBpm - profile.averageBpm;

    profile.liveCutoff = clamp(
      profile.genre.cutoff + delta * 22,
      450,
      10000
    );

switch (profile.genre.id) {
  case 'AMBIENT':
    runAmbient(stepIndex, time);
    break;

  case 'TECHNO':
    runTechno(stepIndex, time);
    break;

  case 'EDM':
    runEdm(stepIndex, time);
    break;

  case 'FUTURE':
    // Future의 배경 루프와 드럼은 effects.js에서 재생
    break;

  default:
    runAmbient(stepIndex, time);
    break;
}  }

  function scheduleAhead() {
    if (!profile || !ctx || ctx.state !== 'running') {
      return;
    }

    const ahead = ctx.currentTime + 0.12;
    let guard = 0;

    while (nextStepTime < ahead && guard < 32) {
      processStep(nextStepTime);

      const bpm = clamp(
        smoothBpm * profile.genre.tempoMultiplier,
        40,
        210
      );

      nextStepTime +=
        (60 / bpm) * profile.genre.stepBeats;

      stepIndex++;
      guard++;
    }
  }

  // --------------------------------------------------
  // Public API
  // --------------------------------------------------

  function getProfile() {
    return profile;
  }

  function getBus() {
    return outputBus;
  }

  function getContext() {
    return ctx;
  }

  function getState() {
    return state;
  }

  function getDensity() {
    return density;
  }

  window.PulseMusic = {
    init,
    createProfile,
    updateBpm,
    getProfile,
    getBus,
    getContext,
    getState,
    getDensity,
    getChordTones,
    playSample
  };
})();