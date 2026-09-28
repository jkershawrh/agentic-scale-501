FROM --platform=linux/amd64 registry.access.redhat.com/ubi9/nodejs-22@sha256:90d19cd1a4ba03bcb63c46320862955fc1560511532ee35ff472289bf5fe2276 AS build
WORKDIR /opt/app-root/src
COPY --chown=1001:0 package*.json ./
RUN npm ci --ignore-scripts
COPY --chown=1001:0 . .
RUN npm run build

FROM --platform=linux/amd64 docker.io/library/node:24-alpine@sha256:83f1c388c31fb2e51f7cbd4dea949b96260798c98f206e8e4696bc93bd964e3a
LABEL org.opencontainers.image.title="Agentic AI 501 qualification service" \
      org.opencontainers.image.description="Fail-closed evidence qualification; no certification or promotion authority" \
      org.opencontainers.image.source="https://github.com/jkershawrh/agentic-scale-501" \
      org.opencontainers.image.architecture="amd64"
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-v* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    EVIDENCE_SOURCE=rehearsal \
    LIVE_EXECUTION_ENABLED=false \
    FAULT_INJECTION_ENABLED=false \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /opt/app-root/src
COPY --from=build --chown=1000:1000 /opt/app-root/src/server-dist ./server-dist
USER 1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server-dist/server/main.js"]
