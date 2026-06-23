const ADMIN_PIN = "1208"; // 원하면 엄마가 바꿔도 됩니다.
const STORE_KEY = "siel_aac_data_v1";
const RECENT_KEY = "siel_aac_recent_v1";

let data = loadData();
let currentCategory = null;
let firebaseReady = false;
let db = null;

const $ = (id) => document.getElementById(id);

const defaultData = {
  categories: [
    { id: crypto.randomUUID(), name: "학교", icon: "", cards: [] },
    { id: crypto.randomUUID(), name: "집", icon: "", cards: [] },
    { id: crypto.randomUUID(), name: "치료실", icon: "", cards: [] },
    { id: crypto.randomUUID(), name: "감정", icon: "", cards: [
      { id: crypto.randomUUID(), text: "쉬고 싶어요", speak: "쉬고 싶어요", image: "" },
      { id: crypto.randomUUID(), text: "도와주세요", speak: "도와주세요", image: "" },
      { id: crypto.randomUUID(), text: "졸려요", speak: "졸려요", image: "" },
      { id: crypto.randomUUID(), text: "배고파요", speak: "배고파요", image: "" }
    ] }
  ],
  updatedAt: Date.now()
};

function loadData() {
  const saved = localStorage.getItem(STORE_KEY);
  if (!saved) return structuredClone(defaultData);
  try { return JSON.parse(saved); }
  catch { return structuredClone(defaultData); }
}

function saveData() {
  data.updatedAt = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  uploadToCloudIfReady();
  render();
}

function speak(text) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text || "");
  u.lang = "ko-KR";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

function render() {
  $("title").textContent = currentCategory ? currentCategory.name : "시엘 AAC";
  $("backBtn").classList.toggle("hidden", !currentCategory);
  renderRecent();
  if (!currentCategory) renderCategories();
  else renderCards(currentCategory);
  renderAdmin();
}

function renderCategories() {
  const grid = $("grid");
  grid.innerHTML = "";
  data.categories.forEach(cat => {
    const el = document.createElement("button");
    el.className = "card categoryCard";
    el.innerHTML = `<div class="label">${escapeHtml(cat.name)}</div>`;
    el.onclick = () => { currentCategory = cat; render(); };
    grid.appendChild(el);
  });
}

function renderCards(cat) {
  const grid = $("grid");
  grid.innerHTML = "";
  cat.cards.forEach(card => {
    const el = document.createElement("button");
    el.className = "card";
    el.innerHTML = `
      ${card.image ? `<img src="${card.image}" alt="">` : `<img alt="">`}
      <div class="label">${escapeHtml(card.text)}</div>
    `;
    el.onclick = () => openCard(card);
    grid.appendChild(el);
  });
}

function renderRecent() {
  const recent = getRecent();
  $("recentSection").classList.toggle("hidden", currentCategory !== null || recent.length === 0);
  const grid = $("recentGrid");
  grid.innerHTML = "";
  recent.forEach(card => {
    const el = document.createElement("button");
    el.className = "card";
    el.innerHTML = `
      ${card.image ? `<img src="${card.image}" alt="">` : `<img alt="">`}
      <div class="label">${escapeHtml(card.text)}</div>
    `;
    el.onclick = () => openCard(card);
    grid.appendChild(el);
  });
}

function openCard(card) {
  addRecent(card);
  $("viewerImg").src = card.image || "";
  $("viewerText").textContent = card.text;
  $("viewer").showModal();
  speak(card.speak || card.text);
}

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
  catch { return []; }
}

function addRecent(card) {
  let recent = getRecent().filter(x => x.id !== card.id);
  recent.unshift(card);
  recent = recent.slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function renderAdmin() {
  const select = $("categorySelect");
  select.innerHTML = "";
  data.categories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = cat.name;
    select.appendChild(option);
  });

  const del = $("deleteList");
  del.innerHTML = "";
  data.categories.forEach(cat => {
    cat.cards.forEach(card => {
      const row = document.createElement("div");
      row.className = "deleteItem";
      row.innerHTML = `
        ${card.image ? `<img src="${card.image}" alt="">` : `<div></div>`}
        <strong>${escapeHtml(cat.name)} / ${escapeHtml(card.text)}</strong>
        <button type="button">삭제</button>
      `;
      row.querySelector("button").onclick = () => {
        if (confirm(`'${card.text}' 그림을 삭제할까요?`)) {
          cat.cards = cat.cards.filter(c => c.id !== card.id);
          saveData();
        }
      };
      del.appendChild(row);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


// 이미지 자동 압축: AAC 앱이 무겁지 않게 원본 사진을 작게 변환합니다.
// 기본값: 긴 변 최대 800px, WebP 품질 0.75
async function compressImageFile(file, maxSize = 800, quality = 0.75) {
  if (!file || !file.type || !file.type.startsWith("image/")) return "";
  const originalBytes = file.size || 0;

  const imageBitmap = await createImageBitmap(file);
  let { width, height } = imageBitmap;

  const scale = Math.min(1, maxSize / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });

  if (!blob) {
    // 일부 구형 브라우저 예외 대비: 기존 DataURL 방식으로 저장
    return {
      dataUrl: await fileToDataUrl(file),
      originalBytes,
      compressedBytes: originalBytes,
      width,
      height,
      targetWidth: width,
      targetHeight: height,
      format: file.type
    };
  }

  const dataUrl = await blobToDataUrl(blob);
  return {
    dataUrl,
    originalBytes,
    compressedBytes: blob.size,
    width,
    height,
    targetWidth,
    targetHeight,
    format: "image/webp"
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}


$("backBtn").onclick = () => { currentCategory = null; render(); };
$("adminBtn").onclick = () => $("adminDialog").showModal();
$("closeViewer").onclick = () => $("viewer").close();
$("speakAgain").onclick = () => speak($("viewerText").textContent);

$("loginBtn").onclick = () => {
  if ($("pinInput").value === ADMIN_PIN) {
    $("adminPanel").classList.remove("hidden");
  } else {
    alert("PIN이 달라요.");
  }
};

$("addCategoryBtn").onclick = () => {
  const name = $("newCategory").value.trim();
  if (!name) return;
  data.categories.push({ id: crypto.randomUUID(), name, icon: "", cards: [] });
  $("newCategory").value = "";
  saveData();
};

$("addCardBtn").onclick = async () => {
  const cat = data.categories.find(c => c.id === $("categorySelect").value);
  const text = $("cardText").value.trim();
  const speakText = $("cardSpeak").value.trim() || text;
  const file = $("imageInput").files[0];

  if (!cat || !text) {
    alert("카테고리와 그림 이름은 꼭 필요해요.");
    return;
  }

  let image = "";
  let imageMeta = null;
  if (file) {
    imageMeta = await compressImageFile(file, 800, 0.75);
    image = imageMeta.dataUrl;
    if (imageMeta && imageMeta.originalBytes && imageMeta.compressedBytes) {
      const saved = Math.max(0, imageMeta.originalBytes - imageMeta.compressedBytes);
      console.log(`이미지 압축 완료: ${formatBytes(imageMeta.originalBytes)} → ${formatBytes(imageMeta.compressedBytes)} / 절약 ${formatBytes(saved)}`);
    }
  }

  cat.cards.push({
    id: crypto.randomUUID(),
    text,
    speak: speakText,
    image,
    imageMeta: imageMeta ? {
      originalBytes: imageMeta.originalBytes,
      compressedBytes: imageMeta.compressedBytes,
      width: imageMeta.width,
      height: imageMeta.height,
      targetWidth: imageMeta.targetWidth,
      targetHeight: imageMeta.targetHeight,
      format: imageMeta.format
    } : null
  });
  $("cardText").value = "";
  $("cardSpeak").value = "";
  $("imageInput").value = "";
  saveData();
};

$("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `siel-aac-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$("importInput").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text);
  if (!imported.categories) {
    alert("백업 파일 형식이 달라요.");
    return;
  }
  data = imported;
  saveData();
};

window.addEventListener("online", () => {
  $("statusBar").textContent = "와이파이 연결됨: 업데이트를 확인할 수 있어요.";
  initFirebase();
});
window.addEventListener("offline", () => {
  $("statusBar").textContent = "오프라인 모드: 저장된 그림으로 사용할 수 있어요.";
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

async function initFirebase() {
  try {
    const configModule = await import("./firebase-config.js");
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, doc, setDoc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const app = initializeApp(configModule.firebaseConfig);
    db = getFirestore(app);
    firebaseReady = { doc, setDoc, onSnapshot };

    const ref = doc(db, "aac", "siel");
    onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const cloud = snap.data().payload;
      if (cloud && cloud.updatedAt > (data.updatedAt || 0)) {
        data = cloud;
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        currentCategory = null;
        render();
        $("statusBar").textContent = "업데이트가 반영되었어요.";
      }
    });
    $("statusBar").textContent = "동기화 준비 완료";
  } catch (e) {
    $("statusBar").textContent = "기기 안 저장 모드";
  }
}

async function uploadToCloudIfReady() {
  if (!firebaseReady || !db) return;
  const { doc, setDoc } = firebaseReady;
  await setDoc(doc(db, "aac", "siel"), { payload: data, updatedAt: Date.now() });
}

initFirebase();
render();
