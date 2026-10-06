import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Socket } from 'node:net'
import type { HttpRuntimeConfig } from './config'

export type RequestHandler = (request: Request) => Promise<Response>

export interface ScaleHttpService {
  server: Server
  start(): Promise<{ address: string; port: number }>
  stop(): Promise<void>
  isReady(): boolean
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

const qualificationStatusPage = (ready: boolean) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Qualification Evidence</title>
    <style>
      :root { color-scheme: dark; font-family: "Red Hat Text", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #101214; color: #f4f4f4; }
      header { display: flex; align-items: center; gap: 1rem; padding: 1.1rem 1.5rem; border-bottom: 1px solid #343a40; background: #17191c; }
      .brands { font-weight: 700; letter-spacing: .02em; }
      .brands span { color: #00c7fd; }
      .level { margin-left: auto; color: #b8bec5; font-size: .8rem; letter-spacing: .12em; }
      main { max-width: 980px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
      .eyebrow { color: #00c7fd; font-family: monospace; font-size: .78rem; font-weight: 700; letter-spacing: .13em; }
      h1 { margin: .5rem 0; font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1.03; }
      .lead { max-width: 740px; color: #c7ccd1; font-size: 1.05rem; line-height: 1.6; }
      .badge { display: inline-flex; margin-top: 1rem; padding: .35rem .65rem; border: 1px solid #f0ab00; border-radius: 999px; color: #f0ab00; font-family: monospace; font-weight: 700; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 2rem; }
      article { min-height: 150px; padding: 1.2rem; border: 1px solid #343a40; border-top: 3px solid #00c7fd; border-radius: .35rem; background: #1b1e21; }
      article h2 { margin: 0 0 .8rem; font-size: 1rem; }
      article strong { display: block; margin-bottom: .45rem; font-size: 1.35rem; }
      article p { margin: 0; color: #abb2b9; line-height: 1.45; }
      .human { border-top-color: #ee0000; }
      .truth { border-top-color: #f0ab00; }
      footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #343a40; color: #abb2b9; line-height: 1.5; }
    </style>
  </head>
  <body>
    <header><div class="brands">Red Hat <span>× Intel</span></div><div class="level">AGENTIC AI 501</div></header>
    <main>
      <div class="eyebrow">DESTINATION QUALIFICATION</div>
      <h1>Qualification Evidence</h1>
      <p class="lead">This operator shows the honest execution boundary for the current seat. Use the guided lab and Production Blueprint Story to run the qualification journey and inspect its complete proof.</p>
      <div class="badge">REHEARSAL</div>
      <section class="grid">
        <article><h2>Runtime</h2><strong>${ready ? 'Ready' : 'Draining'}</strong><p>The qualifier service is available for the assigned Flightpath namespace.</p></article>
        <article><h2>Evidence source</h2><strong>Deterministic rehearsal</strong><p>Three correlated journeys exercise the qualification contract without representing fixture data as live telemetry.</p></article>
        <article class="human"><h2>Authority</h2><strong>Human review required</strong><p>No automated promotion or production action is permitted.</p></article>
        <article class="truth"><h2>Inference boundary</h2><strong>No model participated</strong><p>Live Intel Xeon inference and approved hardware telemetry remain production gates.</p></article>
      </section>
      <footer>Run the executable steps in the guide, then compare the generated proof with the declared operating envelope. A green rehearsal result qualifies this destination only; it does not certify production scale.</footer>
    </main>
  </body>
</html>`

const html = (response: ServerResponse, status: number, body: string) => {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self' https://*.smg-helix.ai https://*.fm2aihpcsed.com",
  })
  response.end(body)
}

const webHeaders = (headers: IncomingHttpHeaders) => {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) value.forEach((item) => result.append(name, item))
    else if (value !== undefined) result.set(name, value)
  }
  return result
}

const requestUrl = (request: IncomingMessage) => new URL(request.url ?? '/', 'http://service.local')

const toWebRequest = (request: IncomingMessage, signal: AbortSignal) => {
  const method = request.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(requestUrl(request), {
    method,
    headers: webHeaders(request.headers),
    signal,
    ...(hasBody ? { body: Readable.toWeb(request) as ReadableStream, duplex: 'half' } : {}),
  } as RequestInit & { duplex?: 'half' })
}

const sendWebResponse = async (source: Response, destination: ServerResponse) => {
  const headers: Record<string, string> = {}
  source.headers.forEach((value, name) => { headers[name] = value })
  destination.writeHead(source.status, headers)
  if (!source.body) {
    destination.end()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const body = Readable.fromWeb(source.body as never)
    body.once('error', reject)
    destination.once('error', reject)
    destination.once('finish', resolve)
    body.pipe(destination)
  })
}

export function createScaleHttpService(config: HttpRuntimeConfig, handleScaleRun: RequestHandler): ScaleHttpService {
  let ready = false
  let stopping: Promise<void> | undefined
  const sockets = new Set<Socket>()

  const server = createServer(async (request, response) => {
    const url = requestUrl(request)
    if (url.pathname === '/healthz') {
      json(response, 200, { status: 'ok' })
      return
    }
    if (url.pathname === '/readyz') {
      json(response, ready ? 200 : 503, { status: ready ? 'ready' : 'draining' })
      return
    }
    if (url.pathname === '/') {
      json(response, ready ? 200 : 503, {
        service: 'agentic-scale-501-qualifier',
        status: ready ? 'ready' : 'draining',
      })
      return
    }
    if (url.pathname === '/api/v1/status') {
      html(response, ready ? 200 : 503, qualificationStatusPage(ready))
      return
    }

    const abort = new AbortController()
    const onAborted = () => abort.abort(new DOMException('Client disconnected', 'AbortError'))
    request.once('aborted', onAborted)
    response.once('close', () => {
      if (!response.writableFinished) onAborted()
    })

    try {
      await sendWebResponse(await handleScaleRun(toWebRequest(request, abort.signal)), response)
    } catch {
      if (!response.headersSent) json(response, 500, { error: { code: 'internal_error', message: 'Request handling failed.' } })
      else response.destroy()
    } finally {
      request.removeListener('aborted', onAborted)
    }
  })

  server.requestTimeout = config.requestTimeoutMs
  server.headersTimeout = Math.min(config.requestTimeoutMs, 15_000)
  server.keepAliveTimeout = 5_000
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

  return {
    server,
    isReady: () => ready,
    start: () => new Promise((resolve, reject) => {
      const onError = (cause: Error) => reject(cause)
      server.once('error', onError)
      server.listen(config.port, config.host, () => {
        server.removeListener('error', onError)
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('HTTP listener did not publish a TCP address'))
          return
        }
        ready = true
        resolve({ address: address.address, port: address.port })
      })
    }),
    stop: () => {
      if (stopping) return stopping
      ready = false
      stopping = new Promise<void>((resolve) => {
        const force = setTimeout(() => {
          for (const socket of sockets) socket.destroy()
          server.closeAllConnections()
        }, config.shutdownTimeoutMs)
        force.unref()
        server.close(() => {
          clearTimeout(force)
          resolve()
        })
        server.closeIdleConnections()
      })
      return stopping
    },
  }
}
