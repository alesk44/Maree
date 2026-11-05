# Fishial V2 — free-tier proof of concept

## Scope and current state
- A separate Supabase Edge Function, `identify-fishial`, is being prepared as an isolated provider adapter.
- It does not replace the existing `identify-seafood` function or change the traceability UI.
- It accepts the existing authenticated JSON envelope (`imageBase64`, `mimeType`) and forwards raw image bytes to Fishial V2.
- It returns Fishial's native objects and species definitions. It deliberately does not invent French translations or map provider confidence to an application confidence label.
- A human confirmation step and a curated bilingual Jersey seafood catalogue are required before UI integration.
- No photo is written to Marée storage or traceability tables by this function.

## Provider flow
1. The Edge Function validates the Supabase JWT and checks that the profile role is `fisher` or `restaurant`.
2. It consumes the existing per-user quota RPC (3 calls / rolling 10 minutes; 10 calls / rolling 24 hours).
3. It obtains a short-lived Fishial V2 bearer token using server-only credentials.
4. It sends the decoded image bytes to `POST https://api-recognition.fishial.ai/v2/recognize`.
5. It returns up to 10 detected objects, the species definitions and the provider query token.

Fishial V2 docs: https://docs.fishial.ai/api/api_reference
Getting started: https://docs.fishial.ai/api/getting_started
Developer API FAQ: https://docs.fishial.ai/faqs/developers%20api

## Secrets — owner reports configured; function not deployed
The owner reports that `FISHIAL_CLIENT_ID` and `FISHIAL_CLIENT_SECRET` have been added in the Supabase Dashboard. Their values have not been read back or exposed.

The Fishial Edge Function is still **not deployed**, so these credentials are not currently used by this adapter. Do not copy them into frontend code, GitHub, SQL, logs, or chat. Do not deploy this function to the active production project as part of the test setup. Do not add paid credentials or enable a paid plan without explicit owner approval. The Fishial FAQ currently says the Developers API is free; the portal still requires an active subscription selection and offers a free plan for testing. Free-plan request limits and long-term commercial terms have not been independently confirmed.

## Cost controls
- Existing application quota is applied before contacting Fishial.
- Browser-side image resize remains capped at 1280 px and 4 MB.
- The server rejects images over 4 MB for this initial proof of concept.
- No automatic retries are performed.
- No feedback submission, image collection upload, GPS metadata or portal collection headers are sent.
- Important: Fishial's API tutorial states that an image is also added to a Portal collection if the API key has an upload folder configured. Before any real photo test, verify in the Fishial portal that no upload folder is attached to the API key; otherwise do not use customer/fisher photos until the retention, access and deletion terms are confirmed.
- No provider call is possible through this adapter until the function is deliberately deployed to an isolated test backend. The configured project has not been used to deploy this function.

## Known gaps / release gates
- Fishial V2 provides English common names and scientific names; it does not provide French common names in the documented recognition response.
- The app needs a curated species mapping for Jersey fish and a separate manual catalogue for crustaceans and molluscs.
- The API's species coverage and recognition quality on local Jersey catch photographs must be field-tested.
- The existing quota migration must be applied in an isolated database and its pgTAP tests must pass before deployment.
- The API plan's exact free-tier limits, image retention/data processing terms, and commercial-use terms must be confirmed in the portal/provider terms.
- The current UI remains connected to the existing provider. No UI cutover, deployment, migration, merge or production secret change is part of this proof of concept.

## Safety
Recognition is advisory. A fisher must confirm species manually. An image cannot prove catch location, freshness, legality, fishing method, food safety, weight, size or certification.
