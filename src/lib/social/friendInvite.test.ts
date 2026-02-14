// Tests unitaires pour garantir un message d'invitation toujours complet.
import { describe, expect, it } from "vitest";
import { buildFriendInviteMessage } from "./friendInvite";

describe("friendInvite", () => {
  it("inclut les informations principales", () => {
    const message = buildFriendInviteMessage({
      publicId: "ABCD1234",
      note: "Ajoute-moi quand tu peux"
    });

    expect(message).toContain("SafeBack");
    expect(message).toContain("ABCD1234");
    expect(message).toContain("Ajoute-moi quand tu peux");
  });

  it("reste stable sans note", () => {
    const message = buildFriendInviteMessage({ publicId: "XYZ987" });
    expect(message).toContain("Mon identifiant: XYZ987");
    expect(message).not.toContain("Message perso:");
  });
});
