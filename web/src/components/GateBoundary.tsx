import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  Fingerprint,
  Hash,
  KeyRound,
  List,
  LockKeyhole,
  RotateCcw,
  Shield,
  ShieldCheck,
} from "lucide-react";

import { CrescentMark } from "./CrescentMark";

interface BoundaryItem {
  label: string;
  icon: LucideIcon;
}

interface GateBoundaryProps {
  variant?: "side" | "rail";
}

const publicItems: BoundaryItem[] = [
  { label: "Allowlist tree root", icon: Hash },
  { label: "Member count", icon: List },
  { label: "Check-in count", icon: BarChart3 },
  { label: "Current epoch", icon: RotateCcw },
  { label: "Spent nullifiers", icon: CheckCircle2 },
];

const privateItems: BoundaryItem[] = [
  { label: "Your member secret", icon: KeyRound },
  { label: "Which entry you are", icon: Fingerprint },
  { label: "Your check-ins across epochs", icon: ShieldCheck },
];

function BoundaryGroup({
  title,
  items,
  icon: GroupIcon,
  kind,
}: {
  title: string;
  items: BoundaryItem[];
  icon: LucideIcon;
  kind: "public" | "private";
}) {
  return (
    <div className={`boundary-group boundary-group--${kind}`}>
      <h2 className="boundary-group__title">
        <GroupIcon aria-hidden="true" size={32} strokeWidth={1.5} />
        <span>{title}</span>
      </h2>

      <ul className="boundary-list">
        {items.map(({ label, icon: ItemIcon }) => (
          <li className="boundary-row" key={label}>
            <ItemIcon aria-hidden="true" size={29} strokeWidth={1.5} />
            <span className="boundary-row__label">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GateBoundary({ variant = "side" }: GateBoundaryProps) {
  return (
    <section
      aria-label="Public and private data boundary"
      className={`privacy-boundary privacy-boundary--${variant}`}
    >
      <BoundaryGroup
        icon={Eye}
        items={publicItems}
        kind="public"
        title="What the network sees"
      />

      <div className="boundary-crescent-rule" aria-hidden="true">
        <span />
        <CrescentMark />
        <span />
      </div>

      <div className="boundary-rail-seal" aria-hidden="true">
        <Shield />
        <CrescentMark />
      </div>

      <BoundaryGroup
        icon={LockKeyhole}
        items={privateItems}
        kind="private"
        title="What stays with you"
      />
    </section>
  );
}
