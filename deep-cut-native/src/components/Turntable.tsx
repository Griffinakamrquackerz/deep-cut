import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts, posterUrl } from "@/lib/theme";

// The profile turntable — a spinning vinyl record wrapped around a hidden
// Spotify player. Native port of the web ProfileTheme: we host zero audio,
// Spotify's IFrame API drives playback (inside a WebView, where iOS Safari
// content blockers don't reach), and the record spins in sync. Tap the record
// to play/pause. The player sits on-screen but under an opaque cover so it
// still initializes (a truly hidden iframe refuses to) while only the vinyl shows.

// A page that boots Spotify's IFrame controller and bridges it to React Native.
function playerHtml(kind: "track" | "album", id: string): string {
  const uri = `spotify:${kind}:${id}`;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{margin:0;padding:0}html,body{background:#0a0a0a;height:100%;overflow:hidden}#embed{width:100%}</style></head><body>
<div id="embed"></div>
<script src="https://open.spotify.com/embed/iframe-api/v1" async></script>
<script>
  function send(m){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  window.onSpotifyIframeApiReady = function(API){
    API.createController(document.getElementById('embed'), { uri: '${uri}', width: '100%', height: 80 }, function(ctrl){
      window.__ctrl = ctrl;
      ctrl.addListener('ready', function(){ send({ t: 'ready' }); });
      ctrl.addListener('playback_update', function(e){ send({ t: 'pu', paused: !!(e.data && e.data.isPaused) }); });
    });
  };
  window.__toggle = function(){ if(window.__ctrl) window.__ctrl.togglePlay(); };
  window.__play = function(){ if(window.__ctrl) window.__ctrl.play(); };
</script>
</body></html>`;
}

export default function Turntable({
  kind,
  id,
  artPath,
}: {
  kind: "track" | "album";
  id: string;
  artPath?: string | null;
}) {
  const webRef = useRef<WebView>(null);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (playing && !reduced) {
      // Continuous 33⅓-ish rotation; withRepeat of a +360 timing loops forever.
      spin.value = withRepeat(
        withTiming(spin.value + 360, { duration: 3600, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(spin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, reduced]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(playing ? "-18deg" : "-32deg", { duration: 400 }) }],
  }));

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { t: string; paused?: boolean };
      if (m.t === "ready") setReady(true);
      else if (m.t === "pu") setPlaying(!m.paused);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    void Haptics.selectionAsync();
    webRef.current?.injectJavaScript("window.__toggle && window.__toggle(); true;");
  }

  const art = posterUrl(artPath, "w185");

  return (
    <View style={styles.deck}>
      {/* Real Spotify player — on-screen so it initializes, hidden under the
          opaque deck + vinyl so only the record shows. */}
      <View style={styles.playerHost} pointerEvents="none">
        <WebView
          ref={webRef}
          source={{ html: playerHtml(kind, id), baseUrl: "https://open.spotify.com" }}
          onMessage={onMessage}
          style={styles.player}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={["*"]}
        />
      </View>

      {/* Tonearm */}
      <Animated.View style={[styles.arm, armStyle]} pointerEvents="none">
        <View style={styles.armBar} />
        <View style={styles.armHead} />
      </Animated.View>
      <View style={styles.armPivot} pointerEvents="none" />

      {/* The record */}
      <Pressable onPress={toggle} style={styles.discWrap}>
        <Animated.View style={[styles.disc, discStyle]}>
          <View style={[styles.groove, { width: 168, height: 168, borderRadius: 84 }]} />
          <View style={[styles.groove, { width: 132, height: 132, borderRadius: 66 }]} />
          <View style={[styles.groove, { width: 100, height: 100, borderRadius: 50 }]} />
          <View style={styles.label}>
            {art ? (
              <Image source={{ uri: art }} style={styles.labelArt} contentFit="cover" />
            ) : (
              <View style={[styles.labelArt, styles.labelArtFallback]} />
            )}
            <View style={styles.spindle} />
          </View>
        </Animated.View>
      </Pressable>

      <Text style={styles.hint}>
        {playing ? "♪ now spinning — tap to pause" : ready ? "▶ tap the record to play" : "cueing the record…"}
      </Text>
    </View>
  );
}

const DISC = 190;

const styles = StyleSheet.create({
  deck: {
    height: DISC + 60,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  playerHost: { position: "absolute", top: 0, left: 0, right: 0, height: 90, opacity: 0.02 },
  player: { flex: 1, backgroundColor: "transparent" },
  discWrap: { width: DISC, height: DISC, alignItems: "center", justifyContent: "center" },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: "#0b0b0b",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  groove: { position: "absolute", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  label: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  labelArt: { width: 74, height: 74, borderRadius: 37 },
  labelArtFallback: { backgroundColor: colors.amber },
  spindle: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0b0b0b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  arm: {
    position: "absolute",
    top: 14,
    right: 26,
    width: 90,
    height: 10,
    alignItems: "flex-end",
    zIndex: 5,
  },
  armBar: { width: 84, height: 5, borderRadius: 3, backgroundColor: "#c9c4bb" },
  armHead: { position: "absolute", left: 0, top: -3, width: 14, height: 11, borderRadius: 2, backgroundColor: "#e8e4da" },
  armPivot: {
    position: "absolute",
    top: 8,
    right: 20,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#d8d3c9",
    zIndex: 6,
  },
  hint: {
    position: "absolute",
    bottom: 10,
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
});
