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
    var useEmbedded = g.getAttribute("data-use-embedded") === "true";
    var proxyUrl = g.getAttribute("data-proxy-url") || "";
    var totalCount = parseInt(g.getAttribute("data-review-count") || "0", 10) || 0;
    var embeddedReviews = null;
    if (useEmbedded) {
      var embeddedEl = document.getElementById("vcom-embedded-reviews-" + s);
      if (embeddedEl && embeddedEl.textContent) {
        try {
          var parsed = JSON.parse(embeddedEl.textContent.trim());
          if (Array.isArray(parsed) && parsed.length > 0) embeddedReviews = parsed;
        } catch (e) {
          embeddedReviews = null;
        }
      }
    }
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
    var showImages = g.getAttribute("data-show-images") === "true";
    var filterRating = 0;
    var filterPhotos = false;
    var filterDate = "";

    function imagesInitialCount() {
      if (!root) return 2;
      return isDesktop()
        ? parseInt(root.getAttribute("data-images-initial-desktop"), 10) || 2
        : parseInt(root.getAttribute("data-images-initial-mobile"), 10) || 2;
    }

    function applyImageLimits() {
      if (!root || !showImages) return;
      var initial = imagesInitialCount();
      root.querySelectorAll("[data-review-images]").forEach(function (gallery) {
        var links = Array.prototype.slice.call(
          gallery.querySelectorAll(".product-reviews__image-link"),
        );
        var seeMore = gallery.querySelector(".product-reviews__image-see-more");
        var hidden = Math.max(0, links.length - initial);
        links.forEach(function (link, idx) {
          if (idx < initial) {
            link.classList.remove("product-reviews__image-link--hidden");
            link.style.display = "";
          } else {
            link.classList.add("product-reviews__image-link--hidden");
            if (!gallery.classList.contains("is-expanded")) link.style.display = "none";
          }
        });
        if (seeMore) {
          seeMore.style.display =
            gallery.classList.contains("is-expanded") || hidden <= 0 ? "none" : "";
          var countSpan = seeMore.querySelectorAll("span")[1];
          if (countSpan) countSpan.textContent = "+" + hidden;
        }
      });
    }

    function bindCardMediaOnce() {
      if (!root || root.dataset.vcomMediaBound === "1") return;
      root.dataset.vcomMediaBound = "1";
      var modal = document.getElementById("vcom-reviews-image-modal-" + s);
      var modalImg = document.getElementById("vcom-reviews-modal-img-" + s);
      if (!modal || !modalImg) return;

      function openModal(src) {
        modalImg.src = src;
        modal.classList.add("is-open");
        document.body.style.overflow = "hidden";
      }
      function closeModal() {
        modal.classList.remove("is-open");
        modalImg.src = "";
        document.body.style.overflow = "";
      }

      root.addEventListener("click", function (e) {
        var link = e.target.closest(".product-reviews__image-link[data-image-src]");
        if (link) {
          e.preventDefault();
          var src = link.getAttribute("data-image-src");
          if (src) openModal(src);
          return;
        }
        var seeMore = e.target.closest(".product-reviews__image-see-more");
        if (seeMore) {
          var wrap = seeMore.closest(".product-reviews__images");
          if (wrap) {
            wrap.classList.add("is-expanded");
            applyImageLimits();
          }
          return;
        }
        var seeLess = e.target.closest(".product-reviews__image-see-less");
        if (seeLess) {
          var wrapLess = seeLess.closest(".product-reviews__images");
          if (wrapLess) {
            wrapLess.classList.remove("is-expanded");
            applyImageLimits();
          }
        }
      });

      var closeBtn = modal.querySelector(".product-reviews__image-modal-close");
      if (closeBtn) closeBtn.addEventListener("click", closeModal);
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
      });
    }

    function verifiedBadgeHtml() {
      return (
        '<div class="product-reviews__verified"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="' +
        verifiedColor +
        '"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M6.8 12.4l3.3 3.3L17 8.8"/></svg><span>' +
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
        pMobile.classList.toggle("is-visible", show);
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
    function escAttr(v) {
      return String(v || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
    }
    function buildImagesHtml(rv) {
      var urls = (rv.images || []).filter(function (u) {
        return typeof u === "string" && /^https?:\/\//i.test(u);
      });
      if (!showImages || urls.length === 0) return "";
      var max = 6;
      urls = urls.slice(0, max);
      var initial = imagesInitialCount();
      var hidden = Math.max(0, urls.length - initial);
      var collapsible = hidden > 0 ? " product-reviews__images--collapsible" : "";
      var html = '<div class="product-reviews__images' + collapsible + '" data-review-images>';
      urls.forEach(function (url, idx) {
        var hiddenClass = idx >= initial ? " product-reviews__image-link--hidden" : "";
        var hiddenStyle = idx >= initial ? ' style="display:none"' : "";
        html +=
          '<button type="button" class="product-reviews__image-link' +
          hiddenClass +
          '" data-image-src="' +
          escAttr(url) +
          '" aria-label="Ver imagem"' +
          hiddenStyle +
          ">";
        html +=
          '<img src="' +
          escAttr(url) +
          '" alt="" loading="lazy" width="80" height="80" class="product-reviews__image">';
        html += "</button>";
      });
      if (hidden > 0) {
        html +=
          '<button type="button" class="product-reviews__image-see-more" data-hidden-count="' +
          hidden +
          '"><span>Ver mais</span><span>+' +
          hidden +
          "</span></button>";
        html +=
          '<button type="button" class="product-reviews__image-see-less" style="display:none">Ver menos</button>';
      }
      html += "</div>";
      return html;
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
      html += buildImagesHtml(rv);
      html += '<div class="product-reviews__meta">';
      if (author) html += '<span class="product-reviews__meta-author">' + esc(author) + "</span>";
      if (author && rv.time) html += '<span class="product-reviews__meta-sep"> - </span>';
      if (rv.time) html += "<span>" + esc(rv.time) + "</span>";
      html += "</div>";
      if (rv.product && rv.product.title) {
        var p = rv.product;
        var pin =
          (p.image
            ? '<img src="' +
              escAttr(p.image) +
              '" alt="" width="40" height="40" class="vcom-prod-thumb" loading="lazy">'
            : "") +
          '<span class="vcom-prod-name">' +
          esc(p.title) +
          "</span>";
        html += p.url
          ? '<a href="' + escAttr(p.url) + '" class="vcom-prod-link">' + pin + "</a>"
          : '<div class="vcom-prod-link">' + pin + "</div>";
      }
      html += "</div></article>";
      return html;
    }
    function updateAggregateStats(data) {
      if (!data || !data.count) return;
      totalCount = data.count;
      g.setAttribute("data-review-count", String(totalCount));
      var countLabel = totalCount + (totalCount >= 1000 ? "+" : "");
      var headCount = document.querySelector("#vcom-reviews-" + bid + " .product-reviews__section-count");
      if (headCount && g.getAttribute("data-static-count") !== "true") headCount.textContent = headerPrefix + " " + countLabel + " reviews";
    }
    function updateDistribution(data) {
      if (!root || !data || !data.dist) return;
      var total = parseInt(data.total, 10) || 0;
      var isEmpty = total <= 0;
      var avgEl = root.querySelector(".pr-avg");
      if (avgEl) avgEl.style.display = isEmpty ? "none" : "";
      var distEl = root.querySelector(".pr-dist");
      if (distEl) distEl.style.display = isEmpty ? "none" : "";
      for (var lvl = 1; lvl <= 5; lvl++) {
        var n = parseInt(data.dist[lvl], 10) || 0;
        var row = root.querySelector('[data-dist-level="' + lvl + '"]');
        if (!row) continue;
        var c = row.querySelector(".pr-c");
        if (c) c.textContent = "(" + n + ")";
        var fl = row.querySelector(".pr-fl");
        if (fl) fl.style.width = (total > 0 ? (n * 100) / total : 0) + "%";
      }
      var cnt = root.querySelector(".pr-cnt");
      if (cnt) {
        var word = cnt.getAttribute("data-word") || "Reviews";
        cnt.textContent = (isEmpty ? 0 : total) + (total >= 1000 ? "+" : "") + " " + word;
      }
      if (!isEmpty) {
        var num = root.querySelector(".pr-num");
        if (num && data.avg_all) num.textContent = data.avg_all;
      }
    }
    function emptyStrings() {
      var lang = (document.documentElement.lang || "en").toLowerCase();
      if (lang.indexOf("pt") === 0)
        return { t: "Ainda não há avaliações", s: "Seja o primeiro a avaliar este produto" };
      if (lang.indexOf("it") === 0)
        return { t: "Ancora nessuna recensione", s: "Sii il primo a recensire questo prodotto" };
      return { t: "No reviews yet", s: "Be the first to review this product" };
    }
    function renderEmptyState() {
      var s = emptyStrings();
      var filters = root && root.querySelector("[data-vcom-filters]");
      if (filters) filters.hidden = true;
      var sum = root && root.querySelector(".pr-sum");
      var writeBtn = root && root.querySelector(".pr-w");
      cardSlot.innerHTML =
        '<div class="vcom-empty">' +
        '<svg class="vcom-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M11.05 2.93c.3-.92 1.6-.92 1.9 0l1.83 5.63h5.92c.97 0 1.37 1.24.59 1.81l-4.79 3.48 1.83 5.63c.3.92-.76 1.69-1.54 1.12L12 18.75l-4.79 3.48c-.78.57-1.84-.2-1.54-1.12l1.83-5.63-4.79-3.48c-.78-.57-.38-1.81.59-1.81h5.92l1.83-5.63Z"/></svg>' +
        '<p class="vcom-empty__title">' +
        esc(s.t) +
        '</p><p class="vcom-empty__sub">' +
        esc(s.s) +
        '</p><span class="vcom-empty__slot"></span></div>';
      var slot = cardSlot.querySelector(".vcom-empty__slot");
      if (writeBtn && slot) slot.appendChild(writeBtn);
      if (sum) sum.style.display = "none";
    }
    function filterSig() {
      return "r" + filterRating + "p" + (filterPhotos ? 1 : 0) + "d" + (filterDate || "");
    }
    function cacheKey(page) {
      return String(page) + ":" + perPage() + ":" + filterSig();
    }
    function proxyFetchUrl(page, pp) {
      var u;
      try {
        u = new URL(proxyUrl, window.location.origin);
      } catch (e) {
        u = null;
      }
      if (!u) {
        var sep = proxyUrl.indexOf("?") >= 0 ? "&" : "?";
        var extra = "";
        if (filterRating >= 1 && filterRating <= 5) extra += "&rating=" + filterRating;
        if (filterPhotos) extra += "&photos=1";
        if (filterDate) extra += "&sort=" + filterDate;
        return proxyUrl + sep + "page=" + page + "&limit=" + pp + extra;
      }
      u.searchParams.set("page", page);
      u.searchParams.set("limit", pp);
      if (filterRating >= 1 && filterRating <= 5) u.searchParams.set("rating", filterRating);
      else u.searchParams.delete("rating");
      if (filterPhotos) u.searchParams.set("photos", "1");
      else u.searchParams.delete("photos");
      if (filterDate) u.searchParams.set("sort", filterDate);
      return u.pathname + u.search;
    }
    function getEmbeddedPageData(page) {
      var pp = perPage();
      var start = (page - 1) * pp;
      return {
        ok: true,
        count: embeddedReviews.length,
        reviews: embeddedReviews.slice(start, start + pp),
        total_pages: Math.max(1, Math.ceil(embeddedReviews.length / pp)),
        page: page,
        limit: pp,
      };
    }
    function usesRemoteProxy() {
      return useProxy && proxyUrl && !embeddedReviews;
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
      updateDistribution(data);
      var empty = document.querySelector("#vcom-reviews-" + bid + " .vcom-reviews-proxy-empty");
      if (empty) empty.style.display = "none";
      var html = "";
      (data.reviews || []).forEach(function (rv) {
        html += buildCard(rv);
      });
      if (!html && (filterRating || filterPhotos)) {
        html =
          '<p class="product-reviews__filter-empty" style="grid-column:1/-1;width:100%;text-align:center;opacity:.6;padding:24px 0;margin:0;">' +
          esc(filterEmptyText || "Nenhuma avaliação para este filtro.") +
          "</p>";
      }
      cardSlot.innerHTML = html;
      var totalReviews = parseInt(data.total, 10);
      if (isNaN(totalReviews)) totalReviews = parseInt(data.count, 10) || 0;
      if (totalReviews <= 0 && !filterRating && !filterPhotos) {
        renderEmptyState();
      }
      bindCardMediaOnce();
      applyImageLimits();
      var pp = perPage();
      var apiCount = typeof data.count === "number" ? data.count : totalCount;
      var pages = data.total_pages || (apiCount > 0 ? Math.ceil(apiCount / pp) : 0);
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
      page = parseInt(page, 10) || 1;
      var pp = perPage();
      var key = cacheKey(page);

      if (embeddedReviews && embeddedReviews.length > 0) {
        if (!force && pageCache[key]) {
          applyProxyData(pageCache[key], page, scroll);
          return;
        }
        var embeddedData = getEmbeddedPageData(page);
        pageCache[key] = embeddedData;
        applyProxyData(embeddedData, page, scroll);
        return;
      }

      if (!proxyUrl) return;
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
          return r.text().then(function (text) {
            var data = null;
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = {
                ok: false,
                error:
                  "Resposta inválida do servidor. Abra o app VCOM Reviews no admin da Shopify.",
              };
            }
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
      if ((embeddedReviews && embeddedReviews.length > 0) || usesRemoteProxy()) {
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

    function applyFilters() {
      currentPage = 1;
      pageCache = {};
      fetchProxyPage(1, false, true);
    }
    var filterBar = root && root.querySelector("[data-vcom-filters]");
    var filterEmptyText = "";
    if (filterBar) {
      filterEmptyText = filterBar.getAttribute("data-empty-text") || "";
      var actWrap = root && root.querySelector(".pr-act");
      if (actWrap && filterBar.parentNode !== actWrap) actWrap.appendChild(filterBar);
      var ratingBtns = Array.prototype.slice.call(
        filterBar.querySelectorAll("[data-filter-rating]"),
      );
      var distRows = root
        ? Array.prototype.slice.call(root.querySelectorAll("[data-dist-level]"))
        : [];
      function syncRatingUI() {
        ratingBtns.forEach(function (x) {
          x.setAttribute(
            "aria-pressed",
            (parseInt(x.getAttribute("data-filter-rating"), 10) || 0) === filterRating
              ? "true"
              : "false",
          );
        });
        distRows.forEach(function (r) {
          r.classList.toggle(
            "is-active",
            (parseInt(r.getAttribute("data-dist-level"), 10) || 0) === filterRating,
          );
        });
      }
      function setRating(val) {
        filterRating = filterRating === val ? 0 : val;
        syncRatingUI();
        applyFilters();
      }
      ratingBtns.forEach(function (b) {
        b.addEventListener("click", function () {
          setRating(parseInt(b.getAttribute("data-filter-rating"), 10) || 0);
        });
      });
      distRows.forEach(function (r) {
        r.addEventListener("click", function () {
          setRating(parseInt(r.getAttribute("data-dist-level"), 10) || 0);
        });
      });
      var photosBtn = filterBar.querySelector("[data-filter-photos]");
      if (photosBtn)
        photosBtn.addEventListener("click", function () {
          filterPhotos = !filterPhotos;
          photosBtn.setAttribute("aria-pressed", filterPhotos ? "true" : "false");
          applyFilters();
        });
      var dateSel = filterBar.querySelector("[data-filter-date]");
      if (dateSel)
        dateSel.addEventListener("change", function () {
          filterDate = dateSel.value || "";
          applyFilters();
        });
    }
    var filterToggle = root && root.querySelector("[data-vcom-filter-toggle]");
    if (filterToggle && filterBar) {
      filterBar.hidden = true;
      filterToggle.addEventListener("click", function () {
        var willOpen = filterBar.hidden;
        filterBar.hidden = !willOpen;
        filterToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });
    }

    bindCardMediaOnce();
    if ((embeddedReviews && embeddedReviews.length > 0) || (usesRemoteProxy() && totalCount > 0)) {
      fetchProxyPage(1, false);
    } else {
      applyLocal();
    }
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        currentPage = 1;
        pageCache = {};
        if ((embeddedReviews && embeddedReviews.length > 0) || (usesRemoteProxy() && totalCount > 0)) {
          fetchProxyPage(1, false, true);
        } else applyLocal();
        applyImageLimits();
        if (totalPages > 1) {
          if (pMobile) pMobile.classList.toggle("is-visible", true);
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
