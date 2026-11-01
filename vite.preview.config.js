import { existsSync, readFileSync } from 'node:fs'
import { mergeConfig } from 'vite'
import base from './vite.config.js'

const cachePath = new URL('./.deploy-tools/public-preview-cache/manifest.json', import.meta.url)
const cachedThumbs = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}

// Loopback-only, read-only design preview. Sample scores never reach the server
// or the production build. The ordinary catalogue remains public live data.
export default mergeConfig(base, {
  plugins: [{
    name: 'public-design-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:5174')
        if (req.method === 'GET' && url.pathname === '/api/works' && url.searchParams.get('exhibition') === 'true') {
          const demo = JSON.parse(readFileSync(new URL('./dev/exhibition-demo.json', import.meta.url), 'utf8'))
          if (demo.enabled) {
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            res.setHeader('X-Preview-Demo', 'true')
            res.end(JSON.stringify({ data: { works: demo.works, previewDemo: true }, pagination: { page: 1, pages: 1, total: demo.works.length, hasPrevious: false, hasNext: false }, error: null }))
            return
          }
        }
        const cached = cachedThumbs[url.pathname]
        if (cached && existsSync(cached)) {
          res.setHeader('Content-Type', 'image/webp')
          res.end(readFileSync(cached))
          return
        }
        if (url.pathname.startsWith('/api/') && (req.method !== 'GET' || !/^\/api\/(profile|experience|projects(?:[/?]|$)|works(?:[/?]|$)|users\/|community\/(?:posts|uploads|comments))/.test(req.url))) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ data: null, pagination: {}, error: { code: 'SERVICE_UNAVAILABLE', message: 'Public design preview only.' } }))
          return
        }
        next()
      })
    },
  }],
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    proxy: { '/api': { target: 'https://mrright.blog', changeOrigin: true }, '/uploads': { target: 'https://mrright.blog', changeOrigin: true } },
  },
})
