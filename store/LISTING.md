# Google Play listing: texts and form answers

Status (2026-10-06): English options drafted. The owner picks one of each; then
they get translated into FR/ES/IT/PT and added here. Rule: never mention ads (see
`store/README.md`).

## Chosen listing (2026-10-06) — paste per language in Play Console
Default language: English (en-US). Add the others under "Manage translations".
Rule: describe only what the app does today (no "coming soon"); never mention ads.

### English (en-US)
Name: Pétanque: Boules & Petanca
Short: Real pétanque on your phone. Play the computer or a friend.
Full:
Play pétanque in a sunny village square.

Pull back to aim and let go to throw. Roll close to the jack, lob over other boules, or shoot your opponent's boule away.

• Play against the computer (easy, medium, hard)
• Play with a friend on the same phone
• Practice mode
• Official rules: 3 boules each, first to 13
• Works offline
• English, French, Spanish, Italian and Portuguese

### Français (fr-FR)
Name: Pétanque : Jeu de Boules
Short: La vraie pétanque sur votre téléphone. Contre l'ordinateur ou un ami.
Full:
Jouez à la pétanque sur une place de village ensoleillée.

Tirez vers le bas pour viser et relâchez pour lancer. Pointez près du cochonnet, portez par-dessus les autres boules ou tirez la boule de votre adversaire.

• Jouez contre l'ordinateur (facile, moyen, difficile)
• Jouez avec un ami sur le même téléphone
• Mode entraînement
• Règles officielles : 3 boules chacun, premier à 13
• Fonctionne hors ligne
• Français, anglais, espagnol, italien et portugais

### Español (es-ES)
Name: Petanca: Juego de Bolas
Short: Petanca de verdad en tu móvil. Juega contra el ordenador o con un amigo.
Full:
Juega a la petanca en una plaza de pueblo soleada.

Desliza hacia abajo para apuntar y suelta para lanzar. Arrima al boliche, haz una bombeada por encima de las otras bolas o tira la bola de tu rival.

• Juega contra el ordenador (fácil, medio, difícil)
• Juega con un amigo en el mismo móvil
• Modo práctica
• Reglas oficiales: 3 bolas cada uno, gana el primero en llegar a 13
• Funciona sin conexión
• Español, inglés, francés, italiano y portugués

### Español latinoamericano (es-419)
Name: Petanca: Bochas y Bolas
Short: Petanca de verdad en tu celular. Juega contra la computadora o con un amigo.
Full:
Juega a la petanca en una plaza de pueblo soleada.

Desliza hacia abajo para apuntar y suelta para lanzar. Arrima al bochín, lanza por encima de las otras bolas o saca la bola de tu rival.

• Juega contra la computadora (fácil, medio, difícil)
• Juega con un amigo en el mismo celular
• Modo práctica
• Reglas oficiales: 3 bolas cada uno, gana el primero en llegar a 13
• Funciona sin conexión
• Español, inglés, francés, italiano y portugués

### Italiano (it-IT)
Name: Petanque: Gioco di Bocce
Short: La vera petanque sul tuo telefono. Gioca contro il computer o un amico.
Full:
Gioca a petanque in una soleggiata piazza di paese.

Trascina verso il basso per mirare e rilascia per lanciare. Accosta al pallino, lancia a parabola sopra le altre bocce o boccia la boccia dell'avversario.

• Gioca contro il computer (facile, medio, difficile)
• Gioca con un amico sullo stesso telefono
• Modalità allenamento
• Regole ufficiali: 3 bocce a testa, vince chi arriva prima a 13
• Funziona offline
• Italiano, inglese, francese, spagnolo e portoghese

### Português (pt-PT and pt-BR)
Name: Petanca: Jogo de Bolas
Short: Petanca a sério no seu telemóvel. Jogue contra o computador ou um amigo.
Short (pt-BR): Petanca de verdade no seu celular. Jogue contra o computador ou um amigo.
Full:
Jogue petanca numa praça de vila cheia de sol.

Puxe para baixo para apontar e solte para lançar. Aproxime-se do bolim, lance por cima das outras bolas ou atire a bola do adversário para longe.

• Jogue contra o computador (fácil, médio, difícil)
• Jogue com um amigo no mesmo telefone
• Modo treino
• Regras oficiais: 3 bolas cada um, ganha quem chegar primeiro a 13
• Funciona offline
• Português, inglês, francês, espanhol e italiano

## Graphics (per listing language)
| Slot | File |
|---|---|
| App icon | `store/icon-512.png` |
| Feature graphic | `store/feature-graphic/<lang>.png` |
| Phone screenshots (in order) | `store/screenshots-captioned/<lang>/01..06.jpg` |

## Store settings
- Category: Game → Sports. Tags (from Google's list): Sports, Simulation, Casual, Offline, Single player.
- Email: amunozo.gamedev@proton.me
- Website: https://petanque.amunozo.com
- Privacy policy: https://petanque.amunozo.com/privacy.html

## App content forms
| Form | Answer |
|---|---|
| App access | All functionality available without special access |
| Ads | No, the app does not contain ads (factual form, not a promise) |
| Content rating | Category Game; "No" to violence, fear, sexuality, language, drugs, gambling, user interaction/chat, location sharing, digital purchases → expected PEGI 3 / Everyone |
| Target audience | 13–15, 16–17, 18+ (not under 13, to stay out of the Families policy); appeals to children: No |
| Data safety | As submitted 2026-10-08: Name, Device or other IDs (online play, optional), App interactions; collected, not shared, encrypted in transit, no accounts. With anonymous analytics (GoatCounter): App interactions gets purpose Analytics and becomes required; Approximate location (country derived from IP, not stored IP) declared too. |
| Advertising ID | No |
| Government / financial / health / news | No / none |

## First release (closed testing)
- Release name: 0.5.0
- Release notes: First test version. Thanks for testing!
- Upload: `app-release-bundle.aab` (versionCode 1), accept Play App Signing.
- After upload: send the App signing key SHA-256 (Test and release → App integrity) so it can be added to `public/.well-known/assetlinks.json`.

## Testers
Testers tab → email list (Gmail addresses), feedback = email, countries = all → send for review → share the opt-in link:

> Hi! I made a pétanque game for Android and need testers for Google's 14-day test. Join here: [link] → tap "Become a tester" → install it from Play. Please keep it installed for 14 days and open it now and then. Feedback very welcome!

Where to find testers: r/petanque (message the mods first), r/AndroidAppTesters, r/TestersCommunity, testerscommunity.com, pétanque clubs and Facebook groups. Aim for 15–20 testers (12 must stay opted in for 14 days).
