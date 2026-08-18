import {
  CostModel,
  type CircuitContext,
  QueryContext,
  convertFieldToBytes,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Ledger,
  ledger,
} from '../contracts/managed/veilpledge/contract/index.js';
import {
  createVeilPledgePrivateState,
  type VeilPledgePrivateState,
  witnesses,
} from '../src/private-state.js';

export class VeilPledgeSimulator {
  readonly contract: Contract<VeilPledgePrivateState>;
  circuitContext: CircuitContext<VeilPledgePrivateState>;

  constructor(secretKey: Uint8Array) {
    this.contract = new Contract<VeilPledgePrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext(
        createVeilPledgePrivateState(secretKey),
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
      createVeilPledgePrivateState(secretKey);
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): VeilPledgePrivateState {
    return this.circuitContext.currentPrivateState;
  }

  createPledge(goal: string): Ledger {
    this.circuitContext = this.contract.impureCircuits.createPledge(
      this.circuitContext,
      goal,
    ).context;
    return this.getLedger();
  }

  completePledge(): { ledger: Ledger; completedGoal: string } {
    const result = this.contract.impureCircuits.completePledge(
      this.circuitContext,
    );
    this.circuitContext = result.context;
    return { ledger: this.getLedger(), completedGoal: result.result };
  }

  deriveCurrentOwner(): Uint8Array {
    const sequenceBytes = convertFieldToBytes(
      32,
      this.getLedger().sequence,
      'veilpledge-simulator.ts',
    );

    return this.contract.circuits.deriveOwner(
      this.circuitContext,
      this.getPrivateState().secretKey,
      sequenceBytes,
    ).result;
  }
}
