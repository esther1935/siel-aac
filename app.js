const ADMIN_PIN = "1208";
const STORE_KEY = "siel_aac_data_v1";
const RECENT_KEY = "siel_aac_recent_v1";

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
  if (!saved) return structuredClone(defaultData);
  try {
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.categories)) return structuredClone(defaultData);
    if (typeof parsed.board !== "string") parsed.board = "";
    parsed.categories.forEach(cat => {
      if (!cat.icon) cat.icon = categoryIcons[cat.name] || "▫️";
      if (!Array.isArray(cat.cards)) cat.cards = [];
      cat.cards.forEach(card => {
        card.speak = card.text || "";
      });
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
    cat.cards.forEach(card => {
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

  $("boardText").value = data.board || "";
  $("boardView").textContent = data.board || "게시판 내용이 없습니다.";
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
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    }
  } catch (e) {
    console.warn("캐시 정리 실패:", e);
  }
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
    const configModule = await import("./firebase-config.js?v=adminFinal20260627");
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
      }
    }, (error) => {
      console.error("Firestore 읽기 실패:", error);
    });
  } catch (e) {
    console.error("Firebase 초기화 실패:", e);
  }
}

async function uploadToCloudIfReady() {
  if (!firebaseReady || !db) return;
  const { doc, setDoc } = firebaseReady;
  await setDoc(doc(db, "aac", "siel"), { payload: data, updatedAt: Date.now() });
}

clearOldCachesOnce().finally(() => {
  initFirebase();
  render();
});
