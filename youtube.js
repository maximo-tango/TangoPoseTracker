import { sample, drawPerson, COLORS, metrics, metricsHTML, trailsFromData, drawTrails } from './core.js';

const $ = (id) => document.getElementById(id);
const wrap = $('ytWrap'), canvas = $('ytOverlay'), ctx = canvas.getContext('2d');
const say = (m) => { $('status').textContent = m; };
let player = null, data = null;
let lastMetrics = 0;
let lastPt = -1, base = { t: 0, at: 0 };

function parseId(input) {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/);
    if (m) return m[2];
  } catch { /* 잘못된 URL */ }
  return null;
}

function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  });
}

async function openVideo(id) {
  await loadApi();
  if (player) { player.loadVideoById(id); return; }
  player = new YT.Player('ytPlayer', {
    videoId: id,
    playerVars: { playsinline: 1, rel: 0, fs: 0 },
    events: {
      onReady: () => {
        const rates = player.getAvailablePlaybackRates();
        $('rateSelect').innerHTML = rates.map((r) => `<option value="${r}"${r === 1 ? ' selected' : ''}>${r}×</option>`).join('');
      }
    }
  });
}

function setData(json) {
  if (!json?.frames?.length) { say('분석 JSON 형식이 올바르지 않습니다.'); return; }
  data = json;
  const { width, height } = json.meta || {};
  if (width && height) wrap.style.aspectRatio = `${width} / ${height}`;
  resize();
  say(`분석 데이터 ${json.frames.length}프레임 로드 완료. 재생하면 오버레이가 따라갑니다. 어긋나면 싱크(ms)를 조절하세요.`);
}

function resize() {
  const r = wrap.getBoundingClientRect();
  canvas.width = Math.round(r.width * devicePixelRatio);
  canvas.height = Math.round(r.height * devicePixelRatio);
}

// YouTube getCurrentTime은 갱신이 거칠 수 있어, 값이 그대로면 경과 시간으로 보정
function now() {
  const pt = player.getCurrentTime();
  const at = performance.now();
  if (player.getPlayerState() !== 1 || pt !== lastPt) { base = { t: pt, at }; lastPt = pt; return pt; }
  return base.t + Math.min(0.25, ((at - base.at) / 1000) * player.getPlaybackRate());
}

function frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (player?.getCurrentTime && data) {
    const t = now() + Number($('offsetInput').value) / 1000;
    const people = sample(data.frames, t);
    if ($('trailToggle').checked) drawTrails(ctx, trailsFromData(data.frames, t), canvas.width, canvas.height, devicePixelRatio);
    const at = performance.now();
    if (at - lastMetrics > 100) {
      lastMetrics = at;
      $('metricsBox').innerHTML = metricsHTML(metrics(people, data.meta?.width || 1, data.meta?.height || 1));
    }
    people.forEach((p, i) => { if ($(`showP${i}`).checked) drawPerson(ctx, p, COLORS[i], canvas.width, canvas.height, devicePixelRatio); });
  }
  requestAnimationFrame(frame);
}

$('loadBtn').addEventListener('click', async () => {
  const id = parseId($('urlInput').value);
  if (!id) { say('유튜브 링크를 인식하지 못했습니다.'); return; }
  await openVideo(id);
  say(data ? '영상을 불러왔습니다.' : '영상을 불러왔습니다. 이제 분석 JSON을 열어 주세요.');
});
$('jsonInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (f) try { setData(JSON.parse(await f.text())); } catch { say('JSON을 읽지 못했습니다.'); }
});
const step = (n) => { player.pauseVideo(); player.seekTo(player.getCurrentTime() + n / (data?.meta?.fps || 30), true); };
$('prevBtn').addEventListener('click', () => player && step(-1));
$('nextBtn').addEventListener('click', () => player && step(1));
$('rateSelect').addEventListener('change', (e) => player?.setPlaybackRate(Number(e.target.value)));
$('fsBtn').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.()));
addEventListener('resize', resize);
document.addEventListener('fullscreenchange', () => setTimeout(resize, 100));

// 링크로 바로 열기: youtube.html?v=영상ID&data=data/파일.json
const q = new URLSearchParams(location.search);
resize();
requestAnimationFrame(frame);
if (q.get('data')) fetch(q.get('data')).then((r) => r.json()).then(setData).catch(() => say('data 파라미터의 JSON을 불러오지 못했습니다.'));
if (q.get('v')) { $('urlInput').value = q.get('v'); openVideo(q.get('v')); }
