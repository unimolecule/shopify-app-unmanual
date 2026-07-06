export function EmbeddedFooter() {
  return (
    <s-stack alignItems="center" paddingBlock="large">
      <s-text color="subdued">
        Power by{" "}
        <s-link href="https://help.shopify.com" target="_blank">
          {globalThis.__PUBLIC_ENV__?.APP_NAME}
        </s-link>
        .
      </s-text>
    </s-stack>
  );
}
