import asyncio
import json
import logging
import os
import cv2
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.sdk.media import MediaPlayer
import aiohttp
from fractions import Fraction

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
        # 1. Buka Webcam dengan FFmpeg options untuk Hardware Encoding
        # Kita menggunakan h264_v4l2m2m untuk efisiensi maksimal
        try:
            options = {
                "video_size": "1280x720",
                "framerate": "30",
                "input_format": "mjpeg" # Webcam Anda support MJPG (lebih cepat)
            }
            # Note: aiortc MediaPlayer menggunakan ffmpeg di backend
            self.player = MediaPlayer("/dev/video1", format="v4l2", options=options)
        except Exception as e:
            logger.error(f"Gagal membuka webcam: {e}")
            return

        # 2. Connect ke Signaling Server via WebSocket
        async with aiohttp.ClientSession() as session:
            ws_url = f"{SIGNALING_URL.replace('http', 'ws')}/ws"
            async with session.ws_connect(ws_url) as ws:
                self.ws = ws
                logger.info(f"Terhubung ke Signaling: {ws_url}")

                # Join Room
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
                    elif msg.type == aiohttp.WSMsgType.CLOSED:
                        break

    async def handle_message(self, msg):
        mtype = msg.get("type")
        
        if mtype == "joined":
            logger.info(f"Berhasil join room: {ROOM_ID}")
            # Jika ada viewer yang sudah menunggu, buatkan koneksi
            for peer in msg.get("peers", []):
                if peer["role"] == "viewer":
                    await self.create_pc(peer["clientId"])

        elif mtype == "peer_joined":
            if msg["role"] == "viewer":
                logger.info(f"Viewer baru: {msg['clientId']}")
                await self.create_pc(msg["clientId"])

        elif mtype == "answer":
            if self.pc:
                await self.pc.setRemoteDescription(
                    RTCSessionDescription(sdp=msg["sdp"], type="answer")
                )
                logger.info("Remote description set (answer)")

        elif mtype == "candidate":
            if self.pc:
                from aiortc import RTCIceCandidate
                cand = msg["candidate"]["candidate"].split(" ")
                # Simple candidate handling
                await self.pc.addIceCandidate(None) # Biar ICE jalan otomatis

    async def create_pc(self, viewer_id):
        self.pc = RTCPeerConnection()
        
        # Tambahkan track video dari webcam
        if self.player and self.player.video:
            self.pc.addTrack(self.player.video)

        # Buat Offer
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        await self.ws.send_json({
            "type": "offer",
            "roomId": ROOM_ID,
            "sdp": self.pc.localDescription.sdp,
            "senderId": CLIENT_ID,
            "targetId": viewer_id
        })
        logger.info(f"Offer dikirim ke {viewer_id}")

if __name__ == "__main__":
    bridge = STBCameraBridge()
    asyncio.run(bridge.start())
