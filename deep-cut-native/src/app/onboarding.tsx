import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { colors, mono } from "@/lib/theme";
import {
  SERVICES,
  SERVICE_LABELS,
  type SearchHit,
  type StarterFilm,
  type Service,
} from "@/lib/types";
import { Button, Chip, Poster } from "@/components/ui";
import { TitleCard } from "@/components/house";
import { ApplicationStrip } from "@/components/rooms";

// Onboarding, same contract as the web: pick 8+ films you love, your streaming
// services, a REQUIRED signature film, and a handle. Ends at the Tonight tab.
type Step = "films" | "services" | "signature" | "handle";

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<Step>("films");

  const [grid, setGrid] = useState<StarterFilm[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [services, setServices] = useState<Set<Service>>(new Set());
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [signature, setSignature] = useState<SearchHit | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<{ films: StarterFilm[] }>("/api/starter-grid").then((r) => {
      setGrid(r.data?.films ?? []);
    });
  }, []);

  // Signature search (public endpoint, debounced).
  useEffect(() => {
    if (step !== "signature") return;
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(() => {
      api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((r) => {
        setHits((r.data?.results ?? []).slice(0, 8));
      });
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, step]);

  function toggleFilm(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const onboard = await api<{ ok?: boolean; error?: string }>("/api/onboarding", {
      method: "POST",
      body: JSON.stringify({ movieIds: [...picked], services: [...services] }),
    });
    if (!onboard.ok) {
      setError(onboard.data?.error ?? "Couldn't save your picks — try again.");
      setBusy(false);
      return;
    }
    const me = await api<{ ok?: boolean; error?: string }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ handle, signatureMovieId: signature?.id ?? null }),
    });
    if (!me.ok) {
      setError(
        me.status === 409
          ? "That handle is taken — pick another."
          : (me.data?.error ?? "Couldn't save your card — try again."),
      );
      setBusy(false);
      return;
    }
    router.replace("/tonight");
  }

  const cols = 3;
  const gap = 10;
  const posterW = Math.floor((width - 24 * 2 - gap * (cols - 1)) / cols);

  return (
    <SafeAreaView style={styles.screen}>
      {step === "films" && (
        <View style={styles.body}>
          <ApplicationStrip part={1} />
          <TitleCard size={40} accent="love">Pick films you love</TitleCard>
          <FlatList
            data={grid}
            numColumns={cols}
            keyExtractor={(f) => String(f.id)}
            columnWrapperStyle={{ gap }}
            contentContainerStyle={{ gap, paddingBottom: 90 }}
            renderItem={({ item }) => {
              const on = picked.has(item.id);
              return (
                <Pressable onPress={() => toggleFilm(item.id)} style={{ opacity: on ? 1 : 0.75 }}>
                  <View style={on ? styles.pickedRing : undefined}>
                    <Poster path={item.poster} title={item.title} year={item.year} width={posterW} />
                  </View>
                </Pressable>
              );
            }}
          />
          <View style={styles.footer}>
            <Button
              title={picked.size >= 8 ? `Next → (${picked.size} picked)` : `Pick ${8 - picked.size} more`}
              disabled={picked.size < 8}
              onPress={() => setStep("services")}
            />
          </View>
        </View>
      )}

      {step === "services" && (
        <View style={styles.body}>
          <ApplicationStrip part={2} />
          <TitleCard size={40} accent="watch?">Where do you watch?</TitleCard>
          <View style={styles.chips}>
            {SERVICES.map((s) => (
              <Chip
                key={s}
                label={SERVICE_LABELS[s]}
                active={services.has(s)}
                onPress={() =>
                  setServices((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
              />
            ))}
          </View>
          <Text style={styles.hint}>Skippable — you can change these any time in Settings.</Text>
          <View style={styles.footer}>
            <Button title="Next →" onPress={() => setStep("signature")} />
          </View>
        </View>
      )}

      {step === "signature" && (
        <View style={styles.body}>
          <ApplicationStrip part={3} />
          <TitleCard size={40} accent="signature">Your signature film</TitleCard>
          <Text style={styles.hint}>It fronts your member card as a stills collage.</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search any film…"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            style={styles.input}
          />
          {signature && (
            <Text style={styles.picked}>
              🎞 {signature.title} {signature.year ?? ""}
            </Text>
          )}
          <FlatList
            data={hits}
            keyExtractor={(h) => String(h.id)}
            contentContainerStyle={{ paddingBottom: 90 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setSignature(item);
                  setQuery("");
                  setHits([]);
                }}
                style={styles.hit}
              >
                <Text style={styles.hitText}>
                  {item.title} <Text style={{ color: colors.dim }}>{item.year ?? ""}</Text>
                </Text>
              </Pressable>
            )}
          />
          <View style={styles.footer}>
            <Button title="Enshrine it →" disabled={!signature} onPress={() => setStep("handle")} />
          </View>
        </View>
      )}

      {step === "handle" && (
        <View style={styles.body}>
          <ApplicationStrip part={4} />
          <TitleCard size={40} accent="marquee">Pick your marquee name</TitleCard>
          <TextInput
            value={handle}
            onChangeText={(t) => setHandle(t.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
            placeholder="lowercase_letters_numbers"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.hint}>3–24 characters. This is your public @name.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.footer}>
            <Button
              title="★ Take your seat ★"
              disabled={!HANDLE_RE.test(handle)}
              busy={busy}
              onPress={finish}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 24, gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  hint: { color: colors.dim, fontFamily: mono, fontSize: 11, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.surface,
    color: colors.cream,
    padding: 14,
  },
  picked: { color: colors.amber, fontFamily: mono, fontSize: 13 },
  hit: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line },
  hitText: { color: colors.cream, fontSize: 15 },
  pickedRing: { borderWidth: 2, borderColor: colors.amber, borderRadius: 8, padding: 2 },
  error: { color: colors.ticket, fontFamily: mono, fontSize: 12 },
  footer: { position: "absolute", left: 24, right: 24, bottom: 24 },
});
