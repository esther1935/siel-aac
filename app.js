// PIN은 localStorage에 저장 (변경 가능)
const PIN_STORAGE_KEY = "siel_admin_pin";
const TEACHER_PINS_KEY = "siel_teacher_pins";

function getAdminPin() {
  return localStorage.getItem(PIN_STORAGE_KEY) || "1208";
}
function getTeacherPins() {
  try { return JSON.parse(localStorage.getItem(TEACHER_PINS_KEY) || "[]"); }
  catch { return []; }
}
function saveTeacherPins(pins) {
  localStorage.setItem(TEACHER_PINS_KEY, JSON.stringify(pins));
}
const STORE_KEY = "siel_aac_data_v1";
const RECENT_KEY = "siel_aac_recent_v1";
const OFFLINE_IMAGE_CACHE = "siel-aac-image-cache-v3";

let selectedCategoryId = "all";
let sentenceCards = [];
let reverseOrder = true; // 기본: 최신이 왼쪽 (시엘이 모드)
let searchTerm = "";
let selectedCardId = "";
let editingCardId = "";
let firebaseReady = false;
let db = null;

const $ = (id) => document.getElementById(id);

const categoryIcons = {
  "전체": "🌈",
  "마이크": "🎤",
  "집": "🏠",
  "학교": "🏫",
  "늘봄": "🌱",
  "기관": "🏢",
  "치료기관": "🏢",
  "치료실": "💬",
  "병원": "🏥",
  "감정": "😊",
  "음식": "🍊",
  "교회": "⛪",
  "나들이": "🚗",
  "놀이": "🌱",
  "가족": "👨‍👩‍👦",
  "한글": "가",
  "숫자": "123"
};

const defaultData = {
  categories: [
    { id: crypto.randomUUID(), name: "학교", icon: "🏫", cards: [] },
    { id: crypto.randomUUID(), name: "집", icon: "🏠", cards: [] },
    { id: crypto.randomUUID(), name: "치료실", icon: "💬", cards: [] },
    { id: crypto.randomUUID(), name: "감정", icon: "😊", cards: [
      { id: crypto.randomUUID(), text: "쉬고 싶어요", speak: "쉬고 싶어요", image: "" },
      { id: crypto.randomUUID(), text: "도와주세요", speak: "도와주세요", image: "" },
      { id: crypto.randomUUID(), text: "졸려요", speak: "졸려요", image: "" },
      { id: crypto.randomUUID(), text: "배고파요", speak: "배고파요", image: "" }
    ] },
    { id: crypto.randomUUID(), name: "늘봄", icon: "🌱", cards: [] },
    { id: crypto.randomUUID(), name: "음식", icon: "🍊", cards: [] },
    { id: crypto.randomUUID(), name: "가족", icon: "👨‍👩‍👦", cards: [] }
  ],
  board: "",
  updatedAt: 0
};

let data = loadData();

function loadData() {
  const saved = localStorage.getItem(STORE_KEY);
  if (!saved) return structuredClone(defaultData);
  try {
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.categories)) return structuredClone(defaultData);
    if (typeof parsed.board !== "string") parsed.board = "";
    parsed.categories.forEach(cat => {
      if (!cat.icon) cat.icon = categoryIcons[cat.name] || "▫️";
      if (!Array.isArray(cat.cards)) cat.cards = [];
    });
    return parsed;
  } catch {
    return structuredClone(defaultData);
  }
}

function saveLocalOnly() {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function normalizeSpeakValues() {
  data.categories.forEach(cat => {
    if (!Array.isArray(cat.cards)) cat.cards = [];
    cat.cards.forEach(card => {
      if (!card.id) card.id = crypto.randomUUID();
      card.speak = card.text || "";
    });
  });
}

function saveData() {
  normalizeSpeakValues();
  data.updatedAt = Date.now();
  saveLocalOnly();
  render();
  uploadToCloudIfReady();
}

function speak(text) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text || "");
  u.lang = "ko-KR";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

function render() {
  renderSentence();
  renderCategoryBar();
  renderCards();
  renderAdmin();
}

function renderSentence() {
  const area = $("sentenceCanvas");
  const sentenceText = $("sentenceText");
  area.innerHTML = "";

  if (sentenceCards.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sentenceEmpty";
    empty.innerHTML = "👇<br>그림을 눌러<br>문장을 만들어 보세요";
    area.appendChild(empty);
    sentenceText.textContent = "";
    return;
  }

  sentenceCards.forEach((card, index) => {
    const chip = document.createElement("button");
    chip.className = "sentenceChip";
    chip.type = "button";
    chip.innerHTML = `
      <div class="sentenceSpeak">${escapeHtml(card.text)}</div>
      <button class="removeChip" type="button" aria-label="삭제">×</button>
      <div class="sentenceImageBox">
        ${card.image ? `<img src="${card.image}" alt="">` : `<div class="noImage"></div>`}
      </div>
      <div class="sentenceLabel">${escapeHtml(card.text)}</div>
    `;
    chip.querySelector(".removeChip").onclick = (e) => {
      e.stopPropagation();
      sentenceCards.splice(index, 1);
      renderSentence();
    };
    chip.onclick = () => speak(card.text);
    area.appendChild(chip);
  });

  // 텍스트는 항상 시간순(오래된→최신) 으로 표시
  const displayCards = reverseOrder ? [...sentenceCards].reverse() : sentenceCards;
  sentenceText.textContent = displayCards.map(c => c.speak || c.text).join(" ");
}

function renderCategoryBar() {
  const bar = $("categoryBar");
  bar.innerHTML = "";

  const all = document.createElement("button");
  all.className = selectedCategoryId === "all" ? "catTab active" : "catTab";
  all.type = "button";
  all.innerHTML = `<span class="catIcon">🌈</span><span>전체</span>`;
  all.onclick = () => selectCategory("all");
  bar.appendChild(all);

  data.categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = selectedCategoryId === cat.id ? "catTab active" : "catTab";
    btn.type = "button";
    const icon = cat.icon || categoryIcons[cat.name] || "▫️";
    btn.innerHTML = `<span class="catIcon">${escapeHtml(icon)}</span><span>${escapeHtml(cat.name)}</span>`;
    btn.onclick = () => selectCategory(cat.id);
    bar.appendChild(btn);
  });
}

function selectCategory(id) {
  selectedCategoryId = id;
  searchTerm = "";
  selectedCardId = "";
  const input = $("searchInput");
  if (input) input.value = "";
  render();
  requestAnimationFrame(updateDots);
}

function getVisibleCards() {
  const q = searchTerm.trim().toLowerCase();

  if (q) {
    const allCards = data.categories.flatMap(cat => cat.cards.map(card => ({ ...card, categoryName: cat.name })));
    return allCards.filter(card =>
      (card.text || "").toLowerCase().includes(q) ||
      (card.speak || "").toLowerCase().includes(q) ||
      (card.categoryName || "").toLowerCase().includes(q)
    );
  }

  if (selectedCategoryId === "all") {
    return data.categories.flatMap(cat => cat.cards.map(card => ({ ...card, categoryName: cat.name })));
  }

  const cat = data.categories.find(c => c.id === selectedCategoryId);
  return cat ? cat.cards.map(card => ({ ...card, categoryName: cat.name })) : [];
}

function renderCards() {
  const scroller = $("cardScroller");
  scroller.innerHTML = "";

  const cards = getVisibleCards();

  if (cards.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cardsEmpty";
    empty.textContent = "아직 이 카테고리에 그림이 없어요.\n관리 메뉴에서 그림을 추가해 주세요.";
    scroller.appendChild(empty);
    renderDots(0, 0);
    return;
  }

  cards.forEach(card => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = card.id === selectedCardId ? "card selectedCard" : "card";
    el.innerHTML = `
      <div class="cardSpeak">${escapeHtml(card.text)}</div>
      <div class="cardImageBox">
        ${card.image ? `<img src="${card.image}" alt="">` : `<div class="noImage"></div>`}
      </div>
      <div class="label">${escapeHtml(card.text)}</div>
    `;
    el.onclick = () => {
      selectedCardId = card.id;
      addToSentence(card);
      renderCards();
    };
    scroller.appendChild(el);
  });

  scroller.onscroll = () => updateDots();
  requestAnimationFrame(updateDots);
}

function renderDots(total, active) {
  const dots = $("pageDots");
  dots.innerHTML = "";
  if (total <= 1) return;

  const left = document.createElement("span");
  left.className = "dotArrow";
  left.textContent = "‹";
  dots.appendChild(left);

  for (let i = 0; i < total; i++) {
    const dot = document.createElement("span");
    dot.className = i === active ? "dot active" : "dot";
    dots.appendChild(dot);
  }

  const right = document.createElement("span");
  right.className = "dotArrow";
  right.textContent = "›";
  dots.appendChild(right);
}

function updateDots() {
  const scroller = $("cardScroller");
  if (!scroller) return;
  const maxScroll = scroller.scrollWidth - scroller.clientWidth;
  if (maxScroll <= 10) {
    renderDots(0, 0);
    return;
  }
  const total = Math.min(8, Math.max(2, Math.ceil(scroller.scrollWidth / scroller.clientWidth)));
  const active = Math.min(total - 1, Math.round((scroller.scrollLeft / maxScroll) * (total - 1)));
  renderDots(total, active);
}

function addToSentence(card) {
  const entry = { id: card.id, text: card.text, speak: card.text, image: card.image || "" };
  if (reverseOrder) {
    sentenceCards.unshift(entry); // 최신이 왼쪽 (시엘이 모드)
  } else {
    sentenceCards.push(entry);    // 최신이 오른쪽 (한글 학습 모드)
  }
  addRecent(card);
  renderSentence();
  speak(card.text);
}

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
  catch { return []; }
}

function addRecent(card) {
  let recent = getRecent().filter(x => x.id !== card.id);
  recent.unshift(card);
  recent = recent.slice(0, 12);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function getCategoryById(id) {
  return data.categories.find(cat => cat.id === id);
}

function renderCategoryManageList() {
  const list = $("categoryManageList");
  if (!list) return;

  list.innerHTML = "";

  data.categories.forEach((cat, index) => {
    const row = document.createElement("div");
    row.className = "categoryManageItem";
    const icon = cat.icon || categoryIcons[cat.name] || "▫️";
    const count = Array.isArray(cat.cards) ? cat.cards.length : 0;

    row.innerHTML = `
      <div class="catManageIcon">${escapeHtml(icon)}</div>
      <input class="catRenameInput" value="${escapeHtml(cat.name)}" aria-label="카테고리 이름" />
      <span class="catCardCount">${count}개</span>
      <button class="catUpBtn" type="button" ${index === 0 ? "disabled" : ""}>⬆️</button>
      <button class="catDownBtn" type="button" ${index === data.categories.length - 1 ? "disabled" : ""}>⬇️</button>
      <button class="catRenameBtn" type="button">이름 저장</button>
      <button class="catDeleteBtn" type="button">삭제</button>
    `;

    const input = row.querySelector(".catRenameInput");

    row.querySelector(".catUpBtn").onclick = () => {
      if (index <= 0) return;
      const temp = data.categories[index - 1];
      data.categories[index - 1] = data.categories[index];
      data.categories[index] = temp;
      saveData();
    };

    row.querySelector(".catDownBtn").onclick = () => {
      if (index >= data.categories.length - 1) return;
      const temp = data.categories[index + 1];
      data.categories[index + 1] = data.categories[index];
      data.categories[index] = temp;
      saveData();
    };

    const saveName = () => {
      const newName = input.value.trim();
      if (!newName) {
        alert("카테고리 이름을 입력해 주세요.");
        input.value = cat.name;
        return;
      }
      cat.name = newName;
      cat.icon = categoryIcons[newName] || cat.icon || "▫️";
      saveData();
    };

    row.querySelector(".catRenameBtn").onclick = saveName;
    input.onkeydown = (event) => {
      if (event.key === "Enter") saveName();
    };

    row.querySelector(".catDeleteBtn").onclick = () => {
      const cardCount = Array.isArray(cat.cards) ? cat.cards.length : 0;
      const msg = cardCount > 0
        ? `'${cat.name}' 카테고리 안에 그림 ${cardCount}개가 있습니다.\n카테고리를 삭제하면 안의 그림도 함께 삭제됩니다.\n정말 삭제할까요?`
        : `'${cat.name}' 카테고리를 삭제할까요?`;

      if (!confirm(msg)) return;

      data.categories.splice(index, 1);
      if (selectedCategoryId === cat.id) selectedCategoryId = "all";
      saveData();
    };

    list.appendChild(row);
  });
}

function resetEditMode() {
  editingCardId = "";
  $("cardText").value = "";
  $("cardSpeak").value = "";
  $("imageInput").value = "";
  $("addCardBtn").textContent = "그림 추가";
  $("cancelEditBtn").classList.add("hidden");
  $("editStatus").textContent = "새 그림 추가 모드입니다.";
}

function updateSyncStatus(text) {
  const el = $("syncStatus");
  if (!el) return;

  if (text) {
    el.textContent = text;
    return;
  }

  if (!navigator.onLine) {
    el.textContent = "오프라인 모드: 이 기기에 저장된 그림으로 사용할 수 있어요.";
  } else if (firebaseReady && db) {
    el.textContent = "온라인 모드: Firebase와 동기화됩니다.";
  } else {
    el.textContent = "온라인 준비 중: 저장된 자료로 먼저 열렸어요.";
  }
}


async function cacheImageUrl(url) {
  if (!url || !("caches" in window)) return;
  if (!/^https?:/.test(url)) return;

  try {
    const cache = await caches.open(OFFLINE_IMAGE_CACHE);
    const cached = await cache.match(url);
    if (cached && !navigator.onLine) return;

    const response = await fetch(url, { cache: navigator.onLine ? "reload" : "default", mode: "cors", credentials: "omit" });
    if (response && response.ok) {
      await cache.put(url, response.clone());
    }
  } catch (e) {
    try {
      const cache = await caches.open(OFFLINE_IMAGE_CACHE);
      const cached = await cache.match(url);
      if (cached) return;
      const response = await fetch(url, { mode: "no-cors" });
      if (response && (response.ok || response.type === "opaque")) {
        await cache.put(url, response.clone());
      }
    } catch (err) {
      console.warn("이미지 캐시 실패:", url, err);
    }
  }
}

function attachImageCacheOnLoad() {
  document.querySelectorAll("img").forEach(img => {
    const url = img.currentSrc || img.src;
    if (!url || img.dataset.cacheAttached === "1") return;
    img.dataset.cacheAttached = "1";

    if (img.complete && img.naturalWidth > 0) {
      cacheImageUrl(url);
    } else {
      img.addEventListener("load", () => cacheImageUrl(img.currentSrc || img.src), { once: true });
    }
  });
}


function setSyncProgress(done, total, message) {
  const el = $("syncStatus");
  if (!el) return;

  if (!total) {
    el.textContent = message || "동기화 준비 중";
    return;
  }

  const percent = Math.round((done / total) * 100);
  el.textContent = `${message || "최신 그림 동기화 중"} ${done}/${total} (${percent}%)`;
}

function getCardVersion(card) {
  return String(card.updatedAt || card.storagePath || card.image || card.id || "");
}

// 이미 캐시된 버전과 같으면 건너뜀 — 새로 추가된 그림만 다운로드
async function smartCacheImage(url, versionKey) {
  if (!url || !("caches" in window)) return false;
  if (!/^https?:/.test(url)) return false;

  try {
    const cache = await caches.open(OFFLINE_IMAGE_CACHE);
    const cacheKey = `${url}#sielVersion=${encodeURIComponent(versionKey || url)}`;

    // 같은 버전이 이미 캐시에 있으면 → 건너뜀
    const already = await cache.match(cacheKey);
    if (already) return true;

    // 새 그림이거나 버전이 바뀐 경우만 다운로드
    const response = await fetch(url, { credentials: "omit", mode: "cors" });
    if (response && response.ok) {
      // 이전 버전 캐시 정리 후 새 버전 저장
      const keys = await cache.keys();
      await Promise.all(
        keys
          .filter(req => req.url === url || req.url.startsWith(url + "#sielVersion="))
          .map(req => cache.delete(req))
      );
      await cache.put(cacheKey, response.clone());
      await cache.put(url, response.clone());
      return true;
    }
  } catch (e) {
    try {
      const cache = await caches.open(OFFLINE_IMAGE_CACHE);
      const cacheKey = `${url}#sielVersion=${encodeURIComponent(versionKey || url)}`;
      const already = await cache.match(cacheKey);
      if (already) return true;
      const response = await fetch(url, { mode: "no-cors" });
      if (response && (response.ok || response.type === "opaque")) {
        await cache.put(url, response.clone());
        return true;
      }
    } catch (err) {
      console.warn("이미지 캐시 실패:", url, err);
    }
  }
  return false;
}

async function syncLatestImagesFromCloud() {
  if (!navigator.onLine || !("caches" in window)) {
    updateSyncStatus();
    return;
  }

  const cards = [];
  data.categories.forEach(cat => {
    cat.cards.forEach(card => {
      if (card.image && /^https?:/.test(card.image)) cards.push(card);
    });
  });

  if (!cards.length) {
    updateSyncStatus("동기화할 그림이 없습니다.");
    return;
  }

  // 1단계: 어떤 그림이 새로 추가됐는지 먼저 확인
  const cache = await caches.open(OFFLINE_IMAGE_CACHE);
  const newCards = [];
  for (const card of cards) {
    const versionKey = getCardVersion(card);
    const cacheKey = `${card.image}#sielVersion=${encodeURIComponent(versionKey)}`;
    const already = await cache.match(cacheKey);
    if (!already) newCards.push(card);
  }

  if (newCards.length === 0) {
    updateSyncStatus("모든 그림이 최신 상태예요. (" + cards.length + "개)");
    requestAnimationFrame(attachImageCacheOnLoad);
    return;
  }

  // 2단계: 새 그림만 다운로드
  setSyncProgress(0, newCards.length, `새 그림 ${newCards.length}개 받는 중`);

  let done = 0;
  for (const card of newCards) {
    await smartCacheImage(card.image, getCardVersion(card));
    done += 1;
    if (done === 1 || done === newCards.length || done % 3 === 0) {
      setSyncProgress(done, newCards.length, `새 그림 받는 중`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  updateSyncStatus(`새 그림 ${newCards.length}개 저장 완료. 이제 Wi-Fi를 꺼도 사용할 수 있어요.`);
  requestAnimationFrame(attachImageCacheOnLoad);
}

async function warmUpImageCache() {
  if (!("caches" in window)) return;

  try {
    const cards = [];
    data.categories.forEach(cat => {
      cat.cards.forEach(card => {
        if (card.image && /^https?:/.test(card.image)) cards.push(card);
      });
    });

    // 이미 캐시된 그림은 건너뜀
    await Promise.allSettled(
      cards.slice(0, 700).map(card => smartCacheImage(card.image, getCardVersion(card)))
    );
    attachImageCacheOnLoad();
  } catch (e) {
    console.warn("이미지 오프라인 저장 실패:", e);
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    updateSyncStatus("이 브라우저는 오프라인 앱 저장을 지원하지 않아요.");
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js?v=sielPinUpdate20260629");
    updateSyncStatus();
  } catch (e) {
    console.warn("서비스워커 등록 실패:", e);
  }
}

function renderTeacherPinListOnLoad() {
  // 관리자 패널 열릴 때 선생님 PIN 목록 렌더링
  renderTeacherPinList && renderTeacherPinList();
}

function renderAdmin() {
  const select = $("categorySelect");
  if (!select) return;

  select.innerHTML = "";
  data.categories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = cat.name;
    select.appendChild(option);
  });

  renderCategoryManageList();

  const del = $("deleteList");
  del.innerHTML = "";

  data.categories.forEach(cat => {
    cat.cards.forEach(card => {
      const row = document.createElement("div");
      row.className = "deleteItem";
      row.innerHTML = `
        <div class="deleteThumb">${card.image ? `<img src="${card.image}" alt="">` : `<div class="thumbEmpty"></div>`}</div>
        <button class="editCardBtn" type="button"><strong>${escapeHtml(cat.name)} / ${escapeHtml(card.text)}</strong></button>
        <button class="smallEditBtn" type="button">수정</button>
        <button class="deleteBtn" type="button">삭제</button>
      `;

      const startEdit = () => {
        editingCardId = card.id;
        $("categorySelect").value = cat.id;
        $("cardText").value = card.text || "";
        $("cardSpeak").value = card.text || "";
        $("imageInput").value = "";
        $("addCardBtn").textContent = "수정 저장";
        $("cancelEditBtn").classList.remove("hidden");
        $("editStatus").textContent = `'${card.text}' 수정 모드입니다. 이름만 바꾸거나 새 사진을 선택해 교체할 수 있습니다.`;
        $("cardText").focus();
      };

      row.querySelector(".editCardBtn").onclick = startEdit;
      row.querySelector(".smallEditBtn").onclick = startEdit;

      row.querySelector(".deleteBtn").onclick = async () => {
        if (confirm(`'${card.text}' 그림을 삭제할까요?`)) {
          await deleteImageFromStorageIfReady(card);
          cat.cards = cat.cards.filter(c => c.id !== card.id);
          sentenceCards = sentenceCards.filter(c => c.id !== card.id);
          if (editingCardId === card.id) resetEditMode();
          saveData();
        }
      };

      del.appendChild(row);
    });
  });

  if ($("boardText")) $("boardText").value = data.board || "";
  if ($("boardView")) $("boardView").textContent = data.board || "게시판 내용이 없습니다.";
  updateSyncStatus();
  requestAnimationFrame(attachImageCacheOnLoad);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}


// ===== 이미지 크롭 기능 =====
let cropImageSrc = null;
let cropResolve  = null;
let cropNaturalW = 0;
let cropNaturalH = 0;
let cropMode = "pan"; // "pan" | "fit"

// 팬/줌 상태 (pan 모드)
let imgX = 0, imgY = 0, imgScale = 1;
let panStart = null;       // { x, y, imgX, imgY }
let pinchStart = null;     // { dist, scale, cx, cy, imgX, imgY }

const FRAME = 300; // 정사각형 프레임 크기(px) — 캔버스 크기

function openCropDialog(file) {
  return new Promise((resolve) => {
    cropResolve = resolve;
    const reader = new FileReader();
    reader.onload = (e) => {
      cropImageSrc = e.target.result;
      const img = new Image();
      img.onload = () => {
        cropNaturalW = img.naturalWidth;
        cropNaturalH = img.naturalHeight;
        setCropMode("pan");
        $("cropDialog").showModal();
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/* ── 캔버스에 현재 상태 그리기 ── */
function drawPanCanvas() {
  const canvas = $("cropCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width  = FRAME;
  canvas.height = FRAME;

  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, FRAME, FRAME);

  const img = new Image();
  img.onload = () => {
    const dispW = cropNaturalW * imgScale;
    const dispH = cropNaturalH * imgScale;
    ctx.drawImage(img, imgX, imgY, dispW, dispH);

    // 프레임 테두리
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, FRAME-2, FRAME-2);

    // 3×3 가이드선
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(FRAME/3*i, 0); ctx.lineTo(FRAME/3*i, FRAME); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, FRAME/3*i); ctx.lineTo(FRAME, FRAME/3*i); ctx.stroke();
    }
  };
  img.src = cropImageSrc;
}

/* ── 초기 스케일: 프레임을 꽉 채우는 최소 크기 ── */
function resetPanState() {
  const scaleToFill = Math.max(FRAME / cropNaturalW, FRAME / cropNaturalH);
  imgScale = scaleToFill;
  imgX = (FRAME - cropNaturalW * imgScale) / 2;
  imgY = (FRAME - cropNaturalH * imgScale) / 2;
  drawPanCanvas();
}

/* ── 스케일 변경 후 경계 보정 ── */
function clampPan() {
  const dispW = cropNaturalW * imgScale;
  const dispH = cropNaturalH * imgScale;
  // 그림이 프레임보다 작아지지 않게
  if (dispW < FRAME) { imgScale = FRAME / cropNaturalW; }
  if (cropNaturalH * imgScale < FRAME) { imgScale = FRAME / cropNaturalH; }
  const dW = cropNaturalW * imgScale;
  const dH = cropNaturalH * imgScale;
  if (imgX > 0) imgX = 0;
  if (imgY > 0) imgY = 0;
  if (imgX + dW < FRAME) imgX = FRAME - dW;
  if (imgY + dH < FRAME) imgY = FRAME - dH;
}

/* ── 터치/마우스 이벤트 ── */
function getCanvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = FRAME / rect.width;
  const touch = e.touches ? e.touches[0] : e;
  return {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top)  * scaleX
  };
}

function getTouchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = FRAME / rect.width;
  return {
    x: ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * scaleX,
    y: ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top)  * scaleX
  };
}

function onCanvasMouseDown(e) {
  if (cropMode !== "pan") return;
  e.preventDefault();
  const canvas = $("cropCanvas");
  const pos = getCanvasPos(e, canvas);
  panStart = { x: pos.x, y: pos.y, imgX, imgY };
}

function onCanvasTouchStart(e) {
  if (cropMode !== "pan") return;
  e.preventDefault();
  const canvas = $("cropCanvas");
  if (e.touches.length === 1) {
    const pos = getCanvasPos(e, canvas);
    panStart = { x: pos.x, y: pos.y, imgX, imgY };
    pinchStart = null;
  } else if (e.touches.length === 2) {
    panStart = null;
    const c = getTouchCenter(e, canvas);
    pinchStart = { dist: getTouchDist(e), scale: imgScale, cx: c.x, cy: c.y, imgX, imgY };
  }
}

function onCanvasMouseMove(e) {
  if (cropMode !== "pan" || !panStart) return;
  e.preventDefault();
  const canvas = $("cropCanvas");
  const pos = getCanvasPos(e, canvas);
  imgX = panStart.imgX + (pos.x - panStart.x);
  imgY = panStart.imgY + (pos.y - panStart.y);
  clampPan();
  drawPanCanvas();
}

function onCanvasTouchMove(e) {
  if (cropMode !== "pan") return;
  e.preventDefault();
  const canvas = $("cropCanvas");
  if (e.touches.length === 1 && panStart) {
    const pos = getCanvasPos(e, canvas);
    imgX = panStart.imgX + (pos.x - panStart.x);
    imgY = panStart.imgY + (pos.y - panStart.y);
    clampPan();
    drawPanCanvas();
  } else if (e.touches.length === 2 && pinchStart) {
    const newDist = getTouchDist(e);
    const ratio   = newDist / pinchStart.dist;
    const newScale = pinchStart.scale * ratio;
    const c = getTouchCenter(e, canvas);
    // 핀치 중심점 기준으로 확대/축소
    imgX = c.x - (pinchStart.cx - pinchStart.imgX) * ratio;
    imgY = c.y - (pinchStart.cy - pinchStart.imgY) * ratio;
    imgScale = newScale;
    clampPan();
    drawPanCanvas();
  }
}

function onCanvasPointerUp() {
  panStart = null;
  pinchStart = null;
}

/* ── 모드 전환 ── */
function setCropMode(mode) {
  cropMode = mode;
  const canvas    = $("cropCanvas");
  const fitCanvas = $("fitPreviewCanvas");
  const panBtn    = $("modeCropBtn");
  const fitBtn    = $("modeFitBtn");
  const hint      = $("cropHint");

  if (mode === "pan") {
    panBtn.style.background = "#a78bfa"; panBtn.style.color = "#fff";
    fitBtn.style.background = "transparent"; fitBtn.style.color = "#aaa";
    canvas.style.display    = "block";
    fitCanvas.style.display = "none";
    hint.textContent = "드래그로 위치 조정 · 두 손가락으로 크기 조절";
    resetPanState();
  } else {
    fitBtn.style.background = "#a78bfa"; fitBtn.style.color = "#fff";
    panBtn.style.background = "transparent"; panBtn.style.color = "#aaa";
    canvas.style.display    = "none";
    fitCanvas.style.display = "block";
    hint.textContent = "그림 전체를 정사각형 안에 흰 배경으로 넣습니다";
    renderFitPreview();
  }
}

function renderFitPreview() {
  const out = 300;
  const fc  = $("fitPreviewCanvas");
  fc.width = out; fc.height = out;
  const ctx = fc.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out, out);
  const img = new Image();
  img.onload = () => {
    const s = Math.min(out / img.naturalWidth, out / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (out-w)/2, (out-h)/2, w, h);
  };
  img.src = cropImageSrc;
}

/* ── 이벤트 바인딩 ── */
$("modeCropBtn").onclick = () => setCropMode("pan");
$("modeFitBtn").onclick  = () => setCropMode("fit");

const _cv = () => $("cropCanvas");
_cv; // 나중에 showModal 후 붙임 — dialog open 시점에 바인딩
$("cropDialog").addEventListener("toggle", () => {
  if ($("cropDialog").open) {
    const cv = $("cropCanvas");
    cv.addEventListener("mousedown",  onCanvasMouseDown,  { passive: false });
    cv.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
    cv.addEventListener("mousemove",  onCanvasMouseMove,  { passive: false });
    cv.addEventListener("touchmove",  onCanvasTouchMove,  { passive: false });
    cv.addEventListener("mouseup",    onCanvasPointerUp);
    cv.addEventListener("mouseleave", onCanvasPointerUp);
    cv.addEventListener("touchend",   onCanvasPointerUp);
  }
});

/* ── 완료 버튼 ── */
$("cropConfirmBtn").onclick = () => {
  const outSize = 900;
  const out = document.createElement("canvas");
  out.width = outSize; out.height = outSize;
  const ctx = out.getContext("2d");

  const img = new Image();
  img.onload = () => {
    if (cropMode === "fit") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outSize, outSize);
      const s = Math.min(outSize / img.naturalWidth, outSize / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (outSize-w)/2, (outSize-h)/2, w, h);
    } else {
      // pan 모드: 화면에 보이는 그대로 캡처
      const ratio = outSize / FRAME;
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, outSize, outSize);
      ctx.drawImage(img, imgX * ratio, imgY * ratio,
                    cropNaturalW * imgScale * ratio,
                    cropNaturalH * imgScale * ratio);
    }
    const dataUrl = out.toDataURL("image/jpeg", 0.82);
    $("cropDialog").close();
    if (cropResolve) { cropResolve(dataUrl); cropResolve = null; }
  };
  img.src = cropImageSrc;
};

$("cropCancelBtn").onclick = () => {
  $("cropDialog").close();
  if (cropResolve) { cropResolve(null); cropResolve = null; }
};
// ===== 크롭 기능 끝 =====

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        const maxSize = 900;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImageToStorageIfReady(file, cardId) {
  const compressedDataUrl = await fileToDataUrl(file);

  if (!firebaseReady || !firebaseReady.getStorage) {
    return { image: compressedDataUrl, storagePath: "" };
  }

  const { getStorage, storageRef, uploadString, getDownloadURL } = firebaseReady;
  const storage = getStorage();
  const path = `aac-cards/${cardId}.jpg`;
  const ref = storageRef(storage, path);

  await uploadString(ref, compressedDataUrl, "data_url");
  const url = await getDownloadURL(ref);

  return { image: url, storagePath: path };
}


async function uploadCroppedImageIfReady(dataUrl, cardId) {
  if (!firebaseReady || !firebaseReady.getStorage) {
    return { image: dataUrl, storagePath: "" };
  }

  const { getStorage, storageRef, uploadString, getDownloadURL } = firebaseReady;
  const storage = getStorage();
  const path = `aac-cards/${cardId}.jpg`;
  const ref = storageRef(storage, path);

  await uploadString(ref, dataUrl, "data_url");
  const url = await getDownloadURL(ref);

  return { image: url, storagePath: path };
}

async function deleteImageFromStorageIfReady(card) {
  if (!card || !card.storagePath || !firebaseReady || !firebaseReady.getStorage) return;

  try {
    const { getStorage, storageRef, deleteObject } = firebaseReady;
    const storage = getStorage();
    const ref = storageRef(storage, card.storagePath);
    await deleteObject(ref);
  } catch (e) {
    console.warn("Storage 이미지 삭제 실패:", e);
  }
}

async function clearOldCachesOnce() {
  // 오프라인 사용을 위해 기존 캐시 삭제를 중단합니다.
}

function openAdminTab(tab) {
  $("uploadPanel").classList.toggle("hidden", tab !== "upload");
  $("boardPanel").classList.toggle("hidden", tab !== "board");
}

$("menuBtn").onclick = () => {
  // 초기화
  $("adminPanel").classList.add("hidden");
  $("adminMenu") && $("adminMenu").classList.add("hidden");
  $("pinInput").value = "";
  $("teacherPinInput") && ($("teacherPinInput").value = "");
  // 기본: 선생님 화면으로 시작 (선생님 PIN 있을 때)
  const tPins = getTeacherPins();
  if (tPins.length > 0) {
    $("pinArea").classList.add("hidden");
    $("teacherPinArea").classList.remove("hidden");
    renderTeacherCategorySelect();
  } else {
    $("pinArea").classList.remove("hidden");
    $("teacherPinArea").classList.add("hidden");
  }
  $("adminDialog").showModal();
};

// 관리자로 전환
$("switchToAdminBtn") && ($("switchToAdminBtn").onclick = () => {
  $("teacherPinArea").classList.add("hidden");
  $("pinArea").classList.remove("hidden");
});

function renderTeacherCategorySelect() {
  const sel = $("teacherCategorySelect");
  if (!sel) return;
  sel.innerHTML = "";
  const tPins = getTeacherPins();
  const catIds = [...new Set(tPins.map(p => p.categoryId))];
  catIds.forEach(cid => {
    const cat = data.categories.find(c => c.id === cid);
    if (cat) {
      const opt = document.createElement("option");
      opt.value = cid;
      opt.textContent = cat.icon + " " + cat.name;
      sel.appendChild(opt);
    }
  });
}

// 선생님 PIN 로그인
$("teacherLoginBtn") && ($("teacherLoginBtn").onclick = () => {
  const pin = $("teacherPinInput").value.trim();
  const catId = $("teacherCategorySelect").value;
  const tPins = getTeacherPins();
  const match = tPins.find(p => p.pin === pin && p.categoryId === catId);
  if (match) {
    // 해당 카테고리만 선택된 채로 업로드 패널 열기
    $("adminPanel").classList.remove("hidden");
    $("adminMenu").classList.remove("hidden");
    openAdminTab("upload");
    // 카테고리 고정
    const sel = $("categorySelect");
    if (sel) { sel.value = catId; sel.disabled = true; }
    $("teacherPinArea").classList.add("hidden");
  } else {
    alert("비밀번호가 맞지 않아요.");
  }
});
$("cancelEditBtn").onclick = () => resetEditMode();
$("showUploadBtn").onclick = () => openAdminTab("upload");
$("showBoardBtn").onclick = () => openAdminTab("board");

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
  const icon = categoryIcons[name] || "▫️";
  data.categories.push({ id: crypto.randomUUID(), name, icon, cards: [] });
  $("newCategory").value = "";
  selectedCategoryId = "all";
  saveData();
};

$("addCardBtn").onclick = async () => {
  const cat = data.categories.find(c => c.id === $("categorySelect").value);
  const text = $("cardText").value.trim();
  const file = $("imageInput").files[0];

  if (!cat || !text) {
    alert("카테고리와 그림 이름은 꼭 필요해요.");
    return;
  }

  try {
    if (editingCardId) {
      const all = data.categories.flatMap(c => c.cards.map(card => ({ card, cat: c })));
      const found = all.find(x => x.card.id === editingCardId);
      if (!found) {
        alert("수정할 그림을 찾지 못했어요.");
        resetEditMode();
        return;
      }

      const card = found.card;

      if (found.cat.id !== cat.id) {
        found.cat.cards = found.cat.cards.filter(c => c.id !== editingCardId);
        cat.cards.push(card);
      }

      card.text = text;
      card.speak = text;

      if (file) {
        const croppedDataUrl = await openCropDialog(file);
        if (croppedDataUrl) {
          await deleteImageFromStorageIfReady(card);
          const uploaded = await uploadCroppedImageIfReady(croppedDataUrl, card.id);
          card.image = uploaded.image;
          card.storagePath = uploaded.storagePath || "";
        }
      }

      sentenceCards = sentenceCards.map(c => c.id === card.id ? {
        ...c,
        text: card.text,
        speak: card.text,
        image: card.image || ""
      } : c);

      selectedCategoryId = cat.id;
      resetEditMode();
      saveData();
      return;
    }

    const cardId = crypto.randomUUID();
    let image = "";
    let storagePath = "";

    if (file) {
      const croppedDataUrl = await openCropDialog(file);
      if (croppedDataUrl) {
        const uploaded = await uploadCroppedImageIfReady(croppedDataUrl, cardId);
        image = uploaded.image;
        storagePath = uploaded.storagePath || "";
      }
    }

    cat.cards.push({ id: cardId, text, speak: text, image, storagePath });
    selectedCategoryId = cat.id;
    resetEditMode();
    saveData();
  } catch (e) {
    console.error(e);
    alert("그림 저장 중 오류가 났어요. Firebase Storage 규칙을 확인해 주세요.");
  }
};

$("saveBoardBtn").onclick = () => {
  data.board = $("boardText").value.trim();
  saveData();
};

$("reverseOrderBtn").onclick = () => {
  reverseOrder = !reverseOrder;
  const btn = $("reverseOrderBtn");
  if (reverseOrder) {
    btn.classList.remove("active");
    btn.title = "현재: 최신 그림이 왼쪽 (시엘이 모드)";
  } else {
    btn.classList.add("active");
    btn.title = "현재: 최신 그림이 오른쪽 (한글 학습 모드)";
  }
  // 기존 카드 순서도 뒤집기
  sentenceCards.reverse();
  renderSentence();
};

$("clearSentenceBtn").onclick = () => {
  sentenceCards = [];
  renderSentence();
};

$("searchInput").oninput = (e) => {
  searchTerm = e.target.value;
  selectedCardId = "";
  renderCards();
};

$("voiceSearchBtn").onclick = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("이 브라우저에서는 음성검색을 지원하지 않아요. Chrome에서 열어주세요.");
    return;
  }

  try {
    const rec = new SpeechRecognition();
    rec.lang = "ko-KR";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    $("voiceSearchBtn").classList.add("listening");
    $("voiceSearchBtn").textContent = "🎙️";

    rec.onresult = (event) => {
      const spoken = event.results?.[0]?.[0]?.transcript || "";
      const text = spoken.trim().replace(/[.!?。]/g, "");
      searchTerm = text;
      selectedCardId = "";
      $("searchInput").value = text;
      renderCards();
    };

    rec.onerror = (event) => {
      console.warn("음성검색 오류:", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        alert("마이크 권한이 필요해요. 주소창의 자물쇠에서 마이크 권한을 허용해 주세요.");
      } else if (event.error === "no-speech") {
        alert("소리가 잘 들리지 않았어요. 다시 눌러 말해 주세요.");
      } else {
        alert("음성검색을 시작하지 못했어요. Chrome에서 다시 시도해 주세요.");
      }
    };

    rec.onend = () => {
      $("voiceSearchBtn").classList.remove("listening");
      $("voiceSearchBtn").textContent = "🎤";
    };

    rec.start();
  } catch (e) {
    console.error(e);
    $("voiceSearchBtn").classList.remove("listening");
    $("voiceSearchBtn").textContent = "🎤";
    alert("음성검색을 시작하지 못했어요. Chrome에서 다시 시도해 주세요.");
  }
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
  if (typeof imported.board !== "string") imported.board = "";
  data = imported;
  saveData();
};

window.addEventListener("resize", updateDots);

async function initFirebase() {
  try {
    const configModule = await import("./firebase-config.js?v=sielPinUpdate20260629");
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, doc, setDoc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const { getStorage, ref: storageRef, uploadString, getDownloadURL, deleteObject } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");

    const app = initializeApp(configModule.firebaseConfig);
    db = getFirestore(app);

    firebaseReady = {
      doc,
      setDoc,
      onSnapshot,
      getStorage,
      storageRef,
      uploadString,
      getDownloadURL,
      deleteObject
    };

    const ref = doc(db, "aac", "siel");

    onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        await uploadToCloudIfReady();
        return;
      }

      const cloud = snap.data().payload;
      if (cloud && Array.isArray(cloud.categories)) {
        if (typeof cloud.board !== "string") cloud.board = "";
        cloud.categories.forEach(cat => {
          if (!cat.icon) cat.icon = categoryIcons[cat.name] || "▫️";
          if (!Array.isArray(cat.cards)) cat.cards = [];
        });
        data = cloud;
        saveLocalOnly();
        render();
        warmUpImageCache();
        syncLatestImagesFromCloud();
      }
    }, (error) => {
      console.error("Firestore 읽기 실패:", error);
    });
  } catch (e) {
    console.error("Firebase 초기화 실패:", e);
  }
}

async function uploadToCloudIfReady() {
  if (!navigator.onLine) {
    updateSyncStatus("오프라인 저장 완료: Wi-Fi 연결 후 자동 동기화됩니다.");
    return;
  }
  if (!firebaseReady || !db) return;

  try {
    const { doc, setDoc } = firebaseReady;
    await setDoc(doc(db, "aac", "siel"), { payload: data, updatedAt: Date.now() });
    updateSyncStatus("클라우드 동기화 완료");
    warmUpImageCache();
    syncLatestImagesFromCloud();
  } catch (e) {
    console.warn("클라우드 저장 실패:", e);
    updateSyncStatus("기기 안에 저장됨: 연결되면 다시 동기화됩니다.");
  }
}

registerServiceWorker().finally(() => {
  initFirebase();
  render();
  warmUpImageCache();
  if (navigator.onLine) setTimeout(syncLatestImagesFromCloud, 1200);
});

window.addEventListener("online", () => {
  updateSyncStatus("Wi-Fi 연결됨: 최신 그림 동기화 준비 중");
  initFirebase()
    .then(() => uploadToCloudIfReady())
    .then(() => syncLatestImagesFromCloud())
    .catch(console.warn);
});

window.addEventListener("offline", () => {
  updateSyncStatus("오프라인 모드: 이 기기에 저장된 그림으로 사용할 수 있어요.");
});
