/**
 * Selects which compiled contract `deploy.ts` deploys.
 *
 * The repo ships two contracts: veilpledge (the Level 1-3 foundation) and
 * veilgate (the Level 4 MVP from docs/proposal.md). Both use the same wallet,
 * proof server, and provider wiring, so they share one deploy script rather
 * than duplicating it.
 *
 *   npm run deploy -- --network preprod                     # veilpledge
 *   npm run deploy -- --network preprod --contract veilgate # veilgate
 */
import { loadVeilPledgeContract, zkConfigPath } from './compiled-contract';
import { loadVeilGateContract, veilGateZkConfigPath } from './compiled-veilgate';
import {
  createVeilPledgePrivateState,
  PRIVATE_STATE_ID,
  PRIVATE_STATE_STORE,
} from './private-state';
import {
  createVeilGatePrivateState,
  VEILGATE_PRIVATE_STATE_ID,
  VEILGATE_PRIVATE_STATE_STORE,
} from './veilgate-private-state';

export type ContractName = 'veilpledge' | 'veilgate';

export const CONTRACT_NAMES: readonly ContractName[] = [
  'veilpledge',
  'veilgate',
] as const;

export interface DeployTarget {
  name: ContractName;
  zkConfigPath: string;
  privateStateId: string;
  privateStateStoreName: string;
  /** File under deployments/ holding the public record for this contract. */
  deploymentRecordName: string;
  load(): Promise<{ contractModule: unknown; compiledContract: unknown }>;
  createInitialPrivateState(): unknown;
}

const TARGETS: Record<ContractName, DeployTarget> = {
  veilpledge: {
    name: 'veilpledge',
    zkConfigPath,
    privateStateId: PRIVATE_STATE_ID,
    privateStateStoreName: PRIVATE_STATE_STORE,
    // Kept as the bare network name so existing records and the tracked
    // deployments/preprod.json that CI verifies stay where they are.
    deploymentRecordName: '',
    load: loadVeilPledgeContract,
    createInitialPrivateState: createVeilPledgePrivateState,
  },
  veilgate: {
    name: 'veilgate',
    zkConfigPath: veilGateZkConfigPath,
    privateStateId: VEILGATE_PRIVATE_STATE_ID,
    privateStateStoreName: VEILGATE_PRIVATE_STATE_STORE,
    deploymentRecordName: 'veilgate',
    load: loadVeilGateContract,
    createInitialPrivateState: createVeilGatePrivateState,
  },
};

export function isContractName(value: unknown): value is ContractName {
  return typeof value === 'string' && (CONTRACT_NAMES as readonly string[]).includes(value);
}

export function parseContractFlag(argv: string[]): ContractName {
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--contract') {
      const value = argv[index + 1];
      if (!isContractName(value)) {
        throw new Error(
          `Unknown contract: ${value}. Supported: ${CONTRACT_NAMES.join(', ')}.`,
        );
      }
      return value;
    }
    if (argument.startsWith('--contract=')) {
      const value = argument.slice('--contract='.length);
      if (!isContractName(value)) {
        throw new Error(
          `Unknown contract: ${value}. Supported: ${CONTRACT_NAMES.join(', ')}.`,
        );
      }
      return value;
    }
  }
  return 'veilpledge';
}

export function resolveDeployTarget(argv: string[] = process.argv): DeployTarget {
  return TARGETS[parseContractFlag(argv)];
}

/** `deployments/<network>.json`, or `deployments/<network>-veilgate.json`. */
export function deploymentRecordFile(target: DeployTarget, network: string): string {
  return target.deploymentRecordName
    ? `${network}-${target.deploymentRecordName}.json`
    : `${network}.json`;
}
