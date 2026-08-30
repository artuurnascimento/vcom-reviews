(function () {
  "use strict";
  if (window.__vcomReviewsModal) return;
  window.__vcomReviewsModal = true;

  var PROXY = "/apps/vcom-reviews/top-reviews";
  var PER_PAGE = 10;
  var AVATAR_COLORS = ["#f2c94c", "#6fcf97", "#56ccf2", "#bb6bd9", "#f2994a", "#eb5757"];
  var modal = null;
  var meta = { name: "", url: "/", category: "", logo: "" };
  var page = 1;
  var totalPages = 1;
  var loading = false;

  function esc(v) {
    var d = document.createElement("div");
    d.textContent = v == null ? "" : String(v);
    return d.innerHTML;
  }

  function nfmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function starsHtml(rating, cls) {
    var full = Math.round(Number(rating) || 0);
    var out = "";
    for (var i = 1; i <= 5; i++) out += '<i class="' + (i <= full ? "on" : "") + '"></i>';
    return '<div class="' + cls + '">' + out + "</div>";
  }

  function scoreWord(avg) {
    var n = Number(avg) || 0;
    if (n >= 4.3) return "Excellent";
    if (n >= 3.5) return "Great";
    if (n >= 2.5) return "Average";
    if (n >= 1.5) return "Poor";
    return "Bad";
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    var a = parts[0].charAt(0);
    var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  }

  function colorFor(name) {
    var sum = 0;
    var s = String(name || "");
    for (var i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
  }

  function build() {
    var el = document.createElement("div");
    el.className = "vcom-rm";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML =
      '<div class="vcom-rm__panel">' +
      '<button type="button" class="vcom-rm__close" aria-label="Close">&times;</button>' +
      '<div data-rm-header></div>' +
      '<h2 class="vcom-rm__sec" data-rm-sec hidden>Reviews</h2>' +
      '<div class="vcom-rm__list" data-rm-list></div>' +
      '<button type="button" class="vcom-rm__more" data-rm-more hidden>See more reviews</button>' +
      "</div>";
    document.body.appendChild(el);

    el.querySelector(".vcom-rm__close").addEventListener("click", close);
    el.addEventListener("click", function (e) {
      if (e.target === el) close();
    });
    el.querySelector("[data-rm-more]").addEventListener("click", function () {
      if (page < totalPages) load(page + 1, true);
    });
    el.addEventListener("click", function (e) {
      var w = e.target.closest && e.target.closest("[data-rm-write]");
      if (!w) return;
      close();
      var form = document.querySelector(".pr-w, [data-vcom-write-review]");
      if (form) form.click();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && el.classList.contains("is-open")) close();
    });
    return el;
  }

  function renderHeader(data) {
    var head = modal.querySelector("[data-rm-header]");
    var total = data.total || data.count || 0;
    var avg = data.avg_all || data.avg || 0;
    var dist = data.dist || {};
    var rows = "";
    for (var s = 5; s >= 1; s--) {
      var n = parseInt(dist[s], 10) || 0;
      var pct = total > 0 ? Math.round((n / total) * 100) : 0;
      rows +=
        '<div class="vcom-rm__row" data-s="' + s + '"><span>' + s + "-star</span>" +
        '<span class="vcom-rm__bar"><span class="vcom-rm__fill" style="width:' + pct + '%"></span></span>' +
        '<span class="vcom-rm__pct">' + pct + "%</span></div>";
    }

    var avatar = meta.logo
      ? '<span class="vcom-rm__avatar"><img src="' + esc(meta.logo) + '" alt=""></span>'
      : '<span class="vcom-rm__avatar">' + esc(initials(meta.name)) + "</span>";

    var canWrite = !!document.querySelector(".pr-w, [data-vcom-write-review]");

    head.innerHTML =
      '<div class="vcom-rm__biz">' +
      '<div class="vcom-rm__bizrow">' + avatar +
      '<a class="vcom-rm__visit" href="' + esc(meta.url) + '">Visit website &#8599;</a></div>' +
      '<h2 class="vcom-rm__name">' + esc(meta.name) + "</h2>" +
      '<div class="vcom-rm__facts"><u>Reviews ' + nfmt(total) + "</u> &middot; " +
      starsHtml(avg, "vcom-rm__mini") + "<strong>" + esc(avg) + "</strong></div>" +
      (meta.category ? '<p class="vcom-rm__cat">' + esc(meta.category) + "</p>" : "") +
      "</div>" +
      (canWrite ? '<button type="button" class="vcom-rm__write" data-rm-write><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Write a review</button>' : "") +
      '<div class="vcom-rm__box">' +
      '<div class="vcom-rm__score">' +
      '<div class="vcom-rm__num">' + esc(avg) + "</div>" +
      '<div class="vcom-rm__word">' + esc(scoreWord(avg)) + "</div>" +
      starsHtml(avg, "vcom-rm__stars") +
      '<div class="vcom-rm__label">' + nfmt(total) + " reviews</div></div>" +
      '<div class="vcom-rm__dist">' + rows + "</div></div>";

    // Resumo automatico + assuntos mais citados (calculados sobre as avaliacoes reais)
    var extra = "";
    if (data.summary_text) {
      extra +=
        '<h3 class="vcom-rm__h3">Review summary</h3>' +
        '<p class="vcom-rm__ai">&#10022; Generated automatically from this store\u2019s reviews</p>' +
        '<p class="vcom-rm__sum">' + esc(data.summary_text) + "</p>";
    }
    if (data.themes && data.themes.length) {
      var cards = data.themes
        .slice(0, 3)
        .map(function (t) {
          return (
            '<div class="vcom-rm__theme"><div class="vcom-rm__themeh">' + esc(t.label) + "</div>" +
            '<div class="vcom-rm__themec">Mentioned in ' + nfmt(t.count) + " reviews</div>" +
            (t.sample ? '<p class="vcom-rm__themes">&ldquo;' + esc(t.sample) + '&rdquo;</p>' : "") +
            "</div>"
          );
        })
        .join("");
      extra +=
        '<h3 class="vcom-rm__h3">What people talk about most</h3>' +
        '<div class="vcom-rm__themes-wrap">' + cards + "</div>";
    }
    if (extra) head.insertAdjacentHTML("beforeend", extra);

    var sec = modal.querySelector("[data-rm-sec]");
    sec.hidden = false;
    sec.textContent = "Reviews";
  }

  function cardHtml(r) {
    var pics = "";
    if (r.images && r.images.length) {
      pics = '<div class="vcom-rm__pics">';
      for (var i = 0; i < r.images.length && i < 5; i++) {
        pics += '<img src="' + esc(r.images[i]) + '" alt="" loading="lazy">';
      }
      pics += "</div>";
    }
    var prod = "";
    if (r.product && r.product.title) {
      var img = r.product.image ? '<img src="' + esc(r.product.image) + '" alt="">' : "";
      prod = r.product.url
        ? '<a class="vcom-rm__prod" href="' + esc(r.product.url) + '">' + img + "<span>" + esc(r.product.title) + "</span></a>"
        : '<div class="vcom-rm__prod">' + img + "<span>" + esc(r.product.title) + "</span></div>";
    }
    return (
      '<article class="vcom-rm__card">' +
      '<div class="vcom-rm__who">' +
      '<span class="vcom-rm__ini" style="background:' + colorFor(r.author) + '">' + esc(initials(r.author)) + "</span>" +
      "<span><span class=\"vcom-rm__nm\">" + esc(r.author || "") + "</span><br>" +
      '<span class="vcom-rm__dt">' + esc(r.time || "") + "</span></span></div>" +
      '<div style="display:flex">' + starsHtml(r.rating, "vcom-rm__mini") +
      (r.verified_buyer ? '<span class="vcom-rm__vb">&#10003; Verified</span>' : "") + "</div>" +
      (r.title ? '<h3 class="vcom-rm__title">' + esc(r.title) + "</h3>" : "") +
      (r.body ? '<p class="vcom-rm__body">' + esc(r.body) + "</p>" : "") +
      pics +
      prod +
      "</article>"
    );
  }

  function load(target, append) {
    if (loading) return;
    loading = true;
    var list = modal.querySelector("[data-rm-list]");
    var more = modal.querySelector("[data-rm-more]");
    if (!append) list.innerHTML = '<div class="vcom-rm__state">Loading reviews…</div>';
    more.disabled = true;

    fetch(PROXY + "?all=1&page=" + target + "&limit=" + PER_PAGE, { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error("error");
        page = data.page || target;
        totalPages = data.total_pages || 1;
        if (!append) renderHeader(data);
        var html = (data.reviews || []).map(cardHtml).join("");
        if (append) list.insertAdjacentHTML("beforeend", html);
        else list.innerHTML = html || '<div class="vcom-rm__state">No reviews yet</div>';
        more.hidden = page >= totalPages;
        more.innerHTML = "See all " + nfmt(data.total || data.count || 0) + " reviews &#8595;";
        more.disabled = false;
      })
      .catch(function () {
        if (!append) list.innerHTML = '<div class="vcom-rm__state">Could not load reviews.</div>';
        more.disabled = false;
      })
      .finally(function () {
        loading = false;
      });
  }

  /** Favicon da loja (quadrado, cabe no circulo). Pede versao maior ao CDN. */
  function findFavicon() {
    var links = document.querySelectorAll(
      'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]',
    );
    var best = "";
    var bestSize = 0;
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href");
      if (!href) continue;
      var rel = (links[i].getAttribute("rel") || "").toLowerCase();
      var size = parseInt(links[i].getAttribute("sizes") || "", 10);
      if (!size) size = rel.indexOf("apple-touch") !== -1 ? 180 : 32;
      if (size > bestSize) {
        bestSize = size;
        best = href;
      }
    }
    if (!best) best = "/favicon.ico";
    var url;
    try {
      url = new URL(best, window.location.origin);
    } catch (e) {
      return best;
    }
    // Favicon do Shopify vem em 32px; pede 180px para nao borrar no circulo.
    if (url.hostname.indexOf("shopify") !== -1 || url.pathname.indexOf("/cdn/shop") !== -1) {
      url.searchParams.set("width", "180");
    }
    return url.href;
  }

  function open(trigger) {
    if (!modal) modal = build();
    meta.name = trigger.getAttribute("data-shop-name") || document.title;
    meta.url = trigger.getAttribute("data-shop-url") || "/";
    meta.category = trigger.getAttribute("data-shop-category") || "";
    meta.logo = findFavicon();
    modal.classList.add("is-open");
    modal.scrollTop = 0;
    document.body.style.overflow = "hidden";
    page = 1;
    load(1, false);
  }

  function close() {
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-vcom-reviews-modal]");
    if (!btn) return;
    e.preventDefault();
    open(btn);
  });
})();
