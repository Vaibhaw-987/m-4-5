import {
  CheckCircle2,
  Fingerprint,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import type { GateMemberView } from "../veilgate-types";
import { CopyControl } from "./CopyControl";
import { CrescentMark } from "./CrescentMark";

interface MemberPanelProps {
  member: GateMemberView;
  disabled?: boolean;
  busyLabel?: string;
  onProveMembership?: () => void;
  onCopyCommitment?: (commitment: string) => Promise<void> | void;
}

export function MemberPanel({
  member,
  disabled = false,
  busyLabel,
  onProveMembership,
  onCopyCommitment,
}: MemberPanelProps) {
  const canProve = !disabled && member.isMember && !member.hasCheckedIn;

  return (
    <section
      aria-labelledby="gate-tab-member"
      className="gate-panel"
      id="gate-panel-member"
      role="tabpanel"
    >
      <h2 className="gate-panel__title">Member check-in</h2>

      <div className="gate-commitment">
        <span className="gate-commitment__eyeline">Your commitment</span>
        <p className="gate-commitment__value">
          <span title={member.commitment}>{member.commitmentLabel}</span>
          <CopyControl
            failureMessage="Could not copy your commitment."
            label="Copy your commitment"
            onCopy={onCopyCommitment}
            successMessage="Commitment copied."
            value={member.commitment}
          />
        </p>
      </div>

      <dl className="gate-standing">
        <div>
          <dt>On the allowlist</dt>
          <dd>{member.isMember ? "Yes" : "Not yet"}</dd>
        </div>
        <div>
          <dt>Checked in this epoch</dt>
          <dd>{member.hasCheckedIn ? "Yes" : "No"}</dd>
        </div>
      </dl>

      {canProve ? (
        <span className="readiness">
          <span aria-hidden="true" />
          Ready to prove
        </span>
      ) : null}

      {member.hasCheckedIn ? (
        <p className="gate-panel__action gate-panel__completion">
          <CheckCircle2 aria-hidden="true" size={25} strokeWidth={1.7} />
          <span>Membership proved · checked in this epoch</span>
        </p>
      ) : (
        <button
          className="primary-action gate-panel__action"
          disabled={!canProve}
          onClick={onProveMembership}
          type="button"
        >
          {busyLabel ? (
            <Loader2 aria-hidden="true" className="spin" size={25} strokeWidth={1.5} />
          ) : (
            <span className="primary-action__icon primary-action__icon--solid">
              <ShieldCheck aria-hidden="true" size={23} strokeWidth={2} />
            </span>
          )}
          <span>{busyLabel ?? "Prove membership & check in"}</span>
          {!busyLabel ? <CrescentMark className="primary-action__crescent" /> : null}
        </button>
      )}

      <p className="privacy-reassurance gate-panel__privacy">
        {member.isMember ? (
          <LockKeyhole aria-hidden="true" size={21} strokeWidth={1.5} />
        ) : (
          <Fingerprint aria-hidden="true" size={22} strokeWidth={1.5} />
        )}
        <span>
          {member.isMember
            ? "The proof shows that some listed member checked in. It never shows which entry of the list you are."
            : "Send the commitment above to the organizer. Your secret stays encrypted in this browser profile."}
        </span>
      </p>
    </section>
  );
}
