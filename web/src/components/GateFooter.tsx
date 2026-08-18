const FEEDBACK_URL =
  "https://github.com/himanshu748/veilpledge/issues/new?template=feedback.yml";
const REPO_URL = "https://github.com/himanshu748/veilpledge";
const PLEDGE_URL = "#/veilpledge";

export function GateFooter() {
  return (
    <footer className="app-footer">
      <p className="app-footer__prompt">
        Used VeilGate on Preprod?{" "}
        <a href={FEEDBACK_URL} rel="noreferrer noopener" target="_blank">
          Tell us what happened
        </a>
        .
      </p>

      <nav className="app-footer__links" aria-label="Project links">
        <a href={REPO_URL} rel="noreferrer noopener" target="_blank">
          Source
        </a>
        <a href={PLEDGE_URL}>VeilPledge</a>
      </nav>
    </footer>
  );
}
