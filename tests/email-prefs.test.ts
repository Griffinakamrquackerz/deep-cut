import { describe, it, expect } from "vitest";
import { unsubscribeToken, unsubscribeUrl, validUnsubscribe } from "@/lib/email-prefs";

const U = "11111111-2222-3333-4444-555555555555";
const V = "99999999-8888-7777-6666-555555555555";

describe("unsubscribe links", () => {
  it("accepts its own token", () => {
    expect(validUnsubscribe(U, "programme", unsubscribeToken(U, "programme"))).toBe(true);
  });

  it("won't let one person unsubscribe another", () => {
    // The whole point of signing: the link is per-person, and swapping the id
    // in the query string must not work.
    expect(validUnsubscribe(V, "programme", unsubscribeToken(U, "programme"))).toBe(false);
  });

  it("rejects a made-up token", () => {
    expect(validUnsubscribe(U, "programme", "f".repeat(32))).toBe(false);
  });

  it("rejects a token cut short by a mail client", () => {
    const t = unsubscribeToken(U, "programme");
    expect(validUnsubscribe(U, "programme", t.slice(0, 20))).toBe(false);
    expect(validUnsubscribe(U, "programme", "")).toBe(false);
  });

  it("is stable, so a link still works a month after it was sent", () => {
    expect(unsubscribeToken(U, "programme")).toBe(unsubscribeToken(U, "programme"));
  });

  it("builds a url the page can read", () => {
    const url = new URL(unsubscribeUrl("https://thedeepcut.xyz", U, "programme"));
    expect(url.pathname).toBe("/unsubscribe");
    expect(url.searchParams.get("u")).toBe(U);
    expect(url.searchParams.get("k")).toBe("programme");
    expect(validUnsubscribe(U, "programme", url.searchParams.get("t")!)).toBe(true);
  });
});
