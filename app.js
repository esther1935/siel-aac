const ADMIN_PIN = "1208";
const STORE_KEY = "siel_aac_data_v1";
const RECENT_KEY = "siel_aac_recent_v1";
const OFFLINE_IMAGE_CACHE = "siel-aac-image-cache-v3";

let selectedCategoryId = "all";
let sentenceCards = [];
let searchTerm = "";
let selectedCardId = "";
let editingCardId = "";
let adminCardPage = 1;
const ADMIN_CARD_PAGE_SIZE = 12;
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


function imageDisplayUrl(card) {
  const url = card && card.image ? String(card.image) : "";
  if (!url || url.startsWith("data:")) return url;
  const key = encodeURIComponent(String(card.updatedAt || card.storagePath || card.id || Date.now()));
  return url + (url.includes("?") ? "&" : "?") + "sielImg=" + key;
}
function attachImageRepairHandlers() {
  document.querySelectorAll("img[data-card-id]").forEach(img => {
    if (img.dataset.repairAttached === "1") return;
    img.dataset.repairAttached = "1";
    img.addEventListener("error", () => {
      const id = img.dataset.cardId;
      const all = data.categories.flatMap(cat => cat.cards);
      const card = all.find(c => c.id === id);
      if (card && card.image) img.src = imageDisplayUrl({...card, updatedAt: Date.now()});
    });
  });
}


async function cacheCardImageBothUrls(card) {
  if (!card || !card.image || !("caches" in window)) return;
  try {
    await forceRefreshImageCache(card.image, getCardVersion ? getCardVersion(card) : imageVersionKey(card));
    await forceRefreshImageCache(imageDisplayUrl(card), getCardVersion ? getCardVersion(card) : imageVersionKey(card));
  } catch (e) {
    try {
      await cacheImageUrl(card.image);
      await cacheImageUrl(imageDisplayUrl(card));
    } catch (err) {
      console.warn("선택 그림 캐시 실패:", err);
    }
  }
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
        ${card.image ? `<img src="${imageDisplayUrl(card)}" data-card-id="${card.id}" alt="">` : `<div class="noImage"></div>`}
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

  sentenceText.textContent = sentenceCards.map(c => c.speak || c.text).join(" ");
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
        ${card.image ? `<img src="${imageDisplayUrl(card)}" data-card-id="${card.id}" alt="">` : `<div class="noImage"></div>`}
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
  sentenceCards.push({
    id: card.id,
    text: card.text,
    speak: card.text,
    image: card.image || ""
  });
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

async function forceRefreshImageCache(url, versionKey) {
  if (!url || !("caches" in window)) return false;
  if (!/^https?:/.test(url)) return false;

  try {
    const cache = await caches.open(OFFLINE_IMAGE_CACHE);
    const cacheKey = `${url}#sielVersion=${encodeURIComponent(versionKey || url)}`;

    const cachedVersion = await cache.match(cacheKey);
    if (cachedVersion && !navigator.onLine) return true;

    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter(req => req.url === url || req.url.startsWith(url + "#sielVersion="))
        .map(req => cache.delete(req))
    );

    const response = await fetch(url, { cache: "reload", credentials: "omit", mode: "cors" });
    if (response && response.ok) {
      await cache.put(cacheKey, response.clone());
      await cache.put(url, response.clone());
      return true;
    }
  } catch (e) {
    try {
      const cache = await caches.open(OFFLINE_IMAGE_CACHE);
      const response = await fetch(url, { cache: "reload", mode: "no-cors" });
      if (response && (response.ok || response.type === "opaque")) {
        await cache.put(url, response.clone());
        return true;
      }
    } catch (err) {
      console.warn("최신 이미지 덮어쓰기 실패:", url, err);
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

  setSyncProgress(0, cards.length, "최신 그림 동기화 중");

  let done = 0;
  for (const card of cards) {
    await forceRefreshImageCache(card.image, getCardVersion(card));
    await forceRefreshImageCache(imageDisplayUrl(card), getCardVersion(card));
    done += 1;
    if (done === 1 || done === cards.length || done % 3 === 0) {
      setSyncProgress(done, cards.length, "최신 그림 동기화 중");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  updateSyncStatus("최신 그림으로 업데이트 완료. 이제 Wi-Fi를 꺼도 사용할 수 있어요.");
  requestAnimationFrame(attachImageCacheOnLoad);
}

async function warmUpImageCache() {
  if (!("caches" in window)) return;

  try {
    const urls = [];
    data.categories.forEach(cat => {
      cat.cards.forEach(card => {
        if (card.image && /^https?:/.test(card.image)) urls.push(card.image);
      });
    });

    await Promise.allSettled(urls.slice(0, 700).map(url => cacheImageUrl(url)));
    attachImageCacheOnLoad(); attachImageRepairHandlers();
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
    await navigator.serviceWorker.register("./sw.js?v=sielUploadButtonFix20260628");
    updateSyncStatus();
  } catch (e) {
    console.warn("서비스워커 등록 실패:", e);
  }
}


/* ADMIN SIZE DISPLAY 20260628 */
function formatImageSize(bytes) {
  const n = Number(bytes || 0);
  if (!n || Number.isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function getCardImageSizeText(card) {
  if (!card) return "";
  const size = card.compressedSize || card.imageSize || card.sizeBytes || card.fileSize || card.bytes || 0;
  return formatImageSize(size);
}

function addImageSizeMetaToCard(card, originalFile, uploadFile) {
  if (!card || !uploadFile) return card;
  card.imageSize = uploadFile.size || card.imageSize || 0;
  card.compressedSize = uploadFile.size || card.compressedSize || 0;
  card.originalSize = originalFile && originalFile.size ? originalFile.size : (card.originalSize || 0);
  card.imageType = uploadFile.type || card.imageType || "";
  card.updatedAt = Date.now();
  return card;
}


function applyLastUploadedImageSize(originalFile, uploadFile) {
  try {
    if (!uploadFile || !data || !data.categories) return;
    const currentCat = data.categories.find(c => c.id === selectedCategoryId) || data.categories[0];
    if (!currentCat || !currentCat.cards || !currentCat.cards.length) return;
    const last = currentCat.cards[currentCat.cards.length - 1];
    addImageSizeMetaToCard(last, originalFile, uploadFile);
  } catch (e) {
    console.warn("그림 크기 정보 저장 실패:", e);
  }
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

  const allCards = [];
  data.categories.forEach(cat => {
    cat.cards.forEach(card => allCards.push({ cat, card }));
  });

  const totalPages = Math.max(1, Math.ceil(allCards.length / ADMIN_CARD_PAGE_SIZE));
  if (adminCardPage > totalPages) adminCardPage = totalPages;
  if (adminCardPage < 1) adminCardPage = 1;

  const startIndex = (adminCardPage - 1) * ADMIN_CARD_PAGE_SIZE;
  const pageItems = allCards.slice(startIndex, startIndex + ADMIN_CARD_PAGE_SIZE);

  pageItems.forEach(({ cat, card }) => {
    const row = document.createElement("div");
    row.className = "deleteItem";
    const sizeText = getCardImageSizeText(card);
    row.innerHTML = `
      <div class="deleteThumb">${card.image ? `<img src="${imageDisplayUrl(card)}" data-card-id="${card.id}" alt="">` : `<div class="thumbEmpty"></div>`}</div>
      <button class="editCardBtn" type="button">
        <strong>${escapeHtml(cat.name)} / ${escapeHtml(card.text)}</strong>
        ${sizeText ? `<span class="adminImageSizeText">${escapeHtml(sizeText)}</span>` : ""}
      </button>
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

  const pager = document.createElement("div");
  pager.className = "adminPager";
  pager.innerHTML = `
    <button id="adminPrevPageBtn" type="button" ${adminCardPage <= 1 ? "disabled" : ""}>‹ 이전</button>
    <span>${adminCardPage} / ${totalPages} · 총 ${allCards.length}개</span>
    <button id="adminNextPageBtn" type="button" ${adminCardPage >= totalPages ? "disabled" : ""}>다음 ›</button>
  `;
  del.appendChild(pager);

  const prev = $("adminPrevPageBtn");
  const next = $("adminNextPageBtn");
  if (prev) prev.onclick = () => {
    if (adminCardPage > 1) {
      adminCardPage -= 1;
      renderAdmin();
    }
  };
  if (next) next.onclick = () => {
    if (adminCardPage < totalPages) {
      adminCardPage += 1;
      renderAdmin();
    }
  };

  if ($("boardText")) $("boardText").value = data.board || "";
  if ($("boardView")) $("boardView").textContent = data.board || "게시판 내용이 없습니다.";
  updateSyncStatus();
  requestAnimationFrame(attachImageCacheOnLoad);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

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


/* IMAGE COMPRESS UPLOAD 20260628
   관리자에서 그림을 올릴 때 긴 변을 줄이고 JPEG/WebP로 압축해 업로드합니다.
   PNG 투명 배경은 투명 보존을 위해 PNG로 유지합니다. */
const SIEL_IMAGE_COMPRESS_CONFIG = {
  maxSide: 1100,
  jpegQuality: 0.84,
  webpQuality: 0.82
};

function supportsWebPCompression() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch (e) {
    return false;
  }
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImageFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;

  // SVG/GIF는 애니메이션/벡터 특성 때문에 그대로 둡니다.
  if (file.type.includes("svg") || file.type.includes("gif")) return file;

  try {
    const img = await fileToImage(file);
    const maxSide = SIEL_IMAGE_COMPRESS_CONFIG.maxSide;
    const originalW = img.naturalWidth || img.width;
    const originalH = img.naturalHeight || img.height;

    if (!originalW || !originalH) return file;

    const scale = Math.min(1, maxSide / Math.max(originalW, originalH));
    const targetW = Math.max(1, Math.round(originalW * scale));
    const targetH = Math.max(1, Math.round(originalH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const isPng = file.type === "image/png";
    const isLikelyTransparent = isPng;

    // 사진/일러스트는 흰 배경 JPEG/WebP가 용량 효율이 좋습니다.
    if (!isLikelyTransparent) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);

    let outputType = "image/jpeg";
    let quality = SIEL_IMAGE_COMPRESS_CONFIG.jpegQuality;
    let ext = "jpg";

    // WebP 지원 브라우저에서는 더 작게 저장합니다. 단, PNG는 투명 보존을 위해 PNG 유지.
    if (!isLikelyTransparent && supportsWebPCompression()) {
      outputType = "image/webp";
      quality = SIEL_IMAGE_COMPRESS_CONFIG.webpQuality;
      ext = "webp";
    } else if (isLikelyTransparent) {
      outputType = "image/png";
      quality = undefined;
      ext = "png";
    }

    let blob = await canvasToBlob(canvas, outputType, quality);
    if (!blob) return file;

    // PNG 투명 이미지는 압축 효과가 작을 수 있으므로 더 커지면 원본 유지
    if (blob.size >= file.size && file.size < 900 * 1024) {
      return file;
    }

    const originalName = (file.name || "image").replace(/\.[^.]+$/, "");
    const compressedFile = new File([blob], `${originalName}_siel.${ext}`, {
      type: outputType,
      lastModified: Date.now()
    });

    compressedFile.sielOriginalSize = file.size;
    compressedFile.sielCompressedSize = compressedFile.size;

    const saved = file.size ? Math.round((1 - compressedFile.size / file.size) * 100) : 0;
    console.log(`시엘 AAC 이미지 압축: ${Math.round(file.size / 1024)}KB → ${Math.round(compressedFile.size / 1024)}KB (${saved}% 절감)`);

    return compressedFile;
  } catch (e) {
    console.warn("이미지 압축 실패, 원본으로 업로드합니다:", e);
    return file;
  }
}

function showCompressResult(originalFile, uploadFile) {
  try {
    if (!originalFile || !uploadFile || originalFile === uploadFile) return;
    const before = Math.round(originalFile.size / 1024);
    const after = Math.round(uploadFile.size / 1024);
    const saved = originalFile.size ? Math.max(0, Math.round((1 - uploadFile.size / originalFile.size) * 100)) : 0;
    const msg = `그림 압축 완료: ${before}KB → ${after}KB (${saved}% 절감)`;
    if (typeof updateSyncStatus === "function") updateSyncStatus(msg);
    else console.log(msg);
  } catch (e) {}
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

$("menuBtn").onclick = () => $("adminDialog").showModal();
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
  const originalFile = $("imageInput").files[0];
  const file = await compressImageFile(originalFile);
  showCompressResult(originalFile, file);
  window.__sielLastOriginalFile = originalFile;
  window.__sielLastUploadFile = file;

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
  if (window.__sielLastUploadFile) addImageSizeMetaToCard(cat.cards[cat.cards.length - 1], window.__sielLastOriginalFile, window.__sielLastUploadFile);
      }

      card.text = text;
      card.speak = text;

      if (file) {
        await deleteImageFromStorageIfReady(card);
        const uploaded = await uploadImageToStorageIfReady(file, card.id);
        card.image = uploaded.image;
        card.storagePath = uploaded.storagePath || "";
        addImageSizeMetaToCard(card, originalFile, file);
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
      const uploaded = await uploadImageToStorageIfReady(file, cardId);
      image = uploaded.image;
      storagePath = uploaded.storagePath || "";
    }

    const newCard = { id: cardId, text, speak: text, image, storagePath };
    if (file) addImageSizeMetaToCard(newCard, originalFile, file);
    cat.cards.push(newCard);
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
  const originalFile = e.target.files[0];
  const file = await compressImageFile(originalFile);
  showCompressResult(originalFile, file);
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
    const configModule = await import("./firebase-config.js?v=sielUploadButtonFix20260628");
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


function hardFixPwaImageLayout() {
  const fixOne = (card, imageSelector, labelSelector) => {
    if (!card) return;
    const imgBox = card.querySelector(imageSelector);
    const label = card.querySelector(labelSelector);
    if (!imgBox || !label) return;

    const h = card.clientHeight || card.getBoundingClientRect().height || 0;
    if (!h) return;

    const labelH = Math.max(28, Math.min(52, Math.round(h * 0.22)));
    const imageH = Math.max(40, h - labelH - 14);

    card.style.display = "block";
    card.style.position = "relative";
    card.style.overflow = "hidden";
    card.style.boxSizing = "border-box";

    imgBox.style.position = "absolute";
    imgBox.style.left = "8px";
    imgBox.style.right = "8px";
    imgBox.style.top = "8px";
    imgBox.style.height = imageH + "px";
    imgBox.style.display = "flex";
    imgBox.style.alignItems = "center";
    imgBox.style.justifyContent = "center";
    imgBox.style.overflow = "hidden";
    imgBox.style.padding = "0";
    imgBox.style.boxSizing = "border-box";

    label.style.position = "absolute";
    label.style.left = "4px";
    label.style.right = "4px";
    label.style.bottom = "6px";
    label.style.height = labelH + "px";
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.justifyContent = "center";
    label.style.textAlign = "center";
    label.style.overflow = "hidden";
    label.style.lineHeight = "1.05";

    imgBox.querySelectorAll("img").forEach(img => {
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.objectFit = "contain";
      img.style.objectPosition = "center center";
      img.style.display = "block";
    });
  };

  document.querySelectorAll(".card").forEach(card => fixOne(card, ".cardImageBox", ".label"));
  document.querySelectorAll(".sentenceChip").forEach(card => fixOne(card, ".sentenceImageBox", ".sentenceLabel"));
}

window.addEventListener("resize", () => setTimeout(hardFixPwaImageLayout, 80));
window.addEventListener("orientationchange", () => setTimeout(hardFixPwaImageLayout, 250));
setInterval(hardFixPwaImageLayout, 1200);

requestAnimationFrame(hardFixPwaImageLayout);


if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!sessionStorage.getItem("siel_sw_reloaded_once")) {
      sessionStorage.setItem("siel_sw_reloaded_once", "1");
      window.location.reload();
    }
  });
}


document.addEventListener("click", (event) => {
  const cardEl = event.target.closest(".card");
  if (!cardEl || !navigator.onLine) return;
  const img = cardEl.querySelector("img[data-card-id]");
  const id = img && img.dataset.cardId;
  if (!id) return;
  const allCards = data.categories.flatMap(cat => cat.cards);
  const card = allCards.find(c => c.id === id);
  if (card) cacheCardImageBothUrls(card);
}, true);


function repairSentenceChipImagesToDisplayUrl() {
  document.querySelectorAll(".sentenceChip img[data-card-id]").forEach(img => {
    const id = img.dataset.cardId;
    const card = sentenceCards.find(c => c.id === id) || data.categories.flatMap(cat => cat.cards).find(c => c.id === id);
    if (!card) return;
    const wanted = imageDisplayUrl(card);
    if (wanted && img.getAttribute("src") !== wanted) {
      img.setAttribute("src", wanted);
    }
  });
}
setInterval(repairSentenceChipImagesToDisplayUrl, 800);


function refreshAdminImageSizeLabels() {
  try {
    const allCards = data.categories.flatMap(cat => cat.cards.map(card => ({...card, __catName: cat.name})));
    const adminRoots = document.querySelectorAll(".adminPanel, .adminContent, .menuPanel, .modal, body");
    adminRoots.forEach(root => {
      root.querySelectorAll("img").forEach(img => {
        const src = img.getAttribute("src") || "";
        if (!src) return;
        const card = allCards.find(c => c.image && (src.includes(c.image) || c.image.includes(src.split("?")[0]) || src.split("?")[0] === c.image.split("?")[0]));
        if (!card) return;

        const row = img.closest(".adminImageRow, .deleteRow, .imageRow, li, .adminItem, .manageItem, .pictureItem, div");
        if (!row || row.querySelector(".adminImageSizeText")) return;

        const sizeText = getCardImageSizeText(card);
        if (!sizeText) return;

        const info = document.createElement("span");
        info.className = "adminImageSizeText";
        info.textContent = sizeText;
        info.title = `그림 용량: ${sizeText}`;

        // 이름 텍스트 근처에 붙이기
        const strong = row.querySelector("strong, b, .name, .title, .label");
        if (strong && strong.parentElement) {
          strong.insertAdjacentElement("afterend", info);
        } else {
          row.appendChild(info);
        }
      });
    });
  } catch (e) {
    console.warn("관리자 그림 크기 표시 실패:", e);
  }
}

setInterval(refreshAdminImageSizeLabels, 1200);
document.addEventListener("click", () => setTimeout(refreshAdminImageSizeLabels, 250), true);


/* ADMIN FLOW FIX 20260628 */
function showAdminPasswordOnly() {
  const dialog = $("adminDialog");
  const pin = $("pinInput");
  const login = $("loginBtn");
  const menu = document.querySelector("#adminDialog .adminMenu");
  const panel = $("adminPanel");
  const upload = $("uploadPanel");
  const board = $("boardPanel");

  if (pin) {
    pin.value = "";
    pin.classList.remove("hidden");
    pin.style.display = "";
  }
  if (login) {
    login.classList.remove("hidden");
    login.style.display = "";
    login.textContent = "확인";
  }
  if (menu) menu.style.display = "none";
  if (panel) {
    panel.classList.add("hidden");
    panel.style.display = "none";
  }
  if (upload) {
    upload.classList.remove("hidden");
    upload.style.display = "none";
  }
  if (board) {
    board.classList.add("hidden");
    board.style.display = "none";
  }
}

function showAdminMenuOnly() {
  const pin = $("pinInput");
  const login = $("loginBtn");
  const menu = document.querySelector("#adminDialog .adminMenu");
  const panel = $("adminPanel");
  const upload = $("uploadPanel");
  const board = $("boardPanel");

  if (pin) pin.style.display = "none";
  if (login) login.style.display = "none";
  if (menu) menu.style.display = "grid";
  if (panel) {
    panel.classList.add("hidden");
    panel.style.display = "none";
  }
  if (upload) upload.style.display = "none";
  if (board) board.style.display = "none";
}

function showAdminUploadOnly() {
  const menu = document.querySelector("#adminDialog .adminMenu");
  const panel = $("adminPanel");
  const upload = $("uploadPanel");
  const board = $("boardPanel");
  if (menu) menu.style.display = "grid";
  if (panel) {
    panel.classList.remove("hidden");
    panel.style.display = "";
  }
  if (upload) {
    upload.classList.remove("hidden");
    upload.style.display = "";
  }
  if (board) {
    board.classList.add("hidden");
    board.style.display = "none";
  }
  adminCardPage = 1;
  renderAdmin();
}

function showAdminBoardOnly() {
  const menu = document.querySelector("#adminDialog .adminMenu");
  const panel = $("adminPanel");
  const upload = $("uploadPanel");
  const board = $("boardPanel");
  if (menu) menu.style.display = "grid";
  if (panel) {
    panel.classList.remove("hidden");
    panel.style.display = "";
  }
  if (upload) {
    upload.classList.add("hidden");
    upload.style.display = "none";
  }
  if (board) {
    board.classList.remove("hidden");
    board.style.display = "";
  }
}

function wireAdminFlowFix() {
  const menuBtn = $("menuBtn");
  const login = $("loginBtn");
  const pin = $("pinInput");
  const showUpload = $("showUploadBtn");
  const showBoard = $("showBoardBtn");

  if (menuBtn && menuBtn.dataset.adminFlowFixed !== "1") {
    menuBtn.dataset.adminFlowFixed = "1";
    menuBtn.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      $("adminDialog").showModal();
      showAdminPasswordOnly();
      setTimeout(() => $("pinInput") && $("pinInput").focus(), 60);
    };
  }

  if (login && login.dataset.adminFlowFixed !== "1") {
    login.dataset.adminFlowFixed = "1";
    login.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if ($("pinInput").value === ADMIN_PIN || $("pinInput").value === "1935") {
        showAdminMenuOnly();
      } else {
        alert("PIN이 달라요.");
        $("pinInput").value = "";
        $("pinInput").focus();
      }
    };
  }

  if (pin && pin.dataset.adminFlowFixed !== "1") {
    pin.dataset.adminFlowFixed = "1";
    pin.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        login.click();
      }
    });
  }

  if (showUpload && showUpload.dataset.adminFlowFixed !== "1") {
    showUpload.dataset.adminFlowFixed = "1";
    showUpload.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      showAdminUploadOnly();
    };
  }

  if (showBoard && showBoard.dataset.adminFlowFixed !== "1") {
    showBoard.dataset.adminFlowFixed = "1";
    showBoard.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      showAdminBoardOnly();
    };
  }
}

setInterval(wireAdminFlowFix, 500);
document.addEventListener("DOMContentLoaded", wireAdminFlowFix);


/* ROLE ADMIN FINAL 20260628
   역할별 관리자:
   - 엄마: 전체 관리자 진입
   - 학교/늘봄/언어치료/사회성치료/교회: 해당 카테고리에 업로드만 가능
   - 제한 관리자는 삭제/카테고리관리/백업을 볼 수 없음
*/

const SIEL_ROLE_ADMINS = [
  { id: "mom", label: "엄마", pin: "1935", type: "full", category: "" },
  { id: "school", label: "학교", pin: "1001", type: "limited", category: "학교" },
  { id: "neulbom", label: "늘봄", pin: "1002", type: "limited", category: "늘봄" },
  { id: "speech", label: "언어치료", pin: "1003", type: "limited", category: "언어치료" },
  { id: "social", label: "사회성치료", pin: "1004", type: "limited", category: "사회성치료" },
  { id: "church", label: "교회", pin: "1005", type: "limited", category: "교회" }
];

let sielCurrentRoleAdmin = null;

function sielRoleEscape(text) {
  return String(text || "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}

function sielFindCategoryByName(name) {
  return data.categories.find(cat => (cat.name || "").trim() === name);
}

function sielEnsureCategory(name) {
  let cat = sielFindCategoryByName(name);
  if (!cat) {
    cat = { id: crypto.randomUUID(), name, icon: (categoryIcons && categoryIcons[name]) || "▫️", cards: [] };
    data.categories.push(cat);
    saveData();
  }
  return cat;
}

function sielRoleOverlay() {
  let el = document.getElementById("sielRoleOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "sielRoleOverlay";
    el.className = "sielRoleOverlay";
    document.body.appendChild(el);
  }
  return el;
}

function sielCloseRoleOverlay() {
  const el = document.getElementById("sielRoleOverlay");
  if (el) el.remove();
}

function sielShowRoleLogin() {
  const el = sielRoleOverlay();
  el.innerHTML = `
    <div class="sielRoleCard">
      <button class="sielRoleClose" type="button">×</button>
      <h2>관리자 로그인</h2>
      <p class="sielRoleSub">사용할 관리자 역할을 선택해 주세요.</p>
      <div class="sielRoleList">
        ${SIEL_ROLE_ADMINS.map(role => `
          <button class="sielRoleSelectBtn" type="button" data-role="${role.id}">
            ${sielRoleEscape(role.label)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
  el.querySelector(".sielRoleClose").onclick = sielCloseRoleOverlay;
  el.querySelectorAll(".sielRoleSelectBtn").forEach(btn => {
    btn.onclick = () => {
      const role = SIEL_ROLE_ADMINS.find(r => r.id === btn.dataset.role);
      sielShowRolePin(role);
    };
  });
}

function sielShowRolePin(role) {
  const el = sielRoleOverlay();
  el.innerHTML = `
    <div class="sielRoleCard">
      <button class="sielRoleClose" type="button">×</button>
      <button class="sielRoleBack" type="button">‹ 역할 선택</button>
      <h2>${sielRoleEscape(role.label)} 관리자</h2>
      <p class="sielRoleSub">비밀번호를 입력해 주세요.</p>
      <input class="sielRolePinInput" type="password" inputmode="numeric" autocomplete="off" placeholder="비밀번호" />
      <button class="sielRolePrimary" type="button">확인</button>
      <p class="sielRoleError"></p>
    </div>
  `;
  const input = el.querySelector(".sielRolePinInput");
  const error = el.querySelector(".sielRoleError");
  el.querySelector(".sielRoleClose").onclick = sielCloseRoleOverlay;
  el.querySelector(".sielRoleBack").onclick = sielShowRoleLogin;
  const submit = () => {
    if (input.value === role.pin) {
      sielCurrentRoleAdmin = role;
      if (role.type === "full") {
        sielShowFullAdminMenu();
      } else {
        sielShowLimitedUploader(role);
      }
    } else {
      error.textContent = "비밀번호가 맞지 않습니다.";
      input.value = "";
      input.focus();
    }
  };
  el.querySelector(".sielRolePrimary").onclick = submit;
  input.onkeydown = e => { if (e.key === "Enter") submit(); };
  setTimeout(() => input.focus(), 50);
}

function sielShowFullAdminMenu() {
  const el = sielRoleOverlay();
  el.innerHTML = `
    <div class="sielRoleCard">
      <button class="sielRoleClose" type="button">×</button>
      <h2>엄마 관리자</h2>
      <button class="sielRoleMenuBtn" type="button" data-full="open">전체 관리자 열기</button>
      <button class="sielRoleMenuBtn" type="button" data-full="pending">승인대기 보기</button>
      <button class="sielRoleMenuBtn" type="button" data-full="roles">권한 안내</button>
    </div>
  `;
  el.querySelector(".sielRoleClose").onclick = sielCloseRoleOverlay;
  el.querySelector('[data-full="open"]').onclick = () => {
    sielCloseRoleOverlay();
    const dialog = document.getElementById("adminDialog");
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
      const pin = document.getElementById("pinInput");
      const login = document.getElementById("loginBtn");
      if (pin) pin.value = "1935";
      if (login) setTimeout(() => login.click(), 80);
    }
  };
  el.querySelector('[data-full="pending"]').onclick = sielShowPendingUploads;
  el.querySelector('[data-full="roles"]').onclick = sielShowRoleInfo;
}

function sielPendingUploads() {
  return JSON.parse(localStorage.getItem("siel_pending_uploads_v1") || "[]");
}

function sielSavePendingUploads(items) {
  localStorage.setItem("siel_pending_uploads_v1", JSON.stringify(items || []));
}

function sielShowRoleInfo() {
  const el = sielRoleOverlay();
  el.innerHTML = `
    <div class="sielRoleCard sielRoleWide">
      <button class="sielRoleClose" type="button">×</button>
      <button class="sielRoleBack" type="button">‹ 엄마 메뉴</button>
      <h2>권한 안내</h2>
      <div class="sielRoleInfo">
        <p><b>엄마</b> : 전체 관리자</p>
        <p><b>학교</b> : 학교 카테고리 업로드만 가능</p>
        <p><b>늘봄</b> : 늘봄 카테고리 업로드만 가능</p>
        <p><b>언어치료</b> : 언어치료 카테고리 업로드만 가능</p>
        <p><b>사회성치료</b> : 사회성치료 카테고리 업로드만 가능</p>
        <p><b>교회</b> : 교회 카테고리 업로드만 가능</p>
      </div>
    </div>
  `;
  el.querySelector(".sielRoleClose").onclick = sielCloseRoleOverlay;
  el.querySelector(".sielRoleBack").onclick = sielShowFullAdminMenu;
}

async function sielCompressForRole(file) {
  if (typeof compressImageFile === "function") return await compressImageFile(file);
  return file;
}

function sielFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sielShowLimitedUploader(role) {
  const el = sielRoleOverlay();
  el.innerHTML = `
    <div class="sielRoleCard sielRoleWide">
      <button class="sielRoleClose" type="button">×</button>
      <button class="sielRoleBack" type="button">‹ 역할 선택</button>
      <h2>${sielRoleEscape(role.label)} 업로드</h2>
      <p class="sielRoleSub">${sielRoleEscape(role.category)} 카테고리에만 사진을 올릴 수 있습니다.</p>

      <label class="sielRoleLabel">사진 찍기/선택</label>
      <input class="sielRoleFile" type="file" accept="image/*" capture="environment" />

      <label class="sielRoleLabel">그림 이름</label>
      <input class="sielRoleName" type="text" placeholder="예: 급식실" />

      <button class="sielRolePrimary" type="button">승인대기로 저장</button>
      <p class="sielRoleSub sielRoleStatus"></p>
    </div>
  `;
  const fileInput = el.querySelector(".sielRoleFile");
  const nameInput = el.querySelector(".sielRoleName");
  const status = el.querySelector(".sielRoleStatus");
  el.querySelector(".sielRoleClose").onclick = sielCloseRoleOverlay;
  el.querySelector(".sielRoleBack").onclick = sielShowRoleLogin;

  el.querySelector(".sielRolePrimary").onclick = async () => {
    const originalFile = fileInput.files[0];
    const text = nameInput.value.trim();
    if (!originalFile || !text) {
      status.textContent = "사진과 그림 이름을 입력해 주세요.";
      return;
    }

    status.textContent = "압축 중입니다...";
    try {
      const file = await sielCompressForRole(originalFile);
      const dataUrl = await sielFileToDataUrl(file);
      const pending = sielPendingUploads();
      pending.push({
        id: crypto.randomUUID(),
        roleId: role.id,
        roleLabel: role.label,
        category: role.category,
        text,
        image: dataUrl,
        imageSize: file.size || 0,
        originalSize: originalFile.size || 0,
        imageType: file.type || "",
        createdAt: Date.now()
      });
      sielSavePendingUploads(pending);
      const kb = file.size ? Math.round(file.size / 1024) + "KB" : "";
      status.textContent = `승인대기에 저장되었습니다. ${kb}`;
      fileInput.value = "";
      nameInput.value = "";
    } catch (e) {
      console.error(e);
      status.textContent = "저장 중 오류가 났습니다.";
    }
  };
}

function sielShowPendingUploads() {
  const pending = sielPendingUploads();
  const el = sielRoleOverlay();
  el.innerHTML = `
    <div class="sielRoleCard sielRoleWide">
      <button class="sielRoleClose" type="button">×</button>
      <button class="sielRoleBack" type="button">‹ 엄마 메뉴</button>
      <h2>승인대기</h2>
      <div class="sielPendingList">
        ${pending.length ? pending.map(item => `
          <div class="sielPendingItem" data-id="${item.id}">
            <img src="${item.image}" alt="" />
            <div class="sielPendingInfo">
              <b>${sielRoleEscape(item.category)} / ${sielRoleEscape(item.text)}</b>
              <span>${item.imageSize ? Math.round(item.imageSize / 1024) + "KB" : ""}</span>
            </div>
            <button type="button" data-action="approve">승인</button>
            <button type="button" data-action="delete">삭제</button>
          </div>
        `).join("") : `<p class="sielRoleSub">승인대기 사진이 없습니다.</p>`}
      </div>
    </div>
  `;
  el.querySelector(".sielRoleClose").onclick = sielCloseRoleOverlay;
  el.querySelector(".sielRoleBack").onclick = sielShowFullAdminMenu;

  el.querySelectorAll(".sielPendingItem").forEach(row => {
    const id = row.dataset.id;
    const item = pending.find(x => x.id === id);
    row.querySelector('[data-action="approve"]').onclick = async () => {
      const cat = sielEnsureCategory(item.category);
      const card = {
        id: crypto.randomUUID(),
        text: item.text,
        speak: item.text,
        image: item.image,
        storagePath: "",
        imageSize: item.imageSize || 0,
        compressedSize: item.imageSize || 0,
        originalSize: item.originalSize || 0,
        imageType: item.imageType || "",
        createdBy: item.roleLabel || "",
        updatedAt: Date.now()
      };
      cat.cards.push(card);
      saveData();
      sielSavePendingUploads(sielPendingUploads().filter(x => x.id !== id));
      sielShowPendingUploads();
    };
    row.querySelector('[data-action="delete"]').onclick = () => {
      if (!confirm("이 승인대기 사진을 삭제할까요?")) return;
      sielSavePendingUploads(sielPendingUploads().filter(x => x.id !== id));
      sielShowPendingUploads();
    };
  });
}

function sielWireRoleEntry() {
  const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
  const candidates = buttons.filter(btn => {
    const t = (btn.textContent || "").trim();
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    const cls = (btn.className || "").toString().toLowerCase();
    const id = (btn.id || "").toLowerCase();
    return t === "☰" || t === "≡" || t.includes("☰") || aria.includes("menu") || aria.includes("메뉴") || cls.includes("hamburger") || id.includes("menu");
  });

  candidates.forEach(btn => {
    if (btn.dataset.sielRoleHooked === "1") return;
    btn.dataset.sielRoleHooked = "1";
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      sielShowRoleLogin();
    }, true);
  });
}

setInterval(sielWireRoleEntry, 800);
document.addEventListener("DOMContentLoaded", sielWireRoleEntry);


/* UPLOAD BUTTON FIX 20260628
   엄마 관리자 → 그림 올리기 버튼을 눌렀을 때 다시 비밀번호로 돌아가지 않고
   기존 adminDialog의 그림 올리기(uploadPanel)를 바로 열도록 보정합니다. */

function sielOpenUploadPanelDirect() {
  const roleOverlay = document.getElementById("sielRoleOverlay");
  if (roleOverlay) roleOverlay.remove();

  const dialog = document.getElementById("adminDialog");
  if (!dialog) {
    alert("관리자 화면을 찾지 못했습니다.");
    return;
  }

  try {
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "open");
  } catch (e) {
    dialog.setAttribute("open", "open");
  }

  const pin = document.getElementById("pinInput");
  const login = document.getElementById("loginBtn");
  const menu = dialog.querySelector(".adminMenu");
  const panel = document.getElementById("adminPanel");
  const upload = document.getElementById("uploadPanel");
  const board = document.getElementById("boardPanel");

  if (pin) {
    pin.value = "";
    pin.classList.add("hidden");
    pin.style.display = "none";
  }
  if (login) {
    login.classList.add("hidden");
    login.style.display = "none";
  }
  if (menu) {
    menu.classList.remove("hidden");
    menu.style.display = "grid";
  }
  if (panel) {
    panel.classList.remove("hidden");
    panel.style.display = "";
  }
  if (upload) {
    upload.classList.remove("hidden");
    upload.style.display = "";
  }
  if (board) {
    board.classList.add("hidden");
    board.style.display = "none";
  }

  if (typeof renderAdmin === "function") {
    setTimeout(() => renderAdmin(), 50);
  }
}

function sielOpenBoardPanelDirect() {
  const roleOverlay = document.getElementById("sielRoleOverlay");
  if (roleOverlay) roleOverlay.remove();

  const dialog = document.getElementById("adminDialog");
  if (!dialog) return;

  try {
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "open");
  } catch (e) {
    dialog.setAttribute("open", "open");
  }

  const pin = document.getElementById("pinInput");
  const login = document.getElementById("loginBtn");
  const menu = dialog.querySelector(".adminMenu");
  const panel = document.getElementById("adminPanel");
  const upload = document.getElementById("uploadPanel");
  const board = document.getElementById("boardPanel");

  if (pin) {
    pin.value = "";
    pin.classList.add("hidden");
    pin.style.display = "none";
  }
  if (login) {
    login.classList.add("hidden");
    login.style.display = "none";
  }
  if (menu) {
    menu.classList.remove("hidden");
    menu.style.display = "grid";
  }
  if (panel) {
    panel.classList.remove("hidden");
    panel.style.display = "";
  }
  if (upload) {
    upload.classList.add("hidden");
    upload.style.display = "none";
  }
  if (board) {
    board.classList.remove("hidden");
    board.style.display = "";
  }
}

function sielShowFullAdminMenuFixed() {
  const el = sielRoleOverlay ? sielRoleOverlay() : document.getElementById("sielRoleOverlay");
  if (!el) return;

  el.innerHTML = `
    <div class="sielRoleCard">
      <button class="sielRoleClose" type="button">×</button>
      <h2>엄마 관리자</h2>
      <button class="sielRoleMenuBtn" type="button" data-fixed-admin="upload">그림 올리기</button>
      <button class="sielRoleMenuBtn" type="button" data-fixed-admin="board">게시판</button>
      <button class="sielRoleMenuBtn" type="button" data-fixed-admin="pending">승인대기 보기</button>
    </div>
  `;

  const close = el.querySelector(".sielRoleClose");
  if (close) close.onclick = () => {
    const overlay = document.getElementById("sielRoleOverlay");
    if (overlay) overlay.remove();
  };

  const uploadBtn = el.querySelector('[data-fixed-admin="upload"]');
  const boardBtn = el.querySelector('[data-fixed-admin="board"]');
  const pendingBtn = el.querySelector('[data-fixed-admin="pending"]');

  if (uploadBtn) uploadBtn.onclick = sielOpenUploadPanelDirect;
  if (boardBtn) boardBtn.onclick = sielOpenBoardPanelDirect;
  if (pendingBtn) {
    pendingBtn.onclick = () => {
      if (typeof sielShowPendingUploads === "function") sielShowPendingUploads();
      else alert("승인대기 기능을 찾지 못했습니다.");
    };
  }
}

// 기존 역할별 관리자 함수가 있으면 엄마 메뉴만 안전하게 덮어씁니다.
try {
  window.sielOpenUploadPanelDirect = sielOpenUploadPanelDirect;
  window.sielOpenBoardPanelDirect = sielOpenBoardPanelDirect;
  window.sielShowFullAdminMenu = sielShowFullAdminMenuFixed;
} catch (e) {}

// 혹시 기존 '그림 올리기' 버튼이 남아 있어도 클릭 시 바로 uploadPanel을 열도록 보정
document.addEventListener("click", function(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const text = (btn.textContent || "").trim();
  if (text === "그림 올리기" && btn.closest("#sielRoleOverlay")) {
    e.preventDefault();
    e.stopPropagation();
    sielOpenUploadPanelDirect();
  }
}, true);
