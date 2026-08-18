import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

interface PledgeComposerProps {
  value: string;
  disabled?: boolean;
  busyLabel?: string;
  onChange?: (value: string) => void;
  onCreate?: () => void;
}

const MAX_PLEDGE_LENGTH = 280;

export function PledgeComposer({
  value,
  disabled = false,
  busyLabel,
  onChange,
  onCreate,
}: PledgeComposerProps) {
  const remainingValue = value.slice(0, MAX_PLEDGE_LENGTH);
  const canSubmit = !disabled && remainingValue.trim().length > 0;

  return (
    <form
      aria-labelledby="pledge-composer-title"
      className="pledge-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onCreate?.();
      }}
    >
      <label className="pledge-composer__label" id="pledge-composer-title" htmlFor="pledge-copy">
        What will you finish?
      </label>

      <div className="pledge-input">
        <textarea
          aria-describedby="pledge-count pledge-privacy-note"
          disabled={disabled}
          id="pledge-copy"
          maxLength={MAX_PLEDGE_LENGTH}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder="Ship the VeilPledge beta"
          rows={3}
          value={remainingValue}
        />
        <span className="pledge-input__count" id="pledge-count">
          {remainingValue.length} / {MAX_PLEDGE_LENGTH}
        </span>
      </div>

      <button
        className="primary-action pledge-composer__action"
        disabled={!canSubmit}
        type="submit"
      >
        {busyLabel ? (
          <Loader2 aria-hidden="true" className="spin" size={24} strokeWidth={1.5} />
        ) : (
          <span className="primary-action__icon">
            <LockKeyhole aria-hidden="true" size={21} strokeWidth={1.5} />
          </span>
        )}
        <span>{busyLabel ?? "Create private pledge"}</span>
      </button>

      <p className="privacy-reassurance" id="pledge-privacy-note">
        <ShieldCheck aria-hidden="true" size={30} strokeWidth={1.5} />
        <span>
          Your secret is encrypted at rest in this browser profile.
          <br className="privacy-reassurance__desktop-break" /> Only its commitment
          reaches the ledger.
        </span>
      </p>
    </form>
  );
}
