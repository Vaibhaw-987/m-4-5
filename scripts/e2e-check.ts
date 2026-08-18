/**
 * Public end-to-end verification for a deployed VeilPledge contract.
 *
 * This intentionally needs no wallet seed, private state, signing key, or
 * proof server, so reviewers can run it from a clean clone. The address comes
 * from --contract-address, MIDNIGHT_CONTRACT_ADDRESS, local gitignored state,
 * or the tracked public deployment record (in that order).
 */
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { resolveNetwork, getDeployment } from '../src/network';
import { loadVeilPledgeContract } from '../src/compiled-contract';

// @ts-expect-error indexer subscriptions require WebSocket
globalThis.WebSocket = WebSocket;

const { network, config: networkConfig } = resolveNetwork();

interface PublicDeploymentRecord {
  network: string;
  contractAddress: string;
  transactionHash?: string;
  blockHeight?: number;
  deployedAt?: string;
}

function fail(message: string): never {
  console.error(`❌ e2e-check failed: ${message}`);
  process.exit(1);
}

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);
}

function argumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === name) return process.argv[index + 1];
    if (argument.startsWith(prefix)) return argument.slice(prefix.length);
  }
  return undefined;
}

function loadTrackedDeployment(): PublicDeploymentRecord | null {
  const recordPath = path.join(process.cwd(), 'deployments', `${network}.json`);
  if (!fs.existsSync(recordPath)) return null;

  let record: PublicDeploymentRecord;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as PublicDeploymentRecord;
  } catch (error) {
    fail(`Could not parse ${recordPath}: ${(error as Error).message}`);
  }

  if (record.network !== network) {
    fail(`Tracked deployment network mismatch: record=${record.network}, selected=${network}`);
  }
  if (!isHexAddress(record.contractAddress)) {
    fail('Tracked deployment contract address is missing or invalid');
  }

  return record;
}

async function verifyTrackedDeployment(
  record: PublicDeploymentRecord,
  contractAddress: string,
): Promise<void> {
  if (!isHexAddress(record.transactionHash)) {
    fail('Tracked deployment transaction hash is missing or invalid');
  }
  if (!Number.isSafeInteger(record.blockHeight) || (record.blockHeight ?? 0) < 0) {
    fail('Tracked deployment block height is missing or invalid');
  }

  const response = await fetch(networkConfig.indexer, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `
        query VerifyDeployment($hash: HexEncoded!) {
          transactions(offset: { hash: $hash }) {
            hash
            block { height }
            contractActions { __typename address }
          }
        }
      `,
      variables: { hash: record.transactionHash },
    }),
  });
  if (!response.ok) fail(`Indexer transaction query returned HTTP ${response.status}`);

  const result = await response.json() as {
    data?: {
      transactions?: Array<{
        hash: string;
        block: { height: number };
        contractActions: Array<{ __typename: string; address: string }>;
      }>;
    };
    errors?: Array<{ message: string }>;
  };
  if (result.errors?.length) {
    fail(`Indexer transaction query failed: ${result.errors.map((error) => error.message).join('; ')}`);
  }

  const transaction = result.data?.transactions?.find(
    (candidate) => candidate.hash === record.transactionHash,
  );
  if (!transaction) fail(`Deployment transaction ${record.transactionHash} was not indexed`);
  if (transaction.block.height !== record.blockHeight) {
    fail(
      `Deployment block mismatch: record=${record.blockHeight}, ` +
        `indexer=${transaction.block.height}`,
    );
  }
  const matchingDeploy = transaction.contractActions.some(
    (action) => action.__typename === 'ContractDeploy' && action.address === contractAddress,
  );
  if (!matchingDeploy) {
    fail('Tracked transaction is not the ContractDeploy action for this address');
  }
}

async function main() {
  const tracked = loadTrackedDeployment();
  const local = getDeployment(network);
  const contractAddress =
    argumentValue('--contract-address') ??
    process.env.MIDNIGHT_CONTRACT_ADDRESS?.trim() ??
    local?.address ??
    tracked?.contractAddress;

  if (!isHexAddress(contractAddress)) {
    fail(
      `No valid contract address for ${network}. Pass --contract-address, set ` +
        'MIDNIGHT_CONTRACT_ADDRESS, or add a tracked deployment record.',
    );
  }

  const { contractModule: VeilPledge } = await loadVeilPledgeContract();
  const publicDataProvider = indexerPublicDataProvider(
    networkConfig.indexer,
    networkConfig.indexerWS,
  );
  const onChainState = await publicDataProvider.queryContractState(contractAddress);
  if (!onChainState) fail(`Indexer returned no contract state for ${contractAddress}`);

  const ledger = VeilPledge.ledger(onChainState.data);
  const isOpen = ledger.state === VeilPledge.PledgeState.OPEN;
  const isActive = ledger.state === VeilPledge.PledgeState.ACTIVE;
  if (!isOpen && !isActive) fail(`Unknown pledge state ${ledger.state}`);
  if (isOpen && ledger.goal.is_some) fail('OPEN board unexpectedly has a pledge goal');
  if (isActive && !ledger.goal.is_some) fail('ACTIVE board is missing its pledge goal');
  if (ledger.sequence < 1n) fail(`Invalid sequence ${ledger.sequence}`);
  if (ledger.completionCount !== ledger.sequence - 1n) {
    fail(
      `Counter invariant failed: sequence=${ledger.sequence}, ` +
        `completionCount=${ledger.completionCount}`,
    );
  }

  const hasTrackedDeployment = tracked?.contractAddress === contractAddress;
  if (hasTrackedDeployment) await verifyTrackedDeployment(tracked, contractAddress);

  console.log('PASS e2e-check passed');
  console.log(`   contractAddress: ${contractAddress}`);
  console.log(`   network:         ${network}`);
  console.log(`   pledgeState:     ${isOpen ? 'OPEN' : 'ACTIVE'}`);
  console.log(`   sequence:        ${ledger.sequence}`);
  console.log(`   completions:     ${ledger.completionCount}`);
  if (hasTrackedDeployment) {
    if (tracked.transactionHash) console.log(`   deploymentTx:    ${tracked.transactionHash}`);
    if (tracked.blockHeight !== undefined) console.log(`   deploymentBlock: ${tracked.blockHeight}`);
    console.log(`   deploymentProof: ${network} indexer verified`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
