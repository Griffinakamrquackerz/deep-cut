import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { fetchPeople, type Person } from "@/lib/people";
import { pushAskable, registerForPush } from "@/lib/push";
import { colors, fonts } from "@/lib/theme";

// Two ways to pass a film on — native port of
// ../src/components/ShareFilm.tsx.
//
// Out: the system share sheet, to anyone, over whatever app they use. Film
// pages are public and crawlable, so the link works for somebody who has never
// heard of Deep Cut — they get the film, the ratings and a way in, rather than
// a login wall, which is the difference between a share and a dead end.
//
// In: hand it to somebody who's already here. It lands in their inbox rather
// than anywhere public — this is passing someone a tape, not posting about it.

function Face({ url, name }: { url: string | null; name: string }) {
  if (url) return <Image source={{ uri: url }} style={styles.face} contentFit="cover" />;
  return (
    <View style={[styles.face, styles.faceFallback]}>
      <Text style={styles.faceInitial}>
        {name.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}

export default function ShareFilm({ movieId, title }: { movieId: number; title: string }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  // Offered after a successful send: you have just used the thing that
  // notifications are for, so the ask explains itself — and the system prompt
  // is one-shot on iOS, so it gets spent here rather than on a cold launch.
  const [offerPush, setOfferPush] = useState(false);

  const url = `${CONFIG.apiBaseUrl}/m/${movieId}`;

  const load = useCallback(async (query: string) => {
    setPeople((await fetchPeople(query)).slice(0, 12));
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(q.trim()), 200);
    return () => clearTimeout(t);
  }, [open, q, load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  async function shareOut() {
    void Haptics.selectionAsync();
    await Share.share({ message: `${title} — on Deep Cut\n${url}`, url }).catch(() => null);
  }

  async function send(p: Person) {
    setSending(p.id);
    const res = await api<{ error?: string }>("/api/share/film", {
      method: "POST",
      body: JSON.stringify({ toUserId: p.id, movieId, note: note.trim() || undefined }),
    });
    setSending(null);
    if (!res.ok) {
      setFlash(
        res.data?.error === "rate_limited"
          ? "That's a lot of films for one day. Try again tomorrow."
          : res.data?.error === "unavailable"
            ? "Can't send to them."
            : "Didn't go through — nothing was sent.",
      );
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent((s) => [...s, p.id]);
    setFlash(`Sent to ${p.handle ? `@${p.handle}` : (p.display_name ?? "them")}.`);
    if (await pushAskable()) setOfferPush(true);
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => void shareOut()}>
          <Text style={styles.btnText}>↗ Share</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => setOpen((v) => !v)}>
          <Text style={styles.btnText}>🎞 Send to…</Text>
        </Pressable>
      </View>

      {flash ? <Text style={styles.flash}>{flash}</Text> : null}

      {offerPush && (
        <View style={styles.offer}>
          <Text style={styles.offerText}>Want to know when they send one back?</Text>
          <Pressable
            style={styles.offerYes}
            onPress={() => {
              setOfferPush(false);
              void registerForPush(true);
            }}
          >
            <Text style={styles.offerYesText}>TURN ON</Text>
          </Pressable>
          <Pressable onPress={() => setOfferPush(false)} hitSlop={8}>
            <Text style={styles.offerNo}>NO</Text>
          </Pressable>
        </View>
      )}

      {open && (
        <View style={styles.panel}>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 140))}
            placeholder="Say something (optional)"
            placeholderTextColor="rgba(183,164,145,0.6)"
            style={styles.input}
          />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Find someone…"
            placeholderTextColor="rgba(183,164,145,0.6)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {people === null ? (
            <Text style={styles.quiet}>looking…</Text>
          ) : people.length === 0 ? (
            <Text style={styles.quiet}>nobody by that name.</Text>
          ) : (
            <View>
              {people.map((p) => {
                const name = p.handle ? `@${p.handle}` : (p.display_name ?? "someone");
                const done = sent.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    disabled={done || sending === p.id}
                    onPress={() => void send(p)}
                    style={[styles.personRow, done && { opacity: 0.5 }]}
                  >
                    <Face url={p.avatar_url} name={name} />
                    <Text style={styles.personName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.sendLabel}>
                      {done ? "SENT" : sending === p.id ? "…" : "SEND"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.cream,
  },
  flash: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber, textAlign: "center" },
  panel: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.cream,
  },
  quiet: { fontFamily: fonts.mono, fontSize: 10, color: colors.dim },
  offer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,180,84,0.4)",
    backgroundColor: "rgba(255,180,84,0.06)",
    borderRadius: 6,
    padding: 10,
  },
  offerText: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 13, color: colors.cream },
  offerYes: { backgroundColor: colors.amber, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  offerYesText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.3, color: colors.bg },
  offerNo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.3, color: colors.dim },
  personRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  face: { width: 26, height: 26, borderRadius: 13 },
  faceFallback: { backgroundColor: colors.line, alignItems: "center", justifyContent: "center" },
  faceInitial: { fontFamily: fonts.display, fontSize: 14, color: colors.cream },
  personName: { flex: 1, minWidth: 0, fontFamily: fonts.mono, fontSize: 12, color: colors.cream },
  sendLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.4, color: colors.amber },
});
