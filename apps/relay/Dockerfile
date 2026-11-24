# Build from the repository root: docker build -f apps/relay/Dockerfile .
FROM node:24-slim AS build
RUN npm install --global pnpm@12.23.0
WORKDIR /src
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @weft/relay... \
 && pnpm --filter @weft/relay... build \
 && pnpm --filter @weft/relay deploy --prod --legacy /out \
 && mkdir /data

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
COPY --from=build /out .
COPY --from=build --chown=65532:65532 /data /var/lib/weft
ENV NODE_ENV=production \
    WEFT_DB=/var/lib/weft/ops.db \
    PORT=8790
VOLUME /var/lib/weft
EXPOSE 8790
CMD ["dist/main.js"]
