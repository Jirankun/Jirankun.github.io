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

    /* Di mobile, <iframe> PDF tidak bisa render inline -> klik harus
       langsung membuka file (browser/OS mendelegasikan ke aplikasi PDF). */
    function isMobileDevice() {
        var ua = navigator.userAgent || "";
        if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var small = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
        var noPdfViewer = typeof navigator.pdfViewerEnabled === "boolean" && !navigator.pdfViewerEnabled;
        if (coarse && small) return true;
        if (noPdfViewer && coarse) return true;
        if (navigator.maxTouchPoints > 1 && coarse && small) return true;
        return false;
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

    function getFileType(item) {
        if (item.type) return String(item.type).toLowerCase();
        try {
            return new URL(item.file, window.location.href).pathname.split(".").pop().toLowerCase();
        } catch (e) {
            return "file";
        }
    }

    function renderItem(item) {
        var thumb = item.image
            ? '<img src="' + esc(item.image) + '" alt="" loading="lazy" decoding="async">'
            : '<span class="material-icons-round">insert_drive_file</span>';

        var type = getFileType(item);
        var isPdf = type === "pdf";
        var isDocx = type === "docx";
        var href = item.file;
        var target = ' target="_blank" rel="noopener"';

        var mobileHint = "";
        if (isPdf && isMobileDevice()) {
            // Langsung ke file: 1 ketuk -> aplikasi PDF eksternal.
            href = item.file;
            target = ' target="_blank" rel="noopener"';
            mobileHint = ' <span class="v-dot" aria-hidden="true"></span> dibuka di aplikasi';
        } else if (isPdf) {
            var viewerUrl = new URL("/dokumen/pdf/", window.location.origin);
            viewerUrl.searchParams.set("file", item.file);
            viewerUrl.searchParams.set("name", item.name || "Dokumen PDF");
            viewerUrl.searchParams.set("return", window.location.pathname);
            href = viewerUrl.pathname + viewerUrl.search;
            target = "";
        }

        var downloadAttrs = isDocx
            ? ' data-download="docx" data-file="' + esc(item.file) + '" data-filename="' + esc(item.name || "dokumen") + '"'
            : "";

        return (
            '<a class="v-item" href="' + esc(href) + '"' + target + downloadAttrs + '>' +
            '<span class="v-thumb">' +
            thumb +
            "</span>" +
            '<span class="v-body">' +
            '<span class="v-name">' +
            esc(item.name) +
            "</span>" +
            '<span class="v-meta"><span class="v-type">' +
            esc(type.toUpperCase()) +
            "</span>" + mobileHint + "</span>" +
            "</span>" +
            '<svg class="v-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M5 12h14M12 5l7 7-7 7"></path></svg>' +
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

    document.addEventListener("click", async function (event) {
        var link = event.target.closest('a[data-download="docx"]');
        if (!link) return;

        event.preventDefault();
        link.setAttribute("aria-busy", "true");
        try {
            var response = await fetch(link.getAttribute("data-file"));
            if (!response.ok) throw new Error("status " + response.status);
            var blob = await response.blob();
            var objectUrl = URL.createObjectURL(blob);
            var downloadLink = document.createElement("a");
            downloadLink.href = objectUrl;
            var filename = link.getAttribute("data-filename") || "dokumen";
            downloadLink.download = /\.docx$/i.test(filename) ? filename : filename + ".docx";
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
        } catch (error) {
            link.removeAttribute("data-download");
            link.click();
        } finally {
            link.removeAttribute("aria-busy");
        }
    });

    main();
})();
