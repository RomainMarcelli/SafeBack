// Tests unitaires pour valider le comportement de `homeQuickActions` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import { formatQuickArrivalMessage } from "./homeQuickActions";

describe("homeQuickActions", () => {
  it("formats zero guardians", () => {
    expect(formatQuickArrivalMessage(0)).toBe(
      "Confirmation envoyée. Aucun garant actif a notifier."
    );
  });

  it("formats singular guardian", () => {
    expect(formatQuickArrivalMessage(1)).toBe("Confirmation envoyée a 1 garant.");
  });

  it("formats plural guardians", () => {
    expect(formatQuickArrivalMessage(3)).toBe("Confirmation envoyée a 3 garants.");
  });
});
