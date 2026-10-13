import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD } from '../config/render';
import { FakeElement, fakeDocument } from './testSupport';
import { VaultPrompt, vaultLine } from './vaultPrompt';

describe('the vault prompt (M102)', () => {
  let key = 'Space';
  let prompt: VaultPrompt;
  let root: FakeElement;

  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    key = 'Space';
    const parent = new FakeElement('div');
    prompt = new VaultPrompt(parent as unknown as HTMLElement, () => key);
    root = parent.children[0]!;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says which key vaults, following a rebind', () => {
    expect(vaultLine('Space')).toBe('Space to vault');
    expect(vaultLine('')).toBe('Vault');
    expect(root.hidden).toBe(true);
    prompt.update(true, false, 0.016);
    expect(root.hidden).toBe(false);
    expect(root.textContent).toBe('Space to vault');
    prompt.update(false, true, 0.016);
    key = 'F';
    prompt.update(true, false, 0.016);
    expect(root.textContent).toBe('F to vault');
  });

  it('stays up a moment past the edge of reach, and goes at once when the vault starts', () => {
    prompt.update(true, false, 0.016);
    prompt.update(false, false, HUD.vaultPromptHold / 2);
    expect(root.hidden).toBe(false);
    prompt.update(false, false, HUD.vaultPromptHold);
    expect(root.hidden).toBe(true);
    prompt.update(true, false, 0.016);
    prompt.update(false, true, 0.016);
    expect(root.hidden).toBe(true);
  });
});
