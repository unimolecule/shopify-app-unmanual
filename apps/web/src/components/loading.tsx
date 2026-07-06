type FeedbackScope = "inline" | "page";

interface LoadingProps {
  heading?: string;
  message?: string;
  scope?: FeedbackScope;
}

export function Loading({
  heading = "Loading",
  message = "Please wait while the content loads.",
  scope = "inline",
}: LoadingProps) {
  const content = (
    <s-section heading={scope === "inline" ? heading : undefined}>
      <s-spinner accessibilityLabel={message} size="large"></s-spinner>
      <s-text color="subdued">{message}</s-text>
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
