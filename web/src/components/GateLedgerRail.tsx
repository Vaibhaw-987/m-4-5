import {
  CheckCircle2,
  Fingerprint,
  Grid2X2,
  Hash,
  List,
  RotateCcw,
} from "lucide-react";

import type { GateLedgerSnapshot } from "../veilgate-types";
import { CopyControl } from "./CopyControl";

interface GateLedgerRailProps {
  ledger: GateLedgerSnapshot;
  onCopyRoot?: (root: string) => Promise<void> | void;
}

export function GateLedgerRail({ ledger, onCopyRoot }: GateLedgerRailProps) {
  const copyRoot = ledger.memberRoot === "Not indexed" ? undefined : onCopyRoot;
  const items = [
    {
      label: "Gate status",
      value: ledger.gateStatus,
      icon: Grid2X2,
      tone: ledger.gateStatus === "Unavailable" ? "danger" : "default",
    },
    { label: "Members", value: ledger.members, icon: List, tone: "default" },
    {
      label: "Check-ins",
      value: ledger.checkins,
      icon: CheckCircle2,
      tone: "default",
    },
    { label: "Epoch", value: ledger.epoch, icon: RotateCcw, tone: "default" },
  ] as const;

  return (
    <section
      aria-busy={ledger.gateStatus === "Loading" || undefined}
      aria-label="Public allowlist ledger snapshot"
      aria-live="polite"
      className={`ledger-rail ledger-rail--${ledger.gateStatus.toLowerCase()}`}
    >
      <dl className="ledger-rail__list">
        {items.map(({ label, value, icon: ItemIcon, tone }) => (
          <div className={`ledger-item ledger-item--${tone}`} key={label}>
            <span className="ledger-item__icon" aria-hidden="true">
              <ItemIcon size={27} strokeWidth={1.5} />
            </span>
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          </div>
        ))}

        <div className="ledger-item ledger-item--commitment">
          <span className="ledger-item__icon" aria-hidden="true">
            <Fingerprint className="ledger-item__fingerprint" size={28} strokeWidth={1.5} />
            <Hash className="ledger-item__hash" size={27} strokeWidth={1.5} />
          </span>
          <div>
            <dt>Tree root</dt>
            <dd className="ledger-item__commitment-value">
              <span title={ledger.memberRoot}>
                {ledger.memberRootLabel ?? ledger.memberRoot}
              </span>
              {copyRoot ? (
                <CopyControl
                  failureMessage="Could not copy the tree root."
                  label="Copy tree root"
                  onCopy={copyRoot}
                  successMessage="Tree root copied."
                  value={ledger.memberRoot}
                />
              ) : null}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
