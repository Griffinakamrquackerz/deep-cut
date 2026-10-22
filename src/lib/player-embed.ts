// The embed URL for a film, built in one place instead of three template
// literals inside a component.
//
// The Theatre plays every film out of the filmmaker's own Vimeo or YouTube
// player — see the note at the top of app/tv/LateShow.tsx — so the only thing
// this module decides is *how* that player is asked to behave. It exists as a
// function because the parameter that matters most here is invisible until it's
// wrong: without `playsinline` iOS Safari seizes the film into its own
// fullscreen player the moment it starts, and dismissing that leaves the page
// holding a scroll offset the room no longer means. That is exactly the bug
// this module was extracted to make impossible to reintroduce silently, and
// tests/player-embed.test.ts pins it.

export interface EmbedSource {
  source: "vimeo" | "youtube";
  videoId: string;
}

export interface EmbedOptions {
  /**
   * Start muted. Left off by the Theatre on purpose: the URL is held constant
   * for the length of a film, because a URL that changes remounts the player
   * and sends the picture back to the opening frame. Live mute goes through
   * postMessage instead — see applyMute in app/tv/LateShow.tsx.
   */
  muted?: boolean;
}

export function playerEmbedUrl(video: EmbedSource, opts: EmbedOptions = {}): string {
  const { muted = false } = opts;

  if (video.source === "vimeo") {
    const q = new URLSearchParams({
      autoplay: "1",
      // Chrome off: this is a repertory screen, not a video page.
      title: "0",
      byline: "0",
      portrait: "0",
      dnt: "1",
      muted: muted ? "1" : "0",
      // The one that keeps the film in the glass on iOS.
      playsinline: "1",
    });
    return `https://player.vimeo.com/video/${video.videoId}?${q}`;
  }

  const q = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    // The room's MUTE key rides on YouTube's command channel, which does not
    // answer without this.
    enablejsapi: "1",
    mute: muted ? "1" : "0",
    // Same job as Vimeo's: without it iOS takes the film away fullscreen.
    playsinline: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${video.videoId}?${q}`;
}
