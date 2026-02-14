// Tests unitaires pour valider le comportement de `homeHub` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import { getHomeHubSections, getPrimaryHomeHubItems, HOME_HUB_ITEMS } from "./homeHub";

describe("homeHub", () => {
  it("garde des ids uniques dans le catalogue", () => {
    const ids = HOME_HUB_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("retourne des raccourcis essentiels en priorité", () => {
    const primary = getPrimaryHomeHubItems(3);
    expect(primary).toHaveLength(3);
    expect(primary.every((item) => item.category === "essentiel")).toBe(true);
  });

  it("regroupe les items par section", () => {
    const sections = getHomeHubSections();
    expect(sections.map((section) => section.id)).toEqual(["essentiel", "securite", "support"]);
    const total = sections.reduce((sum, section) => sum + section.items.length, 0);
    expect(total).toBe(HOME_HUB_ITEMS.length);
  });
});

