const CHAIN = ["Play", "Earn", "Create", "Fund"];

export function LoopSection() {
  return (
    <section id="loop" className="landing-section landing-loop">
      <h2>One loop. Everyone wins.</h2>
      <p className="landing-lede">
        Each step feeds the next. A friend who joins to settle a score is a new player nobody paid to acquire, and a
        player who creates brings their own audience with them.
      </p>
      <div className="landing-chain">
        {CHAIN.map((node, i) => (
          <span key={node} className="flex items-center gap-2">
            <span className="landing-chain-node">{node}</span>
            {i < CHAIN.length - 1 ? <span className="landing-chain-arrow">→</span> : null}
          </span>
        ))}
      </div>
    </section>
  );
}
