FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ tzdata

COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY public/ ./public/

EXPOSE 7700

ENV PORT=7700

CMD ["node", "backend/server.js"]
