import { WOODLAND } from '../../map/woodland';
import { EXTRACTION_BALANCE } from './extractionBands';
import { describeExtractionBalance } from './extractionBalance';

/** Extraction's balance on Woodland: the seeds, bands and level order in extractionBands.ts (its measures there). */
describeExtractionBalance('Extraction balance on Woodland (M48)', WOODLAND, { ...EXTRACTION_BALANCE.woodland!, timeoutMs: 900_000 });
