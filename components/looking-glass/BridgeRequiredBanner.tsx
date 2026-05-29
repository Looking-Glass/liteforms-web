type BridgeRequiredBannerProps = {
  onDismiss: () => void;
};

export function BridgeRequiredBanner({ onDismiss }: BridgeRequiredBannerProps) {
  return (
    <section className="bridge-banner" role="region" aria-label="Looking Glass Bridge">
      <p>Using Liteforms with a Looking Glass Go requires a Bridge driver.</p>
      <div className="bridge-banner-actions">
        <a className="button-link btn-ghost" href="https://look.glass/bridge" target="_blank" rel="noreferrer">
          Download Bridge
        </a>
        <a
          className="button-link btn-ghost"
          href="https://checkout.lookingglassfactory.com/products/looking-glass-go"
          target="_blank"
          rel="noreferrer"
        >
          Buy a Go
        </a>
        <button type="button" className="btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
