/*
 * STATE#36 / PULSE RESPONSE
 * effects.js
 *
 * AMBIENT:
 *   Short touch = change visual color.
 *   Hold = sample-based breakbeat.
 *
 * FUTURE:
 *   A + A' play together.
 *   B plays instead of A + A'.
 *   Each participant receives either AA or B, randomly.
 *   Only A, A', and B use the original 140 BPM reference.
 *   Their playback-rate change is limited to +/- 3 semitones.
 *   Kick / Snare / Hat retain their original playback speed.
 *   Future drum pattern timing follows the measured BPM.
 *
 * TECHNO / EDM:
 *   Existing touch combinations and synth effects.
 */

(() => {
  'use strict';

  // ========================================
  // 설정
  // ========================================

  const TOUCH_GENRES = [
    { id: 'GLITCH', name: 'Glitch', interval: 180 },
    { id: 'INDUSTRIAL', name: 'Industrial', interval: 420 },
    { id: 'BREAKBEAT', name: 'Breakbeat', interval: 250 },
    { id: 'GRANULAR', name: 'Granular', interval: 115 }
  ];

  const SHORT_TOUCH_LIMIT = 250;

  // 140 BPM 기준은 Future 배경 루프 A / A' / B에만 적용
  const FUTURE_BPM = 140;

  // A / A' / B의 재생 속도 변화를 +/- 3반음으로 제한
  const MIN_PLAYBACK_RATE = Math.pow(2, -3 / 12);
  const MAX_PLAYBACK_RATE = Math.pow(2, 3 / 12);

  let ctx = null;
  let bus = null;
  let profile = null;

  let sessionActive = false;
  let touchHeld = false;

  let currentBpm = 72;

  let touchTimer = null;
  let touchStep = 0;
  let pressCount = 0;

  let touchStartedAt = 0;
  let holdActivationTimer = null;

  let ambientDrumTimer = null;
  let ambientDrumStep = 0;

  let futureDrumTimer = null;
  let futureDrumStep = 0;

  // Future 배경 루프 상태
  let futureSamplesPromise = null;
  let futureBackgroundRunId = 0;
  let futureLoops = [];

  const futureSampleBuffers = Object.create(null);

  const FUTURE_SAMPLE_FILES = [
    'A_140_Cmaj.wav',
    "A'_140_Cmaj.wav",
    'B_140_F#min.wav',
    'Hat.wav',
    'Kick.wav',
    'Snare.wav'
  ];

  const touchSurface =
    document.querySelector('#visualContainer') ||
    document.querySelector('#videoFrame');

  // ========================================
  // Future 배경 루프 재생 속도
  // A / A' / B 전용
  // ========================================

  function getFuturePlaybackRate() {
    const requestedRate =
      Math.max(1, currentBpm) / FUTURE_BPM;

    return Math.max(
      MIN_PLAYBACK_RATE,
      Math.min(MAX_PLAYBACK_RATE, requestedRate)
    );
  }

  // ========================================
  // 비주얼 색상 변경
  // ========================================

  const VISUAL_HUES = [
    45, 90, 135, 180, 225, 270, 315
  ];

  let lastVisualHue = null;

  function getVisualColorTarget() {
    return (
      document.querySelector('#visualCanvas') ||
      document.querySelector('#visualContainer canvas') ||
      document.querySelector('#videoFrame canvas') ||
      touchSurface
    );
  }

  function changeVisualColor() {
    const target = getVisualColorTarget();

    if (!target) {
      console.warn(
        '[PulseEffects] 비주얼 색상 변경 대상을 찾지 못했습니다.'
      );
      return;
    }

    const availableHues = VISUAL_HUES.filter(
      hue => hue !== lastVisualHue
    );

    const hue = availableHues[
      Math.floor(Math.random() * availableHues.length)
    ];

    lastVisualHue = hue;

    target.style.transition = 'filter 220ms ease';
    target.style.filter =
      `hue-rotate(${hue}deg) saturate(1.35)`;

    console.info('[PulseEffects] 비주얼 색상 변경:', hue);
  }

  // ========================================
  // Ambient 드럼 패턴
  // ========================================

  const AMBIENT_PATTERN = {
    kick: {
      steps: [0, 6, 10, 16, 22, 26, 30],
      gain: 0.25
    },

    snare: {
      steps: [4, 12, 20, 28],
      gain: 0.35
    },

    perc: {
      steps: [3, 7, 11, 15, 19, 23, 27, 31],
      gain: 0.075
    },

    cymbal: {
      steps: [0],
      gain: 0.045
    }
  };

  // ========================================
  // Future 드럼 패턴
  // 16분음표 기준 2마디
  // 샘플 재생 속도는 변경하지 않음
  // ========================================

  const FUTURE_PATTERN = {
    kick: {
      steps: [
        0, 4, 8, 12,
        16, 20, 24, 28
      ],
      gain: 0.22
    },

    snare: {
      steps: [4, 12, 20, 28],
      gain: 0.14
    },

    hat: {
      steps: [
        2, 6, 10, 14,
        18, 22, 26, 30
      ],
      gain: 0.045
    }
  };

  const PATTERN_LENGTH = 32;

  // ========================================
  // Future 샘플 로딩
  // ========================================

  function loadFutureSamples() {
    if (futureSamplesPromise) {
      return futureSamplesPromise;
    }

    if (!ctx) {
      return Promise.resolve();
    }

    futureSamplesPromise = Promise.allSettled(
      FUTURE_SAMPLE_FILES.map(async filename => {
        const response = await fetch(
          `audio/Future/${encodeURIComponent(filename)}`
        );

        if (!response.ok) {
          throw new Error(
            `${filename}: HTTP ${response.status}`
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);

        futureSampleBuffers[filename] = decoded;

        console.info(
          '[PulseEffects] Future 샘플 로딩:',
          filename
        );

        return filename;
      })
    ).then(results => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            '[PulseEffects] Future 샘플 로딩 실패:',
            FUTURE_SAMPLE_FILES[index],
            result.reason
          );
        }
      });
    });

    return futureSamplesPromise;
  }

  // ========================================
  // 초기화
  // ========================================

  function init(audioContext, outputBus) {
    if (ctx) return;

    if (!audioContext || !outputBus) {
      console.error(
        '[PulseEffects] AudioContext 또는 outputBus가 없습니다.'
      );
      return;
    }

    ctx = audioContext;
    bus = outputBus;

    loadFutureSamples();

    if (touchSurface) {
      touchSurface.addEventListener('pointerdown', event => {
        if (
          event.pointerType === 'mouse' &&
          event.button !== 0
        ) {
          return;
        }

        setTouchState(true);
      });
    } else {
      console.warn(
        '[PulseEffects] 터치 영역을 찾을 수 없습니다.'
      );
    }

    window.addEventListener('pointerup', () => {
      setTouchState(false);
    });

    window.addEventListener('pointercancel', () => {
      setTouchState(false);
    });

    window.addEventListener('blur', () => {
      setTouchState(false);
    });

    window.addEventListener('touchsensorchange', event => {
      setTouchState(
        Boolean(event.detail && event.detail.touched)
      );
    });

    window.setTouchSensorState = setTouchState;

    console.info('[PulseEffects] 초기화 완료');
  }

  // ========================================
  // 세션 제어
  // ========================================

  function setSessionActive(value) {
    sessionActive = Boolean(value);

    if (!sessionActive) {
      setTouchState(false);
      stopFutureBackground();
    }
  }

  function startForProfile(musicProfile) {
    setTouchState(false);
    stopFutureBackground();

    profile = musicProfile;

    if (!profile) {
      console.error('[PulseEffects] 프로필이 없습니다.');
      return;
    }

    if (profile.genre.id === 'AMBIENT') {
      profile.touchGenre = {
        id: 'AMBIENT_BREAKBEAT',
        name: 'Ambient Breakbeat',
        interval: 180
      };

    } else if (profile.genre.id === 'FUTURE') {
      profile.touchGenre = {
        id: 'FUTURE_BREAKBEAT',
        name: 'Future Breakbeat',
        interval: 180
      };

      // 참가자마다 한 번만 랜덤 배정
      // AA = A와 A′ 동시 재생
      // B  = B만 재생
      // 각 참가자에게는 한 조합만 재생
      profile.futureArrangement =
        Math.random() < 0.5 ? 'AA' : 'B';

      console.info(
        '[PulseEffects] Future arrangement:',
        profile.futureArrangement === 'AA' ? 'A + A′' : 'B'
      );

      startFutureBackground();

    } else {
      profile.touchGenre = TOUCH_GENRES[
        Math.floor(Math.random() * TOUCH_GENRES.length)
      ];
    }

    touchStep = 0;
    pressCount = 0;
    ambientDrumStep = 0;
    futureDrumStep = 0;

    console.info(
      '[PulseEffects] 터치 장르:',
      profile.touchGenre.name
    );
  }

  // ========================================
  // BPM 업데이트
  // Future 배경 루프 A / A' / B에만 재생 속도 적용
  // ========================================

  function updateBpm(bpm) {
    const value = Number(bpm);

    if (!Number.isFinite(value) || value <= 0) return;

    currentBpm = Math.max(35, Math.min(190, value));

    if (ctx && ctx.state === 'running') {
      const rate = getFuturePlaybackRate();

      futureLoops.forEach(loop => {
        try {
          loop.source.playbackRate.setTargetAtTime(
            rate,
            ctx.currentTime,
            0.15
          );
        } catch (error) {
          console.warn(
            '[PulseEffects] Future 재생 속도 업데이트 실패:',
            error
          );
        }
      });
    }

    // Kick / Snare / Hat의 재생 속도는 변경하지 않음.
    // Future 드럼 패턴의 타이밍은 각 스텝에서
    // currentBpm을 기준으로 계산함.
  }

  // script.js 호환용
  function updateDrumLevel() {}

  // ========================================
  // 기존 Ancient 샘플 재생
  // ========================================

  function triggerSample(
    filename,
    gain,
    delay = 0,
    pan = 0,
    reverb = 0
  ) {
    if (
      !window.PulseMusic ||
      typeof window.PulseMusic.playSample !== 'function'
    ) {
      console.warn(
        '[PulseEffects] PulseMusic.playSample을 사용할 수 없습니다.'
      );
      return false;
    }

    return window.PulseMusic.playSample(filename, {
      gain,
      delay,
      pan,
      reverb
    });
  }

  // ========================================
  // Future 드럼 샘플 재생
  //
  // 중요:
  // Kick / Snare / Hat에는 Future BPM 비율을
  // 적용하지 않는다. 샘플 원래 재생 속도를 유지한다.
  // ========================================

  function playFutureSample(
    filename,
    gain = 0.1,
    delay = 0,
    pan = 0
  ) {
    if (
      !ctx ||
      !bus ||
      ctx.state !== 'running'
    ) {
      return false;
    }

    const buffer = futureSampleBuffers[filename];

    if (!buffer) {
      console.warn(
        '[PulseEffects] Future 샘플을 찾을 수 없습니다:',
        filename
      );
      return false;
    }

    const startAt = ctx.currentTime + Math.max(0, delay);

    const source = ctx.createBufferSource();
    const volume = ctx.createGain();

    source.buffer = buffer;

    // playbackRate를 변경하지 않음.
    // Kick / Snare / Hat는 원래 속도로 재생한다.

    volume.gain.setValueAtTime(0.0001, startAt);

    volume.gain.linearRampToValueAtTime(
      Math.max(0.0001, gain),
      startAt + 0.005
    );

    source.connect(volume);

    const stereoPan = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;

    if (stereoPan) {
      stereoPan.pan.setValueAtTime(
        Math.max(-1, Math.min(1, pan)),
        startAt
      );

      volume.connect(stereoPan);
      stereoPan.connect(bus);
    } else {
      volume.connect(bus);
    }

    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      try { volume.disconnect(); } catch (_) {}

      if (stereoPan) {
        try { stereoPan.disconnect(); } catch (_) {}
      }
    };

    source.start(startAt);

    return true;
  }

  // ========================================
  // Future 배경 루프 정리
  // ========================================

  function fadeOutFutureLoops() {
    if (!ctx) return;

    const now = ctx.currentTime;
    const oldLoops = futureLoops;

    futureLoops = [];

    oldLoops.forEach(loop => {
      try {
        loop.gain.gain.cancelScheduledValues(now);

        loop.gain.gain.setValueAtTime(
          Math.max(0.0001, loop.gain.gain.value),
          now
        );

        loop.gain.gain.linearRampToValueAtTime(
          0.0001,
          now + 0.18
        );

        loop.source.stop(now + 0.2);
      } catch (_) {
        // 이미 종료 중인 샘플은 무시
      }
    });
  }

  // ========================================
  // Future 배경 루프 생성
  //
  // A / A' / B만 원본 140 BPM 기준 재생 속도 적용
  // ========================================

  function playFutureLoop(
    filename,
    gainValue,
    runId,
    startAt = ctx.currentTime
  ) {
    if (
      runId !== futureBackgroundRunId ||
      !ctx ||
      ctx.state !== 'running'
    ) {
      return;
    }

    const buffer = futureSampleBuffers[filename];

    if (!buffer) {
      console.warn(
        '[PulseEffects] Future 루프를 찾을 수 없습니다:',
        filename
      );
      return;
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.loop = true;

    const scheduledStart = Math.max(
      ctx.currentTime,
      Number(startAt) || ctx.currentTime
    );

    // A / A' / B에만 심박 기반 재생 속도 적용
    // 재생 속도 변화는 +/- 3반음으로 제한
    source.playbackRate.setValueAtTime(
      getFuturePlaybackRate(),
      scheduledStart
    );

    // 짧은 페이드 인
    gain.gain.setValueAtTime(0.0001, scheduledStart);

    gain.gain.linearRampToValueAtTime(
      gainValue,
      scheduledStart + 0.18
    );

    source.connect(gain);
    gain.connect(bus);

    const loop = { source, gain };
    futureLoops.push(loop);

    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}

      futureLoops = futureLoops.filter(
        item => item.source !== source
      );
    };

    source.start(scheduledStart);
  }

  // ========================================
  // Future 배경 시작
  // A + A′ 또는 B 중 한 조합만 유지
  // ========================================

  function startFutureBackground() {
    stopFutureBackground();

    if (
      !profile ||
      profile.genre.id !== 'FUTURE' ||
      !ctx
    ) {
      return;
    }

    const runId = futureBackgroundRunId;

    loadFutureSamples().then(() => {
      if (
        runId !== futureBackgroundRunId ||
        !sessionActive ||
        !profile ||
        profile.genre.id !== 'FUTURE' ||
        ctx.state !== 'running'
      ) {
        return;
      }

      const startAt = ctx.currentTime + 0.05;

      if (profile.futureArrangement === 'AA') {
        // A와 A′를 같은 시각에 시작해 겹쳐 재생
        playFutureLoop(
          'A_140_Cmaj.wav',
          0.13,
          runId,
          startAt
        );

        playFutureLoop(
          "A'_140_Cmaj.wav",
          0.10,
          runId,
          startAt
        );

      } else {
        // B 참가자는 B만 재생
        playFutureLoop(
          'B_140_F#min.wav',
          0.13,
          runId,
          startAt
        );
      }

      console.info(
        '[PulseEffects] 선택된 Future 조합:',
        profile.futureArrangement,
        '| Heart BPM:',
        currentBpm,
        '| Arrangement playback rate:',
        getFuturePlaybackRate()
      );
    });
  }

  function stopFutureBackground() {
    futureBackgroundRunId++;
    fadeOutFutureLoops();
  }

  // ========================================
  // Ambient 드럼 시작
  // 패턴 타이밍은 현재 BPM 사용
  // ========================================

  function startAmbientBreakbeat() {
    stopAmbientBreakbeat();

    if (
      !touchHeld ||
      !sessionActive ||
      !profile ||
      profile.genre.id !== 'AMBIENT' ||
      !ctx ||
      ctx.state !== 'running'
    ) {
      return;
    }

    ambientDrumStep = 0;

    function tick() {
      ambientDrumTimer = null;

      if (
        !touchHeld ||
        !sessionActive ||
        !profile ||
        profile.genre.id !== 'AMBIENT' ||
        ctx.state !== 'running'
      ) {
        return;
      }

      playAmbientStep(ambientDrumStep);

      ambientDrumStep =
        (ambientDrumStep + 1) % PATTERN_LENGTH;

      const interval =
        60000 / Math.max(1, currentBpm) / 4;

      ambientDrumTimer = setTimeout(tick, interval);
    }

    tick();
  }

  function playAmbientStep(step) {
    const pattern = AMBIENT_PATTERN;

    if (pattern.kick.steps.includes(step)) {
      triggerSample('Kick.wav', pattern.kick.gain);
    }

    if (pattern.snare.steps.includes(step)) {
      triggerSample('Snare.wav', pattern.snare.gain);
    }

    if (pattern.perc.steps.includes(step)) {
      triggerSample(
        'Perc.wav',
        pattern.perc.gain,
        0,
        step % 2 === 0 ? -0.2 : 0.2
      );
    }

    if (pattern.cymbal.steps.includes(step)) {
      triggerSample(
        'Cymbal.wav',
        pattern.cymbal.gain,
        0,
        0,
        0.8
      );
    }
  }

  function stopAmbientBreakbeat() {
    if (ambientDrumTimer !== null) {
      clearTimeout(ambientDrumTimer);
      ambientDrumTimer = null;
    }
  }

  // ========================================
  // Future 드럼 시작
  //
  // 스텝 간격 = 현재 심박 BPM의 16분음표 간격
  // 드럼 샘플 playbackRate는 변경하지 않음
  // ========================================

  function startFutureBreakbeat() {
    stopFutureBreakbeat();

    if (
      !touchHeld ||
      !sessionActive ||
      !profile ||
      profile.genre.id !== 'FUTURE' ||
      !ctx ||
      ctx.state !== 'running'
    ) {
      return;
    }

    futureDrumStep = 0;

    function tick() {
      futureDrumTimer = null;

      if (
        !touchHeld ||
        !sessionActive ||
        !profile ||
        profile.genre.id !== 'FUTURE' ||
        ctx.state !== 'running'
      ) {
        return;
      }

      playFutureDrumStep(futureDrumStep);

      futureDrumStep =
        (futureDrumStep + 1) % PATTERN_LENGTH;

      // 현재 심박수에 맞춰 다음 드럼 스텝 예약
      // 이 값은 스텝 간격만 조절하며 샘플 피치는 바꾸지 않음
      const interval =
        60000 / Math.max(1, currentBpm) / 4;

      futureDrumTimer = setTimeout(tick, interval);
    }

    tick();
  }

  function playFutureDrumStep(step) {
    const pattern = FUTURE_PATTERN;

    if (pattern.kick.steps.includes(step)) {
      playFutureSample(
        'Kick.wav',
        pattern.kick.gain
      );
    }

    if (pattern.snare.steps.includes(step)) {
      playFutureSample(
        'Snare.wav',
        pattern.snare.gain,
        0,
        0.1
      );
    }

    if (pattern.hat.steps.includes(step)) {
      playFutureSample(
        'Hat.wav',
        pattern.hat.gain,
        0,
        step % 4 === 2 ? -0.25 : 0.25
      );
    }
  }

  function stopFutureBreakbeat() {
    if (futureDrumTimer !== null) {
      clearTimeout(futureDrumTimer);
      futureDrumTimer = null;
    }
  }

  // ========================================
  // 터치 상태
  // 짧은 탭은 색상 변경
  // 길게 누르면 드럼 시작
  // ========================================

  function setTouchState(value) {
    const nextState = Boolean(value);

    if (!nextState) {
      if (touchHeld) {
        const duration =
          performance.now() - touchStartedAt;

        touchHeld = false;

        if (holdActivationTimer !== null) {
          clearTimeout(holdActivationTimer);
          holdActivationTimer = null;
        }

        stopTouchLoop();
        stopAmbientBreakbeat();
        stopFutureBreakbeat();

        // 짧은 탭은 드럼 대신 색상만 변경
        if (duration <= SHORT_TOUCH_LIMIT) {
          changeVisualColor();
        }

        console.info(
          '[PulseEffects] 터치 종료:',
          Math.round(duration),
          'ms'
        );

        touchStartedAt = 0;
      }

      return;
    }

    if (
      !sessionActive ||
      !profile ||
      !profile.touchGenre ||
      touchHeld
    ) {
      return;
    }

    touchHeld = true;
    touchStartedAt = performance.now();

    console.info(
      '[PulseEffects] 터치 시작:',
      profile.touchGenre.name
    );

    // Ambient와 Future는 일정 시간 이상 누를 때 드럼 시작
    if (
      profile.genre.id === 'AMBIENT' ||
      profile.genre.id === 'FUTURE'
    ) {
      holdActivationTimer = setTimeout(() => {
        holdActivationTimer = null;

        if (!touchHeld || !sessionActive) return;

        if (profile.genre.id === 'AMBIENT') {
          startAmbientBreakbeat();
        } else {
          startFutureBreakbeat();
        }
      }, SHORT_TOUCH_LIMIT);

      return;
    }

    playDrumCombination();
    startTouchLoop();
  }

  // ========================================
  // 다른 장르의 단발 드럼 샘플 조합
  // ========================================

  function playDrumCombination() {
    if (!profile || !profile.touchGenre) return;

    const genre = profile.touchGenre.id;
    const press = pressCount;

    switch (genre) {
      case 'GLITCH': {
        triggerSample('Perc.wav', 0.12, 0, -0.15);

        if (press % 4 === 0) {
          triggerSample('Kick.wav', 0.20, 0.035, 0.1);
        }

        if (press % 3 === 0) {
          triggerSample(
            'Cymbal.wav',
            0.07,
            0.055,
            0.45,
            0.8
          );
        }

        break;
      }

      case 'INDUSTRIAL': {
        triggerSample('Kick.wav', 0.25);
        triggerSample(
          'Cymbal.wav',
          0.095,
          0.045,
          0.3,
          0.8
        );

        if (press % 2 === 0) {
          triggerSample('Perc.wav', 0.09, 0.08, -0.35);
        }

        break;
      }

      case 'BREAKBEAT': {
        if (press % 2 === 0) {
          triggerSample('Kick.wav', 0.24);
          triggerSample('Snare.wav', 0.17, 0.105, 0.15);
        } else {
          triggerSample('Snare.wav', 0.18, 0, 0.12);
          triggerSample('Perc.wav', 0.10, 0.055, -0.25);
        }

        break;
      }

      case 'GRANULAR': {
        triggerSample('Perc.wav', 0.105, 0, 0.2);

        if (Math.random() < 0.55) {
          triggerSample(
            'Cymbal.wav',
            0.075,
            0.035,
            -0.35,
            0.8
          );
        }

        if (press % 4 === 0) {
          triggerSample('Kick.wav', 0.17, 0.06);
        }

        break;
      }
    }

    pressCount++;
  }

  // ========================================
  // 다른 장르의 터치 신스 루프
  // ========================================

  function startTouchLoop() {
    stopTouchLoop();

    if (
      !touchHeld ||
      !profile ||
      !ctx ||
      profile.genre.id === 'AMBIENT' ||
      profile.genre.id === 'FUTURE'
    ) {
      return;
    }

    function step() {
      touchTimer = null;

      if (
        !touchHeld ||
        !sessionActive ||
        !profile ||
        ctx.state !== 'running'
      ) {
        return;
      }

      playTouchEvent();

      const currentDensity =
        window.PulseMusic &&
        typeof window.PulseMusic.getDensity === 'function'
          ? window.PulseMusic.getDensity()
          : 0.25;

      const interval = Math.max(
        80,
        Math.min(
          650,
          profile.touchGenre.interval - currentDensity * 40
        )
      );

      touchTimer = setTimeout(step, interval);
    }

    step();
  }

  function stopTouchLoop() {
    if (touchTimer !== null) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  }

  // ========================================
  // 현재 화성 음 선택
  // ========================================

  function getCurrentTones() {
    if (!profile) return [36, 39, 43];

    if (
      window.PulseMusic &&
      typeof window.PulseMusic.getChordTones === 'function'
    ) {
      const tones = window.PulseMusic.getChordTones();

      if (Array.isArray(tones) && tones.length > 0) {
        return tones;
      }
    }

    const root = profile.rootMidi;

    return [
      root,
      root + 3,
      root + 7,
      root + 8,
      root + 10,
      root + 12,
      root + 15
    ];
  }

  // ========================================
  // Techno / EDM 터치 신스
  // ========================================

  function playTouchEvent() {
    if (
      !ctx ||
      !profile ||
      !profile.touchGenre ||
      !touchHeld ||
      profile.genre.id === 'AMBIENT' ||
      profile.genre.id === 'FUTURE'
    ) {
      return;
    }

    const tones = getCurrentTones();
    const effect = profile.touchGenre.id;

    switch (effect) {
      case 'GLITCH': {
        const count = Math.random() < 0.5 ? 2 : 3;

        for (let i = 0; i < count; i++) {
          setTimeout(() => {
            if (!touchHeld) return;

            const note =
              tones[(touchStep + i) % tones.length];

            playTone(
              note + 24,
              0.018,
              0.065,
              'triangle'
            );
          }, i * 40);
        }

        touchStep++;
        break;
      }

      case 'INDUSTRIAL': {
        const note =
          tones[touchStep % tones.length] + 36;

        playMetalTone(note);
        touchStep++;
        break;
      }

      case 'BREAKBEAT': {
        const note =
          tones[touchStep % tones.length] +
          (touchStep % 2 === 0 ? 12 : 24);

        playTone(note, 0.025, 0.10, 'triangle');
        touchStep++;
        break;
      }

      case 'GRANULAR': {
        const note =
          tones[touchStep % tones.length] + 24;

        playTone(
          note,
          0.012,
          0.04 + Math.random() * 0.04,
          'sine'
        );

        if (Math.random() < 0.45) {
          playNoise(
            0.0025,
            0.025 + Math.random() * 0.02
          );
        }

        touchStep++;
        break;
      }
    }
  }

  // ========================================
  // 합성 단음
  // ========================================

  function playTone(midi, level, duration, waveform) {
    if (!ctx || !bus || !profile) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = waveform;

    osc.frequency.setValueAtTime(
      440 * Math.pow(2, (midi - 69) / 12),
      now
    );

    filter.type = 'lowpass';
    filter.frequency.value =
      (profile.genre.cutoff || 1200) * 2;

    filter.Q.value = 0.7;

    gain.gain.setValueAtTime(0.0001, now);

    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, level),
      now + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration
    );

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    osc.onended = () => {
      try { osc.disconnect(); } catch (_) {}
      try { filter.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
    };

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // ========================================
  // 금속성 신스
  // ========================================

  function playMetalTone(midi) {
    if (!ctx || !bus || !profile) return;

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(
      440 * Math.pow(2, (midi - 69) / 12),
      now
    );

    osc2.frequency.setValueAtTime(
      440 * Math.pow(2, (midi + 12 - 69) / 12),
      now
    );

    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 1.2;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      0.022,
      now + 0.008
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 0.28
    );

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    osc1.onended = () => {
      try { osc1.disconnect(); } catch (_) {}
    };

    osc2.onended = () => {
      try { osc2.disconnect(); } catch (_) {}
      try { filter.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
    };

    osc1.start(now);
    osc2.start(now);

    osc1.stop(now + 0.31);
    osc2.stop(now + 0.31);
  }

  // ========================================
  // 짧은 노이즈
  // ========================================

  function playNoise(level, duration) {
    if (!ctx || !bus) return;

    const length = Math.max(
      32,
      Math.floor(ctx.sampleRate * duration)
    );

    const buffer = ctx.createBuffer(
      1,
      length,
      ctx.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] =
        (Math.random() * 2 - 1) *
        (1 - i / length);
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = buffer;

    filter.type = 'highpass';
    filter.frequency.value = 2500;

    gain.gain.setValueAtTime(
      Math.max(0.0001, level),
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + duration
    );

    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      try { filter.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
    };

    source.start();
    source.stop(ctx.currentTime + duration + 0.01);
  }

  // ========================================
  // 외부 인터페이스
  // ========================================

  window.PulseEffects = {
    init,
    setSessionActive,
    startForProfile,
    updateBpm,
    updateDrumLevel,
    setTouchState,
    getSelectedLoop: () => null
  };

  console.info('[PulseEffects] 모듈 등록 완료');
})();