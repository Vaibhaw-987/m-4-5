import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PREPROD_DEPLOYMENT } from "../generated/deployment";
import {
  connectVeilPledge,
  queryPreprodPublicState,
  WalletConnectorNotFoundError,
  WalletNetworkMismatchError,
  WalletSessionChangedError,
  type CreatePledgeResult,
  type CompletePledgeResult,
  type VeilPledgeClient,
  type VeilPledgePublicState,
  type VeilPledgeState,
} from "../lib";
import type {
  LedgerSnapshot,
  SuccessTransaction,
  VeilPledgeActions,
  VeilPledgeViewModel,
  WalletNoticeKind,
  WalletView,
} from "../types";

type PublicOrConnectedState = VeilPledgePublicState | VeilPledgeState;
type RetryAction = "connect" | "create" | "complete";
type LedgerLoadState = "Loading" | "Ready" | "Unavailable";

class ConnectionCancelledError extends Error {
  override readonly name = "ConnectionCancelledError";
}

type Interaction =
  | { kind: "idle" }
  | { kind: "connecting" }
  | {
      kind: "busy";
      operation: "creating" | "proving" | "submitting";
      pledgeText?: string;
      progressMessage?: string;
    }
  | {
      kind: "success";
      outcome: "created" | "completed";
      pledgeText: string;
      transaction: SuccessTransaction;
    }
  | {
      kind: "error";
      title: string;
      message: string;
      noticeKind: WalletNoticeKind;
      retryLabel?: string;
    };

const DEFAULT_DRAFT = "Ship the VeilPledge beta";
const PREPROD_EXPLORER_URL = "https://preprod.midnightexplorer.com/";
const UNAVAILABLE_LEDGER: LedgerSnapshot = {
  boardStatus: "Unavailable",
  sequence: "—",
  completed: "—",
  ownerCommitment: "Not indexed",
};

const deploymentIsValid = /^[0-9a-f]{64}$/iu.test(
  PREPROD_DEPLOYMENT.contractAddress,
);

const shorten = (value: string, start = 8, end = 6): string =>
  value.length <= start + end + 1
    ? value
    : `${value.slice(0, start)}…${value.slice(-end)}`;

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replace(/\s+/gu, " ").trim();
  if (!normalized) return "The request ended without an error message.";
  return normalized.length > 240 ? `${normalized.slice(0, 237)}…` : normalized;
};

const toErrorInteraction = (error: unknown): Extract<Interaction, { kind: "error" }> => {
  if (error instanceof WalletConnectorNotFoundError) {
    return {
      kind: "error",
      title: "Lace wallet not found",
      message: "Install or enable Lace, then return here to connect on Preprod.",
      noticeKind: "lace-missing",
      retryLabel: "Check again",
    };
  }

  if (error instanceof WalletNetworkMismatchError) {
    return {
      kind: "error",
      title: "Switch Lace to Preprod",
      message: error.message,
      noticeKind: "wrong-network",
      retryLabel: "Check network again",
    };
  }

  if (error instanceof WalletSessionChangedError) {
    return {
      kind: "error",
      title: "Reconnect Lace",
      message: error.message,
      noticeKind: "disconnected",
      retryLabel: "Reconnect and try again",
    };
  }

  const message = errorMessage(error);
  if (/reject|declin|denied|cancel(?:led)?|not approved/iu.test(message)) {
    return {
      kind: "error",
      title: "Authorization was not approved",
      message: "Nothing was submitted. You can safely try the wallet request again.",
      noticeKind: "rejected",
      retryLabel: "Try again",
    };
  }

  return {
    kind: "error",
    title: "Action could not be completed",
    message,
    noticeKind: "generic",
    retryLabel: "Try again",
  };
};

const toLedgerSnapshot = (
  state: PublicOrConnectedState | undefined,
  loadState: LedgerLoadState,
): LedgerSnapshot => {
  if (loadState !== "Ready" || !state) {
    return loadState === "Loading"
      ? { ...UNAVAILABLE_LEDGER, boardStatus: "Loading" }
      : UNAVAILABLE_LEDGER;
  }
  return {
    boardStatus: state.status === "active" ? "Active" : "Open",
    sequence: state.sequence.toString(),
    completed: state.completionCount.toString(),
    ownerCommitment: state.ownerCommitment,
    ownerCommitmentLabel: shorten(state.ownerCommitment, 8, 6),
  };
};

const isOwnerState = (state?: PublicOrConnectedState): state is VeilPledgeState =>
  Boolean(state && "isOwner" in state && state.isOwner);

const toSuccessTransaction = (
  result: CreatePledgeResult | CompletePledgeResult,
): SuccessTransaction => ({
  label: shorten(result.txHash, 8, 6),
  hash: result.txHash,
  href: PREPROD_EXPLORER_URL,
  blockHeight: result.blockHeight.toLocaleString(),
  previousCommitment: shorten(result.previousCommitment, 8, 6),
  newSequence: result.newSequence.toString(),
});

interface Unsubscribable {
  unsubscribe(): void;
}

export interface VeilPledgeController {
  viewModel: VeilPledgeViewModel;
  actions: VeilPledgeActions;
}

export function useVeilPledge(): VeilPledgeController {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [walletAddress, setWalletAddress] = useState<string>();
  const [snapshot, setSnapshotState] = useState<PublicOrConnectedState>();
  const [ledgerLoadState, setLedgerLoadState] =
    useState<LedgerLoadState>("Loading");
  const [interaction, setInteraction] = useState<Interaction>({ kind: "idle" });

  const mountedRef = useRef(true);
  const snapshotRef = useRef<PublicOrConnectedState | undefined>(undefined);
  const clientRef = useRef<VeilPledgeClient | undefined>(undefined);
  const connectionRef = useRef<Promise<VeilPledgeClient> | undefined>(undefined);
  const subscriptionRef = useRef<Unsubscribable | undefined>(undefined);
  const operationRef = useRef(false);
  const lastActionRef = useRef<RetryAction>("connect");
  const connectionGenerationRef = useRef(0);

  const updateSnapshot = useCallback((next: PublicOrConnectedState) => {
    snapshotRef.current = next;
    if (mountedRef.current) {
      setSnapshotState(next);
      setLedgerLoadState("Ready");
    }
  }, []);

  const invalidateWalletSession = useCallback(() => {
    connectionGenerationRef.current += 1;
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = undefined;
    connectionRef.current = undefined;
    clientRef.current = undefined;
    if (mountedRef.current) setWalletAddress(undefined);
  }, []);

  const showActionError = useCallback((error: unknown) => {
    if (
      error instanceof WalletNetworkMismatchError ||
      error instanceof WalletSessionChangedError
    ) {
      invalidateWalletSession();
    }
    if (!mountedRef.current) return;
    setInteraction(
      error instanceof ConnectionCancelledError
        ? { kind: "idle" }
        : toErrorInteraction(error),
    );
  }, [invalidateWalletSession]);

  const readPublicState = useCallback(async () => {
    if (!deploymentIsValid) {
      if (mountedRef.current) setLedgerLoadState("Unavailable");
      return;
    }
    try {
      const state = await queryPreprodPublicState(
        PREPROD_DEPLOYMENT.contractAddress,
      );
      if (!clientRef.current) updateSnapshot(state);
    } catch {
      // The app remains usable for a wallet retry when the public indexer is
      // briefly unavailable. A connected action will surface a concrete error.
      if (!clientRef.current && mountedRef.current) {
        setLedgerLoadState("Unavailable");
      }
    }
  }, [updateSnapshot]);

  useEffect(() => {
    mountedRef.current = true;
    void readPublicState();
    return () => {
      mountedRef.current = false;
      subscriptionRef.current?.unsubscribe();
    };
  }, [readPublicState]);

  const connectClient = useCallback(async (): Promise<VeilPledgeClient> => {
    if (clientRef.current) return clientRef.current;
    if (connectionRef.current) return connectionRef.current;
    if (!deploymentIsValid) {
      throw new Error(
        "The Preprod contract deployment has not been published with this build yet.",
      );
    }

    const connectionGeneration = connectionGenerationRef.current;

    const connection = (async () => {
      const client = await connectVeilPledge({
        contractAddress: PREPROD_DEPLOYMENT.contractAddress,
      });
      const state = await client.queryState();

      if (
        !mountedRef.current ||
        connectionGeneration !== connectionGenerationRef.current
      ) {
        throw new ConnectionCancelledError("The local wallet connection was cancelled.");
      }
      clientRef.current = client;
      setWalletAddress(client.wallet.address);
      updateSnapshot(state);

      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = client.observeState().subscribe({
        next: (next) => {
          if (clientRef.current === client) updateSnapshot(next);
        },
        error: (error) => {
          if (clientRef.current !== client || !mountedRef.current) return;
          lastActionRef.current = "connect";
          setInteraction(toErrorInteraction(error));
        },
      });
      return client;
    })();

    connectionRef.current = connection;
    try {
      return await connection;
    } finally {
      if (connectionRef.current === connection) connectionRef.current = undefined;
    }
  }, [updateSnapshot]);

  const connect = useCallback(async () => {
    if (operationRef.current) return;
    operationRef.current = true;
    lastActionRef.current = "connect";
    try {
      const existingClient = clientRef.current;
      if (existingClient) {
        const state = await existingClient.queryState();
        updateSnapshot(state);
        subscriptionRef.current?.unsubscribe();
        subscriptionRef.current = existingClient.observeState().subscribe({
          next: updateSnapshot,
          error: (error) => {
            if (mountedRef.current) setInteraction(toErrorInteraction(error));
          },
        });
      } else {
        setInteraction({ kind: "connecting" });
        await connectClient();
      }
      if (mountedRef.current) setInteraction({ kind: "idle" });
    } catch (error) {
      showActionError(error);
    } finally {
      operationRef.current = false;
    }
  }, [connectClient, showActionError, updateSnapshot]);

  const createPledge = useCallback(async () => {
    if (operationRef.current) return;
    operationRef.current = true;
    lastActionRef.current = "create";

    try {
      const normalizedDraft = draft.trim();
      if (!normalizedDraft) throw new Error("Enter a pledge before creating it.");

      if (!clientRef.current) setInteraction({ kind: "connecting" });
      const client = await connectClient();
      setInteraction({
        kind: "busy",
        operation: "creating",
        progressMessage:
          "Lace is preparing the private witness, proof, and Preprod transaction.",
      });

      const result = await client.createPledge(normalizedDraft);
      setInteraction({
        kind: "busy",
        operation: "submitting",
        progressMessage: "The circuit succeeded. Reading the confirmed public state.",
      });
      const state = await client.queryState();
      updateSnapshot(state);
      setInteraction({
        kind: "success",
        outcome: "created",
        pledgeText: normalizedDraft,
        transaction: toSuccessTransaction(result),
      });
    } catch (error) {
      showActionError(error);
    } finally {
      operationRef.current = false;
    }
  }, [connectClient, draft, showActionError, updateSnapshot]);

  const completePledge = useCallback(async () => {
    if (operationRef.current) return;
    operationRef.current = true;
    lastActionRef.current = "complete";

    try {
      const client = await connectClient();
      const before = snapshotRef.current;
      const pledgeText = before?.status === "active" ? before.goal : undefined;
      if (!pledgeText) throw new Error("There is no active pledge to complete.");

      setInteraction({
        kind: "busy",
        operation: "proving",
        pledgeText,
        progressMessage:
          "Lace is preparing an ownership proof without publishing your secret.",
      });
      const result = await client.completePledge();
      setInteraction({
        kind: "busy",
        operation: "submitting",
        pledgeText,
        progressMessage: "The ownership circuit succeeded. Reading confirmation.",
      });
      const state = await client.queryState();
      updateSnapshot(state);
      setInteraction({
        kind: "success",
        outcome: "completed",
        pledgeText,
        transaction: toSuccessTransaction(result),
      });
    } catch (error) {
      showActionError(error);
    } finally {
      operationRef.current = false;
    }
  }, [connectClient, showActionError, updateSnapshot]);

  const disconnect = useCallback(() => {
    invalidateWalletSession();
    operationRef.current = false;
    setInteraction({ kind: "idle" });

    const current = snapshotRef.current;
    if (current) {
      updateSnapshot({
        status: current.status,
        goal: current.goal,
        sequence: current.sequence,
        completionCount: current.completionCount,
        ownerCommitment: current.ownerCommitment,
      });
    }
    void readPublicState();
  }, [invalidateWalletSession, readPublicState, updateSnapshot]);

  const makeAnother = useCallback(() => {
    setInteraction({ kind: "idle" });
    if (snapshotRef.current?.status === "open") setDraft("");
  }, []);

  const retry = useCallback(() => {
    if (lastActionRef.current === "create") void createPledge();
    else if (lastActionRef.current === "complete") void completePledge();
    else void connect();
  }, [completePledge, connect, createPledge]);

  const wallet: WalletView = walletAddress
    ? { status: "connected", address: walletAddress }
    : interaction.kind === "connecting"
      ? { status: "connecting" }
      : { status: "disconnected" };

  const base = useMemo(
    () => ({
      network: "Preprod",
      contract: {
        label: deploymentIsValid
          ? shorten(PREPROD_DEPLOYMENT.contractAddress)
          : "Deployment pending",
        ...(deploymentIsValid
          ? {
              value: PREPROD_DEPLOYMENT.contractAddress,
              href: PREPROD_EXPLORER_URL,
            }
          : {}),
      },
      ledger: toLedgerSnapshot(snapshot, ledgerLoadState),
    }),
    [ledgerLoadState, snapshot],
  );

  const viewModel = useMemo<VeilPledgeViewModel>(() => {
    if (interaction.kind === "connecting") {
      return { ...base, phase: "connecting", wallet: { status: "connecting" }, draft };
    }

    if (interaction.kind === "busy") {
      return {
        ...base,
        phase: "busy",
        wallet: { status: "connected", address: walletAddress ?? "Lace" },
        operation: interaction.operation,
        progressMessage: interaction.progressMessage,
        ...(interaction.pledgeText
          ? { pledgeText: interaction.pledgeText }
          : { draft }),
      };
    }

    if (interaction.kind === "success") {
      return {
        ...base,
        phase: "success",
        outcome: interaction.outcome,
        wallet: { status: "connected", address: walletAddress ?? "Lace" },
        pledgeText: interaction.pledgeText,
        transaction: interaction.transaction,
        ledger:
          interaction.outcome === "completed"
            ? { ...base.ledger, boardStatus: "Completed" }
            : base.ledger,
      };
    }

    if (interaction.kind === "error") {
      const active = snapshot?.status === "active" && snapshot.goal;
      return {
        ...base,
        phase: "error",
        wallet,
        title: interaction.title,
        message: interaction.message,
        noticeKind: interaction.noticeKind,
        retryLabel: interaction.retryLabel,
        ...(active
          ? {
              pledgeText: snapshot.goal,
              isOwner: wallet.status === "connected" && isOwnerState(snapshot),
              ownerMessage:
                "The public pledge remains visible; only its owner can complete it.",
            }
          : { draft }),
      };
    }

    if (snapshot?.status === "active" && snapshot.goal) {
      if (wallet.status === "connected") {
        return {
          ...base,
          phase: "connected-active",
          wallet,
          pledgeText: snapshot.goal,
          isOwner: isOwnerState(snapshot),
          ownerMessage:
            "This Lace account can view the pledge but does not hold its private witness.",
        };
      }
      return {
        ...base,
        phase: "public-active",
        wallet: { status: "disconnected" },
        pledgeText: snapshot.goal,
        isOwner: false,
        ownerMessage:
          "Connect the Lace account that created this pledge to prove ownership.",
      };
    }

    if (wallet.status === "connected") {
      return { ...base, phase: "connected-open", wallet, draft };
    }
    return { ...base, phase: "disconnected", wallet: { status: "disconnected" }, draft };
  }, [base, draft, interaction, snapshot, wallet, walletAddress]);

  const actions = useMemo<VeilPledgeActions>(
    () => ({
      onConnect: () => void connect(),
      onDisconnect: disconnect,
      onDraftChange: setDraft,
      onCreatePledge: () => void createPledge(),
      onCompletePledge: () => void completePledge(),
      onMakeAnotherPledge: makeAnother,
      onRetry: retry,
      onCopyCommitment: (commitment) => {
        const clipboard = globalThis.navigator?.clipboard;
        if (!clipboard?.writeText) {
          return Promise.reject(new Error("Clipboard access is unavailable."));
        }
        return clipboard.writeText(commitment);
      },
    }),
    [completePledge, connect, createPledge, disconnect, makeAnother, retry],
  );

  return { viewModel, actions };
}
