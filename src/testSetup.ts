// Every map's data for the unit tests (M50): the game fetches the dev maps' chunk only once Dev content is on
// (map/maps.ts loadDevMaps); the tests read all of them, as they always have. Runs before each test file
// (vite.config.ts setupFiles); registering again is a no-op.
import { DEV_MAP_DATA } from './map/devMaps';
import { registerMaps } from './map/maps';

registerMaps(DEV_MAP_DATA);
