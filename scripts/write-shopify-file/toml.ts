import { serializeValue } from "../utils";

export function formatTomlString(value: string) {
  return serializeValue(value);
}

export function replaceOrInsertTopLevelValue(
  toml: string,
  key: string,
  value: string,
) {
  const pattern = new RegExp(String.raw`^${escapeRegExp(key)}\s*=.*$`, "m");
  const line = `${key} = ${value}`;

  if (pattern.test(toml)) {
    return toml.replace(pattern, line);
  }

  const firstSectionIndex = toml.search(/^\[/m);

  if (firstSectionIndex === -1) {
    return `${trimTrailingNewlines(toml)}\n${line}\n`;
  }

  const beforeSection = trimTrailingNewlines(toml.slice(0, firstSectionIndex));
  const sectionAndAfter = toml.slice(firstSectionIndex);

  return `${beforeSection}\n${line}\n\n${sectionAndAfter}`;
}

export function replaceOrInsertSectionValue(
  toml: string,
  section: string,
  key: string,
  value: string,
) {
  const sectionHeader = `[${section}]`;
  const entryPattern = new RegExp(
    String.raw`^${escapeRegExp(key)}\s*=\s*(?:\[[\s\S]*?^\]|.*$)`,
    "m",
  );
  const line = `${key} = ${value}`;
  const sectionStart = findSectionStart(toml, sectionHeader);

  if (sectionStart === -1) {
    return `${trimTrailingNewlines(toml)}\n\n[${section}]\n${line}\n`;
  }

  const bodyStart = sectionStart + sectionHeader.length + 1;
  const sectionEnd = findNextSectionStart(toml, bodyStart);
  const beforeSectionBody = toml.slice(0, bodyStart);
  const sectionBody = toml.slice(bodyStart, sectionEnd);
  const afterSection = toml.slice(sectionEnd);
  const updatedBody = entryPattern.test(sectionBody)
    ? sectionBody.replace(entryPattern, line)
    : `${trimTrailingNewlines(sectionBody)}\n${line}\n`;

  return `${beforeSectionBody}${updatedBody}${afterSection}`;
}

export function replaceSectionArray(
  toml: string,
  section: string,
  key: string,
  values: readonly string[],
) {
  const lines = ["[", ...values.map(formatArrayValueLine), "]"];

  return replaceOrInsertSectionValue(toml, section, key, lines.join("\n"));
}

function formatArrayValueLine(
  value: string,
  index: number,
  values: readonly string[],
) {
  const suffix = index === values.length - 1 ? "" : ",";

  return `  ${formatTomlString(value)}${suffix}`;
}

function trimTrailingNewlines(value: string) {
  return value.replace(/\n*$/, "");
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function findSectionStart(toml: string, sectionHeader: string) {
  const pattern = new RegExp(
    String.raw`^${escapeRegExp(sectionHeader)}\s*$`,
    "m",
  );
  const match = pattern.exec(toml);

  return match?.index ?? -1;
}

function findNextSectionStart(toml: string, fromIndex: number) {
  const match = /^\[/m.exec(toml.slice(fromIndex));

  if (!match) {
    return toml.length;
  }

  return fromIndex + match.index;
}
