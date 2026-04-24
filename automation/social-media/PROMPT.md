# Ralph Loop — Structured State Prompt

## Self-Referential Protocol

**BEFORE doing any work**, read `.claude/loop-state.md` for context from your previous iterations.

**AFTER completing work in this iteration**, update `.claude/loop-state.md` with:
1. Increment the iteration number
2. Update status: `IN_PROGRESS`, `BLOCKED`, or `COMPLETE`
3. Move successful items to "What worked"
4. Log failures with WHY they failed in "What failed"
5. Record any decisions and their reasoning in "Decisions made"
6. Write concrete next steps for the next iteration

## Rules
- Never repeat an approach that already failed (check "What failed")
- Build on what worked (check "What worked")
- If blocked 3+ iterations on the same issue, change strategy entirely
- If status is COMPLETE and all acceptance criteria are met, output: <promise>TASK COMPLETE</promise>

## Acceptance Criteria
- [ ] Single-page site with smooth scroll-triggered animations (fade-in, parallax, scale)
- [ ] Apple-style hero section with large typography and product reveal animation
- [ ] Minimal, premium aesthetic — whitespace-heavy, clean sans-serif fonts
- [ ] At least 5 sections: Hero, Product Showcase, Features, Philosophy, CTA
- [ ] Responsive (mobile + desktop)
- [ ] All animations performant (no jank, uses CSS transforms/opacity only)
- [ ] AXKAN branding applied (colors, logo, voice) — NOT a copy of Apple, inspired by their craft
- [ ] Site runs correctly when opened in browser (index.html)
- [ ] Visual polish — feels like a real premium brand site, not a template

## Task
Create a premium, Apple-aesthetic animated website for AXKAN. Think apple.com level craft — scroll-triggered animations, cinematic hero sections, large bold typography, generous whitespace, and smooth transitions.

Use the /axkan skill or AXKAN brand files to get the real brand identity (colors, philosophy, voice). The site should FEEL like Apple's design quality but BE authentically AXKAN.

Tech stack: vanilla HTML/CSS/JS (single index.html is fine) or lightweight framework. No heavy dependencies. Animations via CSS + Intersection Observer or minimal JS.

Sections:
1. **Hero** — Full-viewport cinematic intro with AXKAN tagline + animated reveal
2. **Product Showcase** — Scroll-triggered product/service presentation with parallax
3. **Features** — Icon/card grid that fades in on scroll
4. **Philosophy** — AXKAN's story/values with text animation
5. **CTA** — Final call to action with smooth entrance

Make it world-class. Each iteration, open the site, identify what looks cheap or broken, and fix it.
