import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputSelectionChangeEventData,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { splitMentions, tokenAtCaret } from "@/lib/mentions";
import { fetchPeople, type Person } from "@/lib/people";
import { colors, fonts } from "@/lib/theme";

// A comment box that knows about @handles — native port of
// ../src/components/MentionInput.tsx.
//
// The picker opens on the @ you are currently typing and nothing else: it
// watches the token immediately left of the caret, so an @ earlier in the line
// you have already finished doesn't reopen it, and moving the caret away closes
// it. Choosing somebody replaces exactly that token, leaving the rest of the
// sentence — including any other mentions — alone.
//
// RN gives the caret through onSelectionChange rather than on the change event,
// and it fires after the text lands, so the token is read from whichever value
// is current at that moment.

function Face({ url, name }: { url: string | null; name: string }) {
  if (url) return <Image source={{ uri: url }} style={styles.face} contentFit="cover" />;
  return (
    <View style={[styles.face, styles.faceFallback]}>
      <Text style={styles.faceInitial}>{name.charAt(0).toUpperCase() || "?"}</Text>
    </View>
  );
}

export default function MentionInput({
  value,
  onChange,
  placeholder,
  maxLength,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  style?: StyleProp<TextStyle>;
}) {
  const [token, setToken] = useState<{ at: number; query: string } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  // Set when we rewrite the text ourselves, so the caret event that follows
  // doesn't reopen the picker on the handle we just finished.
  const justChose = useRef(false);

  useEffect(() => {
    if (!token) {
      setPeople([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void fetchPeople(token.query).then((rows) => {
        if (alive) setPeople(rows.filter((p) => p.handle).slice(0, 5));
      });
    }, 160); // a beat, so every keystroke isn't a request
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [token]);

  function onSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    if (justChose.current) {
      justChose.current = false;
      return;
    }
    const { start, end } = e.nativeEvent.selection;
    // A range selection isn't a caret; nothing is being typed.
    setToken(start === end ? tokenAtCaret(value, start) : null);
  }

  function choose(p: Person) {
    if (!token || !p.handle) return;
    const before = value.slice(0, token.at);
    const after = value.slice(token.at + 1 + token.query.length);
    // A trailing space, so the next word isn't swallowed into the handle.
    const next = `${before}@${p.handle} ${after.replace(/^ /, "")}`;
    justChose.current = true;
    onChange(maxLength ? next.slice(0, maxLength) : next);
    setToken(null);
    setPeople([]);
  }

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {token && people.length > 0 && (
        <View style={styles.picker}>
          {people.map((p) => (
            <Pressable key={p.id} onPress={() => choose(p)} style={styles.pickerRow}>
              <Face url={p.avatar_url} name={p.handle ?? ""} />
              <Text style={styles.pickerHandle} numberOfLines={1}>
                @{p.handle}
              </Text>
              {p.display_name ? (
                <Text style={styles.pickerName} numberOfLines={1}>
                  {p.display_name}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
      <TextInput
        value={value}
        onChangeText={(t) => onChange(maxLength ? t.slice(0, maxLength) : t)}
        onSelectionChange={onSelectionChange}
        onBlur={() => setToken(null)}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        autoCapitalize="none"
        style={style}
      />
    </View>
  );
}

/**
 * A comment's text with its @handles picked out.
 *
 * Only handles the server resolved to a real person are highlighted — anything
 * else stays plain, so typing "@nobody" reads as what it is.
 */
export function MentionText({
  body,
  mentions,
  style,
  linkStyle,
  onPressHandle,
}: {
  body: string;
  mentions: string[];
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onPressHandle?: (handle: string) => void;
}) {
  const known = new Set(mentions.map((h) => h.toLowerCase()));
  if (!known.size) return <Text style={style}>{body}</Text>;

  return (
    <Text style={style}>
      {splitMentions(body, known).map((span, i) =>
        span.kind === "mention" ? (
          <Text
            key={i}
            style={[{ color: colors.amber, fontFamily: fonts.bodyBold }, linkStyle]}
            onPress={onPressHandle ? () => onPressHandle(span.value) : undefined}
          >
            @{span.value}
          </Text>
        ) : (
          <Text key={i}>{span.value}</Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  picker: {
    // Above the box, not below: the keyboard owns the bottom of the screen.
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    marginBottom: 4,
    zIndex: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    overflow: "hidden",
  } as ViewStyle,
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 7 },
  face: { width: 22, height: 22, borderRadius: 11 },
  faceFallback: { backgroundColor: colors.line, alignItems: "center", justifyContent: "center" },
  faceInitial: { fontFamily: fonts.display, fontSize: 12, color: colors.cream },
  pickerHandle: { flexShrink: 1, fontFamily: fonts.mono, fontSize: 11, color: colors.cream },
  pickerName: { flexShrink: 1, fontFamily: fonts.body, fontSize: 11, color: colors.dim },
});
