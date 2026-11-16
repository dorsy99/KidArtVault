import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function renderIconPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const bg = [200, 182, 255, 255];      // #c8b6ff pastel lilac
  const paper = [255, 250, 245, 255];   // #fffaf5 warm cream
  const sun = [246, 189, 96, 255];      // #f6bd60 pastel buttercup
  const hill = [126, 200, 167, 255];    // #7ec8a7 pastel mint

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      let color = bg;

      // Inner rounded-feel paper frame
      if (nx >= 0.16 && nx <= 0.84 && ny >= 0.17 && ny <= 0.83) {
        color = paper;
        // Sun circle
        const dx = nx - 0.36;
        const dy = ny - 0.38;
        if (dx * dx + dy * dy <= 0.08 * 0.08) {
          color = sun;
        }
        // Stylized hills
        const hill1 = 0.72 - Math.max(0, 0.24 - Math.abs(nx - 0.42)) * 0.95;
        const hill2 = 0.72 - Math.max(0, 0.22 - Math.abs(nx - 0.67)) * 0.85;
        if (ny >= Math.min(hill1, hill2) && ny <= 0.75 && nx >= 0.22 && nx <= 0.78) {
          color = hill;
        }
      }

      const idx = rowStart + 1 + x * 4;
      raw[idx] = color[0];
      raw[idx + 1] = color[1];
      raw[idx + 2] = color[2];
      raw[idx + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

const pubDir = path.resolve('public');
fs.mkdirSync(pubDir, { recursive: true });
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), renderIconPng(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), renderIconPng(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), renderIconPng(180));
console.log('Generated PWA PNG icons in public/');
