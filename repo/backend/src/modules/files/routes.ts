import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware.js';
import { db } from '../../app/container.js';
import { config } from '../../app/config.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/app-errors.js';

export const filesRouter = Router();
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

async function computeDHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col] ?? 0;
      const right = data[row * 9 + col + 1] ?? 0;
      bits += left > right ? '1' : '0';
    }
  }

  let hash = '';
  for (let i = 0; i < 64; i += 4) {
    hash += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hash.padStart(16, '0');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG files are allowed'));
    }
  },
});

filesRouter.post(
  '/',
  authenticate,
  requirePermission('write', 'after-sales'),
  upload.single('file'),
  async (req, res, next) => {
  try {
    if (!req.file) {
      next(new ValidationError('No file uploaded'));
      return;
    }

    const normalized = sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
    const metadata = await normalized.metadata();

    let output: Buffer;
    let mimeType: string;
    let extension: string;
    if (metadata.format === 'png') {
      output = await normalized.png({ compressionLevel: 9 }).toBuffer();
      mimeType = 'image/png';
      extension = 'png';
    } else {
      output = await normalized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      mimeType = 'image/jpeg';
      extension = 'jpg';
    }

    const perceptualHash = await computeDHash(output);
    const duplicateHashes = await db.perceptualHash.findMany({
      where: { hashValue: perceptualHash, algorithm: 'dhash' },
      include: {
        fileAsset: {
          include: { uploadedBy: { select: { orgId: true } } },
        },
      },
    });

    const hasScopedDuplicate = duplicateHashes.some((candidate) => {
      if (!req.user!.orgId) return true;
      return candidate.fileAsset.uploadedBy.orgId === req.user!.orgId;
    });
    if (hasScopedDuplicate) {
      throw new ConflictError('A visually similar image is already uploaded');
    }

    mkdirSync(config.STORAGE_PATH, { recursive: true });
    const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
    const storagePath = path.join(config.STORAGE_PATH, fileName);
    await writeFile(storagePath, output);

    const asset = await db.fileAsset.create({
      data: {
        originalName: req.file.originalname,
        storagePath,
        mimeType,
        sizeBytes: output.length,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        perceptualHash,
        uploadedByUserId: req.user!.userId,
        perceptualHashes: {
          create: [{ hashValue: perceptualHash, algorithm: 'dhash' }],
        },
      },
    });
    res.status(201).json({
      success: true,
      data: { id: asset.id, originalName: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes },
    });
  } catch (err) { next(err); }
});

filesRouter.get('/:id', authenticate, requirePermission('read', 'after-sales'), async (req, res, next) => {
  try {
    const asset = await db.fileAsset.findUnique({
      where: { id: req.params.id },
      include: { uploadedBy: { select: { orgId: true } } },
    });
    if (!asset) throw new NotFoundError('File not found');
    const isAdministrator = req.user!.roles.includes('Administrator');
    if (!isAdministrator && req.user!.orgId && asset.uploadedBy.orgId !== req.user!.orgId) {
      throw new NotFoundError('File not found');
    }
    if (!existsSync(asset.storagePath)) throw new NotFoundError('File not found');

    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${asset.originalName}"`);
    createReadStream(asset.storagePath).pipe(res);
  } catch (err) { next(err); }
});

filesRouter.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(new ValidationError('File exceeds maximum upload size', {
        file: [`Maximum allowed size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB`],
      }));
      return;
    }

    next(new ValidationError('File upload validation failed', {
      file: [err.message],
    }));
    return;
  }

  next(err);
});
