import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import PlaylistDetailView from "@/components/PlaylistDetailView";

// A mixtape you own or received, opened by id.
export default function PlaylistById() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PlaylistDetailView endpoint={`/api/playlists/${id}`} />
    </>
  );
}
