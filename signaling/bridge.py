import asyncio
import json
import logging
import os
import cv2
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
try:
    from aiortc.contrib.media import MediaPlayer
except ImportError:
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
        # 1. Buka Webcam
        try:
            options = {
                "video_size": "1280x720",
                "framerate": "30",
                "input_format": "mjpeg"
            }
            self.player = MediaPlayer("/dev/video1", format="v4l2", options=options)
        except Exception as e:
            logger.error(f"Gagal membuka webcam: {e}")
            return

        # 2. Connect ke Signaling Server
        is_https = SIGNALING_URL.startswith("https")
        ws_url = f"{SIGNALING_URL.replace('http', 'ws')}/ws"
        
        # Abaikan SSL verification untuk self-signed cert
        ssl_context = False if is_https else None
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        
        async with aiohttp.ClientSession(connector=connector) as session:
            try:
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
            except Exception as e:
                logger.error(f"Koneksi terputus atau gagal: {e}")

    async def handle_message(self, msg):
        mtype = msg.get("type")
        
        if mtype == "joined":
            logger.info(f"Berhasil join room: {ROOM_ID}")
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

        elif mtype == "candidate":
            if self.pc:
                await self.pc.addIceCandidate(None)

    async def create_pc(self, viewer_id):
        pc = RTCPeerConnection()
        self.pc = pc
        
        if self.player and self.player.video:
            pc.addTrack(self.player.video)

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
