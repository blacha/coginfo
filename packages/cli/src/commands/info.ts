import { fsa } from '@chunkd/fs';
import { Tag, TagOffset, Tiff, TiffImage, TiffTag, TiffTagGeo, TiffTagValueType, TiffVersion } from '@cogeotiff/core';
import c from 'ansi-colors';
import { command, flag, option, optional, restPositionals } from 'cmd-ts';

import { ActionUtil, CliResultMap } from '../action.util.js';
import { CliTable, CliTableInfo } from '../cli.table.js';
import { DefaultArgs, Url } from '../common.js';
import { FetchLog } from '../fs.js';
import { ensureS3fs, setupLogger } from '../log.js';
import { TagFormatters, TagGeoFormatters } from '../tags.js';
import { toByteSizeString } from '../util.bytes.js';

function round(num: number): number {
  const opt = 10 ** 4;
  return Math.floor(num * opt) / opt;
}

export const commandInfo = command({
  name: 'info',
  args: {
    ...DefaultArgs,
    path: option({ short: 'f', long: 'file', type: optional(Url) }),
    tags: flag({ short: 't', long: 'tags', description: 'Dump tiff tags' }),
    fetchTags: flag({ long: 'fetch-tags', description: 'Fetch extra tiff tag information' }),
    tileStats: flag({
      long: 'tile-stats',
      description: 'Fetch tile information, like size [this can fetch a lot of data]',
    }),
    paths: restPositionals({ type: Url, description: 'Files to process' }),
  },
  async handler(args) {
    const logger = setupLogger(args);
    const paths = [...args.paths, args.path].filter((f) => f != null) as URL[];

    for (const path of paths) {
      if (path.protocol === 's3:') await ensureS3fs();
      logger.debug('Tiff:load', { path: path?.href });
      FetchLog.reset();

      const source = fsa.source(path);
      const tiff = await new Tiff(source).init();

      if (args.tileStats) {
        await Promise.all(tiff.images.map((img) => img.fetch(TiffTag.TileByteCounts)));
        TiffImageInfoTable.add(tiffTileStats);
      }

      const header = [
        { key: 'Tiff type', value: `${TiffVersion[tiff.version]} (v${String(tiff.version)})` },
        {
          key: 'Bytes read',
          value: `${toByteSizeString(FetchLog.bytesRead)} (${FetchLog.fetches.length} Chunk${
            FetchLog.fetches.length === 1 ? '' : 's'
          })`,
        },
        tiff.source.metadata?.size
          ? {
              key: 'Size',
              value: toByteSizeString(tiff.source.metadata.size),
            }
          : null,
      ];

      const firstImage = tiff.images[0];
      const isGeoLocated = firstImage.isGeoLocated;
      const compression = firstImage.value(TiffTag.Compression);
      const images = [
        { key: 'Compression', value: `${compression} - ${c.magenta(firstImage.compression ?? '??')}` },
        isGeoLocated ? { key: 'Origin', value: firstImage.origin.map(round).join(', ') } : null,
        isGeoLocated ? { key: 'Resolution', value: firstImage.resolution.map(round).join(', ') } : null,
        isGeoLocated ? { key: 'BoundingBox', value: firstImage.bbox.map(round).join(', ') } : null,
        firstImage.epsg
          ? { key: 'EPSG', value: `EPSG:${firstImage.epsg} ${c.underline('https://epsg.io/' + firstImage.epsg)}` }
          : null,
        { key: 'Images', value: '\n' + TiffImageInfoTable.print(tiff.images, '\t').join('\n') },
      ];

      const ghostOptions = [...(tiff.options?.options.entries() ?? [])];
      const gdalMetadata = parseGdalMetadata(firstImage);
      const gdal = [
        {
          key: 'COG optimized',
          value: String(tiff.options?.isCogOptimized),
          enabled: tiff.options?.isCogOptimized === true,
        },
        { key: 'COG broken', value: String(tiff.options?.isBroken), enabled: tiff.options?.isBroken === true },
        {
          key: 'Ghost Options',
          value: '\n' + ghostOptions.map((c) => `\t\t${c[0]} = ${c[1]}`).join('\n'),
          enabled: ghostOptions.length > 0,
        },
        {
          key: 'Metadata',
          value: '\n' + gdalMetadata?.map((c) => `\t\t${c}`).join('\n'),
          enabled: gdalMetadata != null,
        },
      ];

      const result: CliResultMap[] = [
        { keys: header },
        { title: 'Images', keys: images },
        { title: 'GDAL', keys: gdal, enabled: gdal.filter((g) => g.enabled == null || g.enabled).length > 0 },
      ];
      if (args.tags) {
        for (const img of tiff.images) {
          const tiffTags = [...img.tags.values()];

          if (args.fetchTags) await Promise.all(tiffTags.map((t) => img.fetch(t.id)));

          result.push({
            title: `Image: ${img.id} - Tiff tags`,
            keys: tiffTags.map(formatTag),
          });
          await img.loadGeoTiffTags();
          if (img.tagsGeo.size > 0) {
            const tiffTagsGeo = [...img.tagsGeo.entries()];
            const keys = tiffTagsGeo.map(([key, value]) => formatGeoTag(key, value));
            if (keys.length > 0) {
              result.push({ title: `Image: ${img.id} - Geo Tiff tags`, keys });
            }
          }
        }
      }

      const msg = ActionUtil.formatResult(`\n${c.bold('COG File Info')} - ${c.bold(path.href)}`, result);
      console.log(msg.join('\n'));

      await source.close?.();
    }
  },
});

const TiffImageInfoTable = new CliTable<TiffImage>();
TiffImageInfoTable.add({ name: 'Id', width: 4, get: (_i, index) => String(index) });
TiffImageInfoTable.add({ name: 'Size', width: 20, get: (i) => `${i.size.width}x${i.size.height}` });
TiffImageInfoTable.add({
  name: 'Tile Size',
  width: 20,
  get: (i) => `${i.tileSize.width}x${i.tileSize.height}`,
  enabled: (i) => i.isTiled(),
});
TiffImageInfoTable.add({
  name: 'Tile Count',
  width: 20,
  get: (i) => {
    let tileCount = i.tileCount.x * i.tileCount.y;
    const offsets = i.value(TiffTag.TileByteCounts) ?? i.value(TiffTag.TileOffsets);
    if (offsets) tileCount = offsets.length;

    return `${i.tileCount.x}x${i.tileCount.y} (${tileCount})`;
  },
  enabled: (i) => i.isTiled(),
});
TiffImageInfoTable.add({
  name: 'Strip Count',
  width: 20,
  get: (i) => `${i.tags.get(TiffTag.StripOffsets)?.count}`,
  enabled: (i) => !i.isTiled(),
});
TiffImageInfoTable.add({
  name: 'Resolution',
  width: 20,
  get: (i) => `${round(i.resolution[0])}`,
  enabled: (i) => i.isGeoLocated,
});

// Show compression only if it varies between images
TiffImageInfoTable.add({
  name: 'Compression',
  width: 20,
  get: (i) => i.compression,
  enabled: (i) => {
    const formats = new Set();
    i.tiff.images.forEach((f) => formats.add(f.compression));
    return formats.size > 1;
  },
});

export const tiffTileStats: CliTableInfo<TiffImage> = {
  name: 'Tile Stats',
  width: 20,
  get: (i) => {
    const sizes = i.value(TiffTag.TileByteCounts);
    if (sizes == null) return 'N/A';

    const stats = {
      size: 0,
      empty: 0,
    };
    for (const st of sizes) {
      if (st === 0) stats.empty++;
      stats.size += st;
    }
    const empty = stats.empty > 0 ? ` (${c.blue('empty')}: ${stats.empty})` : '';

    const avg = stats.size / (sizes.length - stats.empty);
    return toByteSizeString(stats.size) + ` (${c.blue('avg:')} ${toByteSizeString(avg)})` + empty;
  },
  enabled: () => true,
};

/**
 * Parse out the GDAL Metadata to be more friendly to read
 *
 * TODO using a XML Parser will make this even better
 * @param img
 */
function parseGdalMetadata(img: TiffImage): string[] | null {
  const metadata = img.value(TiffTag.GdalMetadata);
  if (typeof metadata !== 'string') return null;
  if (!metadata.startsWith('<GDALMetadata>')) return null;
  return metadata
    .replace('<GDALMetadata>\n', '')
    .replace('</GDALMetadata>\n', '')
    .replace('\n\x00', '')
    .split('\n')
    .map((c) => c.trim());
}

function formatTag(tag: Tag): { key: string; value: string } {
  const tagName = TiffTag[tag.id];
  const tagDebug = `(${TiffTagValueType[tag.dataType]}${tag.count > 1 ? ' x' + tag.count : ''}`;
  const key = `${c.dim(String(tag.id)).padEnd(7, ' ')} ${String(tagName)} ${c.dim(tagDebug)})`.padEnd(52, ' ');

  let complexType = '';
  // Array of values that is not a string!
  if (tag.count > 1 && tag.dataType !== TiffTagValueType.Ascii) {
    if (tag.value == null || (tag as TagOffset).isLoaded === false) {
      return { key, value: c.dim('Tag not Loaded, use --fetch-tags to force load') };
    }
    const val = [...(tag.value as number[])]; // Ensure the value is not a TypedArray
    if (TagFormatters[tag.id]) {
      complexType = ` - ${c.magenta(TagFormatters[tag.id](val) ?? '??')}`;
    }
    return { key, value: (val.length > 25 ? val.slice(0, 25).join(', ') + '...' : val.join(', ')) + complexType };
  }

  let tagString = JSON.stringify(tag.value) ?? c.dim('null');
  if (tagString.length > 256) tagString = tagString.slice(0, 250) + '...';
  if (TagFormatters[tag.id]) {
    complexType = ` - ${c.magenta(TagFormatters[tag.id]([tag.value as unknown as number]) ?? '??')}`;
  }
  return { key, value: tagString + complexType };
}

function formatGeoTag(tagId: TiffTagGeo, value: string | number | number[]): { key: string; value: string } {
  const tagName = TiffTagGeo[tagId];
  const key = `${c.dim(String(tagId)).padEnd(7, ' ')} ${String(tagName).padEnd(30)}`;

  let complexType = '';
  if (TagGeoFormatters[tagId]) {
    complexType = ` - ${c.magenta(TagGeoFormatters[tagId]([value as unknown as number]) ?? '??')}`;
  }

  let tagString = JSON.stringify(value) ?? c.dim('null');
  if (tagString.length > 256) tagString = tagString.slice(0, 250) + '...';
  return { key, value: tagString + complexType };
}
