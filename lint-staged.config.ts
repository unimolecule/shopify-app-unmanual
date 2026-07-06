const ignoredFiles = new Set();

function createTasks(commands: string[]) {
  return (files: string[]) => {
    const targets = files.filter((file) => !isIgnoredFile(file));

    if (targets.length === 0) {
      return [];
    }

    const args = targets.map((file) => JSON.stringify(file)).join(" ");

    return commands.map((command) => `${command} ${args}`);
  };
}

function isIgnoredFile(file: string) {
  const normalized = file.replaceAll("\\", "/");

  return (
    ignoredFiles.has(normalized) ||
    Array.from(ignoredFiles, (ignoredFile) =>
      normalized.endsWith(`/${ignoredFile}`),
    ).some(Boolean)
  );
}

export default {
  "*.{js,jsx,ts,tsx,mjs,cjs}": createTasks([
    "eslint --fix --max-warnings=0 --report-unused-disable-directives --no-warn-ignored",
    "prettier --write --ignore-unknown",
  ]),
  "*.{css,less,scss,sass,styl}": createTasks([
    "stylelint --fix --allow-empty-input",
    "prettier --write --ignore-unknown",
  ]),
  "*": createTasks(["prettier --write --ignore-unknown"]),
};
