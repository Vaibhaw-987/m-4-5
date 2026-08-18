import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Eye,
  FileText,
  Grid2X2,
  Hash,
  KeyRound,
  List,
  LockKeyhole,
  Shield,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { CrescentMark } from "./CrescentMark";

interface BoundaryItem {
  label: string;
  icon: LucideIcon;
}

interface PrivacyBoundaryProps {
  variant?: "side" | "rail";
}

const publicItems: BoundaryItem[] = [
  { label: "Pledge text", icon: FileText },
  { label: "Board status", icon: Grid2X2 },
  { label: "Sequence", icon: List },
  { label: "Completion count", icon: BarChart3 },
  { label: "Owner commitment", icon: Hash },
];

const privateItems: BoundaryItem[] = [
  { label: "Owner secret", icon: KeyRound },
  { label: "Wallet signing keys", icon: WalletCards },
  { label: "Ownership witness", icon: ShieldCheck },
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

export function PrivacyBoundary({ variant = "side" }: PrivacyBoundaryProps) {
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
