import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import type { WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";

import * as VeilPledge from "../generated/veilpledge/index.js";

export const VEILPLEDGE_PRIVATE_STATE_ID = "veilpledge-private-state" as const;
export const VEILPLEDGE_PRIVATE_STATE_STORE = "veilpledge-state" as const;
export const VEILPLEDGE_SIGNING_KEY_STORE = "veilpledge-signing-keys" as const;

export interface VeilPledgePrivateState {
  readonly secretKey: Uint8Array;
}

export type VeilPledgeContract = VeilPledge.Contract<
  VeilPledgePrivateState,
  VeilPledge.Witnesses<VeilPledgePrivateState>
>;

export type VeilPledgeCircuitId = Exclude<
  keyof VeilPledgeContract["impureCircuits"],
  number | symbol
>;

export type VeilPledgeProviders = MidnightProviders<
  VeilPledgeCircuitId,
  typeof VEILPLEDGE_PRIVATE_STATE_ID,
  VeilPledgePrivateState
>;

export type DeployedVeilPledgeContract = FoundContract<VeilPledgeContract>;

export const veilPledgeWitnesses: VeilPledge.Witnesses<VeilPledgePrivateState> = {
  localSecretKey: ({ privateState }: WitnessContext<VeilPledge.Ledger, VeilPledgePrivateState>) => [
    privateState,
    privateState.secretKey,
  ],
};

/**
 * Browser binding for the generated Compact contract. The ZK files themselves
 * are retrieved by FetchZkConfigProvider; the configured path completes the
 * CompiledContract context without importing any Node-only filesystem code.
 */
export const compiledVeilPledgeContract = CompiledContract.make<VeilPledgeContract>(
  "VeilPledge",
  VeilPledge.Contract<VeilPledgePrivateState>,
).pipe(
  CompiledContract.withWitnesses(veilPledgeWitnesses),
  CompiledContract.withCompiledFileAssets(import.meta.env.BASE_URL),
);

export { VeilPledge };
