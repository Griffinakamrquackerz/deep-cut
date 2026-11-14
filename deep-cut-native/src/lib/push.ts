import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

// Native push — the Friday Night Deal nudge on a real device. Remote push needs
// a dev/TestFlight build (Expo Go can't receive remote push), and an EAS
// projectId (set by `eas init`); until both exist, register* no-ops cleanly so
// nothing breaks. Tokens live server-side in the events table (see /api/push/expo).

// Show a banner even when the app is foregrounded. Native only — a web export
// runs modules in Node, where this would have nothing to attach to.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

async function getToken(): Promise<string | null> {
  const id = projectId();
  if (!id) return null; // not linked to EAS yet — a token can't be minted
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return data || null;
  } catch {
    return null;
  }
}

/** Ask for permission (if needed), mint a token, and hand it to the backend.
 *  Returns true only if the device is now registered to receive pushes. */
export async function registerForPush(prompt = true): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Deep Cut",
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: "#ffb454",
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      if (!prompt) return false; // silent refresh: don't nag if not already granted
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return false;

    const token = await getToken();
    if (!token) return false;
    const res = await api("/api/push/expo", { method: "POST", body: JSON.stringify({ token }) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Whether it's worth offering to turn notifications on.
 *
 * True only when nobody has answered yet. Once permission is granted there's
 * nothing to ask, and once it's denied iOS won't show the system prompt again
 * no matter how many times it's requested — the only way back is the Settings
 * app, so an in-app offer at that point is a button that does nothing.
 */
export async function pushAskable(): Promise<boolean> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return status !== "granted" && canAskAgain;
  } catch {
    return false;
  }
}

/** Whether this device already has notification permission (no prompt). */
export async function pushPermissionGranted(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** Drop this device's token from the backend (opt-out). */
export async function unregisterForPush(): Promise<void> {
  try {
    const token = await getToken();
    if (token) await api("/api/push/expo", { method: "DELETE", body: JSON.stringify({ token }) });
  } catch {
    /* best effort */
  }
}
