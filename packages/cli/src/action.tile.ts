import { Log, TiffVersion, toByteSizeString } from '@coginfo/core';
import { CommandLineAction, CommandLineStringParameter } from '@microsoft/ts-command-line';
import chalk from 'chalk';
import { ActionUtil, CliResultMap } from './action.util';
import { writeTile } from './util.tile';

export class ActionTile extends CommandLineAction {
    private file: CommandLineStringParameter | null = null;
    private xyz: CommandLineStringParameter | null = null;

    public constructor() {
        super({
            actionName: 'tile',
            summary: 'Fetch a specific tile from a COG',
            documentation: '',
        });
    }

    async onExecute(): Promise<void> {
        const logger = Log.get().child({ action: 'tile' });
        // abstract
        const { tif } = await ActionUtil.getCogSource(this.file);
        if (this.xyz == null || this.xyz.value == null) {
            throw new Error('XYZ was not defined');
        }

        const isCogOptimized = tif.options.isCogOptimized;
        if (!isCogOptimized) {
            logger.warn('COG is not optimized, fetching specific tiles will be slow.');
        }

        const [x, y, z] = this.xyz.value.split(',').map(c => parseInt(c));
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
            throw new Error('Invalid XYZ, format: "X,Y,Z"');
        }

        await writeTile(tif, x, y, z, '.', logger);

        const chunkIds = Object.keys(tif.source.chunks).filter(f => tif.source.chunk(parseInt(f, 10)).isReady());

        const result: CliResultMap[] = [
            {
                keys: [
                    { key: 'Tiff type', value: `${TiffVersion[tif.source.version]} (v${String(tif.source.version)})` },
                    { key: 'Chunk size', value: toByteSizeString(tif.source.chunkSize) },
                    {
                        key: 'Bytes read',
                        value: `${toByteSizeString(chunkIds.length * tif.source.chunkSize)} (${chunkIds.length} Chunk${
                            chunkIds.length === 1 ? '' : 's'
                        })`,
                    },
                ],
            },
        ];

        const msg = ActionUtil.formatResult(chalk`{bold COG File Info} - {bold ${tif.source.name}}`, result);
        console.log(msg.join('\n'));
    }

    protected onDefineParameters(): void {
        // abstract
        this.file = this.defineStringParameter({
            argumentName: 'FILE',
            parameterLongName: '--file',
            parameterShortName: '-f',
            description: 'cog file to access',
            required: true,
        });

        this.xyz = this.defineStringParameter({
            argumentName: 'XYZ',
            parameterLongName: '--xyz',
            description: '"X,Y,Z" of the tile to fetch',
            required: true,
        });
    }
}
