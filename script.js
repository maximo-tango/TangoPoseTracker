const video = document.getElementById('video');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const uploadInput = document.getElementById('videoUpload');
const playPauseBtn = document.getElementById('playPauseBtn');
const rewindBtn = document.getElementById('rewindBtn');
const forwardBtn = document.getElementById('forwardBtn');
const annotateBtn = document.getElementById('annotateBtn');
const trackBtn = document.getElementById('trackBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const timeLabel = document.getElementById('timeLabel');
const scrubSlider = document.getElementById('scrubSlider');
const speedSelect = document.getElementById('speedSelect');

const PERSON_COLORS = ['#38bdf8', '#f97316'];
const POINT_SEQUENCE = [
  'head',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle'
];

const SKELETON_LINKS = [
  ['head', 'leftShoulder'],
  ['head', 'rightShoulder'],
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftHip', 'rightHip'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle']
];

const state = {
  videoReady: false,
  trackerReady: false,
  trackingEnabled: false,
  landmarkResults: [],
  manualPoints: [{}, {}],
  annotationActive: false,
  annotationPerson: 0,
  annotationIndex: 0,
  trackingStarted: false
};

let poseLandmarker = null;

function logStatus(message) {
  statusEl.textContent = message;
}

function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00';
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updatePlaybackUI() {
  playPauseBtn.textContent = video.paused ? '재생' : '일시정지';
}

function updateTimeDisplay() {
  if (!state.videoReady) {
    return;
  }

  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;

  if (duration > 0) {
    scrubSlider.value = String((currentTime / duration) * 1000);
  }
}

function resizeCanvasToVideo() {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawVideoFrame() {
  if (!state.videoReady) {
    return;
  }

  clearCanvas();
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}

function drawPoint(point, color, radius = 5) {
  if (!point) {
    return;
  }

  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawPersonSkeleton(personPoints, color) {
  if (!personPoints || Object.keys(personPoints).length === 0) {
    return;
  }

  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.beginPath();

  for (const [fromKey, toKey] of SKELETON_LINKS) {
    const fromPoint = personPoints[fromKey];
    const toPoint = personPoints[toKey];
    if (!fromPoint || !toPoint) {
      continue;
    }

    ctx.moveTo(fromPoint.x, fromPoint.y);
    ctx.lineTo(toPoint.x, toPoint.y);
  }

  ctx.stroke();

  for (const key of Object.keys(personPoints)) {
    drawPoint(personPoints[key], color, 5);
  }
}

function mapPoseLandmarksToPointMap(landmarks) {
  const pointMap = {};

  const head = landmarks[0] || { x: 0, y: 0 };
  const leftShoulder = landmarks[11] || { x: 0, y: 0 };
  const rightShoulder = landmarks[12] || { x: 0, y: 0 };
  const leftElbow = landmarks[13] || { x: 0, y: 0 };
  const rightElbow = landmarks[14] || { x: 0, y: 0 };
  const leftWrist = landmarks[15] || { x: 0, y: 0 };
  const rightWrist = landmarks[16] || { x: 0, y: 0 };
  const leftHip = landmarks[23] || { x: 0, y: 0 };
  const rightHip = landmarks[24] || { x: 0, y: 0 };
  const leftKnee = landmarks[25] || { x: 0, y: 0 };
  const rightKnee = landmarks[26] || { x: 0, y: 0 };
  const leftAnkle = landmarks[27] || { x: 0, y: 0 };
  const rightAnkle = landmarks[28] || { x: 0, y: 0 };

  pointMap.head = { x: head.x * canvas.width, y: head.y * canvas.height };
  pointMap.leftShoulder = { x: leftShoulder.x * canvas.width, y: leftShoulder.y * canvas.height };
  pointMap.rightShoulder = { x: rightShoulder.x * canvas.width, y: rightShoulder.y * canvas.height };
  pointMap.leftElbow = { x: leftElbow.x * canvas.width, y: leftElbow.y * canvas.height };
  pointMap.rightElbow = { x: rightElbow.x * canvas.width, y: rightElbow.y * canvas.height };
  pointMap.leftWrist = { x: leftWrist.x * canvas.width, y: leftWrist.y * canvas.height };
  pointMap.rightWrist = { x: rightWrist.x * canvas.width, y: rightWrist.y * canvas.height };
  pointMap.leftHip = { x: leftHip.x * canvas.width, y: leftHip.y * canvas.height };
  pointMap.rightHip = { x: rightHip.x * canvas.width, y: rightHip.y * canvas.height };
  pointMap.leftKnee = { x: leftKnee.x * canvas.width, y: leftKnee.y * canvas.height };
  pointMap.rightKnee = { x: rightKnee.x * canvas.width, y: rightKnee.y * canvas.height };
  pointMap.leftAnkle = { x: leftAnkle.x * canvas.width, y: leftAnkle.y * canvas.height };
  pointMap.rightAnkle = { x: rightAnkle.x * canvas.width, y: rightAnkle.y * canvas.height };

  return pointMap;
}

function drawDetectedPoses() {
  if (!state.landmarkResults.length) {
    return;
  }

  state.landmarkResults.forEach((landmarks, index) => {
    if (!landmarks || landmarks.length < 29) {
      return;
    }

    const mapped = mapPoseLandmarksToPointMap(landmarks);
    drawPersonSkeleton(mapped, PERSON_COLORS[index % PERSON_COLORS.length]);
  });
}

function drawManualPoints() {
  state.manualPoints.forEach((personPoints, index) => {
    if (!personPoints || Object.keys(personPoints).length === 0) {
      return;
    }

    drawPersonSkeleton(personPoints, PERSON_COLORS[index]);
  });
}

function render() {
  drawVideoFrame();

  if (state.trackingEnabled && state.landmarkResults.length > 0) {
    drawDetectedPoses();
  } else {
    drawManualPoints();
  }
}

async function initPoseLandmarker() {
  if (poseLandmarker) {
    state.trackerReady = true;
    return;
  }

  logStatus('포즈 추적 모델을 불러오는 중입니다...');

  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs');
  const { FilesetResolver, PoseLandmarker } = vision;

  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
    },
    runningMode: 'VIDEO',
    numPoses: 2,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35
  });

  state.trackerReady = true;
  logStatus('포즈 추적 모델 준비 완료. 이제 동작 추적을 시작할 수 있습니다.');
}

async function runTrackingFrame() {
  if (!state.trackerReady || !poseLandmarker || !state.videoReady || video.readyState < 2) {
    return;
  }

  const timestamp = performance.now();
  const result = poseLandmarker.detectForVideo(video, timestamp);
  state.landmarkResults = result.landmarks || [];
  render();
}

function beginManualAnnotation() {
  if (!state.videoReady) {
    logStatus('먼저 영상을 업로드해 주세요.');
    return;
  }

  state.annotationActive = true;
  state.annotationPerson = 0;
  state.annotationIndex = 0;
  state.manualPoints = [{}, {}];
  state.trackingEnabled = false;
  state.landmarkResults = [];
  video.pause();

  updateAnnotationPrompt();
  render();
}

function updateAnnotationPrompt() {
  const currentKey = POINT_SEQUENCE[state.annotationIndex];
  const personLabel = state.annotationPerson + 1;
  logStatus(`사람 ${personLabel}: ${currentKey} 지점을 클릭해 주세요. (정지 프레임에서 지정)`);
}

function finishManualAnnotation() {
  state.annotationActive = false;
  state.trackingEnabled = false;
  logStatus('수동 포인트 지정이 완료되었습니다. 이후 프레임은 자동 추적을 시도할 수 있습니다.');
  render();
}

function setPlaybackRate(rate) {
  if (!state.videoReady) {
    return;
  }

  video.playbackRate = rate;
  logStatus(`재생 속도 ${rate.toFixed(2)}x로 설정되었습니다.`);
}

function seekBySeconds(deltaSeconds) {
  if (!state.videoReady || !Number.isFinite(video.duration)) {
    return;
  }

  const next = Math.min(Math.max(video.currentTime + deltaSeconds, 0), video.duration);
  video.currentTime = next;
  updateTimeDisplay();
}

function togglePlayback() {
  if (!state.videoReady) {
    logStatus('먼저 영상을 업로드해 주세요.');
    return;
  }

  if (video.paused) {
    video.play().then(() => {
      updatePlaybackUI();
    }).catch(() => {
      logStatus('재생이 막혀 있습니다. 재생 버튼을 다시 눌러 주세요.');
    });
  } else {
    video.pause();
    updatePlaybackUI();
  }
}

canvas.addEventListener('pointerdown', (event) => {
  if (!state.annotationActive) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const key = POINT_SEQUENCE[state.annotationIndex];

  state.manualPoints[state.annotationPerson][key] = { x, y };
  state.annotationIndex += 1;

  if (state.annotationIndex >= POINT_SEQUENCE.length) {
    state.annotationPerson += 1;
    state.annotationIndex = 0;

    if (state.annotationPerson >= 2) {
      finishManualAnnotation();
      return;
    }
  }

  updateAnnotationPrompt();
  render();
});

uploadInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.load();
  video.muted = false;
  video.autoplay = false;
  video.pause();
  video.currentTime = 0;
  state.videoReady = true;
  state.trackingEnabled = false;
  state.landmarkResults = [];
  state.manualPoints = [{}, {}];
  updatePlaybackUI();
  updateTimeDisplay();
  logStatus('영상이 업로드되었습니다. 재생/정지와 프레임 이동으로 정지 프레임을 선택한 뒤 점을 찍어 주세요.');
});

video.addEventListener('loadedmetadata', () => {
  resizeCanvasToVideo();
  updateTimeDisplay();
  render();
});

video.addEventListener('timeupdate', updateTimeDisplay);
video.addEventListener('play', updatePlaybackUI);
video.addEventListener('pause', updatePlaybackUI);
video.addEventListener('ended', updatePlaybackUI);

playPauseBtn.addEventListener('click', togglePlayback);
rewindBtn.addEventListener('click', () => seekBySeconds(-5));
forwardBtn.addEventListener('click', () => seekBySeconds(5));
annotateBtn.addEventListener('click', beginManualAnnotation);

speedSelect.addEventListener('change', (event) => {
  const rate = Number(event.target.value);
  setPlaybackRate(rate);
});

scrubSlider.addEventListener('input', (event) => {
  if (!state.videoReady) {
    return;
  }

  const ratio = Number(event.target.value) / 1000;
  const next = (video.duration || 0) * ratio;
  video.currentTime = next;
  updateTimeDisplay();
});

trackBtn.addEventListener('click', async () => {
  if (!state.videoReady) {
    logStatus('먼저 영상을 업로드해 주세요.');
    return;
  }

  await initPoseLandmarker();
  state.trackingEnabled = true;
  state.trackingStarted = true;
  logStatus('동작 추적을 시작합니다. 두 사람의 스켈레톤이 자동으로 따라갑니다.');
});

resetBtn.addEventListener('click', () => {
  video.pause();
  video.currentTime = 0;
  state.trackingEnabled = false;
  state.annotationActive = false;
  state.landmarkResults = [];
  state.manualPoints = [{}, {}];
  state.annotationPerson = 0;
  state.annotationIndex = 0;
  updatePlaybackUI();
  updateTimeDisplay();
  logStatus('기본 상태로 초기화되었습니다. 영상을 다시 업로드하거나 점찍기를 다시 시작해 주세요.');
  render();
});

function tick() {
  if (state.trackingEnabled) {
    runTrackingFrame();
  } else {
    render();
  }

  requestAnimationFrame(tick);
}

updatePlaybackUI();
requestAnimationFrame(tick);
