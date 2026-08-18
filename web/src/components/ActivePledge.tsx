import {
  CheckCircle2,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { CrescentMark } from "./CrescentMark";

interface ActivePledgeProps {
  pledgeText: string;
  isOwner: boolean;
  disabled?: boolean;
  completed?: boolean;
  busyLabel?: string;
  ownerMessage?: string;
  onComplete?: () => void;
}

export function ActivePledge({
  pledgeText,
  isOwner,
  disabled = false,
  completed = false,
  busyLabel,
  ownerMessage,
  onComplete,
}: ActivePledgeProps) {
  const actionDisabled = disabled || !isOwner;

  return (
    <section
      className={`active-pledge${completed ? " active-pledge--completed" : ""}`}
      aria-labelledby="active-pledge-title"
    >
      <h2 className="active-pledge__title" id="active-pledge-title">
        {completed ? "Completed pledge" : "Active pledge"}
      </h2>

      <div className="active-pledge__public">
        <span className="active-pledge__eyeline">Public pledge</span>
        <p>{pledgeText}</p>
      </div>

      {isOwner && !completed ? (
        <span className="readiness">
          <span aria-hidden="true" />
          Ready to prove
        </span>
      ) : null}

      {completed ? (
        <p className="active-pledge__action active-pledge__completion">
          <CheckCircle2 aria-hidden="true" size={25} strokeWidth={1.7} />
          <span>Ownership proved · pledge complete</span>
        </p>
      ) : (
        <button
          className="primary-action active-pledge__action"
          disabled={actionDisabled}
          onClick={onComplete}
          type="button"
        >
          {busyLabel ? (
            <Loader2
              aria-hidden="true"
              className="spin"
              size={25}
              strokeWidth={1.5}
            />
          ) : (
            <span className="primary-action__icon primary-action__icon--solid">
              <CheckCircle2 aria-hidden="true" size={23} strokeWidth={2} />
            </span>
          )}
          <span>{busyLabel ?? "Prove ownership & complete"}</span>
          {!busyLabel ? (
            <CrescentMark className="primary-action__crescent" />
          ) : null}
        </button>
      )}

      <p className="privacy-reassurance active-pledge__privacy">
        {isOwner ? (
          <LockKeyhole aria-hidden="true" size={21} strokeWidth={1.5} />
        ) : (
          <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.5} />
        )}
        <span>
          {isOwner
            ? "Your secret is encrypted at rest in this browser profile. Only its commitment reaches the ledger."
            : ownerMessage ??
              "This pledge is public, but completion remains private to its owner."}
        </span>
      </p>
    </section>
  );
}
