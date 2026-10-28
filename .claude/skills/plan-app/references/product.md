# Product track: `PRODUCT.md` and `README.md`

The product track writes two files. `PRODUCT.md` is the full product doc: every journey, every "In Detail", the build plan. `README.md` is the short front door a person reads in a minute: what the app is, five lines on how it works, what is built and next, and links to the other docs (2–4 KB; the six existing apps' READMEs are the reference). Draft `PRODUCT.md` first, then derive the README from it, and keep both true together.

`PRODUCT.md` focuses on the user experience and vision, in this structure:

- **The short**: A 1-paragraph overview of the app's core value.
- **The story** (Optional): Context or origin of the idea.
- **How it Works**: A step-by-step user journey, kept at overview level — each step is one line conveying what happens, not how every branch of it resolves. When a step genuinely needs more explanation (e.g., what a share link does for each of several access states, or exact state-transition specifics), give that its own named sub-section below the numbered flow (e.g., `### Sharing & Access, In Detail`) rather than expanding the step inline. A reader should be able to read just the numbered list and understand the app; the sub-sections are for whoever wants the next layer of detail.
- **How it Feels**: Emotional/UX goals (e.g., "Zero Pressure", "Mobile-Centered").
- **The Build Plan**: Broken down into Core MVP, Next Steps, and Stretch Goals using markdown checkboxes (`- [ ]`, not bulleted prose dressed up as a list). List user-facing features only. Internal repo setup — app registration, branding assets, manifest/OG worker wiring, the store foundation — is implementation housekeeping, not product vision; it still becomes a real Phase 4 issue (see Important Notes below), but it doesn't need its own Build Plan line.

Keep a domain-appropriate section for what makes this app different from a generic version of the same idea, if that distinction actually changes what gets built (e.g., a cat-specific app vs. a generic pet app, because the seeded reference data and quick-tag vocabulary differ) — not just as scene-setting. Skip it if the app doesn't have this kind of distinguishing angle.

- **Under the Hood**: Tech stack summary. Now that Redux Toolkit is the established state-management pattern (see Phase 3), mention it here alongside Firestore/Storage rather than leaving state management unstated.

