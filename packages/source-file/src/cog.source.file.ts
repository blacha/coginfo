import { promises as fs } from 'fs';
import { basename } from 'path';
import { CogSource, CogTiff } from '@cogeotiff/core';

const SourceType = 'file';

export class CogSourceFile extends CogSource {
    type = SourceType;

    static DEFAULT_CHUNK_SIZE = 16 * 1024;
    chunkSize: number;

    fileName: string;
    fd: Promise<fs.FileHandle> | null = null;

    /** Automatically close the file descriptor after reading */
    closeAfterRead = false;

    static isSource(source: CogSource): source is CogSourceFile {
        return source.type === SourceType;
    }
    /**
     * Create and initialize a COG from a file path
     *
     * @param filePath location of the cog
     */
    static async create(filePath: string): Promise<CogTiff> {
        return new CogTiff(new CogSourceFile(filePath)).init();
    }

    constructor(fileName: string) {
        super();
        this.fileName = fileName;
        this.chunkSize = CogSourceFile.DEFAULT_CHUNK_SIZE;
    }

    /** Close the file handle */
    async close(): Promise<void> {
        const fd = await this.fd;
        if (fd == null) return;
        await fd.close();
        this.fd = null;
    }

    get name() {
        return basename(this.fileName);
    }

    async fetchBytes(offset: number, length: number): Promise<ArrayBuffer> {
        if (this.fd == null) {
            this.fd = fs.open(this.fileName, 'r');
        }
        const fd = await this.fd;
        const { buffer } = await fd.read(Buffer.allocUnsafe(length), 0, length, offset);
        if (this.closeAfterRead) await this.close();
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
}
