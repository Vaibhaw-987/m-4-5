import { Fingerprint, KeyRound } from "lucide-react";

import type { GateRole } from "../veilgate-types";

interface GateRoleTabsProps {
  role: GateRole;
  disabled?: boolean;
  onSelectRole?: (role: GateRole) => void;
}

const tabs = [
  { role: "organizer", label: "Organizer", icon: KeyRound },
  { role: "member", label: "Member", icon: Fingerprint },
] as const;

export function GateRoleTabs({
  role,
  disabled = false,
  onSelectRole,
}: GateRoleTabsProps) {
  return (
    <div aria-label="VeilGate role" className="gate-roles" role="tablist">
      {tabs.map(({ role: tabRole, label, icon: TabIcon }) => (
        <button
          aria-controls={`gate-panel-${tabRole}`}
          aria-selected={role === tabRole}
          className={`gate-roles__tab${role === tabRole ? " gate-roles__tab--selected" : ""}`}
          disabled={disabled}
          id={`gate-tab-${tabRole}`}
          key={tabRole}
          onClick={() => onSelectRole?.(tabRole)}
          role="tab"
          type="button"
        >
          <TabIcon aria-hidden="true" size={21} strokeWidth={1.5} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
