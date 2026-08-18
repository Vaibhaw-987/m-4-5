import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum PledgeState { OPEN = 0, ACTIVE = 1 }

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  createPledge(context: __compactRuntime.CircuitContext<PS>, newGoal_0: string): __compactRuntime.CircuitResults<PS, []>;
  completePledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, string>;
}

export type ProvableCircuits<PS> = {
  createPledge(context: __compactRuntime.CircuitContext<PS>, newGoal_0: string): __compactRuntime.CircuitResults<PS, []>;
  completePledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, string>;
}

export type PureCircuits = {
  deriveOwner(secretKey_0: Uint8Array, sequenceBytes_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  createPledge(context: __compactRuntime.CircuitContext<PS>, newGoal_0: string): __compactRuntime.CircuitResults<PS, []>;
  completePledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, string>;
  deriveOwner(context: __compactRuntime.CircuitContext<PS>,
              secretKey_0: Uint8Array,
              sequenceBytes_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  readonly state: PledgeState;
  readonly goal: { is_some: boolean, value: string };
  readonly sequence: bigint;
  readonly ownerCommitment: Uint8Array;
  readonly completionCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
