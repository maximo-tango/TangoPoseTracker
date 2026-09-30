// 공용 로직: 스무딩, 댄서 ID 고정, 분석 데이터 저장/보간, 그리기
export const KEYS = ['head','leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist','rightWrist','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'];
const LM = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const LINKS = [['head','leftShoulder'],['head','rightShoulder'],['leftShoulder','rightShoulder'],['leftShoulder','leftElbow'],['leftElbow','leftWrist'],['rightShoulder','rightElbow'],['rightElbow','rightWrist'],['leftHip','rightHip'],['leftShoulder','leftHip'],['rightShoulder','rightHip'],['leftHip','leftKnee'],['leftKnee','leftAnkle'],['rightHip','rightKnee'],['rightKnee','rightAnkle']]
  .map(([a, b]) => [KEYS.indexOf(a), KEYS.indexOf(b)]);
export const MIN_VIS = 0.4;
export const COLORS = ['#38bdf8', '#f97316'];

// 사람 1명 = 13개 [x, y, visibility] (0~1 정규화 좌표)
export const extract = (lm) => LM.map((i) => (lm[i] ? [lm[i].x, lm[i].y, lm[i].visibility ?? 1] : [0, 0, 0]));

class OneEuro {
  constructor(minCutoff = 1.5, beta = 6, dCut = 1) { Object.assign(this, { minCutoff, beta, dCut, t: null, x: 0, dx: 0 }); }
  filter(x, t) {
    if (this.t == null || t <= this.t || t - this.t > 0.5) { this.t = t; this.x = x; this.dx = 0; return x; }
    const dt = t - this.t;
    const alpha = (c) => { const r = 2 * Math.PI * c * dt; return r / (r + 1); };
    this.dx += alpha(this.dCut) * ((x - this.x) / dt - this.dx);
    this.x += alpha(this.minCutoff + this.beta * Math.abs(this.dx)) * (x - this.x);
    this.t = t;
    return this.x;
  }
}

export class PersonTracker {
  constructor() { this.reset(); }
  // seed: 수동 지정한 두 사람(13점 배열 또는 null). 없으면 첫 감지 시 화면 왼쪽→오른쪽 순으로 배정
  reset(seed = null) {
    this.slots = seed ? [seed[0] || null, seed[1] || null] : [null, null];
    this.filters = [0, 1].map(() => Array.from({ length: 26 }, () => new OneEuro()));
  }
  static cost(a, b) {
    let s = 0, n = 0;
    for (let i = 0; i < 13; i++) {
      if (a[i][2] < MIN_VIS || b[i][2] < MIN_VIS) continue;
      s += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]); n++;
    }
    return n ? s / n : 0.5;
  }
  update(dets, t) {
    let d = dets.slice(0, 2);
    if (!this.slots[0] && !this.slots[1]) {
      const mx = (p) => p.reduce((s, q) => s + q[0], 0) / 13;
      d.sort((a, b) => mx(a) - mx(b));
    }
    const options = d.length >= 2 ? [[0, 1], [1, 0]] : d.length === 1 ? [[0, -1], [-1, 0]] : [[-1, -1]];
    let best = options[0], bestCost = Infinity;
    for (const opt of options) {
      const c = opt.reduce((sum, di, si) => sum + (di < 0 ? 0.2 : this.slots[si] ? PersonTracker.cost(d[di], this.slots[si]) : 0.3), 0);
      if (c < bestCost) { bestCost = c; best = opt; }
    }
    return best.map((di, si) => {
      if (di < 0) return null;
      const raw = d[di];
      this.slots[si] = raw;
      return raw.map((q, j) => [this.filters[si][j * 2].filter(q[0], t), this.filters[si][j * 2 + 1].filter(q[1], t), q[2]]);
    });
  }
}

// ---- 분석 데이터 ----
export const packFrame = (t, people) => [
  Math.round(t * 1000) / 1000,
  people.map((p) => (p ? p.flatMap((q) => [+q[0].toFixed(4), +q[1].toFixed(4), +q[2].toFixed(2)]) : null))
];
const unpack = (f) => Array.from({ length: 13 }, (_, i) => [f[i * 3], f[i * 3 + 1], f[i * 3 + 2]]);

// frames: [[t, [flat|null, flat|null]], ...] (시간순). 프레임 사이는 선형 보간, 0.3초 이상 비면 보간 안 함
export function sample(frames, t) {
  const n = frames.length;
  if (!n || t < frames[0][0] - 0.2 || t > frames[n - 1][0] + 0.2) return [null, null];
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frames[m][0] <= t) lo = m; else hi = m - 1; }
  const a = frames[lo], b = frames[Math.min(lo + 1, n - 1)];
  const gap = b[0] - a[0];
  const k = gap > 0 && gap <= 0.3 ? Math.min(1, Math.max(0, (t - a[0]) / gap)) : 0;
  return [0, 1].map((i) => {
    const pa = a[1][i], pb = b[1][i];
    if (!pa) return null;
    const A = unpack(pa);
    return pb && k > 0 ? A.map((q, j) => [q[0] + (pb[j * 3] - q[0]) * k, q[1] + (pb[j * 3 + 1] - q[1]) * k, Math.min(q[2], pb[j * 3 + 2])]) : A;
  });
}

export function drawPerson(ctx, p, color, w, h, scale = 1) {
  if (!p) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4 * scale; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [i, j] of LINKS) {
    if (p[i][2] < MIN_VIS || p[j][2] < MIN_VIS) continue;
    ctx.moveTo(p[i][0] * w, p[i][1] * h); ctx.lineTo(p[j][0] * w, p[j][1] * h);
  }
  ctx.stroke();
  for (const q of p) {
    if (q[2] < MIN_VIS) continue;
    ctx.beginPath(); ctx.arc(q[0] * w, q[1] * h, 5 * scale, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- 탱고 분석 (2D 영상 기준 근사값) ----
const wrap180 = (d) => ((d + 540) % 360) - 180;
export function metrics(people, w, h) {
  const P = (p, i) => (p[i][2] >= MIN_VIS ? [p[i][0] * w, p[i][1] * h] : null);
  const mid = (a, b) => (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null);
  const ang = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const per = people.map((p) => {
    if (!p) return null;
    const ls = P(p, 1), rs = P(p, 2), lh = P(p, 7), rh = P(p, 8);
    const sm = mid(ls, rs), hm = mid(lh, rh);
    if (!sm || !hm) return null;
    const v = [sm[0] - hm[0], sm[1] - hm[1]];
    return { hm, torso: Math.hypot(v[0], v[1]), tilt: (Math.atan2(v[0], -v[1]) * 180) / Math.PI, sep: wrap180(ang(ls, rs) - ang(lh, rh)) };
  });
  const [a, b] = per;
  return {
    tilt: per.map((x) => x && x.tilt),
    sep: per.map((x) => x && x.sep),
    dist: a && b ? Math.hypot(a.hm[0] - b.hm[0], a.hm[1] - b.hm[1]) / ((a.torso + b.torso) / 2) : null
  };
}
export function metricsHTML(m) {
  const f = (v, u) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}${u}`);
  const row = (name, arr) => `<span>${name}</span><b>${f(arr[0], '°')}</b><b>${f(arr[1], '°')}</b>`;
  return `<span></span><i style="color:${COLORS[0]}">댄서1</i><i style="color:${COLORS[1]}">댄서2</i>`
    + row('몸통 기울기', m.tilt) + row('가슴-골반 각도차', m.sep)
    + `<span>두 사람 거리</span><b style="grid-column:span 2">${m.dist == null ? '—' : m.dist.toFixed(2) + ' 몸통길이'}</b>`;
}

// 발목(11,12) 궤적: trails[i] = [{t, pts:[[x,y],[x,y]]}, ...]
export function pushTrail(trails, people, t, span = 2) {
  people.forEach((p, i) => {
    const tr = trails[i];
    if (tr.length && t < tr[tr.length - 1].t) tr.length = 0;
    if (!p || p[11][2] < MIN_VIS || p[12][2] < MIN_VIS) return;
    tr.push({ t, pts: [[p[11][0], p[11][1]], [p[12][0], p[12][1]]] });
    while (tr.length && tr[0].t < t - span) tr.shift();
  });
}
export function trailsFromData(frames, t, span = 2, step = 0.05) {
  const trails = [[], []];
  for (let s = span; s >= 0; s -= step) pushTrail(trails, sample(frames, t - s), t - s, span + 1);
  return trails;
}
export function drawTrails(ctx, trails, w, h, scale = 1) {
  trails.forEach((tr, i) => {
    for (let f = 0; f < 2; f++) {
      for (let k = 1; k < tr.length; k++) {
        const a = tr[k - 1].pts[f], b = tr[k].pts[f];
        ctx.globalAlpha = (k / tr.length) * 0.8; ctx.strokeStyle = COLORS[i]; ctx.lineWidth = 3 * scale;
        ctx.beginPath(); ctx.moveTo(a[0] * w, a[1] * h); ctx.lineTo(b[0] * w, b[1] * h); ctx.stroke();
      }
    }
  });
  ctx.globalAlpha = 1;
}
