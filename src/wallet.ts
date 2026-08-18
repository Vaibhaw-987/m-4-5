// Wallet construction + sync-state restore.
//
// Mirrors network.ts in structure. The on-disk format and pure I/O live in
// wallet-state.ts (unit-tested from the scaffolder workspace, no SDK deps);
// this file is the glue between that format and the wallet SDK.

import { Buffer } from 'buffer';

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { mergeWalletEntries, WalletEntrySchema, WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

import type { NetworkConfig, NetworkId } from './network';
import {
  CHILD_KINDS,
  loadWalletState,
  saveWalletState,
  type ChildKind,
  type PersistedWalletState,
} from './wallet-state';

export { unshieldedToken };
export type { PersistedWalletState };
export {
  loadWalletState,
  saveWalletState,
  clearWalletState,
  WALLET_STATE_DIR,
  WALLET_STATE_VERSION,
} from './wallet-state';

function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

export interface WalletContext {
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
  restored: { shielded: boolean; unshielded: boolean; dust: boolean };
  started: { shielded: boolean; unshielded: boolean; dust: boolean };
}

export type WalletSyncMode = 'full' | 'public-funds';

export interface CreateWalletOptions {
  network: NetworkId;
  networkConfig: NetworkConfig;
  seed: string;
  /**
   * Whether to attempt to restore each child wallet from saved state.
   * Defaults to true. Pass false to force a from-seed sync (used by tests).
   */
  restore?: boolean;
  /**
   * `public-funds` starts only the unshielded and DUST children. It is safe for
   * a brand-new deployment wallet that never receives or spends shielded
   * assets, and avoids replaying the network's entire Zswap history.
   */
  syncMode?: WalletSyncMode;
  cwd?: string;
}

function warnRestoreFailure(kind: ChildKind, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`  ⚠ Could not restore ${kind} wallet state (${msg}); falling back to fresh sync.\n`);
}

/**
 * Build the wallet facade, restoring each child from saved state when
 * available and falling back to a from-seed start when not (or when restore
 * throws, e.g. after an SDK upgrade with an incompatible state format).
 *
 * In `full` mode the caller can use `wallet.waitForSyncedState()`. In
 * `public-funds` mode wait for the unshielded and DUST children individually;
 * the shielded child intentionally remains at its empty initial state.
 */
export async function createWallet(opts: CreateWalletOptions): Promise<WalletContext> {
  setNetworkId(opts.networkConfig.networkId);

  const keys = deriveKeys(opts.seed);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const saved: PersistedWalletState = opts.restore === false
    ? {}
    : loadWalletState(opts.network, { cwd: opts.cwd });

  const restored = { shielded: false, unshielded: false, dust: false };

  // The DUST ledger is a global append-only tree, so even a brand-new wallet
  // must replay the historical events once before it can append future
  // generation records. The SDK defaults (10 events per batch plus a 4 ms
  // inter-batch delay) favor interactive clients, but make this one-time CI
  // catch-up take longer than the hosted-runner window. Larger batches remove
  // most per-batch WASM overhead while the indexer client's bounded queue still
  // supplies backpressure. Full interactive wallets keep the SDK defaults.
  const batchUpdates = opts.syncMode === 'public-funds'
    ? { size: 500, timeout: 25, spacing: 0 }
    : undefined;

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: opts.networkConfig.indexer,
      indexerWsUrl: opts.networkConfig.indexerWS,
    },
    provingServerUrl: new URL(opts.networkConfig.proofServer),
    relayURL: new URL(opts.networkConfig.node.replace(/^http/, 'ws')),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    ...(batchUpdates === undefined ? {} : { batchUpdates }),
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: async (config) => {
      const cls = ShieldedWallet(config);
      if (saved.shielded !== undefined) {
        try {
          const restoredWallet = await (cls as any).restore(saved.shielded);
          restored.shielded = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('shielded', err);
        }
      }
      return cls.startWithSecretKeys(shieldedSecretKeys);
    },
    unshielded: async (config) => {
      const cls = UnshieldedWallet(config);
      if (saved.unshielded !== undefined) {
        try {
          const restoredWallet = await (cls as any).restore(saved.unshielded);
          restored.unshielded = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('unshielded', err);
        }
      }
      return cls.startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));
    },
    dust: async (config) => {
      const cls = DustWallet(config);
      if (saved.dust !== undefined) {
        try {
          const restoredWallet = await (cls as any).restore(saved.dust);
          restored.dust = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('dust', err);
        }
      }
      return cls.startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);
    },
  });

  const started = {
    shielded: opts.syncMode !== 'public-funds',
    unshielded: true,
    dust: true,
  };

  if (started.shielded) {
    await wallet.start(shieldedSecretKeys, dustSecretKey);
  } else {
    // Contract deployment pays with public tNIGHT/DUST only. Starting the
    // shielded child would replay every historical Zswap event even though
    // this fresh wallet cannot own any of them. The facade's submission and
    // pending-transaction services still need to run.
    await Promise.all([
      wallet.unshielded.start(),
      wallet.dust.start(dustSecretKey),
      wallet.pendingTransactionsService.start(),
    ]);
  }

  return {
    wallet,
    shieldedSecretKeys,
    dustSecretKey,
    unshieldedKeystore,
    restored,
    started,
  };
}

/**
 * Serialize each child wallet's current state and persist it for the next run.
 * Safe to call multiple times. Logs but does not throw on individual failures —
 * losing one child's state means the next run re-syncs that child only.
 */
export async function persistWalletState(
  network: NetworkId,
  ctx: WalletContext,
  cwd?: string,
): Promise<void> {
  const next: PersistedWalletState = {};

  for (const kind of CHILD_KINDS) {
    if (!ctx.started[kind]) continue;
    try {
      const child = (ctx.wallet as unknown as Record<ChildKind, { serializeState: () => Promise<unknown> }>)[kind];
      const serialized = await child.serializeState();
      if (kind === 'dust') {
        next.dust = serialized as string;
      } else {
        next[kind] = serialized;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ⚠ Could not serialize ${kind} wallet state (${msg}); next run will re-sync.\n`);
    }
  }

  saveWalletState(network, next, { cwd });
}
