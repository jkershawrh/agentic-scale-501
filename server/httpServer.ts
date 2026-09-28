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
