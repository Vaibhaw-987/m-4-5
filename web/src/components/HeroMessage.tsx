import { CrescentMark } from "./CrescentMark";

export function HeroMessage() {
  return (
    <section className="hero-message" aria-labelledby="hero-title">
      <div className="hero-message__copy">
        <h1
          aria-label="Make it public. Keep ownership private."
          id="hero-title"
        >
          Make it public.
          <br />
          Keep ownership private.
        </h1>
        <p>
          Publish a pledge anyone can verify. Complete it later with a
          zero-knowledge proof that never reveals your secret.
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
