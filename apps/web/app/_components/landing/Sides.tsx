interface Side {
  id: string;
  tag: string;
  tagClass: string;
  heading: string;
  body: string;
  give: string;
  get: string;
  cta: string;
}

const SIDES: Side[] = [
  {
    id: "player",
    tag: "Players",
    tagClass: "bg-mint",
    heading: "Play free. Win real things.",
    body: "Quick games, points on every play, levels, streaks, and rewards from brands they already buy from.",
    give: "Attention, play, invites",
    get: "Fun, status, real rewards",
    cta: "Open the player app",
  },
  {
    id: "creator",
    tag: "Creators",
    tagClass: "bg-gum text-white",
    heading: "Make a game in a minute.",
    body: "Templates, not code. Drop in questions or images, publish to the feed, and earn every time someone plays.",
    give: "Games and audiences",
    get: "Per-play earnings, sponsorships",
    cta: "Open creator studio",
  },
  {
    id: "brand",
    tag: "Brands",
    tagClass: "bg-tang",
    heading: "Pay for play, not impressions.",
    body: "Fund a reward pool, pick a game, and watch plays, shares and redemptions arrive in real time.",
    give: "Reward budgets",
    get: "Measured engagement, store visits, first-party data",
    cta: "Open brand console",
  },
];

export function Sides() {
  return (
    <section className="landing-section landing-sides">
      {SIDES.map((s) => (
        <div key={s.id} id={s.id} className="landing-side">
          <span className={`landing-side-tag ${s.tagClass}`}>{s.tag}</span>
          <h3>{s.heading}</h3>
          <p className="text-sm text-soft">{s.body}</p>
          <dl>
            <dt>Give</dt>
            <dd>{s.give}</dd>
            <dt>Get</dt>
            <dd>{s.get}</dd>
          </dl>
          <a href="/login" className="btn">
            {s.cta}
          </a>
        </div>
      ))}
    </section>
  );
}
