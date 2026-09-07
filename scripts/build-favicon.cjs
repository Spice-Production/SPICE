// Builds apps/backend/app/favicon.ico from public/icon.svg (the web brand
// mark): 16/32/48px PNGs embedded in a Vista-style ICO container.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

(async () => {
  const backend = path.resolve(__dirname, '..', 'apps', 'backend');
  const svg = await fs.promises.readFile(path.join(backend, 'public', 'icon.svg'));
  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) {
    const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
    images.push({ size, png });
  }
  const headerSize = 6 + 16 * images.length;
  let offset = headerSize;
  const header = Buffer.alloc(6); // ICONDIR only; entries follow as chunks
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4); // count
  const chunks = [header];
  images.forEach(({ size, png }, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit depth
    entry.writeUInt32LE(png.length, 8); // data size
    entry.writeUInt32LE(offset, 12); // data offset
    chunks.push(entry);
    offset += png.length;
  });
  for (const { png } of images) chunks.push(png);
  const out = path.join(backend, 'app', 'favicon.ico');
  await fs.promises.writeFile(out, Buffer.concat(chunks));
  const stat = await fs.promises.stat(out);
  console.log(`wrote ${out} (${stat.size} bytes, ${images.length} images)`);
})().catch((err) => { console.error(err); process.exit(1); });
