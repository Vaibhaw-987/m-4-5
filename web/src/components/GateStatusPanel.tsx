import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import type { GateOperation, GateOutcome, GateReceipt } from "../veilgate-types";
import { CopyControl } from "./CopyControl";

type GateStatusPanelProps =
  | { mode: "busy"; operation: GateOperation; message?: string }
  | { mode: "success"; outcome: GateOutcome; receipt: GateReceipt }
  | {
      mode: "error";
      title: string;
      message: string;
      retryLabel?: string;
      onRetry?: () => void;
    };

const busyCopy = {
  claiming: {
    title: "Claiming the deployment",
    message: "Lace is proving control of the organizer secret in this browser.",
  },
  registering: {
    title: "Registering the commitment",
    message: "Adding the pasted commitment to the public allowlist tree.",
  },
  rotating: {
    title: "Rotating the epoch",
    message: "Every nullifier from the current epoch is about to become invalid.",
  },
  proving: {
    title: "Proving membership",
    message: "Lace is preparing a membership proof that names no entry of the list.",
  },
  submitting: {
    title: "Submitting to Preprod",
    message: "Waiting for the network to confirm the private transaction.",
  },
} as const;

const successCopy = {
  claimed: {
    title: "Deployment claimed",
    lead: "Only the secret in this browser can now register members or rotate the epoch.",
  },
  registered: {
    title: "Member registered",
    lead: "The commitment joined the public tree. The secret behind it was never published.",
  },
  rotated: {
    title: "Epoch rotated",
    lead: "Nullifiers from the previous epoch are void, so members can check in again unlinkably.",
  },
  "checked-in": {
    title: "Checked in privately",
    lead: "The network verified that a listed member checked in without learning which one.",
  },
} as const;

const proofSteps = ["Prepare", "Prove", "Confirm"] as const;
const activeProofStep = {
  claiming: 0,
  registering: 0,
  rotating: 0,
  proving: 1,
  submitting: 2,
} as const;

export function GateStatusPanel(props: GateStatusPanelProps) {
  if (props.mode === "success") {
    const { receipt } = props;
    const copy = successCopy[props.outcome];

    return (
      <section
        aria-labelledby="gate-success-title"
        className="transaction-panel transaction-panel--success"
      >
        <div className="transaction-panel__heading">
          <span className="transaction-panel__status-icon transaction-panel__status-icon--success">
            <Check aria-hidden="true" size={28} strokeWidth={1.8} />
          </span>
          <h2 id="gate-success-title">{copy.title}</h2>
        </div>

        <p className="transaction-panel__lead">{copy.lead}</p>

        <div className="transaction-link-row">
          {receipt.href ? (
            <a
              aria-label={`Open Preprod explorer; transaction ${receipt.hash}`}
              className="transaction-link"
              href={receipt.href}
              rel="noreferrer"
              target="_blank"
              title={receipt.hash}
            >
              <span aria-hidden="true">View transaction {receipt.label}</span>
              <ExternalLink aria-hidden="true" size={20} strokeWidth={1.5} />
            </a>
          ) : (
            <span
              aria-label={`Transaction ${receipt.hash}`}
              className="transaction-link transaction-link--static"
              role="group"
              title={receipt.hash}
            >
              <span aria-hidden="true">View transaction {receipt.label}</span>
            </span>
          )}
          <CopyControl
            failureMessage="Could not copy transaction hash."
            label="Copy transaction hash"
            successMessage="Transaction hash copied."
            value={receipt.hash}
          />
        </div>

        <dl className="transaction-panel__block">
          <dt>Block height</dt>
          <dd>{receipt.blockHeight}</dd>
        </dl>

        <dl className="transaction-evidence">
          <div>
            <dt>{receipt.detailLabel}</dt>
            <dd>{receipt.detailValue}</dd>
          </div>
          <div>
            <dt>Epoch</dt>
            <dd>{receipt.epoch}</dd>
          </div>
          <div>
            <dt>Secret disclosed: Never</dt>
            <dd>
              <ShieldCheck aria-label="Protected" size={24} strokeWidth={1.5} />
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  if (props.mode === "error") {
    return (
      <section
        aria-labelledby="gate-error-title"
        className="transaction-panel transaction-panel--error"
        role="alert"
      >
        <div className="transaction-panel__heading">
          <span className="transaction-panel__status-icon transaction-panel__status-icon--error">
            <AlertCircle aria-hidden="true" size={27} strokeWidth={1.6} />
          </span>
          <h2 id="gate-error-title">{props.title}</h2>
        </div>
        <p className="transaction-panel__lead">{props.message}</p>
        {props.onRetry ? (
          <button className="secondary-action" onClick={props.onRetry} type="button">
            <RefreshCw aria-hidden="true" size={21} strokeWidth={1.5} />
            {props.retryLabel ?? "Try again"}
          </button>
        ) : null}
      </section>
    );
  }

  const copy = busyCopy[props.operation];
  const activeStep = activeProofStep[props.operation];

  return (
    <section
      aria-labelledby="gate-busy-title"
      aria-live="polite"
      aria-busy="true"
      className="transaction-panel transaction-panel--busy"
    >
      <div className="transaction-panel__heading">
        <span className="transaction-panel__status-icon transaction-panel__status-icon--busy">
          <Loader2 aria-hidden="true" className="spin" size={28} strokeWidth={1.5} />
        </span>
        <h2 id="gate-busy-title">{copy.title}</h2>
      </div>
      <p className="transaction-panel__lead">{props.message ?? copy.message}</p>

      <ol aria-label="Transaction progress" className="proof-progress">
        {proofSteps.map((step, index) => {
          const state = index < activeStep ? "done" : index === activeStep ? "active" : "pending";

          return (
            <li
              aria-current={state === "active" ? "step" : undefined}
              className={`proof-progress__step proof-progress__step--${state}`}
              key={step}
            >
              <span className={`proof-progress__dot proof-progress__dot--${state}`}>
                {state === "done" ? (
                  <Check aria-hidden="true" size={13} strokeWidth={2} />
                ) : null}
              </span>
              <span className="proof-progress__label">{step}</span>
            </li>
          );
        })}
      </ol>

      <p className="transaction-panel__privacy">
        <CheckCircle2 aria-hidden="true" size={21} strokeWidth={1.5} />
        Your secret is never written to the public ledger.
      </p>
    </section>
  );
}
