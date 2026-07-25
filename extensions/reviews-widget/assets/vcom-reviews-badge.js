(function () {
  function scrollToReviews() {
    var target = document.querySelector(
      ".product-reviews.vcom-reviews-app-block:not(.vcom-reviews-top-block)",
    );
    if (!target) return;
    var y = target.getBoundingClientRect().top + window.pageYOffset - 20;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  function resolveProductId(el) {
    var id = (el.getAttribute("data-product-id") || "").trim();
    if (id) return id;
    try {
      var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (meta && meta.product && meta.product.id) return String(meta.product.id);
    } catch (e) {}
    var sec = document.querySelector(".product-reviews [data-proxy-url]");
    if (sec) {
      var m = /product_id=(\d+)/.exec(sec.getAttribute("data-proxy-url") || "");
      if (m) return m[1];
    }
    return "";
  }

  function relocateUnderTitle(el) {
    var title =
      document.querySelector(
        ".product__title, .product-single__title, .product-title, .product__info-container h1, .product-info h1, .product-meta__title, .product__heading",
      ) ||
      document.querySelector("main h1, [id*='MainContent'] h1, [id*='ProductInfo'] h1") ||
      document.querySelector("h1");
    if (title && title.parentNode && title.nextSibling !== el) {
      el.style.margin = "8px 0 0";
      title.parentNode.insertBefore(el, title.nextSibling);
    }
  }

  function initBadge(el) {
    relocateUnderTitle(el);
    var pid = resolveProductId(el);
    var url = pid
      ? "/apps/vcom-reviews/reviews?placement=product&product_id=" +
        encodeURIComponent(pid) +
        "&limit=1"
      : "";
    var starsEl = el.querySelector("[data-badge-stars]");
    var numEl = el.querySelector("[data-badge-num]");
    var countEl = el.querySelector("[data-badge-count]");
    var word = el.getAttribute("data-word") || "reviews";

    el.addEventListener("click", function (e) {
      e.preventDefault();
      scrollToReviews();
    });

    if (!url) return;
    fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) {
          el.style.display = "none";
          return;
        }
        var total = parseInt(d.total, 10) || parseInt(d.count, 10) || 0;
        var avg = parseFloat(d.avg_all || d.avg) || 0;
        if (total <= 0) {
          el.style.display = "none";
          return;
        }
        var pct = (Math.max(0, Math.min(5, avg)) / 5) * 100;
        if (starsEl) starsEl.style.setProperty("--pct", pct + "%");
        if (numEl) numEl.textContent = avg.toFixed(1);
        if (countEl) countEl.textContent = "(" + total + " " + word + ")";
        el.classList.add("is-ready");
      })
      .catch(function () {
        el.style.display = "none";
      });
  }

  function boot() {
    document.querySelectorAll("[data-vcom-badge]").forEach(initBadge);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
