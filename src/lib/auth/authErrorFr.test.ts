// Tests unitaires pour valider le comportement de `authErrorFr` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import { toSignupErrorFr } from "./authErrorFr";

describe("authErrorFr", () => {
  it("maps already registered errors to French UX copy", () => {
    const result = toSignupErrorFr({
      message: "User already registered",
      code: "user_already_exists"
    });

    expect(result.title).toBe("Compte deja existant");
    expect(result.code).toBe("user_already_exists");
  });

  it("maps weak password rule with extracted minimum length", () => {
    const result = toSignupErrorFr({
      message: "Password should be at least 8 characters"
    });

    expect(result.title).toBe("Mot de passe trop court");
    expect(result.message).toContain("8");
  });

  it("falls back to generic French message for unknown errors", () => {
    const result = toSignupErrorFr({
      message: "Something odd happened"
    });

    expect(result.title).toBe("Inscription impossible");
    expect(result.hint).toContain("reessaie");
  });
});
