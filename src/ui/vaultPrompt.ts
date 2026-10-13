import { HUD } from '../config/render';

/** The line under the crosshair at an obstacle you can vault (M102): "Space to vault", or "Vault" with Jump unbound. */
export function vaultLine(jumpKey: string): string {
  return jumpKey ? `${jumpKey} to vault` : 'Vault';
}

/**
 * "Space to vault" under the crosshair while a Jump press would take you over the obstacle ahead (sim/vault.ts
 * findVault), so what can be vaulted reads at a glance. Kept up a moment past the edge of reach (HUD.vaultPromptHold),
 * gone at once when the vault starts. Touches the page only when what it shows changes.
 */
export class VaultPrompt {
  private readonly root: HTMLDivElement;
  private shown = false;
  private key: string | null = null;
  private hold = 0;

  constructor(
    parent: HTMLElement,
    /** The Jump key's name now (it can be rebound on the pause menu). */
    private readonly jumpKey: () => string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'vault-prompt';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  /** Once a frame (`dt` seconds): `available`, a Jump press now would vault; `vaulting`, one is under way. */
  update(available: boolean, vaulting: boolean, dt: number): void {
    this.hold = vaulting ? 0 : available ? HUD.vaultPromptHold : Math.max(0, this.hold - dt);
    const show = this.hold > 0;
    if (show && !this.shown) {
      const key = this.jumpKey();
      if (key !== this.key) this.root.textContent = vaultLine((this.key = key));
    }
    if (show !== this.shown) this.root.hidden = !(this.shown = show);
  }

  dispose(): void {
    this.root.remove();
  }
}
