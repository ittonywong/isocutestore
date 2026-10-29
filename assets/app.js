/* 3D Shop preview — DEMO localStorage + optional Supabase Auth */
(function () {
  "use strict";
  var C = window.SHOP_CONFIG || {};
  var L = window.I18N || {};
  var LANGS = ["en", "zh-Hant", "zh-Hans", "ja", "mi", "ko"];
  var KEY_LANG = "shop.lang", KEY_FS = "shop.fs", KEY_CUR = "shop.cur";
  var KEY_CART = "shop.cart", KEY_SESSION = "shop.demo.session";
  var KEY_PRODUCTS = "shop.demo.products";
  var MINPW = Math.max(6, parseInt(C.MIN_PASSWORD_LENGTH, 10) || 8);
  var page = document.body.getAttribute("data-page") || "";
  var lang = store(KEY_LANG);
  if (LANGS.indexOf(lang) < 0) lang = "en";
  var currency = store(KEY_CUR) === "NZD" ? "NZD" : "HKD";
  var seedProducts = null;
  var sb = null;

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function $(id) { return document.getElementById(id); }
  function qsa(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function t(k, vars) {
    var s = (L[lang] && L[lang][k]) || (L.en && L.en[k]) || k;
    vars = vars || {};
    if (vars.n === undefined) vars.n = MINPW;
    for (var v in vars) s = String(s).split("{" + v + "}").join(vars[v]);
    return s;
  }
  function money(p) {
    var n = currency === "NZD" ? Number(p.price_nzd) : Number(p.price_hkd);
    if (!isFinite(n)) n = 0;
    return currency + " " + n.toFixed(currency === "NZD" ? 2 : 0);
  }
  function pname(p) {
    return (lang.indexOf("zh") === 0 ? (p.name_zh || p.name_en) : (p.name_en || p.name_zh)) || p.id;
  }
  function pdesc(p) {
    return (lang.indexOf("zh") === 0 ? (p.desc_zh || p.desc_en) : (p.desc_en || p.desc_zh)) || "";
  }
  function pstock(p) {
    return (lang.indexOf("zh") === 0 ? (p.stock_note_zh || p.stock_note_en) : (p.stock_note_en || p.stock_note_zh)) || "";
  }

  var LCODE = { "zh-Hant": "繁", "zh-Hans": "简", en: "EN", ja: "日", mi: "Mā", ko: "한" };
  function applyI18n() {
    document.documentElement.lang = lang;
    qsa("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    qsa("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    var tk = document.body.getAttribute("data-title");
    document.title = (tk ? t(tk) + " | " : "") + t("appName");
    var sel = $("lang"); if (sel) sel.value = lang;
    var lc = $("lcodeT"); if (lc) lc.textContent = LCODE[lang] || lang;
    qsa(".cur button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-cur") === currency ? "true" : "false");
    });
  }
  function setFs(n) {
    n = String(n); if (["0", "1", "2"].indexOf(n) < 0) n = "1";
    document.documentElement.className = document.documentElement.className.replace(/\bfs\d\b/g, "").trim() + " fs" + n;
    qsa(".fs button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-fs") === n ? "true" : "false"); });
    store(KEY_FS, n);
  }
  function setCur(c) {
    currency = c === "NZD" ? "NZD" : "HKD";
    store(KEY_CUR, currency);
    applyI18n();
    if (window.__shopRender) window.__shopRender();
    updateCartBadge();
  }

  function demoMode() { return C.DEMO_MODE !== false; }

  function keyIsSecret(k) {
    if (/^sb_secret_/i.test(k)) return true;
    var p = String(k).split(".");
    if (p.length === 3) {
      try {
        var j = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (j && j.role && j.role !== "anon") return true;
      } catch (e) {}
    }
    return false;
  }
  function configState() {
    if (demoMode()) return "demo";
    var u = String(C.SUPABASE_URL || "").trim(), k = String(C.SUPABASE_ANON_KEY || "").trim();
    if (!/^https:\/\/[^\s/]+/i.test(u) || /YOUR[-_]/i.test(u) || k.length < 20 || /YOUR[-_]/i.test(k)) return "none";
    if (keyIsSecret(k)) return "secret";
    return "ok";
  }

  /* ---------- session (demo) ---------- */
  function getSession() {
    if (!demoMode()) return null;
    try { return JSON.parse(store(KEY_SESSION) || "null"); } catch (e) { return null; }
  }
  function setSession(s) {
    if (s) store(KEY_SESSION, JSON.stringify(s));
    else store(KEY_SESSION, null);
    updateAuthNav();
  }
  function currentUser() {
    if (demoMode()) return getSession();
    return window.__sbUser || null;
  }
  function isAdmin(u) {
    u = u || currentUser();
    if (!u) return false;
    if (demoMode()) return u.role === "admin" || String(u.email).toLowerCase() === String(C.DEMO_ADMIN_EMAIL || "admin@demo.local").toLowerCase();
    return u.role === "admin";
  }

  /* ---------- cart ---------- */
  function getCart() {
    try { return JSON.parse(store(KEY_CART) || "{}") || {}; } catch (e) { return {}; }
  }
  function setCart(c) { store(KEY_CART, JSON.stringify(c || {})); updateCartBadge(); }
  function cartCount() {
    var c = getCart(), n = 0;
    Object.keys(c).forEach(function (id) { n += Number(c[id]) || 0; });
    return n;
  }
  function addToCart(id, qty) {
    var c = getCart();
    c[id] = (Number(c[id]) || 0) + (qty || 1);
    if (c[id] <= 0) delete c[id];
    setCart(c);
  }
  function updateCartBadge() {
    var n = cartCount();
    qsa("[data-cart-count]").forEach(function (el) {
      el.textContent = n ? String(n) : "";
      el.hidden = !n;
    });
  }

  /* ---------- products ---------- */
  function loadSeed() {
    return fetch(new URL("data/products.json", document.baseURI).href, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (arr) { seedProducts = arr; return arr; });
  }
  function getProducts() {
    if (demoMode()) {
      try {
        var raw = store(KEY_PRODUCTS);
        if (raw) {
          var cached = JSON.parse(raw);
          return loadSeed().then(function (seed) {
            var byId = {};
            (seed || []).forEach(function (s) { byId[s.id] = s; });
            cached.forEach(function (p) {
              if (!p.category && byId[p.id] && byId[p.id].category) p.category = byId[p.id].category;
            });
            return cached;
          }).catch(function () { return cached; });
        }
      } catch (e) {}
      return loadSeed().then(function (arr) {
        store(KEY_PRODUCTS, JSON.stringify(arr));
        return arr.slice();
      });
    }
    /* Live mode: read from Supabase products table when wired */
    if (sb) {
      return sb.from("products").select("*").eq("active", true).order("sort")
        .then(function (res) {
          if (res.error) throw res.error;
          return (res.data || []).map(mapRow);
        });
    }
    return loadSeed();
  }
  function mapRow(r) {
    return {
      id: r.id, slug: r.slug || r.id,
      name_en: r.name_en, name_zh: r.name_zh,
      desc_en: r.desc_en, desc_zh: r.desc_zh,
      price_hkd: r.price_hkd, price_nzd: r.price_nzd,
      image: r.image, image_alt: r.image_alt,
      stock_note_en: r.stock_note_en, stock_note_zh: r.stock_note_zh,
      category: r.category || "", warnings: r.warnings || [], active: r.active !== false, sort: r.sort || 0
    };
  }
  function saveProducts(arr) {
    if (!demoMode()) return Promise.reject(new Error("live write via CMS only with admin RLS"));
    store(KEY_PRODUCTS, JSON.stringify(arr));
    return Promise.resolve();
  }
  function getProduct(id) {
    return getProducts().then(function (arr) {
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id || arr[i].slug === id) return arr[i];
      return null;
    });
  }

  function warnBadges(p) {
    var html = "";
    (p.warnings || []).forEach(function (w) {
      var cls = w === "battery" ? "battery" : w === "age_14" ? "age" : "";
      html += '<span class="wbadge ' + cls + '">' + esc(t("badge_" + w)) + "</span>";
    });
    return html ? '<div class="wbadges">' + html + "</div>" : "";
  }
  function warnList(p) {
    if (!p.warnings || !p.warnings.length) return "";
    var lis = p.warnings.map(function (w) { return "<li>" + esc(t("warn_" + w)) + "</li>"; }).join("");
    return '<div class="warn-box"><strong>' + esc(t("warningsTitle")) + "</strong><ul>" + lis + "</ul></div>";
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }


  var CATEGORIES = [
    { id: "fidget", icon: "●" },
    { id: "desk", icon: "■" },
    { id: "stands", icon: "▲" },
    { id: "concept", icon: "◆" }
  ];

  function renderHeader() {
    var host = $("siteHeader");
    if (!host) return;
    var globe = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.3"/><path d="M1.7 8h12.6M8 1.7c-3.2 3.6-3.2 9 0 12.6M8 1.7c3.2 3.6 3.2 9 0 12.6"/></g></svg>';
    host.innerHTML =
      '<a class="brand" href="index.html"><span class="dot" aria-hidden="true"></span><span data-i18n="appName">3D Shop</span></a>' +
      '<nav class="nav-primary" aria-label="Primary">' +
      '<a href="index.html" class="nav-shop" data-nav="shop" data-i18n="navShop" data-categories-ready="true">Shop</a>' +
      "</nav>" +
      '<div class="top-right">' +
      '<div class="ctrl">' +
      '<div class="cur" role="group" aria-label="Currency" data-i18n-aria="currency">' +
      '<button type="button" data-cur="HKD" aria-pressed="true">HKD</button>' +
      '<button type="button" data-cur="NZD" aria-pressed="false">NZD</button></div>' +
      '<div class="langw"><label class="sr" for="lang" data-i18n="langLabel">Language</label>' +
      '<span class="lcode" aria-hidden="true">' + globe + '<span id="lcodeT">EN</span></span>' +
      '<select id="lang"><option value="en" lang="en">English</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option>' +
      '<option value="zh-Hans" lang="zh-Hans">简体中文</option><option value="ja" lang="ja">日本語</option>' +
      '<option value="mi" lang="mi">Te reo Māori</option><option value="ko" lang="ko">한국어</option></select></div>' +
      '<div class="fs" role="group" aria-label="Text size" data-i18n-aria="fsLabel">' +
      '<button type="button" data-fs="0" aria-label="A−" aria-pressed="false">A−</button>' +
      '<button type="button" data-fs="1" aria-label="A" aria-pressed="true">A</button>' +
      '<button type="button" data-fs="2" aria-label="A+" aria-pressed="false">A+</button></div>' +
      "</div>" +
      '<div class="util" role="group" aria-label="Account and cart">' +
      '<a class="util-link" href="login.html" data-auth="out" data-i18n="navLogin">Log in</a>' +
      '<div class="acct" data-auth="in" hidden>' +
      '<button type="button" class="acct-btn" id="acctBtn" aria-expanded="false" aria-haspopup="true" aria-controls="acctMenu">' +
      '<span data-i18n="navAccount">Account</span></button>' +
      '<div class="acct-menu" id="acctMenu" role="menu" hidden>' +
      '<a role="menuitem" href="account.html" data-i18n="navMembers">Members</a>' +
      '<a role="menuitem" href="admin.html" data-auth="admin" data-i18n="navAdmin" hidden>CMS</a>' +
      '<button type="button" role="menuitem" class="acct-logout" id="headerLogout" data-i18n="logout">Log out</button>' +
      "</div></div>" +
      '<a class="cart-link" href="cart.html" data-i18n-aria="navCart" aria-label="Cart">' +
      '<span data-i18n="navCart">Cart</span><span class="badge-n" data-cart-count hidden></span></a>' +
      "</div></div>";
    host.removeAttribute("aria-busy");
    /* Account dropdown */
    var btn = $("acctBtn"), menu = $("acctMenu");
    if (btn && menu) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = menu.hidden;
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("click", function () {
        if (!menu.hidden) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
      });
      menu.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    var hl = $("headerLogout");
    if (hl) hl.addEventListener("click", function () {
      setSession(null);
      if (!demoMode() && sb) sb.auth.signOut();
      location.href = "index.html";
    });
  }

  function renderCatEntry() {
    var grid = $("catGrid"); if (!grid) return;
    grid.innerHTML = CATEGORIES.map(function (c) {
      return '<a class="cat-card" href="index.html?cat=' + encodeURIComponent(c.id) + '#productGrid">' +
        '<span class="cat-icon" aria-hidden="true">' + c.icon + "</span>" +
        '<span class="cat-name" data-i18n="cat_' + c.id + '">' + esc(t("cat_" + c.id)) + "</span>" +
        '<span class="cat-hint" data-i18n="catHint_' + c.id + '">' + esc(t("catHint_" + c.id)) + "</span></a>";
    }).join("");
  }

  function activeCat() {
    try { return new URLSearchParams(location.search).get("cat") || ""; } catch (e) { return ""; }
  }

  function msg(id, key, type, vars) {
    var el = $(id || "msg"); if (!el) return;
    if (!key) { el.hidden = true; return; }
    el.className = "msg " + (type || "info");
    el.setAttribute("role", type === "err" ? "alert" : "status");
    el.textContent = t(key, vars); el.hidden = false;
  }

  function updateAuthNav() {
    var u = currentUser();
    qsa("[data-auth=in]").forEach(function (el) { el.hidden = !u; });
    qsa("[data-auth=out]").forEach(function (el) { el.hidden = !!u; });
    qsa("[data-auth=admin]").forEach(function (el) { el.hidden = !isAdmin(u); });
    qsa("[data-user-email]").forEach(function (el) { el.textContent = u ? u.email : ""; });
    qsa(".nav-shop").forEach(function (el) {
      if (page === "shop" || page === "home" || page === "product") el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  function requireLogin(returnTo) {
    var u = currentUser();
    if (u) return Promise.resolve(u);
    var next = returnTo || (location.pathname.split("/").pop() + location.search);
    location.href = "login.html?return=" + encodeURIComponent(next);
    return Promise.reject(new Error("login"));
  }

  /* ---------- pages ---------- */
  function renderShop() {
    var root = $("productGrid"); if (!root) return;
    renderCatEntry();
    getProducts().then(function (arr) {
      var cat = activeCat();
      var note = $("catFilterNote");
      if (note) {
        if (cat) {
          note.hidden = false;
          note.innerHTML = esc(t("filteringBy", { cat: t("cat_" + cat) })) +
            ' <a href="index.html#productGrid">' + esc(t("clearFilter")) + "</a>";
        } else { note.hidden = true; note.textContent = ""; }
      }
      var active = arr.filter(function (p) {
        if (p.active === false) return false;
        if (cat && p.category && p.category !== cat) return false;
        return true;
      }).sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
      if (!active.length) { root.innerHTML = '<p class="empty">' + esc(t("cartEmpty")) + "</p>"; return; }
      root.innerHTML = active.map(function (p) {
        return '<article class="pcard" data-id="' + esc(p.id) + '">' +
          warnBadges(p) +
          '<a class="thumb" href="product.html?id=' + encodeURIComponent(p.id) + '"><img src="' + esc(p.image) + '" alt="' + esc(pname(p)) + '" loading="lazy"></a>' +
          '<div class="body"><h2><a href="product.html?id=' + encodeURIComponent(p.id) + '">' + esc(pname(p)) + "</a></h2>" +
          '<div class="price">' + esc(money(p)) + ' <span class="meta">(' + esc(t("priceDemo")) + ")</span></div>" +
          '<div class="meta">' + esc(pstock(p)) + "</div>" +
          '<div class="actions">' +
          '<a class="btn secondary" href="product.html?id=' + encodeURIComponent(p.id) + '">' + esc(t("viewProduct")) + "</a>" +
          '<button type="button" class="btn primary" data-add="' + esc(p.id) + '">' + esc(t("addCart")) + "</button>" +
          "</div></div></article>";
      }).join("");
      qsa("[data-add]", root).forEach(function (b) {
        b.addEventListener("click", function () {
          addToCart(b.getAttribute("data-add"), 1);
          msg("toast", "added", "ok");
        });
      });
    });
  }

  function renderProduct() {
    var id = new URLSearchParams(location.search).get("id");
    var root = $("productDetail"); if (!root || !id) return;
    getProduct(id).then(function (p) {
      if (!p) { root.innerHTML = '<p class="empty">Not found</p>'; return; }
      root.innerHTML =
        '<div class="gallery"><img src="' + esc(p.image) + '" alt="' + esc(pname(p)) + '"></div>' +
        '<div><p><a href="index.html">' + esc(t("backShop")) + "</a></p>" +
        "<h1>" + esc(pname(p)) + "</h1>" +
        '<div class="price">' + esc(money(p)) + ' <span class="meta">(' + esc(t("priceDemo")) + ")</span></div>" +
        "<p>" + esc(pdesc(p)) + "</p>" +
        "<p class=\"meta\"><strong>" + esc(t("stock")) + ":</strong> " + esc(pstock(p)) + "</p>" +
        warnList(p) +
        '<label for="qty">' + esc(t("qty")) + "</label>" +
        '<input id="qty" type="number" min="1" max="99" value="1" style="max-width:6rem">' +
        '<button type="button" class="btn primary block" id="addBtn">' + esc(t("addCart")) + "</button>" +
        '<div id="toast" class="msg" hidden></div></div>';
      $("addBtn").addEventListener("click", function () {
        var q = Math.max(1, Math.min(99, parseInt(($("qty").value), 10) || 1));
        addToCart(p.id, q);
        msg("toast", "added", "ok");
      });
    });
  }

  function renderCart() {
    var root = $("cartRoot"); if (!root) return;
    getProducts().then(function (arr) {
      var byId = {}; arr.forEach(function (p) { byId[p.id] = p; });
      var cart = getCart();
      var ids = Object.keys(cart);
      if (!ids.length) {
        root.innerHTML = '<p class="empty">' + esc(t("cartEmpty")) + '</p><a class="btn secondary block" href="index.html">' + esc(t("continueShop")) + "</a>";
        return;
      }
      var rows = "", total = 0;
      ids.forEach(function (id) {
        var p = byId[id]; if (!p) return;
        var q = Number(cart[id]) || 0;
        var unit = currency === "NZD" ? Number(p.price_nzd) : Number(p.price_hkd);
        var line = unit * q; total += line;
        rows += "<tr data-id=\"" + esc(id) + "\"><td><div class=\"cart-item\"><img src=\"" + esc(p.image) + "\" alt=\"\"><div><strong>" + esc(pname(p)) + "</strong><div class=\"meta\">" + esc(money(p)) + "</div></div></div></td>" +
          "<td><div class=\"qty\"><button type=\"button\" data-dec aria-label=\"-\">−</button><input type=\"number\" min=\"1\" max=\"99\" value=\"" + q + "\" data-qty><button type=\"button\" data-inc aria-label=\"+\">+</button></div></td>" +
          "<td>" + esc(currency + " " + line.toFixed(currency === "NZD" ? 2 : 0)) + "</td>" +
          "<td><button type=\"button\" class=\"linkbtn\" data-rm>" + esc(t("remove")) + "</button></td></tr>";
      });
      root.innerHTML =
        '<div style="overflow-x:auto"><table class="cart-table"><thead><tr><th>' + esc(t("colProduct")) + "</th><th>" + esc(t("colQty")) + "</th><th>" + esc(t("colTotal")) + "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
        '<div class="cart-total"><span>' + esc(t("subtotal")) + "</span><span>" + esc(currency + " " + total.toFixed(currency === "NZD" ? 2 : 0)) + "</span></div>" +
        '<a class="btn primary block" href="checkout.html">' + esc(t("checkout")) + "</a>" +
        '<a class="btn secondary block" href="index.html">' + esc(t("continueShop")) + "</a>";
      qsa("tr[data-id]", root).forEach(function (tr) {
        var id = tr.getAttribute("data-id");
        function sync(q) {
          var c = getCart();
          if (q <= 0) delete c[id]; else c[id] = q;
          setCart(c); renderCart();
        }
        var inp = tr.querySelector("[data-qty]");
        tr.querySelector("[data-dec]").addEventListener("click", function () { sync((Number(inp.value) || 1) - 1); });
        tr.querySelector("[data-inc]").addEventListener("click", function () { sync((Number(inp.value) || 0) + 1); });
        inp.addEventListener("change", function () { sync(Math.max(0, Math.min(99, parseInt(inp.value, 10) || 0))); });
        tr.querySelector("[data-rm]").addEventListener("click", function () { sync(0); });
      });
    });
  }

  function renderCheckout() {
    var root = $("checkoutRoot"); if (!root) return;
    requireLogin("checkout.html").then(function () {
      getProducts().then(function (arr) {
        var byId = {}; arr.forEach(function (p) { byId[p.id] = p; });
        var cart = getCart();
        var ids = Object.keys(cart);
        if (!ids.length) { location.href = "cart.html"; return; }
        var total = 0, warnHtml = "", lines = "";
        ids.forEach(function (id) {
          var p = byId[id]; if (!p) return;
          var q = Number(cart[id]) || 0;
          var unit = currency === "NZD" ? Number(p.price_nzd) : Number(p.price_hkd);
          total += unit * q;
          lines += "<li>" + esc(pname(p)) + " × " + q + " — " + esc(currency + " " + (unit * q).toFixed(currency === "NZD" ? 2 : 0)) + "</li>";
          if (p.warnings && p.warnings.length) warnHtml += warnList(p);
        });
        root.innerHTML =
          "<h1>" + esc(t("checkoutTitle")) + "</h1>" +
          "<p class=\"meta\">" + esc(t("signedInAs")) + ": <strong>" + esc(currentUser().email) + "</strong></p>" +
          "<ul>" + lines + "</ul>" +
          '<div class="cart-total"><span>' + esc(t("subtotal")) + "</span><span>" + esc(currency + " " + total.toFixed(currency === "NZD" ? 2 : 0)) + "</span></div>" +
          warnHtml +
          '<div class="msg warn">' + esc(t("warnCheckout")) + "</div>" +
          "<h2>" + esc(t("payMethods")) + "</h2>" +
          '<div class="pay-methods" role="radiogroup" aria-label="' + esc(t("payMethods")) + '">' +
          '<label><input type="radio" name="pay" value="card" checked> <span>' + esc(t("payCard")) + "</span></label>" +
          '<label><input type="radio" name="pay" value="payme"> <span>' + esc(t("payPayme")) + "</span></label>" +
          '<label><input type="radio" name="pay" value="fps"> <span>' + esc(t("payFps")) + "</span></label>" +
          '<label><input type="radio" name="pay" value="nz"> <span>' + esc(t("payNz")) + "</span></label>" +
          "</div>" +
          '<p class="sec-note">' + esc(t("secNote")) + "</p>" +
          '<button type="button" class="btn primary block" id="payBtn" disabled aria-disabled="true">' + esc(t("payBtn")) + "</button>" +
          '<p class="hint">' + esc(t("payDisabledHint")) + "</p>" +
          '<a class="btn secondary block" href="cart.html">' + esc(t("navCart")) + "</a>";
        /* Explicit: no card number / CVV fields exist on this page */
      });
    }).catch(function () {});
  }

  function renderAdmin() {
    var root = $("adminRoot"); if (!root) return;
    requireLogin("admin.html").then(function (u) {
      if (!isAdmin(u)) {
        root.innerHTML = '<div class="msg err">' + esc(t("eDenied")) + "</div>";
        return;
      }
      getProducts().then(function (arr) {
        var rows = arr.map(function (p, i) {
          return '<tr data-i="' + i + '">' +
            '<td><img src="' + esc(p.image) + '" alt=""></td>' +
            '<td><label class="sr">id</label><code>' + esc(p.id) + "</code><br>" +
            '<label>' + esc(t("nameZh")) + '</label><input type="text" data-f="name_zh" value="' + esc(p.name_zh || "") + '">' +
            '<label>' + esc(t("nameEn")) + '</label><input type="text" data-f="name_en" value="' + esc(p.name_en || "") + '"></td>' +
            '<td><label>' + esc(t("priceHkd")) + '</label><input type="number" min="0" step="1" data-f="price_hkd" value="' + esc(p.price_hkd) + '">' +
            '<label>' + esc(t("priceNzd")) + '</label><input type="number" min="0" step="0.01" data-f="price_nzd" value="' + esc(p.price_nzd) + '"></td>' +
            '<td><label>' + esc(t("stockNote")) + '</label><input type="text" data-f="stock_note_zh" value="' + esc(p.stock_note_zh || "") + '" placeholder="zh">' +
            '<input type="text" data-f="stock_note_en" value="' + esc(p.stock_note_en || "") + '" placeholder="en">' +
            '<label>' + esc(t("warningsField")) + '</label><input type="text" data-f="warnings" value="' + esc((p.warnings || []).join(", ")) + '">' +
            '<label class="chk"><input type="checkbox" data-f="active"' + (p.active !== false ? " checked" : "") + "> " + esc(t("active")) + "</label></td></tr>";
        }).join("");
        root.innerHTML =
          '<div class="toolbar"><div><h1 style="margin:0">' + esc(t("adminTitle")) + "</h1><p class=\"lead\" style=\"margin:.3rem 0 0\">" + esc(t("adminLead")) + "</p></div>" +
          '<div><button type="button" class="btn primary" id="saveAdmin">' + esc(t("save")) + '</button> ' +
          '<button type="button" class="btn secondary" id="resetSeed">' + esc(t("resetSeed")) + "</button></div></div>" +
          '<div id="msg" class="msg" hidden></div>' +
          '<div style="overflow-x:auto"><table class="admin-table"><thead><tr><th></th><th>Name</th><th>Price</th><th>Meta</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
        $("saveAdmin").addEventListener("click", function () {
          var next = arr.map(function (p, i) {
            var tr = root.querySelector('tr[data-i="' + i + '"]');
            var o = Object.assign({}, p);
            qsa("[data-f]", tr).forEach(function (inp) {
              var f = inp.getAttribute("data-f");
              if (f === "active") o.active = inp.checked;
              else if (f === "warnings") o.warnings = String(inp.value || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
              else if (f === "price_hkd" || f === "price_nzd") o[f] = Number(inp.value) || 0;
              else o[f] = inp.value;
            });
            return o;
          });
          saveProducts(next).then(function () { msg("msg", "saved", "ok"); arr = next; });
        });
        $("resetSeed").addEventListener("click", function () {
          store(KEY_PRODUCTS, null);
          loadSeed().then(function (s) { store(KEY_PRODUCTS, JSON.stringify(s)); renderAdmin(); });
        });
      });
    }).catch(function () {});
  }

  function bindAuthForms() {
    qsa("input[data-showpw]").forEach(function (c) {
      c.addEventListener("change", function () {
        qsa("input.pw").forEach(function (i) { i.type = c.checked ? "text" : "password"; });
      });
    });
    var logout = $("logout");
    if (logout) logout.addEventListener("click", function () {
      setSession(null);
      if (!demoMode() && sb) sb.auth.signOut();
      location.href = "index.html";
    });

    var f = $("f");
    if (!f) return;
    if (page === "login") {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = String(($("email") && $("email").value) || "").trim().toLowerCase();
        var pw = String(($("pw") && $("pw").value) || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg("msg", "eEmail", "err");
        if (pw.length < MINPW) return msg("msg", "eWeak", "err");
        if (demoMode()) {
          var role = "member";
          if (email === String(C.DEMO_ADMIN_EMAIL || "admin@demo.local").toLowerCase()) role = "admin";
          setSession({ email: email, role: role, at: Date.now() });
          var ret = new URLSearchParams(location.search).get("return") || "index.html";
          if (!/^[a-z0-9_.\-]+\.html(\?.*)?$/i.test(ret)) ret = "index.html";
          location.href = ret;
          return;
        }
        /* live supabase */
        if (configState() === "secret") return msg("msg", "eSecretKey", "err");
        if (configState() !== "ok") return msg("msg", "eNotConfigured", "err");
        sb.auth.signInWithPassword({ email: email, password: pw }).then(function (res) {
          if (res.error) return msg("msg", "eInvalid", "err");
          var ret = new URLSearchParams(location.search).get("return") || "index.html";
          location.href = ret;
        });
      });
    }
    if (page === "signup") {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = String(($("email") && $("email").value) || "").trim().toLowerCase();
        var pw = String(($("pw") && $("pw").value) || "");
        var pw2 = String(($("pw2") && $("pw2").value) || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg("msg", "eEmail", "err");
        if (pw.length < MINPW) return msg("msg", "eWeak", "err");
        if (pw !== pw2) return msg("msg", "eMismatch", "err");
        if ($("agree") && !$("agree").checked) return msg("msg", "eAgree", "err");
        if (demoMode()) {
          setSession({ email: email, role: "member", at: Date.now() });
          location.href = "index.html";
          return;
        }
        if (configState() !== "ok") return msg("msg", "eNotConfigured", "err");
        sb.auth.signUp({ email: email, password: pw }).then(function (res) {
          if (res.error) return msg("msg", "eGeneric", "err", { code: res.error.message || "?" });
          msg("msg", "saved", "ok");
        });
      });
    }
    if (page === "forgot") {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        if (demoMode()) return msg("msg", "forgotDemo", "info");
        msg("msg", "eNotConfigured", "err");
      });
    }
  }

  function initChrome() {
    renderHeader();
    setFs(store(KEY_FS) || "1");
    var sel = $("lang");
    if (sel) sel.addEventListener("change", function () {
      lang = sel.value; store(KEY_LANG, lang); applyI18n();
      if (window.__shopRender) window.__shopRender();
    });
    qsa(".fs button").forEach(function (b) {
      b.addEventListener("click", function () { setFs(b.getAttribute("data-fs")); });
    });
    qsa(".cur button").forEach(function (b) {
      b.addEventListener("click", function () { setCur(b.getAttribute("data-cur")); });
    });
    var banner = $("demoBanner");
    if (banner) {
      if (demoMode()) { banner.hidden = false; banner.textContent = t("demoBanner"); }
      else banner.hidden = true;
    }
    applyI18n();
    updateCartBadge();
    updateAuthNav();
    bindAuthForms();
  }

  function bootLive() {
    var st = configState();
    if (st === "demo" || st === "none" || st === "secret") return Promise.resolve();
    if (!window.supabase) return Promise.resolve();
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return sb.auth.getSession().then(function (res) {
      var sess = res.data && res.data.session;
      if (sess && sess.user) {
        window.__sbUser = { email: sess.user.email, id: sess.user.id, role: "member" };
        /* optional: fetch profile role */
        return sb.from("profiles").select("role").eq("id", sess.user.id).maybeSingle().then(function (r) {
          if (r.data && r.data.role) window.__sbUser.role = r.data.role;
        }).catch(function () {});
      }
    }).catch(function () {});
  }

  function start() {
    initChrome();
    bootLive().then(function () {
      updateAuthNav();
      if (page === "shop" || page === "home") { window.__shopRender = renderShop; renderShop(); }
      else if (page === "product") { window.__shopRender = renderProduct; renderProduct(); }
      else if (page === "cart") { window.__shopRender = renderCart; renderCart(); }
      else if (page === "checkout") { window.__shopRender = renderCheckout; renderCheckout(); }
      else if (page === "admin") { window.__shopRender = renderAdmin; renderAdmin(); }
      else if (page === "account") {
        var u = currentUser();
        if (!u) location.href = "login.html?return=account.html";
        else {
          var em = $("memberEmail"); if (em) em.textContent = u.email;
          var g = $("guarded"); if (g) g.hidden = false;
          var c = $("checking"); if (c) c.hidden = true;
        }
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
