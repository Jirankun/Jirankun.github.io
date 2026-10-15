(function () {
  "use strict";

  var DATA_URL = "/dokumen/data.json";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCategoryId() {
    var parts = window.location.pathname.replace(/\/+$/, "").split("/");
    return decodeURIComponent(parts[parts.length - 1] || "");
  }

  async function loadData() {
    var res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("status " + res.status);
    return await res.json();
  }

  function renderItem(item) {
    var thumb = item.image
      ? '<img src="' + esc(item.image) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="material-icons-round">insert_drive_file</span>';

    var type = (item.type || "file").toUpperCase();

    return (
      '<a class="v-item" href="' + esc(item.file) + '" target="_blank" rel="noopener">' +
        '<span class="v-thumb">' + thumb + "</span>" +
        '<span class="v-body">' +
          '<span class="v-name">' + esc(item.name) + "</span>" +
          '<span class="v-meta"><span class="v-type">' + esc(type) + "</span></span>" +
        "</span>" +
        '<svg class="v-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
      "</a>"
    );
  }

  function attachImageFallback(container) {
    var imgs = container.querySelectorAll("img");
    Array.prototype.forEach.call(imgs, function (img) {
      img.addEventListener("error", function () {
        var icon = document.createElement("span");
        icon.className = "material-icons-round";
        icon.textContent = "insert_drive_file";
        if (img.parentNode) img.parentNode.replaceChild(icon, img);
      });
    });
  }

  async function main() {
    var id = getCategoryId();
    var listEl = document.getElementById("cat-items");
    if (!listEl) return;

    var data;
    try {
      data = await loadData();
    } catch (e) {
      listEl.innerHTML = '<div class="v-empty">Gagal memuat daftar dokumen.</div>';
      return;
    }

    var items = ((data && data[id]) || []).filter(function (it) {
      return it && it.file;
    });

    if (!items.length) {
      listEl.innerHTML = '<div class="v-empty">Belum ada berkas di kategori ini.</div>';
      return;
    }

    listEl.innerHTML = items.map(renderItem).join("");
    attachImageFallback(listEl);
  }

  main();
})();
