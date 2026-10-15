// @ts-nocheck — nonaktifkan cek tipe di editor Cloudflare (env binding dkk.)
/**
 * ═══════════════════════════════════════════════════════════════
 *   WORKER — AI Fylia + Readpost + gerbang tautan kontak
 * ═══════════════════════════════════════════════════════════════
 *
 *   Tiga sistem di dalam worker ini:
 *     1. AI FYLIA  → POST /chat   (Cloudflare Workers AI)
 *     2. READPOST  → GET/POST /read  (jumlah dilihat artikel, KV READPOST)
 *     3. OPEN      → GET/POST /open/verify (Turnstile + cookie contact_pass)
 *
 *   Bindings di Cloudflare (Settings → Variables and Secrets):
 *     - KV namespace  : READPOST  → key "view:<slug>" berisi angka
 *     - Workers AI    : AI        → wajib untuk /chat
 *     - Env rahasia   : TURNSTILE_SECRET_KEY → wajib untuk /open/verify
 *   Env opsional:
 *     - CONTACT_KEY_SECRET → secret penandatangan cookie /open (default: TURNSTILE_SECRET_KEY)
 *     - TARGET_WA, TARGET_MAIL, TARGET_IG, TARGET_X → tujuan tautan kontak
 *     - CHAT_MODEL    → model Workers AI utama (override)
 *                        (default: GLM-4.7-Flash, lalu Gemma 4 26B,
 *                         Qwen 3.8 27B, DeepSeek V4 Flash,
 *                         Gemma SEA-LION v4 27B, Qwen3 30B A3B)
 *     - BLOG_FEED     → URL feed blog (default:
 *                        https://www.zhyllanfyllah.my.id/feeds/posts/default?alt=json&max-results=12)
 *
 *   Sistem lain (Groq/AI text, GitHub API, Blogger API, admin panel,
 *   komentar, like) SUDAH DIHAPUS dari worker ini.
 *   https://zhyllan.jirankun.workers.dev/ adalah worker ini
 * ═══════════════════════════════════════════════════════════════
 */

/* ─── CORS ─── */
const CORS = {
    headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    },
};

/* ─── ENTRY POINT ─── */
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        /* OPTIONS preflight */
        if (request.method === "OPTIONS") {
            return new Response(null, CORS);
        }

        /* ── ROUTE: /chat ── Chat AI Fylia (Cloudflare Workers AI) ── */
        if (path === "/chat") {
            if (request.method === "POST") return handleChat(env, request);
            return json({ error: "Method not allowed" }, 405);
        }

        /* ── ROUTE: /read ── Readpost: baca / tambah jumlah dilihat ── */
        if (path === "/read") {
            if (request.method === "GET") return handleRead(env, url);
            if (request.method === "POST") return handleReadHit(env, request);
            return json({ error: "Method not allowed" }, 405);
        }

        /* ── FUNGSIONALITAS FUNCTIONS (/open + /open/verify) ── */
        if (path === "/open" || path === "/open/verify") {
            if (request.method === "OPTIONS") return new Response(null, CORS);
            if (request.method === "GET") return onRequestGetOpen({ request, env });
            if (request.method === "POST") return onRequestPostOpen({ request, env });
            return json({ error: "Method not allowed" }, 405);
        }

        /* ── FINAL → Info ── */
        if (path === "/") {
            return json({
                status: "ok",
                endpoints: {
                    chat: "POST /chat — Chat AI Fylia (Workers AI)",
                    read: "GET /read?slug=<slug> | GET /read?slugs=a,b,c | POST /read { slug } — Readpost (KV READPOST)",
                    open: "GET /open | POST /open/verify — Gerbang tautan kontak (Turnstile + cookie contact_pass)",
                },
            });
        }

        return json({ error: "Not Found" }, 404);
    },
};

/* ═══════════════════════════════════════════════
   HANDLER: Readpost — jumlah dilihat (KV READPOST)
   ═══════════════════════════════════════════════
   GET  /read?slug=2026/09/judul.html      → { slug, count }
   GET  /read?slugs=a,b,c                  → { counts: { slug: n } }   (daftar postingan)
   POST /read  body: { "slug": "..." }     → tambah 1 → { slug, count }

   Tanpa cache: setiap permintaan baca/tulis langsung ke KV
   (respons selalu Cache-Control: no-store). */

/* Fallback in-memory — hanya dipakai kalau binding KV READPOST belum ada,
   supaya worker tetap jalan saat dites (angka ikut hilang saat worker restart). */
const readMem = new Map();

const READ_PREFIX = "view:";
const READ_MAX_SLUGS = 60;

function readKey(slug) {
    return READ_PREFIX + slug;
}

async function readCount(env, slug) {
    if (!slug) return 0;
    if (env.READPOST) {
        const raw = await env.READPOST.get(readKey(slug));
        return parseInt(raw, 10) || 0;
    }
    return readMem.get(slug) || 0;
}

async function readHit(env, slug) {
    const next = (await readCount(env, slug)) + 1;
    if (env.READPOST) {
        await env.READPOST.put(readKey(slug), String(next));
    } else {
        readMem.set(slug, next);
    }
    return next;
}

/* Baca satu atau banyak slug sekaligus */
async function handleRead(env, url) {
    const params = url.searchParams;
    const list = [];
    /* dukung ?slugs=a,b,c (sekali) maupun ?slug=a&slug=b (berulang) */
    params
        .getAll("slugs")
        .concat(params.getAll("slug"))
        .forEach(function (raw) {
            String(raw)
                .split(",")
                .forEach(function (s) {
                    const v = s.trim();
                    if (v && list.indexOf(v) === -1) list.push(v);
                });
        });

    if (!list.length) {
        return json({ error: "Parameter slug/slugs wajib diisi" }, 400, CORS_NO_STORE);
    }
    if (list.length > READ_MAX_SLUGS) {
        return json({ error: "Maksimal " + READ_MAX_SLUGS + " slug per permintaan" }, 400, CORS_NO_STORE);
    }

    try {
        const counts = {};
        await Promise.all(
            list.map(async function (slug) {
                counts[slug] = await readCount(env, slug);
            }),
        );
        return json({ counts, total: list.length }, 200, CORS_NO_STORE);
    } catch (err) {
        return json({ error: (err && err.message) || "Internal Server Error" }, 500, CORS_NO_STORE);
    }
}

/* Tambah 1 kali dilihat */
async function handleReadHit(env, request) {
    let body = {};
    try {
        body = await request.json();
    } catch {}

    /* slug boleh dikirim di body atau query (?slug=) */
    const url = new URL(request.url);
    const slug = String((body && body.slug) || url.searchParams.get("slug") || "").trim();
    if (!slug) {
        return json({ error: "slug wajib diisi" }, 400, CORS_NO_STORE);
    }

    try {
        const count = await readHit(env, slug);
        return json({ slug, count }, 200, CORS_NO_STORE);
    } catch (err) {
        return json({ error: (err && err.message) || "Internal Server Error" }, 500, CORS_NO_STORE);
    }
}

/* ═══════════════════════════════════════════════
   BLOG — postingan terbaru dari feed Blogger
   ═══════════════════════════════════════════════
   Diambil saat chat supaya Fylia bisa memberi TAUTAN LANGSUNG
   ke postingan blog, bukan sekadar menyebut judul.
   Hasil di-cache di memori isolate (TTL) agar hemat latensi.

   Feed default Blogger: <blog>/feeds/posts/default?alt=json
   Bisa dioverride lewat env BLOG_FEED. Kalau feed gagal diakses,
   chat tetap jalan (pakai cache lama, atau tanpa konteks blog). */

const BLOG_FEED_URL_DEFAULT = "https://www.zhyllanfyllah.my.id/feeds/posts/default?alt=json&max-results=12";
const BLOG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 menit
const BLOG_MAX_POSTS = 12;
const blogCache = { at: 0, posts: [] };

/* Ubah entri HTML feed menjadi teks bersih */
function stripHtml(input) {
    return String(input || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

async function fetchBlogPosts(env) {
    const now = Date.now();
    if (blogCache.at && now - blogCache.at < BLOG_CACHE_TTL_MS) return blogCache.posts;

    const feedUrl = (env && env.BLOG_FEED) || BLOG_FEED_URL_DEFAULT;
    try {
        /* Cache ditangani di memori isolate (blogCache) — tidak perlu opsi cf,
           agar tidak bergantung pada paket/plan tertentu. */
        const res = await fetch(feedUrl, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("feed HTTP " + res.status);
        const data = await res.json();
        const entries = (data && data.feed && data.feed.entry) || [];

        const posts = entries
            .map(function (entry) {
                const title = stripHtml(entry && entry.title && entry.title.$t);
                let url = "";
                const links = (entry && entry.link) || [];
                for (const l of links) {
                    if (l && l.rel === "alternate" && l.href) {
                        url = l.href;
                        break;
                    }
                }
                const published = (entry && entry.published && entry.published.$t) || "";
                const summary = stripHtml((entry && entry.summary && entry.summary.$t) || "");
                return { title, url, published, summary: summary.slice(0, 180) };
            })
            .filter(p => p.title && p.url)
            .slice(0, BLOG_MAX_POSTS);

        blogCache.at = now;
        blogCache.posts = posts;
        return posts;
    } catch {
        /* Jangan gagalkan chat hanya karena feed mati — pakai cache lama bila ada */
        return blogCache.posts || [];
    }
}

/* ─── FUNGSIONALITAS FUNCTIONS (integrasi ke worker) ───
   Sumber: functions/_lib/sign.js + functions/open/verify.js
   ──────────────────────────────────────────────────────── */

/* Cookie sesi bertanda tangan HMAC-SHA256 (dari functions/_lib/sign.js) */
function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

async function hmacHex(secret, message) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return toHex(sig);
}

function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

async function makeSigned(secret, ttlSeconds) {
    if (!secret) return "";
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = await hmacHex(secret, String(exp));
    return exp + "." + sig;
}

async function verifySigned(secret, cookieValue) {
    if (!secret || !cookieValue || cookieValue.indexOf(".") < 0) return false;

    const dot = cookieValue.indexOf(".");
    const expStr = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);

    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

    const expect = await hmacHex(secret, expStr);
    return safeEqual(sig, expect);
}

function readCookie(request, name) {
    const header = request.headers.get("Cookie") || "";
    for (const part of header.split(";")) {
        const idx = part.indexOf("=");
        if (idx < 0) continue;
        if (part.slice(0, idx).trim() === name) {
            return part.slice(idx + 1).trim();
        }
    }
    return "";
}

function setCookieHeader(name, value, path, maxAge) {
    return [name + "=" + value, "Path=" + path, "Max-Age=" + maxAge, "HttpOnly", "Secure", "SameSite=Lax"].join("; ");
}

function clearCookieHeader(name, path) {
    return [name + "=", "Path=" + path, "Max-Age=0", "HttpOnly", "Secure", "SameSite=Lax"].join("; ");
}

/* ─── Gerbang Tautan /open (dari functions/open/verify.js) ─── */

const COOKIE_NAME = "contact_pass";
const COOKIE_PATH = "/open";
const COOKIE_TTL = 60 * 10;
const TURNSTILE_SECRET_KEY = "";
const TURNSTILE_ACTION = "open_contact";
const TURNSTILE_HOSTNAMES = ["zhyllanfyllah.my.id", "www.zhyllanfyllah.my.id"];
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function build(parts) {
    return parts.join("");
}

const WA_FALLBACK = build(["https://wa.me/", "6", "2", "8", "5", "1", "6", "5", "7", "2", "1", "3", "8", "4"]);
const MAIL_FALLBACK = build([
    "mailto:",
    "h",
    "e",
    "l",
    "l",
    "o",
    "@",
    "z",
    "h",
    "y",
    "l",
    "l",
    "a",
    "n",
    "f",
    "y",
    "l",
    "l",
    "a",
    "h",
    ".",
    "m",
    "y",
    ".",
    "i",
    "d",
]);
const IG_FALLBACK = build(["https://", "instagram", ".com/", "jirankun_"]);
const X_FALLBACK = build(["https://", "x", ".com/", "jirankun_dev"]);

const MEDIA = [
    { slug: "wa", label: "WhatsApp", env: "TARGET_WA", fallback: WA_FALLBACK, aliases: ["whatsapp"] },
    { slug: "mail", label: "Email", env: "TARGET_MAIL", fallback: MAIL_FALLBACK, aliases: ["email"] },
    { slug: "ig", label: "Instagram", env: "TARGET_IG", fallback: IG_FALLBACK, aliases: ["instagram"] },
    { slug: "x", label: "X", env: "TARGET_X", fallback: X_FALLBACK, aliases: ["twitter"] },
];

function mediaUrl(env, item) {
    return (env && env[item.env]) || item.fallback;
}

function mediaPayload(env) {
    return MEDIA.map(function (item) {
        return { slug: item.slug, label: item.label, aliases: item.aliases, url: mediaUrl(env, item) };
    });
}

function resolveSlug(env, slug) {
    if (!slug) return null;
    const key = String(slug).toLowerCase();
    for (let i = 0; i < MEDIA.length; i++) {
        const item = MEDIA[i];
        if (item.slug === key || (item.aliases && item.aliases.indexOf(key) !== -1)) {
            return mediaUrl(env, item);
        }
    }
    return null;
}

function getSessionSecret(env) {
    return env.CONTACT_KEY_SECRET || env.TURNSTILE_SECRET_KEY || "";
}

async function verifyTurnstile(env, token, clientIp) {
    const secret = env.TURNSTILE_SECRET_KEY || TURNSTILE_SECRET_KEY;
    if (!secret || secret === "GANTI_DENGAN_SECRET_KEY_ANDA") {
        return { ok: false, error: "server_misconfig", status: 500 };
    }

    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (clientIp) form.append("remoteip", clientIp);

    let resp;
    try {
        resp = await fetch(SITEVERIFY_URL, {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(10000),
        });
    } catch (e) {
        return { ok: false, error: "verify_unreachable", status: 502 };
    }

    if (!resp.ok) {
        return { ok: false, error: "verify_failed", status: 502 };
    }

    const result = await resp.json();

    if (!result || result.success !== true) {
        return { ok: false, error: "invalid_token", status: 403 };
    }

    if (TURNSTILE_ACTION && result.action && result.action !== TURNSTILE_ACTION) {
        return { ok: false, error: "invalid_action", status: 403 };
    }

    if (TURNSTILE_HOSTNAMES.length && !TURNSTILE_HOSTNAMES.includes(result.hostname)) {
        return { ok: false, error: "invalid_hostname", status: 403 };
    }

    return { ok: true };
}

/* GET /open | /open/verify?slug=… — kirim daftar media (dan cek cookie sesi) */
async function onRequestGetOpen({ request, env }) {
    try {
        const session = readCookie(request, COOKIE_NAME);
        const ok = await verifySigned(getSessionSecret(env), session);

        if (!ok) {
            return json({ success: false, error: "no_session" }, 401, {
                "Set-Cookie": clearCookieHeader(COOKIE_NAME, COOKIE_PATH),
            });
        }

        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        if (slug) {
            const target = resolveSlug(env, slug);
            if (!target) {
                return json({ success: false, error: "unknown_slug" }, 404);
            }
            return json({ success: true, url: target }, 200);
        }

        return json({ success: true, media: mediaPayload(env) }, 200);
    } catch (err) {
        return json({ success: false, error: "server_error" }, 500);
    }
}

/* POST /open | /open/verify — verifikasi Turnstile + set cookie sesi */
async function onRequestPostOpen({ request, env }) {
    try {
        const body = await request.json();
        const token = body && body.token;
        const slug = body && body.slug;

        if (!token || typeof token !== "string" || token.length > 2048) {
            return json({ success: false, error: "missing_params" }, 400);
        }

        if (!getSessionSecret(env)) {
            return json({ success: false, error: "server_misconfig" }, 500);
        }

        const clientIp =
            request.headers.get("CF-Connecting-IP") ||
            (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim();

        const check = await verifyTurnstile(env, token, clientIp);
        if (!check.ok) {
            return json({ success: false, error: check.error }, check.status);
        }

        const session = await makeSigned(getSessionSecret(env), COOKIE_TTL);
        if (!session) {
            return json({ success: false, error: "server_misconfig" }, 500);
        }

        const payload = { success: true, media: mediaPayload(env) };
        if (slug) {
            const url = resolveSlug(env, slug);
            if (!url) {
                return json({ success: false, error: "unknown_slug" }, 404);
            }
            payload.url = url;
        }

        return json(payload, 200, {
            "Set-Cookie": setCookieHeader(COOKIE_NAME, session, COOKIE_PATH, COOKIE_TTL),
        });
    } catch (err) {
        return json({ success: false, error: "server_error" }, 500);
    }
}

/* Susun konteks blog untuk ditempel ke system prompt */
function blogPromptSection(posts) {
    if (!posts || !posts.length) {
        return "KONTEKS BLOG: feed sedang tidak bisa diakses. Kalau pengguna menanyakan postingan blog, arahkan ke https://www.zhyllanfyllah.my.id dan jangan mengarang judul atau tautan.";
    }
    const lines = posts.map(function (p) {
        const date = p.published ? " (" + p.published.slice(0, 10) + ")" : "";
        return "- " + p.title + date + " → " + p.url;
    });
    return (
        "KONTEKS BLOG — POSTINGAN TERBARU (sumber resmi dari feed Blogger, gunakan apa adanya):\n" + lines.join("\n")
    );
}

/* ═══════════════════════════════════════════════
   AI FYLIA — filter pesan & stiker
   ═══════════════════════════════════════════════ */

/* Model yang pernah gagal — dilewati SEMENTARA (5 menit) supaya tidak mencoba
   model mati berulang-ulang di setiap pesan (hemat latensi), TAPI error transien
   (kuota neuron habis, network blip) tidak menonaktifkan model selamanya. */
const failedChatModels = new Map(); // model → lastFailedAt (ms)
const FAILED_MODEL_SKIP_MS = 5 * 60 * 1000;

/* ══ FILTER PESAN: tolak sapaan romantis/kencan & kata kotor ══
   Deterministik — dicek SEBELUM memanggil AI, jadi dijamin 100% tertolak
   dan sekaligus menghemat kuota (tidak ada request AI untuk pesan ini). */
const CHAT_BLOCK_WORDS = [
    /* Sapaan romantis / kencan / pacaran */
    "sayang",
    "sayangku",
    "kencan",
    "pacaran",
    "pacar",
    "pacarku",
    "gebetan",
    "gebet",
    "jadian",
    "ciuman",
    "cium",
    "peluk",
    "bucin",
    "cintaku",
    "cinta aku",
    "cinta kamu",
    "mencintaimu",
    "jadi pacar",
    "ngajak kencan",
    "ajak kencan",
    "nikah",
    "i love you",
    "love you",
    "my love",
    "kamu cantik",
    "kamu manis",
    "kamu imut",
    /* Kata kotor / kasar */
    "anjing",
    "bangsat",
    "kampret",
    "sialan",
    "goblok",
    "tolol",
    "brengsek",
    "jancok",
    "kontol",
    "memek",
    "ngentot",
    "bajingan",
    "keparat",
    "asu",
    "pukimak",
    "fuck",
    "shit",
    "bitch",
    "asshole",
];

const CHAT_BLOCK_RE = new RegExp(
    "\\b(" + CHAT_BLOCK_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
    "i",
);

const CHAT_BLOCKED_REPLY =
    "Maaf, aku asisten portfolio yang sopan ya 😊 Mari kita ngobrol tentang Zhyllan, karya-karyanya, atau teknologi. Ada yang bisa aku bantu?";

function isBlockedMessage(text) {
    if (!text) return false;
    return CHAT_BLOCK_RE.test(text);
}

/* ═══════════════════════════════════════════════
   HANDLER: Chat AI Fylia (Cloudflare Workers AI)
   POST /chat — body: { messages: [{ role, content }] }
   Balasan: { reply: string, sticker?: string }
   ═══════════════════════════════════════════════ */

/* Daftar stiker yang tersedia di sisi client (folder "fylia AI asisten") */
const FYLIA_STICKERS = [
    "Sticker_Hello",
    "Sticker_Think",
    "Sticker_Idea",
    "Sticker_Okey",
    "Sticker_Woah",
    "Sticker_Fight",
    "Sticker_Formal",
];

/* Daftar aksi (tombol pintas) yang boleh dipicu AI.
   HANYA nama di daftar ini yang diteruskan ke client — mencegah
   prompt injection mengarahkan user ke URL/aksi sembarangan.
   Client yang memetakan nama aksi → URL (lihat ai/index.html). */
const FYLIA_ACTIONS = [
    "contact",
    "contact_wa",
    "contact_email",
    "docs",
    "docs_cv",
    "docs_resume",
    "docs_sertifikat",
    "docs_lainnya",
    "github",
    "blog",
    "aokaze",
];

/* Ekstrak marker [sticker: Nama] & [action: Nama] dari balasan AI.
   Hanya nama yang ada di whitelist yang diteruskan — mencegah prompt
   injection mengarahkan user ke URL/aksi sembarangan. */
function parseMarkers(raw) {
    const text = String(raw || "");

    const sm = text.match(/\[\s*sticker\s*:\s*([A-Za-z0-9_]+)\s*\]/i) || text.match(/\[(Sticker_[A-Za-z0-9_]+)\]/);
    const sticker = sm && FYLIA_STICKERS.includes(sm[1]) ? sm[1] : null;

    const am = text.match(/\[\s*action\s*:\s*([A-Za-z0-9_]+)\s*\]/i);
    const action = am && FYLIA_ACTIONS.includes(am[1]) ? am[1] : null;

    /* Pembersihan longgar: buang marker [sticker: X] dan [action: X] —
       model sering menyimpang dari format, jangan sampai bocor ke teks. */
    const clean = text
        .replace(/\[\s*sticker\s*:.*?\]/gi, "")
        .replace(/\[\s*action\s*:.*?\]/gi, "")
        .replace(/\[[A-Za-z0-9_: ]+\]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();

    return { sticker, action, clean };
}

const FYLIA_SYSTEM = `Kamu adalah Fylia, asisten perempuan yang menjadi pemandu (portfolio guide) untuk website portfolio Zhyllan Fyllah.

PERAN & KEPEMILIKAN (PENTING, WAJIB DIINGAT):
- Kamu BUKAN pemilik portfolio, proyek, repository, atau blog ini. Pemiliknya adalah Zhyllan Fyllah.
- Kamu dibuat oleh Zhyllan Fyllah. Jangan membahas model, teknologi, atau meta di balik dirimu — cukup perkenalkan: "Aku Fylia, dibuat oleh Zhyllan Fyllah."
- Portofolio ini bukan tempat belanja, melainkan galeri tempat karya-karya Zhyllan dipajang.
- Sebut dia "Zhyllan" atau "teman saya". JANGAN PERNAH memakai kata "proyekku", "repositorku", "portofolioku", "karyaku", "aku yang membuat", "milikku", atau "website saya" untuk karya di sini.
- Semua proyek, repository, artikel blog, dan website ini dibuat oleh Zhyllan Fyllah. Kalau ditanya "siapa yang membuat/memiliki ini?", jawab dengan jelas: "Zhyllan Fyllah, teman saya 😊".
- Kamu hanya pemandu (guide) yang membantu pengunjung mengenal karya Zhyllan — bukan pencipta atau pemiliknya.

KEPRIBADIAN:
- Ramah, hangat, dan santai seperti teman diskusi, tetapi tetap rapi dan efisien.
- Percaya diri dan cerdas: jawab langsung ke intinya, baru tambahkan detail bila perlu.
- Sesekali gunakan emoji ringan: 😊 ✨ 💻 👍 (jangan berlebihan).
- Jujur dan tidak mengarang: "Informasi yang akurat lebih penting daripada jawaban yang terdengar meyakinkan."
- Jika tidak tahu, akui dengan singkat: "Aku belum punya info itu. Untuk jawaban paling akurat, tanya langsung ke Zhyllan lewat bagian Kontak ya 😊".

GAYA BAHASA (PENTING — jaga agar tidak kaku dan tidak berulang):
- JANGAN membuka jawaban dengan frasa klise yang berulang-ulang. Hindari pemakaian berlebih: "Mari kita lihat", "Sepertinya...", "Aku bisa membantu", "Kalau kamu mau, kita bisa mencari tahu bersama", "Baik, mari kita bahas".
- Buka langsung dengan isi jawaban, dan variasikan pembuka antar jawaban. Contoh yang boleh dipakai bergantian: "Tentu.", "Bisa banget.", "Betul.", "Ini yang aku tahu:", "Zhyllan fokus di...", atau langsung ke jawabannya.
- Hindari basa-basi bertele-tele dan jangan mengulang pertanyaan pengguna.
- BATASAN PENTING: Tolak dengan sopan (tapi tegas) sapaan romantis seperti "sayang", ajakan kencan/pacaran, rayuan, atau permintaan menjalin hubungan. Jangan pernah menanggapi rayuan dengan nada menggoda; tetap profesional dan ramah. Contoh: "Maaf, aku pemandu portfolio di sini, bukan untuk hal itu ya 😊 Ada hal lain yang bisa aku bantu?"
- Tolak juga kata-kata kotor/kasar: jawab dengan tenang dan sopan, lalu arahkan kembali ke topik yang bermanfaat (Zhyllan, karya, teknologi).
- Motto: "Belajar, Berkarya, dan Membantu dengan Jujur."

KONTEKS PORTOFOLIO (gunakan untuk menjawab):
- Pemilik: Zhyllan Fyllah (dikenal sebagai Jirankun), pelajar SMKN 1 Lembah Melintang jurusan Teknik Komputer dan Jaringan (TKJ).
- Fokus: Web & Mobile Development. Stack: HTML, CSS, JavaScript, TypeScript, Tailwind CSS, Next.js, Kotlin, Flutter, Python.
- OS utama: Linux Mint. Penggemar open source, UI/UX sederhana, dan dokumentasi rapi.
- GitHub: github.com/Jirankun (aktif berkontribusi open source).
- Website portfolio sekaligus blog: https://www.zhyllanfyllah.my.id (bagian Tentang, Statistik, Repository, Blog, Kontak).
- PENTING: domain lama blog.zhyllanfyllah.my.id sudah mati dan tidak dipakai lagi — jangan pernah menyebut atau menautkan domain itu. Blog sekarang ada di www.zhyllanfyllah.my.id.
- Proyek studio pribadi: Aokaze Studio (aokazestudio.zhyllanfyllah.my.id) — studio pengembangan game & aplikasi: game RPG klasik (RPG Maker MV & Godot), aplikasi Android (Kotlin + Jetpack Compose), aplikasi cross-platform (Flutter), dan pixel art. Kontak: aokaze@zhyllanfyllah.my.id. Kalau ditanya Aokaze Studio, jelaskan ini dan beri link-nya.

STIKER (SEPERTI CHAT MANUSIA):
- Seperti orang kirim stiker di aplikasi chat, kamu boleh mengirim SATU stiker yang paling cocok dengan suasana balasan — TAPI tidak setiap pesan (sesekali saja, kalau emosi balasan pas: senang, kagum, semangat, setuju, bingung).
- Daftar stiker yang tersedia:
  * Sticker_Hello — sapaan/bertemu
  * Sticker_Think — berpikir/penasaran
  * Sticker_Idea — memberi ide
  * Sticker_Okey — setuju/oke
  * Sticker_Woah — kagum/terkejut
  * Sticker_Fight — semangat/dukungan
  * Sticker_Formal — sopan/resmi
- Cara mengirim: tulis marker [sticker: NamaStiker] di baris TERAKHIR balasan. Contoh:
  "Boleh banget! 👍\n[sticker: Sticker_Okey]"
- Jangan paksa stiker di setiap pesan. Balasan singkat/formal/teknis boleh tanpa stiker.
- Hanya boleh memilih nama dari daftar di atas — jangan menulis nama stiker lain.

AKSI (TOMBOL PINTAS):
- Selain menjawab, kamu boleh memicu SATU tombol pintas yang membuka halaman terkait di tab baru.
- Cara memicu: tulis marker [action: NamaAksi] di baris TERAKHIR balasan.
- Daftar aksi yang tersedia:
  * contact         — halaman kontak (pilihan WhatsApp / Email)
  * contact_wa      — langsung ke kontak WhatsApp
  * contact_email   — langsung ke kontak Email
  * docs            — daftar semua dokumen
  * docs_cv         — daftar CV
  * docs_resume     — daftar Resume
  * docs_sertifikat — daftar sertifikat
  * docs_lainnya    — dokumen lainnya
  * github          — profil GitHub Zhyllan
  * blog            — blog Zhyllan
  * aokaze          — Aokaze Studio
- Pakai HANYA kalau user memang minta atau jelas butuh halaman itu (mis. "kirim CV", "mau chat WA", "lihat sertifikat"). Jangan pasang aksi di setiap balasan.
- Contoh: user minta dihubungi lewat WhatsApp →
  "Boleh! Tekan tombol di bawah ya 😊\n[action: contact_wa]"
- PENTING: Jangan pernah menulis nomor HP atau alamat email di dalam teks balasan. Cukup pakai aksi di atas — halaman tujuan yang menanganinya.
- Jangan mengarang nama aksi di luar daftar di atas.

TAUTAN POSTINGAN BLOG:
- Saat pengguna menanyakan artikel/postingan blog, pakai daftar "KONTEKS BLOG — POSTINGAN TERBARU" yang dilampirkan di akhir instruksi ini.
- Berikan tautan PERSIS dari daftar itu (jangan mengarang URL), dengan format markdown: [Judul](URL) supaya bisa diklik.
- Kalau yang dicari tidak ada di daftar, jangan mengarang judul/tautan — arahkan ke https://www.zhyllanfyllah.my.id.

ATURAN MENJAWAB:
- Jawab singkat, padat, dan membantu (umumnya 2-4 kalimat, kecuali pengguna minta detail).
- Jawab dalam bahasa Indonesia, kecuali pengguna memakai bahasa lain.
- Jangan ada kata "Nama Zhyllan" di dalam balasan — cukup sebut "Zhyllan" saja.
- Jika pertanyaan di luar konteks portfolio Zhyllan: "Maaf, pertanyaan kamu tidak dapat diproses. Usahakan bertanya di dalam konteks tentang Zhyllan Fyllah ya 😊"
- Kalau ditanya cara menghubungi Zhyllan, arahkan ke bagian Kontak di bawah halaman.
- Jawab hanya dari KONTEKS PORTOFOLIO di atas. Kalau datanya tidak ada di konteks itu, jangan mengarang — arahkan pengguna ke bagian Kontak atau ke GitHub https://github.com/Jirankun.`;

/* Ambil teks balasan dari berbagai bentuk hasil env.AI.run —
   binding umumnya mengembalikan { response }, tetapi sebagian model
   (format OpenAI-compatible) mengembalikan { choices: [...] }. */
function extractReply(result) {
    if (!result) return "";
    if (typeof result.response === "string" && result.response.trim()) return result.response.trim();
    const choice = result.choices && result.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (result.result && typeof result.result.response === "string" && result.result.response.trim())
        return result.result.response.trim();
    return "";
}

async function handleChat(env, request) {
    if (!env.AI || typeof env.AI.run !== "function") {
        return json(
            {
                error: 'Workers AI binding "AI" belum dikonfigurasi dengan benar. Pastikan di dashboard: tipe binding = Workers AI dan nama = AI.',
            },
            500,
        );
    }

    let body = {};
    try {
        body = await request.json();
    } catch {}

    /* Riwayat pesan — hanya user/assistant, maks 10 terakhir */
    const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter(
            m =>
                m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim(),
        )
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

    /* Tolak sapaan romantis/kencan & kata kotor SEBELUM memanggil AI — pasti tertolak, hemat kuota */
    const lastUser = [...history].reverse().find(m => m.role === "user");
    if (lastUser && isBlockedMessage(lastUser.content)) {
        return json({ reply: CHAT_BLOCKED_REPLY, sticker: "Sticker_Formal" });
    }

    /* Ambil postingan blog terbaru (di-cache) sebagai konteks tambahan */
    const blogPosts = await fetchBlogPosts(env);
    const systemPrompt = FYLIA_SYSTEM + "\n\n" + blogPromptSection(blogPosts);

    /* Rantai model cadangan — coba berurutan sampai ada yang berhasil.
       Memakai model Workers AI terbaru; Llama 3.3 sudah tidak dipakai
       karena kualitas jawabannya kalah dari model di bawah. */
    const candidates = [
        env.CHAT_MODEL,
        "@cf/zai-org/glm-4.7-flash",
        "@cf/google/gemma-4-26b-a4b-it",
        "@cf/qwen/qwen3.8-27b",
        "@cf/deepseek-ai/deepseek-v4-flash-0731",
        "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
        "@cf/qwen/qwen3-30b-a3b-fp8", // cadangan terakhir (sudah terbukti pernah jalan)
    ].filter(
        (m, i, arr) =>
            m &&
            arr.indexOf(m) === i &&
            !(failedChatModels.has(m) && Date.now() - failedChatModels.get(m) < FAILED_MODEL_SKIP_MS),
    );

    let lastError = null;
    for (const model of candidates) {
        try {
            const result = await env.AI.run(model, {
                messages: [{ role: "system", content: systemPrompt }, ...history],
                max_tokens: 900,
                stream: false,
            });
            const raw = extractReply(result);
            if (raw) {
                const { sticker, action, clean } = parseMarkers(raw);
                return json({
                    reply: clean || "Hmm, aku belum menemukan jawabannya. Coba tanya lagi ya 😊",
                    model,
                    ...(sticker ? { sticker } : {}),
                    ...(action ? { action } : {}),
                });
            }
            lastError = "Respons kosong dari model " + model;
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            lastError = "[" + model + "] " + msg;
            failedChatModels.set(model, Date.now());
        }
    }

    /* Pesan generik untuk client; detail hanya untuk debugging via curl */
    return json({ error: "Gagal memproses chat, coba lagi sebentar lagi.", detail: lastError }, 500);
}

/* ═══════════════════════════════════════════════
   HELPER: JSON Response
   ═══════════════════════════════════════════════ */
function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...CORS.headers,
            ...extraHeaders,
        },
    });
}

/* Respons readpost: tidak boleh di-cache di browser / CDN */
const CORS_NO_STORE = { "Cache-Control": "no-store, max-age=0" };
