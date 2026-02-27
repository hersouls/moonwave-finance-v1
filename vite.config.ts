import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { compression } from 'vite-plugin-compression2'
import path from 'path'
import fs from 'fs'

function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version-inject',
    writeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js')
      if (!fs.existsSync(swPath)) return
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
      const version = `${pkg.version}-${Date.now()}`
      let content = fs.readFileSync(swPath, 'utf-8')
      content = content.replace('__SW_VERSION__', version)
      fs.writeFileSync(swPath, content, 'utf-8')
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    swVersionPlugin(),
    compression({ algorithm: 'gzip', exclude: [/\.(br)$/], threshold: 1024 }),
    compression({ algorithm: 'brotliCompress', exclude: [/\.(gz)$/], threshold: 1024 }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          'vendor-ui': ['lucide-react', '@headlessui/react'],
          'vendor-data': ['zustand', 'dexie', 'dexie-react-hooks', 'date-fns'],
        },
      },
    },
  },
})
