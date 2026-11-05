# Seafood photo recognition — setup and release gates

## What is implemented
- The traceability scanner accepts a separate seafood photo (JPEG, PNG or WEBP).
- The browser resizes the image to a maximum 1280 px edge and JPEG quality 82 before sending it.
- The authenticated Supabase Edge Function checks the user session and permits only fisher and restaurant profiles.
- The image is sent to the OpenAI Responses API for visual analysis. The function requests up to three candidate species with French and English names, scientific name, group, confidence band and visual notes.
- The app does not upload the photo to Supabase Storage or write it to the traceability tables.
- The user must explicitly select a candidate before it is copied into the species field used by the existing traceability form.
- The QR scanner flow and its existing append-only traceability records remain separate.

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
- No end-to-end photo tests or GitHub Actions results have been observed for this commit.
- Add per-user usage quotas/rate limiting before enabling paid API access for all users.
