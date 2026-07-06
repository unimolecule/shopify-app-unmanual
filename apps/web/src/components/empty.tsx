import EmptyImage from "@/assets/images/error.no-data.png";

type FeedbackScope = "inline" | "page";

interface EmptyDisplayProps {
  heading?: string;
  message?: string;
  scope?: FeedbackScope;
}

type EmptyProps = EmptyDisplayProps & Record<string, unknown>;

export function Empty({
  heading = "Page empty",
  message = "Oops! Page empty.",
  scope = "page",
}: EmptyProps) {
  const content = (
    <s-section heading={scope === "inline" ? heading : undefined}>
      <s-stack alignItems="center">
        <s-box inlineSize="400px">
          <s-image
            src={EmptyImage}
            alt="Page empty"
            aspectRatio="1/1"
            objectFit="contain"
            inlineSize="fill"
            loading="lazy"
          ></s-image>
        </s-box>
      </s-stack>
      <s-text color="subdued">{message}</s-text>
      <s-link href="/">Go to app home</s-link>
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
