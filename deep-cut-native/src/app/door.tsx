import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { colors, fonts, mono } from "@/lib/theme";
import BackButton from "@/components/BackButton";
import HouseNav from "@/components/HouseNav";
import { Button, Eyebrow, Marquee } from "@/components/ui";

// The Door, on a phone — the owner's waitlist controls, mirroring the web
// console's Door tab against the same /api/admin/waitlist endpoint. The gate is
// server-side (the API 403s anyone whose email isn't in ADMIN_EMAILS), so this
// screen never decides who's an admin; it only reacts to being told no.
//
// Seating someone sends them a real invite email, which is not undoable, so
// both seat actions confirm first.

interface Entry {
  email: string;
  joinedAt: string;
}

interface DoorState {
  pending: Entry[];
  approved: Entry[];
  approvedToday: number;
}

/**
 * Turn the server's failure note into something worth reading. Seating has two
 * distinct halves — Supabase mints the sign-in link, Resend delivers it — and
 * which half broke is the whole diagnosis.
 */
function inviteError(raw: string | undefined, status: number): string {
  const msg = (raw ?? "").trim();
  if (!msg) {
    return status === 0
      ? "No connection — check your signal and try again."
      : "The invite didn't send, and the server didn't say why.";
  }
  if (msg.startsWith("email_failed")) {
    const reason = msg.replace(/^email_failed\s*—\s*/, "");
    return `Their account was created, but Resend refused the ticket email:\n\n${reason}\n\nThey're still in the line, so you can retry.`;
  }
  if (msg === "no_link_generated" || /AuthError/i.test(msg)) {
    return `Supabase wouldn't create a sign-in link: ${msg}`;
  }
  if (/rate limit|too many|429/i.test(msg)) {
    return "Rate limited — wait a minute and try again.";
  }
  return msg;
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function DoorScreen() {
  const [state, setState] = useState<DoorState | null>(null);
  const [denied, setDenied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // an email, or "batch"

  const load = useCallback(async () => {
    const res = await api<DoorState>("/api/admin/waitlist");
    if (res.status === 403 || res.status === 401) {
      setDenied(true);
      setState({ pending: [], approved: [], approvedToday: 0 });
      return;
    }
    setDenied(false);
    setState({
      pending: res.data?.pending ?? [],
      approved: res.data?.approved ?? [],
      approvedToday: res.data?.approvedToday ?? 0,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function seat(email: string) {
    setBusy(email);
    const res = await api<{ ok?: boolean; error?: string }>("/api/admin/waitlist", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setBusy(null);
    if (res.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Seated", `${email} just got their invite.`);
      await load();
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Show what actually went wrong. The invite is sent by Supabase Auth, not
      // by this app, and its failures are specific and actionable — a rate
      // limit reads very differently from a bad address. A canned "try again in
      // a minute" hid the one detail worth having.
      Alert.alert("Invite failed", inviteError(res.data?.error, res.status));
    }
  }

  function confirmSeat(email: string) {
    Alert.alert("Seat this person?", `${email} gets an invite email and can sign in.`, [
      { text: "Not yet", style: "cancel" },
      { text: "Seat them", onPress: () => void seat(email) },
    ]);
  }

  async function seatNext(n: number) {
    setBusy("batch");
    const res = await api<{
      approved?: string[];
      failed?: Array<{ email: string; note?: string }>;
    }>("/api/admin/waitlist", { method: "POST", body: JSON.stringify({ next: n }) });
    setBusy(null);
    const count = res.data?.approved?.length ?? 0;
    const failed = res.data?.failed ?? [];
    void Haptics.notificationAsync(
      count > 0 && failed.length === 0
        ? Haptics.NotificationFeedbackType.Success
        : count > 0
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
    );
    // A batch reports per-person outcomes, so partial failure is normal and used
    // to vanish: the old copy read the empty approved list as "the line is
    // empty" and said nothing at all about the people it had just failed on.
    if (failed.length > 0) {
      Alert.alert(
        count > 0 ? "Some got in" : "Nobody got in",
        `${count} seated, ${failed.length} failed.\n\n${inviteError(failed[0]?.note, res.status)}`,
      );
    } else {
      Alert.alert(
        count > 0 ? "Row seated" : "Nobody to seat",
        count > 0 ? `${count} invite${count === 1 ? "" : "s"} on the way.` : "The line is empty.",
      );
    }
    await load();
  }

  function confirmSeatNext() {
    const n = Math.min(10, state?.pending.length ?? 0);
    if (n === 0) return;
    Alert.alert(
      `Seat the next ${n}?`,
      `${n} ${n === 1 ? "person gets an invite" : "people get invites"} right now.`,
      [
        { text: "Not yet", style: "cancel" },
        { text: `Seat ${n}`, onPress: () => void seatNext(10) },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.amber} />
        }
      >
        <BackButton />

        <View>
          <Eyebrow style={{ marginTop: 4 }}>The door</Eyebrow>
          <Marquee size={40}>WHO&apos;S IN LINE</Marquee>
        </View>

        {state === null ? (
          <Text style={styles.muted}>Checking the line…</Text>
        ) : denied ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              This door isn&apos;t yours. Sign in with the owner account to work the line.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.stats}>
              {[
                { n: state.pending.length, l: "in line" },
                { n: state.approvedToday, l: "seated today" },
                { n: state.approved.length, l: "all time" },
              ].map((s) => (
                <View key={s.l} style={styles.stat}>
                  <Text style={styles.statNum}>{s.n}</Text>
                  <Text style={styles.statLabel}>{s.l}</Text>
                </View>
              ))}
            </View>

            {state.pending.length > 0 && (
              <Button
                title={busy === "batch" ? "Seating…" : "🎟 Seat the next 10"}
                onPress={confirmSeatNext}
                busy={busy === "batch"}
                disabled={busy !== null}
              />
            )}

            {state.pending.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.muted}>
                  Nobody in line. Post the link — the lobby won&apos;t fill itself.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                {state.pending.map((e, i) => (
                  <View key={e.email} style={styles.row}>
                    <Text style={styles.rowNum}>#{i + 1}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowEmail} numberOfLines={1}>
                        {e.email}
                      </Text>
                      <Text style={styles.rowAgo}>waiting {ago(e.joinedAt)}</Text>
                    </View>
                    <Pressable
                      onPress={() => confirmSeat(e.email)}
                      disabled={busy !== null}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Seat ${e.email}`}
                      style={({ pressed }) => [
                        styles.seatBtn,
                        (pressed || busy === e.email) && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={styles.seatText}>{busy === e.email ? "…" : "SEAT"}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {state.approved.length > 0 && (
              <View style={{ gap: 6 }}>
                <Eyebrow>Recently seated</Eyebrow>
                {state.approved.slice(0, 10).map((e) => (
                  <View key={e.email} style={styles.seatedRow}>
                    <Text style={styles.seatedEmail} numberOfLines={1}>
                      {e.email}
                    </Text>
                    <Text style={styles.seatedMark}>🎟</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.footnote}>
              The trickle seats {"25"}/day on its own at 5pm UTC. Set WAITLIST_DAILY to 0 to make
              every seat yours.
            </Text>
          </>
        )}
      </ScrollView>
      <HouseNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  emptyCard: {
    borderColor: colors.line,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 18,
    alignItems: "center",
  },
  body: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  muted: { color: colors.dim, fontFamily: mono, fontSize: 12, textAlign: "center", lineHeight: 18 },
  stats: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  statNum: { color: colors.amber, fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
  statLabel: { color: colors.dim, fontFamily: mono, fontSize: 9, letterSpacing: 1.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowNum: { color: colors.ticket, fontFamily: fonts.display, fontSize: 20, width: 34 },
  rowEmail: { color: colors.cream, fontFamily: fonts.body, fontSize: 14 },
  rowAgo: { color: colors.dim, fontFamily: mono, fontSize: 10, marginTop: 1 },
  seatBtn: {
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  seatText: { color: colors.amber, fontFamily: mono, fontSize: 10, letterSpacing: 1.5 },
  seatedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  seatedEmail: { flex: 1, color: colors.dim, fontFamily: mono, fontSize: 11 },
  seatedMark: { fontSize: 11 },
  footnote: {
    color: colors.dim,
    fontFamily: mono,
    fontSize: 9,
    lineHeight: 15,
    letterSpacing: 0.5,
    textAlign: "center",
  },
});
