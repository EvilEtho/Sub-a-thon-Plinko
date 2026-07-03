import { createServer, type Server as HttpServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import { findFreePort } from './ports'
import { buildUrls, type OverlayUrls } from './urls'

export interface ServerHandle {
  httpServer: HttpServer
  app: express.Express
  port: number
  urls: OverlayUrls
}

/**
 * Route -> built HTML file (relative to the renderer output dir). Mirrors the
 * `renderer.build.rollupOptions.input` entries in electron.vite.config.ts.
 */
const PAGE_FILES: Record<string, string> = {
  '/panel': 'panel/index.html',
  '/board': 'overlays/board/index.html',
  '/timer': 'overlays/timer/index.html',
  '/feed': 'overlays/feed/index.html',
  '/goals': 'overlays/goals/index.html'
}

/**
 * Create and start the embedded HTTP server that serves the panel + overlay pages
 * over localhost. OBS browser sources and custom docks load these URLs.
 */
export async function createHttpServer(opts: {
  rendererDir: string
  preferredPort: number
}): Promise<ServerHandle> {
  const { rendererDir, preferredPort } = opts
  const app = express()

  for (const [route, file] of Object.entries(PAGE_FILES)) {
    const abs = join(rendererDir, file)
    app.get(route, (_req, res) => {
      if (existsSync(abs)) {
        res.sendFile(abs)
      } else {
        res
          .status(404)
          .type('html')
          .send(
            `<h1>Overlay not built</h1><p>Expected <code>${file}</code>. Run <code>npm run build</code> first.</p>`
          )
      }
    })
  }

  // Static assets emitted by Vite (e.g. /assets/*), served from the renderer dir.
  app.use(express.static(rendererDir))

  const port = await findFreePort(preferredPort) // 0 => OS-assigned
  const httpServer = createServer(app)

  await new Promise<void>((resolvePromise, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, '127.0.0.1', () => resolvePromise())
  })

  const address = httpServer.address()
  const actualPort = typeof address === 'object' && address ? address.port : preferredPort

  return { httpServer, app, port: actualPort, urls: buildUrls(actualPort) }
}
