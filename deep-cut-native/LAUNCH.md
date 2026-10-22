# Deep Cut — getting the app onto your iPhone (and TestFlight)

Everything here runs from **PowerShell**, one line at a time, from inside the
`deep-cut-native` folder. You only need to do the one-time setup once.

---

## What's already done for you

- ✅ App icon + splash — the "DC / ADMIT ONE" mark on house-dark (matches the site)
- ✅ Bundle ID `xyz.thedeepcut.app`, name "Deep Cut", version 1.0.0
- ✅ `eas.json` build profiles (development / preview / production)
- ✅ Backend + Supabase keys wired in (the app talks to thedeepcut.xyz)

**The app sells nothing.** Supporting the fund happens on the website, through
Stripe, never inside the app. There are no in-app purchases to configure and
nothing for Apple to take a cut of.

One honest caveat, because an audit found it and it's better you know than a
reviewer: the Tonight tab's open-call card opens `/submit` on the website, and
that page links on to `/fund`, which reaches Stripe in one more tap. Submitting
a pitch is free, so nothing is being sold — but it is a path from inside the
app to a checkout, so don't claim in the notes that no such path exists.

Note: this is *not* a "reader app" in Apple's sense — that's a specific
category (news, magazines, books, audio, video) with its own entitlement, and
Deep Cut isn't in it. Our position is simpler: the app is free, fully
functional as installed, and has no purchase of any kind. Say it that way if a
reviewer asks.

---

## One-time setup

**1. Install the build tool** (only once, ever):
```
npm install -g eas-cli
```

**2. Log in to Expo** (make a free account at expo.dev first if you don't have one):
```
eas login
```

**3. Link this project to your Expo account:**
```
eas init
```
Say **yes** when it asks to create the project. This writes a project ID into
`app.json` — commit that change when it happens.

---

## Build it for your iPhone (TestFlight)

**4. Kick off the production build** (Expo builds it in the cloud — takes ~15–25 min):
```
eas build --platform ios --profile production
```
- It will ask for your **Apple Developer** login. Let EAS handle the
  certificates and provisioning profile — say **yes** to the automatic options.
- When it finishes it prints a build URL. The build is a `.ipa` sitting on
  Expo's servers, ready to send to Apple.

**5. Send it to TestFlight:**
```
eas submit --platform ios --profile production
```
- Pick the build you just made.
- It uploads to **App Store Connect**. After ~10–15 min of Apple processing,
  it shows up under **TestFlight** in App Store Connect.

**6. Install on your phone:**
- Open **App Store Connect → your app → TestFlight**.
- Add yourself as an internal tester (your Apple ID email).
- Install **TestFlight** from the App Store on your iPhone, and the Deep Cut
  build will be there to install. This is the real app — no Expo Go, no QR.

---

## Every time you ship an update later

```
eas build --platform ios --profile production
```
```
eas submit --platform ios --profile production
```
Testers get the new build automatically. (Bump `version` in `app.json` for a
real store release; TestFlight build numbers auto-increment.)

---

## Before the public App Store release (not needed for TestFlight)

The full handover pack — paste-ready listing copy, review notes, privacy
answers, and who does what — is a separate document. This is the short version.

**Already handled in the build. Don't redo these:**

- ✅ **Account deletion** (Guideline 5.1.1) — Settings → Delete account, with a
  confirm step. Built and shipped.
- ✅ **Report and block** (Guideline 1.2) — on hot takes and on member
  profiles, wired to a real moderation queue. Required for user-generated
  content.
- ✅ **Sign in with Apple** (Guideline 4.8) — **not applicable.** It's only
  required when you offer third-party social login. We offer email/password
  and email magic links, both first-party. Worth stating in the review notes
  so a reviewer doesn't have to guess.
- ✅ **Photo permission string** — set, and camera + microphone explicitly
  turned OFF in `app.json`. This mattered: the `expo-image-picker` plugin
  injects boilerplate camera and microphone purpose strings for anything you
  don't specify, so the binary was declaring both for features the app never
  touches. Apple rejects purpose strings whose functionality a reviewer can't
  find (5.1.1). Fixed.

**Before you submit:**

- ✅ **The demo account is built.** Griffin creates it from the admin console
  (`thedeepcut.xyz/admin` → The door → *Create the review account*). It sets a
  real password — a reviewer cannot receive a magic link — seeds twelve loved
  films so the app opens onto a working Tonight screen rather than the
  onboarding grid, grants premium, and deals a batch of recommendations. The
  password is shown once; it goes in **App Store Connect → App Review
  Information**. Re-running it resets the password, so don't, once a review is
  in progress.

- 🔴 **`APPLE_TEAM_ID` needs setting, and it's yours.** Deep Cut now claims
  Universal Links (`app.json` → `ios.associatedDomains`), which is what makes
  a tapped invite email open the app instead of Safari. For iOS to believe it,
  `https://thedeepcut.xyz/.well-known/apple-app-site-association` has to serve
  your ten-character Apple **Team ID**. Find it at
  developer.apple.com → Membership, send it to Griffin, and he'll set it in
  Vercel. Until then that URL 404s and the association silently doesn't work.
  Verify with:
  ```
  Invoke-RestMethod "https://thedeepcut.xyz/api/version" | Select-Object -ExpandProperty configured
  ```
  and look for `appleTeamId : True`.

- 🟡 **Ship worldwide.** An earlier version of this document told you to
  release US-only, because the ballot screen had a button opening
  `thedeepcut.xyz/fund`. **That button no longer exists** — it was replaced
  with plain text. There is now no reason to restrict the storefront, and
  Deep Cut has full region support (18 countries of streaming catalogues), so
  a US-only release would waste it. Select all territories.

- 🟡 **Age rating: answer the questionnaire honestly.** The app carries
  user-generated content (hot takes, comments, watch notes, member-published
  links on film pages) and opens member-supplied web links. Those are
  rating-forcing questions. Answer them as they are rather than optimising —
  an app that answers "no" and then shows a reviewer an open URL field gets
  bounced.

**Still to fill in:**

- **App Store listing**: screenshots (6.9" iPhone required; no iPad set — we
  don't claim tablet support), description, keywords, support URL, privacy
  policy URL (`https://thedeepcut.xyz/privacy`), age rating.
- **Privacy answers**: nothing is used for tracking in v1 — no ad network, no
  third-party analytics. Keep it that way for the first release; adding AdMob
  brings App Tracking Transparency and a much messier privacy label with it.

---

## Still on the native roadmap (nice-to-haves, not blockers)

- Ads — deliberately not in v1. See the privacy note above. AdMob also can't
  be set up until the app is published, because it asks for the App Store app
  ID, so this is a second-release job by definition.

Magic-link deep-linking is **done** — the app now handles the `token_hash`
that the invite email actually carries, on both the `deepcut://` scheme and
`https://thedeepcut.xyz/auth/confirm`. It needs `APPLE_TEAM_ID` set to work
over https (see above).

Push notifications are done: web push and Expo, with tap-through routing and
an opt-out in Settings. They need a real build to test, not Expo Go.
