FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV KIYOVN_DB_PATH=/data/kiyovn.sqlite

VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "index.mjs"]
