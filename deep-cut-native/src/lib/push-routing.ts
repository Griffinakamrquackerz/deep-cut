import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { useEffect } from "react";

// Where a tapped notification lands.
//
// The server puts a site-relative path on every push it sends (see
// ../src/lib/push-user.ts). Without this the app opened to whatever
// screen it was last on, which makes a push that says "@cam sent you a film"
// into a small lie — it announces something and then doesn't take you to it.
//
// Two cases, and they arrive through different doors: a tap while the app is
// running fires the listener, and a tap that launched the app from cold has
// already happened by the time anything mounts, so it has to be asked for.

/** Only paths this app actually has a screen for. Anything else opens the house. */
function safePath(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  // No protocol-relative "//host" — that's an origin, not a path.
  if (path.startsWith("//")) return null;
  return path;
}

function pathFrom(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification?.request?.content?.data as
    | Record<string, unknown>
    | undefined;
  return safePath(data?.path);
}

function go(path: string | null) {
  if (!path) return;
  // The web app's tab is "/lobby"; the app calls the same room "/community".
  const target = path === "/lobby" ? "/(tabs)/community" : path;
  try {
    router.push(target as never);
  } catch {
    /* an unknown route shouldn't crash the app on a tap */
  }
}

export function useNotificationRouting(ready: boolean): void {
  useEffect(() => {
    // Navigating before the router has mounted its routes throws.
    if (!ready || Platform.OS === "web") return;

    // Cold start: the tap already happened, so ask what it was.
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => go(pathFrom(r)))
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(pathFrom(r)));
    return () => sub.remove();
  }, [ready]);
}
