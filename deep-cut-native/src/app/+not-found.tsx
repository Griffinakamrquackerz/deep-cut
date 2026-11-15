import { router } from "expo-router";
import React from "react";
import { BoothCard } from "@/components/house";
import { Button } from "@/components/ui";

// Reel missing.
//
// When a print arrived at a theatre a reel short, the projectionist spliced
// in a card and carried on. A link into the app that matches no screen is
// that situation — the thing you came for isn't in the can — so it gets the
// same card, signed the same way. Same words as the web's not-found page.
export default function NotFound() {
  return (
    <BoothCard
      big={"Reel\nmissing"}
      sorry="Sorry for the inconvenience."
      signed="The Management"
      note="That screen isn't in the can. It may have moved, or it was never shot."
    >
      <Button title="Back to the house" onPress={() => router.replace("/")} />
    </BoothCard>
  );
}
