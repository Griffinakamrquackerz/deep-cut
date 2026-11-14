import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BackButton from "@/components/BackButton";
import HouseNav from "@/components/HouseNav";
import YoutubePlayer from "react-native-youtube-iframe";
import ReactionSheet, { type ReactionPayload } from "@/components/ReactionSheet";
import AdSlot from "@/components/AdSlot";
import ShareFilm from "@/components/ShareFilm";
import TakesWall from "@/components/TakesWall";
import { Eyebrow, Poster } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts } from "@/lib/theme";
import { SERVICE_LABELS, type Service } from "@/lib/types";

// Movie detail — native port of the web /m/[id] page: poster, ratings, where
// it streams, the trailer, the overview, your actions (watchlist / loved / log
// a watch / add a read), external reads, and the film-scoped Hot Takes wall.

interface MovieRatings {
  tmdb: number | null;
  imdb: number | null;
  rt: number | null;
}

interface MovieDetail {
  id: number;
  title: string;
  year: number | null;
  runtime: number | null;
  poster_path: string | null;
  overview: string;
  genres: string[];
  imdb_id: string | null;
  providers: Partial<Record<Service, boolean>>;
  ratings: MovieRatings;
}

interface Read {
  id: string;
  title: string;
  url: string;
  /** Resolved server-side, so no member id is sent to the app. */
  mine?: boolean;
}

interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
}
interface CrewMember {
  id: number;
  name: string;
  job: string;
}

interface DetailResponse {
  movie: MovieDetail;
  myServices: Service[];
  trailerKey: string | null;
  reads: Read[];
  cast: CastMember[];
  crew: CrewMember[];
}

const TRAILER_H = 210;

function Ratings({ ratings }: { ratings: MovieRatings }) {
  const { imdb, rt, tmdb } = ratings;
  if (imdb == null && rt == null && tmdb == null) return null;
  return (
    <View style={styles.ratingsRow}>
      {imdb != null && (
        <Text style={styles.ratingImdb}>
          <Text style={{ fontFamily: fonts.monoSemi }}>IMDb</Text> {imdb.toFixed(1)}
        </Text>
      )}
      {rt != null && (
        <Text style={[styles.rating, { color: rt >= 60 ? colors.avail : colors.ticket }]}>🍅 {rt}%</Text>
      )}
      {imdb == null && rt == null && tmdb != null && (
        <Text style={[styles.rating, { color: colors.dim }]}>★ {tmdb.toFixed(1)}</Text>
      )}
    </View>
  );
}

function ServiceBadges({ providers, mine }: { providers: Partial<Record<Service, boolean>>; mine: Service[] }) {
  const available = (Object.keys(providers) as Service[]).filter(
    (s) => providers[s] && SERVICE_LABELS[s],
  );
  if (available.length === 0) {
    return <Text style={styles.notStreaming}>not streaming</Text>;
  }
  const mineSet = new Set(mine);
  return (
    <View style={styles.badgeWrap}>
      {available.map((s) => {
        const has = mineSet.has(s);
        return (
          <View key={s} style={[styles.badge, has ? styles.badgeMine : styles.badgeOther]}>
            <Text style={[styles.badgeText, { color: has ? colors.avail : colors.dim }]}>
              {has ? "✓ " : ""}
              {SERVICE_LABELS[s]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [trailerError, setTrailerError] = useState(false);
  const { width: screenW } = useWindowDimensions();
  const trailerW = screenW - 40; // body padding is 20 each side
  const [reacting, setReacting] = useState(false);
  const [addingRead, setAddingRead] = useState(false);
  const [removedReads, setRemovedReads] = useState<string[]>([]);
  const [readTitle, setReadTitle] = useState("");
  const [readUrl, setReadUrl] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<DetailResponse>(`/api/movie/${id}`);
    if (res.ok && res.data) setData(res.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function say(msg: string) {
    setFlash(msg);
    void Haptics.selectionAsync();
  }

  async function watchlist(movieId: number) {
    const res = await api("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ movieId, source: "movie page" }),
    });
    say(res.ok ? "On the watchlist." : "Couldn't save.");
  }

  async function loved(movieId: number) {
    const res = await api("/api/loved", { method: "POST", body: JSON.stringify({ movieId }) });
    say(res.ok ? "Added to loved films." : "Couldn't save.");
  }

  function removeRead(id: string) {
    Alert.alert("Remove this link?", "It comes off the film page for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const res = await api(`/api/reads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            if (res.ok) {
              // Hidden locally rather than refetched: the point of the button
              // is that somebody wants it gone now.
              setRemovedReads((prev) => [...prev, id]);
            } else {
              Alert.alert("Couldn't remove that link", "Try again in a moment.");
            }
          })();
        },
      },
    ]);
  }

  function reportRead(id: string) {
    const file = async (reason: string) => {
      await api("/api/safety", {
        method: "POST",
        body: JSON.stringify({
          action: "report",
          subjectType: "external_read",
          subjectId: id,
          reason,
        }),
      });
      Alert.alert("Reported", "We'll review it. 🚩");
    };
    if (Platform.OS === "ios") {
      // Same split as the takes wall: iOS gets free text, Android's Alert has
      // no prompt variant.
      Alert.prompt("Report this link", "What's the problem? (spam, malware, hateful…)", (reason) => {
        if (reason?.trim()) void file(reason.trim().slice(0, 500));
      });
    } else {
      Alert.alert("Report this link?", "It will be flagged for review.", [
        { text: "Cancel", style: "cancel" },
        { text: "Report", style: "destructive", onPress: () => void file("reported from app") },
      ]);
    }
  }

  async function addRead(movieId: number) {
    const res = await api("/api/reads", {
      method: "POST",
      body: JSON.stringify({ movieId, title: readTitle.trim(), url: readUrl.trim() }),
    });
    if (res.ok) {
      setAddingRead(false);
      setReadTitle("");
      setReadUrl("");
      void load();
    } else {
      setFlash("Couldn't add that link (is the URL valid?).");
    }
  }

  const movie = data?.movie;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : !movie ? (
        <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Text style={styles.dim}>This film isn&apos;t in the projection booth.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <BackButton style={{ marginBottom: 12 }} />
          <View style={styles.headerRow}>
            <View style={{ width: 120 }}>
              <Poster path={movie.poster_path} title={movie.title} year={movie.year} width={120} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>{movie.title}</Text>
              <Text style={styles.meta}>
                {movie.year ?? "—"}
                {movie.runtime ? ` · ${movie.runtime} min` : ""}
              </Text>
              {movie.genres.length > 0 && <Text style={styles.genres}>{movie.genres.join(" · ")}</Text>}
              <Ratings ratings={movie.ratings} />
              <View style={{ marginTop: 8 }}>
                <ServiceBadges providers={movie.providers} mine={data?.myServices ?? []} />
              </View>
            </View>
          </View>

          {data?.trailerKey && (
            <View>
              <Eyebrow style={{ marginBottom: 8 }}>Trailer</Eyebrow>
              {trailerError ? (
                <Pressable
                  style={styles.trailerCue}
                  onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${data.trailerKey}`)}
                >
                  <Text style={styles.trailerCueText}>▶  Watch on YouTube ↗</Text>
                </Pressable>
              ) : (
                <View style={styles.trailerBox}>
                  {/* Auto-plays muted the moment you open the film; tap for sound. */}
                  <YoutubePlayer
                    height={TRAILER_H}
                    width={trailerW}
                    play
                    mute={muted}
                    videoId={data.trailerKey}
                    onError={() => setTrailerError(true)}
                    initialPlayerParams={{ modestbranding: true, rel: false }}
                    webViewProps={{
                      allowsInlineMediaPlayback: true,
                      mediaPlaybackRequiresUserAction: false, // iOS: let it autoplay
                    }}
                  />
                  {muted && (
                    <Pressable style={styles.soundPill} onPress={() => setMuted(false)}>
                      <Text style={styles.soundPillText}>🔊 Tap for sound</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}

          {movie.overview ? <Text style={styles.overview}>{movie.overview}</Text> : null}

          {/* Crew — director, writers, DP, composer */}
          {(data?.crew ?? []).length > 0 && (
            <View>
              <Eyebrow style={{ marginBottom: 8 }}>Crew</Eyebrow>
              <View style={{ gap: 4 }}>
                {(data?.crew ?? []).map((c) => (
                  <Text
                    key={`${c.id}-${c.job}`}
                    style={styles.crewLine}
                    onPress={() => router.push(`/person/${c.id}`)}
                  >
                    <Text style={styles.crewJob}>{c.job}</Text>  <Text style={styles.crewName}>{c.name}</Text>
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* Cast — top-billed, horizontal headshots */}
          {(data?.cast ?? []).length > 0 && (
            <View>
              <Eyebrow style={{ marginBottom: 8 }}>Cast</Eyebrow>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {(data?.cast ?? []).map((c) => (
                  <Pressable key={c.id} style={styles.castCard} onPress={() => router.push(`/person/${c.id}`)}>
                    {c.profilePath ? (
                      <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w185${c.profilePath}` }}
                        style={styles.castPhoto}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View style={[styles.castPhoto, styles.castPhotoFallback]}>
                        <Text style={styles.castInitial}>{c.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.castName} numberOfLines={2}>
                      {c.name}
                    </Text>
                    {c.character ? (
                      <Text style={styles.castRole} numberOfLines={2}>
                        {c.character}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable style={[styles.action, { borderColor: colors.amber }]} onPress={() => void watchlist(movie.id)}>
              <Text style={[styles.actionText, { color: colors.amber }]}>+ Watchlist</Text>
            </Pressable>
            <Pressable style={[styles.action, { borderColor: colors.ticket }]} onPress={() => void loved(movie.id)}>
              <Text style={[styles.actionText, { color: colors.ticket }]}>♥ Loved it</Text>
            </Pressable>
            <Pressable style={[styles.action, { borderColor: colors.line }]} onPress={() => setReacting(true)}>
              <Text style={[styles.actionText, { color: colors.cream }]}>Log a watch</Text>
            </Pressable>
            <Pressable style={[styles.action, { borderColor: colors.line }]} onPress={() => setAddingRead((v) => !v)}>
              <Text style={[styles.actionText, { color: colors.dim }]}>+ External read</Text>
            </Pressable>
          </View>

          {flash && <Text style={styles.flash}>{flash}</Text>}

          {/* Pass it on — out to anyone, or straight to somebody here */}
          <ShareFilm movieId={movie.id} title={movie.title} />

          <AdSlot index={2} style={{ marginTop: 16 }} />

          {addingRead && (
            <View style={styles.readForm}>
              <TextInput
                value={readTitle}
                onChangeText={(t) => setReadTitle(t.slice(0, 160))}
                placeholder="Article title"
                placeholderTextColor="rgba(183,164,145,0.6)"
                style={styles.readInput}
              />
              <TextInput
                value={readUrl}
                onChangeText={(t) => setReadUrl(t.slice(0, 500))}
                placeholder="https://…"
                placeholderTextColor="rgba(183,164,145,0.6)"
                autoCapitalize="none"
                inputMode="url"
                style={styles.readInput}
              />
              <Pressable
                disabled={!readTitle.trim() || !readUrl.trim()}
                onPress={() => void addRead(movie.id)}
                style={[styles.addLink, (!readTitle.trim() || !readUrl.trim()) && { opacity: 0.4 }]}
              >
                <Text style={styles.addLinkText}>Add link</Text>
              </Pressable>
            </View>
          )}

          {/* External reads */}
          <View>
            <Eyebrow style={{ marginBottom: 8 }}>External reads</Eyebrow>
            {(data?.reads ?? []).length === 0 ? (
              <Text style={styles.dim}>No articles linked yet.</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {(data?.reads ?? [])
                  .filter((r) => !removedReads.includes(r.id))
                  .map((r) => (
                    <View key={r.id} style={styles.readRow}>
                      <Pressable style={{ flex: 1 }} onPress={() => void Linking.openURL(r.url)}>
                        <Text style={styles.readLink}>{r.title} ↗</Text>
                      </Pressable>
                      {/* Take yours down, or flag somebody else's. Neither
                          control existed, which left member-published links
                          on every film page with no way to remove or report
                          them. */}
                      <Pressable
                        hitSlop={10}
                        accessibilityLabel={r.mine ? "Remove this link" : "Report this link"}
                        onPress={() => (r.mine ? removeRead(r.id) : reportRead(r.id))}
                      >
                        <Text style={styles.readAction}>{r.mine ? "✕" : "⚑"}</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}
          </View>

          {/* Film-scoped Hot Takes */}
          <View>
            <Eyebrow style={{ marginBottom: 8, color: colors.ticket }}>🔥 Hot takes</Eyebrow>
            <TakesWall movieId={movie.id} movieTitle={movie.title} />
          </View>

          <Text style={styles.attribution}>
            Metadata & streaming data: TMDB (JustWatch). This product uses the TMDB API but is not
            endorsed or certified by TMDB.
          </Text>
        </ScrollView>
      )}

      {movie && (
        <ReactionSheet
          visible={reacting}
          title={movie.title}
          onClose={() => setReacting(false)}
          onSubmit={async (payload: ReactionPayload) => {
            await api("/api/logs", {
              method: "POST",
              body: JSON.stringify({ movieId: movie.id, ...payload }),
            });
            setReacting(false);
            say("Logged.");
          }}
        />
      )}
      <HouseNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, paddingBottom: 112, gap: 18 },
  dim: { color: colors.dim, fontFamily: fonts.body, fontSize: 14, textAlign: "center" },
  headerRow: { flexDirection: "row", gap: 16 },
  title: { color: colors.cream, fontFamily: fonts.display, fontSize: 28, lineHeight: 30 },
  meta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, marginTop: 4 },
  genres: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 3 },
  ratingsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 8 },
  rating: { fontFamily: fonts.mono, fontSize: 11 },
  ratingImdb: { color: colors.amber, fontFamily: fonts.mono, fontSize: 11 },
  notStreaming: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10 },
  badgeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  badge: { borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 4 },
  badgeMine: { borderColor: colors.avail },
  badgeOther: { borderColor: colors.line },
  badgeText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" },
  trailerBox: {
    height: 210,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#000",
  },
  soundPill: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(13,9,7,0.85)",
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  soundPillText: { color: colors.amber, fontFamily: fonts.monoSemi, fontSize: 10, letterSpacing: 1 },
  trailerCue: {
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  trailerCueText: {
    color: colors.amber,
    fontFamily: fonts.monoSemi,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  overview: { color: "rgba(243,233,215,0.9)", fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  crewLine: { color: colors.cream, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  crewJob: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  crewName: { color: colors.amber, textDecorationLine: "underline" },
  castCard: { width: 84 },
  castPhoto: { width: 84, height: 110, borderRadius: 6, backgroundColor: colors.surface },
  castPhotoFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  castInitial: { color: colors.dim, fontFamily: fonts.display, fontSize: 30 },
  castName: { color: colors.cream, fontFamily: fonts.bodyBold, fontSize: 12, marginTop: 4, lineHeight: 15 },
  castRole: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 1, lineHeight: 12 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 12 },
  actionText: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" },
  flash: { color: colors.avail, fontFamily: fonts.mono, fontSize: 12 },
  readForm: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  readInput: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  addLink: {
    alignSelf: "flex-start",
    backgroundColor: colors.amber,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addLinkText: {
    color: colors.bg,
    fontFamily: fonts.monoSemi,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  readRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  readAction: { fontFamily: fonts.mono, fontSize: 13, color: colors.dim, paddingHorizontal: 2 },
  readLink: { color: colors.amber, fontFamily: fonts.body, fontSize: 14, textDecorationLine: "underline" },
  attribution: { color: "rgba(183,164,145,0.7)", fontFamily: fonts.mono, fontSize: 8.5, lineHeight: 12 },
});
