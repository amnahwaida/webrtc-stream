# 🚀 WebRTC Ultra-Low Latency LAN Stream (v10 Stable)

Sistem live-streaming berbasis WebRTC yang dioptimalkan secara ekstrem untuk lingkungan Jaringan Lokal (LAN/WiFi). Dirancang khusus untuk kebutuhan sekolah (STB/CCTV/Mobile Streaming) dengan latensi *glass-to-glass* sub-200ms.

---

## 🌟 Fitur Utama

### 1. 🎮 Remote Control System (Viewer-to-Publisher)
Viewer memiliki kendali penuh atas perangkat Publisher melalui jalur signaling WebSocket:
- **Remote Mic Toggle:** Mematikan/menyalakan mikrofon Publisher dari jarak jauh.
- **Remote Camera Flip:** Menukar kamera (Depan/Belakang) Publisher secara remote.
- **Audio Status Sync:** Sinkronisasi status mikrofon secara real-time menggunakan sistem *Truth-Based Signaling*.

### 2. ⚡ Latency Optimization (Bare-Metal Mode)
Dioptimalkan untuk memangkas setiap milidetik delay:
- **No-TURN LAN Mode:** Menghapus overhead pengumpulan kandidat TURN (hemat 100-300ms saat handshake).
- **Realtime Latency Mode:** Menggunakan API standar W3C `latencyMode: 'realtime'` untuk mematikan jitter buffer browser.
- **VP8 Priority:** Memprioritaskan codec VP8 untuk kompatibilitas maksimal dengan OBS Browser Source (mencegah black screen/stutter).
- **L1T1 Scalability:** Memaksa encoding lapisan tunggal untuk pemrosesan video tercepat di chipset mobile.

### 3. 🛡️ Robustness & Auto-Recovery
- **ICE Auto-Restart:** Melakukan negosiasi ulang secara otomatis jika koneksi WiFi tidak stabil.
- **Heartbeat Sync:** Sistem ping/pong yang sinkron dengan server keepalive untuk menjaga koneksi WebSocket tetap hidup.
- **Memory Leak Protection:** Pembersihan interval dan listener secara otomatis saat reconnect atau stop.

---

## 🏗️ Arsitektur Teknis

### Jalur Komunikasi:
- **Signaling (Port 3080):** Node.js WebSocket Server untuk pertukaran SDP/ICE.
- **Media (WebRTC):** Aliran raw video/audio langsung antar perangkat (P2P).
- **STUN Server (Port 3478):** Coturn (dalam Docker) untuk resolusi IP lokal tercepat.

### Stack Teknologi:
- **Backend:** Node.js (Signaling)
- **Frontend:** Vanilla JS (WebRTC API)
- **Infrastructure:** Docker & Docker Compose
- **Network:** Pure LAN (No Internet Required)

---

## 🚀 Panduan Instalasi (Docker)

1. **Clone Repositori:**
   ```bash
   git clone https://github.com/amnahwaida/webrtc-stream.git
   cd webrtc-stream
   ```

2. **Konfigurasi Environment:**
   Edit file `.env` (atau gunakan default):
   ```env
   PORT=3000
   HTTP_PORT=3080
   MAX_VIEWERS=5
   ```

3. **Jalankan dengan Docker Compose:**
   ```bash
   docker compose up -d --build
   ```

---

## 📱 Cara Penggunaan

### 1. Sisi Publisher (Pengirim)
Buka browser (Chrome/Edge di Android/iOS sangat disarankan) ke:
`http://[IP-SERVER]:3080/`
- Pilih resolusi dan FPS.
- Klik **Start Camera**.

### 2. Sisi Viewer (Penerima)
Buka URL berikut di perangkat lain:
- **Browser Biasa:** `http://[IP-SERVER]:3080/view`
- **OBS Browser Source:** `http://[IP-SERVER]:3080/obs.html?room=cam1`

---

## 🔒 Keamanan & Izin Kamera (PENTING)

Browser modern (Chrome, Safari, Edge) hanya mengizinkan akses kamera/mikrofon pada **Secure Context** (HTTPS atau localhost).

### Opsi 1: Menggunakan HTTPS (Port 3000)
Gunakan port **3000** untuk Publisher: `https://[IP-SERVER]:3000/`.
> **Catatan:** Karena menggunakan sertifikat self-signed, browser akan memberikan peringatan keamanan. Klik **Advanced** -> **Proceed to [IP] (unsafe)** untuk melanjutkan.

### Opsi 2: Bypass Insecure Origin (Untuk Port 3080)
Jika Anda ingin menggunakan port **3080** (HTTP) tanpa ribet dengan peringatan SSL, Anda harus mendaftarkan IP server sebagai origin yang aman di browser Publisher:
1. Buka Chrome/Edge di perangkat Publisher.
2. Akses: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
3. Masukkan alamat server, contoh: `http://192.168.1.13:3080`
4. Ubah dropdown menjadi **Enabled**.
5. Klik **Relaunch**.
6. Kamera sekarang dapat diizinkan pada port 3080.

---

## 🔧 Optimasi Spesifik Lingkungan LAN

### 🔊 Audio Configuration (Optimized for Speech)
- **Codec:** Opus Mono
- **Bitrate:** 48kbps VBR (Variable Bitrate)
- **Settings:** Echo Cancellation, Noise Suppression, & Auto Gain Control aktif.

### 🎥 Video Configuration
- **Priority:** Maintain Framerate (mencegah video melambat saat sinyal WiFi turun).
- **Content Hint:** `motion` (dioptimalkan untuk pergerakan kamera aktif).

---

## ⚠️ Troubleshooting

- **Black Screen di OBS:** Pastikan menggunakan URL `obs.html`. Kami telah memprioritaskan codec VP8 yang kompatibel dengan CEF (Chrome Embedded Framework) di OBS.
- **Suara Tidak Muncul:** Browser memblokir suara otomatis. Klik pada video di sisi Viewer untuk melakukan **Unmute**.
- **Koneksi Gagal (Handshake):** Pastikan semua perangkat berada di **1 WiFi yang sama**. Karena TURN dinonaktifkan untuk kecepatan, perangkat di subnet yang berbeda mungkin tidak bisa terhubung.

---

## 📝 Catatan Audit Latensi
Versi ini telah melalui 3 tahap audit performa intensif:
1. Perbaikan sinkronisasi status audio.
2. Pembersihan memory leaks dan optimasi CPU stats.
3. Implementasi `latencyMode: realtime` dan pruning jalur ICE.

---
*Developed for Schools & LAN Streaming Environments*
