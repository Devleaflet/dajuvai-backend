FROM node:22-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --include=dev

COPY . .

# API creates this directory on startup. Keep the process unprivileged.
RUN mkdir -p /usr/src/app/src/uploads && chown node:node /usr/src/app/src/uploads

ENV NODE_ENV=production
ENV PORT=5000

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/district').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "dev"]
