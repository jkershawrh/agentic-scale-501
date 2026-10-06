FROM --platform=linux/amd64 registry.access.redhat.com/ubi9/nodejs-22@sha256:90d19cd1a4ba03bcb63c46320862955fc1560511532ee35ff472289bf5fe2276 AS build
WORKDIR /opt/app-root/src
COPY --chown=1001:0 package*.json ./
RUN npm ci --ignore-scripts
COPY --chown=1001:0 . .
RUN npm run build

FROM --platform=linux/amd64 cgr.dev/chainguard/node@sha256:0768cc87864665f3217b35f47520e7e5555b9ae3fa0eb53ddceea018a83ae34c AS node-runtime

FROM --platform=linux/amd64 docker.io/library/alpine:3.22@sha256:4bcff63911fcb4448bd4fdacec207030997caf25e9bea4045fa6c8c44de311d1 AS runtime-sanitizer
COPY --from=node-runtime / /node-root
RUN rm -rf /node-root/usr/lib/node_modules \
    /node-root/usr/bin/npm /node-root/usr/bin/npx

FROM scratch
LABEL org.opencontainers.image.title="Agentic AI 501 qualification service" \
      org.opencontainers.image.description="Fail-closed evidence qualification; no certification or promotion authority" \
      org.opencontainers.image.source="https://github.com/jkershawrh/agentic-scale-501" \
      org.opencontainers.image.architecture="amd64"
COPY --from=runtime-sanitizer /node-root /
ENV NODE_ENV=production \
    EVIDENCE_SOURCE=rehearsal \
    LIVE_EXECUTION_ENABLED=false \
    FAULT_INJECTION_ENABLED=false \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=65532:65532 /opt/app-root/src/server-dist ./server-dist
USER 65532
EXPOSE 8080
ENTRYPOINT ["/usr/bin/node"]
CMD ["server-dist/server/main.js"]
