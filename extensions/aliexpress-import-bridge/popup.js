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

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

function getStoredBatch() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      resolve(data[STORAGE_KEY] || null);
    });
  });
}

function setStoredBatch(batch) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: batch }, resolve);
  });
}

function clearStoredBatch() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEY, resolve);
  });
}

collectBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("Aba ativa inválida.");
    if (!tab.url || !tab.url.includes("aliexpress")) {
      throw new Error("Abra a página do produto no AliExpress (aba Avaliações).");
    }

    setStatus("Coletando na aba do AliExpress...");

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["inject-collect.js"],
    });

    if (!result?.ok) {
      throw new Error(
        result?.error ||
          "Nenhuma avaliação detectada. Abra a página do produto (/item/ID.html) e a aba Avaliações.",
      );
    }

    const reviews = result.reviews || [];
    if (!reviews.length) {
      throw new Error("Nenhuma avaliação retornada pela coleta.");
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

    const via = result.source === "api" ? "API" : "DOM";
    const warn = result.warning ? ` ${result.warning}` : "";
    setStatus(`Coletadas ${reviews.length} avaliações (${via}, produto ${result.productId}).${warn}`);
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

    setStatus(`Lote ${batch.batchId} enviado (${batch.reviews.length} avaliações).`);
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
    setStatus("Nenhum lote salvo. Abra o produto no AliExpress e clique em Coletar.");
  }
})();
