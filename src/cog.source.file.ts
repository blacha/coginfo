import { promises as fs } from 'fs';
import { CogSource } from './cog.source'
import { toHexString } from './util.hex';
import { basename } from 'path';

export class CogSourceFile extends CogSource {

    fileName: string;
    fd: Promise<fs.FileHandle>;

    constructor(fileName: string) {
        super();
        this.fileName = fileName;
        this.fd = fs.open(this.fileName, 'r');
    }

    get name() {
        return basename(this.fileName);
    }

    async fetchBytes(offset: number, length: number): Promise<ArrayBuffer> {
        const fd = await this.fd;
        const { buffer } = await fd.read(Buffer.alloc(length), 0, length, offset);
        console.info('readFile', toHexString(offset, 6), '->', toHexString(offset + length, 6), `(${toHexString(length, 6)})`, basename(this.fileName))
        return buffer.buffer
    }
}

