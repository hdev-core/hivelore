"use client";

import { useId } from "react";
import { useTheme } from "@/components/theme-provider";

export function ThemeSwitcher() {
  const id = useId();
  const { preference, setPreference } = useTheme();

  return (
    <div className="theme-switcher">
      <label className="theme-switcher__label" htmlFor={id}>
        Theme
      </label>
      <select
        id={id}
        className="theme-switcher__select"
        value={preference}
        onChange={(event) =>
          setPreference(event.target.value as "system" | "light" | "dark")
        }
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
