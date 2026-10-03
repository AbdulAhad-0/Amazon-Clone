import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim();
  if (!value) throw new Error(`missing env ${name} in .env.local (never skipped)`);
  return value;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const service = env("SUPABASE_SERVICE_ROLE_KEY");

const suffix = Math.random().toString(36).slice(2, 8);
const emailA = `rls-test-a-${suffix}@example.com`;
const emailB = `rls-test-b-${suffix}@example.com`;
const pass = "Rls-Test-Passw0rd!1";

const admin = createClient(url, service, { auth: { persistSession: false } });
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let idA = "";
let idB = "";

// supabase-js resolves to different builds under node/tsx vs vitest ({user} vs {data:{user}}) — handle both
type Resp = { user?: { id: string } | null; error?: { message: string } | null; data?: { user?: { id: string } | null } | null };
function userOf(r: Resp): { id: string } | null {
  return r.user ?? r.data?.user ?? null;
}
function errOf(r: Resp): string | null {
  return r.error?.message ?? null;
}

describe("profiles trigger + RLS (live)", () => {
  beforeAll(async () => {
    const ua = await admin.auth.admin.createUser({
      email: emailA,
      password: pass,
      email_confirm: true,
      user_metadata: { full_name: "RLS Test A" },
    });
    const ub = await admin.auth.admin.createUser({
      email: emailB,
      password: pass,
      email_confirm: true,
      user_metadata: { full_name: "" },
    });
    const ea = errOf(ua);
    if (ea) throw new Error(ea);
    const eb = errOf(ub);
    if (eb) throw new Error(eb);
    const uA = userOf(ua);
    const uB = userOf(ub);
    if (!uA || !uB) throw new Error("createUser returned no user");
    idA = uA.id;
    idB = uB.id;

    clientA = createClient(url, anon, { auth: { persistSession: false } });
    clientB = createClient(url, anon, { auth: { persistSession: false } });
    const sa = await clientA.auth.signInWithPassword({ email: emailA, password: pass });
    const sb = await clientB.auth.signInWithPassword({ email: emailB, password: pass });
    if (sa.error) throw new Error(`signIn A: ${sa.error.message}`);
    if (sb.error) throw new Error(`signIn B: ${sb.error.message}`);
  });

  afterAll(async () => {
    if (idA) await admin.auth.admin.deleteUser(idA);
    if (idB) await admin.auth.admin.deleteUser(idB);
  });

  it("trigger creates one profile with metadata full_name", async () => {
    const { data } = await admin.from("profiles").select("display_name").eq("id", idA);
    expect(data).toEqual([{ display_name: "RLS Test A" }]);
  });

  it("trigger falls back to email prefix when full_name empty", async () => {
    const { data } = await admin.from("profiles").select("display_name").eq("id", idB);
    expect(data).toEqual([{ display_name: emailB.split("@")[0] }]);
  });

  it("user A reads own profile, not user B's", async () => {
    const own = await clientA.from("profiles").select("id").eq("id", idA);
    expect(own.data).toHaveLength(1);
    const other = await clientA.from("profiles").select("id").eq("id", idB);
    expect(other.data).toEqual([]);
    const all = await clientA.from("profiles").select("id");
    expect(all.data).toEqual([{ id: idA }]);
  });

  it("user B cannot change user A's profile", async () => {
    const hacked = await clientB.from("profiles").update({ display_name: "HACKED" }).eq("id", idA).select();
    expect(hacked.data).toEqual([]);
    const { data } = await admin.from("profiles").select("display_name").eq("id", idA);
    expect(data).toEqual([{ display_name: "RLS Test A" }]);
  });

  it("user A can update own profile", async () => {
    const updated = await clientA.from("profiles").update({ display_name: "RLS Test A2" }).eq("id", idA).select();
    expect(updated.data).toHaveLength(1);
    expect(updated.data![0].display_name).toBe("RLS Test A2");
  });

  it("cleanup: deleting users leaves zero profile rows", async () => {
    await admin.auth.admin.deleteUser(idA);
    await admin.auth.admin.deleteUser(idB);
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("id", [idA, idB]);
    expect(count).toBe(0);
    idA = "";
    idB = "";
  });
});
