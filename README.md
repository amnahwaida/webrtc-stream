# 📡 WebRTC LAN Streaming

Sistem streaming video **low-latency** berbasis WebRTC untuk jaringan lokal (LAN).  
Dirancang untuk berjalan di **STB Armbian (ARM64)** dengan Docker, atau langsung via Node.js.

> **Latency target**: ≤ 100ms end-to-end pada LAN stabil

---

## 📋 Daftar Isi

- [Arsitektur](#-arsitektur)
- [Fitur](#-fitur)
- [Persyaratan](#-persyaratan)
- [Instalasi & Menjalankan](#-instalasi--menjalankan)
  - [Cara 1: Node.js Langsung](#cara-1-nodejs-langsung)
  - [Cara 2: Docker Compose](#cara-2-docker-compose)
- [Penggunaan](#-penggunaan)
  - [Publisher (HP / Sumber Kamera)](#1-publisher-hp--sumber-kamera)
  - [Viewer (Laptop / Penampil)](#2-viewer-laptop--penampil)
- [Konfigurasi](#-konfigurasi)
- [REST API](#-rest-api)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Troubleshooting](#-troubleshooting)
- [Struktur Proyek](#-struktur-proyek)

---

## 🏗 Arsitektur

```
┌─────────────────┐      WebSocket (wss://STB:3000/ws)      ┌──────────────────┐
│  HP (Publisher)  │◄──────────────────────────────────────►│  STB / Server    │
│  Browser Camera  │                                        │  Signaling Server│
│  getUserMedia()  │◄────── WebRTC P2P (UDP) ──────────────►│  (Node.js)       │
└─────────────────┘                                        └────────┬─────────┘
                                                                    │
                                                           ┌────────▼─────────┐
                                                           │  Laptop (Viewer) │
                                                           │  Browser Native  │
                                                           └──────────────────┘
```

**Alur singkat:**
1. **Publisher** (HP) menangkap kamera via `getUserMedia()` dan terhubung ke signaling server
2. **Viewer** (Laptop) terhubung ke signaling server dan bergabung ke room yang sama
3. Server memfasilitasi **pertukaran SDP & ICE candidates** (signaling)
4. Setelah handshake selesai, video mengalir **langsung P2P via UDP** (tanpa melalui server)

---

## ✨ Fitur

| Fitur | Keterangan |
|-------|------------|
| 🎥 **Camera Capture** | Pilih kamera depan/belakang, resolusi (480p/720p/1080p), FPS (15-60) |
| ⚡ **Low Latency** | WebRTC P2P, target ≤ 100ms di LAN |
| 🔒 **HTTPS/WSS** | Self-signed SSL untuk akses kamera dari perangkat mobile |
| 🔄 **Auto-Reconnect** | Koneksi otomatis terhubung kembali saat terputus |
| 📊 **Real-time Stats** | Resolution, FPS, Bitrate, RTT, Packet Loss, Jitter, Codec |
| 🖥 **Fullscreen & PiP** | Mode fullscreen dan Picture-in-Picture di viewer |
| 🔇 **Audio Toggle** | Audio dimatikan default, bisa diaktifkan via tombol |
| 🐛 **Debug Log** | Panel debug bawaan di viewer untuk troubleshooting |
| 🏠 **Multi-Room** | Support multiple room streaming bersamaan |
| 👥 **Multi-Viewer** | Hingga 5 viewer per room (configurable) |
| 🔐 **Token Auth** | Opsional token-based room access |
| 📡 **REST API** | Health check, room monitoring, kick client |
| 🐳 **Docker Ready** | Dockerfile + docker-compose.yml siap deploy |

---

## 📦 Persyaratan

### Tanpa Docker
- **Node.js** ≥ 18.x
- **OpenSSL** (untuk generate SSL certificate)

### Dengan Docker
- **Docker** ≥ 20.x
- **Docker Compose** ≥ 2.x

### Perangkat
- **Publisher**: HP/tablet dengan kamera + browser modern (Chrome/Firefox/Edge)
- **Viewer**: Laptop/PC/tablet dengan browser modern
- **Jaringan**: Semua perangkat harus di **WiFi/LAN yang sama**

---

## 🚀 Instalasi & Menjalankan

### Cara 1: Node.js Langsung

```bash
# 1. Clone / masuk ke direktori proyek
cd webrtc-stream

# 2. Install dependencies
cd signaling && npm install && cd ..

# 3. Copy konfigurasi
cp .env.example .env

# 4. Generate SSL certificate (WAJIB untuk akses kamera dari HP)
openssl req -x509 -newkey rsa:2048 \
  -keyout signaling/key.pem \
  -out signaling/cert.pem \
  -days 365 -nodes \
  -subj "/CN=webrtc-lan" \
  -addext "subjectAltName=IP:$(hostname -I | awk '{print $1}'),IP:127.0.0.1,DNS:localhost"

# 5. Jalankan server
cd signaling && node server.js
```

**Output yang diharapkan:**
```
  🔒 Mode:       HTTPS (SSL)
  📡 Signaling:  wss://0.0.0.0:3000/ws
  📹 Publisher:  https://0.0.0.0:3000/
  👁️  Viewer:     https://0.0.0.0:3000/view
  💊 Health:     https://0.0.0.0:3000/api/v1/health
  📊 Rooms:      https://0.0.0.0:3000/api/v1/rooms
  🔄 Redirect:   http://0.0.0.0:3080 → https
```

### Cara 2: Docker Compose

```bash
# 1. Copy konfigurasi
cp .env.example .env

# 2. (Opsional) Edit .env sesuai kebutuhan
nano .env

# 3. Build & jalankan
docker compose up -d --build

# 4. Cek status
docker compose logs -f
```

**Stop:**
```bash
docker compose down
```

---

## 📖 Penggunaan

### 1. Publisher (HP / Sumber Kamera)

1. Buka browser di HP: **`https://<IP-SERVER>:3000/`**
   - Ganti `<IP-SERVER>` dengan IP LAN server (contoh: `192.168.1.100`)
   - Untuk cek IP server: `hostname -I` atau `ip addr`

2. Browser akan menampilkan **warning SSL** (karena self-signed certificate):
   - Chrome: Tap **"Advanced"** → **"Proceed to ..."**
   - Firefox: Tap **"Advanced"** → **"Accept the Risk and Continue"**

3. **Konfigurasi** (opsional):
   - **Resolution**: 480p / 720p / 1080p
   - **Frame Rate**: 15 / 24 / 30 / 60 fps
   - **Camera**: Pilih kamera jika ada beberapa
   - **Room ID**: Default `cam1`, bisa diganti untuk multi-stream

4. Tap **"Start Camera"** → Izinkan akses kamera

5. **Indikator status:**
   - 🔴 Disconnected — belum terhubung
   - 🟡 Connecting — sedang menghubungkan
   - 🟢 Connected — terhubung dan streaming

6. **Tombol kontrol:**
   - **🔇 Audio Off/On** — Toggle audio (default mati)
   - **🔄 Flip Camera** — Ganti kamera depan/belakang
   - **⏹ Stop** — Hentikan streaming

### 2. Viewer (Laptop / Penampil)

1. Buka browser di laptop: **`https://<IP-SERVER>:3000/view`**

2. Accept warning SSL (sama seperti di HP)

3. Viewer akan **otomatis terhubung** ke room `cam1` dan menampilkan stream

4. **Untuk bergabung ke room lain**: Klik ⚙️ → isi Room ID → klik **Connect**

5. **Tombol kontrol:**
   - **📊** — Toggle panel statistik (Resolution, FPS, Bitrate, RTT, Jitter, Codec)
   - **⚙️** — Settings (ganti Room ID)
   - **🐛** — Toggle debug log (untuk troubleshooting)
   - **⛶** — Fullscreen
   - **🔊/🔇** — Mute/unmute audio
   - **📌 PiP** — Picture-in-Picture mode

6. **URL parameters:**
   - `?room=namaroom` — langsung join room tertentu
   - `?token=xxx` — autentikasi jika token diaktifkan
   - Contoh: `https://192.168.1.100:3000/view?room=cam2`

---

## ⚙️ Konfigurasi

Edit file `.env` untuk mengubah konfigurasi:

```env
# Port HTTPS utama
PORT=3000

# Port HTTP (redirect ke HTTPS)
HTTP_PORT=3080

# Token untuk akses room (kosongkan untuk disable)
ROOM_TOKEN=

# Token admin untuk REST API (kosongkan untuk disable)
ADMIN_TOKEN=

# Maksimum viewer per room
MAX_VIEWERS=5

# Level log: debug, info, warn, error
LOG_LEVEL=info
```

Setelah mengubah `.env`, restart server:
```bash
# Node.js
# Ctrl+C lalu jalankan ulang

# Docker
docker compose restart
```

---

## 📡 REST API

Base URL: `https://<IP-SERVER>:3000/api/v1`

| Method | Endpoint | Deskripsi | Contoh Response |
|--------|----------|-----------|-----------------|
| `GET` | `/health` | Health check | `{"status":"ok","uptime_sec":120,"version":"1.0.0"}` |
| `GET` | `/rooms` | Daftar room aktif | `[{"id":"cam1","publishers":1,"viewers":2}]` |
| `GET` | `/rooms/:id/stats` | Detail room | `{"roomId":"cam1","peers":[...],"total":3}` |
| `DELETE` | `/rooms/:id/peers/:clientId` | Kick client | `{"status":"kicked","clientId":"view_abc"}` |

**Contoh penggunaan:**
```bash
# Health check
curl -k https://localhost:3000/api/v1/health

# Lihat room aktif
curl -k https://localhost:3000/api/v1/rooms

# Kick viewer (jika ADMIN_TOKEN diset)
curl -k -X DELETE \
  -H "X-Admin-Token: admin_secret_token" \
  https://localhost:3000/api/v1/rooms/cam1/peers/view_abc123
```

> **Note:** Flag `-k` diperlukan karena menggunakan self-signed certificate

---

## ⌨️ Keyboard Shortcuts (Viewer)

| Key | Fungsi |
|-----|--------|
| `F` | Toggle Fullscreen |
| `S` | Toggle Stats Panel |
| `M` | Toggle Mute |
| `D` | Toggle Debug Log |

---

## 🔧 Troubleshooting

### Kamera tidak muncul di HP

**Penyebab:** Browser memblokir `getUserMedia()` karena bukan HTTPS.

**Solusi:**
- Pastikan mengakses via `https://` (bukan `http://`)
- Accept/bypass SSL certificate warning terlebih dahulu
- Pastikan SSL certificate sudah di-generate (cek file `signaling/cert.pem` dan `signaling/key.pem`)

### Viewer tidak bisa konek / reconnect loop

**Solusi:**
1. Buka viewer di **Incognito/Private Window** untuk bypass cache
2. Atau lakukan **Hard Refresh**: `Ctrl+Shift+R`
3. Klik tombol 🐛 di viewer untuk melihat debug log
4. Pastikan publisher sudah aktif streaming sebelum viewer join

### Video tidak muncul di viewer

**Kemungkinan penyebab:**
- Publisher belum tap "Start Camera"
- Publisher dan viewer di room berbeda (cek Room ID)
- Firewall memblokir port UDP (WebRTC membutuhkan port UDP untuk media)

**Solusi:**
```bash
# Buka port di firewall (Linux)
sudo ufw allow 3000/tcp
sudo ufw allow 3080/tcp
```

### Tidak bisa akses dari HP

**Solusi:**
- Pastikan HP dan server di jaringan WiFi/LAN yang sama
- Gunakan IP LAN server (bukan `localhost`)
- Cek IP server: `hostname -I` atau `ip addr show`

### Latency tinggi

**Tips optimasi:**
- Gunakan kabel Ethernet untuk server (bukan WiFi)
- Turunkan resolusi ke 720p atau 480p
- Turunkan FPS ke 24 atau 15
- Pastikan tidak ada interferensi WiFi
- Gunakan band 5GHz jika tersedia

---

## 📁 Struktur Proyek

```
webrtc-stream/
├── docker-compose.yml       # Docker orchestration
├── .env.example             # Template konfigurasi
├── .env                     # Konfigurasi aktif (tidak di-git)
├── .gitignore
├── .dockerignore
├── prd.md                   # Product Requirements Document
├── README.md                # Dokumentasi ini
│
├── signaling/
│   ├── Dockerfile           # Container image (Node.js Alpine)
│   ├── package.json         # Dependencies (ws, uuid)
│   ├── server.js            # Signaling server + REST API
│   ├── cert.pem             # SSL certificate (auto-generated)
│   └── key.pem              # SSL private key (auto-generated)
│
├── public/
│   ├── index.html           # Publisher page (HP camera capture)
│   └── view.html            # Viewer page (laptop display)
│
└── scripts/
    └── benchmark.sh         # Benchmark & monitoring script
```

---

## 🧪 Benchmark

```bash
# Jalankan benchmark
./scripts/benchmark.sh localhost:3000

# Atau dengan durasi custom (30 detik)
./scripts/benchmark.sh localhost:3000 30
```

Benchmark akan mengecek:
- ✅ Server health
- 📊 Active rooms
- 🐳 Docker container resources (CPU, RAM, Network)
- 🌐 Network latency (ping)

---

## 📄 Lisensi

Internal project — tidak untuk distribusi publik.

---

*Untuk detail teknis lengkap, lihat [prd.md](prd.md)*
