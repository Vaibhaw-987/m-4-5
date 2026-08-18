import {
  CostModel, 
  type CircuitContext,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  type Ledger,
  ledger,
} from '../contracts/managed/veilgate/contract/index.js';
import {
  createVeilGatePrivateState,
  memberCommitment,
  veilGateWitnesses,
  type VeilGatePrivateState,
} from '../src/veilgate-private-state.js';

export class VeilGateSimulator {
  readonly contract: Contract<VeilGatePrivateState>;
  circuitContext: CircuitContext<VeilGatePrivateState>;

  constructor(secretKey: Uint8Array) {
    this.contract = new Contract<VeilGatePrivateState>(veilGateWitnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
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

  /** Act as a different person against the same public ledger. */
  switchUser(secretKey: Uint8Array): void {
    this.circuitContext.currentPrivateState =
      createVeilGatePrivateState(secretKey);
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): VeilGatePrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /** The commitment the current user would be registered under. */
  currentCommitment(): Uint8Array {
    return memberCommitment(this.getPrivateState().secretKey);
  }

  claimOrganizer(): Ledger {
    this.circuitContext = this.contract.impureCircuits.claimOrganizer(
      this.circuitContext,
    ).context;
    return this.getLedger();
  }

  registerMember(commitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerMember(
      this.circuitContext,
      commitment,
    ).context;
    return this.getLedger();
  }

  proveMembership(): { ledger: Ledger; nullifier: Uint8Array } {
    const result = this.contract.impureCircuits.proveMembership(
      this.circuitContext,
    );
    this.circuitContext = result.context;
    return { ledger: this.getLedger(), nullifier: result.result };
  }

  rotateEpoch(): Ledger {
    this.circuitContext = this.contract.impureCircuits.rotateEpoch(
      this.circuitContext,
    ).context;
    return this.getLedger();
  }
}
