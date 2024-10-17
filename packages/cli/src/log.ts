import { fsa, FsHttp } from '@chunkd/fs';
import { SourceCache, SourceChunk } from '@chunkd/middleware';
import { Tiff } from '@cogeotiff/core';
import { log } from '@linzjs/tracing';

import { FetchLog } from './fs.js';

// Cache the last 10MB of chunks for reuse
export const sourceCache = new SourceCache({ size: 10 * 1024 * 1024 });
export const sourceChunk = new SourceChunk({ size: 64 * 1024 });
Tiff.DefaultReadSize = sourceChunk.chunkSize;

export function setupLogger(cfg: { verbose?: boolean; extraVerbose?: boolean }): typeof log {
  if (cfg.verbose) {
    log.level = 'debug';
  } else if (cfg.extraVerbose) {
    log.level = 'trace';
  } else {
    log.level = 'warn';
  }

  fsa.register('http://', new FsHttp());
  fsa.register('https://', new FsHttp());

  // Order of these are really important
  // Chunk all requests into 32KB chunks
  fsa.middleware.push(sourceChunk);
  // Cache the last 10MB of chunks for reuse
  fsa.middleware.push(sourceCache);

  fsa.middleware.push(FetchLog);

  return log;
}

export const logger = log;

/** S3 client adds approx 300ms to the cli startup time, so only register it if needed */
export async function ensureS3fs(): Promise<void> {
  if (fsa.systems.find((f) => f.prefix.startsWith('s3'))) return;

  const S3Client = await import('@aws-sdk/client-s3');
  const FsAwsS3 = await import('@chunkd/fs-aws');

  fsa.register('s3://', new FsAwsS3.FsAwsS3(new S3Client.S3Client({})));
}
