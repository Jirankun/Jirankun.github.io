(function () {
    "use strict";

    var params = new URLSearchParams(window.location.search);
    var rawFile = params.get("file") || "";
    var fileUrl = null;

    var frame = document.getElementById("pdf-frame");
    var loader = document.getElementById("pdf-loader");
    var errorBox = document.getElementById("pdf-error");
    var errorText = document.getElementById("pdf-error-text");
    var status = document.getElementById("pdf-status");
    var titleEl = document.getElementById("pdf-title");
    var downloadBtn = document.getElementById("pdf-download");
    var downloadLabel = document.getElementById("pdf-download-label");
    var openLink = document.getElementById("pdf-open");
    var retryBtn = document.getElementById("pdf-retry");
    var errorOpen = document.getElementById("pdf-error-open");
    var errorDownload = document.getElementById("pdf-error-download");

    var loaded = false;
    var slowTimer = null;

    function safeReturnPath(value) {
        if (value && value.indexOf("/dokumen/view/") === 0) return value;
        return "/dokumen/";
    }

    function safeFilename(value) {
        var name = String(value || "dokumen").replace(/[\\/:*?"<>|]+/g, "-").trim();
        if (!name) name = "dokumen";
        if (!/\.pdf$/i.test(name)) name += ".pdf";
        return name;
    }

    function showError(text) {
        loader.hidden = true;
        loader.style.display = "none";
        frame.hidden = true;
        errorBox.hidden = false;
        errorText.textContent = text;
        status.textContent = "Tidak dapat membuka dokumen";
    }

    function hideError() {
        errorBox.hidden = true;
    }

    function showLoader() {
        loader.hidden = false;
        loader.style.display = "flex";
    }

    function hideLoader() {
        loader.hidden = true;
        loader.style.display = "none";
    }

    function startLoading() {
        loaded = false;
        hideError();
        showLoader();
        frame.hidden = true;
        status.textContent = "Memuat dokumen…";

        // Native browser PDF viewer = instan, tanpa library tambahan.
        // #toolbar / zoom hanya hint untuk viewer bawaan browser.
        frame.src = fileUrl.href + "#toolbar=1&navpanes=0&scrollbar=1&zoom=FitH";

        window.clearTimeout(slowTimer);
        slowTimer = window.setTimeout(function () {
            if (!loaded) status.textContent = "Masih memuat… gunakan Unduh / Buka bila lama";
        }, 12000);
    }

    frame.addEventListener("load", function () {
        if (!fileUrl) return;
        loaded = true;
        window.clearTimeout(slowTimer);
        hideLoader();
        frame.hidden = false;
        status.textContent = "cdn.zhyllanfyllah.my.id";
    });

    frame.addEventListener("error", function () {
        // Error frame tidak selalu terpicu untuk PDF; biarkan timeout + tombol fallback.
    });

    async function downloadPdf() {
        if (!fileUrl) return;
        downloadBtn.disabled = true;
        if (downloadLabel) downloadLabel.textContent = "Mengunduh…";
        status.textContent = "Mengunduh dokumen…";
        try {
            var response = await fetch(fileUrl.href);
            if (!response.ok) throw new Error("HTTP " + response.status);
            var blob = await response.blob();
            var objectUrl = URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.href = objectUrl;
            link.download = safeFilename(params.get("name"));
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 5000);
            status.textContent = "Unduhan dimulai";
        } catch (error) {
            // fetch lintas-origin bisa gagal walau berkas ada -> fallback buka langsung
            status.textContent = "Unduhan via halaman gagal, membuka berkas langsung…";
            window.open(fileUrl.href, "_blank", "noopener");
            status.textContent = "Dibuka di tab baru — simpan dari sana bila perlu";
        } finally {
            downloadBtn.disabled = false;
            if (downloadLabel) downloadLabel.textContent = "Unduh";
        }
    }

    downloadBtn.addEventListener("click", downloadPdf);
    errorDownload.addEventListener("click", downloadPdf);
    retryBtn.addEventListener("click", function () {
        if (fileUrl) startLoading();
    });

    document.getElementById("close-viewer").href = safeReturnPath(params.get("return"));
    titleEl.textContent = params.get("name") || "Pratinjau dokumen";

    try {
        fileUrl = new URL(rawFile);
        if (fileUrl.hostname !== "cdn.zhyllanfyllah.my.id" || fileUrl.pathname.indexOf("/cdn/") !== 0) {
            throw new Error("Sumber dokumen tidak diizinkan.");
        }
    } catch (error) {
        showError("Tautan dokumen tidak valid atau tidak diizinkan. Kembali ke daftar dokumen lalu coba lagi.");
        return;
    }

    openLink.href = fileUrl.href;
    openLink.removeAttribute("aria-disabled");
    errorOpen.href = fileUrl.href;
    downloadBtn.disabled = false;

    startLoading();
})();
