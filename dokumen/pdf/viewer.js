var params = new URLSearchParams(window.location.search);
var rawFile = params.get("file") || "";
var fileUrl;
var pdfDocument;
var pageNumber = 1;
var zoom = 1;
var renderTask;
var stage = document.getElementById("pdf-stage");
var canvas = document.getElementById("pdf-canvas");
var context = canvas.getContext("2d");
var message = document.getElementById("pdf-message");
var status = document.getElementById("pdf-status");
var pageInput = document.getElementById("page-number");
var pageCount = document.getElementById("page-count");
var previousButton = document.getElementById("page-previous");
var nextButton = document.getElementById("page-next");
var zoomOutButton = document.getElementById("zoom-out");
var zoomInButton = document.getElementById("zoom-in");
var downloadButton = document.getElementById("pdf-download");

function setMessage(text, isError) {
    message.textContent = text;
    message.dataset.error = isError ? "true" : "false";
    message.hidden = false;
    canvas.style.display = "none";
    status.textContent = isError ? "Tidak dapat membuka PDF" : text;
}

function safeReturnPath(value) {
    if (value && value.startsWith("/dokumen/view/")) return value;
    return "/dokumen/";
}

function safeFilename(value) {
    return (value || "dokumen").replace(/[\\/:*?"<>|]+/g, "-").trim() + ".pdf";
}

function withTimeout(promise, message, timeoutMs) {
    var timer;
    return Promise.race([
        promise,
        new Promise(function (_, reject) {
            timer = window.setTimeout(function () { reject(new Error(message)); }, timeoutMs);
        }),
    ]).finally(function () { window.clearTimeout(timer); });
}

async function renderPage() {
    if (!pdfDocument) return;
    if (renderTask) renderTask.cancel();

    var page = await pdfDocument.getPage(pageNumber);
    var baseViewport = page.getViewport({ scale: 1 });
    var availableWidth = Math.max(280, stage.clientWidth - 40);
    var fitScale = Math.min(1, availableWidth / baseViewport.width);
    var viewport = page.getViewport({ scale: fitScale * zoom });
    var pixelRatio = window.devicePixelRatio || 1;

    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    canvas.style.width = Math.ceil(viewport.width) + "px";
    canvas.style.height = Math.ceil(viewport.height) + "px";
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    renderTask = page.render({ canvasContext: context, viewport: viewport });
    try {
        await renderTask.promise;
        message.hidden = true;
        canvas.style.display = "block";
        pageInput.value = String(pageNumber);
        pageInput.max = String(pdfDocument.numPages);
        pageCount.textContent = String(pdfDocument.numPages);
        status.textContent = "Halaman " + pageNumber + " dari " + pdfDocument.numPages;
        document.getElementById("zoom-label").textContent = Math.round(zoom * 100) + "%";
        previousButton.disabled = pageNumber <= 1;
        nextButton.disabled = pageNumber >= pdfDocument.numPages;
        pageInput.disabled = false;
        zoomOutButton.disabled = zoom <= 0.6;
        zoomInButton.disabled = zoom >= 2.4;
    } catch (error) {
        if (error.name !== "RenderingCancelledException") throw error;
    }
}

async function downloadPdf() {
    downloadButton.disabled = true;
    status.textContent = "Mengunduh PDF…";
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
        window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
        status.textContent = "Unduhan dimulai";
    } catch (error) {
        status.textContent = "Unduhan gagal. Periksa koneksi lalu coba lagi.";
        downloadButton.disabled = false;
    }
}

document.getElementById("close-viewer").href = safeReturnPath(params.get("return"));
document.getElementById("pdf-title").textContent = params.get("name") || "Pratinjau dokumen";
previousButton.addEventListener("click", function () {
    if (pageNumber > 1) { pageNumber -= 1; renderPage().catch(function (error) { setMessage(error.message, true); }); }
});
nextButton.addEventListener("click", function () {
    if (pdfDocument && pageNumber < pdfDocument.numPages) { pageNumber += 1; renderPage().catch(function (error) { setMessage(error.message, true); }); }
});
pageInput.addEventListener("change", function () {
    if (!pdfDocument) return;
    pageNumber = Math.min(pdfDocument.numPages, Math.max(1, Number(pageInput.value) || 1));
    renderPage().catch(function (error) { setMessage(error.message, true); });
});
zoomOutButton.addEventListener("click", function () {
    zoom = Math.max(0.6, Math.round((zoom - 0.2) * 10) / 10);
    renderPage().catch(function (error) { setMessage(error.message, true); });
});
zoomInButton.addEventListener("click", function () {
    zoom = Math.min(2.4, Math.round((zoom + 0.2) * 10) / 10);
    renderPage().catch(function (error) { setMessage(error.message, true); });
});
downloadButton.addEventListener("click", downloadPdf);
window.addEventListener("resize", function () {
    if (pdfDocument) renderPage().catch(function (error) { setMessage(error.message, true); });
});

try {
    fileUrl = new URL(rawFile);
    if (fileUrl.hostname !== "cdn.zhyllanfyllah.my.id" || !fileUrl.pathname.startsWith("/cdn/")) {
        throw new Error("Sumber dokumen tidak diizinkan.");
    }
    status.textContent = "Memuat PDF.js…";
    var pdfjs = await withTimeout(
        import("https://cdn.zhyllanfyllah.my.id/cdn/public/js/pdfjs/pdf.mjs"),
        "PDF.js tidak dapat dimuat dari CDN.",
        15000,
    );
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.zhyllanfyllah.my.id/cdn/public/js/pdfjs/pdf.worker.mjs";
    var loadingTask = pdfjs.getDocument({ url: fileUrl.href });
    pdfDocument = await withTimeout(loadingTask.promise, "PDF tidak merespons.", 30000);
    downloadButton.disabled = false;
    await renderPage();
} catch (error) {
    setMessage("PDF tidak dapat dimuat. Pastikan path pada data.json benar dan berkas tersedia.", true);
}