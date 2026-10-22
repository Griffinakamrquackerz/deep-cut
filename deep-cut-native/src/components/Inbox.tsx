import { router } from "expo-router";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import { colors, fonts } from "@/lib/theme";

// The inbox — things that happened to you, and things you sent. Native port of
// ../src/components/Inbox.tsx.
//
// In: somebody tagged you in a comment, or handed you a film.
//
// Sent: what you passed on, and whether they've opened it. A send used to
// leave the sender with a toast and nothing else — the row belongs to the
// recipient, so there was no record on your side that you'd done it at all.
// "Delivered" means the row is in their inbox; "opened" means they've looked.

interface Actor {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Item {
  id: string;
  kind: "mention" | "film_sent";
  props: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  actor: Actor | null;
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

interface Sent {
  id: string;
  movieId: number | null;
  title: string | null;
  note: string | null;
  seenAt: string | null;
  sentAt: string;
  to: Actor | null;
}

function who(a: Actor | null): string {
  if (!a) return "someone";
  return a.handle ? `@${a.handle}` : (a.displayName ?? "someone");
}

function Face({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <Image source={{ uri: url }} style={styles.face} contentFit="cover" transition={120} />;
  }
  return (
    <View style={[styles.face, styles.faceFallback]}>
      <Text style={styles.faceInitial}>
        {name.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}

export default function Inbox({ onRead }: { onRead?: () => void }) {
  const [box, setBox] = useState<"in" | "sent">("in");
  const [items, setItems] = useState<Item[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ items: Item[]; unread: number }>("/api/notifications");
    setItems(res.data?.items ?? []);
    if (Number(res.data?.unread ?? 0) > 0) {
      // Opening the inbox is reading it. The rows keep their unread tint for
      // this render so you can still see what was new — the badge is what
      // clears.
      void api("/api/notifications", { method: "POST", body: JSON.stringify({}) });
      onRead?.();
    }
  }, [onRead]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only fetched when you go looking, and re-fetched each time so a
  // "delivered" that has since been opened doesn't sit there stale.
  useEffect(() => {
    if (box !== "sent") return;
    void api<{ sent: Sent[] }>("/api/notifications?box=sent").then((r) =>
      setSent(r.data?.sent ?? []),
    );
  }, [box]);

  const switcher = (
    <View style={styles.switcher}>
      {(["in", "sent"] as const).map((k) => (
        <Pressable
          key={k}
          onPress={() => setBox(k)}
          style={[styles.chip, box === k && styles.chipOn]}
        >
          <Text style={[styles.chipText, box === k && { color: colors.amber }]}>
            {k === "in" ? "IN" : "SENT"}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (box === "sent") {
    return (
      <View>
        {switcher}
        {sent === null ? (
          <Text style={styles.loading}>checking the outgoing tray…</Text>
        ) : !sent.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              You haven&apos;t sent anyone a film yet. Hit 🎞 Send to… on any film.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {sent.map((s) => (
              <View key={s.id} style={styles.row}>
                <Face url={s.to?.avatarUrl ?? null} name={who(s.to)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.line}>
                    You sent{" "}
                    <Text
                      style={styles.actor}
                      onPress={() => s.movieId && router.push(`/m/${s.movieId}`)}
                    >
                      {s.title ?? "a film"}
                    </Text>{" "}
                    to <Text style={styles.actor}>{who(s.to)}</Text>
                  </Text>
                  {s.note ? (
                    <Text style={styles.note} numberOfLines={1}>
                      “{s.note}”
                    </Text>
                  ) : null}
                  <Text style={styles.stamp}>
                    {ago(s.sentAt)} AGO ·{" "}
                    <Text style={{ color: s.seenAt ? colors.avail : colors.dim }}>
                      {s.seenAt ? "OPENED" : "DELIVERED"}
                    </Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (items === null) {
    return (
      <View>
        {switcher}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.amber} />
          <Text style={styles.loading}>checking the pigeonhole…</Text>
        </View>
      </View>
    );
  }

  if (!items.length) {
    return (
      <View>
        {switcher}
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Nothing yet. Tags and films people send you land here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      {switcher}
      <View style={{ gap: 8 }}>
      {items.map((n) => {
        const movieId = Number(n.props.movieId);
        const go = () => {
          if (n.kind === "film_sent" && Number.isFinite(movieId)) router.push(`/m/${movieId}`);
          else if (n.actor) router.push(`/u/${n.actor.handle ?? n.actor.id}`);
        };
        const note = typeof n.props.note === "string" ? n.props.note : null;
        return (
          <Pressable key={n.id} onPress={go} style={[styles.row, !n.readAt && styles.rowUnread]}>
            <Face url={n.actor?.avatarUrl ?? null} name={who(n.actor)} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.line}>
                <Text style={styles.actor}>{who(n.actor)}</Text>
                {n.kind === "mention" ? " tagged you in a comment." : " sent you a film."}
              </Text>
              {note ? (
                <Text style={styles.note} numberOfLines={1}>
                  “{note}”
                </Text>
              ) : null}
              <Text style={styles.stamp}>{ago(n.createdAt)} AGO</Text>
            </View>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: 28, alignItems: "center", gap: 10 },
  switcher: { flexDirection: "row", gap: 6, marginBottom: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  chipOn: { borderColor: colors.amber },
  chipText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2, color: colors.dim },
  loading: { fontFamily: fonts.mono, fontSize: 11, color: colors.dim },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: 6,
    padding: 18,
  },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.dim, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  rowUnread: { borderColor: "rgba(255,180,84,0.4)", backgroundColor: "rgba(255,180,84,0.06)" },
  face: { width: 34, height: 34, borderRadius: 17 },
  faceFallback: { backgroundColor: colors.line, alignItems: "center", justifyContent: "center" },
  faceInitial: { fontFamily: fonts.display, fontSize: 18, color: colors.cream },
  line: { fontFamily: fonts.body, fontSize: 14, color: colors.cream },
  actor: { fontFamily: fonts.bodyBold, color: colors.amber },
  note: { marginTop: 2, fontFamily: fonts.body, fontSize: 13, color: colors.dim },
  stamp: {
    marginTop: 3,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.dim,
  },
});
