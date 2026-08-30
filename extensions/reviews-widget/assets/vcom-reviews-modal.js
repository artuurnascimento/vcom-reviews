(function () {
  "use strict";
  if (window.__vcomReviewsModal) return;
  window.__vcomReviewsModal = true;

  var PROXY = "/apps/vcom-reviews/top-reviews";
  var PER_PAGE = 10;
  var modal = null;
  var page = 1;
  var totalPages = 1;
  var loading = false;

  function esc(v) {
    var d = document.createElement("div");
    d.textContent = v == null ? "" : String(v);
    return d.innerHTML;
  }

  function starsHtml(rating, cls) {
    var full = Math.round(Number(rating) || 0);
    var out = "";
    for (var i = 1; i <= 5; i++) out += '<i class="' + (i <= full ? "on" : "") + '"></i>';
    return '<div class="' + cls + '">' + out + "</div>";
  }

  function build() {
    var el = document.createElement("div");
    el.className = "vcom-rm";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Reviews");
    el.innerHTML =
      '<div class="vcom-rm__panel">' +
      '<button type="button" class="vcom-rm__close" aria-label="Close">&times;</button>' +
      '<div data-rm-header></div>' +
      '<div class="vcom-rm__list" data-rm-list></div>' +
      '<button type="button" class="vcom-rm__more" data-rm-more hidden>Load more reviews</button>' +
      "</div>";
    document.body.appendChild(el);

    el.querySelector(".vcom-rm__close").addEventListener("click", close);
    el.addEventListener("click", function (e) {
      if (e.target === el) close();
    });
    el.querySelector("[data-rm-more]").addEventListener("click", function () {
      if (page < totalPages) load(page + 1, true);
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
    var logo = modal.getAttribute("data-logo") || "";
    var rows = "";
    for (var s = 5; s >= 1; s--) {
      var n = parseInt(dist[s], 10) || 0;
      var pct = total > 0 ? Math.round((n / total) * 100) : 0;
      rows +=
        '<div class="vcom-rm__row"><span>' + s + "-star</span>" +
        '<span class="vcom-rm__bar"><span class="vcom-rm__fill" style="width:' + pct + '%"></span></span>' +
        '<span class="vcom-rm__pct">' + pct + "%</span></div>";
    }
    head.innerHTML =
      (logo ? '<img class="vcom-rm__logo" src="' + esc(logo) + '" alt="Trustpilot">' : "") +
      '<div class="vcom-rm__top">' +
      '<div class="vcom-rm__score"><div class="vcom-rm__num">' + esc(avg) + "</div>" +
      starsHtml(avg, "vcom-rm__stars") +
      '<div class="vcom-rm__label">' + esc(total) + " reviews</div></div>" +
      '<div class="vcom-rm__dist">' + rows + "</div></div>";
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
      '<div class="vcom-rm__head">' + starsHtml(r.rating, "vcom-rm__mini") +
      (r.verified_buyer ? '<span class="vcom-rm__vb">&#10003; Verified Buyer</span>' : "") +
      "</div>" +
      (r.title ? '<h3 class="vcom-rm__title">' + esc(r.title) + "</h3>" : "") +
      (r.body ? '<p class="vcom-rm__body">' + esc(r.body) + "</p>" : "") +
      pics +
      '<div class="vcom-rm__meta">' + esc(r.author || "") + (r.time ? " &middot; " + esc(r.time) : "") + "</div>" +
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

    fetch(PROXY + "?all=1&page=" + target + "&limit=" + PER_PAGE, {
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error(data && data.error ? data.error : "error");
        page = data.page || target;
        totalPages = data.total_pages || 1;
        if (!append) renderHeader(data);
        var html = (data.reviews || []).map(cardHtml).join("");
        if (append) list.insertAdjacentHTML("beforeend", html);
        else list.innerHTML = html || '<div class="vcom-rm__state">No reviews yet</div>';
        more.hidden = page >= totalPages;
        more.disabled = false;
      })
      .catch(function () {
        if (!append) {
          list.innerHTML = '<div class="vcom-rm__state">Could not load reviews.</div>';
        }
        more.disabled = false;
      })
      .finally(function () {
        loading = false;
      });
  }

  function open(trigger) {
    if (!modal) modal = build();
    var logo = trigger && trigger.closest(".vcom-footer-trustpilot");
    var img = logo && logo.querySelector(".vcom-footer-trustpilot__logo");
    if (img) modal.setAttribute("data-logo", img.getAttribute("src") || "");
    modal.classList.add("is-open");
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
