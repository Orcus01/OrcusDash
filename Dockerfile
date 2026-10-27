# Single container: builds the client and serves it + the WebSocket game server on $PORT.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
