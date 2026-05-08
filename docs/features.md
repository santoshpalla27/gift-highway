Step 1 — Connect your domain to the R2 bucket

Go to Cloudflare Dashboard → R2 → your bucket
Click Settings → Custom Domains → Connect Domain
Enter a subdomain like assets.gifthighway.com
Cloudflare auto-creates the DNS record and enables the CDN in front of R2
That's it — all requests to assets.gifthighway.com/... now go through Cloudflare's cache. Update R2_PUBLIC_URL in your .env to this domain.

Step 2 — Set cache headers (so Cloudflare actually caches)

By default Cloudflare may not cache unless you tell it to. Two options:

Option A — Cloudflare Cache Rule (recommended, no code)

Cloudflare Dashboard → your domain → Caching → Cache Rules → Create rule
Condition: Hostname equals assets.gifthighway.com
Set: Cache eligibility → Eligible for cache
Set: Edge TTL → 1 year (for images that don't change)
Option B — Set headers when uploading to R2
When uploading images to R2, include Cache-Control: public, max-age=31536000. If you're using rclone or the R2 SDK to upload, you can pass this as metadata.

Step 3 — Mobile (expo-image disk cache)

Just swap <Image> from react-native with <Image> from expo-image:

import { Image } from 'expo-image'
// contentFit and cachePolicy are the main props
<Image source={{ uri: url }} cachePolicy="disk" />
expo-image is already included in Expo SDK — no extra install needed.

Verify it's working

Open browser DevTools → Network tab → click an image request. Look for:

cf-cache-status: HIT → served from Cloudflare cache (no R2 call)
cf-cache-status: MISS → first load, fetched from R2 and now cached
After the first load every subsequent request should show HIT.
