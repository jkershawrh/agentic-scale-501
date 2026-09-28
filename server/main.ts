import { createScaleServiceFromEnvironment } from './runtime'

async function main() {
  const service = createScaleServiceFromEnvironment()
  const listening = await service.start()

  process.stdout.write(JSON.stringify({
    event: 'server.started',
    address: listening.address,
    port: listening.port,
    evidenceSource: process.env.EVIDENCE_SOURCE ?? 'rehearsal',
  }) + '\n')

  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    process.stdout.write(JSON.stringify({ event: 'server.stopping', signal }) + '\n')
    await service.stop()
  }

  process.once('SIGTERM', () => { void shutdown('SIGTERM') })
  process.once('SIGINT', () => { void shutdown('SIGINT') })
}

void main().catch(() => {
  process.stderr.write(JSON.stringify({ event: 'server.start_failed', message: 'Server startup failed.' }) + '\n')
  process.exitCode = 1
})
