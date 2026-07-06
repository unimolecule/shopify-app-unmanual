import notFoundImage from "@/assets/images/error.404.png";
import { ErrorLayout, type FeedbackScope } from "./layout";

interface NotFoundProps {
  heading?: string;
  message?: string;
  scope?: FeedbackScope;
}

export function NotFound({
  heading = "Page not found",
  message = "The page does not exist or has moved.",
  scope = "page",
}: NotFoundProps) {
  return (
    <ErrorLayout
      alt="Page not found"
      heading={heading}
      image={notFoundImage}
      message={message}
      scope={scope}
    />
  );
}
