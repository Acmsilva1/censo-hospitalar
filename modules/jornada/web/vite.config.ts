import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Com npm workspaces, dependências podem ficar só na raiz do monorepo. */
function pkgDir(pkg: string) {
  const local = path.join(__dirname, 'node_modules', pkg)
  if (existsSync(local)) return local
  const moduleRoot = path.join(__dirname, '..', 'node_modules', pkg)
  if (existsSync(moduleRoot)) return moduleRoot
  return path.join(__dirname, '..', '..', '..', 'node_modules', pkg)
}

// Força o Vite a resolver 'react' e 'react-dom' do node_modules (local ou raiz),
// e nunca pegar o react.js solto na pasta frontend.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: pkgDir('react'),
      'react-dom': pkgDir('react-dom'),
    }
  },
  server: {
    port: 5276,
    strictPort: true,
    host: true,
  }
})
