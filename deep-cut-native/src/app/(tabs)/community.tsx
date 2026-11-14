import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import RatingLine, { primaryRatingLabel } from "@/components/RatingLine";
import AdSlot from "@/components/AdSlot";
import { reportContent } from "@/lib/report";
import HouseCall from "@/components/HouseCall";
import Inbox from "@/components/Inbox";
import TakesWall from "@/components/TakesWall";
import { Eyebrow, MarqueeBulbs, Poster } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts, glowAmber } from "@/lib/theme";
import { useAuth } from "../_layout";

// The Lobby — native port of the web LobbyScreen (../src/app/(tabs)/
// lobby/LobbyScreen.tsx). Three views under one marquee: the feed of what
// friends are watching, the Hot Takes wall, and the people directory.

const REACTION_LABEL: Record<string, string> = {
  loved: "loved",
  fine: "was lukewarm on",
  not_for_me: "bounced off",
  loved_ironically: "ironically loved",
};

// Verdict stamps pressed onto the poster, like a ticket-taker's rubber stamp.
const REACTION_STAMP: Record<string, { text: string; gold: boolean }> = {
  loved: { text: "Loved it", gold: true },
  loved_ironically: { text: "Camp classic", gold: true },
  fine: { text: "It's fine", gold: false },
  not_for_me: { text: "Walked out", gold: false },
};

interface FeedActor {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url?: string | null;
}

interface FeedMovie {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
  tmdb: number | null;
  imdb: number | null;
  rt: number | null;
}

type FeedItem =
  | {
      kind: "watch";
      id: string;
      at: string;
      actor: FeedActor;
      movie: FeedMovie;
      reaction: string;
      why: string | null;
      note: string | null;
    }
  | {
      /**
       * What somebody is putting on tonight. A plan rather than a log: it
       * appears before the film is watched, and goes stale on its own.
       */
      kind: "tonight";
      id: string;
      at: string;
      actor: FeedActor;
      movie: FeedMovie;
      note: string | null;
    }
  | {
      kind: "playlist";
      id: string;
      at: string;
      actor: FeedActor;
      name: string;
      filmCount: number;
      shareSlug: string;
    };

interface Person {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Suggestion extends Person {
  reason: string;
}

const personName = (p: Person) => p.display_name ?? (p.handle ? `@${p.handle}` : "someone");
const actorName = (a: FeedActor) => (a.handle ? `@${a.handle}` : (a.display_name ?? "someone"));
const feedName = (actor: FeedActor, myId: string) =>
  actor.id === myId ? "You" : actorName(actor);
// Web profileHref: /u/{handle ?? id}
const profileKey = (p: { id: string; handle: string | null }) => p.handle ?? p.id;

const VIEWS = [
  { key: "feed", label: "☰ The marquee" },
  { key: "takes", label: "🔥 Hot takes" },
  { key: "people", label: "★ People" },
  { key: "inbox", label: "✉ Inbox" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const HEADLINE: Record<ViewKey, string> = {
  feed: "WHAT FRIENDS ARE WATCHING",
  // house mode swaps this one out at render time

  takes: "THE HOT TAKES WALL",
  people: "FIND YOUR PEOPLE",
  inbox: "YOUR PIGEONHOLE",
};

function Avatar({ url, name, size = 34 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
        <Animated.Image source={{ uri: url }} style={{ width: size, height: size }} />
      </View>
    );
  }
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarInitial}>{name.replace(/^@/, "").charAt(0).toUpperCase() || "?"}</Text>
    </View>
  );
}

function FollowButton({
  userId,
  following,
  onToggle,
}: {
  userId: string;
  following: boolean;
  onToggle: (userId: string, next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    const next = !following;
    onToggle(userId, next); // optimistic
    const res = await api("/api/follows", {
      method: next ? "POST" : "DELETE",
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) onToggle(userId, !next); // roll back on failure
    setBusy(false);
  }
  return (
    <Pressable
      onPress={() => void toggle()}
      disabled={busy}
      style={[styles.followBtn, following ? styles.followBtnOn : styles.followBtnOff, busy && { opacity: 0.5 }]}
    >
      <Text style={[styles.followBtnText, { color: following ? colors.dim : colors.ticket }]}>
        {following ? "following ✓" : "+ follow"}
      </Text>
    </Pressable>
  );
}

export default function Community() {
  const { session } = useAuth();
  const myId = session?.user.id ?? "";

  const [view, setView] = useState<ViewKey>("feed");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  // The feed widened to the whole house because you follow almost nobody.
  // Worth saying out loud, or these look like people you know.
  const [house, setHouse] = useState(false);

  // People view state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [followingList, setFollowingList] = useState<Person[]>([]);
  const [followers, setFollowers] = useState<Person[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ feed: FeedItem[]; following: string[]; house?: boolean }>(
      "/api/feed",
    );
    if (res.ok && res.data) {
      setFeed(res.data.feed ?? []);
      setFollowing(res.data.following ?? []);
      setHouse(!!res.data.house);
    }
    setLoading(false);
  }, []);

  const loadPeople = useCallback(async () => {
    const [peopleRes, sugRes] = await Promise.all([
      api<{ following: Person[]; followers: Person[]; followingIds: string[] }>("/api/people"),
      api<{ suggestions: Suggestion[] }>("/api/people/suggestions"),
    ]);
    if (peopleRes.ok && peopleRes.data) {
      setFollowingList(peopleRes.data.following ?? []);
      setFollowers(peopleRes.data.followers ?? []);
      setFollowing(peopleRes.data.followingIds ?? []);
    }
    if (sugRes.ok && sugRes.data) setSuggestions(sugRes.data.suggestions ?? []);
    setPeopleLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view === "people" && !peopleLoaded) void loadPeople();
  }, [view, peopleLoaded, loadPeople]);

  // Just the count, so the ✉ chip can carry a number before you open it. The
  // rows themselves don't load until you do.
  useEffect(() => {
    void api<{ unread: number }>("/api/notifications").then((r) =>
      setUnread(Number(r.data?.unread ?? 0)),
    );
  }, []);

  // Debounced people search (web: 300ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await api<{ results: Person[]; followingIds: string[] }>(
        `/api/people?q=${encodeURIComponent(query)}`,
      );
      if (res.ok && res.data) {
        setResults(res.data.results ?? []);
        setFollowing(res.data.followingIds ?? []);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  function onFollowToggle(userId: string, next: boolean) {
    setFollowing((ids) => (next ? [...ids, userId] : ids.filter((id) => id !== userId)));
    if (next) setNotice("★ Now following");
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  async function addToWatchlist(movieId: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotice("＋ Swiped to your watchlist");
    await api("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ movieId, source: "lobby" }),
    });
  }

  function PersonRow({ p }: { p: Person }) {
    return (
      <View style={styles.personRow}>
        <Pressable style={styles.personId} onPress={() => router.push(`/u/${profileKey(p)}`)}>
          <Avatar url={p.avatar_url} name={personName(p)} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text style={styles.personName} numberOfLines={1}>
              {personName(p)}
            </Text>
            {p.handle && p.display_name ? (
              <Text style={styles.personHandle}>@{p.handle}</Text>
            ) : null}
          </View>
        </Pressable>
        {p.id !== myId && (
          <FollowButton userId={p.id} following={following.includes(p.id)} onToggle={onFollowToggle} />
        )}
      </View>
    );
  }

  function WatchCard({ item, index }: { item: Extract<FeedItem, { kind: "watch" }>; index: number }) {
    const stamp = REACTION_STAMP[item.reaction];
    return (
      <Animated.View
        entering={FadeInDown.duration(350)
          .delay(Math.min(index, 8) * 70)
          .reduceMotion(ReduceMotion.System)}
        style={styles.watchCard}
      >
        <Pressable style={{ width: 80 }} onPress={() => router.push(`/m/${item.movie.id}`)}>
          <Poster
            path={item.movie.poster_path}
            title={item.movie.title}
            year={item.movie.year}
            width={80}
            badge={primaryRatingLabel({ imdb: item.movie.imdb, rt: item.movie.rt, tmdb: item.movie.tmdb })}
          />
          {stamp && (
            <View style={[styles.stamp, stamp.gold && styles.stampGold]}>
              <Text style={[styles.stampText, stamp.gold && { color: colors.amber }]}>{stamp.text}</Text>
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.actorLine}>
            <Avatar url={item.actor.avatar_url} name={feedName(item.actor, myId)} size={22} />
            <Text style={styles.actorText} numberOfLines={2}>
              <Text style={{ color: colors.amber }} onPress={() => router.push(`/u/${profileKey(item.actor)}`)}>
                {feedName(item.actor, myId)}
              </Text>{" "}
              {REACTION_LABEL[item.reaction] ?? item.reaction}
            </Text>
          </View>
          <Text style={styles.watchTitle} onPress={() => router.push(`/m/${item.movie.id}`)}>
            {item.movie.title}
          </Text>
          <RatingLine
            imdb={item.movie.imdb}
            rt={item.movie.rt}
            tmdb={item.movie.tmdb}
            genres={item.movie.genres}
            style={{ marginTop: 2 }}
          />
          <Text style={styles.watchMeta}>
            {item.movie.year ?? ""}
            {item.why ? ` · for the ${item.why}` : ""}
          </Text>
          {item.note ? (
            <View style={styles.noteRow}>
              <Text style={[styles.watchNote, { flex: 1 }]}>“{item.note}”</Text>
              {/* Free text somebody else wrote, on the main feed. It had no
                  report control at all — the backend has accepted watch_note
                  reports the whole time. */}
              {item.actor.id !== myId && (
                <Pressable
                  hitSlop={10}
                  accessibilityLabel="Report this note"
                  onPress={() => reportContent("watch_note", String(item.id))}
                >
                  <Text style={styles.reportFlag}>⚑</Text>
                </Pressable>
              )}
            </View>
          ) : null}
          {item.actor.id !== myId && (
            <Pressable style={styles.watchlistBtn} onPress={() => void addToWatchlist(item.movie.id)}>
              <Text style={styles.watchlistBtnText}>+ Watchlist</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  function TonightCard({ item, index }: { item: Extract<FeedItem, { kind: "tonight" }>; index: number }) {
    return (
      <Animated.View
        entering={FadeInDown.duration(350)
          .delay(Math.min(index, 8) * 70)
          .reduceMotion(ReduceMotion.System)}
        style={styles.tonightCard}
      >
        <Pressable style={{ width: 56 }} onPress={() => router.push(`/m/${item.movie.id}`)}>
          <Poster
            path={item.movie.poster_path}
            title={item.movie.title}
            year={item.movie.year}
            width={56}
          />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.tonightEyebrow}>🍿 TONIGHT</Text>
          <Text style={styles.tonightLine}>
            <Text
              style={{ color: colors.amber }}
              onPress={() => router.push(`/u/${profileKey(item.actor)}`)}
            >
              {feedName(item.actor, myId)}
            </Text>
            {item.actor.id === myId ? " are watching " : " is watching "}
            <Text style={styles.tonightTitle} onPress={() => router.push(`/m/${item.movie.id}`)}>
              {item.movie.title}
            </Text>
            {item.movie.year ? <Text style={{ color: colors.dim }}> ({item.movie.year})</Text> : null}
          </Text>
          {item.note ? <Text style={styles.tonightNote}>“{item.note}”</Text> : null}
          {item.actor.id !== myId && (
            <Pressable style={styles.watchlistBtn} onPress={() => void addToWatchlist(item.movie.id)}>
              <Text style={styles.watchlistBtnText}>+ Watch along</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  function PlaylistCard({ item, index }: { item: Extract<FeedItem, { kind: "playlist" }>; index: number }) {
    return (
      <Animated.View
        entering={FadeInDown.duration(350)
          .delay(Math.min(index, 8) * 70)
          .reduceMotion(ReduceMotion.System)}
      >
        <Pressable style={styles.playlistCard} onPress={() => router.push(`/p/${item.shareSlug}`)}>
          <Text style={styles.playlistEyebrow}>
            ✉ MIXTAPE SEALED BY <Text style={{ color: colors.amber }}>{feedName(item.actor, myId).toUpperCase()}</Text>
          </Text>
          <Text style={styles.playlistName}>{item.name}</Text>
          <Text style={styles.playlistMeta}>
            {item.filmCount} film{item.filmCount === 1 ? "" : "s"} inside — open it ↗
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  const header = (
    <View>
      <MarqueeBulbs />
      <Eyebrow style={{ marginTop: 8 }}>Community</Eyebrow>
      <Text style={[styles.headline, glowAmber]}>
        {view === "feed" && house ? "WHAT THE HOUSE IS WATCHING" : HEADLINE[view]}
      </Text>
      {view === "takes" && (
        <Text style={styles.takesSub}>takes so hot the nitrate catches fire · 250 characters, no mercy</Text>
      )}

      {/* The room people are already in, reading what everyone else is up to
          — the right place to ask for a script. */}
      <HouseCall style={{ marginTop: 14 }} />

      <View style={styles.viewChips}>
        {VIEWS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => {
              void Haptics.selectionAsync();
              setView(t.key);
              if (t.key === "inbox") setUnread(0);
            }}
            style={[styles.viewChip, view === t.key && styles.viewChipOn]}
          >
            <Text style={[styles.viewChipText, view === t.key && { color: colors.amber }]}>{t.label}</Text>
            {t.key === "inbox" && unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.settleCard} onPress={() => router.push("/settle")}>
        <Text style={{ fontSize: 28 }}>⚖️</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.settleTitle}>SETTLE IT</Text>
          <Text style={styles.settleSub}>Two of you, one phone, one movie — the house picks. →</Text>
        </View>
        <View style={[styles.stampChip]}>
          <Text style={styles.stampChipText}>Party</Text>
        </View>
      </Pressable>

      {/* The greenlight ballot. Same card shape as Settle It so it reads as
          another room in the house rather than a banner. Reading it needs
          nothing; voting needs votes, which are earned on the website. */}
      <Pressable style={styles.settleCard} onPress={() => router.push("/vote")}>
        <Text style={{ fontSize: 28 }}>🎞</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.settleTitle}>THE BALLOT</Text>
          <Text style={styles.settleSub}>
            Read the pitches and spend your votes on the next Deep Cut Original. →
          </Text>
        </View>
        <View style={[styles.stampChip]}>
          <Text style={styles.stampChipText}>Greenlight</Text>
        </View>
      </Pressable>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {view === "feed" && house && feed.length > 0 ? (
        <View style={styles.houseNote}>
          <Text style={styles.houseEyebrow}>SHOWING THE WHOLE HOUSE</Text>
          <Text style={styles.houseLine}>
            Follow a few people in{" "}
            <Text style={{ color: colors.amber }} onPress={() => setView("people")}>
              ★ People
            </Text>{" "}
            and this becomes your crowd.
          </Text>
        </View>
      ) : null}
    </View>
  );

  // ── Takes view: the wall owns its own scroll region ──
  if (view === "takes") {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <FlatList
          data={[0]}
          keyExtractor={() => "takes"}
          ListHeaderComponent={header}
          renderItem={() => <TakesWall />}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
        />
      </SafeAreaView>
    );
  }

  // ── Inbox view ──
  if (view === "inbox") {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <FlatList
          data={[0]}
          keyExtractor={() => "inbox"}
          ListHeaderComponent={header}
          renderItem={() => <Inbox onRead={() => setUnread(0)} />}
          contentContainerStyle={styles.scrollBody}
        />
      </SafeAreaView>
    );
  }

  // ── People view ──
  if (view === "people") {
    const visibleSuggestions = suggestions.filter((s) => !following.includes(s.id));
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <FlatList
          data={[0]}
          keyExtractor={() => "people"}
          ListHeaderComponent={header}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          renderItem={() => (
            <View style={{ gap: 14 }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by handle or name…"
                placeholderTextColor="rgba(183,164,145,0.6)"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.search}
              />

              {results !== null ? (
                results.length === 0 ? (
                  <Text style={styles.dimCenter}>Nobody by that name yet — deal them in.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {results.map((p) => (
                      <PersonRow key={p.id} p={p} />
                    ))}
                  </View>
                )
              ) : !peopleLoaded ? (
                <Text style={styles.loadingLine}>checking the guest list…</Text>
              ) : (
                <>
                  {visibleSuggestions.length > 0 && (
                    <View>
                      <Eyebrow style={{ color: colors.ticket, marginBottom: 8 }}>★ Worth a follow</Eyebrow>
                      <View style={{ gap: 8 }}>
                        {visibleSuggestions.map((s) => (
                          <View key={s.id} style={styles.personRow}>
                            <Pressable style={styles.personId} onPress={() => router.push(`/u/${profileKey(s)}`)}>
                              <Avatar url={s.avatar_url} name={personName(s)} />
                              <View style={{ minWidth: 0, flexShrink: 1 }}>
                                <Text style={styles.personName} numberOfLines={1}>
                                  {personName(s)}
                                </Text>
                                <Text style={styles.suggestionReason} numberOfLines={1}>
                                  {s.reason}
                                </Text>
                              </View>
                            </Pressable>
                            <FollowButton userId={s.id} following={false} onToggle={onFollowToggle} />
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  <View>
                    <Eyebrow style={{ marginBottom: 8 }}>Following ({followingList.length})</Eyebrow>
                    {followingList.length === 0 ? (
                      <Text style={styles.dimLine}>
                        You&apos;re not following anyone yet. Search above, or send a friend a mixtape to
                        get them in here.
                      </Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {followingList.map((p) => (
                          <PersonRow key={p.id} p={p} />
                        ))}
                      </View>
                    )}
                  </View>

                  <View>
                    <Eyebrow style={{ marginBottom: 8 }}>Followers ({followers.length})</Eyebrow>
                    {followers.length === 0 ? (
                      <Text style={styles.dimLine}>No followers yet — share your taste card.</Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {followers.map((p) => (
                          <PersonRow key={p.id} p={p} />
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // ── Feed view (the marquee) ──
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <FlatList
        data={feed}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        ListHeaderComponent={header}
        contentContainerStyle={styles.scrollBody}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 32, alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={colors.amber} />
              <Text style={styles.loadingLine}>the lobby lights are coming up</Text>
            </View>
          ) : (
            <View style={styles.quietCard}>
              <Text style={styles.quietTitle}>QUIET IN HERE</Text>
              <Text style={styles.quietSub}>
                Log a watch with “Seen it” or follow people in the ★ People tab — watches and
                mixtapes light up this marquee.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <>
            {/* Third card down, matching web. AdSlot draws nothing for a member. */}
            {index === 2 && <AdSlot index={1} style={{ marginBottom: 14 }} />}
            {item.kind === "watch" ? (
              <WatchCard item={item} index={index} />
            ) : item.kind === "tonight" ? (
              <TonightCard item={item} index={index} />
            ) : (
              <PlaylistCard item={item} index={index} />
            )}
          </>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollBody: { padding: 20, paddingBottom: 40 },
  headline: {
    color: colors.amber,
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: 1,
    marginTop: 2,
  },
  takesSub: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 4 },
  viewChips: { flexDirection: "row", gap: 6, marginTop: 12 },
  viewChip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  viewChipOn: { borderColor: colors.amber },
  houseNote: {
    marginTop: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: 6,
    padding: 12,
  },
  houseEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.dim,
    textAlign: "center",
  },
  houseLine: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.dim,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.ticket,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.mono, fontSize: 9, color: colors.cream },
  viewChipText: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  settleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
  },
  settleTitle: { color: colors.amber, fontFamily: fonts.display, fontSize: 22, letterSpacing: 1 },
  settleSub: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  stampChip: {
    borderWidth: 1.5,
    borderColor: colors.amber,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    transform: [{ rotate: "-4deg" }],
  },
  stampChipText: {
    color: colors.amber,
    fontFamily: fonts.monoSemi,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  notice: {
    color: colors.amber,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginBottom: 10,
  },
  // People
  search: {
    borderWidth: 2,
    borderColor: "rgba(255,180,84,0.6)",
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  personId: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1, minWidth: 0 },
  personName: { color: colors.cream, fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.5 },
  personHandle: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10 },
  suggestionReason: { color: "rgba(255,180,84,0.8)", fontFamily: fonts.mono, fontSize: 9.5 },
  avatarFallback: {
    backgroundColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: colors.cream, fontFamily: fonts.display, fontSize: 15 },
  followBtn: { borderWidth: 1, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 9 },
  followBtnOn: { borderColor: colors.line },
  followBtnOff: { borderColor: colors.ticket },
  followBtnText: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  dimCenter: { color: colors.dim, fontFamily: fonts.body, fontSize: 14, textAlign: "center", paddingVertical: 12 },
  dimLine: { color: colors.dim, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  loadingLine: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 16,
  },
  // Feed
  quietCard: {
    borderWidth: 1,
    borderColor: colors.ticket,
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 24,
    alignItems: "center",
  },
  quietTitle: { color: colors.cream, fontFamily: fonts.display, fontSize: 22, letterSpacing: 1 },
  quietSub: {
    color: colors.dim,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
  tonightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(228,87,61,0.4)",
    backgroundColor: "rgba(228,87,61,0.06)",
    borderRadius: 10,
    padding: 12,
  },
  tonightEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.ticket,
  },
  tonightLine: {
    marginTop: 3,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
    color: colors.cream,
  },
  tonightTitle: { fontFamily: fonts.bodyBold },
  tonightNote: {
    color: "rgba(243,233,215,0.85)",
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(228,87,61,0.5)",
  },
  watchCard: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
  },
  stamp: {
    position: "absolute",
    left: -8,
    top: 8,
    borderWidth: 1.5,
    borderColor: colors.dim,
    backgroundColor: "rgba(23,18,16,0.85)",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    transform: [{ rotate: "-6deg" }],
  },
  stampGold: { borderColor: colors.amber },
  stampText: {
    color: colors.dim,
    fontFamily: fonts.monoSemi,
    fontSize: 8.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  actorLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  actorText: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  watchTitle: { color: colors.cream, fontFamily: fonts.display, fontSize: 22, lineHeight: 24, marginTop: 3 },
  watchMeta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 2 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  reportFlag: { fontFamily: fonts.mono, fontSize: 12, color: colors.dim, paddingTop: 2 },
  watchNote: {
    color: "rgba(243,233,215,0.85)",
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,180,84,0.5)",
  },
  watchlistBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  watchlistBtnText: {
    color: colors.amber,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  playlistCard: {
    borderWidth: 1,
    borderColor: colors.ticket,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 16,
  },
  playlistEyebrow: {
    color: colors.ticket,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  playlistName: { color: colors.cream, fontFamily: fonts.display, fontSize: 22, lineHeight: 24, marginTop: 4 },
  playlistMeta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 2 },
});
