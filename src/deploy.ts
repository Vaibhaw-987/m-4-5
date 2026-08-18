/**
 * Deploy veilpledge contract to a Midnight network (undeployed by default; use --network preview|preprod for public networks).
 *
 * Non-interactive: scaffold → npm run setup runs straight through.
 * No readline prompts, no .midnight-seed file.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { resolveNetwork, getOrCreateSeed, recordDeployment, type NetworkId } from './network';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { resolvePrivateStatePassword } from './private-state';
import { deploymentRecordFile, resolveDeployTarget } from './deploy-target';

// Midnight SDK imports
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// The LevelDB provider stores encrypted private state and signing keys. Keep
// the database private even when the invoking shell has a permissive umask.
process.umask(0o077);

// ─── Network configuration ─────────────────────────────────────────────────────
//
// Resolved from --network flag, .midnight-state.json, or defaulting to
// 'undeployed' (local devnet). Switch networks with: npm run network <name>

const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

// Deployment runs can be public CI logs. Never stringify SDK errors: custom
// fields may contain unsubmitted transaction or proving context.
function publicDiagnostic(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? 'Unknown error');
  return raw
    .replace(/\b(seed|secret|privateState|witness)\s*[:=]\s*\S+/giu, '$1=[redacted]')
    .replace(/\b(?:0x)?[0-9a-f]{64,}\b/giu, '[redacted hex]')
    .replace(/[A-Za-z0-9+/=_-]{160,}/gu, '[redacted payload]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 400);
}

function logPublicFailure(error: unknown): void {
  const name = error instanceof Error && error.name ? error.name : 'DeploymentError';
  const message = error instanceof Error ? error.message : '';
  console.error(`\n❌ ${name}: ${publicDiagnostic(error)}`);
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error && cause.message !== message) {
    console.error(`   Cause: ${publicDiagnostic(cause)}`);
  }
}

// ─── Proof server readiness ────────────────────────────────────────────────────
//
// The proof-server image is distroless and has no shell, so it can't run a
// container-side healthcheck. Poll it from the host before we submit anything
// that needs proofs.

async function waitForProofServer(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(networkConfig.proofServer, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      if (code !== 'ECONNREFUSED' && code !== 'UND_ERR_CONNECT_TIMEOUT' && code !== 'UND_ERR_SOCKET') {
        return true;
      }
    }
    if (attempt < maxAttempts) {
      process.stdout.write(`\r  Waiting for proof server... (${attempt}/${maxAttempts})   `);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function firstValueWithin<T>(
  source: Rx.Observable<T>,
  timeoutMs: number,
  timeoutMessage: () => string,
): Promise<T> {
  try {
    return await Rx.firstValueFrom(source.pipe(Rx.timeout({ first: timeoutMs })));
  } catch (error) {
    if (error instanceof Rx.TimeoutError) throw new Error(timeoutMessage());
    throw error;
  }
}

// ─── Compiled contract loading ─────────────────────────────────────────────────

const target = resolveDeployTarget();
const { compiledContract } = await target.load();

// Only these finalized, on-chain fields are safe to publish. deployTxData also
// contains signing material, the initial private state, and transaction-local
// secrets, so it must never be spread or serialized as a whole.
interface PublicDeploymentRecord {
  network: Exclude<NetworkId, 'undeployed'>;
  contractAddress: string;
  transactionHash: string;
  blockHeight: number;
  deployedAt: string;
}

function writePublicDeploymentRecord(record: PublicDeploymentRecord): void {
  const directory = path.join(process.cwd(), 'deployments');
  const recordPath = path.join(directory, deploymentRecordFile(target, record.network));
  const temporaryPath = `${recordPath}.tmp-${process.pid}-${Date.now()}`;

  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, recordPath);
  } finally {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup only; the tracked record is public data.
    }
  }
}

// ─── Providers ─────────────────────────────────────────────────────────────────

async function createProviders(walletCtx: WalletContext) {
  const privateStatePassword = resolvePrivateStatePassword(
    SEED,
    network,
    process.env.PRIVATE_STATE_PASSWORD,
  );
  const walletProvider = {
    // This deployment wallet never receives shielded assets, so its shielded
    // child is intentionally not started. These public keys are deterministic
    // seed derivatives and do not require a historical Zswap replay.
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

  const zkConfigProvider = new NodeZkConfigProvider(target.zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: target.privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Deploy ${target.name} to ${network}`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const seed = SEED;

  console.log('─── Wallet setup ───────────────────────────────────────────────\n');
  console.log('  Creating wallet...');
  const walletCtx = await createWallet({
    network,
    networkConfig,
    seed,
    syncMode: 'public-funds',
  });
  const address = walletCtx.unshieldedKeystore.getBech32Address();
  console.log(`  Wallet Address: ${address}\n`);
  const activeKinds = Object.entries(walletCtx.started)
    .filter(([, started]) => started)
    .map(([kind]) => kind);
  const restoredCount = activeKinds.filter(
    (kind) => walletCtx.restored[kind as keyof typeof walletCtx.restored],
  ).length;
  if (restoredCount > 0) {
    console.log(
      `  Restored ${restoredCount}/${activeKinds.length} active child wallets from ` +
        '.midnight-wallet-state — sync will resume from saved point.',
    );
  }

  console.log('  Syncing public-funds wallets with network...');
  console.log('  ℹ  This may take several minutes depending on network size.');
  console.log('     Shielded history replay is skipped for this fresh deployment wallet.');
  console.log('     RPC disconnection messages during sync are normal and can be safely ignored.\n');
  const syncStart = Date.now();
  let unshieldedProgress = 'connecting';
  let dustProgress = 'connecting';
  const progressSubscriptions = [
    walletCtx.wallet.unshielded.state.subscribe((walletState) => {
      unshieldedProgress =
        `${walletState.progress.appliedId}/${walletState.progress.highestTransactionId}`;
    }),
    walletCtx.wallet.dust.state.subscribe((walletState) => {
      dustProgress =
        `${walletState.progress.appliedIndex}/${walletState.progress.highestRelevantWalletIndex}`;
    }),
  ];
  const syncInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - syncStart) / 1000);
    console.log(
      `  ⏳ Syncing (${elapsed}s): unshielded ${unshieldedProgress}; DUST ${dustProgress}`,
    );
  }, 10_000);
  const rawSyncTimeout = Number(process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS);
  const syncTimeoutMs =
    Number.isFinite(rawSyncTimeout) && rawSyncTimeout > 0 ? rawSyncTimeout : 60 * 60_000;
  let balance = 0n;
  try {
    const [unshieldedState] = await firstValueWithin(
      Rx.combineLatest([
        walletCtx.wallet.unshielded.state.pipe(
          Rx.filter((state) => state.progress.isStrictlyComplete()),
        ),
        walletCtx.wallet.dust.state.pipe(
          Rx.filter((state) => state.progress.isStrictlyComplete()),
        ),
      ]),
      syncTimeoutMs,
      () =>
        `Wallet sync exceeded ${Math.round(syncTimeoutMs / 60_000)} minutes ` +
        `(unshielded ${unshieldedProgress}; DUST ${dustProgress}).`,
    );
    balance = unshieldedState.balances[unshieldedToken().raw] ?? 0n;
  } catch (error) {
    await walletCtx.wallet.stop();
    throw error;
  } finally {
    clearInterval(syncInterval);
    for (const subscription of progressSubscriptions) subscription.unsubscribe();
  }
  process.stdout.write('\r  ✓ Synced with network.                                      \n');

  // Persist sync state now so a later deploy failure doesn't waste the sync work.
  await persistWalletState(network, walletCtx);

  console.log(`\n  Balance: ${balance.toLocaleString()} tNight\n`);

  if (network === 'undeployed' && balance === 0n) {
    console.error(
      '\n❌ Genesis-seed wallet has zero NIGHT. The devnet preset may not have minted to it.\n' +
        '   Check `docker compose ps` and `docker compose logs node`. Then `docker compose down -v` and retry.\n',
    );
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  // Faucet poll for public networks. The wallet has 0 tNIGHT until the user
  // funds the address from the network's faucet. The display balance is
  // authoritative here (unlike DUST, tNIGHT shows up immediately once the
  // faucet tx lands).
  if (network !== 'undeployed' && networkConfig.faucet) {
    // Same balance idiom used by check-balance.ts:
    //   state.unshielded.balances[unshieldedToken().raw] ?? 0n
    const initialBalance = await walletCtx.wallet.unshielded.waitForSyncedState();
    const initialTNight = initialBalance.balances[unshieldedToken().raw] ?? 0n;
    if (initialTNight === 0n) {
      console.log('─── Fund Wallet ────────────────────────────────────────────────\n');
      console.log(`  Wallet address: ${address}`);
      console.log(`  Faucet:         ${networkConfig.faucet}`);
      console.log('');
      console.log('  Waiting for tNIGHT to arrive (poll every 10s)...');
      const rawTimeout = Number(process.env.MIDNIGHT_FAUCET_TIMEOUT_MS);
      const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600_000;
      const deadline = Date.now() + timeoutMs;
      while (true) {
        const beforeSleep = deadline - Date.now();
        if (beforeSleep <= 0) {
          throw new Error(
            `Funding not received within ${Math.round(timeoutMs / 60_000)} minutes. ` +
              `Address: ${address}. Faucet: ${networkConfig.faucet}.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, beforeSleep)));
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(
            `Funding not received within ${Math.round(timeoutMs / 60_000)} minutes. ` +
              `Address: ${address}. Faucet: ${networkConfig.faucet}.`,
          );
        }
        const s = await firstValueWithin(
          walletCtx.wallet.unshielded.state.pipe(
            Rx.filter((state) => state.progress.isStrictlyComplete()),
          ),
          remaining,
          () =>
            `Funding observation stalled before tNIGHT arrived. Address: ${address}. ` +
              `Faucet: ${networkConfig.faucet}.`,
        );
        const tn = s.balances[unshieldedToken().raw] ?? 0n;
        if (tn > 0n) {
          console.log(`\n  Funded! tNIGHT balance: ${tn.toLocaleString()}\n`);
          break;
        }
        const elapsed = Math.round((timeoutMs - (deadline - Date.now())) / 1000);
        process.stdout.write(`\r  ...still waiting (${elapsed}s elapsed)`);
      }
    }
  }

  // Register for DUST.
  console.log('─── DUST Token Setup ───────────────────────────────────────────\n');
  // Preview RPC WebSockets occasionally close normally while the wallet is
  // watching a submitted transaction. The transaction may still land, so a
  // blind retry risks submitting the same registration twice. Re-read live
  // wallet state before every attempt and stop as soon as the UTXO is marked
  // registered. Custom error 138 is BalanceCheckOverspend in the current node
  // runtime; immediately after faucet funding it can also be a transient race
  // between the indexer-visible UTXO and the ledger context used for validation.
  const MAX_REGISTRATION_ATTEMPTS = 5;
  const registrationDeadline = Date.now() + 5 * 60_000;
  let lastRegistrationWaitLog = 0;
  for (let attempt = 1; attempt <= MAX_REGISTRATION_ATTEMPTS;) {
    const registrationState = await Rx.firstValueFrom(
      walletCtx.wallet.unshielded.state.pipe(
        Rx.filter((state) => state.progress.isStrictlyComplete()),
      ),
    );
    const unregisteredUtxos = registrationState.availableCoins.filter(
      (c: any) => !c.meta?.registeredForDustGeneration,
    );

    if (unregisteredUtxos.length === 0) {
      if (attempt > 1) console.log('  NIGHT UTXO registration confirmed.');
      break;
    }

    // Wallet SDK <= 1.1 could construct a registration whose
    // allow_fee_payment was below the transaction fee. Preview rejects that as
    // BalanceCheckOverspend (custom error 138). Estimate against the same live
    // UTXOs and wait until the highest-generation guaranteed input can cover
    // the fee before constructing a fresh transaction.
    const { fee, dustGenerationEstimations } = await walletCtx.wallet.estimateRegistration(
      unregisteredUtxos,
    );
    const generated = dustGenerationEstimations.reduce(
      (maximum, item) => item.dust.generatedNow > maximum ? item.dust.generatedNow : maximum,
      0n,
    );
    if (generated < fee) {
      if (Date.now() >= registrationDeadline) {
        throw new Error(
          `DUST registration fee was not covered within 5 minutes ` +
            `(generated ${generated.toLocaleString()} of ${fee.toLocaleString()}).`,
        );
      }
      if (Date.now() - lastRegistrationWaitLog >= 10_000) {
        console.log(
          `  Generating registration DUST: ${generated.toLocaleString()} / ${fee.toLocaleString()}...`,
        );
        lastRegistrationWaitLog = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }

    console.log(
      `  Registering ${unregisteredUtxos.length} NIGHT UTXOs for DUST generation` +
        (attempt > 1 ? ` (attempt ${attempt}/${MAX_REGISTRATION_ATTEMPTS})...` : '...'),
    );

    try {
      // The signDustRegistration callback (3rd arg) already produces a recipe
      // with N signatures matching N inputs. Do NOT call signRecipe again —
      // doing so causes InputsSignaturesLengthMismatch (custom error 192).
      const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
        unregisteredUtxos,
        walletCtx.unshieldedKeystore.getPublicKey(),
        (payload) => walletCtx.unshieldedKeystore.signData(payload),
      );
      const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
      await walletCtx.wallet.submitTransaction(finalized);
      break;
    } catch (error: any) {
      // Effect's FiberFailure keeps the useful nested SDK cause in its custom
      // toString(); `.message` only contains the outer "Transaction submission
      // error" text. Include both forms so Preview WebSocket closures and node
      // error codes remain visible to the retry classifier.
      const messages: string[] = [error?.name ?? '', String(error), error?.stack ?? ''];
      let cursor: any = error;
      for (let depth = 0; cursor && depth < 6; depth++) {
        messages.push(cursor?.message ?? String(cursor));
        cursor = cursor?.cause;
      }
      const diagnostic = messages.join(' | ');
      const retryable =
        diagnostic.includes('Custom error: 138') ||
        diagnostic.includes('disconnected from') ||
        diagnostic.includes('Normal Closure') ||
        diagnostic.includes('ECONNRESET') ||
        diagnostic.includes('ETIMEDOUT');

      if (!retryable) throw error;

      console.log('  Registration not yet confirmed; refreshing wallet state in 10s...');
      await new Promise((resolve) => setTimeout(resolve, 10_000));

      // A closed submission socket is ambiguous: the transaction can still
      // have reached the node. Confirm once more after the delay, including
      // after the final attempt, before deciding that registration failed.
      const refreshedState = await Rx.firstValueFrom(
        walletCtx.wallet.unshielded.state.pipe(
          Rx.filter((state) => state.progress.isStrictlyComplete()),
        ),
      );
      const stillUnregistered = refreshedState.availableCoins.some(
        (coin: any) => !coin.meta?.registeredForDustGeneration,
      );
      if (!stillUnregistered) {
        console.log('  NIGHT UTXO registration confirmed.');
        break;
      }
      if (attempt === MAX_REGISTRATION_ATTEMPTS) throw error;
      attempt += 1;
    }
  }

  const dustState = await walletCtx.wallet.dust.waitForSyncedState();
  if (dustState.balance(new Date()) === 0n) {
    console.log('  Waiting for DUST tokens...');
    const rawDustTimeout = Number(process.env.MIDNIGHT_DUST_TIMEOUT_MS);
    const dustTimeoutMs =
      Number.isFinite(rawDustTimeout) && rawDustTimeout > 0 ? rawDustTimeout : 10 * 60_000;
    let latestDustBalance = dustState.balance(new Date());
    let latestDustProgress =
      `${dustState.progress.appliedIndex}/${dustState.progress.highestRelevantWalletIndex}`;
    await firstValueWithin(
      walletCtx.wallet.dust.state.pipe(
        Rx.tap((state) => {
          latestDustBalance = state.balance(new Date());
          latestDustProgress =
            `${state.progress.appliedIndex}/${state.progress.highestRelevantWalletIndex}`;
        }),
        Rx.filter((state) => state.progress.isStrictlyComplete()),
        Rx.filter((state) => state.balance(new Date()) > 0n),
      ),
      dustTimeoutMs,
      () =>
        `DUST balance stayed at ${latestDustBalance.toLocaleString()} for ` +
          `${Math.round(dustTimeoutMs / 60_000)} minutes ` +
          `(sync ${latestDustProgress}).`,
    );
  }
  console.log('  DUST tokens ready!\n');

  // Deploy.
  console.log('─── Deploy Contract ────────────────────────────────────────────\n');

  console.log('  Checking proof server...');
  const proofServerReady = await waitForProofServer();
  if (!proofServerReady) {
    console.log('\n  ❌ Proof server not responding. Run: docker compose up -d\n');
    await walletCtx.wallet.stop();
    process.exit(1);
  }
  process.stdout.write('\r  Proof server ready!                                 \n');

  console.log('  Setting up providers...');
  const providers = await createProviders(walletCtx);

  // The wallet's reported DUST balance is a *time-projection* of what its
  // registered NIGHT will eventually generate; the tx-builder spends only
  // what the next block's timestamp accounts for, which lags wall-clock by
  // ~1 block on a fresh devnet. Sleeping ~1 block-time before attempt 1
  // closes that gap in the common case; the retry loop covers outliers.
  process.stdout.write('  Generating DUST...');
  await new Promise((r) => setTimeout(r, 6000));
  process.stdout.write(' done.\n');

  console.log('  Deploying contract...\n');

  // Fallback timing. The 6s pre-pause above handles the common case; this
  // loop covers genuine outliers (slow blocks, proof-server worker-pool
  // settling). Earlier 2s retries caused CI flakes where attempt 2's /prove
  // hit the proof-server before it had drained attempt 1's state — 5s gives
  // it room to settle between attempts. 20 × 5 = 100s total budget.
  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 5000;
  let deployed: Awaited<ReturnType<typeof deployContract>> | undefined;
  const initialPrivateState = target.createInitialPrivateState();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      deployed = await deployContract(providers, {
        compiledContract: compiledContract as any,
        args: [],
        privateStateId: target.privateStateId,
        initialPrivateState,
      });
      break;
    } catch (err: any) {
      const errMsg = err?.message || err?.toString() || '';
      const errCause = err?.cause?.message || err?.cause?.toString() || '';
      const fullError = `${errMsg} ${errCause}`;

      // DUST shortage is the most common transient failure on a fresh devnet —
      // check it BEFORE proof-server connectivity, because dust-balancing errors
      // can surface through proof-server-shaped messages (the wallet talks to
      // the proof-server while building the dust portion of the tx).
      const isDustShortage =
        fullError.includes('Not enough Dust') ||
        fullError.includes('Insufficient Funds') ||
        fullError.includes('could not balance dust');

      // Quiet the first DUST-shortage retry: it's the expected race between
      // wall-clock projection and block-timestamp accounting and the loud
      // `Insufficient Funds: <huge number>` message scares first-time users.
      // Real failures still get the full diagnostic from attempt 2 onward.
      if (!(isDustShortage && attempt === 1)) {
        console.error(`\n  Attempt ${attempt} error: ${publicDiagnostic(errMsg)}`);
        if (errCause && errCause !== errMsg) {
          console.error(`  Cause: ${publicDiagnostic(errCause)}`);
        }
      }

      if (
        !isDustShortage &&
        (fullError.includes('Failed to connect to Proof Server') ||
          fullError.includes('connect ECONNREFUSED 127.0.0.1:6300'))
      ) {
        console.log('  ❌ Proof server unreachable. Run: docker compose up -d\n');
        await walletCtx.wallet.stop();
        process.exit(1);
      }

      if (isDustShortage) {
        const currentState = await walletCtx.wallet.dust.waitForSyncedState();
        const dustBalance = currentState.balance(new Date());
        if (attempt < MAX_RETRIES) {
          if (attempt === 1) {
            console.log(`  Still generating DUST, retrying in ${RETRY_DELAY_MS / 1000}s...`);
          } else {
            console.log(`  ⏳ DUST balance: ${dustBalance.toLocaleString()} (attempt ${attempt}/${MAX_RETRIES}); retrying in ${RETRY_DELAY_MS / 1000}s...`);
          }
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        } else {
          console.log(`  ❌ Not enough DUST after ${MAX_RETRIES} retries (current: ${dustBalance.toLocaleString()})`);
          await walletCtx.wallet.stop();
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  }

  if (!deployed) throw new Error('Deployment failed after all retries');

  const {
    contractAddress,
    txHash: transactionHash,
    blockHeight,
  } = deployed.deployTxData.public;
  console.log('  ✅ Contract deployed successfully!\n');
  console.log(`  Contract Address: ${contractAddress}\n`);

  recordDeployment(network, contractAddress, address.toString());
  console.log('  Saved to .midnight-state.json\n');

  if (network === 'preview' || network === 'preprod') {
    writePublicDeploymentRecord({
      network,
      contractAddress,
      transactionHash,
      blockHeight,
      deployedAt: new Date().toISOString(),
    });
    console.log(`  Saved public deployment proof to deployments/${deploymentRecordFile(target, network)}\n`);
  }

  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
  console.log('─── Deployment complete ────────────────────────────────────────\n');
  console.log('  Next: npm run cli\n');
}

main().catch((err) => {
  logPublicFailure(err);
  process.exit(1);
});
