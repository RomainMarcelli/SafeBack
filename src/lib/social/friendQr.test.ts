import { describe, expect, it } from "vitest";
import { parseSafeBackPublicIdFromQr } from "./friendQr";

describe("parseSafeBackPublicIdFromQr", () => {
  it("parses SAFEBACK prefix payload", () => {
    expect(parseSafeBackPublicIdFromQr("SAFEBACK|abc123")).toBe("abc123");
  });

  it("parses URL with publicId query", () => {
    expect(parseSafeBackPublicIdFromQr("https://safeback.app/add?publicId=u_42")).toBe("u_42");
  });

  it("accepts raw public id", () => {
    expect(parseSafeBackPublicIdFromQr("friend_99")).toBe("friend_99");
  });

  it("returns null for invalid payload", () => {
    expect(parseSafeBackPublicIdFromQr("hello world")).toBeNull();
  });
});
