"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { tokenAtCaret } from "@/lib/mentions";
import { fetchPeople, type Person } from "@/lib/people";

// A comment box that knows about @handles.
//
// The picker opens on the @ you are currently typing and nothing else: it
// watches the token immediately left of the caret, so an @ earlier in the line
// you have already finished doesn't reopen it, and moving the caret away
// closes it. Choosing somebody replaces exactly that token, leaving the rest
// of the sentence — including any other mentions — alone.

export default function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState<{ at: number; query: string } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [active, setActive] = useState(0);

  const refresh = useCallback((next: string, caret: number) => {
    setToken(tokenAtCaret(next, caret));
    setActive(0);
  }, []);

  useEffect(() => {
    if (!token) {
      setPeople([]);
      return;
    }
    // An empty @ lists people you already know; typing narrows to a search.
    let alive = true;
    const t = setTimeout(() => {
      void fetchPeople(token.query).then((rows) => {
        if (!alive) return;
        setPeople(rows.filter((p) => p.handle).slice(0, 6));
      });
    }, 140); // a beat, so every keystroke isn't a request
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [token]);

  function choose(p: Person) {
    if (!token || !p.handle) return;
    const before = value.slice(0, token.at);
    const after = value.slice(token.at + 1 + token.query.length);
    // A trailing space, so the next word isn't swallowed into the handle.
    const next = `${before}@${p.handle} ${after.replace(/^ /, "")}`;
    onChange(maxLength ? next.slice(0, maxLength) : next);
    setToken(null);
    setPeople([]);
    requestAnimationFrame(() => {
      const caret = before.length + p.handle!.length + 2;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  }

  const open = !!token && people.length > 0;

  return (
    <div className="relative min-w-0 flex-1">
      {open && (
        <ul className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded border border-line bg-surface shadow-xl">
          {people.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                // mousedown, not click: the input blurs on click and the list
                // would be gone before the click ever landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left ${
                  i === active ? "bg-bg" : ""
                }`}
              >
                <Avatar url={p.avatar_url} name={p.handle ?? ""} size="sm" />
                <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-cream">
                  @{p.handle}
                </span>
                {p.display_name && (
                  <span className="truncate text-[0.65rem] text-dim">{p.display_name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
          onChange(next);
          refresh(next, e.target.selectionStart ?? next.length);
        }}
        onKeyUp={(e) => {
          // Arrow keys move the caret without changing the text, so the token
          // has to be re-read on key-up too or the picker goes stale.
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
            refresh(value, e.currentTarget.selectionStart ?? value.length);
          }
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % people.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + people.length) % people.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              choose(people[active]);
              return;
            }
            if (e.key === "Escape") {
              setToken(null);
              return;
            }
          }
          if (e.key === "Enter") onSubmit();
        }}
        onBlur={() => setToken(null)}
        placeholder={placeholder}
        className="w-full rounded border border-line bg-bg px-2.5 py-1.5 text-sm text-cream placeholder:text-dim/60"
      />
    </div>
  );
}
