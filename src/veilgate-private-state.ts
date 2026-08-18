import { randomBytes } from 'node:crypto';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

import {
  type Ledger,
  pureCircuits,
} from '../contracts/managed/veilgate/contract/index.js';

export const VEILGATE_PRIVATE_STATE_ID = 'veilgate-private-state';
export const VEILGATE_PRIVATE_STATE_STORE = 'veilgate-state';

/** Matches the `MerkleTree<10, Bytes<32>>` depth declared in the contract. */
export const MEMBER_TREE_DEPTH = 10;

export type VeilGatePrivateState = {
  readonly secretKey: Uint8Array;
};

export type MerklePath = {
  leaf: Uint8Array;
  path: Array<{ sibling: { field: bigint }; goes_left: boolean }>;
};

export function createVeilGatePrivateState(
  secretKey: Uint8Array = randomBytes(32),
): VeilGatePrivateState {
  if (secretKey.length !== 32) {
    throw new Error(`VeilGate secret must be 32 bytes; received ${secretKey.length}`);
  }

  return { secretKey: Uint8Array.from(secretKey) };
}

/**
 * The member commitment for a secret, computed by the contract's own compiled
 * circuit so the off-circuit and in-circuit derivations cannot drift.
 */
export function memberCommitment(secretKey: Uint8Array): Uint8Array {
  return pureCircuits.deriveCommitment(secretKey);
}

/**
 * A shaped all-zero path.
 *
 * `proveMembership` binds the path leaf to the caller's own commitment and
 * checks the root, so a non-member fails inside the circuit. Returning a
 * placeholder keeps that failure in the circuit rather than throwing here,
 * where the error would announce that the caller is absent from the tree
 * before any proof is attempted.
 */
export function emptyPath(): MerklePath {
  return {
    leaf: new Uint8Array(32),
    path: Array.from({ length: MEMBER_TREE_DEPTH }, () => ({
      sibling: { field: 0n },
      goes_left: false,
    })),
  };
}

export const veilGateWitnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, VeilGatePrivateState>): [
    VeilGatePrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],

  /**
   * Resolve the caller's own Merkle path from the public tree. The tree and
   * every commitment in it are already public, so reading it here reveals
   * nothing; only the secret that maps to a leaf stays local.
   */
  memberPath: ({
    privateState,
    ledger,
  }: WitnessContext<Ledger, VeilGatePrivateState>): [
    VeilGatePrivateState,
    MerklePath,
  ] => {
    const found = ledger.members.findPathForLeaf(
      memberCommitment(privateState.secretKey),
    );
    return [privateState, (found as MerklePath | undefined) ?? emptyPath()];
  },
};
