import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import ProfileScreen from "@/components/ProfileScreen";

// Someone else's member card, by handle or id.
export default function PublicProfile() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileScreen profileKey={key} standalone />
    </>
  );
}
