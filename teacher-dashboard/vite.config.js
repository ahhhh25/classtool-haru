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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
  },
  define: {
    __HARU_DEV_LAN_HOST__: JSON.stringify(lanAddress()),
  },
})
