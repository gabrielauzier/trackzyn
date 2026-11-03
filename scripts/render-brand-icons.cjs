// Renders the trackzyn mark into every raster icon the frontend and desktop ship.
// Source: frontend/public/favicon.svg (the square version of docs/brand/trackzyn-mark.svg).
// usage: node scripts/render-brand-icons.cjs .   (needs desktop/node_modules and Google Chrome)
const path = require('node:path')
const fs = require('node:fs')
const root = path.resolve(process.argv[2])
const { createRequire } = require('node:module')
const { chromium } = createRequire(path.join(root, 'desktop/package.json'))('@playwright/test')

const mark = fs.readFileSync(path.join(root, 'frontend/public/favicon.svg'), 'utf8')
const markUri = 'data:image/svg+xml;base64,' + Buffer.from(mark).toString('base64')

// Transparent mark, filling the canvas.
const plain = (size) => `<img src="${markUri}" style="width:${size}px;height:${size}px;display:block">`

// Opaque tile with padding: Apple touch icons (iOS fills transparency with black).
const tile = (size) => `
  <div style="width:${size}px;height:${size}px;background:#fff;display:flex;align-items:center;justify-content:center">
    <img src="${markUri}" style="width:${size * 0.72}px;height:${size * 0.72}px">
  </div>`

// App icon on Apple's 1024 grid: an 824px rounded tile with 100px of air around it.
const app = (size) => {
  const k = size / 1024
  return `
  <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
    <div style="width:${824 * k}px;height:${824 * k}px;border-radius:${185 * k}px;
                background:linear-gradient(180deg,#FFFFFF 0%,#F1E9FF 100%);
                box-shadow:0 ${10 * k}px ${24 * k}px rgba(60,20,120,.22);
                display:flex;align-items:center;justify-content:center">
      <img src="${markUri}" style="width:${560 * k}px;height:${560 * k}px">
    </div>
  </div>`
}

const jobs = [
  ['frontend/public/favicon-16x16.png', 16, plain],
  ['frontend/public/favicon-32x32.png', 32, plain],
  ['frontend/public/favicon-96x96.png', 96, plain],
  ['frontend/public/android-icon-192x192.png', 192, plain],
  ['frontend/public/apple-touch-icon.png', 180, tile],
  ['desktop/build/icon.png', 1024, app],
]
const icoSizes = [16, 32, 48, 64]

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const shot = async (size, html) => {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<body style="margin:0;background:transparent">${html}</body>`)
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }
  for (const [file, size, layout] of jobs) {
    const out = path.join(root, file)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, await shot(size, layout(size)))
    console.log('wrote', file)
  }
  // favicon.ico with PNG-compressed entries (supported by every current browser).
  const pngs = []
  for (const s of icoSizes) pngs.push([s, await shot(s, plain(s))])
  const header = Buffer.alloc(6 + 16 * pngs.length)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  pngs.forEach(([s, buf], i) => {
    const e = 6 + 16 * i
    header.writeUInt8(s, e); header.writeUInt8(s, e + 1)
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(buf.length, e + 8); header.writeUInt32LE(offset, e + 12)
    offset += buf.length
  })
  fs.writeFileSync(path.join(root, 'frontend/public/favicon.ico'), Buffer.concat([header, ...pngs.map(([, b]) => b)]))
  console.log('wrote frontend/public/favicon.ico')
  await browser.close()
})()
