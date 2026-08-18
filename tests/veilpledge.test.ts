import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { PledgeState } from '../contracts/managed/veilpledge/contract/index.js';
import { resolvePrivateStatePassword } from '../src/private-state.js';
import { VeilPledgeSimulator } from './veilpledge-simulator.js';

setNetworkId('undeployed');

describe('private-state password', () => {
  it('derives a deterministic strong password without persisting another secret', () => {
    const first = resolvePrivateStatePassword('00'.repeat(32), 'preview');
    const second = resolvePrivateStatePassword('00'.repeat(32), 'preview');

    expect(first).toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(first).toMatch(/[A-Z]/);
    expect(first).toMatch(/[a-z]/);
    expect(first).toMatch(/[0-9]/);
    expect(first).toMatch(/[^A-Za-z0-9]/);
  });

  it('keeps explicit password overrides intact', () => {
    expect(resolvePrivateStatePassword('00'.repeat(32), 'preview', 'My-Strong-Override-1'))
      .toBe('My-Strong-Override-1');
  });

  it('rejects weak overrides before a deployment can be submitted', () => {
    expect(() => resolvePrivateStatePassword('00'.repeat(32), 'preview', 'weakpassword'))
      .toThrow();
  });
});

describe('VeilPledge contract', () => {
  it('initializes a deterministic empty public ledger', () => {
    const key = randomBytes(32);
    const first = new VeilPledgeSimulator(key);
    const second = new VeilPledgeSimulator(key);

    expect(first.getLedger()).toEqual(second.getLedger());
    expect(first.getLedger()).toEqual({
      state: PledgeState.OPEN,
      goal: { is_some: false, value: '' },
      sequence: 1n,
      ownerCommitment: new Uint8Array(32),
      completionCount: 0n,
    });
  });

  it('creates a public pledge while keeping the secret local', () => {
    const secret = randomBytes(32);
    const simulator = new VeilPledgeSimulator(secret);
    const originalPrivateState = simulator.getPrivateState();

    const ledger = simulator.createPledge('Ship a privacy-first MVP');

    expect(ledger.state).toBe(PledgeState.ACTIVE);
    expect(ledger.goal).toEqual({
      is_some: true,
      value: 'Ship a privacy-first MVP',
    });
    expect(ledger.ownerCommitment).toEqual(simulator.deriveCurrentOwner());
    expect(ledger.ownerCommitment).not.toEqual(secret);
    expect(simulator.getPrivateState()).toEqual(originalPrivateState);
  });

  it('rejects a second pledge while one is active', () => {
    const simulator = new VeilPledgeSimulator(randomBytes(32));
    simulator.createPledge('First pledge');

    expect(() => simulator.createPledge('Second pledge')).toThrow(
      'failed assert: An active pledge already exists',
    );
  });

  it('rejects completion by someone without the creator secret', () => {
    const simulator = new VeilPledgeSimulator(randomBytes(32));
    simulator.createPledge('Private ownership test');
    simulator.switchUser(randomBytes(32));

    expect(() => simulator.completePledge()).toThrow(
      'failed assert: Only the pledge creator can complete it',
    );
  });

  it('lets the creator complete a pledge', () => {
    const simulator = new VeilPledgeSimulator(randomBytes(32));
    simulator.createPledge('Finish the Compact contract');

    const { ledger, completedGoal } = simulator.completePledge();

    expect(completedGoal).toBe('Finish the Compact contract');
    expect(ledger.state).toBe(PledgeState.OPEN);
    expect(ledger.goal).toEqual({ is_some: false, value: '' });
    expect(ledger.sequence).toBe(2n);
    expect(ledger.completionCount).toBe(1n);
  });

  it('rejects completion when no pledge is active', () => {
    const simulator = new VeilPledgeSimulator(randomBytes(32));

    expect(() => simulator.completePledge()).toThrow(
      'failed assert: Cannot complete an empty pledge board',
    );
  });

  it('rotates the public owner commitment between rounds', () => {
    const simulator = new VeilPledgeSimulator(randomBytes(32));
    const firstCommitment = simulator.createPledge('Round one').ownerCommitment;
    simulator.completePledge();
    const secondCommitment = simulator.createPledge('Round two').ownerCommitment;

    expect(firstCommitment).not.toEqual(secondCommitment);
    expect(simulator.getLedger().sequence).toBe(2n);
  });
});
