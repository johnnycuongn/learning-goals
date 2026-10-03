/**
 * Draws the app icon straight from the Lagoon tokens, as a real PNG with no
 * image dependency. `npm run icons` then has Tauri cut every size the Mac,
 * Windows and Linux bundles need from src-tauri/app-icon.png.
 *
 * The mark is the roadmap itself: a spine running left to right with three
 * stage nodes on it and two topics branching off.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const TEAL = [13, 148, 136] // --spine light
const DEEP = [4, 47, 46] // --pri-text
const MINT = [204, 251, 241] // --sub
const BRIGHT = [45, 212, 191] // --pri

/* --------------------------------------------------------------- PNG -- */

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------ drawing -- */

const SS = 4 // supersample factor, for smooth edges

/** Signed-distance helpers in unit space (0..1 across the icon). */
function roundedRect(px, py, x, y, w, h, r) {
  const dx = Math.max(x - px, 0, px - (x + w))
  const dy = Math.max(y - py, 0, py - (y + h))
  const ix = Math.min(Math.max(px, x + r), x + w - r)
  const iy = Math.min(Math.max(py, y + r), y + h - r)
  if (dx === 0 && dy === 0) return Math.hypot(px - ix, py - iy) <= r || (px > x + r && px < x + w - r) || (py > y + r && py < y + h - r)
  return false
}

function render(size, { maskable = false } = {}) {
  const N = size * SS
  const acc = new Float64Array(size * size * 4)

  // Content is inset on a maskable icon so Android can crop the outer 20%.
  const pad = maskable ? 0.19 : 0.0
  const s = 1 - pad * 2
  const u = (v) => pad + v * s

  const spineY = u(0.5)
  const nodes = [u(0.245), u(0.5), u(0.755)]
  const nodeR = 0.086 * s
  const spineH = 0.05 * s
  const branchR = 0.055 * s

  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = (px + 0.5) / N
      const y = (py + 0.5) / N

      let col = null
      let alpha = 0

      // Background: rounded square on a normal icon, full bleed on a maskable one.
      if (maskable || roundedRect(x, y, 0.035, 0.035, 0.93, 0.93, 0.21)) {
        col = TEAL
        alpha = 1
      }

      if (alpha > 0) {
        // Branch dots, above and below the spine.
        const branches = [
          [u(0.245), u(0.235)],
          [u(0.755), u(0.765)],
          [u(0.5), u(0.775)],
        ]
        for (const [bx, by] of branches) {
          if (Math.hypot(x - bx, y - by) <= branchR) col = MINT
        }
        // Dotted connectors from the spine up/down to each branch dot.
        for (const [bx, by] of branches) {
          const withinX = Math.abs(x - bx) <= spineH * 0.42
          const lo = Math.min(by, spineY)
          const hi = Math.max(by, spineY)
          if (withinX && y > lo && y < hi) {
            // A dash pattern rather than a solid rule.
            const t = ((y - lo) / (hi - lo)) * 7
            if (t % 2 < 1.15) col = MINT
          }
        }
        // The spine.
        if (Math.abs(y - spineY) <= spineH / 2 && x >= u(0.12) && x <= u(0.88)) col = DEEP
        // Stage nodes.
        for (const nx of nodes) {
          const d = Math.hypot(x - nx, y - spineY)
          if (d <= nodeR) col = BRIGHT
          if (d <= nodeR && d > nodeR - 0.022 * s) col = DEEP
        }
      }

      if (alpha === 0) continue
      const ox = Math.floor(px / SS)
      const oy = Math.floor(py / SS)
      const o = (oy * size + ox) * 4
      acc[o] += col[0]
      acc[o + 1] += col[1]
      acc[o + 2] += col[2]
      acc[o + 3] += 255
    }
  }

  const out = Buffer.alloc(size * size * 4)
  const per = SS * SS
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3] / per
    // Un-premultiply so edges keep their colour as they fade out.
    const w = acc[i * 4 + 3] || 1
    out[i * 4] = Math.round((acc[i * 4] / w) * 255)
    out[i * 4 + 1] = Math.round((acc[i * 4 + 1] / w) * 255)
    out[i * 4 + 2] = Math.round((acc[i * 4 + 2] / w) * 255)
    out[i * 4 + 3] = Math.round(a)
  }
  return encodePng(size, size, out)
}

mkdirSync('public', { recursive: true })

writeFileSync('src-tauri/app-icon.png', render(1024))
console.log('src-tauri/app-icon.png')
// A crisp vector favicon for browser tabs.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="21" fill="#0D9488"/>
  <g stroke="#CCFBF1" stroke-width="4" stroke-linecap="round" stroke-dasharray="4 6">
    <path d="M24.5 50V23.5"/><path d="M75.5 50v26.5"/><path d="M50 50v27.5"/>
  </g>
  <g fill="#CCFBF1"><circle cx="24.5" cy="23.5" r="5.5"/><circle cx="75.5" cy="76.5" r="5.5"/><circle cx="50" cy="77.5" r="5.5"/></g>
  <path d="M12 50h76" stroke="#042F2E" stroke-width="5" stroke-linecap="round"/>
  <g fill="#2DD4BF" stroke="#042F2E" stroke-width="2.2">
    <circle cx="24.5" cy="50" r="8.6"/><circle cx="50" cy="50" r="8.6"/><circle cx="75.5" cy="50" r="8.6"/>
  </g>
</svg>`
writeFileSync('public/favicon.svg', svg)
console.log('public/favicon.svg')
