# Contract: Announcement Rendering

## Scope

Defines the expected behavior of the announcement slider renderer after the performance fix.

## Inputs

- Announcement with `sliderEnabled`.
- Ordered active slides.
- Optional autoplay flag.
- Optional slide interval.
- Optional title, description, link, alt text, and image fit.

## Required Behavior

- Render one visible slide card at a time.
- Keep the visible card shell stable across slide changes.
- Preserve manual next and previous controls when there is more than one slide.
- Preserve autoplay when enabled and there is more than one slide.
- Pause autoplay on hover/focus and resume when the user leaves/blur.
- Preload only adjacent unique slide images.
- Avoid visible stacked cards, image blur layers, blend-mode layers, and broad transition-all behavior.
- If a slide has a link, the link behavior must be available without changing the visible card root between slide changes.

## Error And Empty States

- No active slides: do not render the slider.
- One active slide: render the image without carousel timer and without navigation controls.
- Invalid slide image URL: skip that slide using existing image resolution behavior.

## Verification

- Check DOM or snapshot for a single visible slide image in the card area.
- Check next/previous with two and three slides.
- Check autoplay with at least three slides.
- Check admin preview and live dashboard render the same shape.
