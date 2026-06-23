const ADMIN_PIN = "1208";
const STORE_KEY = "siel_aac_data_v1";
const RECENT_KEY = "siel_aac_recent_v1";

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
  updatedAt: 0
};

let data = loadData();

function loadData() {
  const saved = localStorage.getItem(STORE_KEY);
  if (!saved) return structuredClone(defaultData);
  try {
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.categories)) return structuredClone(defaultData);
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
      row.querySelector("button").onclick = async () => {
        if (confirm(`'${card.text}' 그림을 삭제할까요?`)) {
          await deleteImageFromStorageIfReady(card);
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

  const cardId = crypto.randomUUID();
  let image = "";
  let storagePath = "";

  try {
    if (file) {
      $("statusBar").textContent = "그림을 압축하고 클라우드에 저장하는 중...";
      const uploaded = await uploadImageToStorageIfReady(file, cardId);
      image = uploaded.image;
      storagePath = uploaded.storagePath || "";
    }

    cat.cards.push({ id: cardId, text, speak: speakText, image, storagePath });
    $("cardText").value = "";
    $("cardSpeak").value = "";
    $("imageInput").value = "";
    saveData();
    $("statusBar").textContent = storagePath ? "그림이 클라우드에 저장되었어요." : "그림이 기기 안에 저장되었어요.";
  } catch (e) {
    console.error(e);
    $("statusBar").textContent = "그림 저장 중 오류가 났어요.";
    alert("그림 저장 중 오류가 났어요. Firebase Storage 규칙을 확인해 주세요.");
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

async function initFirebase() {
  try {
    const configModule = await import("./firebase-config.js?v=clean20260623");
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
        $("statusBar").textContent = "동기화 준비 완료";
        return;
      }

      const cloud = snap.data().payload;
      if (cloud && Array.isArray(cloud.categories)) {
        data = cloud;
        saveLocalOnly();
        currentCategory = null;
        render();
        $("statusBar").textContent = "클라우드 데이터 반영 완료";
      } else {
        $("statusBar").textContent = "동기화 준비 완료";
      }
    }, (error) => {
      console.error("Firestore 읽기 실패:", error);
      $("statusBar").textContent = "기기 안 저장 모드";
    });
  } catch (e) {
    console.error("Firebase 초기화 실패:", e);
    $("statusBar").textContent = "기기 안 저장 모드";
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
