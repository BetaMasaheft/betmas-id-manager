# syntax=docker/dockerfile:1
# Stateless image - all durable state (counters.xml + issued-id records)
# lives under /data, which is a volume mount at `docker run`/compose time,
# not baked into the image.
#
#   docker compose up --build

FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY api.json ./api.json

ENV DATA_DIR=/data
ENV PORT=8080
VOLUME /data

EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO- http://127.0.0.1:8080/types >/dev/null || exit 1

CMD ["node", "src/server.ts"]
