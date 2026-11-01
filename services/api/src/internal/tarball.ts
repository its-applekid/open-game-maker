import { gzipSync } from 'node:zlib';

// A deterministic ustar archive (fixed mtime, owner and modes), gzipped: `tar -xzf` in the hook unpacks it.
export function tarGz(files: { path: string; content: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const body = Buffer.from(file.content, 'utf8');
    if (Buffer.byteLength(file.path) > 100) throw new Error(`tar path too long: ${file.path}`);
    const header = Buffer.alloc(512);
    header.write(file.path, 0, 'utf8');
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('        ', 148);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
