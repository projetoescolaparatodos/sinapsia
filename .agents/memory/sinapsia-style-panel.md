---
name: Sinapsia tldraw style panel positioning
description: How to prevent tldraw's color picker panel from overlapping custom overlay buttons
---

**Rule:** The tldraw floating style panel (color/size picker shown when draw tool selected) renders via class `.tlui-style-panel__wrapper` at the top-right of the canvas, overlapping fixed custom overlay buttons.

**Why:** tldraw's UI elements position within the canvas container at top-right, conflicting with our fixed portal overlay at the same position.

**How to apply:** Add CSS override `.tlui-style-panel__wrapper { margin-top: 48px !important; }` in index.css to push it below the button row.
