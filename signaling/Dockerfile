FROM node:20-alpine

WORKDIR /app

# Copy package files and install
COPY signaling/package.json signaling/package-lock.json* ./signaling/
RUN cd signaling && npm ci --production 2>/dev/null || npm install --production

# Copy application code
COPY signaling/ ./signaling/
COPY public/ ./public/

# Create records directory
RUN mkdir -p /data/records

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/v1/health || exit 1

WORKDIR /app/signaling
CMD ["node", "server.js"]
