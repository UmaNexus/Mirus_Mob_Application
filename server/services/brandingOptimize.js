import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Downscale/compress company branding images at upload time so PDF generation
 * does not embed multi‑MB scans on every offer/appointment letter.
 */

const LIMITS = {
  letterOutline: { maxW: 1240, maxH: 1754, jpegQuality: 82, preferJpeg: true },
  letterhead: { maxW: 1600, maxH: 420, jpegQuality: 85, preferJpeg: true },
  logo: { maxW: 800, maxH: 800, pngCompression: 9, preferJpeg: false },
  stamp: { maxW: 400, maxH: 400, pngCompression: 9, preferJpeg: false },
  logoWithStamp: { maxW: 500, maxH: 500, pngCompression: 9, preferJpeg: false },
  signature: { maxW: 600, maxH: 240, pngCompression: 9, preferJpeg: false }
};

const DEFAULT_LIMIT = { maxW: 1200, maxH: 1200, jpegQuality: 85, preferJpeg: false };

/**
 * Optimize an uploaded image on disk. PDFs are left unchanged.
 * May rewrite the file and change extension (.png → .jpg for large opaque pages).
 *
 * @param {string} absPath absolute path written by multer
 * @param {string} kind branding kind (letterOutline, logo, …)
 * @returns {Promise<{ absPath: string, filename: string, bytes: number }>}
 */
export const optimizeCompanyBrandingFile = async (absPath, kind) => {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.pdf') {
    const st = await fsp.stat(absPath);
    return { absPath, filename: path.basename(absPath), bytes: st.size };
  }
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const st = await fsp.stat(absPath);
    return { absPath, filename: path.basename(absPath), bytes: st.size };
  }

  const limits = LIMITS[kind] || DEFAULT_LIMIT;
  const input = await fsp.readFile(absPath);
  // Skip tiny files
  if (input.length < 80_000) {
    return { absPath, filename: path.basename(absPath), bytes: input.length };
  }

  let pipeline = sharp(input, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);

  pipeline = pipeline.resize({
    width: limits.maxW,
    height: limits.maxH,
    fit: 'inside',
    withoutEnlargement: true
  });

  const dir = path.dirname(absPath);
  const base = path.basename(absPath, ext);
  let outBuf;
  let outPath = absPath;

  if (limits.preferJpeg && !hasAlpha) {
    outBuf = await pipeline.jpeg({ quality: limits.jpegQuality ?? 82, mozjpeg: true }).toBuffer();
    outPath = path.join(dir, `${base}.jpg`);
  } else if (ext === '.jpg' || ext === '.jpeg') {
    outBuf = await pipeline.jpeg({ quality: limits.jpegQuality ?? 85, mozjpeg: true }).toBuffer();
  } else {
    outBuf = await pipeline.png({ compressionLevel: limits.pngCompression ?? 9, palette: true }).toBuffer();
    // If PNG is still huge and has no alpha, fall back to JPEG.
    if (outBuf.length > 500_000 && !hasAlpha) {
      outBuf = await sharp(input, { failOn: 'none' })
        .rotate()
        .resize({
          width: limits.maxW,
          height: limits.maxH,
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      outPath = path.join(dir, `${base}.jpg`);
    }
  }

  // Only replace if we actually shrank (or changed format).
  if (outBuf.length < input.length || outPath !== absPath) {
    await fsp.writeFile(outPath, outBuf);
    if (outPath !== absPath) {
      try { await fsp.unlink(absPath); } catch { /* ignore */ }
    }
    return { absPath: outPath, filename: path.basename(outPath), bytes: outBuf.length };
  }

  return { absPath, filename: path.basename(absPath), bytes: input.length };
};

/**
 * Downscale large images in-memory for PDF embedding (helps already-uploaded assets).
 * @returns {Promise<{ bytes: Buffer, format: 'png'|'jpg' }>}
 */
export const downscaleForPdfEmbed = async (absPath, bytes) => {
  const lower = String(absPath || '').toLowerCase();
  if (!/\.(png|jpe?g|webp)$/.test(lower)) {
    return { bytes, format: lower.endsWith('.png') ? 'png' : 'jpg' };
  }
  // Only touch large files
  if (!bytes || bytes.length < 350_000) {
    return { bytes, format: lower.endsWith('.png') ? 'png' : 'jpg' };
  }

  try {
    const img = sharp(bytes, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    const isOutlineLike = meta.width >= 1000 || meta.height >= 1000 || bytes.length > 800_000;
    const maxW = isOutlineLike ? 1240 : 800;
    const maxH = isOutlineLike ? 1754 : 800;
    const resized = img.resize({
      width: maxW,
      height: maxH,
      fit: 'inside',
      withoutEnlargement: true
    });

    if (!meta.hasAlpha || isOutlineLike) {
      const out = await resized.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      return { bytes: out, format: 'jpg' };
    }
    const out = await resized.png({ compressionLevel: 9 }).toBuffer();
    return { bytes: out, format: 'png' };
  } catch {
    return { bytes, format: lower.endsWith('.png') ? 'png' : 'jpg' };
  }
};
