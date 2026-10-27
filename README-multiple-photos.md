# SJH Portfolio — multiple photo attachments + image layout fix

## Included updates
- Full replacement files: `app.js`, `styles.css`, `functions/api/admin.js`.
- SQL migration for the live project: `supabase/multiple-photo-attachments-migration.sql`.
- Updated full `supabase/schema.sql` for new project setup.

## Features
- Each portfolio or research record supports up to 10 images. Supported formats: PNG/JPG/WebP/GIF; maximum 5 MB each.
- In the create/edit popup, each photo has an × remove button. In edit mode, existing photos can be removed and new photos added before saving. Saving removes the corresponding record references and attempts to delete removed files from Storage.
- Legacy `photo_url` is preserved for compatibility. New `photo_urls` JSONB stores the full array.
- The home page thumbnail and archive gallery are constrained to their cards, fixing the oversized screenshot/image spilling over the “최근 포트폴리오” card.

## Apply to the existing live site
1. Open Supabase SQL Editor and run the entire `supabase/multiple-photo-attachments-migration.sql` file. The migration adds `photo_urls` and copies existing `photo_url` values into it without deleting records.
2. In your Codespace, replace `app.js`, `styles.css`, and `functions/api/admin.js` with the matching full files in this ZIP. You can also replace `supabase/schema.sql` so fresh setups include the same schema.
3. Run `node --check app.js` and `node --check functions/api/admin.js` if you want to verify syntax.
4. Commit/push from your Codespace to deploy through Cloudflare Pages.

**No GitHub commit or deployment was performed for this update.**
