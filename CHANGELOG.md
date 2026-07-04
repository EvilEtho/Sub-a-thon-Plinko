# Changelog

## 1.0.1

### New
- **Configurable landing slots** — choose how many slots the board has and each one's width %. Click a slot's number to make it the ★ super slot; click it again to clear it.
- **OBS WebSocket integration** (Connect → Integrations → OBS) — connect to OBS to:
  - **Scene-aware board fade**: pick which scenes fade the board when idle; every other scene keeps it always shown.
  - **Danger zone** (optional): auto-end your OBS stream when the subathon timer hits 0, after a delay you set.
- **Prize slots overhauled** — pick a specific prize or **🎲 Random** from a dropdown, and set how many of each prize can be given out (stock).
- **Saveable theme presets** — save your current board + overlay colors as a named preset alongside the built-ins.
- **Live overlay preview** in the designer, plus editable Subathon-timer overlay colors and size.
- **Board fade controls** — toggle idle-fade on/off right from the Live tab, set how faded it gets (down to fully hidden), and it now shows just before a ball drops and lingers a moment after.
- **Custom test events** — send an exact number of bits / $ / gifted subs from the Live tab.
- **Undo / redo** in the board designer (Ctrl+Z / Ctrl+Y).
- **Refresh all overlays** button, and an optional "hide overlays when the app is closed."

### Improved
- Designer: clicking a setting now only changes the control you click (no more accidental color-picker / checkbox triggers when clicking a row).
- Designer: mirror-mode preview shows the correct mirrored angle; slot dividers and the ball-spawn zone are drawn, with an "are you sure?" warning (and don't-ask-again) if you place a peg in either; +/− time keeps its value when you flip it.
- Importing a premade board no longer changes your gameplay or super-gate settings.
- Timer modes now explain what they do to your slots.
- Board overlay clock removed — use the Subathon timer and/or Goals bar overlays for the time.
- Subathon timer overlay: the mode label sits neatly under the clock.
- Balls that escape the board are respawned at the top instead of being lost.

### Fixed
- A startup crash in the OBS integration that could prevent the app window from opening.
- Saves that hit an invalid value now show a clear message (which field and why) instead of silently doing nothing.
- A corrupt settings or layouts file no longer bricks the app — it backs up the bad file and recovers automatically.
- Editing the board while a ball is mid-drop no longer mis-credits that in-flight ball.

## 1.0.0
- Initial release.
