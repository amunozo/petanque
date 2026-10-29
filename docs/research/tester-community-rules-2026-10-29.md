## How I accessed Reddit
`old.reddit.com` and `www.reddit.com` both return **403 "blocked by network security"** for me (also `about/rules.json`). I verified rules via Wayback captures of the exact `/about/rules/` pages plus Redlib mirrors. Dates below are snapshot dates.

---

**1. r/AndroidClosedTesting** — rules page (arch. 24 Aug 2026) `web.archive.org/web/20260824183621/https://old.reddit.com/r/AndroidClosedTesting/about/rules/`
- No title format, flair, tag, frequency or ratio rule is documented. Practice is free-form: `[[Test4Test] …]`, `[[Test exchange] …]`, `[Closed Testing] …`, "Need 12 testers for 14 days" (seen on the sub listing, `https://redlib.catsarch.com/r/AndroidClosedTesting`). Enforced? **UNCERTAIN**.
- Direct links: Play testing link + Google Group link are the norm — yes, allowed.
- Documented rules: 1 "Violation" (vague ban rule), 2 "Sharing other subreddit link is prohibited… Attempts to bypass this rule—such as using altered names, coded references, or hints meant to lead users to another subreddit—are also not allowed." 3 hate speech. Capture is truncated mid-rule-3 → **rules 4+ UNKNOWN**.
- Reciprocity: de-facto expected ("I'll test yours back, comment with your link") but not a rule.
- Megathread: none. Wiki: "Wiki not found" (`https://redlib.catsarch.com/r/AndroidClosedTesting/wiki/`).

**2. r/TestersCommunity** — (arch. 24 Aug 2026)
- Flair required: "Testers Needed: For new app requests. Mention app name, store link, and what type of feedback you want." Also "Daily Update".
- Rule 1: "Leave clear, specific feedback… Dont post vague comments like 'Tested' or 'Nice app.'" Rule 2: "When you comment on an app post, attach a screenshot showing the app installed or in use." Rule 4: "No affiliate links No paid promotion No tools or services".
- Direct links: yes (group + Play links standard). No ratio rule.
- Reciprocity: yes, enforced socially — commenters post screenshot proof; "Pack of Wolves" credit system (16 devs × 16 days, "Missing tasks → strike + 30 credit penalty", 3 strikes = removed) `https://redlib.catsarch.com/r/TestersCommunity/comments/1sgmuqs/`. Their Google Group must be added in Play Console per mod reply.

**3. r/playmygame** — (arch. 1 Aug 2026)
- Flair format `[Mobile] (Android)`; body template (quoted by a user): "Game Title / Playable Link (Direct link to the game) / Platform / Description (minimum 100 words) / Free to Play Status / Involvement".
- Rule 1: "ensure that our community is able to play it for free NOW (not 'soon')". Rule 3: "You must provide a direct link to your game". Rule 6: "Please wait for 1 month before reposting your game." Rule 4: "We do not allow full-AI-generated games here and all games should have low to no Generative AI". Rule 7: NDA games banned. Rule 9: paid games → `[TRAILER TUESDAY]`.
- No reciprocity rule; no megathread. Community warning post: new accounts get shadow-filtered, "we suspect around 100 Post and 100 Comment Karma" (`https://redlib.catsarch.com/r/playmygame/comments/1j80ve7/`).

**4. r/IndieGaming** — (arch. 24 Jul 2026)
- "Users may only make 1 submission every 2 weeks"; "When promoting a game or sharing development progress, please make only one submission every two weeks." Account "at least 1 week old".
- Bad content includes "Store pages", "Mobile links/link shorteners/Direct Downloads", GenAI (must declare). → A Play Store closed-test post is effectively out of scope; no dedicated test-request provision. No flair rule; no megathread.

**5. r/AndroidGaming** — (arch. 9 Aug 2026)
- Rule 7: "Self-promotion is allowed for active r/AndroidGaming members only… account that is at least a month old with 50 community karma… limited to one post every 30 days and must not exceed 10% of a user's overall Reddit activity… must include [DEV] at the beginning of the post title".
- Rule 4: "you must include the official game title and Google Play Store link whenever possible… This requirement also applies to [DEV] posts."
- No closed-test rule, no reciprocity, no megathread.

**6. r/gamedev** — (arch. 1 Aug 2026)
- Rule 3: "Regardless of its development stage, this subreddit isn't the place to showcase your project or artwork. Instead, consider sharing in communities like r/indiegames, r/playmygame, or r/gamedevscreens."
- Rule 4: "This community is not for self-promotion. However, links are allowed if they serve a valid purpose, such as seeking feedback…"
- Feedback Friday: **not currently active** — last numbered thread found is #547 (Feb 2025); a mod post (Sep 2026) says "looking high-level at potentially re-introducing some weekly threads… Troubleshooting Tuesday, Feedback Friday, Screenshot Saturday". Whether it returned: **UNCERTAIN**.

**7. r/IndieDev** — (arch. 28 Jul 2026)
- Single rule: "Capsule Comparison Posts are banned by popular demand, except on Wednesdays." Sidebar: "there are no strict rules here, use common sense"; "GIFs and images are the community-preferred medium". No ratio, no flair, no megathread.

**8. r/googleplaydeveloper** — (arch. 17 Aug 2026)
- Rule 3: "Tester requests are allowed only in designated weekly or monthly threads. State the app category, test type, requirements, activity, feedback method, duration, and your relationship to the app… No payment, paid tester services, compensation, reviews, ratings, installs, votes, incentives…"
- The designated thread exists: "🧪 Weekly Tester Discovery Thread | Find Testers & Help Fellow Developers" (AutoModerator, flair "Testing & Quality"), asking for "What the app does / Android version or device requirements / internal, closed, or open testing / What kind of testing or feedback you need / How interested testers can participate", and "Do not engage in paid testing, paid reviews, ratings, votes, referral exchanges".
- Rule 2 forbids standalone "download, install, rating, review, vote, or promotion requests". Flairs: ❓Help, Showcase, Google Play Console, Testing & Quality.

**9. itch.io forums**
- Board: **Get Feedback** — `https://itch.io/board/255031/get-feedback` ("Looking for feedback on your project on itch.io? Post here."). Its rules: "**itch.io projects only** Please include link a link to the project or profile page"; "**One topic per project**"; "**Do not create new topics frequently**"; "**Tell us what you're looking for feedback about** Do not just drop a link with zero effort"; "**The feedback section is not for self promotion**"; "**NO AI AGENTS**".
- Global rules (rule 5): "Do not post unsolicited or bulk advertising/promotion… Comments and communities are not for advertisement or self-promotion unless explicitly specified" (`https://itch.io/docs/general/community-rules`).
- Practical note: a "looking for testers (mobile/browser)" topic was live there, so it fits — but you need an itch.io project page (your HTML5 build) as the link. The tabletop-only "Playtesting" board (`https://itch.io/board/385447/playtesting-`) is for tabletop games, not video games.

**Not verifiable:** r/AndroidClosedTesting rules 4+ and any flair enforcement (**UNKNOWN / UNCERTAIN**); current existence of r/gamedev Feedback Friday (**UNCERTAIN**); whether r/IndieGaming moderators treat a Play closed-test link as a banned "store page" (**UNCERTAIN**, wording implies yes).
