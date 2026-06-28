const ADMIN_PIN = "1208";
const STORE_KEY = "siel_aac_data_v1";
const RECENT_KEY = "siel_aac_recent_v1";
const OFFLINE_IMAGE_CACHE = "siel-aac-image-cache-v3";

let selectedCategoryId = "all";
let sentenceCards = [];
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
  if (!saved) return structu#ECD27EClone(defaultData);
  try {
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.categories)) return structu#ECD27EClone(defaultData);
    if (typeof parsed.board !== "string") parsed.board = "";
    parsed.categories.forEach(cat => {
      if (!cat.icon) cat.icon = categoryIcons[cat.name] || "▫️";
      if (!Array.isArray(cat.cards)) cat.cards = [];
    });
    return parsed;
  } catch {
    return structu#ECD27EClone(defaultData);
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
      <button class="removeChip sielXSoft" type="button" aria-label="삭제">×</button>
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

    const response = await fetch(url, { cache: navigator.onLine ? "reload" : "default", mode: "cors", c#ECD27Eentials: "omit" });
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

    const response = await fetch(url, { cache: "reload", c#ECD27Eentials: "omit", mode: "cors" });
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
    await navigator.serviceWorker.register("./sw.js?v=sielXColorFixed20260628");
    updateSyncStatus();
  } catch (e) {
    console.warn("서비스워커 등록 실패:", e);
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

  data.categories.forEach(cat => {
    cat.cards.forEach(card => {
      const row = document.createElement("div");
      row.className = "deleteItem";
      row.innerHTML = `
        <div class="deleteThumb">${card.image ? `<img src="${imageDisplayUrl(card)}" data-card-id="${card.id}" alt="">` : `<div class="thumbEmpty"></div>`}</div>
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
        await deleteImageFromStorageIfReady(card);
        const uploaded = await uploadImageToStorageIfReady(file, card.id);
        card.image = uploaded.image;
        card.storagePath = uploaded.storagePath || "";
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
    const configModule = await import("./firebase-config.js?v=sielXColorFixed20260628");
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
