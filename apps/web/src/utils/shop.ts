export function readCurrentShop() {
  if (globalThis.location === undefined) {
    return "unknown-shop";
  }

  return (
    new URLSearchParams(globalThis.location.search).get("shop") ||
    "unknown-shop"
  );
}
