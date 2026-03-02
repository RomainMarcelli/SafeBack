import { describe, expect, it } from "vitest";
import {
  getOnboardingTutorialSteps,
  getTutorialGlobalProgressLabel,
  getTutorialSectionStats
} from "./onboardingTutorial";

describe("onboardingTutorial", () => {
  it("builds a complete tutorial with many steps", () => {
    const steps = getOnboardingTutorialSteps();
    expect(steps.length).toBeGreaterThan(10);
    expect(steps.some((step) => step.route === "/setup")).toBe(true);
    expect(steps.some((step) => step.route === "/friends-map")).toBe(true);
    expect(steps.some((step) => step.route === "/quick-sos")).toBe(true);
  });

  it("returns stable global progress labels", () => {
    expect(getTutorialGlobalProgressLabel(0, 5)).toBe("1/5");
    expect(getTutorialGlobalProgressLabel(3, 5)).toBe("4/5");
    expect(getTutorialGlobalProgressLabel(99, 5)).toBe("5/5");
    expect(getTutorialGlobalProgressLabel(-4, 5)).toBe("1/5");
    expect(getTutorialGlobalProgressLabel(0, 0)).toBe("0/0");
  });

  it("groups tutorial steps by section", () => {
    const stats = getTutorialSectionStats(getOnboardingTutorialSteps());
    expect(stats.length).toBeGreaterThan(3);
    expect(stats.some((entry) => entry.sectionId === "trajets")).toBe(true);
    expect(stats.some((entry) => entry.sectionId === "alertes")).toBe(true);
  });
});

