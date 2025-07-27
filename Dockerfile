# ===== Stage 1: Build =====
FROM node:16 AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Transpile TypeScript to JavaScript
RUN npx tsc

# ===== Stage 2: Final image =====
FROM node:16-alpine

# Set working directory in the final image
WORKDIR /usr/src/app

# Only copy the compiled JS and necessary files
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package*.json ./

# Install only production dependencies
RUN npm install --only=production

EXPOSE 4000

CMD ["node", "dist/index.js"]
