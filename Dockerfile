# Two stages: build the React app with Vite (a devDependency), then ship only what runs.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
# DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL are injected at runtime, never baked in.
CMD ["node", "server/index.js", "--prod"]
