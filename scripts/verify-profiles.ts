/* Slice 4 verification: profiles trigger + RLS behavior against the live project. */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error("missing SUPABASE env (names only checked)");

const admin = createClient(url, service, { auth: { persistSession: false } });
const suffix = Math.random().toString(36).slice(2, 8);
const emailA = `rls-probe-a-${suffix}@example.com`;
const emailB = `rls-probe-b-${suffix}@example.com`;
const pass = "Probe-Passw0rd!1";

function log(label: string, value: unknown) {
  console.log(`${label}:`, JSON.stringify(value));
}

async function main() {
  const { data: ua, error: ea } = await admin.auth.admin.createUser({
    email: emailA,
    password: pass,
    email_confirm: true,
    user_metadata: { full_name: "RLS Probe A" },
  });
  if (ea) throw new Error(`createUser A: ${ea.message}`);
  const { data: ub, error: eb } = await admin.auth.admin.createUser({
    email: emailB,
    password: pass,
    email_confirm: true,
    user_metadata: { full_name: "" },
  });
  if (eb) throw new Error(`createUser B: ${eb.message}`);
  const idA = ua.user!.id;
  const idB = ub.user!.id;
  log("users created", { a: idA.slice(0, 8), b: idB.slice(0, 8) });

  const { data: pa } = await admin.from("profiles").select("display_name").eq("id", idA);
  const { data: pb } = await admin.from("profiles").select("display_name").eq("id", idB);
  log("[1] trigger row A (metadata full_name)", pa);
  log("[2] row B (empty full_name -> email prefix)", pb);

  const clientA = createClient(url!, anon!, { auth: { persistSession: false } });
  const clientB = createClient(url!, anon!, { auth: { persistSession: false } });
  const sa = await clientA.auth.signInWithPassword({ email: emailA, password: pass });
  const sb = await clientB.auth.signInWithPassword({ email: emailB, password: pass });
  log("[sA] signIn A", sa.error ? sa.error.message : `ok session=${Boolean(sa.data.session)}`);
  log("[sB] signIn B", sb.error ? sb.error.message : `ok session=${Boolean(sb.data.session)}`);

  const { data: gu, error: guErr } = await clientA.auth.getUser();
  log("[0] A session getUser", gu.user ? gu.user.id.slice(0, 8) : guErr?.message ?? "null");
  const { data: aOwn } = await clientA.from("profiles").select("id").eq("id", idA);
  const { data: aSeesB } = await clientA.from("profiles").select("id").eq("id", idB);
  const { data: aAll } = await clientA.from("profiles").select("display_name");
  log("[3] A selects own row (want 1)", aOwn);
  log("[3b] A selects ALL profiles (want only own row)", aAll);
  log("[4] A selects B's row (want [])", aSeesB);

  const { data: bHacks, error: bErr } = await clientB
    .from("profiles")
    .update({ display_name: "HACKED" })
    .eq("id", idA)
    .select();
  log("[5] B updates A's row (want [] or error)", bErr ? `error: ${bErr.message}` : bHacks);
  const { data: aAfter } = await admin.from("profiles").select("display_name").eq("id", idA);
  log("[6] A's display_name after B's update (want 'RLS Probe A')", aAfter);

  const { data: aSelf, error: aUpdErr } = await clientA
    .from("profiles")
    .update({ display_name: "RLS Probe A2" })
    .eq("id", idA)
    .select();
  log("[7] A updates own row (want 1 row)", aUpdErr ? `error: ${aUpdErr.message}` : aSelf);

  await admin.auth.admin.deleteUser(idA);
  await admin.auth.admin.deleteUser(idB);
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", [idA, idB]);
  log("[8] rows after delete (want 0)", count);
  console.log("verify-profiles: DONE");
}

main().catch((e) => {
  console.error("verify-profiles FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
