/**
 * Builds an RFC 5987 attachment Content-Disposition header value.
 */
export function getAttachmentDisposition(filename: string): string {
  return `attachment; filename*=UTF-8''${encodeRFC5987Value(filename)}`;
}

/**
 * Encodes a value for RFC 5987 HTTP header parameters.
 */
export function encodeRFC5987Value(value: string): string {
  return encodeURIComponent(value).replaceAll(/['()*]/g, (char) => {
    const codePoint = char.codePointAt(0);
    return codePoint === undefined
      ? ""
      : `%${codePoint.toString(16).toUpperCase()}`;
  });
}
