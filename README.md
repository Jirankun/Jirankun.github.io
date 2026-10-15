# Portofolio Zhyllan Fyllah

Situs portofolio statis (HTML/CSS/JS) di **Cloudflare Pages** — `zhyllanfyllah.my.id`.
Aset, font, ikon, dan stylesheet-nya ada di repo terpisah: **My-assets-CDN** (`cdn.zhyllanfyllah.my.id`).

## Struktur

| Path                                 | Isi                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `index.html`                         | Halaman portofolio utama (Tentang, Statistik GitHub, Keahlian, FAB dokumen).                                 |
| `open/index.html`                    | Gerbang tautan `/open`; tombol dirender dari daftar media di server.                                         |
| `functions/open/verify.js`           | Verifikasi Turnstile `/open` + daftar & tujuan seluruh media.                                                |
| `functions/_lib/sign.js`             | Cookie sesi bertanda tangan HMAC untuk `/open`.                                                              |
| `dokumen/index.html`                 | Index dokumen (terbuka, tanpa verifikasi).                                                                   |
| `dokumen/index.js`                   | Menyembunyikan kategori kosong di index dokumen.                                                             |
| `dokumen/view/<kategori>/index.html` | Daftar berkas per kategori.                                                                                  |
| `dokumen/view/view.js`               | Membaca satu sumber `dokumen/data.json` lalu merender daftar.                                                |
| `dokumen/data.json`                  | Satu-satunya sumber data: atur semua path berkas & gambar pratinjau.                                         |
| `worker.js`                          | Cloudflare Worker: `/chat` (AI Fylia), `/read` (jumlah dilihat), dan `/open/verify` (gerbang tautan kontak). |
| `ai/index.html`                      | Antarmuka AI Fylia.                                                                                          |

## Halaman `/open` (gerbang tautan)

Satu-satunya halaman yang dijaga Turnstile. URL tujuan **tidak pernah ditulis di HTML** — halaman mengirim token ke `POST https://zhyllan.jirankun.workers.dev/open/verify`; Worker mengembalikan daftar media hanya setelah token lolos verifikasi. Halaman memakai `noindex, nofollow` dan `no-referrer`.

Menambah media sosial: tambahkan satu objek pada larik `MEDIA` di `functions/open/verify.js`.

```js
{ slug: "gh", label: "GitHub", env: "TARGET_GH", fallback: build(["https://", "github", ".com/", "Jirankun"]), aliases: ["github"] },
```

Tombol, slug (`/open?gh`), dan redirect otomatis mengikuti. Nilai bisa ditimpa lewat env `TARGET_<NAMA>`.

| Kolom      | Keterangan                                     |
| ---------- | ---------------------------------------------- |
| `slug`     | Kunci utama pada URL (`?slug`).                |
| `label`    | Teks tombol.                                   |
| `env`      | Nama env Cloudflare yang menimpa nilai bawaan. |
| `fallback` | Tujuan bawaan; rakit dengan `build([...])`.    |
| `aliases`  | Slug alternatif (mis. `instagram` untuk `ig`). |

## Dokumen

`dokumen/data.json` adalah satu-satunya sumber. Tiap kategori berisi array objek `{ name, file, type, image }`:

- `file` — URL berkas (PDF/DOCX).
- `image` — URL gambar pratinjau (boleh kosong).

Halaman dokumen **terbuka** untuk siapa saja. Saat tautan berkas diklik, browser yang menanganinya (PDF tampil di tab baru, DOCX diunduh). Berkas & gambar disajikan dari CDN `cdn.zhyllanfyllah.my.id` — URL berkas wajib memakai prefiks `/cdn/` (mis. `https://cdn.zhyllanfyllah.my.id/cdn/privite/document/...`).

Kategori yang kosong (`[]` atau tanpa entri ber-`file`) **tidak ditampilkan** sebagai gerbang di index dokumen. Untuk memunculkannya, cukup isi entri pada kategori terkait di `dokumen/data.json`.

## AI Fylia & Readpost (`worker.js`)

- `POST /chat` — chat AI Fylia (Cloudflare Workers AI). Binding: `AI` (jenis Workers AI).
- `GET/POST /read` — jumlah dilihat artikel. Binding KV: `READPOST` (key `view:<slug>`).
- `CHAT_MODEL` opsional untuk mengganti model utama.

## Styling

Halaman memuat CSS global **MaterialZ** dari CDN (`cdn/public/css/materialZ/1.0.0.css`) untuk token warna, font (Chillax, Plus Jakarta Sans), dan komponen. CSS halaman (portofolio, dokumen) hanya berisi layout. Detail lengkap ada di README repo **My-assets-CDN**.

## Konfigurasi (Cloudflare)

- `TURNSTILE_SECRET_KEY` — secret Turnstile untuk `/open` (wajib, sebagai env — jangan di berkas repo).
- `CONTACT_KEY_SECRET` — opsional; secret penandatangan cookie sesi `/open`.
- `TARGET_WA`, `TARGET_MAIL`, `TARGET_IG`, `TARGET_X` — opsional; menimpa tujuan bawaan media.
- Worker: binding `AI` (Workers AI) dan `READPOST` (KV).

## Keamanan

- Jangan menyimpan secret di berkas yang ikut ter-deploy. Semua berkas di root repo dapat diakses publik — secret harus berupa env Cloudflare.
- `robots.txt` saat ini masih `Allow: /` untuk banyak bot; perketat bila ingin menolak scraper.
- Berkas dokumen di host CDN tidak dilindungi Functions domain utama; jaga agar URL-nya tidak disebar.
