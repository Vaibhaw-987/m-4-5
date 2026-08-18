/**
 * Non-interactive CLI for the deployed VeilGate contract.
 *
 * Lace is browser-only, so this drives the four circuits from Node using the
 * same wallet, proof server, and provider wiring as src/deploy.ts.
 *
 *   npm run veilgate:cli -- --network preprod state
 *   npm run veilgate:cli -- --network preprod claim-organizer
 *   npm run veilgate:cli -- --network preprod register-member
 *   npm run veilgate:cli -- --network preprod prove-membership
 *   npm run veilgate:cli -- --network preprod rotate-epoch
 *   npm run veilgate:cli -- --network preprod run
 *
 * `run` performs claim-organizer, register-member and prove-membership in
 * order, switching private state between the organizer and the member.
 */
import { createHash } from 'node:crypto';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { resolveNetwork, getOrCreateSeed, getDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet';
import { resolvePrivateStatePassword } from './private-state';
import { loadVeilGateContract, veilGateZkConfigPath } from './compiled-veilgate';
import {
  createVeilGatePrivateState,
  memberCommitment,
  VEILGATE_PRIVATE_STATE_ID,
  VEILGATE_PRIVATE_STATE_STORE,
  type VeilGatePrivateState,
} from './veilgate-private-state';

// @ts-expect-error Required for wallet sync and indexer subscriptions
globalThis.WebSocket = WebSocket;

// The LevelDB provider stores encrypted private state and signing keys.
process.umask(0o077);

const { network, config: networkConfig } = resolveNetwork();

type Identity = 'organizer' | 'member';

type Command =
  | 'state'
  | 'claim-organizer'
  | 'register-member'
  | 'prove-membership'
  | 'rotate-epoch'
  | 'run';

const COMMANDS: readonly Command[] = [
  'state',
  'claim-organizer',
  'register-member',
  'prove-membership',
  'rotate-epoch',
  'run',
];

function parseCommand(argv: string[]): Command {
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--')) {
      // Skip the flag and, for the two-token form, its value.
      if (!argument.includes('=') && argv[index + 1] && !argv[index + 1].startsWith('--')) {
        index += 1;
      }
      continue;
    }
    if (!(COMMANDS as readonly string[]).includes(argument)) {
      throw new Error(`Unknown command: ${argument}. Supported: ${COMMANDS.join(', ')}.`);
    }
    return argument as Command;
  }
  return 'state';
}

/**
 * Both identities come from the wallet seed rather than fresh randomness so a
 * re-run reaches the same organizer and the same member instead of stranding
 * the deployment behind a secret that only lived in one process.
 */
function identitySecret(seed: string, identity: Identity): Uint8Array {
  return createHash('sha256')
    .update(`veilgate:identity:v1:${network}:${identity}:`)
    .update(seed)
    .digest();
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

async function waitForProofServer(): Promise<void> {
  try {
    await fetch(networkConfig.proofServer, { method: 'GET', signal: AbortSignal.timeout(5000) });
  } catch (error: any) {
    const code = error?.cause?.code ?? error?.code ?? '';
    if (code === 'ECONNREFUSED' || code === 'UND_ERR_CONNECT_TIMEOUT') {
      throw new Error(
        `Proof server unreachable at ${networkConfig.proofServer}. Run: npm run proof-server:start`,
      );
    }
  }
}

// ─── Providers ─────────────────────────────────────────────────────────────────

function createProviders(walletCtx: WalletContext, seed: string) {
  const privateStatePassword = resolvePrivateStatePassword(
    seed,
    network,
    process.env.PRIVATE_STATE_PASSWORD,
  );

  const walletProvider = {
    // This wallet holds only public funds, so its shielded child is never
    // started and these deterministic seed derivatives stand in for it.
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        {
          ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['unshielded', 'dust'],
        },
      );
      const signedRecipe = await walletCtx.wallet.signRecipe(recipe, (payload) =>
        walletCtx.unshieldedKeystore.signData(payload),
      );
      return walletCtx.wallet.finalizeRecipe(signedRecipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(veilGateZkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: VEILGATE_PRIVATE_STATE_STORE,
      accountId: walletCtx.unshieldedKeystore.getBech32Address().toString(),
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

// ─── Ledger reads ──────────────────────────────────────────────────────────────

const { contractModule: VeilGate } = await loadVeilGateContract();

function resolveContractAddress(): string {
  const deployment = getDeployment(network);
  if (!deployment) {
    throw new Error(
      `No deployment on file for ${network}. Run \`npm run deploy:veilgate -- --network ${network}\`.`,
    );
  }
  return deployment.address;
}

async function printLedger(publicDataProvider: any, contractAddress: string): Promise<any> {
  const contractState = await publicDataProvider.queryContractState(contractAddress);
  if (!contractState) {
    console.log('  Indexer has no state for this contract yet.\n');
    return null;
  }
  const state = VeilGate.ledger(contractState.data);
  console.log(`  organizerCommitment: ${hex(state.organizerCommitment)}`);
  console.log(`  epoch:               ${state.epoch}`);
  console.log(`  memberCount:         ${state.memberCount}`);
  console.log(`  checkinCount:        ${state.checkinCount}`);
  console.log(`  spent nullifiers:    ${state.spent.size()}`);
  for (const nullifier of state.spent) {
    console.log(`    - ${hex(nullifier)}`);
  }
  console.log('');
  return state;
}

// ─── Wallet ────────────────────────────────────────────────────────────────────

async function connectWallet(seed: string): Promise<WalletContext> {
  console.log('  Creating wallet...');
  const walletCtx = await createWallet({
    network,
    networkConfig,
    seed,
    syncMode: 'public-funds',
  });
  console.log(`  Wallet address: ${walletCtx.unshieldedKeystore.getBech32Address()}`);
  console.log('  Syncing public-funds wallets (resuming from .midnight-wallet-state)...');

  const syncStart = Date.now();
  const syncInterval = setInterval(() => {
    console.log(`  ⏳ Syncing (${Math.round((Date.now() - syncStart) / 1000)}s)...`);
  }, 15_000);

  try {
    const [unshieldedState] = await Rx.firstValueFrom(
      Rx.combineLatest([
        walletCtx.wallet.unshielded.state.pipe(Rx.filter((s) => s.progress.isStrictlyComplete())),
        walletCtx.wallet.dust.state.pipe(Rx.filter((s) => s.progress.isStrictlyComplete())),
      ]).pipe(Rx.timeout({ first: 60 * 60_000 })),
    );
    const balance = unshieldedState.balances[unshieldedToken().raw] ?? 0n;
    console.log(`  ✓ Synced. Balance: ${balance.toLocaleString()} tNight`);
  } finally {
    clearInterval(syncInterval);
  }

  const dustState = await walletCtx.wallet.dust.waitForSyncedState();
  console.log(`  DUST: ${dustState.balance(new Date()).toLocaleString()}\n`);
  await persistWalletState(network, walletCtx);
  return walletCtx;
}

// ─── Circuit calls ─────────────────────────────────────────────────────────────

async function attach(providers: any, contractAddress: string, privateState: VeilGatePrivateState) {
  return (await findDeployedContract(providers, {
    compiledContract: (await loadVeilGateContract()).compiledContract as any,
    contractAddress,
    privateStateId: VEILGATE_PRIVATE_STATE_ID,
    // Overwrites the stored private state, which is how this one wallet acts
    // as two distinct VeilGate identities against the same deployment.
    initialPrivateState: privateState,
  } as any)) as any;
}

/**
 * The wallet's DUST balance is a projection of what its registered NIGHT will
 * have generated by the next block, so a call can arrive a few seconds early.
 * Retry only that case; every other failure is reported as-is.
 */
async function callWithDustRetry<T>(label: string, invoke: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 20;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await invoke();
    } catch (error: any) {
      const diagnostic = `${error?.message ?? ''} ${error?.cause?.message ?? ''} ${String(error)}`;
      const isDustShortage =
        diagnostic.includes('Not enough Dust') ||
        diagnostic.includes('Insufficient Funds') ||
        diagnostic.includes('could not balance dust');
      if (!isDustShortage || attempt >= MAX_ATTEMPTS) throw error;
      console.log(`  ⏳ ${label}: waiting for DUST (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

function reportTx(label: string, tx: any): void {
  console.log(`  ✅ ${label}`);
  console.log(`     txHash:      ${tx.public.txHash}`);
  console.log(`     txId:        ${tx.public.txId}`);
  console.log(`     blockHeight: ${tx.public.blockHeight}`);
  console.log(`     status:      ${tx.public.status}\n`);
}

async function claimOrganizer(providers: any, address: string, secret: Uint8Array) {
  const contract = await attach(providers, address, createVeilGatePrivateState(secret));
  console.log('  Proving claimOrganizer (this can take minutes)...');
  const tx = await callWithDustRetry('claimOrganizer', () => contract.callTx.claimOrganizer());
  reportTx('claimOrganizer', tx);
  return tx;
}

async function registerMember(
  providers: any,
  address: string,
  organizerSecret: Uint8Array,
  commitment: Uint8Array,
) {
  const contract = await attach(providers, address, createVeilGatePrivateState(organizerSecret));
  console.log(`  Registering member commitment ${hex(commitment)}`);
  console.log('  Proving registerMember (this can take minutes)...');
  const tx = await callWithDustRetry('registerMember', () =>
    contract.callTx.registerMember(commitment),
  );
  reportTx('registerMember', tx);
  return tx;
}

async function proveMembership(providers: any, address: string, memberSecret: Uint8Array) {
  const contract = await attach(providers, address, createVeilGatePrivateState(memberSecret));
  console.log('  Proving proveMembership (this can take minutes)...');
  const tx = await callWithDustRetry<any>('proveMembership', () =>
    contract.callTx.proveMembership(),
  );
  reportTx('proveMembership', tx);
  // The circuit result is the nullifier, which the circuit itself discloses and
  // writes to the public `spent` set. Nothing else from `private` is read here.
  const nullifier: Uint8Array = tx.private.result;
  console.log(`     nullifier:   ${hex(nullifier)}\n`);
  return { tx, nullifier };
}

async function rotateEpoch(providers: any, address: string, organizerSecret: Uint8Array) {
  const contract = await attach(providers, address, createVeilGatePrivateState(organizerSecret));
  console.log('  Proving rotateEpoch (this can take minutes)...');
  const tx = await callWithDustRetry('rotateEpoch', () => contract.callTx.rotateEpoch());
  reportTx('rotateEpoch', tx);
  return tx;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const command = parseCommand(process.argv);
  const contractAddress = resolveContractAddress();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  VeilGate CLI: ${command} on ${network}`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`  Contract: ${contractAddress}\n`);

  if (command === 'state') {
    const publicDataProvider = indexerPublicDataProvider(
      networkConfig.indexer,
      networkConfig.indexerWS,
    );
    console.log('─── Ledger ─────────────────────────────────────────────────────\n');
    await printLedger(publicDataProvider, contractAddress);
    process.exit(0);
  }

  await waitForProofServer();

  const seed = getOrCreateSeed(network);
  const organizerSecret = identitySecret(seed, 'organizer');
  const memberSecret = identitySecret(seed, 'member');
  const commitment = memberCommitment(memberSecret);

  console.log('─── Wallet ─────────────────────────────────────────────────────\n');
  const walletCtx = await connectWallet(seed);
  const providers = createProviders(walletCtx, seed);

  try {
    console.log('─── Circuits ───────────────────────────────────────────────────\n');
    switch (command) {
      case 'claim-organizer':
        await claimOrganizer(providers, contractAddress, organizerSecret);
        break;
      case 'register-member':
        await registerMember(providers, contractAddress, organizerSecret, commitment);
        break;
      case 'prove-membership':
        await proveMembership(providers, contractAddress, memberSecret);
        break;
      case 'rotate-epoch':
        await rotateEpoch(providers, contractAddress, organizerSecret);
        break;
      case 'run':
        await claimOrganizer(providers, contractAddress, organizerSecret);
        await registerMember(providers, contractAddress, organizerSecret, commitment);
        await proveMembership(providers, contractAddress, memberSecret);
        break;
      default:
        throw new Error(`Unhandled command: ${command}`);
    }

    console.log('─── Ledger ─────────────────────────────────────────────────────\n');
    await printLedger(providers.publicDataProvider, contractAddress);
  } finally {
    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) console.error(`   Cause: ${cause.message}`);
  process.exit(1);
});
