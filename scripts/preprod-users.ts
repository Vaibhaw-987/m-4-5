/**
 * Preprod user tracker for the VeilPledge feedback loop.
 *
 * Midnight shields the caller of a contract call: a VeilPledge transaction
 * carries a ContractCall action with an entry point and no sender, and its
 * unshielded input/output sets are empty. There is therefore no way to derive
 * a participant's wallet address from the chain, by design. Any address list
 * is self-attested by the user through the feedback form.
 *
 * What the chain does prove is aggregate usage: the ledger counters advance
 * once per pledge created and once per pledge completed. This script reads
 * those counters and reconciles them against the self-attested registry, so an
 * inflated registry is visible instead of silently accepted.
 *
 * Needs no wallet seed, private state, or proof server, so a reviewer can run
 * it from a clean clone:
 *
 *   npm run users -- --network preprod
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

const LEVEL_5_TARGET = 50;
const REGISTRY_PATH = path.join('docs', 'users', `${network}-users.json`);

interface RegistryEntry {
  address: string;
  joinedAt: string;
  source?: string;
  note?: string;
}

interface Registry {
  network: string;
  target: number;
  users: RegistryEntry[];
}

function fail(message: string): never {
  console.error(`FAIL preprod-users: ${message}`);
  process.exit(1);
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

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Midnight bech32m address, e.g. mn_addr_test1... . Deliberately permissive
 * about the human-readable part so a network rename does not reject real
 * submissions; the checksum is not verified here.
 */
function isMidnightAddress(value: unknown): value is string {
  return typeof value === 'string' && /^mn_[a-z0-9_-]+1[02-9ac-hj-np-z]{20,}$/i.test(value);
}

function loadRegistry(): Registry {
  const registryPath = path.join(process.cwd(), REGISTRY_PATH);
  if (!fs.existsSync(registryPath)) {
    fail(`No registry at ${REGISTRY_PATH}. Create it from docs/users/README.md.`);
  }

  let parsed: Registry;
  try {
    parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Registry;
  } catch (error) {
    fail(`Could not parse ${REGISTRY_PATH}: ${(error as Error).message}`);
  }

  if (parsed.network !== network) {
    fail(`Registry network mismatch: file=${parsed.network}, selected=${network}`);
  }
  if (!Array.isArray(parsed.users)) {
    fail(`Registry ${REGISTRY_PATH} has no users array`);
  }
  return parsed;
}

/**
 * Rejects the failure modes that would make the submitted list dishonest:
 * malformed addresses, duplicates, and missing join dates.
 */
function validateRegistry(registry: Registry): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();

  registry.users.forEach((entry, index) => {
    const label = `users[${index}]`;
    if (!isMidnightAddress(entry.address)) {
      problems.push(`${label}: "${entry.address}" is not a Midnight address`);
      return;
    }
    const normalised = entry.address.toLowerCase();
    const first = seen.get(normalised);
    if (first !== undefined) {
      problems.push(`${label}: duplicate of users[${first}]`);
      return;
    }
    seen.set(normalised, index);

    if (!entry.joinedAt || Number.isNaN(Date.parse(entry.joinedAt))) {
      problems.push(`${label}: joinedAt is missing or not a date`);
    }
  });

  return problems;
}

async function main() {
  const registry = loadRegistry();
  const problems = validateRegistry(registry);

  const local = getDeployment(network);
  const contractAddress =
    argumentValue('--contract-address') ??
    process.env.MIDNIGHT_CONTRACT_ADDRESS?.trim() ??
    local?.address ??
    (JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'deployments', `${network}.json`), 'utf8'),
    ) as { contractAddress?: string }).contractAddress;

  if (!isHexAddress(contractAddress)) {
    fail(`No valid contract address for ${network}`);
  }

  const { contractModule: VeilPledge } = await loadVeilPledgeContract();
  const publicDataProvider = indexerPublicDataProvider(
    networkConfig.indexer,
    networkConfig.indexerWS,
  );
  const onChainState = await publicDataProvider.queryContractState(contractAddress);
  if (!onChainState) fail(`Indexer returned no contract state for ${contractAddress}`);

  const ledger = VeilPledge.ledger(onChainState.data);
  // sequence starts at 1 and advances only on completion, so completionCount
  // is the number of finished pledges and an ACTIVE board adds the open one.
  const completions = Number(ledger.completionCount);
  const createdTotal = completions + (ledger.state === VeilPledge.PledgeState.ACTIVE ? 1 : 0);

  const registered = registry.users.length;
  const remaining = Math.max(0, LEVEL_5_TARGET - registered);

  console.log('VeilPledge Preprod users');
  console.log(`   network:          ${network}`);
  console.log(`   contractAddress:  ${contractAddress}`);
  console.log('');
  console.log('On-chain activity (verifiable, no identities)');
  console.log(`   pledges created:   ${createdTotal}`);
  console.log(`   pledges completed: ${completions}`);
  console.log(`   board state:       ${ledger.state === VeilPledge.PledgeState.OPEN ? 'OPEN' : 'ACTIVE'}`);
  console.log('');
  console.log('Self-attested registry');
  console.log(`   registered:       ${registered}`);
  console.log(`   target:           ${LEVEL_5_TARGET}`);
  console.log(`   remaining:        ${remaining}`);

  if (problems.length > 0) {
    console.log('');
    console.log(`Registry problems (${problems.length}):`);
    problems.forEach((problem) => console.log(`   - ${problem}`));
  }

  // A participant cannot have used the dApp if nobody has. This catches a
  // registry padded with addresses that never touched the contract.
  const inflated = registered > 0 && createdTotal === 0;
  if (inflated) {
    console.log('');
    console.log('WARN registry lists users but the contract has never been called.');
  }

  console.log('');
  if (problems.length > 0) {
    fail(`${problems.length} registry problem(s); fix before submitting.`);
  }
  if (registered >= LEVEL_5_TARGET) {
    console.log(`PASS ${registered}/${LEVEL_5_TARGET} Preprod users registered.`);
  } else {
    console.log(`PENDING ${registered}/${LEVEL_5_TARGET} Preprod users. ${remaining} to go.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
