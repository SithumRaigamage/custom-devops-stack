"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_DARK,
  DEFAULT_THEME_NAME,
  THEMES,
  buildTheme,
  themeByName,
  type ThemeDef,
  type ThemeTokens,
} from "@/lib/themes";
import { THEME_STORAGE_KEY, THEME_STORAGE_VERSION } from "@/lib/theme-script";
import { fetchSettings, saveSettings } from "@/lib/api";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  /** Name of the active theme, e.g. "Midnight Teal". */
  theme: string;
  mode: ThemeMode;
  dark: boolean;
  /** Every token for the active theme and mode. */
  tokens: ThemeTokens;
  themes: ThemeDef[];
  setTheme: (name: string) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

interface StoredTheme {
  version: number;
  theme: string;
  mode: ThemeMode;
  tokens: ThemeTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Pick<StoredTheme, "theme" | "mode"> | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredTheme>;
    if (stored.version !== THEME_STORAGE_VERSION) return null;
    return {
      theme: typeof stored.theme === "string" ? stored.theme : DEFAULT_THEME_NAME,
      mode: stored.mode === "light" ? "light" : "dark",
    };
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeName] = useState(DEFAULT_THEME_NAME);
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_DARK ? "dark" : "light");
  const [hydrated, setHydrated] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);

  const tokens = useMemo(
    () => buildTheme(themeByName(theme), mode === "dark"),
    [theme, mode],
  );

  // The inline script already painted the localStorage choice for a fast first
  // paint; the server copy then becomes the source of truth once it arrives.
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setThemeName(themeByName(stored.theme).n);
      setModeState(stored.mode);
    }
    setHydrated(true);

    let cancelled = false;
    fetchSettings()
      .then((settings) => {
        if (cancelled) return;
        setThemeName(themeByName(settings.theme).n);
        setModeState(settings.mode);
      })
      .catch(() => {
        // Offline or unauthenticated: keep the localStorage choice.
      })
      .finally(() => {
        if (!cancelled) setServerLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Wait for the stored choice: the CSS defaults already match the default theme and
    // the inline script in the layout painted any saved theme, so touching the DOM
    // before localStorage has been read would flash the defaults.
    if (!hydrated) return;

    const root = document.documentElement;
    for (const [token, value] of Object.entries(tokens)) {
      root.style.setProperty(`--${token}`, value);
    }
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    root.style.colorScheme = mode;

    try {
      const stored: StoredTheme = { version: THEME_STORAGE_VERSION, theme, mode, tokens };
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Private mode or a full quota: theming still works for this session.
    }
  }, [tokens, theme, mode, hydrated]);

  // Persist theme and mode to the server after the first server read, so the
  // initial paint does not overwrite a stored preference.
  useEffect(() => {
    if (!hydrated || !serverLoaded) return;
    void saveSettings({ theme, mode }).catch(() => {
      // localStorage still keeps the choice for this browser.
    });
  }, [theme, mode, hydrated, serverLoaded]);

  const setTheme = useCallback((name: string) => setThemeName(themeByName(name).n), []);
  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggleMode = useCallback(
    () => setModeState((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      dark: mode === "dark",
      tokens,
      themes: THEMES,
      setTheme,
      setMode,
      toggleMode,
    }),
    [theme, mode, tokens, setTheme, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside a ThemeProvider");
  return context;
}
