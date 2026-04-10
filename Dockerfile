FROM node:22-alpine

WORKDIR /app

COPY kiosk-server/package*.json ./
RUN apk add --no-cache wget && npm ci --omit=dev

COPY kiosk-server/ .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/info || exit 1

CMD ["node", "server.js"]
