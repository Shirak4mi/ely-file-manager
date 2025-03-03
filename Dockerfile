# Build stage
FROM oven/bun:canary-alpine AS builder

WORKDIR /app

# Copy project files
COPY package.json bun.lockb* ./
COPY src ./src
COPY prisma ./prisma

# Install dependencies
RUN bun install

# Generate Prisma client (relies on schema.prisma binaryTargets)
RUN bunx prisma generate


# Runtime stage
FROM oven/bun:canary-alpine

WORKDIR /app

# Copy all files, including the query engine
COPY --from=builder /app /app

# Expose port
EXPOSE 3000

# Run the app
CMD ["bux", "prisma", "generate", "&& ","bun", "run", "src/index.ts"]