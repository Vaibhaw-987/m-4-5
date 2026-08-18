import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { pureCircuits } from '../contracts/managed/veilgate/contract/index.js';
import {
  createVeilGatePrivateState,
  memberCommitment,
} from '../src/veilgate-private-state.js';
import { VeilGateSimulator } from './veilgate-simulator.js';

setNetworkId('undeployed');

const ORGANIZER = Uint8Array.from(randomBytes(32));
const ALICE = Uint8Array.from(randomBytes(32));
const BOB = Uint8Array.from(randomBytes(32));
const OUTSIDER = Uint8Array.from(randomBytes(32));

/** An organizer who has already registered Alice and Bob. */
function gateWithMembers(): VeilGateSimulator {
  const gate = new VeilGateSimulator(ORGANIZER);
  gate.claimOrganizer();
  gate.registerMember(memberCommitment(ALICE));
  gate.registerMember(memberCommitment(BOB));
  return gate;
}

describe('VeilGate private state', () => {
  it('rejects a secret that is not 32 bytes', () => {
    expect(() => createVeilGatePrivateState(new Uint8Array(31))).toThrow();
  });

  it('derives commitments through the compiled circuit, so the two cannot drift', () => {
    expect(memberCommitment(ALICE)).toEqual(pureCircuits.deriveCommitment(ALICE));
  });

  it('gives different members different commitments', () => {
    expect(memberCommitment(ALICE)).not.toEqual(memberCommitment(BOB));
  });
});

describe('VeilGate organizer', () => {
  it('starts with no organizer and an empty list', () => {
    const gate = new VeilGateSimulator(ORGANIZER);
    const ledger = gate.getLedger();

    expect(ledger.organizerCommitment).toEqual(new Uint8Array(32));
    expect(ledger.memberCount).toBe(0n);
    expect(ledger.checkinCount).toBe(0n);
    expect(ledger.epoch).toBe(1n);
  });

  it('lets the first caller claim the deployment', () => {
    const gate = new VeilGateSimulator(ORGANIZER);
    const ledger = gate.claimOrganizer();

    expect(ledger.organizerCommitment).not.toEqual(new Uint8Array(32));
  });

  it('refuses a second organizer claim', () => {
    const gate = new VeilGateSimulator(ORGANIZER);
    gate.claimOrganizer();
    gate.switchUser(OUTSIDER);

    expect(() => gate.claimOrganizer()).toThrow(/already has an organizer/i);
  });

  it('refuses member registration by anyone but the organizer', () => {
    const gate = new VeilGateSimulator(ORGANIZER);
    gate.claimOrganizer();
    gate.switchUser(OUTSIDER);

    expect(() => gate.registerMember(memberCommitment(OUTSIDER)))
      .toThrow(/only the organizer/i);
  });

  it('counts registered members without revealing who they are', () => {
    const gate = gateWithMembers();
    const ledger = gate.getLedger();

    expect(ledger.memberCount).toBe(2n);
    // The tree holds commitments only; no secret is recoverable from it.
    expect(ledger.members.findPathForLeaf(memberCommitment(ALICE))).toBeDefined();
    expect(ledger.members.findPathForLeaf(memberCommitment(OUTSIDER))).toBeUndefined();
  });
});

describe('VeilGate membership proof', () => {
  it('lets a registered member check in', () => {
    const gate = gateWithMembers();
    gate.switchUser(ALICE);

    const { ledger, nullifier } = gate.proveMembership();

    expect(ledger.checkinCount).toBe(1n);
    expect(ledger.spent.member(nullifier)).toBe(true);
  });

  it('rejects a non-member', () => {
    const gate = gateWithMembers();
    gate.switchUser(OUTSIDER);

    expect(() => gate.proveMembership()).toThrow();
    expect(gate.getLedger().checkinCount).toBe(0n);
  });

  it('rejects a second check-in in the same epoch', () => {
    const gate = gateWithMembers();
    gate.switchUser(ALICE);
    gate.proveMembership();

    expect(() => gate.proveMembership()).toThrow(/already checked in/i);
    expect(gate.getLedger().checkinCount).toBe(1n);
  });

  it('does not let one member spend another member nullifier', () => {
    const gate = gateWithMembers();
    gate.switchUser(ALICE);
    const alice = gate.proveMembership();

    gate.switchUser(BOB);
    const bob = gate.proveMembership();

    expect(bob.nullifier).not.toEqual(alice.nullifier);
    expect(gate.getLedger().checkinCount).toBe(2n);
  });

  it('reveals only the check-in count, not which entry matched', () => {
    const gate = gateWithMembers();
    gate.switchUser(BOB);
    const { ledger, nullifier } = gate.proveMembership();

    // The public facts after a check-in: how many members, how many check-ins,
    // and one nullifier. Nothing ties the nullifier to Bob's commitment.
    expect(ledger.memberCount).toBe(2n);
    expect(ledger.checkinCount).toBe(1n);
    expect(nullifier).not.toEqual(memberCommitment(BOB));
  });
});

describe('VeilGate epoch rotation', () => {
  it('refuses rotation by anyone but the organizer', () => {
    const gate = gateWithMembers();
    gate.switchUser(ALICE);

    expect(() => gate.rotateEpoch()).toThrow(/only the organizer/i);
  });

  it('re-admits a member after the organizer rotates the epoch', () => {
    const gate = gateWithMembers();
    gate.switchUser(ALICE);
    const first = gate.proveMembership();

    gate.switchUser(ORGANIZER);
    expect(gate.rotateEpoch().epoch).toBe(2n);

    gate.switchUser(ALICE);
    const second = gate.proveMembership();

    // A new epoch yields an unlinkable nullifier for the same member.
    expect(second.nullifier).not.toEqual(first.nullifier);
    expect(second.ledger.checkinCount).toBe(2n);
  });
});
