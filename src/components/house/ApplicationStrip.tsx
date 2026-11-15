// The top of the membership application.
//
// Joining Deep Cut is four short screens, and they used to be four unrelated
// screens with "step 2 of 4" on them. They're four parts of one form now: the
// kind a video store kept on a clipboard by the till, with a box ticked for
// each part you've finished. The card you get at the end is the one on your
// You tab.

const PARTS = ["Films", "Screens", "Signature", "Name"] as const;

export default function ApplicationStrip({ part }: { part: 1 | 2 | 3 | 4 }) {
  return (
    <div className="app-form" role="group" aria-label={`Membership application, part ${part} of 4`}>
      <p className="app-form-top">
        <b>Membership application</b>
        <span>Deep Cut Video</span>
      </p>
      <ol className="app-form-parts">
        {PARTS.map((label, i) => (
          <li key={label} className={i + 1 < part ? "is-done" : i + 1 === part ? "is-now" : ""}>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}
