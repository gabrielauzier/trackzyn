/**
 * The desktop app's top bar, an admin's choice for everyone (`desktop_titlebar`):
 * - `contained`: a bar of the sidebar's colour with back and forward, the page in a card under it (the default);
 * - `thin`: a bar with the page's name, there only to drag the window;
 * - `search`: a bar with back and forward, the search and the eye and theme buttons;
 * - `integrated`: no bar; the sidebar's top and a strip over the page drag the window.
 */
export const DESKTOP_TITLEBARS = ['contained', 'thin', 'search', 'integrated'] as const
export type DesktopTitlebar = (typeof DESKTOP_TITLEBARS)[number]
export const DEFAULT_DESKTOP_TITLEBAR: DesktopTitlebar = 'contained'

export function toDesktopTitlebar(value: string | null | undefined): DesktopTitlebar {
  return (DESKTOP_TITLEBARS as readonly string[]).includes(value ?? '') ? (value as DesktopTitlebar) : DEFAULT_DESKTOP_TITLEBAR
}
