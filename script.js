(() => {
  'use strict';

  const bpmEl = document.querySelector('#bpm');
  const stateEl = document.querySelector('#state');
  const beatCountEl = document.querySelector('#beatCount');
  const clockEl = document.querySelector('#clock');
  const wavePath = document.querySelector('#wavePath');

  const startOverlay = document.querySelector('#startOverlay');
  const nameInput = document.querySelector('#participantName');
  const measurementForm = document.querySelector('#measurementForm');
  const startNotice = document.querySelector('#startNotice');
  const introMusic = document.querySelector('#introMusic');

  let sessionStarted = false;
  let participantName = '';
  let beat = 1;

  let introStarted = false;
  let introTransitionStarted = false;
  let introPlayPromise = null;
  let introFadeInterval = null;

  const bpmSamples = [];
  const SAMPLE_COUNT = 5;

  // ========================================
  // 시계
  // ========================================

  function updateClock() {
    if (!clockEl) return;

    const now = new Date();

    clockEl.textContent = [
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    ].map(value => String(value).padStart(2, '0')).join(':');
  }

  // ========================================
  // 인트로 음악
  // 첫 클릭 시 재생
  // ========================================

  function startIntroMusic() {
    if (
      !introMusic ||
      introStarted ||
      introTransitionStarted
    ) {
      return;
    }

    introStarted = true;
    introMusic.volume = 1;

    const attempt = introMusic.play();

    introPlayPromise = attempt
      .then(() => {
        console.log('0922.wav 재생 중');
        return true;
      })
      .catch(error => {
        introStarted = false;

        console.error(
          '0922.wav 재생 실패:',
          error
        );

        return false;
      });
  }

  document.addEventListener('pointerdown', startIntroMusic);
  document.addEventListener('keydown', startIntroMusic);

  // ========================================
  // 인트로 페이드아웃
  // 프로필 생성 전 호출
  // ========================================

  function fadeOutIntroMusic(duration = 2200) {
    if (!introMusic || introTransitionStarted) return;

    // 중복 호출 및 다시 재생되는 상황 방지
    introTransitionStarted = true;

    if (introFadeInterval !== null) {
      clearInterval(introFadeInterval);
      introFadeInterval = null;
    }

    function beginFade() {
      if (!introMusic) return;

      // 재생이 시작되지 않았거나 이미 끝난 경우
      if (introMusic.paused || introMusic.ended) {
        introMusic.volume = 0;
        introMusic.pause();

        try {
          introMusic.currentTime = 0;
        } catch (error) {
          console.warn(error);
        }

        console.log('0922.wav는 이미 정지 상태');
        return;
      }

      const initialVolume = introMusic.volume;
      const startTime = performance.now();

      introFadeInterval = setInterval(() => {
        const elapsed = performance.now() - startTime;

        const progress = Math.min(
          1,
          elapsed / duration
        );

        // 마지막으로 갈수록 부드럽게 감소
        const curve = Math.pow(1 - progress, 1.5);

        introMusic.volume = initialVolume * curve;

        if (progress >= 1) {
          clearInterval(introFadeInterval);
          introFadeInterval = null;

          // 볼륨을 0으로 만든 후 확실하게 정지
          introMusic.volume = 0;
          introMusic.pause();

          try {
            introMusic.currentTime = 0;
          } catch (error) {
            console.warn(error);
          }

          console.log('0922.wav 페이드아웃 완료');
        }
      }, 25);
    }

    // 재생 요청이 진행 중이라면 결과를 기다린 후 페이드
    if (introPlayPromise) {
      introPlayPromise.then(() => {
        beginFade();
      });
    } else {
      beginFade();
    }
  }

  // ========================================
  // 심박 파형
  // ========================================

  let waveStartTime = null;
  let waveAnimating = false;
  let waveTargetBpm = 72;
  let waveSmoothBpm = 72;
  let nextBeatTime = null;
  const waveBeatTimes = [];

  const WAVE_WIDTH = 900;
  const WAVE_CENTER_Y = 46;
  const WAVE_POINTS = 540;
  const WAVE_SCROLL_SPEED = 160;

  function drawWave(bpm) {
    waveTargetBpm = bpm;

    if (!waveAnimating) {
      waveAnimating = true;
      requestAnimationFrame(animateWave);
    }
  }

  function animateWave(timestamp) {
    if (!wavePath) {
      waveAnimating = false;
      return;
    }

    if (waveStartTime === null) {
      waveStartTime = timestamp;
    }

    const elapsed = (timestamp - waveStartTime) / 1000;

    waveSmoothBpm +=
      (waveTargetBpm - waveSmoothBpm) * 0.025;

    waveSmoothBpm = Math.max(
      40,
      Math.min(180, waveSmoothBpm)
    );

    if (nextBeatTime === null) {
      waveBeatTimes.push(0);
      nextBeatTime = 60 / waveSmoothBpm;
    }

    while (elapsed >= nextBeatTime) {
      waveBeatTimes.push(nextBeatTime);
      nextBeatTime += 60 / waveSmoothBpm;
    }

    const visibleSeconds = WAVE_WIDTH / WAVE_SCROLL_SPEED;

    while (
      waveBeatTimes.length > 0 &&
      waveBeatTimes[0] <
        elapsed - visibleSeconds - 0.5
    ) {
      waveBeatTimes.shift();
    }

    let path = '';

    for (let i = 0; i <= WAVE_POINTS; i++) {
      const x = i / WAVE_POINTS * WAVE_WIDTH;

      const sampleTime =
        elapsed - (WAVE_WIDTH - x) / WAVE_SCROLL_SPEED;

      let signal = 0;

      for (const beatTime of waveBeatTimes) {
        const dt = sampleTime - beatTime;

        if (dt < -0.32 || dt > 0.42) continue;

        signal += -6 *
          Math.exp(-Math.pow((dt + 0.20) / 0.05, 2));

        signal += 7 *
          Math.exp(-Math.pow((dt + 0.025) / 0.010, 2));

        signal += -38 *
          Math.exp(-Math.pow(dt / 0.012, 2));

        signal += 13 *
          Math.exp(-Math.pow((dt - 0.035) / 0.017, 2));

        signal += -10 *
          Math.exp(-Math.pow((dt - 0.22) / 0.060, 2));
      }

      const y =
        WAVE_CENTER_Y +
        signal +
        Math.sin(sampleTime * 1.3) * 0.25;

      path += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
    }

    wavePath.setAttribute('d', path);

    requestAnimationFrame(animateWave);
  }

  // ========================================
  // BPM 업데이트
  // ========================================

  function update() {
    updateClock();

    if (!sessionStarted) {
      if (bpmEl) bpmEl.textContent = '---';
      if (stateEl) stateEl.textContent = 'READY';
      if (beatCountEl) beatCountEl.textContent = '0000';
      return;
    }

    // 테스트용 BPM 시뮬레이션
    // 실제 센서 연결 시 센서값으로 교체
    const bpm = Math.round(
      69 +
      Math.sin(Date.now() / 4300) * 7 +
      (Math.random() * 2 - 1)
    );

    if (bpmEl) {
      bpmEl.textContent = String(bpm).padStart(3, '0');
    }

    if (beatCountEl) {
      beatCountEl.textContent =
        String(beat++).padStart(4, '0');
    }

    drawWave(bpm);

    if (typeof window.updateHeartRate === 'function') {
      window.updateHeartRate(bpm);
    }

    // 모듈 로드 확인
    if (
      !window.PulseMusic ||
      !window.PulseEffects
    ) {
      if (stateEl) stateEl.textContent = 'MODULE ERROR';

      console.error(
        'PulseMusic 또는 PulseEffects 모듈을 찾을 수 없습니다.'
      );

      return;
    }

    // 기존 개인 프로필이 있으면 실시간 BPM 반영
    window.PulseMusic.updateBpm(bpm);
    window.PulseEffects.updateBpm(bpm);
    window.PulseEffects.updateDrumLevel();

    // ====================================
    // 최초 10회 BPM 수집 후 음악 전환
    // ====================================

    if (!window.PulseMusic.getProfile()) {
      bpmSamples.push(bpm);

      if (bpmSamples.length >= SAMPLE_COUNT) {
        const firstTenSamples =
          bpmSamples.slice(0, SAMPLE_COUNT);

        // 핵심: 새 음악을 초기화하기 전에
        // 인트로 페이드아웃을 먼저 시작
        fadeOutIntroMusic(2200);

        const profile = window.PulseMusic.createProfile(
          firstTenSamples,
          participantName
        );

        if (profile) {
          window.PulseEffects.startForProfile(profile);
        } else {
          console.error(
            '음악 프로필 생성 실패. music.js를 확인하세요.'
          );
        }
      }
    }

    if (stateEl) {
      stateEl.textContent =
        window.PulseMusic.getProfile()
          ? window.PulseMusic.getState()
          : (
              bpm < 65 ? 'SLOW' :
              bpm < 90 ? 'STEADY' :
              'ELEVATED'
            );
    }
  }

  // ========================================
  // 측정 시작
  // ========================================

  if (measurementForm) {
    measurementForm.addEventListener('submit', async event => {
      event.preventDefault();

      if (sessionStarted) return;

      const name = nameInput
        ? nameInput.value.trim()
        : '';

      if (!name) {
        if (startNotice) {
          startNotice.textContent =
            '이름 또는 닉네임을 입력해 주세요.';
        }

        if (nameInput) nameInput.focus();
        return;
      }

      if (
        !window.PulseMusic ||
        !window.PulseEffects
      ) {
        if (startNotice) {
          startNotice.textContent =
            '음악 모듈 로딩에 실패했습니다.';
        }

        return;
      }

      participantName = name;
      window.participantName = name;

      sessionStarted = true;

      if (startOverlay) {
        startOverlay.classList.add('is-hidden');
      }

      window.dispatchEvent(
        new CustomEvent('measurementstart', {
          detail: { name }
        })
      );

      try {
        const ctx = await window.PulseMusic.init();

        window.PulseEffects.init(
          ctx,
          window.PulseMusic.getBus()
        );

        window.PulseEffects.setSessionActive(true);

        update();
      } catch (error) {
        console.error('오디오 초기화 실패:', error);

        sessionStarted = false;

        if (startNotice) {
          startNotice.textContent =
            '오디오 초기화에 실패했습니다. Console을 확인해 주세요.';
        }
      }
    });
  } else {
    console.error(
      'measurementForm을 찾을 수 없습니다.'
    );
  }

  update();
  setInterval(update, 1000);
})();