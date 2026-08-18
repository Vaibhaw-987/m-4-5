import { ChevronsLeftRight } from "lucide-react";

import { ActivePledge } from "./components/ActivePledge";
import { AppFooter } from "./components/AppFooter";
import { AppHeader } from "./components/AppHeader";
import { CrescentMark } from "./components/CrescentMark";
import { HeroMessage } from "./components/HeroMessage";
import { LedgerRail } from "./components/LedgerRail";
import { PledgeComposer } from "./components/PledgeComposer";
import { PrivacyBoundary } from "./components/PrivacyBoundary";
import { TransactionPanel } from "./components/TransactionPanel";
import type {
  BusyViewModel,
  ErrorViewModel,
  VeilPledgeAppProps,
  VeilPledgeViewModel,
} from "./types";

export type {
  BusyViewModel,
  ConnectedActiveViewModel,
  ConnectedOpenViewModel,
  ConnectingViewModel,
  ContractReference,
  DisconnectedViewModel,
  ErrorViewModel,
  LedgerSnapshot,
  PublicActiveViewModel,
  SuccessTransaction,
  SuccessViewModel,
  VeilPledgeActions,
  VeilPledgeAppProps,
  VeilPledgeViewModel,
  WalletNoticeKind,
  WalletView,
} from "./types";

export const DEFAULT_VIEW_MODEL: VeilPledgeViewModel = {
  phase: "disconnected",
  wallet: { status: "disconnected" },
  network: "Preprod",
  contract: { label: "03a38b…5a39" },
  draft: "Ship the VeilPledge beta",
  ledger: {
    boardStatus: "Open",
    sequence: 42,
    completed: 0,
    ownerCommitment: "0x7a3b…c19f",
  },
};

const busyActionCopy: Record<BusyViewModel["operation"], string> = {
  creating: "Creating pledge…",
  proving: "Generating proof…",
  submitting: "Submitting proof…",
};

function renderPrimaryContent(
  viewModel: VeilPledgeViewModel,
  props: VeilPledgeAppProps,
) {
  const actions = props.actions ?? {};

  if (
    viewModel.phase === "connected-active" ||
    viewModel.phase === "public-active"
  ) {
    return (
      <ActivePledge
        isOwner={viewModel.isOwner}
        onComplete={actions.onCompletePledge}
        ownerMessage={viewModel.ownerMessage}
        pledgeText={viewModel.pledgeText}
      />
    );
  }

  if (viewModel.phase === "success") {
    return (
      <ActivePledge
        completed={viewModel.outcome === "completed"}
        isOwner
        onComplete={actions.onCompletePledge}
        pledgeText={viewModel.pledgeText}
      />
    );
  }

  if (viewModel.phase === "busy") {
    if (viewModel.pledgeText) {
      return (
        <ActivePledge
          busyLabel={busyActionCopy[viewModel.operation]}
          disabled
          isOwner
          pledgeText={viewModel.pledgeText}
        />
      );
    }

    return (
      <PledgeComposer
        busyLabel={busyActionCopy[viewModel.operation]}
        disabled
        value={viewModel.draft ?? ""}
      />
    );
  }

  if (viewModel.phase === "error") {
    const errorView = viewModel as ErrorViewModel;
    const writesBlocked = errorView.noticeKind === "wrong-network";

    return errorView.pledgeText ? (
      <ActivePledge
        disabled={writesBlocked}
        isOwner={errorView.isOwner ?? false}
        onComplete={actions.onCompletePledge}
        ownerMessage={errorView.ownerMessage}
        pledgeText={errorView.pledgeText}
      />
    ) : (
      <PledgeComposer
        disabled={writesBlocked}
        onChange={actions.onDraftChange}
        onCreate={actions.onCreatePledge}
        value={errorView.draft ?? ""}
      />
    );
  }

  return (
    <PledgeComposer
      disabled={viewModel.phase === "connecting"}
      busyLabel={viewModel.phase === "connecting" ? "Connecting to Lace…" : undefined}
      onChange={actions.onDraftChange}
      onCreate={actions.onCreatePledge}
      value={viewModel.draft}
    />
  );
}

function isTransactionState(viewModel: VeilPledgeViewModel) {
  return (
    viewModel.phase === "busy" ||
    viewModel.phase === "success" ||
    viewModel.phase === "error"
  );
}

export function App({
  viewModel = DEFAULT_VIEW_MODEL,
  actions = {},
}: VeilPledgeAppProps) {
  const transactionState = isTransactionState(viewModel);

  return (
    <div className={`veil-app state-${viewModel.phase}`}>
      <AppHeader
        contract={viewModel.contract}
        disconnectDisabled={viewModel.phase === "busy"}
        network={viewModel.network}
        onConnect={actions.onConnect}
        onDisconnect={actions.onDisconnect}
        wallet={viewModel.wallet}
      />

      <main
        aria-busy={viewModel.phase === "busy" || viewModel.phase === "connecting"}
        className="app-main"
      >
        {transactionState ? (
          <>
            <div className="transaction-layout">
              <div className="app-stage app-stage--transaction">
                <HeroMessage />
                {renderPrimaryContent(viewModel, { viewModel, actions })}
              </div>

              <div className="transaction-layout__panel">
                {viewModel.phase === "success" ? (
                  <TransactionPanel
                    mode="success"
                    onMakeAnother={actions.onMakeAnotherPledge}
                    outcome={viewModel.outcome}
                    transaction={viewModel.transaction}
                  />
                ) : viewModel.phase === "busy" ? (
                  <TransactionPanel
                    message={viewModel.progressMessage}
                    mode="busy"
                    operation={viewModel.operation}
                  />
                ) : (
                  <TransactionPanel
                    message={viewModel.message}
                    mode="error"
                    onRetry={actions.onRetry}
                    retryLabel={viewModel.retryLabel}
                    title={viewModel.title}
                  />
                )}
              </div>
            </div>

            <PrivacyBoundary variant="rail" />
          </>
        ) : (
          <div className="primary-layout">
            <div className="app-stage">
              <HeroMessage />
              {renderPrimaryContent(viewModel, { viewModel, actions })}
            </div>

            <div className="veil-divider" aria-hidden="true">
              <span className="veil-divider__line" />
              <span className="veil-divider__control">
                <ChevronsLeftRight size={22} strokeWidth={1.5} />
              </span>
              <div className="veil-divider__mobile-rule">
                <span />
                <CrescentMark />
                <span />
              </div>
            </div>

            <PrivacyBoundary variant="side" />
          </div>
        )}

        <LedgerRail
          ledger={viewModel.ledger}
          onCopyCommitment={actions.onCopyCommitment}
        />

        <AppFooter />
      </main>
    </div>
  );
}

export default App;
