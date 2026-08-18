import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState, 
} from "react";

import { VEILGATE_PREPROD_DEPLOYMENT } from "../generated/deployment";
import {
  connectVeilGate,
  queryPreprodVeilGateState,
  WalletConnectorNotFoundError,
  WalletNetworkMismatchError,
  WalletSessionChangedError,
  type ClaimOrganizerResult,
  type ProveMembershipResult,
  type RegisterMemberResult,
  type RotateEpochResult,
  type VeilGateClient,
  type VeilGatePublicState,
  type VeilGateState,
} from "../lib";
import type { WalletView } from "../types";
import type {
  GateLedgerSnapshot,
  GateMemberView,
  GateOperation,
  GateOrganizerView,
  GateOutcome,
  GateReceipt,
  GateRole,
  GateStatus,
  VeilGateActions,
  VeilGateViewModel,
} from "../veilgate-types";

type PublicOrConnectedState = VeilGatePublicState | VeilGateState;
type RetryAction = "connect" | "claim" | "register" | "rotate" | "prove";
type LedgerLoadState = "Loading" | "Ready" | "Unavailable";

class ConnectionCancelledError extends Error {
  override readonly name = "ConnectionCancelledError";
}

const PREPROD_EXPLORER_URL = "https://preprod.midnightexplorer.com/";
const PENDING_COMMITMENT = "Connect Lace to derive your commitment";
const UNAVAILABLE_LEDGER: GateLedgerSnapshot = {
  gateStatus: "Unavailable",
  members: "…",
  checkins: "…",
  epoch: "…",
  memberRoot: "Not indexed",
};

const deploymentIsValid = /^[0-9a-f]{64}$/iu.test(
  VEILGATE_PREPROD_DEPLOYMENT.contractAddress,
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

const toErrorStatus = (error: unknown): Extract<GateStatus, { kind: "error" }> => {
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
): GateLedgerSnapshot => {
  if (loadState !== "Ready" || !state) {
    return loadState === "Loading"
      ? { ...UNAVAILABLE_LEDGER, gateStatus: "Loading" }
      : UNAVAILABLE_LEDGER;
  }
  return {
    gateStatus: state.hasOrganizer ? "Open" : "Unclaimed",
    members: state.memberCount.toString(),
    checkins: state.checkinCount.toString(),
    epoch: state.epoch.toString(),
    memberRoot: state.memberRoot,
    memberRootLabel: shorten(state.memberRoot, 8, 6),
  };
};

const isConnectedState = (
  state?: PublicOrConnectedState,
): state is VeilGateState => Boolean(state && "commitment" in state);

const toReceipt = (
  result:
    | ClaimOrganizerResult
    | ProveMembershipResult
    | RegisterMemberResult
    | RotateEpochResult,
  detailLabel: string,
  detailValue: string,
): GateReceipt => ({
  label: shorten(result.txHash, 8, 6),
  hash: result.txHash,
  href: PREPROD_EXPLORER_URL,
  blockHeight: result.blockHeight.toLocaleString(),
  epoch: result.epoch.toString(),
  detailLabel,
  detailValue,
});

interface Unsubscribable {
  unsubscribe(): void;
}

export interface VeilGateController {
  viewModel: VeilGateViewModel;
  actions: VeilGateActions;
}

export function useVeilGate(): VeilGateController {
  const [role, setRole] = useState<GateRole>("member");
  const [commitmentDraft, setCommitmentDraft] = useState("");
  const [walletAddress, setWalletAddress] = useState<string>();
  const [snapshot, setSnapshotState] = useState<PublicOrConnectedState>();
  const [ledgerLoadState, setLedgerLoadState] = useState<LedgerLoadState>("Loading");
  const [status, setStatus] = useState<GateStatus>({ kind: "idle" });

  const mountedRef = useRef(true);
  const snapshotRef = useRef<PublicOrConnectedState | undefined>(undefined);
  const clientRef = useRef<VeilGateClient | undefined>(undefined);
  const connectionRef = useRef<Promise<VeilGateClient> | undefined>(undefined);
  const subscriptionRef = useRef<Unsubscribable | undefined>(undefined);
  const operationRef = useRef(false);
  const lastActionRef = useRef<RetryAction>("connect");
  const connectionGenerationRef = useRef(0);
  const draftRef = useRef("");

  draftRef.current = commitmentDraft;

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

  const showActionError = useCallback(
    (error: unknown) => {
      if (
        error instanceof WalletNetworkMismatchError ||
        error instanceof WalletSessionChangedError
      ) {
        invalidateWalletSession();
      }
      if (!mountedRef.current) return;
      setStatus(
        error instanceof ConnectionCancelledError
          ? { kind: "idle" }
          : toErrorStatus(error),
      );
    },
    [invalidateWalletSession],
  );

  const readPublicState = useCallback(async () => {
    if (!deploymentIsValid) {
      if (mountedRef.current) setLedgerLoadState("Unavailable");
      return;
    }
    try {
      const state = await queryPreprodVeilGateState(
        VEILGATE_PREPROD_DEPLOYMENT.contractAddress,
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

  const connectClient = useCallback(async (): Promise<VeilGateClient> => {
    if (clientRef.current) return clientRef.current;
    if (connectionRef.current) return connectionRef.current;
    if (!deploymentIsValid) {
      throw new Error(
        "The Preprod VeilGate deployment has not been published with this build yet.",
      );
    }

    const connectionGeneration = connectionGenerationRef.current;

    const connection = (async () => {
      const client = await connectVeilGate({
        contractAddress: VEILGATE_PREPROD_DEPLOYMENT.contractAddress,
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
          setStatus(toErrorStatus(error));
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
        updateSnapshot(await existingClient.queryState());
      } else {
        setStatus({ kind: "connecting" });
        await connectClient();
      }
      if (mountedRef.current) setStatus({ kind: "idle" });
    } catch (error) {
      showActionError(error);
    } finally {
      operationRef.current = false;
    }
  }, [connectClient, showActionError, updateSnapshot]);

  const runWrite = useCallback(
    async (
      action: RetryAction,
      operation: GateOperation,
      progressMessage: string,
      outcome: GateOutcome,
      submit: (client: VeilGateClient) => Promise<GateReceipt>,
    ) => {
      if (operationRef.current) return;
      operationRef.current = true;
      lastActionRef.current = action;

      try {
        if (!clientRef.current) setStatus({ kind: "connecting" });
        const client = await connectClient();

        setStatus({ kind: "busy", operation, message: progressMessage });
        const receipt = await submit(client);

        setStatus({
          kind: "busy",
          operation: "submitting",
          message: "The circuit succeeded. Reading the confirmed public state.",
        });
        updateSnapshot(await client.queryState());
        setStatus({ kind: "success", outcome, receipt });
      } catch (error) {
        showActionError(error);
      } finally {
        operationRef.current = false;
      }
    },
    [connectClient, showActionError, updateSnapshot],
  );

  const claimOrganizer = useCallback(
    () =>
      runWrite(
        "claim",
        "claiming",
        "Lace is proving control of the organizer secret in this browser.",
        "claimed",
        async (client) => {
          const result = await client.claimOrganizer();
          return toReceipt(result, "Organizer commitment", "Held privately");
        },
      ),
    [runWrite],
  );

  const registerMember = useCallback(
    () =>
      runWrite(
        "register",
        "registering",
        "Lace is adding the pasted commitment to the public allowlist tree.",
        "registered",
        async (client) => {
          const result = await client.registerMember(draftRef.current);
          return toReceipt(
            result,
            "Registered commitment",
            shorten(result.commitment, 8, 6),
          );
        },
      ),
    [runWrite],
  );

  const rotateEpoch = useCallback(
    () =>
      runWrite(
        "rotate",
        "rotating",
        "Lace is preparing the epoch rotation that voids every current nullifier.",
        "rotated",
        async (client) => {
          const result = await client.rotateEpoch();
          return toReceipt(result, "New epoch", result.newEpoch.toString());
        },
      ),
    [runWrite],
  );

  const proveMembership = useCallback(
    () =>
      runWrite(
        "prove",
        "proving",
        "Lace is preparing a membership proof that names no entry of the list.",
        "checked-in",
        async (client) => {
          const result = await client.proveMembership();
          return toReceipt(result, "Nullifier", shorten(result.nullifier, 8, 6));
        },
      ),
    [runWrite],
  );

  const disconnect = useCallback(() => {
    invalidateWalletSession();
    operationRef.current = false;
    setStatus({ kind: "idle" });

    const current = snapshotRef.current;
    if (current) {
      updateSnapshot({
        hasOrganizer: current.hasOrganizer,
        organizerCommitment: current.organizerCommitment,
        memberRoot: current.memberRoot,
        memberCount: current.memberCount,
        checkinCount: current.checkinCount,
        spentCount: current.spentCount,
        epoch: current.epoch,
      });
    }
    void readPublicState();
  }, [invalidateWalletSession, readPublicState, updateSnapshot]);

  const retry = useCallback(() => {
    const action = lastActionRef.current;
    if (action === "claim") void claimOrganizer();
    else if (action === "register") void registerMember();
    else if (action === "rotate") void rotateEpoch();
    else if (action === "prove") void proveMembership();
    else void connect();
  }, [claimOrganizer, connect, proveMembership, registerMember, rotateEpoch]);

  const wallet: WalletView = walletAddress
    ? { status: "connected", address: walletAddress }
    : status.kind === "connecting"
      ? { status: "connecting" }
      : { status: "disconnected" };

  const contract = useMemo(
    () => ({
      label: deploymentIsValid
        ? shorten(VEILGATE_PREPROD_DEPLOYMENT.contractAddress)
        : "Deployment pending",
      ...(deploymentIsValid
        ? {
            value: VEILGATE_PREPROD_DEPLOYMENT.contractAddress,
            href: PREPROD_EXPLORER_URL,
          }
        : {}),
    }),
    [],
  );

  const organizer = useMemo<GateOrganizerView>(
    () => ({
      hasOrganizer: snapshot?.hasOrganizer ?? false,
      isOrganizer: isConnectedState(snapshot) && snapshot.isOrganizer,
      commitmentDraft,
    }),
    [commitmentDraft, snapshot],
  );

  const member = useMemo<GateMemberView>(() => {
    if (!isConnectedState(snapshot)) {
      return {
        commitment: PENDING_COMMITMENT,
        commitmentLabel: PENDING_COMMITMENT,
        isMember: false,
        hasCheckedIn: false,
      };
    }
    return {
      commitment: snapshot.commitment,
      commitmentLabel: shorten(snapshot.commitment, 8, 6),
      isMember: snapshot.isMember,
      hasCheckedIn: snapshot.hasCheckedIn,
    };
  }, [snapshot]);

  const viewModel = useMemo<VeilGateViewModel>(
    () => ({
      role,
      network: "Preprod",
      contract,
      wallet,
      ledger: toLedgerSnapshot(snapshot, ledgerLoadState),
      organizer,
      member,
      status,
    }),
    [contract, ledgerLoadState, member, organizer, role, snapshot, status, wallet],
  );

  const actions = useMemo<VeilGateActions>(
    () => ({
      onConnect: () => void connect(),
      onDisconnect: disconnect,
      onSelectRole: setRole,
      onCommitmentDraftChange: setCommitmentDraft,
      onClaimOrganizer: () => void claimOrganizer(),
      onRegisterMember: () => void registerMember(),
      onRotateEpoch: () => void rotateEpoch(),
      onProveMembership: () => void proveMembership(),
      onRetry: retry,
      onCopy: (value) => {
        const clipboard = globalThis.navigator?.clipboard;
        if (!clipboard?.writeText) {
          return Promise.reject(new Error("Clipboard access is unavailable."));
        }
        return clipboard.writeText(value);
      },
    }),
    [
      claimOrganizer,
      connect,
      disconnect,
      proveMembership,
      registerMember,
      retry,
      rotateEpoch,
    ],
  );

  return { viewModel, actions };
}
