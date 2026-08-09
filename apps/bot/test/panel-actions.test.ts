import { describe, expect, it } from "vitest";
import {
  buildPanelActionRow,
  getPanelActionResponse,
  onboardingRulesAcknowledgementId,
  panelActionIds,
} from "../src/lib/panel-actions.js";

describe("PipHackLup panel actions", () => {
  it("returns specific onboarding guidance", () => {
    const response = getPanelActionResponse(panelActionIds.onboarding);

    expect(response).toContain("/onboard checklist");
    expect(response).toContain("/onboard profile");
    expect(response).not.toContain("dashboard is in beta");
  });

  it("returns specific help queue guidance", () => {
    const response = getPanelActionResponse(panelActionIds.queues);

    expect(response).toContain("/queue open");
    expect(response).toContain("/queue status");
  });

  it("returns specific team guidance", () => {
    const response = getPanelActionResponse(panelActionIds.teams);

    expect(response).toContain("/team profile");
    expect(response).toContain("/team create");
    expect(response).toContain("/team match");
  });

  it("fails closed for unknown button IDs and builds the expected action row", () => {
    expect(getPanelActionResponse("piphacklup:unknown")).toBeNull();
    expect(
      buildPanelActionRow()
        .toJSON()
        .components.map((component) =>
          "custom_id" in component ? component.custom_id : null,
        ),
    ).toEqual([
      panelActionIds.onboarding,
      panelActionIds.queues,
      panelActionIds.teams,
    ]);
    expect(
      buildPanelActionRow(true)
        .toJSON()
        .components.map((component) =>
          "custom_id" in component ? component.custom_id : null,
        ),
    ).toEqual([
      panelActionIds.onboarding,
      panelActionIds.queues,
      panelActionIds.teams,
      onboardingRulesAcknowledgementId,
    ]);
  });
});
