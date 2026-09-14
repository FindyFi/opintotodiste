# syntax=docker/dockerfile:1
FROM node:20-alpine

# koski2openbadge is a local, unpublished sibling package (see package.json's
# "koski2openbadge": "file:../koski2openbadge" dependency) - pulled in here
# via the "koski2openbadge" named build context (see its wiring in
# docker-compose.yml's additional_contexts) instead of widening this image's
# own build context out to the whole multi-repo parent folder it lives in.
WORKDIR /koski2openbadge
COPY --from=koski2openbadge . .

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
