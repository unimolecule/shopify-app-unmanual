import offlineImage from "@/assets/images/error.net-work.png?inline";
import { ErrorLayout, type FeedbackScope } from "./layout";

interface OfflineProps {
  heading?: string;
  message?: string;
  scope?: FeedbackScope;
}

export function Offline({
  heading = "Connection unavailable",
  message = "Check your connection and try again.",
  scope = "page",
}: OfflineProps) {
  return (
    <ErrorLayout
      alt="Connection unavailable"
      heading={heading}
      image={offlineImage}
      message={message}
      scope={scope}
    />
  );
}
