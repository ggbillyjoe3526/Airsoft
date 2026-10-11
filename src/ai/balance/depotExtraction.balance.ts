import { DEPOT } from '../../map/depot';
import { EXTRACTION_BALANCE } from './extractionBands';
import { describeExtractionBalance } from './extractionBalance';

/** Extraction's balance on Depot: the seeds, bands and level order in extractionBands.ts (its measures there). */
describeExtractionBalance('Extraction balance on Depot (M46)', DEPOT, { ...EXTRACTION_BALANCE.depot!, timeoutMs: 600_000 });
