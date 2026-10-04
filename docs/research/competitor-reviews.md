# Competitor review research: pétanque / bocce / bochas games

Data pulled **2026-10-04**. Sources: Google Play (via `google-play-scraper`), Apple App Store (via `app-store-scraper`, public RSS), Steam (`appreviews` API), store listings and screenshots. Raw data is in the session scratchpad and is not committed.

**Corpus:** 9,628 Google Play reviews (deduplicated, EN/FR/ES/IT/PT/DE, sorted by newest and by most helpful), 852 App Store reviews, and about 90 Steam reviews. More than 90% of the text comes from two apps: **Bocce 3D / "Bochas 3D" / "Pétanque" by Giraffe Games** (7,548 reviews) and **La pétanque by Thomas Royer** (1,918 reviews). Every other title has fewer than 60 written reviews, so findings for those apps are anecdotal. The report labels them that way.

**Conventions**
- **Fact:** taken directly from store data or review text.
- **Inference:** our interpretation, marked *(inference)*.
- **Quotes:** shortened. Quotes not in English are translated, with the original language in brackets.
- **👍 N:** how many Play users marked that review helpful.

---

## 1. Executive summary (one page)

**The market.** Only two apps have real reach. Both are old, rated mediocre, and losing goodwill:
- **Giraffe's Bocce 3D** (10M+ installs, 3.69★ from 188k ratings, since 2013). It sells the same app under the local sport name in each market: *"Pétanque"* in France and *"Bochas 3D"* in Argentina and Spain. This is the "Bochas 3D" the player named.
- **Thomas Royer's La pétanque** (1M+ installs, 3.48★ from 5.5k ratings, since 2015). This is the reference app for French "boulistes".

Since 2023, the average rating of new reviews has dropped to about **2.8–3.2★** for both. The rest of the field is small:
- Petite Pétanque, Prelogos Bocce 3D, Boccia Battle and NebioGames Pétanque 3D each have 10k–75k installs.
- Two new entrants matter: **Paradise Roll** (launched 27 Sep 2026; portrait, low-poly, roll/half-lob/lob selector, no ads — the closest match to our concept) and **Petanque Royale** (Galéjade Studio, online-first, early access, about 6k installs).

**What players love:**
- Authentic atmosphere: cicadas, Provençal voices, plane trees.
- "Easy to learn, hard to master" throwing.
- Physics that feels real on gravel.
- Few or no intrusive ads.
- Relaxing short sessions.
- Nostalgia ("my dad / grandpa played").
- A developer who answers reviews.

**What they hate:**
- Online exploits that the rules should have prevented: bank shots off boards and posts, jacks thrown 20 cm away, rage-quits, stalling the clock.
- Unfair matchmaking (level 1 against level 900).
- Content walls ("season 3 never unlocks").
- AI that feels rigged.
- Updates that change how throwing feels.
- Lost progress after changing phones.
- Pay-to-win balls.
- Ads that interrupt a match.
- English-only UI in French, Italian and Portuguese markets.

### Top 10 lessons for us (do / don't)

1. **DO enforce real pétanque rules, because every gap becomes an exploit online.** In Giraffe's reviews, "cheating" usually means legal shots the app should forbid:
   - jack thrown less than 1 m or against a post
   - boules banked off the side boards ("c'est du billard")
   - jack kept on the pier edge

   We already enforce jack distance 6–10 m with a side margin. Next: decide what a **board touch** means (dead boule? dead jack?), keep it a tunable setting, and make the AI respect it.
2. **DO let players lob and shoot properly.** Giraffe's balls only roll. French players' top-voted complaints are "the boule never leaves the ground, so you can't shoot" (👍 242) and "no carreau on the spot" (👍 164). La pétanque has the opposite problem: lobbing ("plomber") is so strong that "nobody shoots any more" and carreaux happen while pointing. **Our 4 throw types are our main advantage. Balance them so pointing ≠ carreau and shooting is worth learning.**
3. **DON'T fake imprecision with a wobbling reticle or hidden randomness.** La pétanque's moving aim is its #2 complaint: "feels like playing drunk", "aim right, it goes left", "motion sickness". Imprecision should come from the player's gesture (pull length, angle, release). It should stay deterministic and the dotted arc should show it honestly.
4. **DON'T let the finger hide the aim.** This is a recurring Giraffe complaint: "the finger hides the arrow" (👍 164 in FR; also EN and iOS). Our pull-down slingshot should draw the arc *above* the touch point and never under the thumb.
5. **DO make the AI believable and consistent per level.** It must sometimes miss, it must *shoot* when that is the right call ("the AI never shoots, 13-0 every time"), and it must never rubber-band ("the computer turns on its aimbot in season 2"). Never change AI strength in a patch without saying so. La pétanque's AI swung from too weak to too strong across 2019 and 2023 updates and drew waves of 1★ reviews.
6. **DON'T put walls in progression.** Giraffe's single most frequent complaint, across all languages and years, is "I 3-starred everything and season 3 never unlocks" (about 7% of all its reviews). Never show locked content that doesn't exist. Never gate progress on beating one opponent who can't be beaten (reviewers name them: "Bruno", "Bertha", "Beppe", "Amanda").
7. **DO design online for fairness and low player counts from day one.**
   - Turn-based / asynchronous play, which matches our planned architecture.
   - Quitting = a loss for the quitter and the win plus credit for the opponent.
   - No stakes lost to a crash.
   - Match players by skill.
   - Play friends by link.
   - Preset messages only, no taunting chat.

   Every live-online competitor suffers from empty lobbies, 5–20 minute waits, rage-quits that deny the winner credit, and level-1 vs level-900 pairings.
8. **DON'T sell stats.** "Buy cheated boules with your bank card and you'll be champion" (👍 178). Giraffe and La pétanque both sell better balls or longer aim arrows that give an edge in PvP, and players notice. Sell cosmetics or a one-time supporter unlock only. **"No ads, no pay-to-win" is a selling point worth putting in the store listing.**
9. **DO protect progress and never ship "feel" regressions silently.** Players repeatedly lose years of progress on a new phone or reinstall. For a PWA or TWA, browser storage can be wiped, so we need a recovery or export path (or Play Games saves later). Big "feel" changes (points to win 5→4, removed chat, rematch, sound and local multiplayer) caused Giraffe's 2021 and 2026 backlashes. Versioned physics, tester sign-off, and changelogs in the game help.
10. **DO localise properly (FR, ES, IT, PT, EN) with the right sport words, and answer every review politely.**
    - Untranslated UI gets 1★ reviews ("En anglais… incompréhensible"; "ci vorrebbe la lingua italiana").
    - A typo ("Contiune") was mocked for years.
    - Thomas Royer replies to nearly every review and gets credit for it. His sarcastic replies ("It's because you are drunk", "Try a bowling app") cost him reviewers.

---

## 2. Competitor table

Installs, ratings and monetization come from Play listing data on 2026-10-04. "Reviews analysed" counts written reviews we pulled.

| App (Play id) | Rating · ratings | Installs | Since / last update | Monetization | Features | Strengths (from reviews) | Weaknesses (from reviews) |
|---|---|---|---|---|---|---|---|
| **Bocce 3D / Bochas 3D / Pétanque** — Giraffe Games (`com.giraffegames.bocce`); iOS id686955569 | **3.69★** · 188,535 (1★ 19%, 5★ 47%). Per country: AR 3.97, GB 3.73, ES 3.57, FR 3.36, IT 3.11. iOS US 3.83 (230), FR 3.70 (345) | **10M+** (~18.4M) | 2013 / 2026-09-21 (v4.03) | Free, ads + IAP $1.86–$49.76 (coins, balls). Was $1.99 on iOS around 2016–17. A "Pro" tier once removed 3 h waits | Career "seasons" vs named AI, real-time online with coin stakes, weekly leagues, ball upgrades, flags. Portrait swipe-arrow control; balls roll only | Relaxing, addictive, "easy to play hard to master"; nice ball movement; historically few ads ("NO ADVERTS!!!" 👍16); big player pool | Exploits off walls, posts and pier; rage-quits and stalling cost stakes; level mismatch; season-3 wall; freezes; name-entry bug blocking start (2019–20); unpopular 2021 and 2026 redesigns; no lob/shoot; poor sound; English-only UI; pay-to-win balls; developer silent for years |
| **La pétanque** — Thomas Royer (`com.thomasroyer.lapetanqueV3`); iOS id951115893 | **3.48★** US · 5,472 (FR listing 3.16). iOS FR 3.57 (295) | **1M+** (~1.73M) | 2015 / 2026-05-13 (v36.56) | Free, ads (incl. at launch, "long") + IAP $0.99–$5.49 (remove ads, special boules, stability) | Solo levels with difficulty stars, online (server list, auto-match, daily tournament at fixed time, ELO planned), singles/doubles/triples with role choice, pass-and-play, custom pitch from a photo, gravel, gyroscope option, yellow/red cards for quitters, tutorial and training | Most authentic: cicadas, Provençal voices, photo-real squares; "le meilleur jeu de pétanque"; realistic gravel; developer replies to almost everything | Wobbling aim ("drunk"); AI too weak then too strong after updates; update backlash; online freezes counted as quitting (cards); rage-quits; few online players; ads too long; paid boules too strong in PvP; no progress sync across devices; occasionally rude developer replies |
| **Petite Pétanque** — Galéjade Studio (`com.GalejadeStudio.PetitePetanque`) | 4.02★ · 79 (EN 4.6 but see note) | 10k+ | Nov 2024 / 2026-08 | Ads + IAP $0.99–$19.99 | Top-down cartoon Provence; 60-level campaign; 150 precision challenges; local versus; online "in development" | "Intuitive", "difficulty ramps nicely", "no ad every match" | Ad stopped a match mid-game and it couldn't resume; crashes; "too much visual noise", unclear UI; shooting weaker than pointing. **Note:** 11 five-star EN/Malay reviews posted on the same day (2025-01-08), so treat the EN average with caution |
| **Petanque Royale** — Galéjade Studio (`com.galejadeStudio.petanqueroyale`) | none (early access) | ~6k | 2026-09-24 | Ads listed | "Ultimate online pétanque game", early access | n/a | n/a. **Watch:** the only online-first pétanque entrant |
| **Bocce Ball 3D: Nations League** / FR title "Pétanque 3D: Nations League" — Prelogos (`com.Prelogos.Bocce`) | 4.30★ · 461 | 10k+ | 2023 / 2025-10 | Ads + IAP $1.49 remove ads | Drag-and-release throw, 4 maps, nation tournament, 5 balls each | "Like real pétanque" (few) | "Ads between every game"; paid ad removal reportedly not working; "jack thrown against the wall every time"; English-only; white circle on white ground (contrast). n=30 written reviews |
| **Boccia Battle** — Wasabi Applications (`jp.co.wasabiapps.boccia`); iOS id1502200017 | 3.40★ · 334 (ES 4.40) | 50k+ | 2020 / 2026-08 | Ads + IAP $0.99–$2.99 remove ads | 12 AI types, pass-and-play, online PvP with "secret word" friend rooms, 18 novelty balls, landscape | Used by real boccia (para-sport) athletes and coaches; fun AI | Online lobby always empty; disconnects with friends; English-only (FR 1★); asks for alternation rule and BC3 ramp mode. n=69 |
| **Pétanque 3D** — NebioGames (`com.nebiogames.petanque`) | 2.75★ · 38 | 10k+ | 2022 / 2025-09 | Ads, no IAP | Sight + roll/half-lob/lob selector + hold-for-power button, 4 AI levels, 4 terrains | "Excellent physics", pointing fine | Shooting "impossible"; pro AI too easy; no remove-ads option; no online; no pause. n=12 |
| **Paradise Roll: Bocce Pétanque** — Vova Rud (`com.paradiseroll.app`) | none | 10+ (launched 2026-09-27) | 2026-09-27 | Free, **no ads**, cosmetics unlocked by play | Portrait, one-handed, single swipe for aim and power, roll/half/lob selector, island campaign with wind and slope, daily quests, leaderboards, low-poly | n/a | n/a. **Closest concept to ours.** Its listing uses "no ads, no sign-up, no timers" as selling points |
| Others (tiny) | — | 1k–6k | 2025–26 | Ads | Bocce Ball Champs (Roshan), Penzo Bocce Ball (online only), SimpleGames1509 bocha titles (BR) | — | Ad complaints, won't launch (n<10) |

**App Store only:** Petanque 2012 (Tangram3D, 3.07★ from 500 FR reviews; free version has only 2 boules; "graphisme du XXe siècle"), Petanque 3D OnLine / Bochas 3D OnLine (Pix Arts, 2019, abandoned).

**Steam (small samples):**

| Game | Reviews | Notes |
|---|---|---|
| Pétanque 2026 | 26, 77% positive | Praised as "finally pétanque on PC". Criticised: no tutorial, power bar too fast, inconsistent AI, multiplayer not live yet |
| Bocce Revolution | 30, 80% positive | AI far too strong with no difficulty setting; "multiplayer" means same PC only |
| Cochonnet | 17 reviews | Mouse-based force "random" |
| Bocce Time! VR | **44/44 positive** | Low-poly, obstacle courses, online rooms; "felt like hanging out with my mum 700 km away" |

Bocce Time! VR is the best evidence that a stylised low-poly look plus social play can be loved.

**Web:** Google's 2022 pétanque Doodle (drag-and-release, online vs others) is the main browser precedent. We found no strong browser pétanque game on CrazyGames or Poki *(limited search; inference)*.

---

## 3. Theme analysis

### How the frequencies were measured
1. **Keyword tagging.** Multilingual regexes were run over all written reviews of at least 25 characters (Giraffe n=3,713; La pétanque n=1,314). This undercounts, because many reviews are just "nul" or "bon jeu", so treat these as **lower bounds**.
2. **Hand-coding.** A **random sample** of substantive negative reviews (1–2★, at least 80 characters) was coded by hand: 100 for Giraffe and 70 for La pétanque. A review can fall into several themes.

Small apps were read in full; their numbers are counts, not percentages.

**Hand-coded share of substantive negative reviews:**

| Theme | Giraffe Bocce 3D (n=100) | La pétanque (n=70) |
|---|---|---|
| Rule gaps exploited online (boards, posts, pier, short jack) + "cheaters" | **21** | 6 (rules) |
| Rage-quit / stalling / disconnect costs the winner | **16** | 5 |
| Bugs: freezes, crashes, broken name entry, balls moving | **17** (6 = name-entry bug) | **13** (often penalised as "quitting") |
| Progression wall / too little content | **12** | 1 |
| AI feels rigged or too strong | 8 | **15** |
| AI too weak or exploitable | 1 | 3 |
| Matchmaking level mismatch | 7 | 1 |
| Aim / controls (wobble, finger hides arrow, auto-fire) | 5 | **13** |
| Update backlash ("the old version was better") | 4 | **16** |
| Monetization: pay-to-win / pay to progress | 5 | 6 |
| Ads | 1 | 5 |

### 3.1 Controls and throwing feel
**Fact.** Giraffe uses a drag-up arrow from the ball whose length sets power. It is praised as simple ("very easy to play"), but its problems recur:
- The finger hides the arrow: "le doigt masque la puissance et la direction du tir" [FR]; "your finger often hides the end of the arrow"; "the arrow isn't big enough for my finger" (iOS).
- Auto-fire: "as you push up for more power it takes the shot before you release your finger" (👍 48); "a veces al estar apuntando se dispara solo" (it sometimes fires on its own while aiming) [ES, 👍 101].
- "Same arrow length = same distance. No ground irregularities" [DE] — too simple for some players.

**Fact.** La pétanque uses a sway/shrinking-circle aim to simulate imprecision. This is its most emotional complaint:
- "On a l'impression de jouer bourré" (it feels like playing drunk) [FR]
- "The aiming moves around so much I seem drunk… it gives me motion sickness" (developer reply: "It's because you are drunk")
- "Je vise à droite, la boule part à gauche" (I aim right, the ball goes left) [FR]

A minority loves it: "j'adore l'effet aléatoire… ça fait réaliste ! les parties dans la vraie vie c'est comme ça" (I love the random effect, it's realistic, real games are like that) [FR, 👍 30]. In 2025 the developer made precision worse on purpose ("it was too easy before") and replied that way to a 👍 220 bug report.

**NebioGames** (sight + throw-type button + hold-for-power): "pour pointer c'est nickel, en revanche le système de tir est très mal fait" (pointing is spot on, but shooting is badly done) [FR, 👍 11].

**Steam:** "the power bar is too fast" (Pétanque 2026); "gauging force with mouse movement… one shot too strong, one too weak" (Cochonnet).

*(Inference)* Players accept imprecision that **they** cause and reject imprecision the game **imposes**. Our slingshot with the dotted arc fits that, provided:
- the arc stays visible above the finger,
- small hand movements change results in a predictable way,
- releasing is the only thing that fires.

### 3.2 Physics realism and throw types
- **Giraffe (roll only):**
  - "Premier jeu de pétanque au monde où la boule est lancée à terre et ne décolle pas, donc impossible de tirer" (the first pétanque game in the world where the boule is thrown along the ground and never takes off, so you can't shoot) [FR, 👍 242]
  - "pas de possibilité de faire un carreau sur place, c'est-à-dire tirer en l'air" (no way to do a carreau on the spot, i.e. shoot through the air) [FR, 👍 164]
  - "Il faudrait ajouter l'option de tirer" (they should add a shooting option) [PT]
  - "Bocciare a volo!" (shoot on the full!) [IT]
  - Also: "great ball movement and very realistic graphics" (👍 140).
- **La pétanque:**
  - Praised: "le jeu de boule le plus réaliste" (the most realistic boules game); gravel that deflects rough throws ("Bowls accurate on fine gravel, will angle off on rough ground — of course").
  - The lob is overpowered:
    - "Plus personne ne tire… des portées sur la boule qui font gagner le point" (nobody shoots any more… lobs landing on the boule that win the point) [FR]
    - "en pointant on fait des carreaux à chaque fois… il n'y a plus personne qui utilise [le tir]" (pointing gives a carreau every time… nobody uses shooting any more) [FR]
    - "ce jeu est nul pour mettre un carreau il faut pointer et non tirer" (this game is broken: to get a carreau you have to point, not shoot) [iOS FR]
  - Paid boules feel heavy: "ses boules pèsent 50 kilos et sont impossibles à tirer" (his boules weigh 50 kilos and are impossible to knock away) [iOS FR].
- **Jack physics:** "le but (cochonnet) a peut-être une physique un peu lourde" (the jack's physics may be a little heavy) [iOS FR]. In Giraffe, a jack pushed into the water "comes back to the same place" (rule and physics bug).

*(Inference)* Real pétanque players judge a game by its **shooting**. A clean carreau (shooter's ball stops in place) is the moment to celebrate, and pointing should rarely produce one.

### 3.3 Camera and readability
- Giraffe pier level: "certains jouent tout en bas, on ne voit pas où on tire" (some play right at the far end, you can't see where you're throwing) [FR]. Old iOS reviews call the graphics "almost 2D".
- La pétanque: "Small window showing play head is excellent touch" (minimap). Complaints that "onglets qui restent à l'écran… diminuent la visibilité du terrain" (tabs that stay on screen shrink the view of the pitch) [FR], and that the red jack is hard to see.
- Accessibility (Giraffe EN, 👍 110): "As a visually impaired player, it's hard to play due to the balls being so small." Prelogos (DE): "the circle is white and the ground is white too."
- Disputed points: "visuellement votre boule est mieux placée et bien non le point va à l'adversaire" (visually your boule is closer, and yet the point goes to the opponent) [FR]; "the opposite player will win points when you are clearly closer" (EN, 👍 48).

### 3.4 Difficulty and AI fairness
- **Too strong / "rigged":**
  - "When the computer is fixing to lose, you couldn't get it there even if it was right in front of you" (👍 54)
  - "season 2 started and the pc turned on its aim bot"
  - "zum Anlocken gewinnt man die ersten Partien und dann kann die KI über einen drüberfahren" (to hook you, you win the first matches, then the AI rolls right over you) [DE]
  - La pétanque after the 2019 and 2023 updates: "IA même en mode le moins compliqué ne rate aucune boule… 13/0" (even on the easiest setting the AI never misses… 13-0) [FR]
  - "la boule… fait un virage à angle droit pour s'arrêter au contact du cochonnet" (the ball… turns at a right angle to stop touching the jack) [FR]: spin that looks like cheating
- **Too weak:**
  - "L'ordinateur ne tire jamais et quand c'est le cas il rate 90% du temps" (the computer never shoots, and when it does it misses 90% of the time) [FR, 👍 88]
  - "niveau 174 gagnant 13/0 à tous les coups" (level 174, winning 13-0 every time) [FR, 👍 71]
  - NebioGames "même le niveau pro est trop simple" (even the pro level is too easy)
  - Exploit: tap repeatedly during the AI's turn and its throw goes wild
- **Unbeatable gatekeepers:** Giraffe opponents "Bruno", "Bertha", "Beppe", "Amanda" are named in multiple reviews as walls.
- Bocce Revolution (Steam): "The AI is way too good… You get a perfect throw, they get it more perfect"; "no difficulty setting."

*(Inference)* Three things matter:
1. Per-level AI error should be **visible and stable**. Easy players should see it miss in human-looking ways.
2. The AI should **shoot** when that is correct.
3. It should never cheat on physics. Our deterministic engine makes that provable, and a replay of the AI's throw parameters could even be shown.

### 3.5 Rules accuracy (jack, measuring, who plays next)
- **Jack distance and placement** (Giraffe, many reviews):
  - "à la pétanque il y a une distance réglementaire… Ici les lancées de moins d'un mètre sont jouables !" (pétanque has a regulation distance… here throws under a metre are allowed!) [FR]
  - "players… purposely throwing the jack badly so that he/she doesn't need to start first" (👍 24)
  - jack banked off a post to land 20 cm away
  - jack held on the edge of the pier
- **Boards and posts:**
  - "Depuis quand on joue avec des bordures à gauche et à droite… avec l'aide des poteaux" (since when do you play using boards on the left and right… with the help of the posts) [FR, 👍 164]
  - "Il serait souhaitable que quand on touche les bords du jeu, la boule est morte" (when a boule touches the edges it should be dead) [FR, 👍 61]
  - "nelle bocce il boccino contro sponda viene bruciato" (in bocce, a jack against the board is void) [IT]
  - "Bouncing off the wall should be possible and balls hitting the back wall without having touched any other ball should be dead" (EN): **regional rule variants differ**
- **Jack out / "noyade du bouchon"** (La pétanque): players exploit knocking the jack out to stall. The game's "5 jacks out = penalty" rule is itself contested ("profondément injuste" (deeply unfair)).
- **Who plays next:** this confuses players even when the game is right.
  - "why does your opponent get so many chances… my opponent shot like five balls to my two" (EN, which is the correct rule)
  - "Je gagne le point mais c'est l'adversaire qui commence ?!" (I win the point but the opponent starts?!) [FR]
  - Boccia (PT, 👍 17): asks for correct alternation.
- **Format:** Giraffe cut points-to-win from 5 to 4 ("rubbish", "c'est nul" [FR], "antes tenías que hacer 10 puntos" (you used to need 10 points) [ES]). Players ask for 13-point games, doublettes and triplettes with pointeur/tireur roles (👍 53), and 3 boules each, not 4.

*(Inference)* Explain each decision in the UI ("Red is not holding the point → Red plays"; "Jack too short, re-throw") and show the measurement. This turns perceived cheating into learning. We already have jack 6–10 m, so the open decisions are board-touch behaviour and jack-out.

### 3.6 Multiplayer and online
- **Empty lobbies and waits:**
  - "searched for 5 minutes or longer" (👍 32)
  - "puedes llevarte 10 minutos esperando" (you can spend 10 minutes waiting) [ES, 👍 84]
  - "20 minutes d'attente… je suis de Polynésie" (20 minutes of waiting… I'm in Polynesia) [iOS FR]
  - La pétanque developer: players are mostly in Western Europe, evenings, so he added a fixed-time nightly tournament
  - Boccia Battle and the NebioGames reviewers: "never anyone to play"
- **Rage-quit and stalling:**
  - "Todos se desconectan para que les den la partida como ganada" (everyone disconnects so the game counts it as a win) [ES, 👍 190]
  - "il suffit d'abandonner la partie… en éteignant son portable… pour que le jeu dise que vous avez gagné" (you just abandon the match by switching off your phone and the game says you won) [FR, 👍 286]
  - opponents pause or run down the clock until you forfeit
  - La pétanque: the winner gets credit only if ahead by 8+ points when the opponent quits, which is widely resented
- **Matchmaking:**
  - "level 8… paired against level 555" (👍 128)
  - "niveau 10 contre niveaux 200/400/900, il faudrait mettre des paliers" (level 10 against levels 200/400/900, there should be brackets) [FR, 👍 66]
  - "ponen oponentes siempre con 300 lvl más" (they always give you opponents 300 levels higher) [ES, 2026]
- **Suspected bots:** "you're playing a computer-generated person, not a real person… the same person every single time" (👍 16); "ce jeu est plein de bots qui jouent même si on joue en multijoueurs" (this game is full of bots even in multiplayer) [FR 2026].
- **Friends:** many requests to play with a friend or spouse ("je voudrais jouer avec ma femme mais on y arrive pas" (I'd like to play with my wife but we can't manage it)), with Facebook required in the past. Boccia's "secret word" rooms are the simplest working solution seen.
- **Chat:** removal of chat was mourned, but taunting is also hated ("l'autre… vous envoie 'good shot'" (the other player… sends you "good shot") [FR, 👍 72]).
- **Stakes:** Giraffe's coin wagers make every freeze or quit a loss of currency, which multiplies anger.

*(Inference)* Async turn-based play with deterministic replay (our planned architecture) removes stalling and real-time disconnects. It also tolerates small player populations across time zones.

### 3.7 Monetization
- **Tolerated or praised:**
  - "Pendant les parties, on n'est pas embêté par les publicités… Une seule publicité apparaît au moment de quitter le jeu" (during games no ads bother you… a single ad appears when you quit) [FR, 👍 55]
  - "J'ai pris l'option sans pub qui ne coûte pas grand chose et sert à aider le créateur" (I bought the no-ads option, it costs little and helps the creator) [FR, 👍 57]
  - "The premium currency is there if you want it, but you don't need it"
  - "you should charge a few quid for the game and use funds to develop it further"
  - "you should have video ads for extra coin" (opt-in rewarded ads)
- **Hated:**
  - Ads interrupting a match: "Stoppé net en pleine partie par de la publicité… Impossible de reprendre" (stopped dead mid-game by an ad… couldn't resume) [FR, Petite Pétanque]
  - Long ads at launch (La pétanque 2025–26)
  - "ads between every game" (Prelogos)
  - Paid "remove ads" not working (Prelogos)
  - "upgrade de anúncio a cada jogada" (an ad on every throw) [PT, Giraffe v4.03, Sept 2026]
- **Pay-to-win:**
  - "Achète des boules cheatées avec ta carte bancaire" (buy cheated boules with your bank card) [FR, 👍 178]
  - Giraffe sells longer aim arrows: "ceux qui ont la barre pour viser qui arrive aux 3/4 du terrain… il faut payer" (some have an aiming bar reaching 3/4 of the pitch… you have to pay) [FR, 👍 66]
  - La pétanque sells "stabilité au lancer" (throw stability)
  - "solo si pones dinero tienes oportunidad" (only if you put money in do you stand a chance) [ES]
- **Paywalled basics:** Petanque 2012 free version has 2 boules; Giraffe iOS once charged $1.99, then broke on iOS 11 ("arnaque" (scam)).

### 3.8 Progression and content
- Giraffe: about 7% of all reviews (keyword count; 12% of hand-coded negatives) say they can't pass season 2/3 or level 11/12, from 2016 to 2026. The developer reply in 2026: "We are working on the next seasons."
- Requests: more courts and settings (parks, real pétanque grounds), tournaments, knock-out cups, career mode with sponsors, more balls and avatars, win/loss record.
- La pétanque: "manque de contenu, une fois tous les niveaux réussis on tourne en rond" (not enough content, once all levels are done you go round in circles) [FR]; the custom pitch from a photo is singled out as "tout simplement géniale" (simply brilliant).
- Petite Pétanque markets 60 levels and 150 challenges. Precision challenges are praised in La pétanque training too.

### 3.9 Performance, battery and size
Few complaints overall (small sample):
- "consume una barbaridad de batería" (it uses a huge amount of battery) [ES, 2015]
- "Puxa muito pelo tablet, queimou" (it pushes the tablet hard, it burned out) [PT, Boccia]
- "Pathetic on a tablet"
- text not fitting the screen; Galaxy Fold support needed a patch (La pétanque)
- "Android 8 minimum" left old phones behind

*(Inference)* Players mostly forgive performance in this genre. They do not forgive freezes during a match.

### 3.10 Bugs
- Giraffe:
  - the name-entry screen blocked first launch for many users in 2019–20 (several reviews with 👍 64–79)
  - freezes when the jack is knocked off the bridge, leading to forced forfeit (👍 27)
  - balls "change place" after a throw (👍 383)
  - coins and weekly rewards missing after updates (2026)
  - server outages in May 2026 caused a wave of 1★
- La pétanque: freezes counted as quitting and punished with yellow/red cards; levels not syncing across devices; audio bugs online.
- *(Inference)* Never require text entry before the first throw. Treat "end of match" and "settle" as idempotent; our reducer already ignores stale messages.

### 3.11 Localization
- Giraffe UI is English-only in FR, IT and PT:
  - "En anglais… incompréhensible" (in English… incomprehensible) [FR]
  - "ci vorrebbe la lingua italiana" (it needs Italian) [IT]
  - "só teria que ter tradução para português" (it just needs a Portuguese translation) [PT]
  - "gustaría que también estuviera en español" (I'd like it to be in Spanish too) [ES, 👍 99]
- Boccia Battle: "En anglais ! Viré" (In English! Deleted) [FR]. Prelogos: "il faudrait mettre le jeu en français" (the game should be in French).
- Giraffe's machine-translated Italian short description reads "simulazione Prima Bocce…", and the "Contiune" typo was mocked on both stores.
- Local sport vocabulary seen in reviews:
  - FR: cochonnet / bouchon / but, pointer, tirer, carreau, plomber, mène, doublette, triplette
  - ES-AR: bochas, bochín, bocha
  - ES-ES: petanca, boliche
  - VE: bolas criollas, mingo
  - IT: bocce, boccino, pallino
  - PT-BR: bocha, bolinha / bolim

### 3.12 What top-rated reviews celebrate
These come from the most-helpful 4–5★ reviews:
1. **Atmosphere:**
   - "j'y retrouve l'odeur de lavande mêlée au pastis de 5h, la chaleur du sable et la douceur du chant des criquets" (I find the smell of lavender mixed with the 5 o'clock pastis, the warmth of the sand and the soft song of the crickets) [FR]
   - "Embrasser Fanny" (the Provençal tradition of kissing Fanny after a 13-0 loss)
   - "Tu tires ou tu pointes ???" (Do you shoot or point???)
   - player voices and cicadas
2. **Skill feel:** "la précision des coups et le doigté nécessaire pour l'alignement et la puissance sont hyper précis" (the precision of the shots and the touch needed for alignment and power are extremely precise) [FR]; "Easy to play, hard to master."
3. **No ad harassment.**
4. **Relaxing and short sessions;** playing when you can't go outside ("Great way to play bocce if you… [are] physically unable to play").
5. **Nostalgia and family:** "mi papá lo jugaba" (my dad used to play it) [ES]; "I grew up playing bocce with my grandpa."
6. **A developer who listens.**

---

## 4. Opportunities and gaps nobody does well

1. **Lob and shoot in a portrait one-hand game.** Giraffe can't leave the ground. La pétanque's lob is overpowered and its aim wobbles. NebioGames' shooting is "impossible". **A satisfying carreau is the gap.**
2. **Fair online with real rules.** Every online competitor is defined by exploits, rage-quits and bad matchmaking. Async, turn-based, rules-enforced play with a forfeit-equals-loss policy is genuinely unoccupied *(inference)*. Petanque Royale is the one to watch.
3. **Play a friend by link.** The web and Play both reach this. It is a frequent request and badly served (Facebook login, servers, "secret words").
4. **Pass-and-play on one phone.** We have it. Giraffe *removed* local multiplayer and was criticised for it (ES 2026).
5. **Rules that teach.** Show why the turn passes, show the measure, enforce the jack distance, explain dead boules. Nobody does this. The demand is visible in rule-confusion reviews.
6. **No ads, no pay-to-win.** Only brand-new Paradise Roll claims this. The two big apps are drifting toward heavier ads (Giraffe v4.03, La pétanque launch ads).
7. **Localisation into FR/ES/IT/PT** with correct sport terms. Even the 10M-install leader is English-only in-game.
8. **Accessibility:** zoom or larger balls, colour-blind-safe team colours, left-handed layout, high-contrast jack. There are specific unmet requests, including from para-boccia players.
9. **Instant web play** (no install) as a funnel to Play. There is little competition on the web *(inference, limited search)*.
10. **Provençal authenticity in a stylised low-poly look.** La pétanque owns photo-realism. Petite Pétanque owns the top-down cartoon. Paradise Roll went tropical. **A warm, low-poly Provençal village square in 3D first person is not taken.** Bocce Time! VR shows low-poly can feel premium.
11. **Doublette and triplette with pointeur/tireur roles** vs AI. Only La pétanque has it, added in 2026 after years of requests.

---

## 5. Recommendations mapped to our roadmap

### Pre-launch fixes (before Play/web release)
- **Aim visibility:** confirm that during the pull-down the dotted arc and landing marker are never under the thumb, on small phones and on tablets. Add a brief "release to throw" affordance; never auto-fire.
- **Throw-type balance pass:** make sure pointing ("roll / half-lob / lob") rarely produces a carreau, and that shoot can. Tune via `tuning/` and test with the dev panel.
- **Boards decision:**
  - choose and document (tunable) whether a boule or jack touching the side or end boards is dead or live
  - make sure board bank-shots are not the AI's dominant strategy
  - consider a "dead if touches board" default in match mode, with practice left free
- **AI sanity per difficulty:** easy misses visibly; medium points well and shoots sometimes; hard shoots when the opponent holds the point near the jack. No physics advantages; same throw model as the player.
- **Explain decisions on screen:** "Jack too short (min 6 m) – re-throw", "Blue holds the point → Red plays", and an end-of-end measurement overlay with distance lines.
- **No blocking first-run steps:** no mandatory name or account; first throw within seconds (Paradise Roll advertises this too).
- **Accessibility quick wins:** a camera zoom or "follow ball" toggle, colour-blind-safe team colours plus shape markings on boules, a high-contrast jack.
- **Readiness for app suspension:** when the PWA is backgrounded or the phone locks mid-throw, resume cleanly; never count it as a loss.

### Launch features (v1 on Play + web)
- Keep **no ads / no IAP** at launch and say so in the listing ("Sans pub · Sans achats" / "Sin anuncios" / "No ads").
- **Localise FR, ES, IT, PT-BR, EN** with native review of sport terms. Use "Bochas" wording in the es-AR listing. Ship with a proofreading pass (the "Contiune" lesson).
- **Settings:** separate volume for ambience (cicadas, crowd), voices and SFX. La pétanque reviewers ask for this; our procedural sound makes it cheap. Make ball-on-ball clacks prominent; Giraffe was criticised for "no sound when balls hit".
- **Short-session modes:** Quick 7 / Standard 13 (done). Plus a few **precision challenges** (point inside a circle, carreau, hit the jack), which are cheap content praised in La pétanque and Petite Pétanque.
- **Progress safety:** if any persistent progress exists, add an export/import code or a sync path, and never show locked content that doesn't exist yet.
- **Feedback loop:** in-game build id (done) plus a "send feedback" link. Reply to every store review politely within days.

### Post-launch: online and matchmaking
- **Async turn-based first** (it matches our reducer and serializable actions), then optional live play:
  - Forfeit = loss for the quitter and a full win plus rating for the opponent, regardless of score.
  - A long turn timer (hours, async) instead of a 15 s clock that can be gamed.
  - "Play a friend" via share link or code (web + Play); this is the #1 social request.
  - Skill-based matchmaking (Elo/Glicko) with new-player brackets. Never pair rating gaps that large, and fall back to friends or AI rather than a mismatch.
  - Preset-message chat only ("Bien joué !", "Bravo le carreau !", "Ouh la !"); no free text.
  - Server-side replay validation of throws (our deterministic engine allows it) to stop modified clients.
  - Do not disguise bots as humans. Players notice, and Giraffe is accused of it every year.
- **Events instead of empty lobbies:** daily or weekly async challenges (same jack layout for everyone, leaderboard). They work with few players; La pétanque had to invent fixed-time tournaments because of its small population.
- **Doublette/triplette with role choice** (pointeur/tireur) vs AI, then online.

### Monetization approach players tolerate (from the evidence)
- **Best tolerated:** a free game with a one-time inexpensive "supporter / remove-ads" unlock, or optional cosmetics (boule finishes, engravings, squares/villages, celebrations). Keep ads, if ever added, **outside matches**, short, and never at launch. Opt-in rewarded videos only.
- **Never:** stat-boosted boules or aim aids for sale, energy timers or waits, coin stakes that can be lost to crashes, or ads between every match.
- *(Inference)* Our positioning — no ads, no pay-to-win, real rules — is the clearest differentiator against the two incumbents and should appear in the title area and the first screenshot.

---

## 6. Store listing insights

**Title conventions (fact):**
- Giraffe localises the **title** to the sport's local name: FR "Pétanque", ES/AR "Bochas 3D", EN/IT "Bocce 3D - Online Sports Game". It ranks #1 for "petanque 3d" (FR), "bochas", "petanca" (ES), "bocce" and "bocce ball" (US).
- Prelogos: FR "Pétanque 3D: Nations League" vs "Bocce Ball 3D: Nations League" elsewhere.
- Paradise Roll: FR "Paradise Roll : Pétanque", ES "Paradise Roll: Petanca y Bocce", EN "Paradise Roll: Bocce Pétanque".
- The pattern is **"Brand: sport keyword(s) (+ 3D)"**, localised per market.

**Keywords that surface these games:**
- FR: pétanque, petanque 3d, jeu de boules, boules, cochonnet
- ES: petanca (Spain), bochas / juego de bochas (Argentina, Uruguay)
- EN: bocce, bocce ball, petanque, boules
- IT: bocce, boccia

Caution: "boules" (EN-GB) and "jeu de boules" (FR) results are dominated by bubble-shooter games, and "boccia" returns the para-sport and card games. These terms are weak on their own.

**Short descriptions:**
- La pétanque's hook question is "Do you shoot or do you point?" / FR "La paix tant que" (a pun) / ES "¿Usted «Tira» o «Apoya»?" (awkward literal Spanish).
- Petite Pétanque lists modes ("Versus, Campagne en Provence, Défis").
- Paradise Roll's description has a "What we left out" section: "no ads, no mandatory sign-up, no lives, no timers".
- Giraffe's description claims "Lots of active online players!", which reviewers contradict.

**Screenshots (fact, first 1–3 viewed):**
- **Giraffe:** only 4 portrait shots; first is in-game with a **hand-gesture overlay** showing the swipe and flags; no video.
- **La pétanque:** 21 shots + video, but the **first shot is the main menu** (weak); gameplay shots are photo-real squares with a minimap.
- **Petite Pétanque:** 24 + video; top-down cartoon Provence with lavender fields and a scoreboard.
- **Paradise Roll:** 4 portrait low-poly shots showing the roll/half/lob selector and an island map.
- **Boccia Battle:** landscape HUD with buttons.

**Recommendations *(inference)*:**
- Lead with the aim-arc gameplay shot plus a caption ("Pointe ou tire ?" / "¿Arrimar o tirar?" / "Point or shoot?").
- Then show:
  - the 4 throw types
  - a carreau moment
  - the village square at golden hour
  - modes (vs computer, 2 players on one phone)
  - a "No ads · no pay-to-win" panel
- Add a 15–30 s video of a carreau with sound.

**Ratings by country (same app, Giraffe):** AR 3.97 > GB 3.73 > ES 3.57 > FR 3.36 > IT 3.11. *(Inference)* The sport's home markets (France, Italy) judge rules and realism hardest. Get French and Italian rules right before marketing there.

---

## Sources

**Google Play listings** (data via google-play-scraper, 2026-10-04):
- [Bocce 3D / Bochas 3D / Pétanque – Giraffe Games](https://play.google.com/store/apps/details?id=com.giraffegames.bocce)
- [La pétanque – Thomas Royer](https://play.google.com/store/apps/details?id=com.thomasroyer.lapetanqueV3)
- [Petite Petanque – Galéjade Studio](https://play.google.com/store/apps/details?id=com.GalejadeStudio.PetitePetanque)
- [Petanque Royale – Galéjade Studio](https://play.google.com/store/apps/details?id=com.galejadeStudio.petanqueroyale)
- [Bocce Ball 3D: Nations League – Prelogos](https://play.google.com/store/apps/details?id=com.Prelogos.Bocce)
- [Boccia Battle – Wasabi Applications](https://play.google.com/store/apps/details?id=jp.co.wasabiapps.boccia)
- [Pétanque 3D – NebioGames](https://play.google.com/store/apps/details?id=com.nebiogames.petanque)
- [Paradise Roll – Vova Rud](https://play.google.com/store/apps/details?id=com.paradiseroll.app)
- [Bocce Ball Champs – Roshan Games](https://play.google.com/store/apps/details?id=com.RoshanGames.BocceBall)
- [Bocce Ball – Penzo Games](https://play.google.com/store/apps/details?id=com.penzo.bocceball)

**App Store** (reviews via public RSS):
- [La pétanque](https://apps.apple.com/fr/app/id951115893)
- [Bocce 3D](https://apps.apple.com/us/app/id686955569)
- [Petanque 2012](https://apps.apple.com/fr/app/id498240390)
- [Petite Petanque](https://apps.apple.com/fr/app/id6736561647)
- [Boccia Battle](https://apps.apple.com/us/app/id1502200017)

**Steam:**
- [Pétanque 2026](https://store.steampowered.com/app/4351420/)
- [Power of Petanque](https://store.steampowered.com/app/2075480/)
- [Cochonnet](https://store.steampowered.com/app/3142840/)
- [Bocce Revolution](https://store.steampowered.com/app/380950/)
- [Bocce Time! VR](https://store.steampowered.com/app/1774890/)
- [Bocce Beach](https://store.steampowered.com/app/569940/)

**Web:**
- [Google pétanque Doodle (9to5Google)](https://9to5google.com/2022/07/30/petanque-google-doodle-game-free/)
- [Pétanque Master (itch.io)](https://petanqueurfou.itch.io/ptanque-master)

## Limitations
- Play's review API returns reviews by **language**, not country, so "es" mixes Spain and Latin America. The per-country star ratings above are Play's own per-country scores.
- The big Giraffe samples reach back to 2014–2016 for EN/ES/IT and to 2020 for FR. Older complaints may describe fixed issues. The table and section 1 lean on recurring themes and on post-2023 reviews (Giraffe n≈340, La pétanque FR n=203).
- Keyword counts are lower bounds. Hand-coded samples are 100 and 70 reviews, which gives roughly ±10 percentage points at 95% confidence, so treat them as rankings, not exact rates.
- Apps other than the two leaders have fewer than 70 written reviews each, and Paradise Roll and Petanque Royale have none.
- Petite Pétanque's English reviews include a suspicious same-day burst.
- Board/dead-ball rules vary between FIPJP competition, local and casual play, and bocce codes. Treat player expectations here as preferences to make tunable, not as a rules ruling.
