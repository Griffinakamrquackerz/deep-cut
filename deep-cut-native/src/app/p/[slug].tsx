import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import PlaylistDetailView from "@/components/PlaylistDetailView";

// A shared mixtape opened by its slug (from the feed, a profile, or a link) —
// stays in the app instead of bouncing out to the website.
export default function PlaylistBySlug() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PlaylistDetailView endpoint={`/api/playlists/by-slug/${slug}`} />
    </>
  );
}
