import { beforeAll, describe, expect, it } from 'vitest';

// The app's tsconfig has no Node types: load Node's fs by a name TypeScript doesn't resolve.
let options: Record<string, unknown>;
let include: string[];
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as unknown as { readFileSync(p: string, enc: string): string };
  const cfg = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8')) as { compilerOptions: Record<string, unknown>; include: string[]; extends?: unknown };
  expect(cfg.extends, 'an extended config could loosen settings unseen').toBeUndefined();
  options = cfg.compilerOptions;
  include = cfg.include;
});

// IM4 acceptance 1: the compiler swap (TypeScript 5 -> 7) must not loosen the type check.
describe('tsconfig keeps the strict type check (IM4 acceptance 1)', () => {
  const required = ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'noUnusedLocals', 'noUnusedParameters', 'noImplicitOverride', 'noFallthroughCasesInSwitch'];
  it.each(required)('%s stays on', (name) => {
    expect(options[name]).toBe(true);
  });

  it('does not switch off a strict family flag that strict implies', () => {
    const family = ['noImplicitAny', 'strictNullChecks', 'strictFunctionTypes', 'strictBindCallApply', 'strictPropertyInitialization', 'noImplicitThis', 'useUnknownInCatchVariables', 'alwaysStrict', 'strictBuiltinGlobals'];
    for (const name of family) expect(options[name], name).not.toBe(false);
  });

  it('adds no escape hatch beyond skipLibCheck and noEmit', () => {
    const hatches = ['noCheck', 'allowJs', 'checkJs', 'skipDefaultLibCheck', 'allowUnreachableCode', 'allowUnusedLabels', 'suppressImplicitAnyIndexErrors', 'suppressExcessPropertyErrors', 'noStrictGenericChecks', 'ignoreDeprecations', 'noImplicitUseStrict', 'keyofStringsOnly'];
    for (const name of hatches) expect(options[name], name).toBeUndefined();
  });

  it('still checks the game source, the e2e specs and the configs', () => {
    expect(include).toEqual(expect.arrayContaining(['src', 'e2e', 'vite.config.ts', 'playwright.config.ts']));
  });
});
