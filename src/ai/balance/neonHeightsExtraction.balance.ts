import { NEON_HEIGHTS } from '../../map/neonHeights';
import { EXTRACTION_BALANCE } from './extractionBands';
import { describeExtractionBalance } from './extractionBalance';

/** Extraction's balance on Neon Heights: the seeds, bands and level order in extractionBands.ts (its measures there). */
describeExtractionBalance('Extraction balance on Neon Heights (M48)', NEON_HEIGHTS, { ...EXTRACTION_BALANCE.neonHeights!, timeoutMs: 900_000 });
