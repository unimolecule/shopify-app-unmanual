import serverErrorImage from "@/assets/images/error.500.png";
import { ErrorLayout, type FeedbackScope } from "./layout";

interface ServerErrorProps {
  heading?: string;
  message?: string;
  scope?: FeedbackScope;
}

export function ServerError({
  heading = "Something went wrong",
  message = "The server could not complete the request.",
  scope = "page",
}: ServerErrorProps) {
  return (
    <ErrorLayout
      alt="Server error"
      heading={heading}
      image={serverErrorImage}
      message={message}
      scope={scope}
    />
  );
}
