FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY package*.json ./
# Install all deps including drizzle-kit for migrations
RUN npm ci
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY drizzle.config.ts ./
COPY skill.md ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
