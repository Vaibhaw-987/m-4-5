const FEEDBACK_URL =
  "https://github.com/himanshu748/veilpledge/issues/new?template=feedback.yml";
const REPO_URL = "https://github.com/himanshu748/veilpledge";
const PROFILE_URL = "https://x.com/VeilPledge";

export function AppFooter() {
  return (
    <footer className="app-footer">
      <p className="app-footer__prompt">
        Used VeilPledge on Preprod?{" "}
        <a href={FEEDBACK_URL} rel="noreferrer noopener" target="_blank"> 
          Tell us what happened
        </a>
        .
      </p>

      <nav className="app-footer__links" aria-label="Project links">
        <a href="#/">VeilGate</a>
        <a href={REPO_URL} rel="noreferrer noopener" target="_blank">
          Source
        </a>
        <a href={PROFILE_URL} rel="noreferrer noopener" target="_blank">
          @VeilPledge
        </a>
      </nav>
    </footer>
  );
}
