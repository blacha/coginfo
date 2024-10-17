import { getCompressionMimeType, TiffCompressionMimeType, TiffMimeType } from './const/tiff.mime.js';
import {
  Compression,
  ModelTypeCode,
  SubFileType,
  TiffTag,
  TiffTagGeo,
  TiffTagGeoType,
  TiffTagType,
} from './const/tiff.tag.id.js';
import { fetchAllOffsets, fetchLazy, getOffsetValueAt, getOffsetValueAtSync } from './read/tiff.tag.factory.js';
import { Tag, TagInline, TagOffset } from './read/tiff.tag.js';
import { Tiff } from './tiff.js';
import { getUint } from './util/bytes.js';
import { BoundingBox, Size } from './vector.js';

/** Invalid EPSG code */
export const InvalidProjectionCode = 32767;

/**
 * Number of tiles used inside this image
 */
export interface TiffImageTileCount {
  /** Number of tiles on the x axis */
  x: number;
  /** Number of tiles on the y axis */
  y: number;
}

/** Tags that are commonly accessed for geotiffs */
export const ImportantTags = new Set([
  TiffTag.Compression,
  TiffTag.ImageHeight,
  TiffTag.ImageWidth,
  TiffTag.ModelPixelScale,
  TiffTag.ModelTiePoint,
  TiffTag.ModelTransformation,
  TiffTag.TileHeight,
  TiffTag.TileWidth,
  TiffTag.GeoKeyDirectory,
  TiffTag.GeoAsciiParams,
  TiffTag.GeoDoubleParams,
  TiffTag.TileOffsets,
]);

/**
 * Size of a individual tile
 */
export interface TiffImageTileSize {
  /** Tile width (pixels) */
  width: number;
  /** Tile height (pixels) */
  height: number;
}

export class TiffImage {
  /**
   * Id of the tif image, generally the image index inside the tif
   * where 0 is the root image, and every sub image is +1
   *
   * @example 0, 1, 2
   */
  id: number;
  /** Reference to the TIFF that owns this image */
  tiff: Tiff;
  /** Has loadGeoTiffTags been called */
  isGeoTagsLoaded = false;
  /** Sub tags stored in TiffTag.GeoKeyDirectory */
  tagsGeo: Map<TiffTagGeo, string | number | number[]> = new Map();
  /** All IFD tags that have been read for the image */
  tags: Map<TiffTag, Tag>;

  constructor(tiff: Tiff, id: number, tags: Map<TiffTag, Tag>) {
    this.tiff = tiff;
    this.id = id;
    this.tags = tags;
  }

  /**
   * Force loading of important tags if they have not already been loaded
   *
   * @param loadGeoTags Whether to load the GeoKeyDirectory and unpack it
   */
  async init(loadGeoTags = true): Promise<void> {
    const requiredTags: Promise<unknown>[] = [
      this.fetch(TiffTag.Compression),
      this.fetch(TiffTag.ImageHeight),
      this.fetch(TiffTag.ImageWidth),
      this.fetch(TiffTag.ModelPixelScale),
      this.fetch(TiffTag.ModelTiePoint),
      this.fetch(TiffTag.ModelTransformation),
      this.fetch(TiffTag.TileHeight),
      this.fetch(TiffTag.TileWidth),
    ];

    if (loadGeoTags) {
      requiredTags.push(this.fetch(TiffTag.GeoKeyDirectory));
      requiredTags.push(this.fetch(TiffTag.GeoAsciiParams));
      requiredTags.push(this.fetch(TiffTag.GeoDoubleParams));
    }

    await Promise.all(requiredTags);
    if (loadGeoTags) await this.loadGeoTiffTags();
  }

  /**
   * Get the value of a TiffTag if it has been loaded, null otherwise.
   *
   * If the value is not loaded use {@link TiffImage.fetch} to load the value
   * Or use {@link TiffImage.has} to check if the tag exists
   *
   *
   * @returns value if loaded, null otherwise
   */
  value<T extends keyof TiffTagType>(tag: T): TiffTagType[T] | null {
    const sourceTag = this.tags.get(tag);
    if (sourceTag == null) return null;
    if (sourceTag.type === 'offset' && sourceTag.isLoaded === false) return null;
    // TODO would be good to type check this
    return sourceTag.value as TiffTagType[T];
  }

  /**
   * Does the tag exist
   *
   * @example
   * ```typescript
   * img.has(TiffTag.ImageWidth) // true
   * ```
   *
   * @param tag Tag to check
   * @returns true if the tag exists, false otherwise
   */
  has<T extends keyof TiffTagType>(tag: T): boolean {
    return this.tags.has(tag);
  }

  /**
   * Load a tag.
   *
   * If it is not currently loaded, fetch the required data for the tag.
   *
   * @example
   * ```typescript
   * await img.fetch(TiffTag.ImageWidth) // 512 (px)
   * ```
   *
   * @param tag tag to fetch
   */
  public async fetch<T extends keyof TiffTagType>(tag: T): Promise<TiffTagType[T] | null> {
    const sourceTag = this.tags.get(tag);
    if (sourceTag == null) return null;
    if (sourceTag.type === 'inline') return sourceTag.value as TiffTagType[T];
    if (sourceTag.type === 'lazy') return fetchLazy(sourceTag, this.tiff) as Promise<TiffTagType[T]>;
    if (sourceTag.isLoaded) return sourceTag.value as TiffTagType[T];
    if (sourceTag.type === 'offset') return fetchAllOffsets(this.tiff, sourceTag) as Promise<TiffTagType[T]>;
    throw new Error('Cannot fetch:' + tag);
  }
  /**
   * Get the associated TiffTagGeo
   *
   * @example
   * ```typescript
   * image.valueGeo(TiffTagGeo.GTRasterTypeGeoKey)
   * ```
   * @throws if {@link loadGeoTiffTags} has not been called
   */
  valueGeo<T extends keyof TiffTagGeoType>(tag: T): TiffTagGeoType[T] | null {
    if (this.isGeoTagsLoaded === false) throw new Error('loadGeoTiffTags() has not been called');
    return this.tagsGeo.get(tag) as TiffTagGeoType[T];
  }

  /**
   * Load and parse the GDAL_NODATA Tifftag
   *
   * @throws if the tag is not loaded
   * @returns null if the tag does not exist
   */
  get noData(): number | null {
    const tag = this.tags.get(TiffTag.GdalNoData);
    if (tag == null) return null;
    if (tag.value) return Number(tag.value);
    throw new Error('GdalNoData tag is not loaded');
  }

  /**
   * Load and unpack the GeoKeyDirectory
   *
   * @see {TiffTag.GeoKeyDirectory}
   */
  async loadGeoTiffTags(): Promise<void> {
    // Already loaded
    if (this.isGeoTagsLoaded) return;
    const sourceTag = this.tags.get(TiffTag.GeoKeyDirectory);
    if (sourceTag == null) {
      this.isGeoTagsLoaded = true;
      return;
    }
    if (sourceTag.type === 'lazy' && sourceTag.value == null) {
      // Load all the required keys
      await Promise.all([
        this.fetch(TiffTag.GeoKeyDirectory),
        this.fetch(TiffTag.GeoAsciiParams),
        this.fetch(TiffTag.GeoDoubleParams),
      ]);
    }
    this.isGeoTagsLoaded = true;
    if (sourceTag.value == null) return;
    const geoTags = sourceTag.value as Uint16Array;
    if (typeof geoTags === 'number') throw new Error('Invalid geo tags found');

    for (let i = 4; i <= geoTags[3] * 4; i += 4) {
      const key = geoTags[i] as TiffTagGeo;
      const locationTagId = geoTags[i + 1];

      const offset = geoTags[i + 3];

      if (locationTagId === 0) {
        this.tagsGeo.set(key, offset);
        continue;
      }

      const tag = this.tags.get(locationTagId);
      if (tag == null || tag.value == null) continue;
      const count = geoTags[i + 2];
      if (typeof tag.value === 'string') {
        this.tagsGeo.set(key, tag.value.slice(offset, offset + count - 1).trim());
      } else if (Array.isArray(tag.value)) {
        if (count === 1) this.tagsGeo.set(key, tag.value[offset] as string);
        else this.tagsGeo.set(key, tag.value.slice(offset, offset + count));
      } else {
        throw new Error('Failed to extract GeoTiffTags');
      }
    }
  }

  /**
   * Get the origin point for the image
   *
   * @returns origin point of the image
   */
  get origin(): [number, number, number] {
    const tiePoints = this.value(TiffTag.ModelTiePoint);
    if (tiePoints != null && tiePoints.length === 6) {
      return [tiePoints[3], tiePoints[4], tiePoints[5]];
    }

    const modelTransformation = this.value(TiffTag.ModelTransformation);
    if (modelTransformation != null) {
      return [modelTransformation[3], modelTransformation[7], modelTransformation[11]];
    }

    // If this is a sub image, use the origin from the top level image
    if (this.value(TiffTag.SubFileType) === SubFileType.ReducedImage && this.id !== 0) {
      return this.tiff.images[0].origin;
    }

    throw new Error('Image does not have a geo transformation.');
  }

  /** Is there enough geo information on this image to figure out where its actually located */
  get isGeoLocated(): boolean {
    const isImageLocated =
      this.value(TiffTag.ModelPixelScale) != null || this.value(TiffTag.ModelTransformation) != null;
    if (isImageLocated) return true;
    // If this is a sub image, use the isGeoLocated from the top level image
    if (this.isSubImage && this.id !== 0) return this.tiff.images[0].isGeoLocated;
    return false;
  }

  /**
   * Get the resolution of the image
   *
   * @returns [x,y,z] pixel scale
   */
  get resolution(): [number, number, number] {
    const modelPixelScale: number[] | null = this.value(TiffTag.ModelPixelScale);
    if (modelPixelScale != null) {
      return [modelPixelScale[0], -modelPixelScale[1], modelPixelScale[2]];
    }
    const modelTransformation: number[] | null = this.value(TiffTag.ModelTransformation);
    if (modelTransformation != null) {
      return [modelTransformation[0], modelTransformation[5], modelTransformation[10]];
    }

    // If this is a sub image, use the resolution from the top level image
    if (this.isSubImage && this.id !== 0) {
      const firstImg = this.tiff.images[0];
      const [resX, resY, resZ] = firstImg.resolution;
      const firstImgSize = firstImg.size;
      const imgSize = this.size;
      // scale resolution based on the size difference between the two images
      return [(resX * firstImgSize.width) / imgSize.width, (resY * firstImgSize.height) / imgSize.height, resZ];
    }

    throw new Error('Image does not have a geo transformation.');
  }

  /**
   * Is this image a reduced size image
   * @see {@link TiffTag.SubFileType}
   * @returns true if SubFileType is Reduces image, false otherwise
   */
  get isSubImage(): boolean {
    return this.value(TiffTag.SubFileType) === SubFileType.ReducedImage;
  }

  /**
   * Bounding box of the image
   *
   * @returns [minX, minY, maxX, maxY] bounding box
   */
  get bbox(): [number, number, number, number] {
    const size = this.size;
    const origin = this.origin;
    const resolution = this.resolution;

    if (origin == null || size == null || resolution == null) {
      throw new Error('Unable to calculate bounding box');
    }

    const x1 = origin[0];
    const y1 = origin[1];

    const x2 = x1 + resolution[0] * size.width;
    const y2 = y1 + resolution[1] * size.height;

    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  }

  /**
   * Get the compression used by the tile
   *
   * @see {@link TiffCompressionMimeType}
   *
   * @returns Compression type eg webp
   */
  get compression(): TiffMimeType | null {
    const compression = this.value(TiffTag.Compression);
    if (compression == null) return null;
    return TiffCompressionMimeType[compression];
  }

  /**
   * Attempt to read the EPSG Code from TiffGeoTags
   *
   * looks at TiffTagGeo.ProjectionGeoKey, TiffTagGeo.ProjectedCRSGeoKey and TiffTagGeo.GeodeticCRSGeoKey
   *
   * @returns EPSG Code if it exists and is not user defined.
   */
  get epsg(): number | null {
    const proj = this.valueGeo(TiffTagGeo.ProjectionGeoKey);
    if (proj != null && proj !== InvalidProjectionCode) return proj;

    let projection: number | null = null;
    switch (this.valueGeo(TiffTagGeo.GTModelTypeGeoKey)) {
      case ModelTypeCode.Unknown:
        return null;
      case ModelTypeCode.Projected:
        projection = this.valueGeo(TiffTagGeo.ProjectedCRSGeoKey);
        break;
      case ModelTypeCode.Geographic:
        projection = this.valueGeo(TiffTagGeo.GeodeticCRSGeoKey);
        break;
      case ModelTypeCode.Geocentric:
        projection = this.valueGeo(TiffTagGeo.GeodeticCRSGeoKey);
        break;
      case ModelTypeCode.UserDefined:
        return null;
    }
    if (projection === InvalidProjectionCode) return null;
    return projection;
  }

  /**
   * Get the size of the image
   *
   * @returns Size in pixels
   */
  get size(): Size {
    const width = this.value(TiffTag.ImageWidth);
    const height = this.value(TiffTag.ImageHeight);
    if (width == null || height == null) throw new Error('Tiff has no height or width');

    return { width, height };
  }

  /**
   * Determine if this image is tiled
   */
  public isTiled(): boolean {
    return this.value(TiffTag.TileWidth) !== null;
  }

  /**
   * Get size of individual tiles
   */
  get tileSize(): TiffImageTileSize {
    const width = this.value(TiffTag.TileWidth);
    const height = this.value(TiffTag.TileHeight);
    if (width == null || height == null) throw new Error('Tiff is not tiled');
    return { width, height };
  }

  /**
   * Number of tiles used to create this image
   */
  get tileCount(): TiffImageTileCount {
    const size = this.size;
    const tileSize = this.tileSize;
    const x = Math.ceil(size.width / tileSize.width);
    const y = Math.ceil(size.height / tileSize.height);
    return { x, y };
  }

  /**
   * Get the pointer to where the tiles start in the Tiff file
   *
   * @remarks Used to read tiled tiffs
   *
   * @returns file offset to where the tiffs are stored
   */
  get tileOffset(): TagOffset | TagInline<number[]> {
    const tileOffset = this.tags.get(TiffTag.TileOffsets) as TagOffset;
    if (tileOffset == null) throw new Error('No tile offsets found');
    return tileOffset;
  }

  /**
   * Get the number of strip's inside this tiff
   *
   * @remarks Used to read striped tiffs
   *
   * @returns number of strips present
   */
  get stripCount(): number {
    return this.tags.get(TiffTag.StripByteCounts)?.count ?? 0;
  }

  // Clamp the bounds of the output image to the size of the image, as sometimes the edge tiles are not full tiles
  getTileBounds(x: number, y: number): BoundingBox {
    const { size, tileSize } = this;
    const top = y * tileSize.height;
    const left = x * tileSize.width;
    const width = left + tileSize.width >= size.width ? size.width - left : tileSize.width;
    const height = top + tileSize.height >= size.height ? size.height - top : tileSize.height;
    return { x: left, y: top, width, height };
  }

  /**
   * Read a strip into a ArrayBuffer
   *
   * Image has to be striped see {@link stripCount}
   *
   * @param index Strip index to read
   */
  async getStrip(index: number): Promise<{ mimeType: TiffMimeType; bytes: ArrayBuffer } | null> {
    if (this.isTiled()) throw new Error('Cannot read stripes, tiff is tiled: ' + index);

    const byteCounts = this.tags.get(TiffTag.StripByteCounts) as TagOffset;
    const offsets = this.tags.get(TiffTag.StripOffsets) as TagOffset;

    if (index >= byteCounts.count) throw new Error('Cannot read strip, index out of bounds');

    const [byteCount, offset] = await Promise.all([
      getOffset(this.tiff, offsets, index),
      getOffset(this.tiff, byteCounts, index),
    ]);
    return this.getBytes(byteCount, offset);
  }

  /** The jpeg header is stored in the IFD, read the JPEG header and adjust the byte array to include it */
  getJpegHeader(bytes: ArrayBuffer): ArrayBuffer {
    // Both the JPEGTable and the Bytes with have the start of image and end of image markers
    // StartOfImage 0xffd8 EndOfImage 0xffd9
    const tables = this.value(TiffTag.JpegTables);
    if (tables == null) throw new Error('Unable to find Jpeg header');

    // Remove EndOfImage marker
    const tableData = tables.slice(0, tables.length - 2);
    const actualBytes = new Uint8Array(bytes.byteLength + tableData.length - 2);
    actualBytes.set(tableData, 0);
    actualBytes.set(new Uint8Array(bytes).slice(2), tableData.length);
    return actualBytes;
  }

  /** Read image bytes at the given offset */
  async getBytes(
    offset: number,
    byteCount: number,
  ): Promise<{ mimeType: TiffMimeType; bytes: ArrayBuffer; compression: Compression } | null> {
    if (byteCount === 0) return null;

    const bytes = await this.tiff.source.fetch(offset, byteCount);
    if (bytes.byteLength < byteCount) {
      throw new Error(`Failed to fetch bytes from offset:${offset} wanted:${byteCount} got:${bytes.byteLength}`);
    }

    let compression = this.value(TiffTag.Compression);
    if (compression == null) compression = Compression.None; // No compression found default ??
    const mimeType = getCompressionMimeType(compression) ?? TiffMimeType.None;

    if (compression === Compression.Jpeg) return { mimeType, bytes: this.getJpegHeader(bytes), compression };
    return { mimeType, bytes, compression };
  }

  /**
   * Load a tile into a ArrayBuffer
   *
   * if the tile compression is JPEG, This will also apply the JPEG compression tables to the resulting ArrayBuffer see {@link getJpegHeader}
   *
   * @param x Tile x offset
   * @param y Tile y offset
   */
  async getTile(
    x: number,
    y: number,
  ): Promise<{ mimeType: TiffMimeType; bytes: ArrayBuffer; compression: Compression } | null> {
    const size = this.size;
    const tiles = this.tileSize;

    if (tiles == null) throw new Error('Tiff is not tiled');

    // TODO support GhostOptionTileOrder
    const nyTiles = Math.ceil(size.height / tiles.height);
    const nxTiles = Math.ceil(size.width / tiles.width);

    if (x >= nxTiles || y >= nyTiles) {
      throw new Error(`Tile index is outside of range x:${x} >= ${nxTiles} or y:${y} >= ${nyTiles}`);
    }

    const idx = y * nxTiles + x;
    const totalTiles = nxTiles * nyTiles;
    if (idx >= totalTiles) throw new Error(`Tile index is outside of tile range: ${idx} >= ${totalTiles}`);

    const { offset, imageSize } = await this.getTileSize(idx);

    return this.getBytes(offset, imageSize);
  }

  /**
   * Does this tile exist in the tiff and does it actually have a value
   *
   * Sparse tiffs can have a lot of empty tiles, they set the tile size to `0 bytes` when the tile is empty
   * this checks the tile byte size to validate if it actually has any data.
   *
   * @param x Tile x offset
   * @param y Tile y offset
   *
   * @returns if the tile exists and has data
   */
  async hasTile(x: number, y: number): Promise<boolean> {
    const tiles = this.tileSize;
    const size = this.size;

    if (tiles == null) throw new Error('Tiff is not tiled');

    // TODO support GhostOptionTileOrder
    const nyTiles = Math.ceil(size.height / tiles.height);
    const nxTiles = Math.ceil(size.width / tiles.width);
    if (x >= nxTiles || y >= nyTiles) return false;
    const idx = y * nxTiles + x;
    const ret = await this.getTileSize(idx);
    return ret.offset > 0;
  }

  /**
   * Load the offset and byteCount of a tile
   * @param index index in the tile array
   * @returns Offset and byteCount for the tile
   */
  async getTileSize(index: number): Promise<{ offset: number; imageSize: number }> {
    const byteCounts = this.tags.get(TiffTag.TileByteCounts) as TagOffset | TagInline<number[]>;
    if (byteCounts == null) throw new Error('No tile byte counts found, is the tiff tiled?');

    const tileOffsets = this.tileOffset;

    // If the tag has the data already loaded just read the values
    const imageSizeSync = getOffsetSync(this.tiff, byteCounts, index);
    const syncOffset = getOffsetSync(this.tiff, tileOffsets, index);
    if (imageSizeSync != null && syncOffset != null) return { offset: syncOffset, imageSize: imageSizeSync };

    // GDAL optimizes tiles by storing the size of the tile in
    // the few bytes leading up to the tile
    const leaderBytes = this.tiff.options?.tileLeaderByteSize;
    if (leaderBytes) {
      const offset = imageSizeSync ?? (await getOffset(this.tiff, tileOffsets, index));
      // Sparse tiff no data found
      if (offset === 0) return { offset: 0, imageSize: 0 };

      // If the byteSizes array already been loaded
      if (imageSizeSync !== null) return { offset, imageSize: imageSizeSync };

      // This fetch will generally load in the bytes needed for the image too
      // provided the image size is less than the size of a chunk
      const bytes = await this.tiff.source.fetch(offset - leaderBytes, leaderBytes);
      const imageSize = getUint(new DataView(bytes), 0, leaderBytes, this.tiff.isLittleEndian);
      byteCounts.value[index] = imageSize;
      return { offset, imageSize };
    }

    const [offset, imageSize] = await Promise.all([
      syncOffset ?? getOffset(this.tiff, tileOffsets, index),
      imageSizeSync ?? getOffset(this.tiff, byteCounts, index),
    ]);
    return { offset, imageSize };
  }
}

function getOffset(tiff: Tiff, x: TagOffset | TagInline<number[]>, index: number): number | Promise<number> {
  if (index < 0) {
    throw new Error(`Tiff: ${tiff.source.url.href} out of bounds ${TiffTag[x.id]} index:${index} total:${x.count}`);
  }
  // Sparse tiffs may not have the full tileWidth * tileHeight in their offset arrays
  if (index >= x.count) return 0;
  if (x.type === 'inline') return x.value[index];
  return getOffsetValueAt(tiff, x, index);
}

function getOffsetSync(tiff: Tiff, x: TagOffset | TagInline<number[]>, index: number): number | null {
  if (x.type === 'offset') return getOffsetValueAtSync(tiff, x, index);
  if (index > x.count) return 0;
  return x.value[index];
}
