// Runs synchronously before paint to avoid a flash of the wrong theme.
// Default is light: only opt into dark when localStorage.theme === "dark".
const THEME_SCRIPT = `
try {
  if (localStorage.theme === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
