import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  memberPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                           path: { sibling: { field: bigint
                                                                                            },
                                                                                   goes_left: boolean
                                                                                 }[]
                                                                         }];
}

export type ImpureCircuits<PS> = {
  claimOrganizer(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  registerMember(context: __compactRuntime.CircuitContext<PS>,
                 commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveMembership(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotateEpoch(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  claimOrganizer(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  registerMember(context: __compactRuntime.CircuitContext<PS>,
                 commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveMembership(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotateEpoch(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  deriveCommitment(secret_0: Uint8Array): Uint8Array;
  deriveOrganizer(secret_0: Uint8Array): Uint8Array;
  deriveNullifier(secret_0: Uint8Array, epochBytes_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  claimOrganizer(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  registerMember(context: __compactRuntime.CircuitContext<PS>,
                 commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveMembership(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotateEpoch(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  deriveCommitment(context: __compactRuntime.CircuitContext<PS>,
                   secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveOrganizer(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveNullifier(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: Uint8Array,
                  epochBytes_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  members: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  readonly organizerCommitment: Uint8Array;
  spent: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly epoch: bigint;
  readonly memberCount: bigint;
  readonly checkinCount: bigint;
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
