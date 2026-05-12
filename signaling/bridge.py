import asyncio
import json
import logging
import os
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCRtpSender
try:
    from aiortc.contrib.media import MediaPlayer
except ImportError:
    from aiortc.sdk.media import MediaPlayer
import aiohttp

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bridge")

SIGNALING_URL = os.getenv("SIGNALING_URL", "http://localhost:3000")
ROOM_ID = os.getenv("ROOM_ID", "stb-cam")
CLIENT_ID = "stb_internal_bridge"

class STBCameraBridge:
    def __init__(self):
        self.pc = None
        self.ws = None
        self.player = None

    async def start(self):
        # 1. Buka Webcam dengan opsi Low Latency
        # Menambahkan fflags nobuffer dan flags low_delay untuk mematikan buffer internal ffmpeg
        try:
            options = {
                "video_size": "1280x720", # Turunkan ke 640x480 jika masih delay
                "framerate": "30",
                "input_format": "mjpeg",
                "fflags": "nobuffer",
                "flags": "low_delay",
                "probesize": "32",
                "analyzeduration": "0"
            }
            self.player = MediaPlayer("/dev/video1", format="v4l2", options=options)
        except Exception as e:
            logger.error(f"Gagal membuka webcam: {e}")
            return

        is_https = SIGNALING_URL.startswith("https")
        ws_url = f"{SIGNALING_URL.replace('http', 'ws')}/ws"
        ssl_context = False if is_https else None
        
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=connector) as session:
            try:
                async with session.ws_connect(ws_url) as ws:
                    self.ws = ws
                    logger.info(f"Terhubung ke Signaling: {ws_url}")

                    await ws.send_json({
                        "type": "join",
                        "roomId": ROOM_ID,
                        "clientId": CLIENT_ID,
                        "role": "publisher"
                    })

                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            data = json.loads(msg.data)
                            await self.handle_message(data)
            except Exception as e:
                logger.error(f"Koneksi terputus: {e}")

    async def handle_message(self, msg):
        mtype = msg.get("type")
        if mtype == "joined":
            for peer in msg.get("peers", []):
                if peer["role"] == "viewer":
                    await self.create_pc(peer["clientId"])
        elif mtype == "peer_joined":
            if msg["role"] == "viewer":
                await self.create_pc(msg["clientId"])
        elif mtype == "answer":
            if self.pc:
                await self.pc.setRemoteDescription(RTCSessionDescription(sdp=msg["sdp"], type="answer"))
        elif mtype == "candidate":
            if self.pc:
                await self.pc.addIceCandidate(None)

    async def create_pc(self, viewer_id):
        # Gunakan ICE server lokal agar koneksi P2P lebih cepat
        # Sesuaikan IP dengan IP STB Anda jika diperlukan
        pc = RTCPeerConnection()
        self.pc = pc
        
        if self.player and self.player.video:
            # Tambahkan track dengan hint content="video"
            pc.addTrack(self.player.video)

        # ── OPTIMASI: Paksa H.264 ──
        # Kita mematikan VP8 dan memprioritaskan H.264 yang lebih ringan
        transceivers = pc.getTransceivers()
        for t in transceivers:
            if t.kind == "video":
                capabilities = RTCRtpSender.getCapabilities("video")
                # Ambil semua codec H264 yang tersedia
                h264_codecs = [c for c in capabilities.codecs if c.mimeType == "video/H264"]
                if h264_codecs:
                    t.setCodecPreferences(h264_codecs)
                    logger.info("Codec diset ke H.264 untuk low latency")

        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        await self.ws.send_json({
            "type": "offer",
            "roomId": ROOM_ID,
            "sdp": pc.localDescription.sdp,
            "senderId": CLIENT_ID,
            "targetId": viewer_id
        })

if __name__ == "__main__":
    bridge = STBCameraBridge()
    asyncio.run(bridge.start())
