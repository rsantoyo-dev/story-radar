"use client";

import { useState } from "react";

import { DisclosureActionMenu } from "@/app/ui/disclosure-action-menu";
import dashboardStyles from "@/app/radar-dashboard.generated.module.css";

export function HeaderCreationFixture() {
  const [action, setAction] = useState("");
  return <div>
    <div className={dashboardStyles.splitAction} role="group" aria-label="Create content fixture">
      <button type="button" className={dashboardStyles.newStoryButton} onClick={() => setAction("New story selected")}>＋ New story</button>
      <DisclosureActionMenu label="More creation actions" className={dashboardStyles.actionMenu} panelClassName={dashboardStyles.actionMenuItems} iconClassName={dashboardStyles.actionMenuChevron}>
        <button type="button" onClick={() => setAction("Add source selected")}>Add source</button>
        <button type="button" onClick={() => setAction("New Topic selected")}>New Topic</button>
        <a href="#ux-fixture-title">Manage Topics</a>
      </DisclosureActionMenu>
    </div>
    {action ? <p role="status">{action}</p> : null}
  </div>;
}
