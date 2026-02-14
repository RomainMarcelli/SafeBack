// Tests unitaires pour valider le comportement de `authFlows` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPasswordMock = vi.hoisted(() => vi.fn());
const signUpMock = vi.hoisted(() => vi.fn());
const upsertProfileMock = vi.hoisted(() => vi.fn());

vi.mock("../core/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock
    }
  }
}));

vi.mock("../core/db", () => ({
  upsertProfile: upsertProfileMock
}));

import { signInWithCredentials, signUpAndMaybeCreateProfile } from "./authFlows";

describe("authFlows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPasswordMock.mockResolvedValue({ error: null });
    signUpMock.mockResolvedValue({
      data: {
        session: null
      },
      error: null
    });
    upsertProfileMock.mockResolvedValue({});
  });

  it("signInWithCredentials trims identifier before auth call", async () => {
    await signInWithCredentials({
      identifier: "  test@example.com  ",
      password: "secret"
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "secret"
    });
  });

  it("signInWithCredentials rethrows auth errors", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: new Error("invalid login")
    });

    await expect(
      signInWithCredentials({
        identifier: "test@example.com",
        password: "bad"
      })
    ).rejects.toThrow("invalid login");
  });

  it("signUpAndMaybeCreateProfile skips profile upsert without active session", async () => {
    await signUpAndMaybeCreateProfile({
      email: "hello@example.com",
      password: "secret",
      profile: {
        username: "hello",
        first_name: "Jean",
        last_name: "Dupont",
        phone: "0600000000"
      }
    });

    expect(signUpMock).toHaveBeenCalledTimes(1);
    expect(upsertProfileMock).not.toHaveBeenCalled();
  });

  it("signUpAndMaybeCreateProfile upserts cleaned profile when session exists", async () => {
    signUpMock.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1"
          }
        }
      },
      error: null
    });

    await signUpAndMaybeCreateProfile({
      email: " hello@example.com ",
      password: "secret",
      profile: {
        username: " hello ",
        first_name: " Jean ",
        last_name: " Dupont ",
        phone: " 06 00 00 00 00 "
      }
    });

    expect(signUpMock).toHaveBeenCalledWith({
      email: "hello@example.com",
      password: "secret"
    });
    expect(upsertProfileMock).toHaveBeenCalledWith({
      username: "hello",
      first_name: "Jean",
      last_name: "Dupont",
      phone: "06 00 00 00 00"
    });
  });
});
