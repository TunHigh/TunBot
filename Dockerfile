FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production
# Skip optional dependencies (like canvas from jsdom) to avoid native compilation
ENV npm_config_optional=false

# Install build dependencies for native modules (canvas)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    pixman-dev

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
