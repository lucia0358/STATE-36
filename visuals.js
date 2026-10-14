/*
  STATE#36 / Pulse response - visuals.js

  1번: 흰 연기
  2번: 1번과 동일한 원본 코드
  3번: 점으로 이루어진 물결 리본
  4번: 파란 네온 연기

  index.html에서 p5.js를 먼저 불러와야 합니다.
  조도 테스트: window.setLightLevel(0~100)
*/

(() => {
  const root = document.getElementById('visualCanvas');

  if (!root) {
    console.error('[visuals.js] #visualCanvas를 찾을 수 없습니다.');
    return;
  }

  if (typeof window.p5 === 'undefined') {
    console.error('[visuals.js] p5.js가 먼저 로드되어야 합니다.');
    return;
  }

  root.innerHTML = '';
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    background: '#000'
  });

  const lightValueEl = document.getElementById('lightValue');
  const visualNameEl = document.getElementById('visualName');
  const statusTextEl = document.getElementById('statusText');

  let currentBpm = 72;

const INITIAL_SAMPLE_COUNT = 10;
const initialBpmSamples = [];

let selectionLocked = false;
let activeMode = null;

  const hosts = {};
  const instances = {};

  const names = {
  1: '01 / WHITE SMOKE',
  2: '02 / NATURAL SMOKE',
  3: '03 / DOT RIBBON',
  4: '04 / BLUE NEON SMOKE'
};

  // 효과별 캔버스 영역
  [1, 2, 3, 4].forEach((id) => {
    const host = document.createElement('div');
    host.id = `visualEffect${id}`;

    Object.assign(host.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      display: 'none',
      background: '#000'
    });

    root.appendChild(host);
    hosts[id] = host;
  });

  // 심박수 입력 대기 화면
const measuringOverlay = document.createElement('div');
const measuringText = document.createElement('span');
const typingCursor = document.createElement('span');

const message = Array.from('심박수 측정 중 ···');

let typingIndex = 0;
let holdCount = 0;
let cursorVisible = true;

Object.assign(measuringOverlay.style, {
  position: 'absolute',
  inset: '0',
  zIndex: '100',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  background: '#090909',
  color: '#eeeeeb',
  fontFamily: "'DM Mono', 'Manrope', sans-serif",
  fontSize: '12px',
  letterSpacing: '0.12em',
  pointerEvents: 'none'
});

Object.assign(typingCursor.style, {
  display: 'inline-block',
  width: '1px',
  height: '14px',
  background: '#eeeeeb',
  opacity: '1'
});

measuringOverlay.appendChild(measuringText);
measuringOverlay.appendChild(typingCursor);

// 캔버스 위에 문구를 표시
root.appendChild(measuringOverlay);

// 글자가 한 글자씩 나타났다 다시 반복
window.setInterval(() => {
  if (selectionLocked) {
    measuringOverlay.style.display = 'none';
    return;
  }

  if (typingIndex < message.length) {
    typingIndex++;
  } else {
    holdCount++;

    if (holdCount >= 8) {
      typingIndex = 0;
      holdCount = 0;
    }
  }

  measuringText.textContent =
    message.slice(0, typingIndex).join('');
}, 180);

// 커서 깜빡임
window.setInterval(() => {
  if (selectionLocked) return;

  cursorVisible = !cursorVisible;
  typingCursor.style.opacity = cursorVisible ? '1' : '0';
}, 500);


// 평균 심박수로 비주얼 선택
function modeForBpm(bpm) {
  if (bpm <= 60) return 1;
  if (bpm <= 72) return 2;
  if (bpm <= 84) return 3;
  return 4;
}

// 현재 심박수를 움직임 제어용 0~1 값으로 변환
function normalizeBpm(bpm) {
  return Math.max(
    0,
    Math.min(1, (bpm - 50) / 60)
  );
}

// 화면의 상태 표시 업데이트
function updateOverlay() {
    measuringOverlay.style.display =
  selectionLocked ? 'none' : 'flex';
  
  if (lightValueEl) {
    lightValueEl.textContent = String(currentBpm);
  }

  if (visualNameEl) {
    visualNameEl.textContent = selectionLocked
      ? names[activeMode]
      : 'MEASURING HEART RATE';
  }

  if (statusTextEl) {
    statusTextEl.textContent = selectionLocked
      ? 'HR LOCKED'
      : `CALIBRATING ${initialBpmSamples.length}/${INITIAL_SAMPLE_COUNT}`;
  }
}

// 선택된 비주얼 하나만 표시
function setMode(mode) {
  activeMode = mode;

  const visualId = mode;

  Object.keys(hosts).forEach((key) => {
    hosts[key].style.display =
      Number(key) === visualId ? 'block' : 'none';
  });

  Object.keys(instances).forEach((key) => {
    const instance = instances[key];

    if (!instance) return;

    if (Number(key) === visualId) {
      instance.loop();
    } else {
      instance.noLoop();
    }
  });

  updateOverlay();
}

// script.js 또는 실제 센서에서 호출할 함수
function updateHeartRate(value) {
  const bpm = Number(value);

  if (!Number.isFinite(bpm) || bpm <= 0) return;

  currentBpm = Math.round(bpm);

  // 최초 선택 전: 5개 측정값을 모아 평균 계산
  if (!selectionLocked) {
    initialBpmSamples.push(currentBpm);

    if (initialBpmSamples.length >= INITIAL_SAMPLE_COUNT) {
      const averageBpm =
        initialBpmSamples.reduce((sum, value) => sum + value, 0) /
        initialBpmSamples.length;

      const roundedAverage = Math.round(averageBpm);

      selectionLocked = true;
      setMode(modeForBpm(roundedAverage));

      console.log(
        `초기 평균 심박수: ${roundedAverage} BPM`,
        `선택된 비주얼: ${activeMode}번`
      );
    } else {
      updateOverlay();
    }

    return;
  }

  // 선택 후에는 비주얼을 바꾸지 않고 움직임에만 반영
  updateOverlay();
}

window.updateHeartRate = updateHeartRate;

  function sizeToHost(p, host) {
    const w = Math.max(
      1,
      Math.floor(host.clientWidth || root.clientWidth || 900)
    );

    const h = Math.max(
      1,
      Math.floor(host.clientHeight || root.clientHeight || 500)
    );

    if (p.width !== w || p.height !== h) {
      p.resizeCanvas(w, h);
    }
  }

  // 공통 셰이더 정점 코드
  const vert = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;

void main() {
  gl_Position = vec4(aTexCoord * 2.0 - 1.0, 0.0, 1.0);
}
`;

const fragNaturalSmoke = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 ROT = mat2(0.80, -0.60, 0.60, 0.80);

float fbm5(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = ROT * p * 2.02 + 17.3;
    a *= 0.5;
  }
  return v;
}

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = ROT * p * 2.02 + 9.1;
    a *= 0.5;
  }
  return v;
}

vec2 smokeLayer(vec2 p, float t, float scale, float seed, float warp) {
  vec2 e1 = 0.35 * vec2(
    cos(t * 0.11 + seed),
    sin(t * 0.09 + seed * 1.3)
  );

  vec2 e2 = 0.35 * vec2(
    sin(t * 0.10 + seed * 0.7),
    cos(t * 0.12 + seed)
  );

  vec2 q = vec2(
    fbm4(p * scale + seed + e1),
    fbm4(p * scale + vec2(5.2, 1.3) + seed + e2)
  );

  vec2 r = vec2(
    fbm5(p * scale * 1.15 + warp * q + vec2(1.7, 9.2) + e2 * 1.2),
    fbm5(p * scale * 1.15 + warp * q + vec2(8.3, 2.8) + e1 * 1.2)
  );

  float f = fbm5(p * scale * 1.3 + warp * r);
  float n = fbm5(p * scale * 2.3 + warp * 1.25 * r + seed * 3.0);
  float ridge = max(1.0 - abs(2.0 * n - 1.0), 0.0);
  float sheet = smoothstep(0.62, 1.0, ridge) * 0.55 + pow(ridge, 9.0) * 0.9;

  return vec2(f, sheet);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  float ang = 0.52;
  vec2 d = vec2(cos(ang), sin(ang));
  vec2 nrm = vec2(-d.y, d.x);

  vec2 o = vec2(-0.85, -0.38)
    + (uMouse - 0.5) * vec2(0.35, -0.30);

  vec2 rel = p - o;
  float s = dot(rel, d);
  float w = dot(rel, nrm);

  float far = smoothstep(0.0, 1.7, s);

  float amp = 0.03 + 0.17 * far;
  float off = amp * (
    sin(s * 2.6 - t * 0.30)
    + 0.6 * sin(s * 5.3 + t * 0.22 + 1.7)
  );

  float width = mix(0.07, 0.46, far);
  float xw = (w - off) / width;
  float mask = exp(-xw * xw) * smoothstep(0.0, 0.22, s);

  vec2 flow = p - d * t * 0.05 + vec2(0.0, -t * 0.012);
  float warp = mix(1.6, 4.0, far);

  vec2 A = smokeLayer(flow, t, 1.7, 0.0, warp);
  vec2 B = smokeLayer(flow * 0.7 + vec2(3.1, -2.4), t * 0.8, 1.0, 7.3, warp * 0.8);

  float bodyW = mix(0.18, 0.55, far);

  float dA = (
    A.x * A.x * 1.6 * bodyW
    + A.y * (0.30 + 0.9 * A.x)
  ) * mask * (0.45 + 1.0 * A.x);

  float maskB = exp(-xw * xw * 0.35) * smoothstep(0.0, 0.4, s);

  float dB = (
    B.x * B.x * 1.2 * 0.5
    + B.y * 0.35
  ) * maskB * (0.35 + 0.9 * B.x);

  dA = clamp(dA, 0.0, 1.5);
  dB = clamp(dB, 0.0, 1.5);

  float dens = 1.0
    - (1.0 - 1.0 * (1.0 - exp(-dA * 1.7)))
    * (1.0 - 0.55 * (1.0 - exp(-dB * 1.4)));

  vec3 shadow = vec3(0.10, 0.11, 0.14);
  vec3 light = vec3(0.96, 0.975, 1.0);

  float tone = pow(dens, 0.95);

  vec3 col = mix(
    vec3(0.012, 0.012, 0.018),
    mix(shadow, light, smoothstep(0.1, 1.0, tone)),
    smoothstep(0.0, 0.25, tone)
  );

  float vig = smoothstep(1.35, 0.2, length(uv - 0.5) * 1.5);
  col *= mix(0.6, 1.0, vig);

  col += (hash(gl_FragCoord.xy + fract(t) * 91.7) - 0.5) * 0.018;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

  // =====================================================
  // 1번 / 2번: 흰 연기 셰이더
  // =====================================================

  const fragWhiteSmoke = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(
    mix(a, b, f.x),
    mix(c, d, f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;

  mat2 rot = mat2(
    0.8, -0.6,
    0.6, 0.8
  );

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.03 + 11.7;
    a *= 0.5;
  }

  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  vec2 q0 = p;
  q0.y -= t * 0.04;

  vec2 q = vec2(
    fbm(q0 * 1.6 + vec2(0.0, t * 0.05)),
    fbm(q0 * 1.6 + vec2(5.2, 1.3) - vec2(t * 0.04, 0.0))
  );

  vec2 r = vec2(
    fbm(q0 * 2.0 + 3.2 * q + vec2(1.7, 9.2) + t * 0.07),
    fbm(q0 * 2.0 + 3.2 * q + vec2(8.3, 2.8) - t * 0.05)
  );

  float f = fbm(q0 * 2.0 + 3.6 * r);
  float body = smoothstep(0.35, 0.95, f);

  float ridge =
    1.0 - abs(
      2.0 * fbm(q0 * 3.2 + 4.2 * r + t * 0.03) - 1.0
    );

  float wisps = pow(ridge, 6.0);

  vec2 c =
    vec2(0.0, 0.0) +
    (uMouse - 0.5) * vec2(0.5, -0.4);

  c += 0.12 * vec2(
    sin(t * 0.17),
    cos(t * 0.13)
  );

  vec2 pp = p - c;
  float ang = -0.55;

  pp = mat2(
    cos(ang), -sin(ang),
    sin(ang), cos(ang)
  ) * pp;

  pp *= vec2(0.6, 1.5);

  float mask = exp(-dot(pp, pp) * 1.1);
  mask *= 0.55 + 0.9 * f;

  float density =
    (body * 0.55 + wisps * 0.95 * (0.3 + body)) * mask;

  density = clamp(density, 0.0, 1.0);

  vec3 col = mix(
    vec3(0.03, 0.03, 0.045),
    vec3(0.93, 0.95, 1.0),
    density
  );

  col *= 0.75 + 0.25 * smoothstep(0.0, 0.6, density);

  float vig = smoothstep(
    1.25,
    0.25,
    length(uv - 0.5) * 1.5
  );

  col *= mix(0.55, 1.0, vig);
  col += (hash(gl_FragCoord.xy + t) - 0.5) * 0.02;
  col = pow(col, vec3(1.05));

  gl_FragColor = vec4(col, 1.0);
}
`;

  function createWhiteSmoke() {
    const host = hosts[1];

    instances[1] = new p5((p) => {
      let smokeShader;

      p.setup = () => {
        p.createCanvas(
          Math.max(1, host.clientWidth || 900),
          Math.max(1, host.clientHeight || 500),
          p.WEBGL
        );

        p.pixelDensity(1);
        p.noStroke();

        smokeShader = p.createShader(vert, fragWhiteSmoke);

        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.display = 'block';

        if (activeMode !== 1 && activeMode !== 2) {
          p.noLoop();
        }
      };

      p.draw = () => {
        p.shader(smokeShader);

        smokeShader.setUniform('uRes', [p.width, p.height]);
        smokeShader.setUniform('uTime', p.millis() / 1000);

        const motion = normalizeBpm(currentBpm);

smokeShader.setUniform('uMouse', [
  motion,
  1 - motion
]);

        p.rect(
          -p.width / 2,
          -p.height / 2,
          p.width,
          p.height
        );
      };

      p.windowResized = () => sizeToHost(p, host);
    }, host);
  }

  function createNaturalSmoke() {
  const host = hosts[2];

  instances[2] = new p5((p) => {
    let smokeShader;
    let mx = 0.5;
    let my = 0.5;

    p.setup = () => {
      p.createCanvas(
        Math.max(1, host.clientWidth || 900),
        Math.max(1, host.clientHeight || 500),
        p.WEBGL
      );

      p.pixelDensity(1);
      p.noStroke();

      smokeShader = p.createShader(vert, fragNaturalSmoke);

      p.canvas.style.width = '100%';
      p.canvas.style.height = '100%';
      p.canvas.style.display = 'block';

      if (activeMode !== 2) {
        p.noLoop();
      }
    };

    p.draw = () => {
      // 현재 심박수에 따라 연기 근원 위치를 부드럽게 이동
      const motion = normalizeBpm(currentBpm);
      const targetX = motion;
      const targetY = 1 - motion;

      mx += (targetX - mx) * 0.03;
      my += (targetY - my) * 0.03;

      p.shader(smokeShader);

      smokeShader.setUniform('uRes', [
        p.width,
        p.height
      ]);

      smokeShader.setUniform(
        'uTime',
        p.millis() / 1000
      );

      smokeShader.setUniform('uMouse', [mx, my]);

      p.rect(
        -p.width / 2,
        -p.height / 2,
        p.width,
        p.height
      );
    };

    p.windowResized = () => sizeToHost(p, host);
  }, host);
}

  // =====================================================
  // 3번: 점으로 이루어진 물결 리본
  // =====================================================

  function createRibbon() {
    const host = hosts[3];

    instances[3] = new p5((p) => {
      const NU = 240;
      const NV = 56;
      const NB = 7;

      let mx = 0.5;
      let my = 0.5;

      p.setup = () => {
        p.createCanvas(
          Math.max(1, host.clientWidth || 900),
          Math.max(1, host.clientHeight || 500)
        );

        p.pixelDensity(
          Math.min(2, window.devicePixelRatio || 1)
        );

        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.display = 'block';

        if (activeMode !== 3) {
          p.noLoop();
        }
      };

      p.draw = () => {
        p.background(0);

        const ctx = p.drawingContext;
        const t = p.millis() / 1000;

        const W = p.width;
        const H = p.height;

        const targetX = normalizeBpm(currentBpm);
        const targetY = 0.35 + targetX * 0.3;

        mx += (targetX - mx) * 0.04;
        my += (targetY - my) * 0.04;

        const L = W * 1.6;
        const Wd = H * 0.55;
        const focal = 1100;

        const tilt = 0.18 + (my - 0.5) * 0.5;
        const cT = Math.cos(tilt);
        const sT = Math.sin(tilt);

        const dotScale = H / 620;
        const phase = (mx - 0.5) * 2.0;

        const bx = [];
        const by = [];
        const br = [];

        for (let b = 0; b < NB; b++) {
          bx.push([]);
          by.push([]);
          br.push([]);
        }

        const edge0 = [];
        const edge1 = [];

        for (let i = 0; i < NU; i++) {
          const u = i / (NU - 1);
          const cx = (u - 0.5) * L;

          const cy =
            H * 0.2 * Math.sin(
              u * p.TWO_PI * 0.85 + t * 0.35
            ) +
            H * 0.05 * Math.sin(
              u * p.TWO_PI * 2.1 - t * 0.5
            );

          const phi =
            3.15 * Math.sin(
              u * p.TWO_PI * 0.7 + t * 0.28 + 0.8 + phase
            ) +
            0.35 * Math.sin(
              u * p.TWO_PI * 1.6 - t * 0.2
            );

          const cp = Math.cos(phi);
          const sp = Math.sin(phi);

          for (let j = 0; j < NV; j++) {
            const v = j / (NV - 1);
            const off = (v - 0.5) * Wd;

            const ripple =
              H * 0.018 *
              Math.sin(v * 5.0 + u * 9.0 + t * 0.7);

            const y = cy + off * cp + ripple;
            const z = off * sp + 50 * Math.sin(u * 7.0 + t * 0.6);

            const y2 = y * cT - z * sT;
            const z2 = y * sT + z * cT;

            const sc = focal / (focal - z2);
            const sx = W / 2 + cx * sc;
            const sy = H / 2 + y2 * sc;

            if (j === 0) {
              edge0.push([sx, sy]);
            }

            if (j === NV - 1) {
              edge1.push([sx, sy]);
            }

            if (
              sx < -10 ||
              sx > W + 10 ||
              sy < -10 ||
              sy > H + 10
            ) {
              continue;
            }

            const facing = cp;

            let a =
              0.18 +
              0.82 * p.constrain(
                (facing + 0.5) / 1.5,
                0,
                1
              );

            a *= p.constrain(
              p.map(z2, -Wd, Wd, 0.55, 1.0),
              0.4,
              1.0
            );

            const edgeBoost = Math.exp(-v * 14.0);

            a += 0.5 * edgeBoost;
            a = p.constrain(a, 0.05, 1.0);

            let r =
              (0.8 + 0.9 * p.constrain(
                facing * 0.5 + 0.5,
                0,
                1
              )) *
              sc *
              dotScale;

            r *= 1.0 + 0.8 * edgeBoost;

            const b = Math.min(
              NB - 1,
              Math.floor(a * NB)
            );

            bx[b].push(sx);
            by[b].push(sy);
            br[b].push(r);
          }
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 밝기 단계별 점 그리기
        for (let b = 0; b < NB; b++) {
          const xs = bx[b];
          const ys = by[b];
          const rs = br[b];

          if (!xs.length) continue;

          ctx.fillStyle =
            'rgba(255,255,255,' +
            (((b + 1) / NB) * 0.95).toFixed(3) +
            ')';

          ctx.beginPath();

          for (let k = 0; k < xs.length; k++) {
            ctx.moveTo(xs[k] + rs[k], ys[k]);

            ctx.arc(
              xs[k],
              ys[k],
              rs[k],
              0,
              p.TWO_PI
            );
          }

          ctx.fill();
        }

        strokeEdge(ctx, edge0, 1.0);
        strokeEdge(ctx, edge1, 0.35);

        ctx.restore();
      };

      function strokeEdge(ctx, pts, strength) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const passes = [
          { w: 10, a: 0.05, blur: 30 },
          { w: 4, a: 0.18, blur: 14 },
          { w: 1.6, a: 0.85, blur: 6 }
        ];

        for (const pass of passes) {
          ctx.shadowColor = 'rgba(255,255,255,0.9)';
          ctx.shadowBlur = pass.blur;

          ctx.strokeStyle =
            'rgba(255,255,255,' +
            (pass.a * strength).toFixed(3) +
            ')';

          ctx.lineWidth = pass.w;
          ctx.beginPath();

          for (let k = 0; k < pts.length; k++) {
            if (k === 0) {
              ctx.moveTo(pts[k][0], pts[k][1]);
            } else {
              ctx.lineTo(pts[k][0], pts[k][1]);
            }
          }

          ctx.stroke();
        }

        ctx.shadowBlur = 0;
      }

      p.windowResized = () => sizeToHost(p, host);
    }, host);
  }

  // =====================================================
  // 4번: 파란 네온 연기 셰이더
  // =====================================================

  const fragBlueSmoke = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(
    mix(a, b, f.x),
    mix(c, d, f.x),
    f.y
  );
}

const mat2 ROT = mat2(
  0.80, -0.60,
  0.60, 0.80
);

float fbm5(vec2 p) {
  float v = 0.0;
  float a = 0.5;

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = ROT * p * 2.02 + 17.3;
    a *= 0.5;
  }

  return v;
}

float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;

  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = ROT * p * 2.02 + 9.1;
    a *= 0.5;
  }

  return v;
}

vec2 swirl(
  vec2 p,
  vec2 c,
  float strength,
  float radius2
) {
  vec2 d = p - c;
  float a = strength * exp(-dot(d, d) / radius2);

  float s = sin(a);
  float co = cos(a);

  return c + mat2(co, -s, s, co) * d;
}

float band(float f, float c, float w) {
  float x = (f - c) / w;
  return exp(-x * x);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;

  vec2 p =
    (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float t = uTime;

  vec2 blob =
    vec2(0.0, 0.0) +
    0.06 * vec2(
      sin(t * 0.09),
      cos(t * 0.07)
    );

  blob += (uMouse - 0.5) * vec2(0.20, -0.16);

  vec2 mp = (uMouse - 0.5) * vec2(asp, -1.0);

  vec2 q0 = p;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);

    vec2 c = blob + vec2(
      sin(t * 0.13 + fi * 2.1) * 0.26,
      cos(t * 0.11 + fi * 1.7) * 0.18
    );

    float dir = (i == 1) ? -1.0 : 1.0;

    q0 = swirl(
      q0,
      c,
      2.4 * dir,
      0.10
    );
  }

  q0 = swirl(q0, mp, 1.6, 0.04);

  q0 += vec2(
    -t * 0.0001,
    t * 0.0001
  );

  vec2 e1 =
    0.4 * vec2(
      cos(t * 0.12),
      sin(t * 0.10)
    );

  vec2 e2 =
    0.4 * vec2(
      sin(t * 0.11 + 1.0),
      cos(t * 0.13)
    );

  vec2 q = vec2(
    fbm4(q0 * 1.3 + e1),
    fbm4(q0 * 1.3 + vec2(5.2, 1.3) + e2)
  );

  vec2 r = vec2(
    fbm5(q0 * 1.5 + 3.2 * q + vec2(1.7, 9.2) + e2),
    fbm5(q0 * 1.5 + 3.2 * q + vec2(8.3, 2.8) + e1)
  );

  float f = fbm5(q0 * 1.6 + 3.4 * r);
  float g = fbm4(q0 * 2.6 + 2.4 * r + 7.0);

  float lines = 0.0;

  lines += band(f, 0.47, 0.010) * 1.00;
  lines += band(f, 0.40, 0.008) * 0.40;
  lines += band(f, 0.55, 0.008) * 0.40;
  lines += band(g, 0.50, 0.010) * 0.28;

  float glow = band(f, 0.47, 0.07) * 0.10;

  vec2 pp = p - blob;
  pp *= vec2(0.9, 1.7);

  float m = exp(-dot(pp, pp) * 1.0);
  float n = fbm4(q0 * 1.2 + r * 1.2);

  float maskAll = smoothstep(
    0.22,
    0.65,
    m * 1.5 + (n - 0.5) * 0.7
  );

  maskAll *= smoothstep(0.0, 0.10, m);

  vec2 tp = p - blob + vec2(0.50, -0.03);

  float tail =
    exp(-(tp.x * tp.x * 3.0 + tp.y * tp.y * 30.0)) *
    smoothstep(0.45, 0.70, n);

  maskAll = max(maskAll, tail * 0.8);

  float I = (lines + glow) * maskAll;

  vec3 deep = vec3(0.00, 0.12, 0.85);
  vec3 cyan = vec3(0.10, 0.75, 1.00);
  vec3 hot = vec3(0.85, 1.00, 1.00);

  vec3 c = mix(
    deep,
    cyan,
    smoothstep(0.0, 0.65, I)
  );

  c = mix(
    c,
    hot,
    smoothstep(0.75, 1.5, I)
  );

  vec3 col = c * I;

  col +=
    vec3(0.0, 0.015, 0.09) *
    smoothstep(0.35, 0.65, f) *
    maskAll;

  col = 1.0 - exp(-col * 1.7);

  float vig = smoothstep(
    1.4,
    0.25,
    length(uv - 0.5) * 1.5
  );

  col *= mix(0.7, 1.0, vig);

  col +=
    (hash(gl_FragCoord.xy + fract(t) * 91.7) - 0.5) *
    0.012;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

  function createBlueSmoke() {
    const host = hosts[4];

    instances[4] = new p5((p) => {
      let smokeShader;

      let mx = 0.6;
      let my = 0.5;

      p.setup = () => {
        p.createCanvas(
          Math.max(1, host.clientWidth || 900),
          Math.max(1, host.clientHeight || 500),
          p.WEBGL
        );

        p.pixelDensity(1);
        p.noStroke();

        smokeShader = p.createShader(
          vert,
          fragBlueSmoke
        );

        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.display = 'block';

        if (activeMode !== 4) {
          p.noLoop();
        }
      };

      p.draw = () => {
        const targetX = normalizeBpm(currentBpm);
        const targetY = 1 - targetX;

        mx += (targetX - mx) * 0.05;
        my += (targetY - my) * 0.05;

        p.shader(smokeShader);

        smokeShader.setUniform(
          'uRes',
          [p.width, p.height]
        );

        smokeShader.setUniform(
          'uTime',
          p.millis() / 1000
        );

        smokeShader.setUniform(
          'uMouse',
          [mx, my]
        );

        p.rect(
          -p.width / 2,
          -p.height / 2,
          p.width,
          p.height
        );
      };

      p.windowResized = () => sizeToHost(p, host);
    }, host);
  }

  // 각 효과 인스턴스 생성
  createWhiteSmoke();
  createNaturalSmoke();
  createRibbon();
  createBlueSmoke();  

  // 초기에는 비주얼을 숨기고 심박수 입력을 기다린다.
updateOverlay();

  // 개발자 도구 테스트:
  // setLightLevel(10);
  // setLightLevel(40);
  // setLightLevel(60);
  // setLightLevel(90);

  updateOverlay();
})();