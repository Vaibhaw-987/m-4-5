import { AlertTriangle, Info, ShieldAlert, Unplug } from "lucide-react";

import type { WalletNoticeKind } from "../types";

interface WalletNoticeProps {
  kind: WalletNoticeKind;
  title?: string;
  message?: string;
}

const noticeCopy = {
  "lace-missing": {
    title: "Lace wallet not found",
    message: "Install or enable Lace, then return here to connect on Preprod.",
    icon: AlertTriangle,
  },
  "wrong-network": {
    title: "Switch Lace to Preprod",
    message: "Writes stay blocked until your wallet is using the Preprod network.",
    icon: ShieldAlert,
  },
  rejected: {
    title: "Authorization was not approved",
    message: "Nothing was submitted. You can try the wallet request again.",
    icon: AlertTriangle,
  },
  disconnected: {
    title: "Disconnected locally",
    message: "To revoke authorization completely, remove VeilPledge inside Lace.",
    icon: Unplug,
  },
  generic: {
    title: "Action could not be completed",
    message: "Review the details and try again when you are ready.",
    icon: Info,
  },
} as const;

export function WalletNotice({ kind, title, message }: WalletNoticeProps) {
  const copy = noticeCopy[kind];
  const NoticeIcon = copy.icon;

  return (
    <aside className="wallet-notice" role="status">
      <NoticeIcon aria-hidden="true" size={23} strokeWidth={1.5} />
      <div>
        <strong>{title ?? copy.title}</strong>
        <p>{message ?? copy.message}</p>
      </div>
    </aside>
  );
}

