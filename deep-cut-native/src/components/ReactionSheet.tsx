import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import type { Reaction, Why } from "@/lib/types";
import { Button, Chip, Eyebrow } from "./ui";

// "You saw it — how'd it land?" Mirrors the web ReactionSheet: one reaction
// (required), one why (optional), a short note (optional).
const REACTIONS: Array<{ key: Reaction; label: string }> = [
  { key: "loved", label: "❤ Loved it" },
  { key: "fine", label: "😐 It was fine" },
  { key: "not_for_me", label: "🚫 Not for me" },
  { key: "loved_ironically", label: "🎭 Loved it ironically" },
];

const WHYS: Array<{ key: Why; label: string }> = [
  { key: "vibe", label: "the vibe" },
  { key: "story", label: "the story" },
  { key: "performances", label: "the performances" },
  { key: "chaos", label: "the chaos" },
];

export interface ReactionPayload {
  reaction: Reaction;
  why?: Why | null;
  note?: string | null;
}

export default function ReactionSheet({
  visible,
  title,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  onSubmit: (payload: ReactionPayload) => void;
  onClose: () => void;
}) {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const [note, setNote] = useState("");

  function reset() {
    setReaction(null);
    setWhy(null);
    setNote("");
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Eyebrow>You saw {title}</Eyebrow>
        <View style={styles.grid}>
          {REACTIONS.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              active={reaction === r.key}
              onPress={() => setReaction(r.key)}
            />
          ))}
        </View>
        <Text style={styles.subhead}>because of…</Text>
        <View style={styles.grid}>
          {WHYS.map((w) => (
            <Chip
              key={w.key}
              label={w.label}
              active={why === w.key}
              onPress={() => setWhy(why === w.key ? null : w.key)}
            />
          ))}
        </View>
        <TextInput
          value={note}
          onChangeText={(t) => setNote(t.slice(0, 500))}
          placeholder="A line for the record (optional)"
          placeholderTextColor={colors.dim}
          style={styles.input}
        />
        <Button
          title="Log it"
          disabled={!reaction}
          onPress={() => {
            if (!reaction) return;
            onSubmit({ reaction, why, note: note.trim() || null });
            reset();
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subhead: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    color: colors.cream,
    fontFamily: "Karla_400Regular",
    padding: 12,
    backgroundColor: colors.bg,
  },
});
