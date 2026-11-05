# Seafood photo recognition — setup and release gates

## What is implemented
- The traceability scanner accepts a separate seafood photo (JPEG, PNG or WEBP).
- The browser resizes the image to a maximum 1280 px edge and JPEG quality 82 before sending it.
- The authenticated Supabase Edge Function checks the user session and permits only fisher and restaurant profiles.
- The image is sent to the OpenAI Responses API for visual analysis. The function requests up to three candidate species with French and English names, scientific name, group, confidence band and visual notes.
- The app does not upload the photo to Supabase Storage or write it to the traceability tables.
- The user must explicitly select a candidate before it is copied into the species field used by the existing traceability form.
- The QR scanner flow and its existing append-only traceability records remain separate.

## Usage protection
A private quota migration and server-side RPC have been added to the feature branch:
- Maximum 3 recognition requests per user in any rolling 10-minute window.
- Maximum 10 recognition requests per user in any rolling 24-hour window.
- Requests are serialized per user to prevent simultaneous calls from bypassing the limits.
- The Edge Function fails closed if the quota service is unavailable and returns HTTP 429 with a Retry-After value when the limit is reached.
- Only usage timestamps and user IDs are recorded; no image or recognition content is stored in the quota table.

These limits are initial safeguards, not a financial guarantee. They must be reviewed against expected usage and tested before release.

## Required secret
The Edge Function is intentionally not usable until an administrator configures `OPENAI_API_KEY` as a Supabase Edge Function secret. Do not put the key in frontend code, GitHub, SQL, chat, or the repository.

Configure it in Supabase Dashboard → Project Settings → Edge Functions → Secrets, or through the Supabase CLI:
```sh
supabase secrets set OPENAI_API_KEY=...
```

Optional model override:
```sh
supabase secrets set OPENAI_VISION_MODEL=gpt-5.4-mini
```

The default model is `gpt-5.4-mini`. Calls to the OpenAI API are separately billed according to the account's API pricing and are not included in a ChatGPT subscription. Do not enable the secret or deploy the function until the owner approves the provider and spending.

## Cost estimate — not a quote
The browser caps the longest image edge at 1280 px. A square 1280 × 1280 image would require about 1,600 32px patches; at the model's 1.2 image-token multiplier this is about 1,920 image input tokens. At the published $0.75 / million input tokens, that image component is approximately $0.00144. The current response cap is 700 output tokens; at $4.50 / million output tokens that is at most approximately $0.00315 if all 700 tokens are billed as output. Prompt text adds a small variable input cost. A conservative planning estimate is therefore about $0.005 per image, not a guaranteed maximum or fixed price. Actual usage must be checked from API usage records after a controlled test.

## Free / lower-cost alternatives
1. **No AI cost:** retain QR scanning and add a searchable, curated Jersey seafood species catalogue with manual confirmation. This is the most predictable, reliable no-provider-cost fallback, but it does not identify a species from a photograph.
2. **On-device open-source model:** potentially avoids per-image API charges, but requires model hosting/download, app/device compute, and validation. No suitable model covering Jersey fish, crustaceans and molluscs has yet been verified. Accuracy must be tested on real market photos before recommending it.
3. **Hosted third-party free tiers:** not treated as reliably free or production-safe until current quotas, image handling, privacy terms, service continuity and commercial-use rights are verified.

## Safety and limitations
- Visual species suggestions are advisory, not authoritative identification.
- A human must confirm the species before traceability data is saved.
- The image cannot establish freshness, origin, catch method, legality, food safety, size, weight or certification.
- Low-confidence or ambiguous images should be rejected or checked by a qualified person.
- The function requires a valid Supabase JWT and an approved fisher or restaurant profile.
- Request size is limited; the browser compresses photos before submission.
- `store: false` is set on the Responses API request. The image is still transmitted to the configured AI provider for processing; review the provider's current data controls and terms before enabling this feature.

## Not yet release-validated
- No Supabase secret has been configured.
- The Edge Function has not been deployed.
- No production database migration has been applied for this feature.
- The quota migration and pgTAP tests have been added to the feature branch but have not yet been run in CI or on an isolated database.
- No end-to-end photo tests or successful GitHub Actions results have been observed for the latest commit.
