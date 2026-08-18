import { createHash, randomBytes } from 'node:crypto';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { validatePassword } from '@midnight-ntwrk/midnight-js-utils';

export const PRIVATE_STATE_ID = 'veilpledge-private-state';
export const PRIVATE_STATE_STORE = 'veilpledge-state';

export type VeilPledgePrivateState = {
  readonly secretKey: Uint8Array;
};

/**
 * Resolve the password used by the encrypted private-state provider.
 *
 * An explicit environment override wins. Otherwise derive a domain-separated
 * 256-bit value from the already-private wallet seed so Preview deployments do
 * not silently use a public development placeholder or require a second secret
 * file that can be lost independently of the wallet.
 */
export function resolvePrivateStatePassword(
  walletSeed: string,
  network: string,
  override?: string,
): string {
  const provided = override?.trim();
  if (provided) {
    // Validate during provider setup, before any deployment transaction is
    // constructed or submitted. The storage provider otherwise validates only
    // after a successful on-chain submission while persisting private state.
    validatePassword(provided);
    return provided;
  }
  const digest = createHash('sha256')
    .update(`veilpledge:private-state-password:v1:${network}:`)
    .update(walletSeed)
    .digest('hex');
  // Midnight.js 4.x requires at least three character classes. The digest is
  // still the secret material; this fixed prefix only guarantees the derived
  // password satisfies that policy (upper/lower/digit/special) on every seed.
  const derived = `Vp1!${digest}`;
  validatePassword(derived);
  return derived;
}

export function createVeilPledgePrivateState(
  secretKey: Uint8Array = randomBytes(32),
): VeilPledgePrivateState {
  if (secretKey.length !== 32) {
    throw new Error(`VeilPledge secret must be 32 bytes; received ${secretKey.length}`);
  }

  return { secretKey: Uint8Array.from(secretKey) };
}

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<unknown, VeilPledgePrivateState>): [
    VeilPledgePrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],
};
