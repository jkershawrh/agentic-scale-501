FROM --platform=linux/amd64 registry.access.redhat.com/ubi9/nodejs-22 AS build
WORKDIR /opt/app-root/src
COPY --chown=1001:0 package*.json ./
RUN npm ci
COPY --chown=1001:0 . .
RUN npm run build

FROM --platform=linux/amd64 registry.access.redhat.com/ubi9/nodejs-22-minimal
ENV NODE_ENV=production \
    EVIDENCE_SOURCE=rehearsal \
    LIVE_EXECUTION_ENABLED=false \
    FAULT_INJECTION_ENABLED=false \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /opt/app-root/src
COPY --from=build --chown=1001:0 /opt/app-root/src/server-dist ./server-dist
USER 1001
EXPOSE 8080
CMD ["node", "server-dist/server/main.js"]
