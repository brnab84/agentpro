# AgentPro — Node + system Chromium for headless property import
FROM node:20-slim

# Chromium + the fonts/libs it needs (apt resolves Chromium's own deps).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# Use the system Chromium; never let puppeteer download its own.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["npm", "start"]
