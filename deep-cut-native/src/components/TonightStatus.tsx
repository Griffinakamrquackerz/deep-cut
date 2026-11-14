import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Poster } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts } from "@/lib/theme";

// "What I'm watching tonight" — a plan, on a profile. Native port of
// ../src/components/TonightStatus.tsx.
//
// Setting one puts a line on your card and a card in the Lobby for anyone
// following you. It pings nobody, which is the point: it's a note on a door,
// not a phone call. It goes stale on its own after eighteen hours, so a plan is
// still there over breakfast and gone before the next evening starts.
//
// The same component draws someone else's — read-only, and absent entirely
// when they haven't said. An empty prompt on a stranger's card is furniture
// asking a question nobody can answer.

export interface TonightCard {
  movieId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  note: string | null;
  expiresAt: string;
}

interface Film {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
}

export default function TonightStatus({
  initial,
  editable,
  name,
  accent = colors.amber,
}: {
  initial: TonightCard | null;
  editable: boolean;
  /** Whose plan this is, for the read-only line. */
  name?: string;
  accent?: string;
}) {
  const [plan, setPlan] = useState<TonightCard | null>(initial);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Film[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The server can answer with a plan after this mounted (the profile loads
  // async), so follow it rather than snapshotting once.
  useEffect(() => setPlan(initial), [initial]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!open || !q.trim()) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await api<{ results: Film[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      setResults((res.data?.results ?? []).slice(0, 6));
    }, 260);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, open]);

  async function set(f: Film) {
    setBusy(true);
    const res = await api<{ plan: { expiresAt: string } }>("/api/tonight", {
      method: "PUT",
      body: JSON.stringify({ movieId: f.id, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPlan({
      movieId: f.id,
      title: f.title,
      year: f.year,
      posterPath: f.poster_path,
      note: note.trim() || null,
      expiresAt: res.data?.plan?.expiresAt ?? "",
    });
    setOpen(false);
    setQ("");
    setResults(null);
  }

  async function clear() {
    setBusy(true);
    await api("/api/tonight", { method: "DELETE" });
    setBusy(false);
    setPlan(null);
    setNote("");
  }

  // Somebody else's card, and they haven't said. Draw nothing.
  if (!editable && !plan) return null;

  return (
    <View style={styles.box}>
      <Text style={[styles.eyebrow, { color: accent }]}>TONIGHT</Text>

      {plan ? (
        <View style={styles.planRow}>
          <Pressable onPress={() => router.push(`/m/${plan.movieId}`)}>
            <Poster path={plan.posterPath} title={plan.title} year={plan.year} width={44} />
          </Pressable>
          <Text style={styles.planText}>
            {editable ? "Watching " : `${name ?? "They"} is watching `}
            <Text
              style={[styles.filmTitle, { color: accent }]}
              onPress={() => router.push(`/m/${plan.movieId}`)}
            >
              {plan.title}
            </Text>
            {plan.year ? <Text style={styles.dim}> ({plan.year})</Text> : null}
            {plan.note ? <Text style={styles.dim}> — {plan.note}</Text> : null}
          </Text>
          {editable && (
            <Pressable onPress={() => void clear()} disabled={busy} hitSlop={8}>
              <Text style={styles.clear}>CLEAR</Text>
            </Pressable>
          )}
        </View>
      ) : !open ? (
        <Pressable onPress={() => setOpen(true)} hitSlop={6}>
          <Text style={styles.prompt}>What are you watching tonight?</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 8, marginTop: 8 }}>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 140))}
            placeholder="Finally. / For the fourth time. (optional)"
            placeholderTextColor="rgba(183,164,145,0.6)"
            style={styles.input}
          />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Which film?"
            placeholderTextColor="rgba(183,164,145,0.6)"
            style={styles.input}
          />
          {results?.length ? (
            <View style={{ gap: 2 }}>
              {results.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => void set(f)}
                  disabled={busy}
                  style={styles.hit}
                >
                  <Poster path={f.poster_path} title={f.title} year={f.year} width={28} />
                  <Text style={styles.hitText} numberOfLines={1}>
                    {f.title}
                    {f.year ? <Text style={styles.dim}> ({f.year})</Text> : null}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : q.trim() ? (
            <Text style={styles.quiet}>nothing by that name.</Text>
          ) : null}
          <Pressable onPress={() => setOpen(false)} hitSlop={8} style={{ alignSelf: "flex-start" }}>
            <Text style={styles.clear}>CANCEL</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  eyebrow: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6 },
  planRow: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 8 },
  planText: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 14, color: colors.cream },
  filmTitle: { fontFamily: fonts.bodyBold },
  dim: { color: colors.dim },
  clear: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.6, color: colors.dim },
  prompt: { marginTop: 5, fontFamily: fonts.body, fontSize: 14, color: colors.dim },
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
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  hitText: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 14, color: colors.cream },
  quiet: { fontFamily: fonts.mono, fontSize: 10, color: colors.dim },
});
