# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (including dev deps needed by Remix/Vite build)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Build app
COPY . .
RUN npm run build

# Remove dev deps from node_modules for runtime image
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy production runtime artifacts only
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/shopify.app.toml ./shopify.app.toml

EXPOSE 3000
CMD ["npm", "run", "start"]
