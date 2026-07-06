import type { ReactNode } from "react";

type FeedbackScope = "inline" | "page";

interface ErrorLayoutProps {
  action?: ReactNode;
  alt: string;
  heading: string;
  image: string;
  message: string;
  scope?: FeedbackScope;
}

export function ErrorLayout({
  action = <s-link href="/">Go to app home</s-link>,
  alt,
  heading,
  image,
  message,
  scope = "page",
}: ErrorLayoutProps) {
  const content = (
    <s-section heading={scope === "inline" ? heading : undefined}>
      <s-stack alignItems="center">
        <s-box inlineSize="400px">
          <s-image
            src={image}
            alt={alt}
            aspectRatio="1/1"
            objectFit="contain"
            inlineSize="fill"
            loading="lazy"
          ></s-image>
        </s-box>
      </s-stack>
      <s-text color="subdued">{message}</s-text>
      {action}
    </s-section>
  );

  if (scope === "page") {
    return (
      <s-page heading={heading} inlineSize="base">
        {content}
      </s-page>
    );
  }

  return content;
}

export type { FeedbackScope };
