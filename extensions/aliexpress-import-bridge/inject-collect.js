(async function collectAliExpressReviews() {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extractProductId() {
    const href = window.location.href;
    try {
      const parsed = new URL(href);
      const fromQuery = parsed.searchParams.get("productId");
      if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
    } catch {
      // ignore
    }
    const itemMatch = href.match(/\/item\/(\d+)\.html/i);
    if (itemMatch?.[1]) return itemMatch[1];

    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const text = script.textContent || "";
      const m = text.match(/"productId"\s*:\s*"?(\d{8,})"?/);
      if (m?.[1]) return m[1];
    }

    return null;
  }

  function parseRating(buyerEval) {
    if (buyerEval == null) return 5;
    const num = Number(buyerEval);
    if (!Number.isFinite(num)) return 5;
    if (num <= 5) return Math.min(5, Math.max(1, Math.round(num)));
    return Math.min(5, Math.max(1, Math.round(num / 20)));
  }

  function normalizeApiItem(item, index) {
    const author = cleanText(item.buyerName || item.buyerLoginId || "Cliente AliExpress");
    const body = cleanText(item.buyerTranslationFeedback || item.buyerFeedback || "");
    const dateRaw = item.evalDate || item.gmtCreate || "";
    let time = "";
    if (dateRaw) {
      const d = new Date(Number(dateRaw));
      if (!Number.isNaN(d.getTime())) time = d.toISOString().slice(0, 10);
    }
    return {
      sourceReviewId: String(item.evaluationId || item.id || `api-${index}`),
      author: author.slice(0, 120) || "Cliente AliExpress",
      title: cleanText(item.buyerProductFeedback || "").slice(0, 180),
      body: body.slice(0, 4000) || "Sem texto",
      rating: parseRating(item.buyerEval),
      time,
      placement: "homepage",
      verifiedBuyer: false,
    };
  }

  async function fetchFromSearchEvaluationApi(productId) {
    const all = [];
    let page = 1;
    const pageSize = 50;
    let totalPages = 1;

    while (page <= totalPages && page <= 50) {
      const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
      url.searchParams.set("productId", productId);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(pageSize));
      url.searchParams.set("filter", "all");
      url.searchParams.set("sort", "complex_default");

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`searchEvaluation HTTP ${response.status}`);
      }

      const data = await response.json();
      const list = data?.data?.evaViewList || [];
      const totalNum = Number(data?.data?.totalNum || 0);
      totalPages = Math.max(1, Math.ceil(totalNum / pageSize) || 1);

      for (let i = 0; i < list.length; i += 1) {
        all.push(normalizeApiItem(list[i], all.length + i));
      }

      if (list.length < pageSize) break;
      page += 1;
    }

    return all;
  }

  function extractFromDom() {
    const reviews = [];
    const seen = new Set();

    const blocks = document.querySelectorAll(
      [
        '[data-pl="review-content"]',
        '[class*="review--wrap"]',
        '[class*="review-item"]',
        '[class*="feedback-item"]',
        "dl.buyer-review",
        '[class*="evaluation-list"] > *',
      ].join(","),
    );

    for (const block of blocks) {
      const text = cleanText(block.innerText || "");
      if (!text || text.length < 20 || seen.has(text)) continue;
      seen.add(text);

      const starNodes = block.querySelectorAll(
        '[class*="star"][class*="fill"], [class*="star--full"], svg',
      );
      let rating = 5;
      if (starNodes.length >= 1 && starNodes.length <= 5) rating = starNodes.length;

      reviews.push({
        sourceReviewId: `dom-${reviews.length}`,
        author: "Cliente AliExpress",
        title: "",
        body: text.slice(0, 4000),
        rating,
        time: "",
        placement: "homepage",
        verifiedBuyer: false,
      });
      if (reviews.length >= 80) break;
    }

    return reviews;
  }

  const productId = extractProductId();
  if (!productId) {
    return { ok: false, error: "productId não encontrado na URL/página.", reviews: [] };
  }

  try {
    const apiReviews = await fetchFromSearchEvaluationApi(productId);
    if (apiReviews.length > 0) {
      return { ok: true, source: "api", productId, reviews: apiReviews };
    }
  } catch (apiError) {
    const domReviews = extractFromDom();
    if (domReviews.length > 0) {
      return {
        ok: true,
        source: "dom",
        productId,
        reviews: domReviews,
        warning: `API falhou (${apiError.message}); usado fallback DOM.`,
      };
    }
    return {
      ok: false,
      productId,
      error: `API: ${apiError.message}. DOM: nenhum bloco encontrado.`,
      reviews: [],
    };
  }

  const domReviews = extractFromDom();
  if (domReviews.length > 0) {
    return { ok: true, source: "dom", productId, reviews: domReviews };
  }

  return {
    ok: false,
    productId,
    error: "API retornou 0 avaliações e DOM não encontrou blocos.",
    reviews: [],
  };
})();
