(function () {
  var SOCIAL_HREF =
    /instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|twitter\.com|x\.com|linkedin\.com|pinterest\.com|snapchat\.com|threads\.net/i;
  var SOCIAL_CLASS = /social|follow|share/i;
  var FOOTER_SELECTORS = [
    '#shopify-section-group-footer-group',
    '.shopify-section-group-footer-group',
    'footer.shopify-section',
    'section.shopify-section--footer',
    'footer[role="contentinfo"]',
    'footer',
    '[role="contentinfo"]',
    '#shopify-section-footer',
    '[id*="shopify-section"][id*="footer" i]',
    '#footer',
    '.site-footer',
    '.footer-group',
    'section[data-section-type="footer"]',
    '.section-footer',
  ];
  var HOST_HIDE =
    '.shopify-app-block,.shopify-block--apps,.footer__block--app,.vcom-footer-app-host,[class*="shopify-block"][id^="shopify-block-"]';

  function nativeHasContent(el) {
    if (!el) return false;
    return !!(el.querySelector('img, svg') || (el.textContent && el.textContent.trim().length > 8));
  }

  function showBadge(badge) {
    badge.classList.remove('vcom-footer-trustpilot--pending');
    badge.classList.add('vcom-footer-trustpilot--placed');
    badge.dataset.vcomPlaced = '1';
  }

  function isSocialLink(a) {
    if (!a || !a.getAttribute) return false;
    var href = a.getAttribute('href') || '';
    if (SOCIAL_HREF.test(href)) return true;
    var cls =
      (a.className || '') +
      ' ' +
      (a.parentElement && a.parentElement.className ? a.parentElement.className : '');
    if (SOCIAL_CLASS.test(cls) && href && href.indexOf('http') === 0) return true;
    var label = (a.getAttribute('aria-label') || '').toLowerCase();
    return /instagram|facebook|tiktok|youtube|twitter|linkedin|pinterest|social/.test(label);
  }

  function findFooterRoot() {
    var seen = [];
    var list = [];
    FOOTER_SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          if (seen.indexOf(el) < 0) {
            seen.push(el);
            list.push(el);
          }
        });
      } catch (e) {}
    });
    if (!list.length) return null;

    list.sort(function (a, b) {
      var aLinks = 0;
      var bLinks = 0;
      a.querySelectorAll('a[href]').forEach(function (lnk) {
        if (isSocialLink(lnk)) aLinks++;
      });
      b.querySelectorAll('a[href]').forEach(function (lnk) {
        if (isSocialLink(lnk)) bLinks++;
      });
      if (bLinks !== aLinks) return bLinks - aLinks;
      var aRect = a.getBoundingClientRect();
      var bRect = b.getBoundingClientRect();
      return bRect.height - aRect.height;
    });
    return list[0];
  }

  function socialClusterRoot(link) {
    var node = link.parentElement;
    var best = link.parentElement;
    while (node && node !== document.body) {
      var links = node.querySelectorAll('a[href]');
      var socialCount = 0;
      for (var i = 0; i < links.length; i++) {
        if (isSocialLink(links[i])) socialCount++;
      }
      if (socialCount >= 2) best = node;
      if (socialCount >= 4) break;
      node = node.parentElement;
    }
    return best;
  }

  function findSocialAnchor(footer) {
    var clusters = [];
    var links = footer.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (!isSocialLink(links[i])) continue;
      var root = socialClusterRoot(links[i]);
      if (!footer.contains(root)) continue;
      var found = false;
      for (var j = 0; j < clusters.length; j++) {
        if (clusters[j].root === root) {
          found = true;
          break;
        }
      }
      if (!found) clusters.push({ root: root, firstLink: links[i] });
    }
    if (!clusters.length) return null;

    clusters.sort(function (a, b) {
      var ra = a.root.getBoundingClientRect();
      var rb = b.root.getBoundingClientRect();
      if (Math.abs(ra.left - rb.left) > 40) return ra.left - rb.left;
      return ra.top - rb.top;
    });
    return clusters[0].root;
  }

  function findBrandColumn(footer, socialAnchor) {
    if (socialAnchor) return socialAnchor.parentElement || socialAnchor;

    var cols = footer.querySelectorAll(
      ':scope > * > *, [class*="footer"] [class*="column"], [class*="footer"] [class*="grid"] > *, [class*="footer__"] > *',
    );
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      if (col.tagName === 'SCRIPT' || col.tagName === 'STYLE') continue;
      var hasLogo = col.querySelector('img, svg, picture');
      var hasText = (col.textContent || '').trim().length > 20;
      if (!hasLogo && !hasText) continue;
      var r = col.getBoundingClientRect();
      var score = r.left * 3 + r.top;
      if (score < bestScore) {
        bestScore = score;
        best = col;
      }
    }
    return best;
  }

  function mountBelowSocial(socialAnchor, badge) {
    var stack = socialAnchor.closest('.vcom-footer-trustpilot-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'vcom-footer-trustpilot-stack';
      stack.setAttribute('data-vcom-trustpilot-stack', '1');
      var parent = socialAnchor.parentElement;
      if (!parent) return null;
      parent.insertBefore(stack, socialAnchor);
      stack.appendChild(socialAnchor);
    }

    var slot = stack.querySelector('.vcom-footer-trustpilot-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'vcom-footer-trustpilot-slot';
      stack.appendChild(slot);
    }

    if (!slot.contains(badge)) slot.appendChild(badge);
    return stack;
  }

  function hideHosts(footer, badge) {
    try {
      footer.querySelectorAll(HOST_HIDE).forEach(function (host) {
        if (host.contains(badge)) {
          host.setAttribute('hidden', 'hidden');
          host.style.cssText =
            'display:none !important;height:0;margin:0;padding:0;border:0;overflow:hidden;position:absolute;';
        }
      });
    } catch (e) {}
  }

  function placeFooterTrustpilot() {
    var badges = document.querySelectorAll('.vcom-footer-trustpilot--app');
    if (!badges.length) return;

    var footer = findFooterRoot();
    if (!footer) {
      badges.forEach(showBadge);
      return;
    }

    var native = footer.querySelector('.vcom-footer-trustpilot:not(.vcom-footer-trustpilot--app)');
    if (nativeHasContent(native)) {
      badges.forEach(function (el) {
        el.remove();
      });
      return;
    }

    var badge = badges[0];
    for (var d = 1; d < badges.length; d++) badges[d].remove();

    footer.querySelectorAll('.vcom-footer-trustpilot-slot').forEach(function (orphan) {
      if (!orphan.closest('.vcom-footer-trustpilot-stack')) {
        if (orphan.querySelector('.vcom-footer-trustpilot--app')) {
          orphan.parentElement && orphan.parentElement.removeChild(orphan);
        } else {
          orphan.remove();
        }
      }
    });

    var socialAnchor = findSocialAnchor(footer);
    var targetAfter = socialAnchor;
    var column = findBrandColumn(footer, socialAnchor);

    if (targetAfter) {
      mountBelowSocial(targetAfter, badge);
      badge.dataset.vcomPlacement = 'after-social';
    } else if (column) {
      if (!column.contains(badge)) column.appendChild(badge);
      badge.dataset.vcomPlacement = 'brand-column';
    } else {
      if (!footer.contains(badge)) footer.appendChild(badge);
      badge.dataset.vcomPlacement = 'footer-fallback';
    }

    showBadge(badge);
    hideHosts(footer, badge);
  }

  function schedulePlace() {
    placeFooterTrustpilot();
    window.setTimeout(placeFooterTrustpilot, 200);
    window.setTimeout(placeFooterTrustpilot, 800);
    window.setTimeout(placeFooterTrustpilot, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedulePlace);
  } else {
    schedulePlace();
  }
  document.addEventListener('shopify:section:load', schedulePlace);
})();
