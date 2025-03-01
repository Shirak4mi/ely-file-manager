FROM oven/bun:canary-alpine
WORKDIR /app
COPY . .
COPY  bun.lock package.json tsconfig.json ./
COPY src src
COPY .env .env
#COPY tsconfig.json .
RUN bun install --production
#COPY src src
RUN bunx prisma generate
EXPOSE 3000
CMD ["bun", "src/index.ts"]