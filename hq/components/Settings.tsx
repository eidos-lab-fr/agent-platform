"use client";

import { Archipel } from "./Archipel";
import { TeamTab } from "./Team";

/** Simple mode puts the set-up screens in one tab: the products, then the agent team. */
export function Settings({ onWizard }: { onWizard: () => void }) {
  return (
    <div className="settings">
      <h2 className="settings-title">Products</h2>
      <Archipel />
      <h2 className="settings-title">Agent team</h2>
      <TeamTab onWizard={onWizard} />
    </div>
  );
}
