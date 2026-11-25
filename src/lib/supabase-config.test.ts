import { describe, expect, it } from "vitest";
import { resolveSupabaseClientSettings } from "./supabase-config";

describe("resolveSupabaseClientSettings", () => {
  it("uses the local-only endpoint when configuration is absent", () => {
    expect(resolveSupabaseClientSettings(undefined, undefined)).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_local_unconfigured",
      usingSafeLocalFallback: true,
    });
  });

  it("rejects a remote Supabase project and its key", () => {
    expect(resolveSupabaseClientSettings("https://example.supabase.co", "public-example-key")).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_local_unconfigured",
      usingSafeLocalFallback: true,
    });
  });

  it("accepts the local CLI endpoint and its publishable key", () => {
    expect(resolveSupabaseClientSettings("http://localhost:54321/", "local-publishable-key")).toEqual({
      url: "http://localhost:54321",
      publishableKey: "local-publishable-key",
      usingSafeLocalFallback: false,
    });
  });

  it("rejects credentials, query strings, and lookalike loopback hosts", () => {
    for (const url of [
      "http://user:pass@127.0.0.1:54321",
      "http://127.0.0.1:54321/?project=shared",
      "http://localhost.evil.example:54321",
    ]) {
      expect(resolveSupabaseClientSettings(url, "do-not-use").usingSafeLocalFallback).toBe(true);
    }
  });
});
