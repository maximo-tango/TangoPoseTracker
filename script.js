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
const videoWrap = document.getElementById('videoWrap');
const workflowLabel = document.getElementById('workflowLabel');
const annotationProgress = document.getElementById('annotationProgress');
const annotationProgressBar = document.getElementById('annotationProgressBar');
const currentPersonLabel = document.getElementById('currentPersonLabel');
const currentPointIndex = document.getElementById('currentPointIndex');
const currentPointName = document.getElementById('currentPointName');
const currentPointHint = document.getElementById('currentPointHint');
const pointChecklist = document.getElementById('pointChecklist');
const undoPointBtn = document.getElementById('undoPointBtn');
const frameTime = document.getElementById('frameTime');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const fitViewBtn = document.getElementById('fitViewBtn');
const zoomLabel = document.getElementById('zoomLabel');
const captureBtn = document.getElementById('captureBtn');
const exportSpeedSelect = document.getElementById('exportSpeedSelect');
const exportVideoBtn = document.getElementById('exportVideoBtn');
const exportStatus = document.getElementById('exportStatus');

const POINT_LABELS = {
  head: ['머리', '머리 중심'],
  leftShoulder: ['왼쪽 어깨', '화면 기준 왼쪽 어깨 관절'],
  rightShoulder: ['오른쪽 어깨', '화면 기준 오른쪽 어깨 관절'],
  leftElbow: ['왼쪽 팔꿈치', '화면 기준 왼쪽 팔꿈치 관절'],
  rightElbow: ['오른쪽 팔꿈치', '화면 기준 오른쪽 팔꿈치 관절'],
  leftWrist: ['왼쪽 손목', '화면 기준 왼쪽 손목 관절'],
  rightWrist: ['오른쪽 손목', '화면 기준 오른쪽 손목 관절'],
  leftHip: ['왼쪽 골반', '화면 기준 왼쪽 골반 관절'],
  rightHip: ['오른쪽 골반', '화면 기준 오른쪽 골반 관절'],
  leftKnee: ['왼쪽 무릎', '화면 기준 왼쪽 무릎 관절'],
  rightKnee: ['오른쪽 무릎', '화면 기준 오른쪽 무릎 관절'],
  leftAnkle: ['왼쪽 발목', '화면 기준 왼쪽 발목 관절'],
  rightAnkle: ['오른쪽 발목', '화면 기준 오른쪽 발목 관절']
};

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
  trackerLoading: false,
  trackingEnabled: false,
  landmarkResults: [],
  manualPoints: [{}, {}],
  annotationActive: false,
  annotationPerson: 0,
  annotationIndex: 0,
  trackingStarted: false,
  pointHistory: [],
  videoUrl: null,
  lastVideoTime: -1,
  lastDetectionCount: -1,
  viewZoom: 1,
  viewPanX: 0,
  viewPanY: 0,
  videoExporting: false
};

let poseLandmarker = null;
const activePointers = new Map();
let pointerGesture = null;

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
  const isPaused = video.paused;
  playPauseBtn.textContent = isPaused ? '▶' : 'Ⅱ';
  playPauseBtn.setAttribute('aria-label', isPaused ? '재생' : '일시정지');
  captureBtn.disabled = !state.videoReady || !isPaused || video.readyState < 2 || state.videoExporting;
}

function updateTimeDisplay() {
  if (!state.videoReady) {
    return;
  }

  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  frameTime.textContent = formatTime(currentTime);

  if (state.videoExporting && !video.paused && duration > 0) {
    const progress = Math.min(100, Math.floor((currentTime / duration) * 100));
    exportStatus.textContent = `변환 중 ${progress}%`;
  }

  if (duration > 0) {
    scrubSlider.value = String((currentTime / duration) * 1000);
  }
}

function updateZoomControls() {
  videoWrap.classList.toggle('is-zoomed', state.viewZoom > 1.001);
  zoomInBtn.disabled = !state.videoReady || state.videoExporting || state.viewZoom >= 4;
  zoomOutBtn.disabled = !state.videoReady || state.videoExporting || state.viewZoom <= 1;
  fitViewBtn.disabled = !state.videoReady || state.videoExporting || (state.viewZoom === 1 && state.viewPanX === 0 && state.viewPanY === 0);
  zoomLabel.textContent = `${Math.round(state.viewZoom * 100)}%`;
}

function updateAnnotationGuide() {
  const counts = state.manualPoints.map((points) => Object.keys(points).length);
  const total = counts[0] + counts[1];
  annotationProgress.innerHTML = `${total} <i>/ 26</i>`;
  annotationProgressBar.style.width = `${(total / (POINT_SEQUENCE.length * 2)) * 100}%`;
  document.getElementById('personOneCount').textContent = `${counts[0]} / 13`;
  document.getElementById('personTwoCount').textContent = `${counts[1]} / 13`;
  document.getElementById('personOneBar').style.width = `${(counts[0] / POINT_SEQUENCE.length) * 100}%`;
  document.getElementById('personTwoBar').style.width = `${(counts[1] / POINT_SEQUENCE.length) * 100}%`;
  undoPointBtn.disabled = state.pointHistory.length === 0;

  const active = state.annotationActive;
  const currentKey = POINT_SEQUENCE[state.annotationIndex];
  const finished = total === POINT_SEQUENCE.length * 2;
  const hasVideo = state.videoReady;
  const busy = state.videoExporting;
  workflowLabel.textContent = !hasVideo ? '대기 중' : state.trackingEnabled ? '추적 중' : active ? '포인트 지정' : finished ? '지정 완료' : '영상 확인';
  videoWrap.classList.toggle('is-empty', !hasVideo);
  uploadInput.disabled = busy;
  playPauseBtn.disabled = !hasVideo || busy;
  rewindBtn.disabled = !hasVideo || busy;
  forwardBtn.disabled = !hasVideo || busy;
  annotateBtn.disabled = !hasVideo || busy;
  trackBtn.disabled = !hasVideo || state.trackerLoading || busy;
  resetBtn.disabled = busy;
  scrubSlider.disabled = !hasVideo || busy;
  speedSelect.disabled = !hasVideo || busy;
  exportSpeedSelect.disabled = !hasVideo || busy;
  exportVideoBtn.disabled = !hasVideo || busy || !window.MediaRecorder || !canvas.captureStream;
  exportVideoBtn.textContent = busy ? '영상 변환 중…' : '포즈 포함 영상 저장';
  captureBtn.disabled = !hasVideo || !video.paused || video.readyState < 2 || busy;
  trackBtn.textContent = state.trackerLoading ? '모델 불러오는 중…' : '추적 시작';
  videoWrap.classList.toggle('is-annotating', active);
  updateZoomControls();

  if (!hasVideo) {
    currentPersonLabel.textContent = '다음 포인트';
    currentPointIndex.textContent = '—';
    currentPointName.textContent = '영상 업로드 대기';
    currentPointHint.textContent = '영상을 불러온 뒤 점 지정을 시작하세요.';
  } else if (active) {
    currentPersonLabel.textContent = `댄서 ${state.annotationPerson + 1} 지정 중`;
    currentPointIndex.textContent = `${counts[state.annotationPerson] + 1} / 13`;
    currentPointName.textContent = POINT_LABELS[currentKey][0];
    currentPointHint.textContent = POINT_LABELS[currentKey][1];
  } else if (finished) {
    currentPersonLabel.textContent = '두 사람 지정 완료';
    currentPointIndex.textContent = '26 / 26';
    currentPointName.textContent = '추적할 준비가 됐어요';
    currentPointHint.textContent = '추적 시작을 누르면 영상 위에서 포즈를 따라갑니다.';
  } else {
    currentPersonLabel.textContent = '다음 포인트';
    currentPointIndex.textContent = total ? `${total} / 26` : '0 / 26';
    currentPointName.textContent = total ? '지정이 진행 중입니다' : '정지 프레임 선택';
    currentPointHint.textContent = total ? '점 지정을 다시 시작하면 현재 지정은 초기화됩니다.' : '영상 위치를 맞춘 뒤 점 지정 시작을 누르세요.';
  }

  pointChecklist.replaceChildren();
  POINT_SEQUENCE.forEach((key, index) => {
    const item = document.createElement('li');
    const isDone = Boolean(state.manualPoints[state.annotationPerson]?.[key]);
    const isCurrent = active && index === state.annotationIndex;
    item.className = `point-item${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`;
    item.innerHTML = `<span class="point-check">${isDone ? '✓' : String(index + 1).padStart(2, '0')}</span><span>${POINT_LABELS[key][0]}</span>`;
    pointChecklist.append(item);
  });
}

function resizeCanvasToVideo() {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const availableWidth = videoWrap.parentElement.clientWidth;
  const availableHeight = window.innerHeight * 0.7;
  const scale = Math.min(availableWidth / width, availableHeight / height);

  videoWrap.style.width = `${width * scale}px`;
  videoWrap.style.height = `${height * scale}px`;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

function clearCanvas() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawVideoFrame() {
  if (!state.videoReady || video.readyState < 2 || !canvas.width || !canvas.height) {
    return;
  }

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

  ctx.lineWidth = 4 / state.viewZoom;
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
    drawPoint(personPoints[key], color, 5 / state.viewZoom);
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
  clearCanvas();
  ctx.fillStyle = '#101311';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(state.viewZoom, 0, 0, state.viewZoom, state.viewPanX, state.viewPanY);
  drawVideoFrame();

  if (state.trackingEnabled) {
    drawDetectedPoses();
  } else {
    drawManualPoints();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function canvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height
  };
}

function clampViewPan() {
  const minPanX = canvas.width * (1 - state.viewZoom);
  const minPanY = canvas.height * (1 - state.viewZoom);
  state.viewPanX = Math.min(0, Math.max(minPanX, state.viewPanX));
  state.viewPanY = Math.min(0, Math.max(minPanY, state.viewPanY));
}

function setViewZoom(nextZoom, anchorX = canvas.width / 2, anchorY = canvas.height / 2) {
  if (state.videoExporting) {
    return;
  }

  const previousZoom = state.viewZoom;
  const next = Math.min(4, Math.max(1, nextZoom));
  const imageX = (anchorX - state.viewPanX) / previousZoom;
  const imageY = (anchorY - state.viewPanY) / previousZoom;
  state.viewZoom = next;
  state.viewPanX = anchorX - imageX * next;
  state.viewPanY = anchorY - imageY * next;
  clampViewPan();
  updateZoomControls();
  render();
}

function resetView() {
  if (state.videoExporting) {
    return;
  }

  state.viewZoom = 1;
  state.viewPanX = 0;
  state.viewPanY = 0;
  updateZoomControls();
  render();
}

function startPointerGesture(allowTap = true) {
  const pointers = [...activePointers.entries()];
  if (pointers.length === 1) {
    const [pointerId, point] = pointers[0];
    const gestureType = state.annotationActive && allowTap
      ? 'tap'
      : point.pointerType === 'touch'
        ? state.viewZoom <= 1.001 ? 'seek-pending' : 'idle'
        : 'pan';
    pointerGesture = {
      type: gestureType,
      pointerId,
      pointerType: point.pointerType,
      startX: point.x,
      startY: point.y,
      startTime: video.currentTime,
      panX: state.viewPanX,
      panY: state.viewPanY
    };
  } else if (pointers.length >= 2) {
    const first = pointers[0][1];
    const second = pointers[1][1];
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    pointerGesture = {
      type: 'pinch',
      mode: null,
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      startCenterX: centerX,
      startCenterY: centerY,
      startZoom: state.viewZoom,
      startPanX: state.viewPanX,
      startPanY: state.viewPanY,
      imageX: (centerX - state.viewPanX) / state.viewZoom,
      imageY: (centerY - state.viewPanY) / state.viewZoom
    };
  } else {
    pointerGesture = null;
  }
}

function recordAnnotationPoint(point) {
  const x = (point.x - state.viewPanX) / state.viewZoom;
  const y = (point.y - state.viewPanY) / state.viewZoom;
  const key = POINT_SEQUENCE[state.annotationIndex];

  state.pointHistory.push({ person: state.annotationPerson, index: state.annotationIndex, key });
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
  updateAnnotationGuide();
  render();
}

function handleCanvasPointerDown(event) {
  if (!state.videoReady) {
    return;
  }

  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, {
    ...canvasPointFromClient(event.clientX, event.clientY),
    pointerType: event.pointerType
  });
  startPointerGesture();
}

function handleCanvasPointerMove(event) {
  if (!activePointers.has(event.pointerId)) {
    return;
  }

  const point = canvasPointFromClient(event.clientX, event.clientY);
  activePointers.set(event.pointerId, point);

  if ((pointerGesture?.type === 'tap' || pointerGesture?.type === 'seek-pending')
    && pointerGesture.pointerId === event.pointerId) {
    const threshold = Math.max(8, canvas.width / canvas.getBoundingClientRect().width * 8);
    if (Math.hypot(point.x - pointerGesture.startX, point.y - pointerGesture.startY) > threshold) {
      const deltaX = point.x - pointerGesture.startX;
      const deltaY = point.y - pointerGesture.startY;
      const horizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
      if (horizontalSwipe && pointerGesture.pointerType === 'touch' && state.viewZoom <= 1.001) {
        if (!video.paused) {
          video.pause();
        }
        pointerGesture.type = 'seek';
        pointerGesture.startTime = video.currentTime;
      } else if (pointerGesture.pointerType === 'touch') {
        pointerGesture.type = 'idle';
      } else {
        pointerGesture.type = 'pan';
      }
    }
  }

  if (pointerGesture?.type === 'pinch' && activePointers.size >= 2) {
    const [first, second] = [...activePointers.values()];
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const threshold = Math.max(8, canvas.width / canvas.getBoundingClientRect().width * 8);
    const centerMoved = Math.hypot(centerX - pointerGesture.startCenterX, centerY - pointerGesture.startCenterY);

    if (!pointerGesture.mode) {
      if (Math.abs(distance - pointerGesture.startDistance) > threshold) {
        pointerGesture.mode = 'zoom';
      } else if (centerMoved > threshold) {
        pointerGesture.mode = 'pan';
      }
    }

    if (pointerGesture.mode === 'zoom') {
      state.viewZoom = Math.min(4, Math.max(1, pointerGesture.startZoom * distance / pointerGesture.startDistance));
      state.viewPanX = centerX - pointerGesture.imageX * state.viewZoom;
      state.viewPanY = centerY - pointerGesture.imageY * state.viewZoom;
    } else if (pointerGesture.mode === 'pan') {
      state.viewZoom = pointerGesture.startZoom;
      state.viewPanX = pointerGesture.startPanX + centerX - pointerGesture.startCenterX;
      state.viewPanY = pointerGesture.startPanY + centerY - pointerGesture.startCenterY;
    }

    clampViewPan();
    if (pointerGesture.mode) {
      updateZoomControls();
      render();
    }
  } else if (pointerGesture?.type === 'pan' && state.viewZoom > 1) {
    state.viewPanX = pointerGesture.panX + point.x - pointerGesture.startX;
    state.viewPanY = pointerGesture.panY + point.y - pointerGesture.startY;
    clampViewPan();
    render();
  } else if (pointerGesture?.type === 'seek' && Number.isFinite(video.duration)) {
    const rect = canvas.getBoundingClientRect();
    const deltaCssPixels = (point.x - pointerGesture.startX) * rect.width / canvas.width;
    video.currentTime = Math.min(video.duration, Math.max(0, pointerGesture.startTime + deltaCssPixels * 0.025));
    updateTimeDisplay();
    render();
  }

  videoWrap.classList.toggle('is-panning', pointerGesture?.type === 'pan');
}

function handleCanvasPointerEnd(event) {
  const isTap = pointerGesture?.type === 'tap'
    && pointerGesture.pointerId === event.pointerId
    && activePointers.size === 1;
  const endedPinch = pointerGesture?.type === 'pinch' || activePointers.size > 1;
  if (isTap && state.annotationActive) {
    recordAnnotationPoint(activePointers.get(event.pointerId));
  }

  activePointers.delete(event.pointerId);
  startPointerGesture(!endedPinch);
  videoWrap.classList.toggle('is-panning', false);
}

async function initPoseLandmarker() {
  if (poseLandmarker) {
    state.trackerReady = true;
    return;
  }

  logStatus('포즈 추적 모델을 불러오는 중입니다...');

  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const { FilesetResolver, PoseLandmarker } = vision;

  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
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
  logStatus('포즈 추적 모델 준비 완료. 영상 포즈를 분석합니다.');
}

async function runTrackingFrame() {
  if (!state.trackerReady || !poseLandmarker || !state.videoReady || video.readyState < 2) {
    return;
  }

  if (video.currentTime === state.lastVideoTime) {
    return;
  }

  state.lastVideoTime = video.currentTime;
  const timestamp = performance.now();
  const result = poseLandmarker.detectForVideo(video, timestamp);
  state.landmarkResults = result.landmarks || [];
  if (state.landmarkResults.length !== state.lastDetectionCount) {
    state.lastDetectionCount = state.landmarkResults.length;
    logStatus(state.lastDetectionCount
      ? `${state.lastDetectionCount}명의 포즈를 감지해 추적 중입니다.`
      : '모델은 작동 중이지만 인물을 찾지 못했습니다. 밝고 전신이 보이는 프레임인지 확인해 주세요.');
  }
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
  state.pointHistory = [];
  state.trackingEnabled = false;
  state.landmarkResults = [];
  video.pause();

  updateAnnotationPrompt();
  updateAnnotationGuide();
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
  state.annotationPerson = 1;
  state.annotationIndex = POINT_SEQUENCE.length;
  logStatus('수동 포인트 지정이 완료되었습니다. 이후 프레임은 자동 추적을 시도할 수 있습니다.');
  updateAnnotationGuide();
  render();
}

function undoLastPoint() {
  const previousPoint = state.pointHistory.pop();
  if (!previousPoint) {
    return;
  }

  state.annotationActive = true;
  state.trackingEnabled = false;
  state.annotationPerson = previousPoint.person;
  state.annotationIndex = previousPoint.index;
  delete state.manualPoints[previousPoint.person][previousPoint.key];
  video.pause();
  updatePlaybackUI();
  updateAnnotationPrompt();
  updateAnnotationGuide();
  render();
}

function setPlaybackRate(rate) {
  if (!state.videoReady || state.videoExporting) {
    return;
  }

  video.playbackRate = rate;
  logStatus(`재생 속도 ${rate.toFixed(2)}x로 설정되었습니다.`);
}

function seekBySeconds(deltaSeconds) {
  if (!state.videoReady || state.videoExporting || !Number.isFinite(video.duration)) {
    return;
  }

  const next = Math.min(Math.max(video.currentTime + deltaSeconds, 0), video.duration);
  video.currentTime = next;
  updateTimeDisplay();
}

function togglePlayback() {
  if (state.videoExporting) {
    return;
  }

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

function downloadCurrentFrame() {
  if (!state.videoReady || !video.paused || video.readyState < 2) {
    return;
  }

  render();
  canvas.toBlob((blob) => {
    if (!blob) {
      logStatus('이미지를 만들지 못했습니다. 다른 프레임에서 다시 시도해 주세요.');
      return;
    }

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `tango-frame-${formatTime(video.currentTime).replace(':', '-')}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    logStatus('현재 정지 프레임을 PNG 이미지로 저장했습니다.');
  }, 'image/png');
}

function waitForSeek(time) {
  if (Math.abs(video.currentTime - time) < 0.01) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('영상 위치를 이동하지 못했습니다.'));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

function chooseRecordingFormat() {
  const formats = [
    { mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' }
  ];
  const format = formats.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));

  if (!format) {
    throw new Error('이 브라우저에서 지원하는 영상 형식을 찾지 못했습니다.');
  }

  return format;
}

async function exportProcessedVideo() {
  if (!state.videoReady || state.videoExporting || video.readyState < 2) {
    return;
  }

  if (!window.MediaRecorder || !canvas.captureStream) {
    logStatus('이 브라우저는 영상 녹화를 지원하지 않습니다. 최신 브라우저에서 다시 시도해 주세요.');
    return;
  }

  const original = {
    time: video.currentTime,
    playbackRate: video.playbackRate,
    wasPaused: video.paused
  };
  const outputRate = Number(exportSpeedSelect.value);
  let canvasStream;
  let sourceStream;
  let recordingStream;
  let recorder;
  let handleEnded;
  let finalExportStatus = '';

  state.videoExporting = true;
  exportStatus.textContent = '준비 중';
  updateAnnotationGuide();

  try {
    const format = chooseRecordingFormat();
    video.pause();
    video.playbackRate = outputRate;
    const initialSeek = waitForSeek(0);
    const playbackStarted = video.play();
    await Promise.all([initialSeek, playbackStarted]);
    render();

    canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    sourceStream = video.captureStream?.() || video.mozCaptureStream?.();
    const audioTracks = sourceStream?.getAudioTracks() || [];
    tracks.push(...audioTracks);
    recordingStream = new MediaStream(tracks);
    recorder = new MediaRecorder(recordingStream, { mimeType: format.mimeType });
    const chunks = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    const recordingStopped = new Promise((resolve, reject) => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.addEventListener('error', (event) => {
        reject(event.error || new Error('영상 녹화 중 오류가 발생했습니다.'));
      }, { once: true });
    });
    handleEnded = () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
    video.addEventListener('ended', handleEnded, { once: true });
    recorder.start(1000);
    exportStatus.textContent = `변환 중 0% · ${outputRate}×`;
    await recordingStopped;

    const blob = new Blob(chunks, { type: recorder.mimeType || format.mimeType });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `tango-annotated-${outputRate}x.${format.extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
    logStatus(`포인트가 포함된 ${outputRate}× 영상을 ${format.extension.toUpperCase()} 파일로 저장했습니다.`);
    finalExportStatus = '저장 완료';
  } catch (error) {
    if (recorder && recorder.state !== 'inactive') {
      const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.stop();
      await stopped;
    }
    logStatus(`영상 내보내기에 실패했습니다: ${error.message || '다시 시도해 주세요.'}`);
    finalExportStatus = '내보내기 실패';
  } finally {
    if (handleEnded) {
      video.removeEventListener('ended', handleEnded);
    }
    canvasStream?.getTracks().forEach((track) => track.stop());
    sourceStream?.getTracks().forEach((track) => track.stop());
    recordingStream?.getTracks().forEach((track) => track.stop());
    video.pause();
    video.playbackRate = original.playbackRate;
    try {
      await waitForSeek(original.time);
      render();
      if (!original.wasPaused) {
        await video.play();
      }
    } catch {
      video.pause();
    }
    state.videoExporting = false;
    updatePlaybackUI();
    updateAnnotationGuide();
    if (finalExportStatus) {
      exportStatus.textContent = finalExportStatus;
    }
  }
}

canvas.addEventListener('pointerdown', handleCanvasPointerDown);
canvas.addEventListener('pointermove', handleCanvasPointerMove);
canvas.addEventListener('pointerup', handleCanvasPointerEnd);
canvas.addEventListener('pointercancel', handleCanvasPointerEnd);
canvas.addEventListener('wheel', (event) => {
  if (!state.videoReady) {
    return;
  }

  event.preventDefault();
  const point = canvasPointFromClient(event.clientX, event.clientY);
  setViewZoom(state.viewZoom * (event.deltaY < 0 ? 1.1 : 0.9), point.x, point.y);
}, { passive: false });

zoomInBtn.addEventListener('click', () => setViewZoom(state.viewZoom * 1.25));
zoomOutBtn.addEventListener('click', () => setViewZoom(state.viewZoom / 1.25));
fitViewBtn.addEventListener('click', resetView);
captureBtn.addEventListener('click', downloadCurrentFrame);
exportVideoBtn.addEventListener('click', exportProcessedVideo);

function loadVideoFile(file) {
  if (!file || state.videoExporting) {
    return;
  }

  if (state.videoUrl) {
    URL.revokeObjectURL(state.videoUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  state.videoUrl = objectUrl;
  video.src = objectUrl;
  video.load();
  video.muted = false;
  video.autoplay = false;
  video.pause();
  video.currentTime = 0;
  state.videoReady = true;
  state.trackingEnabled = false;
  state.annotationActive = false;
  state.landmarkResults = [];
  state.manualPoints = [{}, {}];
  state.pointHistory = [];
  resetView();
  updatePlaybackUI();
  updateTimeDisplay();
  updateAnnotationGuide();
  logStatus('영상이 업로드되었습니다. 재생/정지와 프레임 이동으로 정지 프레임을 선택한 뒤 점을 찍어 주세요.');
}

uploadInput.addEventListener('change', (event) => {
  loadVideoFile(event.target.files?.[0]);
});

videoWrap.addEventListener('dragover', (event) => {
  event.preventDefault();
  videoWrap.classList.add('is-dragover');
});

videoWrap.addEventListener('dragleave', () => videoWrap.classList.remove('is-dragover'));

videoWrap.addEventListener('drop', (event) => {
  event.preventDefault();
  videoWrap.classList.remove('is-dragover');
  loadVideoFile(event.dataTransfer.files?.[0]);
});

video.addEventListener('loadedmetadata', () => {
  resizeCanvasToVideo();
  updateTimeDisplay();
  updateAnnotationGuide();
  render();
});

video.addEventListener('loadeddata', () => {
  updatePlaybackUI();
  render();
});

window.addEventListener('resize', () => {
  if (state.videoReady) {
    resizeCanvasToVideo();
    render();
  }
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

  state.trackerLoading = true;
  updateAnnotationGuide();
  logStatus('포즈 추적 모델을 불러오는 중입니다. 첫 실행은 네트워크 상태에 따라 시간이 걸릴 수 있습니다.');
  const playbackStarted = video.play().then(() => true).catch(() => false);

  try {
    await initPoseLandmarker();
    const didStartPlayback = await playbackStarted;
    state.trackingEnabled = true;
    state.annotationActive = false;
    state.trackingStarted = true;
    state.lastVideoTime = -1;
    state.lastDetectionCount = -1;
    updateAnnotationGuide();
    logStatus(didStartPlayback
      ? '모델 준비 완료. 영상 포즈를 실시간으로 추적합니다.'
      : '모델은 준비됐지만 영상 재생이 시작되지 않았습니다. 재생 버튼을 눌러 주세요.');
  } catch (error) {
    await playbackStarted;
    video.pause();
    state.trackingEnabled = false;
    state.trackerReady = false;
    logStatus(`모델을 불러오지 못했습니다: ${error.message || '네트워크 연결을 확인해 주세요.'}`);
  } finally {
    state.trackerLoading = false;
    updateAnnotationGuide();
  }
});

resetBtn.addEventListener('click', () => {
  video.pause();
  video.currentTime = 0;
  state.trackingEnabled = false;
  state.annotationActive = false;
  state.landmarkResults = [];
  state.manualPoints = [{}, {}];
  state.pointHistory = [];
  state.viewZoom = 1;
  state.viewPanX = 0;
  state.viewPanY = 0;
  state.annotationPerson = 0;
  state.annotationIndex = 0;
  updatePlaybackUI();
  updateTimeDisplay();
  logStatus('기본 상태로 초기화되었습니다. 영상을 다시 업로드하거나 점찍기를 다시 시작해 주세요.');
  updateAnnotationGuide();
  render();
});

undoPointBtn.addEventListener('click', undoLastPoint);

document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, select, textarea, button, [contenteditable="true"]')) {
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    togglePlayback();
  } else if (event.code === 'ArrowLeft') {
    seekBySeconds(event.shiftKey ? -5 : -1);
  } else if (event.code === 'ArrowRight') {
    seekBySeconds(event.shiftKey ? 5 : 1);
  }
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
updateAnnotationGuide();
requestAnimationFrame(tick);
