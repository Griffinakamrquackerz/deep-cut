import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import type { Reaction, Why } from "@/lib/types";
import { PaperHead } from "./rooms";

// The comment card a cinema hands you on the way out. Mirrors the web
// ReactionSheet word for word: one reaction (required), one why (optional),
// a short note (optional). It's a printed form, so the choices are boxes you
// tick in ballpoint and the note is written on a ruled line.
const REACTIONS: Array<{ key: Reaction; label: string }> = [
  { key: "loved", label: "Loved it" },
  { key: "fine", label: "Fine" },
  { key: "not_for_me", label: "Not for me" },
  { key: "loved_ironically", label: "Loved it ironically" },
];

const WHYS: Array<{ key: Why; label: string }> = [
  { key: "vibe", label: "Vibe" },
  { key: "story", label: "Story" },
  { key: "performances", label: "Performances" },
  { key: "chaos", label: "Chaos" },
];

const BALLPOINT = "#1d2a5c";
const RED_INK = "#a8371d";

export interface ReactionPayload {
  reaction: Reaction;
  why?: Why | null;
  note?: string | null;
}

function Tick({ label, on, onPress, round }: { label: string; on: boolean; onPress: () => void; round?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={round ? "radio" : "checkbox"}
      accessibilityState={round ? { selected: on } : { checked: on }}
      style={styles.tick}
      hitSlop={4}
    >
      <View style={[styles.box, round && styles.boxRound]}>
        {on ? <Text style={styles.mark}>✕</Text> : null}
      </View>
      <Text style={[styles.tickText, on && { color: colors.paperInk }]}>{label}</Text>
    </Pressable>
  );
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
      <View style={styles.sheet} accessibilityLabel={`Log ${title}`}>
        <PaperHead left="Comment card" right="You watched" />
        <Text style={styles.title} numberOfLines={2}>
          {title.toUpperCase()}
        </Text>

        <View style={styles.ticks}>
          {REACTIONS.map((r) => (
            <Tick key={r.key} label={r.label} on={reaction === r.key} onPress={() => setReaction(r.key)} />
          ))}
        </View>

        {reaction ? (
          <>
            <Text style={styles.subhead}>Why? (optional)</Text>
            <View style={styles.whys}>
              {WHYS.map((w) => (
                <Tick
                  key={w.key}
                  round
                  label={w.label}
                  on={why === w.key}
                  onPress={() => setWhy(why === w.key ? null : w.key)}
                />
              ))}
            </View>
            <TextInput
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 500))}
              placeholder="One line about it… (optional)"
              placeholderTextColor="rgba(42,28,21,0.38)"
              style={styles.input}
            />
          </>
        ) : null}

        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </Pressable>
          <Pressable
            disabled={!reaction}
            onPress={() => {
              if (!reaction) return;
              onSubmit({ reaction, why, note: note.trim() || null });
              reset();
            }}
            style={({ pressed }) => [
              styles.submit,
              !reaction && { opacity: 0.4 },
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <Text style={styles.submitText}>LOG IT</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  title: { color: colors.paperInk, fontFamily: fonts.display, fontSize: 32, lineHeight: 32, marginTop: 2 },
  ticks: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  whys: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  tick: { flexDirection: "row", alignItems: "center", gap: 9, width: "50%", paddingVertical: 2 },
  box: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.paperInk,
    alignItems: "center",
    justifyContent: "center",
  },
  boxRound: { borderRadius: 9 },
  mark: { color: BALLPOINT, fontSize: 15, lineHeight: 17, fontWeight: "700", transform: [{ rotate: "-6deg" }] },
  tickText: { color: colors.paperDim, fontFamily: fonts.body, fontSize: 15 },
  subhead: {
    color: colors.paperDim,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: 2.2,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(42,28,21,0.2)",
  },
  input: {
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(42,28,21,0.55)",
    color: BALLPOINT,
    fontFamily: fonts.serif,
    fontSize: 22,
    paddingVertical: 4,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancel: {
    borderWidth: 1,
    borderColor: "rgba(42,28,21,0.35)",
    borderRadius: 4,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  cancelText: { color: colors.paperDim, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2.2 },
  submit: {
    flex: 1,
    borderWidth: 2,
    borderColor: RED_INK,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
    transform: [{ rotate: "-0.6deg" }],
  },
  submitText: { color: RED_INK, fontFamily: fonts.monoSemi, fontSize: 13, letterSpacing: 3 },
});
