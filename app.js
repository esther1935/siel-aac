const ADMIN_PIN = "1208";
const STORE_KEY = "siel_aac_data_v1";
const RECENT_KEY = "siel_aac_recent_v1";

let selectedCategoryId = "all";
let sentenceCards = [];
let searchTerm = "";
let firebaseReady = false;
let db = null;

const $ = (id) => document.getElementById(id);

function setStatus(message) {
  const el = $("statusBar");
  if (el) el.textContent = message;
}

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
  "놀이": "🧸",
  "가족": "👨‍👩‍👦",
  "한글": "가",
  "숫자": "123"
};

const defaultData = {
  categories: [
    { id: crypto.randomUUID(), name: "마이크", icon: "🎤", cards: [] },
    { id: crypto.randomUUID(), name: "집", icon: "🏠", cards: [] },
    { id: crypto.randomUUID(), name: "학교", icon: "🏫", cards: [] },
    { id: crypto.randomUUID(), name: "늘봄", icon: "🌱", cards: [] },
    { id: crypto.randomUUID(), name: "기관", icon: "🏢", cards: [] },
    { id: crypto.randomUUID(), name: "병원", icon: "🏥", cards: [] },
    { id: crypto.randomUUID(), name: "감정", icon: "😊", cards: [
      { id: crypto.randomUUID(), text: "쉬고 싶어요", speak: "쉬고 싶어요", image: "" },
      { id: crypto.randomUUID(), text: "도와주세요", speak: "도와주세요", image: "" },
      { id: crypto.randomUUID(), text: "졸려요", speak: "졸려요", image: "" },
      { id: crypto.randomUUID(), text: "배고파요", speak: "배고파요", image: "" }
    ] },
    { id: crypto.randomUUID(), name: "음식", icon: "🍊", cards: [] },
    { id: crypto.randomUUID(), name: "교회", icon: "⛪", cards: [] },
    { id: crypto.randomUUID(), name: "나들이", icon: "🚗", cards: [] },
    { id: crypto.randomUUID(), name: "놀이", icon: "🧸", cards: [] },
    { id: crypto.randomUUID(), name: "가족", icon: "👨‍👩‍👦", cards: [] },
    { id: crypto.randomUUID(), name: "한글", icon: "가", cards: [] },
    { id: crypto.randomUUID(), name: "숫자", icon: "123", cards: [] }
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
    return parsed;
  } catch {
    return structuredClone(defaultData);
  }
}

function saveLocalOnly() {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function saveData() {
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
    chip.innerHTML = `
      ${card.image ? `<img src="${card.image}" alt="">` : `<div class="miniNoImage"></div>`}
      <span>${escapeHtml(card.text)}</span>
      <b>×</b>
    `;
    chip.onclick = () => {
      sentenceCards.splice(index, 1);
      renderSentence();
    };
    area.appendChild(chip);
  });

  sentenceText.textContent = sentenceCards.map(c => c.speak || c.text).join(" ");
}

function renderCategoryBar() {
  const bar = $("categoryBar");
  bar.innerHTML = "";

  const all = document.createElement("button");
  all.className = selectedCategoryId === "all" ? "catTab active" : "catTab";
  all.innerHTML = `<span class="catIcon">🌈</span><span>전체</span>`;
  all.onclick = () => {
    selectedCategoryId = "all";
    searchTerm = "";
    const input = $("searchInput");
    if (input) input.value = "";
    render();
  };
  bar.appendChild(all);

  data.categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = selectedCategoryId === cat.id ? "catTab active" : "catTab";
    const icon = cat.icon || categoryIcons[cat.name] || "▫️";
    btn.innerHTML = `<span class="catIcon">${escapeHtml(icon)}</span><span>${escapeHtml(cat.name)}</span>`;
    btn.onclick = () => {
      selectedCategoryId = cat.id;
      searchTerm = "";
      const input = $("searchInput");
      if (input) input.value = "";
      render();
    };
    bar.appendChild(btn);
  });
}

function getVisibleCards() {
  let cards;
  if (selectedCategoryId === "all") {
    cards = data.categories.flatMap(cat => cat.cards.map(card => ({ ...card, categoryName: cat.name })));
  } else {
    const cat = data.categories.find(c => c.id === selectedCategoryId);
    cards = cat ? cat.cards.map(card => ({ ...card, categoryName: cat.name })) : [];
  }

  if (searchTerm.trim()) {
    const q = searchTerm.trim().toLowerCase();
    cards = cards.filter(card =>
      (card.text || "").toLowerCase().includes(q) ||
      (card.speak || "").toLowerCase().includes(q) ||
      (card.categoryName || "").toLowerCase().includes(q)
    );
  }

  return cards;
}

function renderCards() {
  const scroller = $("cardScroller");
  scroller.innerHTML = "";

  const cards = getVisibleCards();

  if (cards.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cardsEmpty";
    empty.textContent = "아직 그림이 없어요. 관리에서 그림을 추가해 주세요.";
    scroller.appendChild(empty);
    return;
  }

  cards.forEach(card => {
    const el = document.createElement("button");
    el.className = "card";
    el.innerHTML = `
      ${card.image ? `<img src="${card.image}" alt="">` : `<div class="noImage"></div>`}
      <div class="label">${escapeHtml(card.text)}</div>
    `;
    el.onclick = () => addToSentence(card);
    scroller.appendChild(el);
  });
}

function addToSentence(card) {
  sentenceCards.push({
    id: card.id,
    text: card.text,
    speak: card.speak || card.text,
    image: card.image || ""
  });
  addRecent(card);
  renderSentence();
  speak(card.speak || card.text);
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
        ${card.image ? `<img src="${card.image}" alt="">` : `<div></div>`}
        <strong>${escapeHtml(cat.name)} / ${escapeHtml(card.text)}</strong>
        <button type="button">삭제</button>
      `;
      row.querySelector("button").onclick = async () => {
        if (confirm(`'${card.text}' 그림을 삭제할까요?`)) {
          await deleteImageFromStorageIfReady(card);
          cat.cards = cat.cards.filter(c => c.id !== card.id);
          sentenceCards = sentenceCards.filter(c => c.id !== card.id);
          saveData();
        }
      };
      del.appendChild(row);
    });
  });

  $("boardText").value = data.board || "";
  $("boardView").textContent = data.board || "게시판 내용이 없습니다.";
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

const menuBtn = $("menuBtn");
if (menuBtn) menuBtn.onclick = () => $("adminDialog").showModal();
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
  const speakText = $("cardSpeak").value.trim() || text;
  const file = $("imageInput").files[0];

  if (!cat || !text) {
    alert("카테고리와 그림 이름은 꼭 필요해요.");
    return;
  }

  const cardId = crypto.randomUUID();
  let image = "";
  let storagePath = "";

  try {
    if (file) {
      setStatus("그림을 압축하고 클라우드에 저장하는 중...");
      const uploaded = await uploadImageToStorageIfReady(file, cardId);
      image = uploaded.image;
      storagePath = uploaded.storagePath || "";
    }

    cat.cards.push({ id: cardId, text, speak: speakText, image, storagePath });
    $("cardText").value = "";
    $("cardSpeak").value = "";
    $("imageInput").value = "";
    selectedCategoryId = cat.id;
    saveData();
    setStatus(storagePath ? "그림이 클라우드에 저장되었어요." : "그림이 기기 안에 저장되었어요.");
  } catch (e) {
    console.error(e);
    setStatus("그림 저장 중 오류가 났어요.");
    alert("그림 저장 중 오류가 났어요. Firebase Storage 규칙을 확인해 주세요.");
  }
};

$("saveBoardBtn").onclick = () => {
  data.board = $("boardText").value.trim();
  saveData();
  setStatus("게시판이 저장되었어요.");
};

$("clearSentenceBtn").onclick = () => {
  sentenceCards = [];
  renderSentence();
};

$("searchInput").oninput = (e) => {
  searchTerm = e.target.value;
  renderCards();
};


const voiceBtn = $("voiceSearchBtn");
if (voiceBtn) {
  voiceBtn.onclick = () => {
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

      voiceBtn.classList.add("listening");
      voiceBtn.textContent = "🎙️";

      rec.onresult = (event) => {
        const spoken = event.results?.[0]?.[0]?.transcript || "";
        const text = spoken.trim().replace(/[.!?。]/g, "");
        searchTerm = text;
        const input = $("searchInput");
        if (input) input.value = text;
        renderCards();
      };

      rec.onerror = (event) => {
        console.warn("음성검색 오류:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          alert("마이크 권한이 필요해요. 브라우저 주소창의 자물쇠에서 마이크 권한을 허용해 주세요.");
        } else if (event.error === "no-speech") {
          alert("소리가 잘 들리지 않았어요. 다시 눌러 말해 주세요.");
        } else {
          alert("음성검색을 시작하지 못했어요. Chrome에서 다시 시도해 주세요.");
        }
      };

      rec.onend = () => {
        voiceBtn.classList.remove("listening");
        voiceBtn.textContent = "🎤";
      };

      rec.start();
    } catch (e) {
      console.error(e);
      voiceBtn.classList.remove("listening");
      voiceBtn.textContent = "🎤";
      alert("음성검색을 시작하지 못했어요. Chrome에서 다시 시도해 주세요.");
    }
  };
}

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

window.addEventListener("online", () => {
  setStatus("와이파이 연결됨: 업데이트를 확인할 수 있어요.");
  initFirebase();
});

window.addEventListener("offline", () => {
  setStatus("오프라인 모드: 저장된 그림으로 사용할 수 있어요.");
});

async function initFirebase() {
  try {
    const configModule = await import("./firebase-config.js?v=v3final_20260625");
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
        setStatus("동기화 준비 완료");
        return;
      }

      const cloud = snap.data().payload;
      if (cloud && Array.isArray(cloud.categories)) {
        if (typeof cloud.board !== "string") cloud.board = "";
        data = cloud;
        saveLocalOnly();
        render();
        setStatus("클라우드 데이터 반영 완료");
      } else {
        setStatus("동기화 준비 완료");
      }
    }, (error) => {
      console.error("Firestore 읽기 실패:", error);
      setStatus("기기 안 저장 모드");
    });
  } catch (e) {
    console.error("Firebase 초기화 실패:", e);
    setStatus("기기 안 저장 모드");
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
