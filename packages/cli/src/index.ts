import 'source-map-support/register.js';
import { CogInfoCommandLine } from './cli.cog.info.js';
import { logger } from './cli.log.js';

const cogInfo: CogInfoCommandLine = new CogInfoCommandLine();
cogInfo.executeWithoutErrorHandling().catch((error) => {
    logger.fatal({ error }, 'Failed to run');
    process.exit(1);
});