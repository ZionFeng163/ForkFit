# Recipe image sources

## Public beta content

The default public beta dataset is generated from TheMealDB with
`scripts/build_themealdb_recipes.py`. Each imported recipe keeps the original
TheMealDB `idMeal` lookup URL in `source_url`, and the image URL is the
`strMealThumb` returned by that same meal record.

This is the required rule for imported content: **do not pair generated recipes
with unrelated stock photos**. If a recipe is imported from a third-party source,
the image must either come from the same source record or be manually verified
and attributed.

The previous `ForkFit curated public beta` batch used local Unsplash photos as a
visual pool and is deprecated because the images were not tied to exact recipe
records.

## Legacy local images

The demo recipe images in `apps/web/public/recipes` are local, resized copies
of photos published under the Unsplash License. The source pages are retained
here for provenance and future replacement work. These images should only be
used for hand-verified posts or legacy content, not for generated bulk imports.

| Local file | Source |
| --- | --- |
| `1459411552884-841db9b3cc2a.jpg` | https://images.unsplash.com/photo-1459411552884-841db9b3cc2a |
| `1495214783159-3503fd1b572d.jpg` | https://images.unsplash.com/photo-1495214783159-3503fd1b572d |
| `1498837167922-ddd27525d352.jpg` | https://images.unsplash.com/photo-1498837167922-ddd27525d352 |
| `1504674900247-0877df9cc836.jpg` | https://images.unsplash.com/photo-1504674900247-0877df9cc836 |
| `1512621776951-a57141f2eefd.jpg` | https://images.unsplash.com/photo-1512621776951-a57141f2eefd |
| `1525351484163-7529414344d8.jpg` | https://images.unsplash.com/photo-1525351484163-7529414344d8 |
| `1525755662778-989d0524087e.jpg` | https://images.unsplash.com/photo-1525755662778-989d0524087e |
| `1527477396000-e27163b481c2.jpg` | https://images.unsplash.com/photo-1527477396000-e27163b481c2 |
| `1529042410759-befb1204b468.jpg` | https://images.unsplash.com/photo-1529042410759-befb1204b468 |
| `1529692236671-f1f6cf9683ba.jpg` | https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba |
| `1544025162-d76694265947.jpg` | https://images.unsplash.com/photo-1544025162-d76694265947 |
| `1546069901-ba9599a7e63c.jpg` | https://images.unsplash.com/photo-1546069901-ba9599a7e63c |
| `1547592166-23ac45744acd.jpg` | https://images.unsplash.com/photo-1547592166-23ac45744acd |
| `1547592180-85f173990554.jpg` | https://images.unsplash.com/photo-1547592180-85f173990554 |
| `1565958011703-44f9829ba187.jpg` | https://images.unsplash.com/photo-1565958011703-44f9829ba187 |
| `1603133872878-684f208fb84b.jpg` | https://images.unsplash.com/photo-1603133872878-684f208fb84b |
| `1604908176997-125f25cc6f3d.jpg` | https://images.unsplash.com/photo-1604908176997-125f25cc6f3d |
| `chive-pancake.jpg` | https://unsplash.com/photos/_b7crTKUWJQ |
| `mapo-tofu.jpg` | https://unsplash.com/photos/hGeGkdSOkCg |
| `steamed-fish.jpg` | https://unsplash.com/photos/QbWQ7HCjzN4 |
