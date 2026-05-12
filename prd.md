# 📄 Product Requirements Document (PRD)
## Sistem Streaming Video Low-Latency Berbasis WebRTC (LAN)

| Metadata | Detail |
|----------|--------|
| **Versi** | `1.0 (Final)` |
| **Tanggal** | `12 Mei 2026` |
| **Status** | `✅ Approved for Development` |
| **Target Platform** | `STB Armbian (ARM64) + Docker + Modern Browser` |
| **Lingkup Jaringan** | `Local Area Network (LAN) Only` |
| **Arsitektur Utama** | `WebRTC P2P / Optional SFU + WebSocket Signaling` |

---

## 1. 🎯 Latar Belakang & Tujuan
### 🔍 Masalah Saat Ini
- Streaming menggunakan **DroidCam via WiFi** dalam 1 jaringan lokal.
- Latency terukur `150–400 ms`, protokol tertutup, tidak ada API publik, dan sulit diintegrasikan dengan sistem kontrol atau dashboard kustom.
- Buffering otomatis pada DroidCam mengurangi artifact saat jaringan fluktuatif, tetapi menambah delay yang tidak dapat dikontrol secara programatik.

### 🚀 Solusi & Visi
Membangun sistem streaming berbasis **WebRTC** yang berjalan penuh di jaringan lokal dengan:
- Latency end-to-end **≤ 100 ms**
- Protokol terbuka & browser-native (tanpa install client tambahan di laptop)
- Arsitektur terpusat di STB (signaling + optional SFU untuk multi-viewer)
- Siap integrasi dengan kontrol eksternal, telemetry, atau sistem otomatisasi

---

## 2. 📊 Metrik Keberhasilan (Success Metrics)
| Metrik | Target | Metode Pengukuran |
|--------|--------|-------------------|
| **Latency Video** | `≤ 100 ms` (median) | Frame timestamp overlay + capture analysis |
| **CPU HP (720p30)** | `≤ 25%` | Android Developer Options / `adb shell top` |
| **CPU STB (Signaling)** | `≤ 15%` | `docker stats` / `htop` |
| **CPU STB (SFU Multi)** | `≤ 40%` (≤5 viewer) | `docker stats` |
| **RAM STB** | `≤ 500 MB` | `docker stats` |
| **Reconnect Time** | `≤ 3 detik` | Simulasi putus koneksi & auto-rejoin |
| **Toleransi Packet Loss** | `≤ 5%` tanpa drop frame | `tc qdisc` drop simulation + `webrtc-internals` |
| **Waktu Deploy** | `≤ 5 menit` | `docker compose up -d` dari fresh OS |

---

## 3. 👥 Pengguna & Use Case
| Pengguna | Use Case | Prioritas |
|----------|----------|-----------|
| **Operator Teknik** | Monitoring real-time, kontrol PTZ/servo, feedback instan | `P0` |
| **Developer/Integrator** | Inject data channel, telemetry, trigger automation via REST/WS | `P1` |
| **Multi-Viewer** | 2–5 laptop/tablet dalam 1 LAN melihat stream yang sama | `P1` |
| **Archiver/Audit** | Rekaman stream lokal untuk log & evaluasi | `P2` |

---

## 4. ⚙️ Requirement Fungsional
- [ ] Capture video dari HP via `getUserMedia()` (browser) atau native app
- [ ] WebRTC PeerConnection dengan `iceTransportPolicy: 'host'` (LAN only)
- [ ] Codec default: `VP8` / `H.264` (hardware accelerated bila tersedia)
- [ ] Audio opsional (default `false` untuk hemat CPU & latency)
- [ ] Signaling via WebSocket untuk pertukaran SDP & ICE Candidates
- [ ] Viewer berbasis browser (`http://<STB-IP>/view`) tanpa instalasi tambahan
- [ ] WebRTC Data Channel (`SCTP`) untuk perintah kontrol real-time
- [ ] REST API monitoring & kontrol rekaman
- [ ] Auto-reconnect & graceful cleanup saat disconnect

---

## 5. 🛡️ Requirement Non-Fungsional
| Kategori | Spesifikasi |
|----------|-------------|
| **Latency** | End-to-end `≤ 100 ms` pada LAN stabil (RSSI ≥ -65 dBm) |
| **Reliability** | Auto-reconnect `≤ 3s` saat signaling restart atau WiFi brief drop |
| **Scalability** | P2P: 1 viewer. SFU: `≥ 5 concurrent` tanpa transcoding |
| **Resource** | Docker image `< 250 MB`, ARM64 native, restart policy `unless-stopped` |
| **Security** | DTLS-SRTP mandatory, LAN-only binding, token-based room access |
| **Maintainability** | Single `docker-compose.yml`, config via `.env`, structured JSON logs |

---

## 6. 🏗️ Arsitektur Sistem & Topologi
```
┌─────────────┐      WebSocket (TCP 3000)      ┌─────────────────┐
│  HP (Source)│◄───────────────────────────────►│  STB (Armbian)  │
│ Browser/App │                                │  Signaling Srv  │
│ getUserMedia│◄──── WebRTC P2P / SFU (UDP) ──►│  (Node.js/Go)   │
└─────────────┘                                └────────┬────────┘
                                                        │
                                               ┌────────▼────────┐
                                               │  Laptop (Viewer)│
                                               │  Browser Native │
                                               └─────────────────┘
```

### Mode Deployment
| Mode | Komponen Aktif | Latency | Cocok Untuk |
|------|----------------|---------|-------------|
| `P2P Direct` | Signaling only | `30–80 ms` | 1 source, 1 viewer |
| `SFU (mediasoup/pion)` | Signaling + Media Router | `50–100 ms` | Multi-viewer, recording |
| `Hybrid (RTSP→WebRTC)` | FFmpeg bridge + WebRTC gateway | `80–120 ms` | Source non-WebRTC (DroidCam/IP Cam) |

---

## 7. 📡 Spesifikasi Endpoint & Komunikasi
> ⚠️ **Catatan**: WebRTC **tidak menggunakan HTTP/WS untuk media**. Setelah handshake, video/audio mengalir langsung via UDP dinamis yang dinegosiasikan ICE. Endpoint berikut hanya untuk **signaling, monitoring, dan kontrol**.

### 7.1 WebSocket Signaling
- **URL**: `ws://<STB_IP>:3000/ws`
- **Transport**: WebSocket (binary/text JSON)
- **Auth**: Query `?token=<ROOM_TOKEN>` atau Header `Authorization: Bearer <token>`
- **Keepalive**: Ping/Pong setiap `30s`, timeout `60s`

#### 📥 Message Schema
| Direction | `type` | Payload | Tujuan |
|-----------|--------|---------|--------|
| Client → Server | `join` | `{ "roomId": "cam1", "clientId": "pub_01", "role": "publisher" \| "viewer" }` | Registrasi sesi |
| Server → Client | `joined` | `{ "roomId": "cam1", "peers": [], "serverTime": 1715520000 }` | Konfirmasi + peer list |
| Publisher → Server | `offer` | `{ "roomId": "cam1", "sdp": "v=0\r\no=-...", "senderId": "pub_01" }` | Mulai negosiasi |
| Server → Viewer | `offer` | *(Forwarded)* | Distribusi offer |
| Viewer → Server | `answer` | `{ "roomId": "cam1", "sdp": "v=0\r\n...", "senderId": "view_02", "targetId": "pub_01" }` | Terima stream |
| Server → Publisher | `answer` | *(Forwarded)* | Selesai handshake |
| Both → Server | `candidate` | `{ "roomId": "cam1", "candidate": {...}, "senderId": "...", "receiverId": "..." }` | ICE exchange |
| Client → Server | `leave` | `{ "roomId": "cam1", "clientId": "..." }` | Disconnect graceful |
| Server → Client | `error` | `{ "code": "INVALID_SDP" \| "ROOM_FULL", "message": "..." }` | Error handling |

### 7.2 HTTP/REST API (Monitoring & Control)
- **Base URL**: `http://<STB_IP>:3000/api/v1`
- **Auth**: Header `X-Admin-Token` (opsional, default LAN-only)

| Method | Path | Deskripsi | Response (`200`) |
|--------|------|-----------|------------------|
| `GET` | `/health` | Health check | `{"status":"ok","uptime_sec":1240,"version":"1.0.0"}` |
| `GET` | `/rooms` | Daftar room aktif | `[{"id":"cam1","publishers":1,"viewers":2}]` |
| `GET` | `/rooms/{id}/stats` | Statistik real-time | `{"bitrate_kbps":2100,"rtt_ms":42,"codec":"H264"}` |
| `POST` | `/rooms/{id}/record` | Toggle rekaman `.webm` | `{"status":"recording","path":"/data/records/cam1.webm"}` |
| `DELETE` | `/rooms/{id}/peers/{clientId}` | Kick client | `{"status":"kicked","clientId":"view_02"}` |

### 7.3 WebRTC Data Channel (Opsional P1)
```json
// Publisher → Viewer
{ "type": "command", "cmd": "set_fps", "val": 60 }
{ "type": "command", "cmd": "toggle_audio", "val": true }

// Viewer → Publisher
{ "type": "telemetry", "viewer_rtt": 45, "buffer_health": 98 }
```
> 💡 Menggunakan `SCTP` (in-band, configurable reliable/unreliable). Tidak membebani signaling server.

### 7.4 Port & Firewall Mapping
| Service | Port | Protokol | Akses |
|---------|------|----------|-------|
| Signaling WS + REST API | `3000` | TCP | LAN only |
| WebRTC Media (ICE) | `50000-60000` | UDP | LAN only |
| **Firewall** | `ufw allow from 192.168.0.0/16 to any port 3000,50000:60000/udp` | - | Wajib di STB |

---

## 8. 💻 Tech Stack & Struktur Deployment
| Layer | Teknologi | Alasan |
|-------|-----------|--------|
| **Signaling** | Node.js + `ws` atau Python + `FastAPI` | Ringan, ARM64 ready, ekosistem luas |
| **Frontend** | Vanilla JS / Vue3 + `simple-peer` | Zero-dependency, works di semua browser modern |
| **SFU (Opsional)** | `mediasoup` (Node.js) atau `pion/webrtc` (Go) | Performa tinggi, ARM64 support, dokumentasi matang |
| **Container** | Docker + `docker-compose` | Reproducible, rollback mudah, isolasi resource |
| **OS** | Armbian Linux (ARM64) | Low-power, headless, CLI-friendly |

### 📁 Struktur Proyek
```bash
webrtc-stream/
├── docker-compose.yml
├── .env                  # PORT, ROOM_TOKEN, LOG_LEVEL, MAX_VIEWERS
├── signaling/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js         # WebSocket + WebRTC handshake logic
├── public/
│   ├── index.html        # Publisher (HP)
│   └── view.html         # Viewer (Laptop)
└── scripts/
    └── benchmark.sh      # Latency, packet loss, resource monitoring
```

---

## 9. 🔒 Keamanan & Privasi
- **Network Scope**: Binding ke `0.0.0.0` hanya untuk LAN. Tidak expose ke internet/NAT.
- **Enkripsi**: DTLS-SRTP aktif default (WebRTC mandatory). Media tidak pernah dalam plaintext.
- **Autentikasi**: Token-based room access (`?token=xxx`). REST API pakai `X-Admin-Token`.
- **Firewall**: Hanya buka port `3000/TCP` & `50000-60000/UDP`. Block all incoming lainnya.
- **Log & Data**: Tidak ada log media. Log signaling only (JSON, auto-rotate 7 hari). Rekaman disimpan lokal `/data/records`.

---

## 10. 🧪 Testing & Validasi
| Jenis Tes | Metode | Kriteria Lulus |
|-----------|--------|----------------|
| **Latency** | Timestamp overlay + frame capture | `≤ 100 ms` median, `≤ 150 ms` p95 |
| **Packet Loss** | `tc qdisc add dev eth0 root netem loss 5%` | No video drop, bitrate adaptasi otomatis |
| **Reconnect** | `systemctl restart docker` saat streaming | Viewer auto-rejoin `≤ 3s` |
| **Multi-Client** | 5 browser tab concurrent | CPU STB `≤ 40%`, latency `≤ 110 ms` |
| **Browser Compat** | Chrome, Firefox, Edge, Safari (iOS) | Semua play tanpa error console |

> 🛠️ Tool: `chrome://webrtc-internals`, `iperf3`, `adb shell dumpsys media.camera`, `docker stats`

---

## 11. ⚠️ Risiko & Mitigasi
| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| WiFi interferensi tinggi | Latency spike, freeze | Rekomendasi Ethernet untuk STB, fallback `iceTransportPolicy: 'all'` |
| Browser autoplay block | Video tidak mulai | UI "Click to Start", `playsinline`, `muted` default |
| ICE negotiation gagal | Connection timeout | Force `host` candidate, verify subnet match, disable IPv6 bila perlu |
| CPU encode overload (HP tua) | Drop frame, overheating | Turunkan res/FPS via constraints, aktifkan HW accel (`H.264` profile) |
| Memory leak signaling | STB crash setelah jam | `restart: unless-stopped`, heap dump monitoring, log rotation |

---

## 12. 📅 Roadmap & Fase Pengembangan
| Fase | Cakupan | Estimasi | Deliverable |
|------|---------|----------|-------------|
| `P0: PoC P2P` | Signaling + publisher/viewer + basic UI | 3–5 hari | `docker-compose.yml` siap run, latency `< 100 ms` |
| `P1: Productionize` | Auto-reconnect, error handling, logging, `.env` config | 2–3 hari | Stable 24/7, monitoring endpoint, graceful disconnect |
| `P2: SFU Multi-Viewer` | `mediasoup`/`pion` integration, room management | 5–7 hari | 3–5 viewer concurrent, CPU `< 40%`, recording toggle |
| `P3: Extensions` | Data channel, REST dashboard, telemetry bridge | Ongoing | Integrasi kontrol & arsip lokal |

---

## 13. ✅ Approval & Next Steps
| Role | Status | Catatan |
|------|--------|---------|
| Product Owner | `[ ] Pending` | Review scope & prioritas |
| Lead Engineer | `[ ] Pending` | Validasi tech stack & kompatibilitas ARM64 |
| QA / Ops | `[ ] Pending` | Review test plan & deployment script |

### 🚀 Immediate Actions
1. Inisialisasi repository & buat `docker-compose.yml` + `.env.example`
2. Implement `signaling/server.js` + HTML publisher/viewer
3. Run benchmark di jaringan target & adjust ICE/codec constraints
4. Dokumentasi hasil & iterate ke fase P1/P2

---
📄 *Dokumen ini bersifat hidup. Update sesuai hasil testing, perubahan requirement, atau penemuan teknis selama development.*  
🔧 *Jika membutuhkan boilerplate kode lengkap (`server.js`, `index.html`, `view.html`, `docker-compose.yml`), reply dengan `[A] Boilerplate Full Stack` atau `[B] Fokus Signaling Only`. Saya akan kirimkan paket siap `docker compose up`.**