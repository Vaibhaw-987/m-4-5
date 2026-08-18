import {
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw, 
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type { GateOrganizerView } from "../veilgate-types";

interface OrganizerPanelProps {
  organizer: GateOrganizerView;
  disabled?: boolean;
  busyLabel?: string;
  onCommitmentDraftChange?: (value: string) => void;
  onClaimOrganizer?: () => void;
  onRegisterMember?: () => void;
  onRotateEpoch?: () => void;
}

const COMMITMENT_PATTERN = /^(?:0x)?[0-9a-f]{64}$/iu;

function claimStatus(organizer: GateOrganizerView) {
  if (!organizer.hasOrganizer) {
    return "No organizer yet. The first account to claim this deployment keeps the role.";
  }
  return organizer.isOrganizer
    ? "This browser holds the organizer secret for this deployment."
    : "Another account already claimed this deployment, so organizer writes are blocked here.";
}

export function OrganizerPanel({
  organizer,
  disabled = false,
  busyLabel,
  onCommitmentDraftChange,
  onClaimOrganizer,
  onRegisterMember,
  onRotateEpoch,
}: OrganizerPanelProps) {
  const draftIsValid = COMMITMENT_PATTERN.test(organizer.commitmentDraft.trim());
  const canClaim = !disabled && !organizer.hasOrganizer;
  const canRegister = !disabled && organizer.isOrganizer && draftIsValid;
  const canRotate = !disabled && organizer.isOrganizer;

  return (
    <section
      aria-labelledby="gate-tab-organizer"
      className="gate-panel"
      id="gate-panel-organizer"
      role="tabpanel"
    >
      <h2 className="gate-panel__title">Organizer controls</h2>

      <p className="gate-panel__status">
        <KeyRound aria-hidden="true" size={21} strokeWidth={1.5} />
        <span>{claimStatus(organizer)}</span>
      </p>

      <button
        className="primary-action gate-panel__action"
        disabled={!canClaim}
        onClick={onClaimOrganizer}
        type="button"
      >
        <span className="primary-action__icon">
          <Sparkles aria-hidden="true" size={21} strokeWidth={1.5} />
        </span>
        <span>Claim this deployment</span>
      </button>

      <form
        aria-labelledby="gate-register-title"
        className="gate-register"
        onSubmit={(event) => {
          event.preventDefault();
          if (canRegister) onRegisterMember?.();
        }}
      >
        <label
          className="gate-panel__label"
          htmlFor="gate-commitment"
          id="gate-register-title"
        >
          Member commitment
        </label>

        <input
          aria-describedby="gate-commitment-note"
          className="gate-register__input"
          disabled={disabled || !organizer.isOrganizer}
          id="gate-commitment"
          onChange={(event) => onCommitmentDraftChange?.(event.target.value)}
          placeholder="64 hexadecimal characters"
          spellCheck={false}
          type="text"
          value={organizer.commitmentDraft}
        />

        <span className="gate-register__note" id="gate-commitment-note">
          Paste the commitment a member copied from their own Member view. It is
          public by construction, so it reveals nothing about their secret.
        </span>

        <button
          className="primary-action gate-panel__action"
          disabled={!canRegister}
          type="submit"
        >
          {busyLabel ? (
            <Loader2 aria-hidden="true" className="spin" size={24} strokeWidth={1.5} />
          ) : (
            <span className="primary-action__icon">
              <LockKeyhole aria-hidden="true" size={21} strokeWidth={1.5} />
            </span>
          )}
          <span>{busyLabel ?? "Register member"}</span>
        </button>
      </form>

      <button
        className="secondary-action gate-panel__rotate"
        disabled={!canRotate}
        onClick={onRotateEpoch}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={21} strokeWidth={1.5} />
        Rotate epoch
      </button>

      <p className="privacy-reassurance gate-panel__privacy">
        <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.5} />
        <span>
          Rotating the epoch invalidates every nullifier, so every member can
          check in again without their two visits being linkable.
        </span>
      </p>
    </section>
  );
}
