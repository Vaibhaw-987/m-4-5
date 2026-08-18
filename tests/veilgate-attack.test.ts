/**
 * Adversarial tests for VeilGate.
 *
 * The honest client resolves the caller's own Merkle path, so the ordinary
 * tests never exercise a forged one. A real attacker controls their client and
 * can hand the circuit any witness they like. These tests run that attack: a
 * non-member supplies a genuine member's path and tries to check in as them.
 *
 * The only thing standing in the way is the `path.leaf == deriveCommitment(secret)`
 * assertion in `proveMembership`, so it is asserted directly here.
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CostModel,
  type CircuitContext,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import {
  Contract,
  type Ledger,
  ledger,
} from '../contracts/managed/veilgate/contract/index.js';
import {
  createVeilGatePrivateState,
  memberCommitment,
  veilGateWitnesses,
  type MerklePath,
  type VeilGatePrivateState,
} from '../src/veilgate-private-state.js';

setNetworkId('undeployed');

const ORGANIZER = Uint8Array.from(randomBytes(32));
const ALICE = Uint8Array.from(randomBytes(32));
const ATTACKER = Uint8Array.from(randomBytes(32));

/**
 * A client that returns whatever path it is told to, instead of the caller's
 * own. This is the client an attacker would actually run.
 */
class MaliciousGate {
  readonly contract: Contract<VeilGatePrivateState>;
  circuitContext: CircuitContext<VeilGatePrivateState>;
  forgedPath: MerklePath | null = null;

  constructor(secretKey: Uint8Array) {
    this.contract = new Contract<VeilGatePrivateState>({
      localSecretKey: veilGateWitnesses.localSecretKey,
      memberPath: (context) =>
        this.forgedPath
          ? [context.privateState, this.forgedPath]
          : veilGateWitnesses.memberPath(context),
    });

    const { currentPrivateState, currentContractState, currentZswapLocalState } =
      this.contract.initialState(
        createConstructorContext(
          createVeilGatePrivateState(secretKey),
          '0'.repeat(64),
        ),
      );

    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  switchUser(secretKey: Uint8Array): void {
    this.circuitContext.currentPrivateState =
      createVeilGatePrivateState(secretKey);
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  claimOrganizer(): void {
    this.circuitContext = this.contract.impureCircuits.claimOrganizer(
      this.circuitContext,
    ).context;
  }

  registerMember(commitment: Uint8Array): void {
    this.circuitContext = this.contract.impureCircuits.registerMember(
      this.circuitContext,
      commitment,
    ).context;
  }

  proveMembership(): Uint8Array {
    const result = this.contract.impureCircuits.proveMembership(
      this.circuitContext,
    );
    this.circuitContext = result.context;
    return result.result;
  }
}

describe('VeilGate under a malicious client', () => {
  it('stops a non-member who replays a real member Merkle path', () => {
    const gate = new MaliciousGate(ORGANIZER);
    gate.claimOrganizer();
    gate.registerMember(memberCommitment(ALICE));

    // The attacker reads the public tree and lifts Alice's genuine path.
    const alicePath = gate
      .getLedger()
      .members.findPathForLeaf(memberCommitment(ALICE));
    expect(alicePath).toBeDefined();

    gate.switchUser(ATTACKER);
    gate.forgedPath = alicePath as unknown as MerklePath;

    // The path is real and its root is correct, so only the leaf-to-secret
    // binding can reject this.
    expect(() => gate.proveMembership()).toThrow();
    expect(gate.getLedger().checkinCount).toBe(0n);
  });

  it('stops an attacker who forges a leaf they do not have the secret for', () => {
    const gate = new MaliciousGate(ORGANIZER);
    gate.claimOrganizer();
    gate.registerMember(memberCommitment(ALICE));

    const alicePath = gate
      .getLedger()
      .members.findPathForLeaf(memberCommitment(ALICE)) as unknown as MerklePath;

    gate.switchUser(ATTACKER);
    // Claim Alice's leaf while holding the attacker's secret.
    gate.forgedPath = { ...alicePath, leaf: memberCommitment(ALICE) };

    expect(() => gate.proveMembership()).toThrow();
    expect(gate.getLedger().checkinCount).toBe(0n);
  });

  it('still admits the genuine member after the attacks fail', () => {
    const gate = new MaliciousGate(ORGANIZER);
    gate.claimOrganizer();
    gate.registerMember(memberCommitment(ALICE));

    gate.switchUser(ALICE);
    gate.forgedPath = null;

    expect(() => gate.proveMembership()).not.toThrow();
    expect(gate.getLedger().checkinCount).toBe(1n);
  });
});
