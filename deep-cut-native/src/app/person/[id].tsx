import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BackButton from "@/components/BackButton";
import HouseNav from "@/components/HouseNav";
import { primaryRatingLabel } from "@/components/RatingLine";
import { Eyebrow, Marquee, Poster } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts, posterUrl } from "@/lib/theme";

// Actor/director page — photo, bio, and filmography. Reached by tapping any
// cast or crew name on a movie detail; each film taps through to its own page.

interface PersonFilm {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  role: string | null;
  tmdb: number | null;
}
interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  profilePath: string | null;
  knownFor: string | null;
  birthday: string | null;
  placeOfBirth: string | null;
  films: PersonFilm[];
}

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [bioExpanded, setBioExpanded] = useState(false);

  const load = useCallback(async () => {
    const res = await api<PersonDetails>(`/api/person/${id}`);
    if (res.ok && res.data) setData(res.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const photo = posterUrl(data?.profilePath, "w342");

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : !data ? (
        <View style={[styles.center, { padding: 24 }]}>
          <Text style={styles.dim}>No one by that name in the credits.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <BackButton style={{ marginBottom: 12 }} />
          {/* Header */}
          <View style={styles.headerRow}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={150} />
            ) : (
              <View style={[styles.photo, styles.photoFallback]}>
                <Text style={styles.photoInitial}>{data.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Marquee size={30}>{data.name.toUpperCase()}</Marquee>
              {data.knownFor ? <Text style={styles.knownFor}>{data.knownFor}</Text> : null}
              {data.birthday ? (
                <Text style={styles.meta}>
                  b. {data.birthday}
                  {data.placeOfBirth ? ` · ${data.placeOfBirth}` : ""}
                </Text>
              ) : data.placeOfBirth ? (
                <Text style={styles.meta}>{data.placeOfBirth}</Text>
              ) : null}
            </View>
          </View>

          {/* Bio */}
          {data.biography ? (
            <View>
              <Eyebrow style={{ marginBottom: 6 }}>Bio</Eyebrow>
              <Text style={styles.bio} numberOfLines={bioExpanded ? undefined : 6}>
                {data.biography}
              </Text>
              {data.biography.length > 320 && (
                <Pressable onPress={() => setBioExpanded((v) => !v)}>
                  <Text style={styles.readMore}>{bioExpanded ? "Show less ↑" : "Read more ↓"}</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {/* Filmography */}
          {data.films.length > 0 && (
            <View>
              <Eyebrow style={{ marginBottom: 8 }}>Known for</Eyebrow>
              <View style={styles.grid}>
                {data.films.map((f) => (
                  <Pressable key={f.id} style={styles.filmItem} onPress={() => router.push(`/m/${f.id}`)}>
                    <Poster
                      path={f.poster_path}
                      title={f.title}
                      year={f.year}
                      width={GRID_W}
                      badge={primaryRatingLabel({ tmdb: f.tmdb })}
                    />
                    {f.role ? (
                      <Text style={styles.role} numberOfLines={1}>
                        {f.role}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.attribution}>
            Person data: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </Text>
        </ScrollView>
      )}
      <HouseNav />
    </SafeAreaView>
  );
}

const GRID_W = 104;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { color: colors.dim, fontFamily: fonts.body, fontSize: 15, textAlign: "center" },
  body: { padding: 20, paddingBottom: 112, gap: 18 },
  headerRow: { flexDirection: "row", gap: 16 },
  photo: { width: 110, height: 140, borderRadius: 8, backgroundColor: colors.surface },
  photoFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  photoInitial: { color: colors.dim, fontFamily: fonts.display, fontSize: 44 },
  knownFor: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  meta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10.5, marginTop: 4 },
  bio: { color: "rgba(243,233,215,0.9)", fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  readMore: { color: colors.amber, fontFamily: fonts.mono, fontSize: 11, marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  filmItem: { width: GRID_W },
  role: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 4 },
  attribution: { color: "rgba(183,164,145,0.7)", fontFamily: fonts.mono, fontSize: 8.5, lineHeight: 12 },
});
