import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { rm } from 'node:fs/promises'
import path from 'node:path'

// public/ is copied into dist/ wholesale, but public/uploads is not part of the
// build: it is the live upload store, served straight off disk by the express
// mount at /uploads, which is registered before the dist static handler. So
// dist/uploads is shadowed on every request and has never been reachable.
//
// It is not merely dead weight. The DB-backed contract suite uploads through
// the real endpoint, which writes into public/uploads, and `deploy:vps` tars
// dist/ — so local test files were riding a build to production, where only
// the shadowing kept them from being served. Drop the copy after the build
// instead of leaving that to luck.
const dropUploadsFromBuild = () => {
  let outDir

  return {
    name: 'drop-uploads-from-build',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle: {
      // Post-order: vite copies publicDir as part of the same phase, and this
      // has to run after that copy, not race it.
      order: 'post',
      sequential: true,
      async handler() {
        await rm(path.join(outDir, 'uploads'), { force: true, recursive: true })
      },
    },
  }
}

const packageChunkGroups = new Map([
  ['react', 'react-vendor'],
  ['react-dom', 'react-vendor'],
  ['scheduler', 'react-vendor'],
  ['react-router', 'react-vendor'],
  ['react-router-dom', 'react-vendor'],
  ['@react-three/drei', 'three-fiber'],
  ['@react-three/fiber', 'three-fiber'],
  ['@pmndrs/pointer-events', 'three-fiber'],
  ['@use-gesture/core', 'three-fiber'],
  ['@use-gesture/react', 'three-fiber'],
  ['maath', 'three-fiber'],
])

const getPackageName = (id) => {
  const match = id.match(/\/node_modules\/(?:\.vite\/deps\/)?((?:@[^/]+\/)?[^/]+)/)
  return match?.[1]
}

const getManualChunk = (id) => {
  const normalizedId = id.replace(/\\/g, '/')

  // Vite's dynamic-import preload helper is not a dependency of anything in
  // particular, so rollup is free to park it in whichever chunk it likes -- and
  // it parked it in `three-fiber`. The entry needs the helper for its own lazy
  // imports, so the entry then had to import three-fiber statically, which
  // imports three-core, which put a modulepreload for 971 KB of three.js in
  // index.html for *every* page. Pinning the helper to react-vendor (already a
  // static import of the entry) puts three.js back where it belongs: fetched
  // when something 3D is actually rendered.
  if (normalizedId.includes('vite/preload-helper')) return 'react-vendor'

  if (!normalizedId.includes('/node_modules/')) return undefined

  if (normalizedId.includes('/node_modules/three/examples/')) return 'three-examples'
  if (normalizedId.includes('/node_modules/three/')) return 'three-core'

  return packageChunkGroups.get(getPackageName(normalizedId))
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dropUploadsFromBuild(),
  ],

  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },

  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4173',
    },
  },
})
