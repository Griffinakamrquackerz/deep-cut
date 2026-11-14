import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { parseLetterboxdCsv, type LetterboxdRow } from "@/lib/letterboxd";
import { colors, fonts } from "@/lib/theme";

// Native port of the web LetterboxdImport — pick a Letterboxd CSV, resolve it
// against TMDB in chunks, and rebuild the taste profile. 4★+ become loved
// films; the rest fill history so they're never re-dealt.
type Phase = "idle" | "importing" | "done" | "error";
const CHUNK = 20;

export default function LetterboxdImport({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [loved, setLoved] = useState(0);
  const [logged, setLogged] = useState(0);
  const [misses, setMisses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function chooseFile() {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    let text: string;
    try {
      text = await new File(picked.assets[0].uri).text();
    } catch {
      setError("Couldn't read that file — try again.");
      return;
    }

    const rows = parseLetterboxdCsv(text);
    if (rows.length === 0) {
      setError("That doesn't look like a Letterboxd export — upload ratings.csv or watched.csv from the ZIP.");
      return;
    }

    const capped: LetterboxdRow[] = rows.slice(0, 600);
    setPhase("importing");
    setTotal(capped.length);
    setProcessed(0);
    setLoved(0);
    setLogged(0);
    setMisses([]);

    try {
      let lovedN = 0;
      let loggedN = 0;
      const missed: string[] = [];
      for (let i = 0; i < capped.length; i += CHUNK) {
        const chunk = capped.slice(i, i + CHUNK);
        const res = await api<{ lovedAdded?: number; logged?: number; misses?: string[] }>(
          "/api/import/letterboxd",
          { method: "POST", body: JSON.stringify({ rows: chunk }) },
        );
        if (!res.ok) throw new Error(`import failed (${res.status})`);
        setProcessed((p) => p + chunk.length);
        lovedN += res.data?.lovedAdded ?? 0;
        loggedN += res.data?.logged ?? 0;
        setLoved(lovedN);
        setLogged(loggedN);
        if (Array.isArray(res.data?.misses)) {
          missed.push(...res.data.misses);
          setMisses(missed.slice(0, 12));
        }
      }
      // One profile rebuild at the end — the whole point of the import.
      await api("/api/profile/generate", { method: "POST" }).catch(() => null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("done");
      onDone();
    } catch (e) {
      setError(String(e).slice(0, 160));
      setPhase("error");
    }
  }

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <View style={styles.card}>
      <Pressable style={styles.headerRow} onPress={() => setOpen((o) => !o)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Coming from Letterboxd?</Text>
          <Text style={styles.title}>SMUGGLE IN YOUR RATINGS</Text>
        </View>
        <Text style={styles.toggle}>{open ? "−" : "+"}</Text>
      </Pressable>

      {open && (
        <View style={{ marginTop: 12, gap: 12 }}>
          {phase === "idle" || phase === "error" ? (
            <>
              <View style={{ gap: 6 }}>
                <Text style={styles.step}>
                  <Text style={styles.stepNum}>1. </Text>On Letterboxd: Settings → Data → Export your data
                </Text>
                <Text style={styles.step}>
                  <Text style={styles.stepNum}>2. </Text>Unzip it, find ratings.csv (or watched.csv)
                </Text>
                <Text style={styles.step}>
                  <Text style={styles.stepNum}>3. </Text>Pick it here — 4★+ films become loved films, the
                  rest fill your history so we never re-deal them
                </Text>
              </View>
              <Button title="★ Choose the CSV ★" pulse onPress={() => void chooseFile()} />
              {error && <Text style={styles.error}>{error}</Text>}
            </>
          ) : phase === "importing" ? (
            <View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progress}>
                spooling reel {processed}/{total} — {loved} loved · {logged} logged
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: "center" }}>
              <Text style={styles.wrap}>THAT&apos;S A WRAP</Text>
              <Text style={styles.wrapLine}>
                {loved} films joined your loved shelf, {logged} filled your history, and your taste
                profile just got rebuilt.
              </Text>
              {misses.length > 0 && (
                <Text style={styles.missLine}>
                  Couldn&apos;t match: {misses.join(", ")}
                  {misses.length >= 12 ? "…" : ""}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.ticket,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  eyebrow: {
    color: colors.ticket,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: { color: colors.amber, fontFamily: fonts.display, fontSize: 22, marginTop: 2 },
  toggle: { color: colors.dim, fontFamily: fonts.mono, fontSize: 20 },
  step: { color: "rgba(243,233,215,0.9)", fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  stepNum: { color: colors.amber, fontFamily: fonts.monoSemi, fontSize: 12 },
  error: { color: colors.ticket, fontFamily: fonts.mono, fontSize: 12 },
  track: { height: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.amber },
  progress: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textAlign: "center", marginTop: 8 },
  wrap: { color: colors.amber, fontFamily: fonts.display, fontSize: 28 },
  wrapLine: { color: colors.cream, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 4 },
  missLine: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, textAlign: "center", marginTop: 8 },
});
