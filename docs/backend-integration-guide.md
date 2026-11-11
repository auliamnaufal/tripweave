# Panduan integrasi data & backend Tripweave

Tujuan: backend (data supplier, harga, pembayaran, booking) aman dan lengkap **sebelum** AI agent dipasang. Agent nanti cuma memilih offer dan menjelaskan; semua angka, uang, dan status dipegang kode deterministik di server.

## 0. Prinsip yang tidak boleh dilanggar

1. **Server adalah sumber kebenaran harga.** Browser hanya mengirim `quoteId` / `orderId`. Tidak pernah harga, offer, atau payee. *(Sudah diterapkan: tabel `plan_quotes`.)*
2. **Setiap perpindahan uang idempoten.** Create order, capture, refund, dan booking supplier punya idempotency key yang diturunkan dari id quote. *(Sudah untuk PayPal: `requestIds` di `src/features/quotes/quote.ts`.)*
3. **Setiap item yang dibayar punya satu catatan yang tahan lama** (tabel `bookings`). UI, webhook, dan rekonsiliasi membaca dari sana, bukan dari stream.
4. **Satu model kanonik.** Semua supplier dipetakan ke `TravelOffer`. Payload asli supplier disimpan untuk audit, tapi kode lain tidak boleh bergantung padanya.
5. **LLM tidak pernah menyentuh uang atau PII.** Agent hanya melihat offer yang sudah dinormalisasi, lalu memilih `offerIds`.

## 1. Alur data saat ini (setelah perbaikan)

```
/api/plan        brief → search (Duffel + sintetis) → buildItinerary (deterministik)
                 → simpan plan_quotes(status=quoted, offers, total, expires_at) → kirim quoteId
/api/payments/order    { quoteId } → cek pemilik + kedaluwarsa → PayPal order (PayPal-Request-Id)
                 → plan_quotes(status=ordered, paypal_order_id)
/api/payments/capture  { orderId } → kunci ordered→capturing → capture (idempoten)
                 → bookings(pending/paid_direct) → booking → bookings(booked/failed)
                 → refund per item gagal (idempoten) → plan_quotes(status=completed)
                 Error setelah uang masuk → status=needs_attention (perlu dicek manusia)
```

Status quote: `quoted → ordered → capturing → completed`, plus `needs_attention`.

## 2. Urutan kerja yang disarankan

### Fase A — Kontrak adapter supplier ✅ selesai

Yang sudah ada:
- `src/features/suppliers/adapter.ts`: kontrak `SupplierAdapter` (`search`, `reprice`, `book`, `isConfigured`).
- `duffel.ts` → `duffelAdapter`. Search asli, `reprice` asli via `GET /air/offers/{id}`, booking masih simulasi. `expiresAt` memakai `expires_at` milik Duffel kalau lebih awal.
- `synthetic.ts` → `syntheticAdapter`.
- `registry.ts`: `searchCatalog` (paralel per kategori, timeout per adapter, validasi kontrak di boundary, dedupe id, fallback eksplisit, laporan `sources`), `adapterFor`, `repriceOffer`, `bookOffer`.
- `bookingExecutor.ts`: `runBookings` deterministik. Capture memakai ini, bukan LLM. Hasil dicatat dari jawaban adapter, dengan idempotency key `${quoteId}:${offerId}`.
- `/api/plan` hanya search **sekali**. Agent dan server memakai katalog yang sama.
- `adapter.contract.test.ts`: satu set tes kontrak untuk setiap adapter.

**Cara menambah supplier baru** (misal Viator):
1. Buat `src/features/suppliers/viator.ts` yang mengekspor `viatorAdapter: SupplierAdapter` (`name: "viator"`, `kinds: ["activity"]`).
2. Simpan contoh respons API asli sebagai fixture, lalu tambahkan `contract("viator", { ... })` di `adapter.contract.test.ts`.
3. Daftarkan di `defaultRegistryConfig()`: `activity: { primary: [viatorAdapter], fallback: [syntheticAdapter], required: false }`.
4. Tidak ada file lain yang perlu diubah: planner, quote, pembayaran, dan booking otomatis ikut.

Bentuk kontraknya (sebagai referensi):

```ts
export interface SupplierAdapter {
  readonly name: string;                       // "duffel", "viator", ...
  readonly kinds: TravelOffer["productKind"][];
  search(brief: TripBrief): Promise<TravelOffer[]>;
  /** Ambil harga & ketersediaan terbaru sesaat sebelum bayar. */
  reprice(offer: TravelOffer): Promise<{ offer: TravelOffer; changed: boolean } | { unavailable: true }>;
  /** Wajib idempoten terhadap idempotencyKey. */
  book(offer: TravelOffer, traveler: TravelerDetails, idempotencyKey: string): Promise<BookingResult>;
  cancel?(bookingRef: string): Promise<{ status: "cancelled" | "not_cancellable"; refundableMinorUnits: number }>;
}
```

- Pindahkan `searchAllOffers` di `duffel.ts` menjadi registry: `adapters.filter(a => a.kinds.includes(kind))`, panggil paralel dengan `Promise.allSettled` + timeout per adapter, lalu fallback ke sintetis kalau semuanya gagal.
- `simulateBooking` jadi `syntheticAdapter.book`.
- Tes kontrak yang sama dijalankan untuk setiap adapter (pakai fixture respons API yang disimpan).

### Fase B — Re-price sebelum bayar

Di `/api/payments/order`, sebelum membuat order PayPal:
1. `reprice` semua offer di quote.
2. Kalau ada yang `unavailable` → 409 `quote-unavailable`, minta re-plan.
3. Kalau harga berubah → simpan quote baru (versi baru, status `quoted`), balas 409 `quote-repriced` beserta total baru. UI minta persetujuan, lalu bayar quote baru itu.
4. Kalau sama → lanjut seperti sekarang.

Ini yang menutup celah "harga Duffel sudah kedaluwarsa 15 menit". Untuk sekarang order cukup ditolak kalau `expires_at` lewat.

### Fase C — Booking pindah ke worker (outbox)

Saat ini booking berjalan di dalam HTTP stream. Kalau proses mati, quote tertahan di `capturing`. Solusinya:
1. Capture route hanya: capture → tulis `bookings(pending)` → status quote `booking` → selesai.
2. Worker (Supabase Edge Function terjadwal, Heroku Scheduler, atau queue) mengambil `bookings.status='pending'` dengan `select … for update skip locked`, memanggil `adapter.book(offer, traveler, booking.id)`, lalu update baris. Refund untuk yang gagal.
3. UI berlangganan perubahan `bookings` via Supabase Realtime (atau polling `GET /api/bookings?quoteId=`).
4. Tambahkan `attempts`, `next_attempt_at`, `last_error` di `bookings` untuk retry dengan backoff.

### Fase D — Webhook PayPal (#5)

`POST /api/webhooks/paypal`:
1. Verifikasi signature lewat `POST /v1/notifications/verify-webhook-signature` (butuh `PAYPAL_WEBHOOK_ID`).
2. Simpan ke `webhook_events(event_id unique, type, payload, processed_at)`. Kalau `event_id` duplikat, langsung balas 200.
3. Cari quote lewat `resource.custom_id`. Ini sudah diisi id quote di setiap purchase unit.
4. `PAYMENT.CAPTURE.COMPLETED` → kalau quote masih `ordered`/`capturing`, tandai uang sudah masuk. Ini jaring pengaman kalau browser tertutup sebelum capture selesai.
5. `PAYMENT.CAPTURE.REFUNDED` / `REVERSED` / `DENIED` → update `bookings.refund_status` atau set quote `needs_attention`.
6. Selalu balas 200 cepat. Proses berat dikerjakan worker.

### Fase E — Supplier asli, satu per satu

| Urutan | Supplier | Mode | Yang perlu disimpan |
|---|---|---|---|
| 1 | Duffel flights (sudah search) | `GET /air/offers/{id}` untuk reprice; `POST /air/orders` type `instant`, payment `balance` | `order_id`, `booking_reference`, raw offer, data penumpang (terenkripsi) |
| 2 | Viator / GetYourGuide (aktivitas) | Mulai dari affiliate/deeplink (cepat), lalu booking API setelah approve | `productCode`, `listingUrl`, kebijakan pembatalan |
| 3 | Hotel (Duffel Stays / Expedia Rapid / Hotelbeds) | search → quote/rate check → book | `rate_id`/`quote_id`, `reservation_id`, cancellation deadline |

Untuk setiap supplier:
- [ ] Simpan key di env server, jangan pernah di `NEXT_PUBLIC_*`.
- [ ] Mapper `providerResponse → TravelOffer` sebagai fungsi murni + tes pakai fixture asli.
- [ ] Konversi mata uang dicatat beserta kurs dan waktunya (Frankfurter sudah dipakai di `duffel.ts`).
- [ ] Timeout, retry hanya untuk operasi idempoten, dan circuit breaker sederhana (lewati adapter yang error beruntun).
- [ ] Hormati rate limit (cache hasil search per brief beberapa menit).
- [ ] `synthetic: false` hanya untuk data yang benar-benar dari API.

### Fase F — Data traveler (prasyarat booking asli)

Booking asli butuh nama sesuai paspor, tanggal lahir, kontak, dan kadang nomor paspor.
- Tabel `travelers` milik user (RLS owner). Kolom sensitif dienkripsi (pgsodium/Vault, atau enkripsi di aplikasi).
- Dikumpulkan di checkout, dirujuk dari quote lewat `traveler_ids`, dan **tidak pernah** dikirim ke LLM.

### Fase G — Rekonsiliasi & operasional

- Job harian: untuk setiap quote `completed`, `bookedMinorUnits + refundedMinorUnits == captured`. Ini invariant yang sudah dicek `reconcileBookings`, sekarang dicek ulang dari DB.
- Dashboard admin kecil untuk quote `needs_attention`.
- Log terstruktur: `quote_id`, `paypal_order_id`, `offer_id`, `supplier`. Jangan log PII atau token.

## 3. Skema tambahan yang nanti dibutuhkan

```sql
alter table bookings add column attempts int not null default 0,
  add column next_attempt_at timestamptz, add column last_error text,
  add column supplier_raw jsonb;
create table webhook_events (event_id text primary key, type text not null,
  payload jsonb not null, received_at timestamptz default now(), processed_at timestamptz);
create table suppliers (id text primary key, kind text not null,
  paypal_payee_email text, active boolean default true);  -- registry Onboarded Supplier
create table travelers (...);  -- RLS owner, kolom terenkripsi
```

Tabel `suppliers` menggantikan input payee manual di `/lab`. Payee hanya boleh datang dari registry ini.

## 4. Kapan AI agent dipasang

Setelah A–D selesai, agent cukup:
- menerima katalog `TravelOffer` dari registry adapter,
- mengembalikan `offerIds` + catatan,
- sementara `buildItinerary`, quote, reprice, order, capture, booking, dan refund semuanya tetap deterministik.

Refinement (#20) cukup mengirim `previousQuoteId`. Server memuat offer lama dari DB dan hanya mencari ulang kategori yang berubah.

## 5. Checklist "backend aman"

- [x] Harga, offer, dan payee tidak bisa diatur client (`plan_quotes`)
- [x] Idempotency key untuk create, capture, dan refund PayPal
- [x] Kunci capture (hanya satu request yang lolos), replay hasil untuk reload
- [x] `forceFailure` dan payee manual hanya saat `DEMO_MODE=true`
- [x] RLS: tabel quote/booking tidak bisa dibaca atau ditulis dengan key publik
- [x] Kontrak adapter + registry + tes kontrak (Fase A)
- [x] Satu kali search per plan; hasil booking dicatat kode, bukan LLM
- [x] Sumber bookable vs deeplink + pembanding harga lintas platform (`compare.ts`)
- [x] PayPal sesuai guide Orders v2 (`experience_context`, `payer-action`, return/cancel URL, line items)
- [x] Re-price sebelum bayar (Fase B): `src/features/quotes/reprice.ts`, dipanggil di order route
- [ ] Booking via worker + retry (Fase C)
- [x] Webhook PayPal terverifikasi + dedupe (Fase D): `/api/webhooks/paypal`, tabel `webhook_events`
- [ ] Adapter supplier asli + tes kontrak (Fase E)
- [ ] Data traveler terenkripsi (Fase F)
- [ ] Rekonsiliasi harian + antrean `needs_attention` (Fase G)
