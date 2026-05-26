(function () {
  function initPagination(blockId) {
    var s = blockId;
    var g = document.getElementById("vcom-reviews-grid-" + s);
    var pMobile = document.getElementById("vcom-reviews-pagination-" + s);
    var pDesktop = document.getElementById("vcom-reviews-arrows-" + s);
  if (!g || !pMobile) return;

    var bid = g.getAttribute("data-bid") || "";
    var root = document.getElementById(
      g.getAttribute("data-scroll-root") || "vcom-reviews-" + bid,
    );
    var useProxy = g.getAttribute("data-use-proxy") === "true";
    var proxyUrl = g.getAttribute("data-proxy-url") || "";
    var totalCount = parseInt(g.getAttribute("data-review-count") || "0", 10) || 0;
    var prevBtns = [];
    var nextBtns = [];
    var statusEls = [];
    var mobilePagerWrap = pMobile.querySelector("[data-mobile-pager]");

    function collectNav() {
      prevBtns = [];
      nextBtns = [];
      statusEls = [];
      if (!pDesktop) return;
      var prev = pDesktop.querySelector(".product-reviews__nav-prev");
      var next = pDesktop.querySelector(".product-reviews__nav-next");
      var status = pDesktop.querySelector(".product-reviews__nav-status");
      if (prev) prevBtns.push(prev);
      if (next) nextBtns.push(next);
      if (status) statusEls.push(status);
    }
    collectNav();

    var colsD = parseInt(g.getAttribute("data-cols-desktop"), 10) || 3;
    var rows = parseInt(g.getAttribute("data-reviews-rows"), 10) || 2;
    var perPageMobile = parseInt(g.getAttribute("data-per-page-mobile"), 10) || 10;
    var resizeTimer;
    var currentPage = 1;
    var totalPages = 1;
    var fetchGen = 0;
    var pageCache = {};
    var starColor = g.getAttribute("data-star-color") || "#00b67a";
    var starEmpty = g.getAttribute("data-star-empty") || "#ddd";
    var cardSlot = g.querySelector("[data-proxy-cards]") || g;
    var showVerified = g.getAttribute("data-show-verified") === "true";
    var verifiedLabel = g.getAttribute("data-verified-label") || "";
    var verifiedColor = g.getAttribute("data-verified-color") || "#00b67a";
    var titleMax = parseInt(g.getAttribute("data-title-max"), 10) || 80;
    var textMax = parseInt(g.getAttribute("data-text-max"), 10) || 200;
    var headerPrefix = g.getAttribute("data-header-prefix") || "";

    function verifiedBadgeHtml() {
      return (
        '<div class="product-reviews__verified"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="' +
        verifiedColor +
        '" d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12Zm10.207 4.207 7-7-1.414-1.414L10.5 14.086 7.207 10.793 5.793 12.207l4 4c.188.188.442.293.707.293s.519-.105.707-.293Z"/></svg><span>' +
        esc(String(verifiedLabel)) +
        "</span></div>"
      );
    }

    function isDesktop() {
      return window.matchMedia("(min-width:992px)").matches;
    }
    function perPage() {
      return isDesktop() ? colsD * rows : perPageMobile;
    }
    function getCards() {
      return Array.prototype.slice.call(g.querySelectorAll(".product-reviews__card"));
    }
    function scrollToFirstReview() {
      var el = g || root;
      if (!el) return;
      var y = el.getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    function getMobilePageItems(total, current) {
      if (total <= 7) {
        var all = [];
        for (var p = 1; p <= total; p++) all.push({ type: "page", page: p });
        return all;
      }
      var items = [{ type: "page", page: 1 }];
      if (current > 3) items.push({ type: "ellipsis" });
      var start = Math.max(2, current - 1);
      var end = Math.min(total - 1, current + 1);
      for (var i = start; i <= end; i++) items.push({ type: "page", page: i });
      if (current < total - 2) items.push({ type: "ellipsis" });
      if (total > 1) items.push({ type: "page", page: total });
      return items;
    }
    function renderMobilePager(pages, active) {
      if (!mobilePagerWrap) return;
      mobilePagerWrap.innerHTML = "";
      var prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "product-reviews__pag-ctrl";
      prevBtn.setAttribute("aria-label", "Página anterior");
      prevBtn.textContent = "«";
      prevBtn.disabled = active <= 1;
      prevBtn.addEventListener("click", function () {
        go(active - 1, true);
      });
      mobilePagerWrap.appendChild(prevBtn);
      getMobilePageItems(pages, active).forEach(function (item) {
        if (item.type === "ellipsis") {
          var gap = document.createElement("span");
          gap.className = "product-reviews__pag-ellipsis";
          gap.textContent = "...";
          gap.setAttribute("aria-hidden", "true");
          mobilePagerWrap.appendChild(gap);
          return;
        }
        var pageBtn = document.createElement("button");
        pageBtn.type = "button";
        pageBtn.className = "product-reviews__pag-page";
        if (item.page === active) pageBtn.classList.add("is-active");
        pageBtn.textContent = String(item.page);
        pageBtn.setAttribute("data-page", String(item.page));
        pageBtn.setAttribute("aria-label", "Página " + item.page);
        if (item.page === active) pageBtn.setAttribute("aria-current", "page");
        pageBtn.addEventListener("click", function () {
          go(item.page, true);
        });
        mobilePagerWrap.appendChild(pageBtn);
      });
      var nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "product-reviews__pag-ctrl";
      nextBtn.setAttribute("aria-label", "Próxima página");
      nextBtn.textContent = "»";
      nextBtn.disabled = active >= pages;
      nextBtn.addEventListener("click", function () {
        go(active + 1, true);
      });
      mobilePagerWrap.appendChild(nextBtn);
    }
    function updatePaginationUI(pages, active) {
      totalPages = pages;
      currentPage = active;
      var show = pages > 1;
      if (pMobile) {
        pMobile.hidden = !show;
        pMobile.classList.toggle("is-visible", show && !isDesktop());
      }
      if (pDesktop) {
        pDesktop.hidden = !show;
        pDesktop.classList.toggle("is-visible", show && isDesktop());
      }
      if (!show) {
        if (mobilePagerWrap) mobilePagerWrap.innerHTML = "";
        return;
      }
      renderMobilePager(pages, active);
      statusEls.forEach(function (el) {
        var cur = el.querySelector("[data-current]");
        var tot = el.querySelector("[data-total]");
        if (cur) cur.textContent = String(active);
        if (tot) tot.textContent = String(pages);
      });
      prevBtns.forEach(function (btn) {
        btn.disabled = active <= 1;
      });
      nextBtns.forEach(function (btn) {
        btn.disabled = active >= pages;
      });
    }
    function starSvg(stars, idx) {
      var n = idx + 1;
      var min = n - 1;
      if (stars >= n)
        return (
          '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" fill="' +
          starColor +
          '"/><path d="M9.2 27L16 21.807 22.797 27 20.202 18.596 27 13.403h-8.402L16 5l-2.597 8.403H5l6.798 5.193L9.2 27z" fill="#fff"/></svg>'
        );
      if (stars > min) {
        var w = Math.round((stars - min) * 32);
        return (
          '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" fill="' +
          starEmpty +
          '"/><rect width="' +
          w +
          '" height="32" fill="' +
          starColor +
          '"/><path d="M9.2 27L16 21.807 22.797 27 20.202 18.596 27 13.403h-8.402L16 5l-2.597 8.403H5l6.798 5.193L9.2 27z" fill="#fff"/></svg>'
        );
      }
      return (
        '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" fill="' +
        starEmpty +
        '"/><path d="M9.2 27L16 21.807 22.797 27 20.202 18.596 27 13.403h-8.402L16 5l-2.597 8.403H5l6.798 5.193L9.2 27z" fill="#fff"/></svg>'
      );
    }
    function esc(v) {
      var d = document.createElement("div");
      d.textContent = v || "";
      return d.innerHTML;
    }
    function buildCard(rv) {
      var stars = parseFloat(rv.rating) || 5;
      var starsHtml = "";
      var n;
      for (n = 0; n < 5; n++) starsHtml += starSvg(stars, n);
      var author = rv.author || "";
      var avatar = author ? author.charAt(0).toUpperCase() : "?";
      var title = rv.title || "";
      var body = rv.body || "";
      var bodyShow = body.length > textMax ? body.slice(0, textMax) + "..." : body;
      var html = '<article class="product-reviews__card">';
      html +=
        '<div class="product-reviews__avatar" aria-hidden="true">' +
        esc(avatar) +
        '</div><div class="product-reviews__card-body">';
      html += '<div class="product-reviews__head">';
      if (author) html += '<span class="product-reviews__author-name">' + esc(author) + "</span>";
      html += '<div class="product-reviews__stars" aria-hidden="true">' + starsHtml + "</div></div>";
      html += '<div class="product-reviews__stars product-reviews__stars--default" aria-hidden="true">' + starsHtml + "</div>";
      if (showVerified && rv.verified_buyer) html += verifiedBadgeHtml();
      if (title)
        html +=
          '<h3 class="product-reviews__title">' +
          esc(title.length > titleMax ? title.slice(0, titleMax) + "..." : title) +
          "</h3>";
      if (body) html += '<p class="product-reviews__text">' + esc(bodyShow) + "</p>";
      html += '<div class="product-reviews__meta">';
      if (author) html += '<span class="product-reviews__meta-author">' + esc(author) + "</span>";
      if (author && rv.time) html += '<span class="product-reviews__meta-sep"> - </span>';
      if (rv.time) html += "<span>" + esc(rv.time) + "</span>";
      html += "</div></div></article>";
      return html;
    }
    function updateAggregateStats(data) {
      if (!data || !data.count) return;
      totalCount = data.count;
      g.setAttribute("data-review-count", String(totalCount));
      var countLabel = totalCount + (totalCount >= 1000 ? "+" : "");
      var headCount = document.querySelector("#vcom-reviews-" + bid + " .product-reviews__section-count");
      if (headCount) headCount.textContent = headerPrefix + " " + countLabel + " reviews";
    }
    function cacheKey(page) {
      return String(page) + ":" + perPage();
    }
    function proxyFetchUrl(page, pp) {
      var sep = proxyUrl.indexOf("?") >= 0 ? "&" : "?";
      return proxyUrl + sep + "page=" + page + "&limit=" + pp;
    }
    function hideProxyLoading() {
      var load = g.querySelector("[data-proxy-loading]");
      if (load) load.style.display = "none";
    }
    function showProxyError(msg) {
      hideProxyLoading();
      var err = g.querySelector("[data-proxy-error]");
      var txt = g.querySelector("[data-proxy-error-text]");
      if (err) err.hidden = false;
      if (txt) txt.textContent = msg || "Não foi possível carregar as avaliações.";
    }
    function applyProxyData(data, page, scroll) {
      hideProxyLoading();
      var err = g.querySelector("[data-proxy-error]");
      if (err) err.hidden = true;
      updateAggregateStats(data);
      var empty = document.querySelector("#vcom-reviews-" + bid + " .vcom-reviews-proxy-empty");
      if (empty) empty.style.display = "none";
      var html = "";
      (data.reviews || []).forEach(function (rv) {
        html += buildCard(rv);
      });
      cardSlot.innerHTML = html;
      var pp = perPage();
      var pages = data.total_pages || Math.ceil((data.count || totalCount) / pp) || 1;
      updatePaginationUI(pages, page);
      if (scroll) scrollToFirstReview();
    }
    function prefetchProxyPage(page) {
      if (!proxyUrl || page < 1) return;
      if (totalPages > 0 && page > totalPages) return;
      var pp = perPage();
      var key = cacheKey(page);
      if (pageCache[key]) return;
      fetch(proxyFetchUrl(page, pp), { credentials: "same-origin" })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && data.ok) pageCache[key] = data;
        });
    }
    function fetchProxyPage(page, scroll, force) {
      if (!proxyUrl) return;
      page = parseInt(page, 10) || 1;
      var pp = perPage();
      var key = cacheKey(page);
      if (!force && pageCache[key]) {
        applyProxyData(pageCache[key], page, scroll);
        prefetchProxyPage(page - 1);
        prefetchProxyPage(page + 1);
        return;
      }
      var gen = ++fetchGen;
      var load = g.querySelector("[data-proxy-loading]");
      if (load && cardSlot.querySelectorAll(".product-reviews__card").length === 0) load.style.display = "";
      g.classList.add("is-loading");
      var errEl = g.querySelector("[data-proxy-error]");
      if (errEl) errEl.hidden = true;
      fetch(proxyFetchUrl(page, pp), { credentials: "same-origin" })
        .then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok, status: r.status, data: data };
          });
        })
        .then(function (res) {
          if (gen !== fetchGen) return;
          g.classList.remove("is-loading");
          var data = res.data;
          if (!res.ok || !data || !data.ok) {
            showProxyError(
              (data && data.error) ||
                (res.status ? "Erro HTTP " + res.status : "Erro ao carregar avaliações"),
            );
            return;
          }
          pageCache[key] = data;
          applyProxyData(data, page, scroll);
          prefetchProxyPage(page - 1);
          prefetchProxyPage(page + 1);
        })
        .catch(function (e) {
          if (gen !== fetchGen) return;
          g.classList.remove("is-loading");
          showProxyError(e && e.message ? e.message : "Falha de rede");
        });
    }
    function goLocal(page, scroll) {
      page = parseInt(page, 10) || 1;
      getCards().forEach(function (card) {
        card.style.display = card.dataset.page == String(page) ? "" : "none";
      });
      updatePaginationUI(totalPages, page);
      if (scroll) scrollToFirstReview();
    }
    function go(page, scroll) {
      page = parseInt(page, 10) || 1;
      if (page < 1) page = 1;
      if (totalPages > 0 && page > totalPages) page = totalPages;
      if (useProxy && proxyUrl) {
        fetchProxyPage(page, scroll);
        return;
      }
      goLocal(page, scroll);
    }
    function applyLocal() {
      var pp = perPage();
      var cards = getCards();
      if (!pp || cards.length <= pp) {
        if (pMobile) {
          pMobile.hidden = true;
          pMobile.classList.remove("is-visible");
        }
        if (pDesktop) {
          pDesktop.hidden = true;
          pDesktop.classList.remove("is-visible");
        }
        cards.forEach(function (card) {
          card.style.display = "";
        });
        return;
      }
      var pages = Math.ceil(cards.length / pp);
      cards.forEach(function (card, idx) {
        card.dataset.page = String(Math.floor(idx / pp) + 1);
      });
      updatePaginationUI(pages, Math.min(currentPage, pages));
      goLocal(Math.min(currentPage, pages), false);
    }
    function onPrev() {
      go(currentPage - 1, false);
    }
    function onNext() {
      go(currentPage + 1, false);
    }
    prevBtns.forEach(function (btn) {
      btn.addEventListener("click", onPrev);
    });
    nextBtns.forEach(function (btn) {
      btn.addEventListener("click", onNext);
    });
    var retryBtn = g.querySelector("[data-proxy-retry]");
    if (retryBtn)
      retryBtn.addEventListener("click", function () {
        fetchProxyPage(currentPage || 1, false, true);
      });
    if (useProxy && proxyUrl && totalCount > 0) {
      fetchProxyPage(1, false);
    } else {
      applyLocal();
    }
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        currentPage = 1;
        pageCache = {};
        if (useProxy && proxyUrl && totalCount > 0) fetchProxyPage(1, false, true);
        else applyLocal();
        if (totalPages > 1) {
          if (pMobile) pMobile.classList.toggle("is-visible", !isDesktop());
          if (pDesktop) pDesktop.classList.toggle("is-visible", isDesktop());
        }
      }, 150);
    });
  }

  function boot() {
    document.querySelectorAll("[data-vcom-pagination]").forEach(function (el) {
      var blockId = el.getAttribute("data-block-id");
      if (blockId) initPagination(blockId);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
