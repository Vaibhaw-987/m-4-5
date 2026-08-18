import {
  ExternalLink,
  Link2,
  Loader2,
  Sparkles,
  WalletCards,
} from "lucide-react";

import type { ContractReference, WalletView } from "../types";
import { CrescentMark } from "./CrescentMark";

interface AppHeaderProps {
  network: string;
  contract: ContractReference;
  wallet: WalletView;
  onConnect?: () => void;
  onDisconnect?: () => void;
  disconnectDisabled?: boolean;
}

function walletLabel(address: string) {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AppHeader({
  network,
  contract,
  wallet,
  onConnect,
  onDisconnect,
  disconnectDisabled = false,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand" aria-label="VeilPledge home">
        <CrescentMark className="brand__mark" />
        <span className="brand__name">VeilPledge</span>
      </div>

      <div className="app-header__context" aria-label="Network and contract">
        <span className="network-label">
          <span className="network-label__dot" aria-hidden="true" />
          {network}
        </span>

        <span className="context-separator" aria-hidden="true" />

        {contract.href ? (
          <a
            aria-label={`Open Preprod explorer; contract ${contract.value ?? contract.label}`}
            className="contract-link"
            href={contract.href}
            rel="noreferrer"
            target="_blank"
            title={contract.value ?? contract.label}
          >
            <Link2 aria-hidden="true" size={19} strokeWidth={1.5} />
            <span aria-hidden={Boolean(contract.value)}>{contract.label}</span>
            <ExternalLink aria-hidden="true" size={18} strokeWidth={1.5} />
          </a>
        ) : (
          <span
            aria-label={`Contract ${contract.value ?? contract.label}`}
            className="contract-link contract-link--static"
            role="group"
            title={contract.value ?? contract.label}
          >
            <Link2 aria-hidden="true" size={19} strokeWidth={1.5} />
            <span aria-hidden={Boolean(contract.value)}>{contract.label}</span>
          </span>
        )}
      </div>

      <div className="wallet-actions">
        {wallet.status === "connected" ? (
          <>
            <span
              aria-label={`Connected wallet ${wallet.address}`}
              className="wallet-address"
              role="group"
              title={wallet.address}
            >
              <WalletCards aria-hidden="true" size={19} strokeWidth={1.5} />
              <span aria-hidden="true">{walletLabel(wallet.address)}</span>
            </span>
            <button
              className="text-button"
              disabled={disconnectDisabled}
              onClick={onDisconnect}
              type="button"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            className="connect-button"
            disabled={wallet.status === "connecting"}
            onClick={onConnect}
            type="button"
          >
            {wallet.status === "connecting" ? (
              <Loader2
                aria-hidden="true"
                className="spin"
                size={22}
                strokeWidth={1.5}
              />
            ) : (
              <Sparkles aria-hidden="true" size={22} strokeWidth={1.5} />
            )}
            {wallet.status === "connecting" ? "Connecting…" : "Connect Lace"}
          </button>
        )}
      </div>
    </header>
  );
}
