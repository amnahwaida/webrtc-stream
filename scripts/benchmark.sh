#!/bin/bash
# ══════════════════════════════════════════════════
# WebRTC Streaming Benchmark Script
# ══════════════════════════════════════════════════

set -e

SERVER=${1:-"localhost:3000"}
DURATION=${2:-30}

echo "═══════════════════════════════════════"
echo "  WebRTC Streaming Benchmark"
echo "  Server: $SERVER"
echo "  Duration: ${DURATION}s"
echo "═══════════════════════════════════════"

# Health Check
echo -e "\n[1/4] Health Check..."
HEALTH=$(curl -s "http://$SERVER/api/v1/health" 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "  ✅ Server is healthy"
  echo "  $HEALTH" | python3 -m json.tool 2>/dev/null || echo "  $HEALTH"
else
  echo "  ❌ Server unreachable"
  exit 1
fi

# Active Rooms
echo -e "\n[2/4] Active Rooms..."
ROOMS=$(curl -s "http://$SERVER/api/v1/rooms" 2>/dev/null)
echo "  $ROOMS" | python3 -m json.tool 2>/dev/null || echo "  $ROOMS"

# Docker Stats (if available)
echo -e "\n[3/4] Container Resources..."
if command -v docker &> /dev/null; then
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null | grep -i webrtc || echo "  No webrtc containers found"
else
  echo "  Docker not available, skipping"
fi

# Network Latency
echo -e "\n[4/4] Network Latency..."
HOST=$(echo "$SERVER" | cut -d: -f1)
if command -v ping &> /dev/null; then
  ping -c 5 -W 1 "$HOST" 2>/dev/null | tail -1 || echo "  Ping not available"
else
  echo "  Ping not available"
fi

echo -e "\n═══════════════════════════════════════"
echo "  Benchmark Complete"
echo "═══════════════════════════════════════"
