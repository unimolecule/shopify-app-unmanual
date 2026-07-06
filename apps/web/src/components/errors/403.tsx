import forbiddenImage from "@/assets/images/error.403.png";
import { ErrorLayout, type FeedbackScope } from "./layout";

interface ForbiddenProps {
  heading?: string;
  message?: string;
  scope?: FeedbackScope;
}

export function Forbidden({
  heading = "Access denied",
  message = "Your account does not have access to this page.",
  scope = "page",
}: ForbiddenProps) {
  return (
    <ErrorLayout
      alt="Access denied"
      heading={heading}
      image={forbiddenImage}
      message={message}
      scope={scope}
    />
  );
}
