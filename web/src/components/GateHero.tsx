import { CrescentMark } from "./CrescentMark";

export function GateHero() {
  return (
    <section className="hero-message" aria-labelledby="gate-hero-title">
      <div className="hero-message__copy">
        <h1 aria-label="Prove you belong. Stay one of many." id="gate-hero-title">
          Prove you belong.
          <br />
          Stay one of many.
        </h1>
        <p>
          An organizer publishes an allowlist of commitments. A member proves
          membership in zero knowledge, and an epoch-scoped nullifier stops a
          second use without ever naming who used it.
        </p>
      </div>

      <div className="hero-message__motif" aria-hidden="true">
        <span className="hero-message__orbit hero-message__orbit--outer" />
        <span className="hero-message__orbit hero-message__orbit--inner" />
        <CrescentMark />
      </div>
    </section>
  );
}
