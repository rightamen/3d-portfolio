import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const packageChunkGroups = new Map([
  ['react', 'react-vendor'],
  ['react-dom', 'react-vendor'],
  ['scheduler', 'react-vendor'],
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

  if (!normalizedId.includes('/node_modules/')) return undefined

  if (normalizedId.includes('/node_modules/three/examples/')) return 'three-examples'
  if (normalizedId.includes('/node_modules/three/')) return 'three-core'

  return packageChunkGroups.get(getPackageName(normalizedId))
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
