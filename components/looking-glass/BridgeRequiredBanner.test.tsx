// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BridgeRequiredBanner } from "./BridgeRequiredBanner";

afterEach(cleanup);

describe("BridgeRequiredBanner", () => {
  it("shows Bridge guidance with download, purchase, and dismiss actions", () => {
    const onDismiss = vi.fn();

    render(<BridgeRequiredBanner onDismiss={onDismiss} />);

    expect(screen.getByText("Using Liteforms with a Looking Glass Go requires Bridge.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Bridge" })).toHaveAttribute(
      "href",
      "https://look.glass/bridge"
    );
    expect(screen.getByRole("link", { name: "Buy a Go" })).toHaveAttribute(
      "href",
      "https://checkout.lookingglassfactory.com/products/looking-glass-go"
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
