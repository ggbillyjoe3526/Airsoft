import { ErrorLog, tapConsole } from './core/errorLog';

/**
 * The console's errors and warnings from the very start (IM7): every report lists the last of them. main.ts imports this
 * module first, so even a warning logged while the other modules load (a pool.md row the game can't read) is kept. The
 * browser keeps 250 files' load timings by default; the game loads more, and a report's load line counts them.
 */
export const startupLog = new ErrorLog();
tapConsole(startupLog);
performance.setResourceTimingBufferSize?.(1000);
