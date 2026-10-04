// Writes placeholder PNG icons (dark square, white barbell mark) with no image library.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  let c, crc = ~0
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, maskable) {
  const bg = [17, 24, 39], fg = [255, 255, 255]
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const s = maskable ? 0.8 : 1 // maskable icons keep the mark inside the safe zone
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const u = (x / size - 0.5) / s + 0.5, v = (y / size - 0.5) / s + 0.5
      const on =
        inRect(u, v, 0.18, 0.47, 0.82, 0.53) || // bar
        inRect(u, v, 0.18, 0.32, 0.26, 0.68) || inRect(u, v, 0.74, 0.32, 0.82, 0.68) || // inner plates
        inRect(u, v, 0.27, 0.38, 0.33, 0.62) || inRect(u, v, 0.67, 0.38, 0.73, 0.62)
      const c = on ? fg : bg
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', png(192, false))
writeFileSync('public/icons/icon-512.png', png(512, false))
writeFileSync('public/icons/maskable-512.png', png(512, true))
writeFileSync('public/icons/apple-touch-icon.png', png(180, false))
