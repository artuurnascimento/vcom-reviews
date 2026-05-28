const STORAGE_KEY = "vcom_import_batch";
const CHANNEL = "vcom.import";

const statusEl = document.getElementById("status");
const collectBtn = document.getElementById("collectBtn");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

function makeBatchId() {
  return `alx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getStoredBatch() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || null;
}

async function setStoredBatch(batch) {
  await chrome.storage.local.set({ [STORAGE_KEY]: batch });
}

async function clearStoredBatch() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

function extractAliExpressReviews() {
  const possibleCards = Array.from(
    document.querySelectorAll(
      [
        '[data-pl="review-content"]',
        '[class*="feedback-item"]',
        '[class*="review-item"]',
        '[class*="eva-item"]',
        'li[class*="review"]',
      ].join(","),
    ),
  );

  const fallbackTextBlocks = possibleCards.length
    ? possibleCards
    : Array.from(document.querySelectorAll("p, div")).slice(0, 400);

  const reviews = [];
  for (const node of fallbackTextBlocks) {
    const body =
      cleanText(node.querySelector('[class*="content"]')?.textContent) ||
      cleanText(node.textContent);
    if (!body || body.length < 25) continue;

    const author =
      cleanText(
        node.querySelector('[class*="user"], [class*="author"], [class*="name"]')?.textContent,
      ) || "Cliente AliExpress";
    const title =
      cleanText(node.querySelector("h3, h4, [class*='title']")?.textContent) || "";

    const starIcons = node.querySelectorAll(
      '[class*="star"][class*="active"], [class*="star"][class*="full"], [aria-label*="star"]',
    );
    const rating = starIcons.length > 0 ? Math.min(5, Math.max(1, starIcons.length)) : 5;

    const time =
      cleanText(node.querySelector("time, [class*='date'], [class*='time']")?.textContent) || "";

    const sourceReviewId =
      node.getAttribute("data-id") ||
      node.getAttribute("data-review-id") ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    reviews.push({
      sourceReviewId,
      author: author.slice(0, 120),
      title: title.slice(0, 180),
      body: body.slice(0, 4000),
      rating,
      time: time.slice(0, 60),
      placement: "homepage",
      verifiedBuyer: false,
    });

    if (reviews.length >= 200) break;
  }

  return reviews;
}

collectBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("Aba ativa inválida.");
    if (!tab.url || !tab.url.includes("aliexpress.")) {
      throw new Error("Abra uma página do AliExpress antes de coletar.");
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractAliExpressReviews,
    });

    const reviews = result?.result || [];
    if (!Array.isArray(reviews) || reviews.length === 0) {
      throw new Error("Nenhuma avaliação detectada na página.");
    }

    const batch = {
      channel: CHANNEL,
      type: "vcom.import.reviews",
      source: "aliexpress",
      requestId: crypto.randomUUID(),
      batchId: makeBatchId(),
      sentAt: new Date().toISOString(),
      reviews,
    };
    await setStoredBatch(batch);
    setStatus(`Lote salvo com ${reviews.length} avaliações.`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
});

sendBtn.addEventListener("click", async () => {
  try {
    const batch = await getStoredBatch();
    if (!batch || !Array.isArray(batch.reviews) || batch.reviews.length === 0) {
      throw new Error("Nenhum lote salvo. Clique em Coletar primeiro.");
    }

    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("Aba ativa inválida.");
    if (!tab.url || !tab.url.includes("/app/import")) {
      throw new Error("Abra a página /app/import do VCOM Reviews na aba atual.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [batch],
      func: (payload) => {
        window.postMessage(payload, window.location.origin);
      },
    });

    setStatus(`Lote ${batch.batchId} enviado para /app/import.`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
});

clearBtn.addEventListener("click", async () => {
  await clearStoredBatch();
  setStatus("Lote removido.");
});

(async () => {
  const batch = await getStoredBatch();
  if (batch?.reviews?.length) {
    setStatus(`Lote pronto: ${batch.reviews.length} avaliações.`);
  } else {
    setStatus("Nenhum lote salvo.");
  }
})();
