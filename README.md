# WORKZEN

Dashboard operasional (Next.js 15, TypeScript, Tailwind v4) sekaligus endpoint Inngest dan integrasi Gmail. UI dua bahasa (ID/EN) dan dua mode (terang/gelap), navigasi di atas.

## Prasyarat

Selesaikan dulu: `01-supabase` dan `02-google-gmail`. Inngest lokal tidak butuh akun (lihat `03-inngest`).

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local     # isi nilai dari 01 dan 02
npm run dev                    # terminal 1  -> http://localhost:3000
npm run inngest:dev            # terminal 2  -> http://localhost:8288
```

Login dengan user yang dibuat di Supabase (sudah dijadikan admin).

## Environment

| Variabel                                                                                                  | Asal                                                     |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`                  | `01-supabase`                                            |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GMAIL_MAILBOX`, `GMAIL_INTAKE_QUERY` | `02-google-gmail`                                        |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`                                                                | `03-inngest` (production)                                |
| `EMAIL_LANG`                                                                                              | `id`, `en`, atau `both`: bahasa email task ke departemen |

`SUPABASE_SERVICE_ROLE_KEY` dan token Google hanya boleh ada di environment server.

## Deploy (contoh: Vercel)

1. Push folder ini ke repo Git, import di Vercel (framework Next.js terdeteksi otomatis).
2. Isi semua environment variable di atas.
3. Deploy, lalu sync URL `/api/inngest` di Inngest (lihat `03-inngest/README.md`).

Endpoint `/api/inngest` memakai `maxDuration = 60`. Pada plan Vercel gratis batas fungsi lebih rendah. Jika polling sering terpotong, turunkan `MAX_PER_RUN` di `src/inngest/functions.ts` atau naikkan plan.

## Struktur

```
src/
  app/            halaman (login, dashboard, inquiries) dan route /api/inngest
  components/     top-nav, preferences (bahasa/tema), status, auto-refresh
  inngest/        client dan fungsi workflow
  lib/
    gmail/        client Gmail dan parsing email
    email/        penyusunan dan pengiriman email task (outbox)
    i18n/         kamus ID/EN dan pengaturan bahasa
    supabase/     client server dan service-role
```

## Tes cepat (end-to-end)

1. Kirim email dari akun lain ke mailbox intake.
2. Dalam sekitar 2 menit inquiry muncul di Dashboard (atau picu `gmail-poll` manual di dev server Inngest).
3. Buka inquiry, pilih departemen, klik **Buat task dan kirim email**.
4. Email task tiba di alamat departemen dengan subjek `[WZ-0001][PROC-001] ...`.
5. Balas email itu. Balasan tercatat di thread inquiry.

## Perintah

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run inngest:dev`
