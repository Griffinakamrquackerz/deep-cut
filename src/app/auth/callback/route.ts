import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Explicit destinations (e.g. password recovery → /reset) win outright.
      if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
        return NextResponse.redirect(`${origin}${nextParam}`);
      }
      // Otherwise: already-onboarded users go straight to Tonight.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { count } = await supabase
          .from("loved_movies")
          .select("movie_id", { count: "exact", head: true })
          .eq("user_id", user.id);
        return NextResponse.redirect(`${origin}${count && count >= 8 ? "/" : "/welcome"}`);
      }
    }
  }
  return NextResponse.redirect(`${origin}/login`);
}
