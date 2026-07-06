import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Button as GeneratedButton,
  buttonVariants as generatedButtonVariants,
} from "../src/components/ui/button";
import { cn } from "../src/utils/cn";
import type { ComponentType, ReactNode } from "react";

type ButtonVariant =
  "default" | "destructive" | "ghost" | "link" | "outline" | "secondary";
type ButtonSize = "default" | "icon" | "lg" | "sm";

interface TestButtonProps {
  asChild?: boolean;
  children?: ReactNode;
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const Button = GeneratedButton as ComponentType<TestButtonProps>;
const buttonVariants = generatedButtonVariants as (options?: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) => string;

describe("cn", () => {
  it("merges conditional classes and resolves Tailwind conflicts", () => {
    const isHidden = false;

    expect(cn("px-2", isHidden && "hidden", ["px-4", "text-sm"])).toBe(
      "px-4 text-sm",
    );
  });
});

describe("Button", () => {
  it("renders a default button", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.dataset.slot).toBe("button");
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("h-9");
  });

  it("renders variant, size, and custom class values", () => {
    render(
      <Button variant="destructive" size="lg" className="extra-class">
        Delete
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("bg-destructive");
    expect(button.className).toContain("h-10");
    expect(button.className).toContain("extra-class");
  });

  it("renders through Slot when asChild is true", () => {
    render(
      <Button asChild variant="link">
        <a href="/docs">Docs</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("href")).toBe("/docs");
    expect(link.dataset.slot).toBe("button");
    expect(link.className).toContain("text-primary");
  });

  it("exposes button variant classes", () => {
    expect(buttonVariants({ variant: "outline", size: "icon" })).toContain(
      "size-9",
    );
  });
});
