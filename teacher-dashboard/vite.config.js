import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import os from 'node:os'

function lanAddress() {
  const interfaces = os.networkInterfaces()
  const preferred = []
  const others = []
  for (const [name, addrs] of Object.entries(interfaces)) {
    const wifiLike = /wi-?fi|wlan|wireless|ethernet|이더넷/i.test(name)
    for (const addr of addrs ?? []) {
      const family = addr.family === 'IPv4' || addr.family === 4
      if (!family || addr.internal || !isPrivateLan(addr.address) || isIgnoredLan(addr.address)) {
        continue
      }
      if (wifiLike) preferred.push(addr.address)
      else others.push(addr.address)
    }
  }
  return preferred[0] || others[0] || ''
}

function isIgnoredLan(ip) {
  return (
    ip.startsWith('192.168.137.') ||
    ip.startsWith('192.168.56.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.')
  )
}

function isPrivateLan(ip) {
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true
  const match = ip.match(/^172\.(\d+)\./)
  if (!match) return false
  const second = Number(match[1])
  return second >= 16 && second <= 31
}

function haruSyncPlugin() {
  const clients = new Set()
  const broadcast = (text) => {
    for (const res of clients) {
      try {
        res.write(`data: ${text}\n\n`)
      } catch {
        clients.delete(res)
      }
    }
  }
  const handle = (req, res, next) => {
    const url = req.url?.split('?')[0]
    if (url !== '/__haru_sync') {
      next()
      return
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })
      res.write(': ok\n\n')
      clients.add(res)
      const ping = setInterval(() => {
        try {
          res.write(': ping\n\n')
        } catch {
          clearInterval(ping)
          clients.delete(res)
        }
      }, 15000)
      req.on('close', () => {
        clearInterval(ping)
        clients.delete(res)
      })
      return
    }
    if (req.method === 'POST') {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (text) broadcast(text)
        res.statusCode = 204
        res.end()
      })
      return
    }
    next()
  }
  return {
    name: 'haru-sync',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), haruSyncPlugin()],
  server: {
    host: true,
  },
  define: {
    __HARU_DEV_LAN_HOST__: JSON.stringify(lanAddress()),
  },
})
