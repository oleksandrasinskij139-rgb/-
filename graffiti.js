const $ = id => document.getElementById(id);

const fileInput = $('file');
const preview = $('preview');
const uploadBtn = $('upload-btn');
const selectedName = $('selected-name');
const dropzone = $('dropzone');
const croppedPreview = $('cropped-preview');
const reselectBtn = $('reselect-btn');
const cropOverlay = $('crop-overlay');
const cropViewport = $('crop-viewport');
const cropImg = $('crop-img');
const cropScale = $('crop-scale');
const scaleValue = $('scale-value');

let selectedFile = null; // итоговый обрезанный файл
let mine = [];
let limit = 12;

// --- Crop state ---
let cropSource = null; // Image object
let cropOffsetX = 0;
let cropOffsetY = 0;
let cropScaleVal = 1;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let startOffsetX = 0;
let startOffsetY = 0;
const VIEW = 280; // viewport size in px
const OUTPUT = 256; // final size

const token = () => sessionStorage.getItem('lux_session_token');
const api = () => (window.LUX_API_BASE || '').replace(/\/$/, '');

function notice(id, msg, error = true) {
  const el = $(id);
  el.textContent = msg;
  el.className = 'notice show ' + (error ? 'error' : 'success');
}

function hideNotice(id) {
  $(id).className = 'notice';
}

function configured() {
  return api() && !api().includes('YOUR-API-DOMAIN');
}

function authHeaders() {
  return { 'Authorization': 'Bearer ' + (token() || '') };
}

function requireLogin() {
  if (!token()) {
    $('empty-state').textContent = 'Сначала войди по токену.';
    return false;
  }
  return true;
}

function validate(file) {
  if (!file) return 'Выбери изображение.';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return 'Поддерживаются только PNG, JPEG и WebP.';
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'Размер файла превышает 2 МБ.';
  }
  return null;
}

/* ========== CROP ========== */
function openCropper(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    cropSource = img;
    cropScaleVal = 1;
    cropScale.value = 100;
    scaleValue.textContent = '100%';

    // Начальный масштаб: чтобы картинка покрывала весь квадрат
    const minScale = Math.max(VIEW / img.width, VIEW / img.height);
    cropScaleVal = minScale;
    cropScale.value = Math.round(minScale * 100);
    scaleValue.textContent = Math.round(minScale * 100) + '%';
    cropScale.min = Math.round(minScale * 100);
    cropScale.max = Math.round(minScale * 100 * 3);

    // Центрируем
    cropOffsetX = (VIEW - img.width * cropScaleVal) / 2;
    cropOffsetY = (VIEW - img.height * cropScaleVal) / 2;

    cropImg.src = url;
    applyCropTransform();
    cropOverlay.classList.add('show');
  };
  img.src = url;
}

function applyCropTransform() {
  cropImg.style.width = (cropSource.width * cropScaleVal) + 'px';
  cropImg.style.height = (cropSource.height * cropScaleVal) + 'px';
  cropImg.style.left = cropOffsetX + 'px';
  cropImg.style.top = cropOffsetY + 'px';
}

function clampOffsets() {
  const w = cropSource.width * cropScaleVal;
  const h = cropSource.height * cropScaleVal;
  // Не даём уезжать так, чтобы оставались пустые края
  if (w >= VIEW) {
    cropOffsetX = Math.min(0, Math.max(VIEW - w, cropOffsetX));
  } else {
    cropOffsetX = (VIEW - w) / 2;
  }
  if (h >= VIEW) {
    cropOffsetY = Math.min(0, Math.max(VIEW - h, cropOffsetY));
  } else {
    cropOffsetY = (VIEW - h) / 2;
  }
}

cropScale.addEventListener('input', () => {
  const oldScale = cropScaleVal;
  cropScaleVal = cropScale.value / 100;
  scaleValue.textContent = cropScale.value + '%';

  // Масштабируем относительно центра
  const cx = VIEW / 2;
  const cy = VIEW / 2;
  const relX = (cx - cropOffsetX) / oldScale;
  const relY = (cy - cropOffsetY) / oldScale;
  cropOffsetX = cx - relX * cropScaleVal;
  cropOffsetY = cy - relY * cropScaleVal;

  clampOffsets();
  applyCropTransform();
});
