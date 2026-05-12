# 📡 WebRTC LAN Streaming

Sistem streaming video & audio **real-time low-latency** berbasis WebRTC untuk jaringan lokal (LAN).  
Dirancang untuk berjalan di **STB Armbian (ARM64)** dengan Docker, dan ditampilkan di OBS Studio untuk live production.

> **Latency target**: ≤ 200ms end-to-end pada WiFi LAN stabil

---

## 📋 Daftar Isi

- [Arsitektur](#-arsitektur)
- [Fitur](#-fitur)
- [Persyaratan](#-persyaratan)
- [Instalasi & Menjalankan](#-instalasi--menjalankan)
- [Penggunaan](#-penggunaan)
  - [Publisher (HP / Sumber Kamera)](#1-publisher-hp--sumber-kamera)
  - [Viewer (Laptop / Penampil)](#2-viewer-laptop--penampil)
  - [OBS Studio Integration](#3-obs-studio-integration)
- [Endpoint & URL](#-endpoint--url)
- [Konfigurasi](#-konfigurasi)
- [REST API](#-rest-api)
- [Optimasi Latensi](#-optimasi-latensi)
- [Troubleshooting](#-troubleshooting)
- [Struktur Proyek](#-struktur-proyek)

---

## 🏗 Arsitektur

```
┌─────────────────┐      WebSocket (wss://STB:3000/ws)      ┌──────────────────┐
│  HP (Publisher)  │◄──────────────────────────────────────►│  STB / Server    │
│  Browser Camera  │                                        │  Signaling + Web │
│  getUserMedia()  │                                        │  (Node.js Docker)│
└────────┬────────┘                                        └────────┬─────────┘
         │                                                          │
         │◄──────────── WebRTC P2P (UDP) ──────────────────────────►│
         │                                                          │
         │                                                 ┌────────▼─────────┐
         │                                                 │  Laptop (Viewer) │
         │                                                 │  view.html       │
         │                                                 │  obs.html        │
         │                                                 │  OBS Studio      │
         │                                                 └──────────────────┘
         │
         └─── STUN/TURN (coturn container, port 3478) ────►│ ICE Connectivity │
```

**Alur singkat:**
1. **Publisher** (HP) menangkap kamera + mikrofon via `getUserMedia()` dan terhubung ke signaling server
2. **Viewer** (Laptop/OBS) terhubung ke signaling server dan bergabung ke room yang sama
3. Server memfasilitasi **pertukaran SDP & ICE candidates** (signaling only)
4. Setelah handshake selesai, video & audio mengalir **langsung P2P via UDP** (tanpa melalui server)
5. **Coturn** (STUN/TURN) membantu koneksi jika P2P langsung gagal

---

## ✨ Fitur

### Streaming
| Fitur | Keterangan |
|-------|------------|
| 🎥 **Camera Capture** | Pilih kamera depan/belakang, resolusi (480p/720p/1080p), FPS (15-60) |
| 🎙️ **Audio Streaming** | Mikrofon dengan optimasi latensi (echo cancel OFF, noise suppression OFF) |
| ⚡ **Low Latency** | H.264 Baseline codec, jitter buffer minimal, maintain-framerate degradation |
| 📱 **Mobile Friendly** | UI responsif untuk portrait & landscape di HP |
| 🔄 **Auto-Reconnect** | Koneksi otomatis pulih saat terputus (exponential backoff) |

### Viewer
| Fitur | Keterangan |
|-------|------------|
| 🖥 **Full UI Viewer** | `view.html` dengan statistik, debug log, PiP, fullscreen |
| 📊 **Real-time Stats** | Resolution, FPS, Bitrate, RTT, Packet Loss, Jitter, Codec |
| 🔇 **Click-to-Unmute** | Overlay visual untuk mengaktifkan audio (comply Chrome Autoplay Policy) |
| 📌 **Picture-in-Picture** | Mode PiP untuk multitasking |

### OBS Integration
| Fitur | Keterangan |
|-------|------------|
| 🎬 **Clean OBS Page** | `obs.html` — halaman bersih hanya video, tanpa UI |
| 🖼 **Window Capture** | Gunakan browser full-screen sebagai source OBS |
| 🔊 **Audio in OBS** | Klik sekali untuk unmute, lalu overlay menghilang |

### Server & Keamanan
| Fitur | Keterangan |
|-------|------------|
| 🔒 **HTTPS/WSS** | Self-signed SSL untuk akses kamera dari perangkat mobile |
| 🏠 **Multi-Room** | Support multiple room streaming bersamaan |
| 👥 **Multi-Viewer** | Hingga 5 viewer per room (configurable) |
| 🔐 **Token Auth** | Opsional token-based room access |
| 📡 **REST API** | Health check, room monitoring, kick client |
| 🐳 **Docker Ready** | Dockerfile + docker-compose.yml + coturn STUN/TURN |
| 🚫 **No-Cache Headers** | File statis selalu fresh, tidak di-cache browser |

---

## 📦 Persyaratan

### Dengan Docker (Rekomendasi)
- **Docker** ≥ 20.x
- **Docker Compose** ≥ 2.x

### Tanpa Docker
- **Node.js** ≥ 18.x
- **OpenSSL** (untuk generate SSL certificate)

### Perangkat
| Perangkat | Kegunaan | Requirement |
|-----------|----------|-------------|
| **STB Armbian** | Server (Docker) | ARM64, RAM ≥ 512MB |
| **HP/Tablet** | Publisher (kamera) | Chrome/Edge + WiFi |
| **Laptop/PC** | Viewer / OBS | Chrome/Edge + WiFi |

> ⚠️ Semua perangkat harus berada di **WiFi/LAN yang sama**

---

## 🚀 Instalasi & Menjalankan

### Cara 1: Docker Compose (Rekomendasi untuk STB)

```bash
# 1. Clone repository
git clone https://github.com/amnahwaida/webrtc-stream.git
cd webrtc-stream

# 2. Copy konfigurasi
cp .env.example .env

# 3. (Opsional) Edit .env sesuai kebutuhan
nano .env

# 4. Build & jalankan
docker compose up -d --build

# 5. Cek status
docker compose logs -f signaling
```

**Update ke versi terbaru:**
```bash
git pull
docker compose down
docker compose build --no-cache signaling
docker compose up -d
```

**Stop:**
```bash
docker compose down
```

### Cara 2: Node.js Langsung

```bash
# 1. Install dependencies
cd signaling && npm install && cd ..

# 2. Copy konfigurasi
cp .env.example .env

# 3. Generate SSL certificate (WAJIB untuk akses kamera dari HP)
openssl req -x509 -newkey rsa:2048 \
  -keyout signaling/key.pem \
  -out signaling/cert.pem \
  -days 365 -nodes \
  -subj "/CN=webrtc-lan" \
  -addext "subjectAltName=IP:$(hostname -I | awk '{print $1}'),IP:127.0.0.1,DNS:localhost"

# 4. Jalankan server
cd signaling && node server.js
```

---

## 📖 Penggunaan

### 1. Publisher (HP / Sumber Kamera)

1. Buka browser di HP: **`https://<IP-STB>:3000/`**
   - Contoh: `https://192.168.1.254:3000/`

2. Terima **warning SSL** (self-signed certificate):
   - Chrome: Tap **"Advanced"** → **"Proceed to ..."**
   - Edge: Tap **"Continue to ..."**

3. **Konfigurasi** (klik ⚙️):
   - **Resolution**: 480p / 720p / 1080p
   - **Frame Rate**: 15 / 24 / 30 / 60 fps
   - **Orientation**: Landscape / Portrait
   - **Camera**: Pilih kamera depan/belakang
   - **Room ID**: Default `cam1`

4. Tap **"▶ Start"** → Izinkan akses **kamera DAN mikrofon**

5. Aktifkan audio (opsional): Tap **"🔇 Audio Off"** → berubah jadi **"🔊 Audio On"**

6. **Indikator status** di atas layar:
   - 🔴 `Disconnected` — belum terhubung
   - 🟡 `Connecting...` — sedang menghubungkan
   - 🟢 `Connected` — terhubung dan streaming

### 2. Viewer (Laptop / Penampil)

1. Buka browser: **`https://<IP-STB>:3000/view.html?room=cam1`**

2. Terima warning SSL

3. Video muncul otomatis (audio dimulai muted karena Chrome Autoplay Policy)

4. **Klik di mana saja pada video** atau klik overlay **"🔇 Klik untuk aktifkan suara"** → audio aktif

5. **Tombol kontrol di bottom bar:**
   - **🔇/🔊** — Toggle mute/unmute audio
   - **📌 PiP** — Picture-in-Picture mode

6. **Tombol di top bar:**
   - **📊** — Toggle panel statistik
   - **📡** — Dropdown pilih source/room
   - **⚙️** — Settings (ganti Room ID manual)
   - **🐛** — Toggle debug log
   - **⛶** — Fullscreen

### 3. OBS Studio Integration

Ada **dua cara** menggunakan stream di OBS:

#### Cara A: Window Capture (Rekomendasi)

1. Buka **`https://<IP-STB>:3000/obs.html?room=cam1`** di browser (Chrome/Edge)
2. Terima warning SSL
3. **Klik pada video** untuk unmute audio (overlay akan hilang)
4. Tekan **F11** untuk fullscreen browser
5. Di OBS:
   - Tambahkan source → **Window Capture**
   - Pilih jendela browser yang menampilkan stream
   - Crop jika perlu

#### Cara B: Viewer Clean Mode

1. Buka **`https://<IP-STB>:3000/view.html?room=cam1&clean=true`**
2. Parameter `clean=true` menyembunyikan semua UI (topbar, bottombar, stats)
3. Di OBS gunakan **Window Capture**

> **Catatan:** `obs.html` lebih ringan dan direkomendasikan karena tidak memuat UI yang tidak perlu.

---

## 🌐 Endpoint & URL

### Halaman Web

| URL | Fungsi | Keterangan |
|-----|--------|------------|
| `https://<IP>:3000/` | **Publisher** | Halaman capture kamera + mikrofon |
| `https://<IP>:3000/view.html` | **Viewer** (Full UI) | Viewer dengan statistik, debug, dan kontrol |
| `https://<IP>:3000/obs.html` | **Viewer** (OBS Clean) | Halaman bersih untuk OBS, hanya video |

### URL Parameters

| Parameter | Tersedia di | Fungsi | Contoh |
|-----------|-------------|--------|--------|
| `room` | view.html, obs.html | Pilih room yang akan ditonton | `?room=cam1` |
| `clean` | view.html | Sembunyikan semua UI (untuk OBS) | `?clean=true` |
| `token` | view.html, obs.html | Token autentikasi (jika diaktifkan) | `?token=abc123` |

### WebSocket

| URL | Fungsi |
|-----|--------|
| `wss://<IP>:3000/ws` | WebSocket signaling endpoint |
| `wss://<IP>:3000/ws?token=xxx` | WebSocket dengan autentikasi |

### REST API

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/api/v1/health` | Health check server |
| `GET` | `/api/v1/rooms` | Daftar room aktif beserta jumlah peer |
| `GET` | `/api/v1/rooms/:id/stats` | Detail peer dalam satu room |
| `DELETE` | `/api/v1/rooms/:id/peers/:clientId` | Kick client dari room |

### STUN/TURN (Coturn)

| Protocol | Endpoint | Credential |
|----------|----------|------------|
| STUN | `stun:<IP>:3478` | — |
| TURN | `turn:<IP>:3478` | user: `webrtc`, pass: `webrtc123` |

---

## ⚙️ Konfigurasi

Edit file `.env`:

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

# Recording output directory (inside container)
RECORD_DIR=/data/records
```

Setelah mengubah `.env`:
```bash
docker compose down && docker compose up -d
```

---

## 📡 REST API Detail

Base URL: `https://<IP-STB>:3000/api/v1`

### GET /health
```bash
curl -k https://192.168.1.254:3000/api/v1/health
```
Response:
```json
{"status":"ok","uptime_sec":3600,"version":"1.0.0"}
```

### GET /rooms
```bash
curl -k https://192.168.1.254:3000/api/v1/rooms
```
Response:
```json
[{"id":"cam1","publishers":1,"viewers":2}]
```

### GET /rooms/:id/stats
```bash
curl -k https://192.168.1.254:3000/api/v1/rooms/cam1/stats
```
Response:
```json
{"roomId":"cam1","peers":[{"clientId":"pub_abc","role":"publisher"},{"clientId":"v2_xyz","role":"viewer"}],"total":2}
```

### DELETE /rooms/:id/peers/:clientId
```bash
curl -k -X DELETE \
  -H "X-Admin-Token: your_admin_token" \
  https://192.168.1.254:3000/api/v1/rooms/cam1/peers/v2_xyz
```
Response:
```json
{"status":"kicked","clientId":"v2_xyz"}
```

> **Note:** Flag `-k` diperlukan karena menggunakan self-signed certificate.

---

## ⚡ Optimasi Latensi

Berikut optimasi yang telah diterapkan untuk meminimalkan latensi:

### Publisher Side
| Optimasi | Dampak |
|----------|--------|
| `contentHint = 'motion'` | Browser tahu ini real-time video, bukan slideshow |
| H.264 Baseline Profile | Tanpa B-frames, encoding lebih cepat |
| `degradationPreference = 'maintain-framerate'` | FPS stabil, resolusi yang turun jika bandwidth terbatas |
| `maxBitrate = 2.5 Mbps` | Mencegah frame besar yang menyumbat jaringan |
| `networkPriority = 'high'` | Paket video/audio diprioritaskan |
| Skip relay ICE candidates | Koneksi langsung tanpa perantara TURN di LAN |
| Audio: echo/noise/AGC OFF | Menghilangkan ~60-100ms delay dari audio processing |

### Viewer Side
| Optimasi | Dampak |
|----------|--------|
| `playoutDelayHint = 0` | Putar frame secepat mungkin |
| `jitterBufferTarget = 0` | Minimal buffering |
| `bundlePolicy = 'max-bundle'` | Semua media lewat 1 koneksi |
| `rtcpMuxPolicy = 'require'` | Gabungkan kontrol dan data |

### Tips Tambahan
- Gunakan **kabel Ethernet** pada STB (bukan WiFi)
- Gunakan **WiFi 5GHz** pada HP dan laptop
- Turunkan resolusi ke **720p** atau **480p** jika latensi masih tinggi
- Turunkan FPS ke **24** atau **15** untuk mengurangi beban encoding

---

## 🔧 Troubleshooting

### Kamera tidak muncul di HP
- Pastikan mengakses via `https://` (bukan `http://`)
- Accept/bypass SSL certificate warning terlebih dahulu
- Pastikan izin kamera **DAN mikrofon** di-allow (keduanya diminta bersamaan)

### Audio tidak terdengar di Viewer
1. **Klik pada video** atau klik tombol **"🔇 Klik Unmute"** di bawah
2. Chrome Autoplay Policy mengharuskan interaksi user sebelum audio bisa diputar
3. Di Edge, bisa juga unmute lewat menu **Picture-in-Picture**
4. Pastikan publisher sudah menekan **"Audio On"** (tombol berubah ungu)

### Video tidak muncul di Viewer
- Publisher belum tap "Start"
- Publisher dan viewer di room berbeda (cek Room ID)
- SSL belum di-trust: buka `https://<IP>:3000/` langsung dan klik "Proceed"

### Overlay/perubahan tidak muncul setelah update
1. **Hard Refresh** browser: `Ctrl+Shift+R` atau `Ctrl+F5`
2. Atau buka di **Incognito/Private Window**
3. Cek versi di pojok kanan bawah video (contoh: `v7`)
4. Pastikan telah menjalankan rebuild Docker:
   ```bash
   git pull && docker compose down && docker compose build --no-cache signaling && docker compose up -d
   ```

### Latency tinggi
- Lihat bagian [Optimasi Latensi](#-optimasi-latensi)
- Cek statistik di viewer (tombol 📊) untuk RTT dan Jitter
- Buka debug log (tombol 🐛) untuk melihat ICE connection state

### Tidak bisa akses dari HP
- Pastikan HP dan STB di **jaringan WiFi yang sama**
- Gunakan IP LAN STB (contoh: `192.168.1.254`)
- Cek IP STB: `hostname -I`

---

## ⌨️ Keyboard Shortcuts (Viewer)

| Key | Fungsi |
|-----|--------|
| `F` | Toggle Fullscreen |
| `S` | Toggle Stats Panel |
| `M` | Toggle Mute |
| `D` | Toggle Debug Log |

---

## 📁 Struktur Proyek

```
webrtc-stream/
├── docker-compose.yml        # Docker orchestration (signaling + coturn)
├── .env.example              # Template konfigurasi
├── .env                      # Konfigurasi aktif (tidak di-git)
├── .gitignore
├── .dockerignore
├── prd.md                    # Product Requirements Document
├── README.md                 # Dokumentasi ini
│
├── signaling/
│   ├── Dockerfile            # Container image (Node.js Alpine)
│   ├── package.json          # Dependencies (ws, uuid)
│   ├── server.js             # Signaling server + static files + REST API
│   ├── cert.pem              # SSL certificate (auto-generated)
│   └── key.pem               # SSL private key (auto-generated)
│
├── public/
│   ├── index.html            # Publisher page (HP camera + mic capture)
│   ├── view.html             # Viewer page (full UI dengan stats & kontrol)
│   └── obs.html              # OBS page (clean, hanya video untuk Window Capture)
│
└── scripts/
    └── benchmark.sh          # Benchmark & monitoring script
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
