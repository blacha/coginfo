import { CogLogger, CogTiff, TiffMimeType } from '@cogeotiff/core';
import { promises as fs } from 'fs';
import * as path from 'path';

const FileExtension: { [key: string]: string } = {
    [TiffMimeType.JPEG]: 'jpeg',
    [TiffMimeType.JP2]: 'jp2',
    [TiffMimeType.WEBP]: 'webp',
    [TiffMimeType.LZW]: 'lzw',
    [TiffMimeType.DEFLATE]: 'deflate',
};

/**
 * Get a human readable tile name
 *
 * @param mimeType image type of tile @see FileExtension
 * @param zoom Zoom level
 * @param x Tile X
 * @param y Tile Y
 *
 * @returns tile name eg `001_002_z12.png`
 */
export function getTileName(mimeType: string, zoom: number, x: number, y: number) {
    const xS = `${x}`.padStart(3, '0');
    const yS = `${y}`.padStart(3, '0');

    const fileExt: string = FileExtension[mimeType];
    if (fileExt == null) {
        throw new Error(`Unable to process tile type:${mimeType}`);
    }

    return `${xS}_${yS}_z${zoom}.${fileExt}`;
}

export async function writeTile(
    tif: CogTiff,
    x: number,
    y: number,
    zoom: number,
    outputPath: string,
    logger: CogLogger,
) {
    const tile = await tif.getTileRaw(x, y, zoom);
    if (tile == null) {
        logger.error('Unable to write file, missing data..');
        return;
    }
    const fileName = getTileName(tile.mimeType, zoom, x, y);
    await fs.writeFile(path.join(outputPath, fileName), tile.bytes);
    logger.debug({ fileName }, 'WriteFile');
}
