(function () {
  "use strict";

  var DATA_URL = "/dokumen/data.json";

  /* Kategori dianggap berisi kalau minimal ada satu berkas dengan tautan. */
  function hasItems(list) {
    return (
      Array.isArray(list) &&
      list.some(function (it) {
        return it && it.file;
      })
    );
  }

  async function main() {
    var listEl = document.querySelector(".cat-list");
    if (!listEl) return;

    var data;
    try {
      var res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("status " + res.status);
      data = await res.json();
    } catch (e) {
      /* Gagal memuat data: biarkan daftar statis apa adanya sebagai cadangan. */
      return;
    }

    var items = listEl.querySelectorAll(".cat-item[data-cat]");
    Array.prototype.forEach.call(items, function (el) {
      if (!hasItems(data[el.getAttribute("data-cat")])) el.remove();
    });

    if (!listEl.querySelector(".cat-item")) {
      listEl.innerHTML = '<div class="cat-desc">Belum ada dokumen untuk ditampilkan.</div>';
    }
  }

  main();
})();
