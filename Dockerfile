# syntax=docker/dockerfile:1
FROM node:25-alpine

WORKDIR /app

# koski2openbadge is an unpublished sibling project, depended on straight
# from GitHub (see package.json). npm resolves it through GitHub's tarball
# endpoint, so this needs neither git nor SSH keys in the image - but it does
# mean the repo has to stay publicly readable.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Uses Node's built-in fetch rather than adding curl to the image; /healthz
# is what docker-compose's service_healthy condition waits on.
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node
CMD ["node", "index.js"]
