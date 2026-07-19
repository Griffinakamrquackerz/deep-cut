import { supabaseAdmin } from "./supabase/admin";
import { premiumConfigured } from "./premium";
import { pushConfigured } from "./push";
import { omdbConfigured } from "./omdb";

// Balcony Seats list price. Env-overridable; matches the $4.99/mo model.
const BALCONY_PRICE = Number(process.env.BALCONY_PRICE_USD) || 4.99;

// The booth's instrument panel. Every number an owner needs to know if Deep
// Cut is alive: who's joining, who's coming back, whether the taste engine
// actually lands (dealt→watched→loved), and where the money/content sit.
// Built defensively — a missing column or table degrades to null, never a 500.

export interface AdminStats {
  members: { total: number; new24h: number; new7d: number; new30d: number };
  active: { d7: number | null; d30: number | null };
  engine: { dealt: number; watched: number; loved: number; watchedRate: number; lovedRate: number };
  activity: {
    watches: number;
    watches7d: number;
    loved: number;
    playlists: number;
    follows: number;
    settleRulings: number;
  };
  premium: number | null;
  content: { movies: number; ratingsCoverage: number | null };
  recentSignups: Array<{ id: string; handle: string | null; email: string | null; at: string | null }>;
  topWatchlisted: Array<{ title: string; year: number | null; count: number }>;
  money: {
    configured: boolean;
    price: number;
    activeSubs: number; // premium_until in the future
    trialing: number; // latest Stripe status = trialing
    paying: number; // latest Stripe status = active
    canceled: number; // latest status canceled/unpaid/past_due
    conversions: number; // distinct users who ever started a sub
    mrr: number; // paying × price
    arr: number; // mrr × 12
    recentEvents: Array<{ email: string | null; kind: string; status: string; at: string }>;
    subscribers: Array<{ email: string | null; status: string; startedAt: string }>;
  };
  system: Array<{ name: string; ok: boolean; note: string }>;
}

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

// Await a fully-built count query, degrading a DB error to 0.
async function runCount(
  q: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count: c, error } = await q;
  return error ? 0 : (c ?? 0);
}

export async function gatherStats(): Promise<AdminStats> {
  const db = supabaseAdmin();
  const d1 = iso(1), d7 = iso(7), d30 = iso(30);
  const sel = (table: string) => db.from(table).select("id", { count: "exact", head: true });

  // ── Members ─────────────────────────────────────────────────────────
  const [total, new24h, new7d, new30d] = await Promise.all([
    runCount(sel("users")),
    runCount(sel("users").gte("created_at", d1)),
    runCount(sel("users").gte("created_at", d7)),
    runCount(sel("users").gte("created_at", d30)),
  ]);

  // ── Active (distinct users who logged a watch) ─────────────────────
  let d7Active: number | null = null;
  let d30Active: number | null = null;
  try {
    const { data } = await db
      .from("watch_logs")
      .select("user_id, watched_at")
      .gte("watched_at", d30)
      .limit(10_000);
    const s30 = new Set<string>();
    const s7 = new Set<string>();
    for (const r of data ?? []) {
      const uid = r.user_id as string;
      s30.add(uid);
      if ((r.watched_at as string) >= d7) s7.add(uid);
    }
    d30Active = s30.size;
    d7Active = s7.size;
  } catch {
    /* leave null */
  }

  // ── Taste engine funnel ─────────────────────────────────────────────
  const [dealt, watched, loved] = await Promise.all([
    runCount(sel("recommendations")),
    runCount(sel("recommendations").eq("status", "seen")),
    runCount(sel("watch_logs").in("reaction", ["loved", "loved_ironically"])),
  ]);
  const watchedRate = dealt ? Math.round((watched / dealt) * 1000) / 10 : 0;
  const lovedRate = watched ? Math.round((loved / watched) * 1000) / 10 : 0;

  // ── Activity ────────────────────────────────────────────────────────
  const [watches, watches7d, playlists, follows, settleRulings] = await Promise.all([
    runCount(sel("watch_logs")),
    runCount(sel("watch_logs").gte("watched_at", d7)),
    runCount(sel("playlists")),
    runCount(sel("follows")),
    runCount(sel("events").eq("name", "settle_ruling")),
  ]);

  // ── Premium (migration 0005 column) ─────────────────────────────────
  let premium: number | null = null;
  try {
    const { count: c, error } = await db
      .from("users")
      .select("id", { count: "exact", head: true })
      .gt("premium_until", new Date().toISOString());
    premium = error ? null : (c ?? 0);
  } catch {
    /* column absent → null */
  }

  // ── Content ─────────────────────────────────────────────────────────
  const movies = await runCount(sel("movies"));
  let ratingsCoverage: number | null = null;
  try {
    const { count: rated, error } = await db
      .from("movies")
      .select("id", { count: "exact", head: true })
      .not("ratings_refreshed_at", "is", null);
    ratingsCoverage = error || !movies ? null : Math.round(((rated ?? 0) / movies) * 100);
  } catch {
    /* column absent → null */
  }

  // ── Recent signups (email via auth admin) ───────────────────────────
  const { data: signupRows } = await db
    .from("users")
    .select("id, handle, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  let emailById = new Map<string, string | null>();
  try {
    const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? null]));
  } catch {
    /* no auth access → emails null */
  }
  const recentSignups = (signupRows ?? []).map((u) => ({
    id: u.id as string,
    handle: (u.handle as string | null) ?? null,
    email: emailById.get(u.id as string) ?? null,
    at: (u.created_at as string | null) ?? null,
  }));

  // ── Most-saved films (watchlist heat) ───────────────────────────────
  let topWatchlisted: AdminStats["topWatchlisted"] = [];
  try {
    const { data } = await db
      .from("recommendations")
      .select("movies(title, year)")
      .eq("status", "watchlisted")
      .limit(1000);
    const tally = new Map<string, { title: string; year: number | null; count: number }>();
    for (const r of data ?? []) {
      const m = r.movies as unknown as { title: string; year: number | null } | null;
      if (!m) continue;
      const key = `${m.title}|${m.year}`;
      const hit = tally.get(key);
      if (hit) hit.count++;
      else tally.set(key, { title: m.title, year: m.year, count: 1 });
    }
    topWatchlisted = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  } catch {
    /* leave empty */
  }

  // ── Money: Balcony Seats subscriptions ──────────────────────────────
  // Latest Stripe status per user comes from balcony_started/updated events;
  // premium_until (or its events fallback) says who's currently in the balcony.
  const emailFor = (uid: string | null): string | null =>
    uid ? (emailById.get(uid) ?? null) : null;

  const { data: subEvents } = await db
    .from("events")
    .select("user_id, name, props, created_at")
    .in("name", ["balcony_started", "balcony_updated"])
    .order("created_at", { ascending: false })
    .limit(800);

  const latestStatus = new Map<string, string>();
  const conversionUsers = new Set<string>();
  const startedAt = new Map<string, string>();
  for (const e of subEvents ?? []) {
    const uid = e.user_id as string | null;
    if (!uid) continue;
    conversionUsers.add(uid);
    if (!latestStatus.has(uid)) {
      const status = String((e.props as Record<string, unknown>)?.status ?? "unknown");
      latestStatus.set(uid, status);
      startedAt.set(uid, e.created_at as string);
    }
  }
  let trialing = 0,
    paying = 0,
    canceledSubs = 0;
  for (const status of latestStatus.values()) {
    if (status === "trialing") trialing++;
    else if (status === "active") paying++;
    else if (["canceled", "unpaid", "past_due", "incomplete_expired"].includes(status)) canceledSubs++;
  }
  const mrr = Math.round(paying * BALCONY_PRICE * 100) / 100;
  const recentEvents = (subEvents ?? []).slice(0, 12).map((e) => ({
    email: emailFor(e.user_id as string | null),
    kind: (e.name as string) === "balcony_started" ? "started" : "updated",
    status: String((e.props as Record<string, unknown>)?.status ?? "—"),
    at: e.created_at as string,
  }));
  const subscribers = [...latestStatus.entries()]
    .filter(([, s]) => s === "active" || s === "trialing")
    .map(([uid, status]) => ({
      email: emailFor(uid),
      status,
      startedAt: startedAt.get(uid) ?? "",
    }));

  // ── System health: what's wired vs waiting ─────────────────────────
  const system: AdminStats["system"] = [
    { name: "TMDB", ok: !!process.env.TMDB_API_KEY, note: "film data & posters" },
    {
      name: "LLM (recs)",
      ok: !!(process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY),
      note: "taste + deal reasoning",
    },
    { name: "OMDb", ok: omdbConfigured(), note: "IMDb / Rotten Tomatoes ratings" },
    { name: "Stripe", ok: premiumConfigured(), note: "Balcony Seats payments" },
    { name: "Web push", ok: pushConfigured(), note: "Friday Night Deal" },
  ];

  return {
    members: { total, new24h, new7d, new30d },
    active: { d7: d7Active, d30: d30Active },
    engine: { dealt, watched, loved, watchedRate, lovedRate },
    activity: { watches, watches7d, loved, playlists, follows, settleRulings },
    premium,
    content: { movies, ratingsCoverage },
    recentSignups,
    topWatchlisted,
    money: {
      configured: premiumConfigured(),
      price: BALCONY_PRICE,
      activeSubs: premium ?? 0,
      trialing,
      paying,
      canceled: canceledSubs,
      conversions: conversionUsers.size,
      mrr,
      arr: Math.round(mrr * 12 * 100) / 100,
      recentEvents,
      subscribers,
    },
    system,
  };
}
