(function () {
  "use strict";
  if (window.__vcomReviewsModal) return;
  window.__vcomReviewsModal = true;

  var PROXY = "/apps/vcom-reviews/top-reviews";
  var PER_PAGE = 10;
  var AVATAR_COLORS = ["#f2c94c", "#6fcf97", "#56ccf2", "#bb6bd9", "#f2994a", "#eb5757"];
  var modal = null;
  var meta = { name: "", url: "/", category: "", logo: "", appLogo: "" };
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

  var STAR_PATH =
    "M9.2 27L16 21.807 22.797 27 20.202 18.596 27 13.403h-8.402L16 5l-2.597 8.403H5l6.798 5.193L9.2 27z";
  var STAR_ON = "#00b67a";
  var STAR_OFF = "#dcdce6";

  /** Mesmo SVG das estrelas usadas nos blocos do app (quadrado + estrela branca). */
  function starSvg(fillWidth) {
    var partial =
      fillWidth > 0 && fillWidth < 32
        ? '<rect width="' + fillWidth + '" height="32" fill="' + STAR_ON + '"/>'
        : "";
    var base = fillWidth >= 32 ? STAR_ON : STAR_OFF;
    return (
      '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect width="32" height="32" fill="' + base + '"/>' +
      partial +
      '<path d="' + STAR_PATH + '" fill="#fff"/></svg>'
    );
  }

  function starsHtml(rating, cls) {
    var value = Number(rating) || 0;
    var out = "";
    for (var i = 0; i < 5; i++) {
      var diff = value - i;
      var w = diff >= 1 ? 32 : diff > 0 ? Math.round(diff * 32) : 0;
      out += starSvg(w);
    }
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

  /**
   * Descobre a cor de fundo do favicon (amostra as bordas) e aplica no circulo,
   * para um favicon escuro virar um circulo escuro e um claro, claro.
   */
  function applyAvatarBackground(img, holder) {
    if (!img || !holder) return;
    try {
      var n = 24;
      var canvas = document.createElement("canvas");
      canvas.width = n;
      canvas.height = n;
      var ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, n, n);
      var mid = Math.floor(n / 2);
      var pts = [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [mid, 0], [0, mid], [mid, n - 1], [n - 1, mid]];
      var r = 0, g = 0, b = 0, used = 0;
      for (var i = 0; i < pts.length; i++) {
        var d = ctx.getImageData(pts[i][0], pts[i][1], 1, 1).data;
        if (d[3] < 20) continue;
        r += d[0];
        g += d[1];
        b += d[2];
        used++;
      }
      if (!used) return;
      r = Math.round(r / used);
      g = Math.round(g / used);
      b = Math.round(b / used);
      holder.style.background = "rgb(" + r + "," + g + "," + b + ")";
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      holder.style.borderColor = lum < 0.5 ? "rgba(255,255,255,.22)" : "#e6e9ee";
    } catch (e) {
      /* canvas bloqueado por CORS: mantem o fundo padrao */
    }
  }

  function build() {
    var el = document.createElement("div");
    el.className = "vcom-rm";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML =
      '<div class="vcom-rm__panel">' +
      '<header class="vcom-rm__topbar">' +
      '<span class="vcom-rm__brand" data-rm-brand></span>' +
      '<button type="button" class="vcom-rm__close" aria-label="Close">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      "</button></header>" +
      '<nav class="vcom-rm__crumbs" data-rm-crumbs></nav>' +
      '<div class="vcom-rm__sheet">' +
      '<div data-rm-header></div>' +
      '<h2 class="vcom-rm__sec" data-rm-sec hidden>Reviews</h2>' +
      '<div class="vcom-rm__list" data-rm-list></div>' +
      '<button type="button" class="vcom-rm__more" data-rm-more hidden>See more reviews</button>' +
      "</div></div>";
    document.body.appendChild(el);

    el.querySelector(".vcom-rm__close").addEventListener("click", close);
    el.addEventListener("click", function (e) {
      if (e.target === el) close();
    });
    el.querySelector("[data-rm-more]").addEventListener("click", function () {
      if (page < totalPages) load(page + 1, true);
    });
    el.addEventListener("click", function (e) {
      var tg = e.target.closest && e.target.closest("[data-rm-note-toggle]");
      if (tg) {
        var body = el.querySelector("[data-rm-note-body]");
        var open = tg.getAttribute("aria-expanded") === "true";
        tg.setAttribute("aria-expanded", open ? "false" : "true");
        if (body) body.hidden = open;
        return;
      }
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

    // Linhas de informacao (mesmo layout do print, com fatos reais da loja)
    var happyPct = 0;
    if (total > 0) {
      happyPct = Math.round((((dist[4] || 0) + (dist[5] || 0)) / total) * 100);
    }
    var ICON_SEND =
      '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>';
    var ICON_CHAT =
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>';
    var ICON_CHART =
      '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>';

    function infoRow(icon, title, sub, aside) {
      return (
        '<div class="vcom-rm__info">' +
        '<span class="vcom-rm__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        icon + "</svg></span>" +
        '<div class="vcom-rm__infotxt"><div class="vcom-rm__infoh">' + title + "</div>" +
        '<div class="vcom-rm__infos">' + sub + "</div></div>" +
        (aside || "") +
        "</div>"
      );
    }

    var infoHtml =
      '<div class="vcom-rm__infos-wrap">' +
      infoRow(
        ICON_SEND,
        "Open to every customer",
        "Any buyer can leave a review straight from the product page.",
      ) +
      infoRow(
        ICON_CHAT,
        esc(happyPct) + "% rated 4 stars or higher",
        "Based on " + nfmt(total) + " published reviews.",
      ) +
      infoRow(
        ICON_CHART,
        "How these reviews are shown",
        "Newest first, with the customer photos and the product each review refers to.",
      ) +
      "</div>" +
      '<div class="vcom-rm__note" data-rm-note>' +
      '<button type="button" class="vcom-rm__noteh" data-rm-note-toggle aria-expanded="false">' +
      '<span class="vcom-rm__noteico">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0.602 24 28.8" aria-hidden="true">' +
      '<path fill="#7AA0E9" d="M24 20.542V5.69a2.76 2.76 0 0 0-1.697-2.533C14.13-.34 9.131-.156 1.663 3.148A2.76 2.76 0 0 0 0 5.666V20.52c0 .93.48 1.8 1.284 2.333l9.128 6.036a3.14 3.14 0 0 0 3.46-.02l8.873-6.015C23.533 22.322 24 21.46 24 20.543"/>' +
      '<path fill="#4E81E5" fill-rule="evenodd" d="M22.5 20.542V5.69c0-.553-.33-1.03-.814-1.237-3.978-1.702-7.048-2.449-9.957-2.429-2.906.02-5.801.806-9.433 2.413-.474.21-.796.681-.796 1.229V20.52c0 .465.24.9.642 1.166l9.128 6.037c.52.344 1.214.34 1.73-.01l8.872-6.015a1.4 1.4 0 0 0 .628-1.157M24 5.69v14.852c0 .918-.467 1.78-1.255 2.313l-8.872 6.016c-1.033.7-2.42.708-3.461.02l-9.128-6.037C.479 22.322 0 21.45 0 20.52V5.666c0-1.074.635-2.064 1.662-2.518C9.131-.156 14.13-.34 22.304 3.158A2.76 2.76 0 0 1 24 5.69" clip-rule="evenodd"/>' +
      '<path fill="#1C1C1C" d="m12 5.398 1.975 6.393H20.4l-5.175 3.962-3.2 2.43-5.2 3.963L8.8 15.753l-5.2-3.962h6.425zM15.65 17.232 12 18.21l5.175 3.988z"/>' +
      "</svg></span>" +
      '<span class="vcom-rm__notet">Reviews here are published by ' + esc(meta.name) +
      ", and the score is calculated automatically</span>" +
      '<span class="vcom-rm__chev" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
      "</span></button>" +
      '<div class="vcom-rm__notebody" data-rm-note-body hidden>' +
      "<p>Every review on this page was published by the store. The overall score and the star distribution above are recalculated automatically from all " +
      nfmt(total) + " published reviews \u2014 nothing is set by hand.</p>" +
      "<p>Reviews may include customer photos, the product they refer to and a \u201cVerified Buyer\u201d label applied by the store. " +
      "If you believe a review is inaccurate, get in touch through the store\u2019s contact channels and it will be reviewed.</p>" +
      "</div></div>";

    // Resumo automatico + assuntos mais citados (calculados sobre as avaliacoes reais)
    var extra = infoHtml;
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

    var avatarImg = head.querySelector(".vcom-rm__avatar img");
    if (avatarImg) {
      var holder = avatarImg.parentNode;
      avatarImg.crossOrigin = "anonymous";
      if (avatarImg.complete && avatarImg.naturalWidth > 0) {
        applyAvatarBackground(avatarImg, holder);
      } else {
        avatarImg.addEventListener("load", function () {
          applyAvatarBackground(avatarImg, holder);
        });
      }
    }

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
    meta.appLogo = trigger.getAttribute("data-app-logo") || "";
    var brand = modal.querySelector("[data-rm-brand]");
    if (brand) {
      brand.innerHTML =
        (meta.appLogo ? '<img src="' + esc(meta.appLogo) + '" alt="">' : "") +
        "<span>VCOM Reviews</span>";
    }
    var crumbs = modal.querySelector("[data-rm-crumbs]");
    if (crumbs) {
      crumbs.innerHTML =
        '<span class="vcom-rm__dots">&bull;&bull;&bull;</span><span>&rsaquo;</span>' +
        "<span>" + esc(meta.category || "Reviews") + "</span><span>&rsaquo;</span>" +
        '<span class="vcom-rm__crumb-now">' + esc(meta.name) + "</span>";
    }
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
