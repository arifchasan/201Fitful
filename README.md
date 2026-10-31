# 201Fitful

Jurnal kebugaran harian: tulis deklarasi, catat aktivitas, dan unggah foto makan yang otomatis dianalisis AI untuk estimasi kalori dan protein. Front-end HTML + JavaScript (vanilla), back-end Express, database MySQL.

## Fitur

- **Identifikasi email** — email unik menjadi identitas. Memasukkan email yang sudah terdaftar akan memuat profil dan seluruh data sebelumnya (tanpa membuat pengguna baru); data yang diketik ulang tidak menimpa profil lama.
- **Onboarding profil** — email, nama, **tanggal lahir (hari/bulan/tahun)**, gender, tinggi, berat, dan **body fat opsional**; usia dihitung otomatis dari tanggal lahir, BMI juga dihitung otomatis.
- **Anjuran harian** — setelah masuk, dashboard menampilkan estimasi **protein minimal** (1,2 g × berat badan) dan **kalori maksimal** (Mifflin-St Jeor × faktor aktivitas ringan 1,375), lengkap dengan progres asupan hari itu.
- **Deklarasi harian** — satu komitmen per hari.
- **Aktivitas harian** — steps dan jenis olahraga.
- **Catatan puasa** — mencatat **tanggal + jam terakhir makan** dan **tanggal + jam buka puasa** (bukan rencana ke depan); durasi puasa dihitung otomatis, termasuk rentang yang melewati tengah malam.
- **Pola makan** — slot Sarapan, Siang, Malam. Setiap slot menerima satu foto; foto langsung dikirim ke **OpenAI vision** untuk estimasi kalori, protein, dan deskripsi singkat makanan.
- **Edit hasil AI** — deskripsi, kalori, dan protein bisa disunting. Hasil asli AI tetap disimpan: tiap kartu punya tombol **AI / Suntingan** untuk membandingkan, dan suntingan bisa dikembalikan ke hasil AI kapan saja.
- **Total harian** — total kalori dan protein (memakai suntingan bila ada) dari ketiga foto.
- **Progres harian 3 bagian** — hari dianggap lengkap bila **deklarasi terisi**, **aktivitas tercatat** (steps atau jenis olahraga terisi), dan **target protein tercapai**. Jumlah pola makan tidak lagi menentukan progres.
- **Riwayat 7 hari & streak** — jumlah makan tercatat per hari dan hari beruntun yang lengkap (deklarasi + aktivitas + protein).
- **Dashboard semua pengguna** di `/dashboard` — ringkasan harian, mingguan, dan bulanan untuk setiap pengguna: kalori vs batas, protein vs target, makan tercatat, langkah, durasi olahraga, puasa, hari lengkap, dan status target tercapai/ tidak.
- **Detail per peserta** di `/dashboard/:userId` — profil lengkap, ringkasan hari ini/ 7 hari/ 30 hari, serta seluruh catatan harian 30 hari terakhir: deklarasi, aktivitas, jendela puasa, total gizi, dan **foto setiap makan** beserta hasil AI dan suntingannya.
- Foto bisa diganti (foto lama dihapus), dihapus, dan analisis AI bisa diulang jika gagal.

## Stack

| Bagian    | Teknologi                                        |
| --------- | ------------------------------------------------ |
| Front-end | HTML, CSS (mobile-first), JavaScript vanilla     |
| Back-end  | Node.js + Express 5                              |
| Database  | MySQL (diuji dengan MariaDB 10.4, protokol MySQL) |
| Upload    | Multer → `storage/uploads`                       |
| Analisis  | OpenAI Chat Completions (vision, default `gpt-4o-mini`) |

## Menjalankan

1. Pastikan server MySQL berjalan.

2. Salin konfigurasi lalu sesuaikan:

   ```bash
   cp .env.example .env
   ```

   ```env
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=fitintake
   PORT=3000

   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```

3. Pasang dependensi dan siapkan tabel:

   ```bash
   npm install
   npm run db:init
   ```

   Server juga otomatis membuat database + tabel saat dijalankan.

4. Jalankan:

   ```bash
   npm run dev
   # atau
   npm start
   ```

5. Buka <http://localhost:3000>.

## Skema database

**users** — profil pengguna (`id`, `name`, `email` unik, `birth_date`, `age`, `gender`, `height_cm`, `weight_kg`, `body_fat` opsional, timestamps). `birth_date` adalah sumber kebenaran usia; kolom `age` tetap diisi sebagai cache untuk pengguna lama yang belum punya tanggal lahir. Kolom email, index unik, body fat, dan birth date ditambahkan otomatis untuk database lama.

**daily_entries** — satu baris per pengguna per tanggal (unik `user_id + entry_date`): `declaration_text`, `steps`, `sport`, `last_meal_at`, `fast_break_at` (keduanya `DATETIME`, jadi tanggal ikut tersimpan). Durasi puasa tidak disimpan; dihitung dari dua catatan waktu tersebut setiap kali data dibaca. Database lama yang masih memakai kolom `last_meal_time`/`fast_break_time` (`TIME`) dimigrasikan otomatis saat server start: nilainya dipindahkan ke kolom baru dengan tanggal dari `entry_date`.

**meals** — satu baris per pengguna, tanggal, dan jenis makan (unik `user_id + entry_date + meal_type`): `photo_path`, `food_name`, `calories`, `protein_g`, `ai_status` (`pending`/`done`/`failed`), `ai_error`, plus kolom suntingan `edited_food_name`, `edited_calories`, `edited_protein_g` yang dibiarkan `NULL` selama belum diedit. Kolom suntingan ditambahkan otomatis saat server start (migrasi tanpa menghapus data).

Skema lengkap: [`server/schema.sql`](server/schema.sql).

## Halaman dashboard

Buka <http://localhost:3000/dashboard>. Halaman ini menampilkan:

- Ringkasan keseluruhan: jumlah pengguna, aktif hari ini, total makan hari ini, dan berapa pengguna yang memenuhi target gizi.
- Kartu per pengguna berisi identitas (email, BMI, body fat, streak) dan tab **Harian / Mingguan / Bulanan**.
  - Harian: kalori vs batas, protein vs minimal, bar progres, makan `x/3`, langkah, olahraga, puasa (durasi + rentang tanggal/jam), progres `x/3`, serta badge "Protein tercapai/kurang", "Kalori dalam batas/melebihi", dan "Hari lengkap". "Hari lengkap" berarti deklarasi + aktivitas + protein tercapai.
  - Mingguan (7 hari) dan bulanan (30 hari): rata-rata kalori, jumlah hari protein tercapai, hari kalori melebihi batas, hari lengkap, hari tercatat, total makan, dan total langkah.
- Setiap kartu punya tautan **Lihat detail** ke `/dashboard/:userId`.

### Detail peserta `/dashboard/:userId`

Menampilkan satu peserta secara utuh:

- Profil: email, tanggal lahir, usia, gender, tinggi, berat, body fat, BMI, tanggal bergabung, streak, serta target protein minimal dan kalori maksimal dengan progres hari ini.
- Ringkasan tiga periode: hari ini, 7 hari, dan 30 hari (kalori, protein, makan, puasa, hari tercatat, hari lengkap).
- Daftar catatan harian 30 hari terakhir (yang ada isinya, terbaru di atas): deklarasi, steps, olahraga, catatan puasa (tanggal & jam terakhir makan → buka puasa) beserta durasinya, progres `x/3` hari itu, total protein/kalori, serta tiga slot makan.
- Setiap foto makan ditampilkan sebagai thumbnail yang bisa diketuk untuk membuka ukuran penuh; hasil AI dan suntingannya ditandai (`AI` / `Suntingan`) beserta nilai asli AI bila sudah disunting.

Halaman ini **tidak memiliki autentikasi**: siapa pun yang membuka URL tersebut dapat melihat data semua pengguna. Batasi akses (misalnya di balik login admin) sebelum dipakai publik.

## API

| Method | Endpoint                                          | Keterangan                                        |
| ------ | ------------------------------------------------- | ------------------------------------------------- |
| POST   | `/api/users`                                      | Buat profil (butuh `birthDate` `YYYY-MM-DD`), atau muat profil lama bila `email` sudah ada (`existed: true`). Respons menyertakan `birthDate`, `age` hasil hitung, dan `recommendation` |
| GET    | `/api/users/:userId`                              | Profil + BMI                                      |
| PATCH  | `/api/users/:userId`                              | Perbarui profil                                   |
| GET    | `/api/users/:userId/days/:date`                   | Entri, 3 slot makan, total, progres               |
| PUT    | `/api/users/:userId/days/:date/entry`             | Simpan deklarasi + aktivitas + `lastMealAt`/`fastBreakAt` (`YYYY-MM-DDTHH:MM`, wajib berpasangan) |
| POST   | `/api/users/:userId/days/:date/meals`             | Upload foto makan (multipart `photo`, `mealType`) dan analisis AI |
| PUT    | `/api/users/:userId/meals/:mealId`                | Simpan suntingan hasil AI (tanpa menimpa hasil AI) |
| DELETE | `/api/users/:userId/meals/:mealId/edit`           | Kembalikan ke hasil AI (hapus suntingan)          |
| POST   | `/api/users/:userId/meals/:mealId/analyze`        | Ulangi analisis AI untuk foto tersimpan           |
| DELETE | `/api/users/:userId/meals/:mealId`                | Hapus foto + hasil analisis                       |
| GET    | `/api/users/:userId/overview?days=7`              | Riwayat makan harian dan streak                   |
| GET    | `/api/dashboard`                                  | Ringkasan semua pengguna (harian, mingguan, bulanan) |
| GET    | `/api/dashboard/users/:userId`                    | Detail satu peserta: profil, ringkasan, dan catatan 30 hari beserta foto |

Upload dibatasi 6 MB dengan tipe JPG/PNG/WEBP. Jika analisis AI gagal (kuota, jaringan, atau key salah), foto tetap tersimpan dan respons berisi `aiStatus: "failed"` beserta pesan error singkat.

## Struktur folder

```
.
├── public/
│   ├── index.html
│   ├── styles.css      # mobile-first
│   ├── app.js
│   ├── dashboard.html  # halaman /dashboard
│   ├── dashboard.css
│   ├── dashboard.js
│   ├── detail.html     # halaman /dashboard/:userId
│   └── detail.js
├── server/
│   ├── index.js        # Express + endpoint
│   ├── ai.js           # OpenAI vision (kalori & protein)
│   ├── db.js           # pool MySQL + auto-create tabel
│   ├── init-db.js
│   └── schema.sql
├── storage/uploads/    # foto (di-ignore git)
├── .env.example
└── package.json
```

## Catatan

- **API key hanya dipakai di server** (`server/ai.js`) dan dibaca dari `.env`; jangan menaruhnya di kode front-end atau commit ke git. `.env` sudah masuk `.gitignore`.
- Estimasi kalori/protein berasal dari model AI dan bersifat perkiraan, bukan nasihat medis. Anjuran protein/ kalori juga hanya estimasi dari rumus Mifflin-St Jeor dengan asumsi aktivitas ringan.
- Identitas saat ini hanya berbasis email tanpa password/verifikasi, jadi **bukan autentikasi yang aman**. Siapa pun yang tahu sebuah email bisa memuat profil itu. Untuk produksi, tambahkan verifikasi email/OTP atau login, dan batasi akses data per pengguna.
- ID pengguna disimpan di `localStorage` dan API memakai `userId` di URL.
- Foto disimpan di disk lokal; untuk deployment multi-instance gunakan object storage.
