# Vores VM — stilling

En statisk side til et hyggeligt familie-VM. Hver spiller har to lande; stillingen
rangerer spillerne efter de samlede statistikker for deres to hold. Intet build-trin.
Kampe indtastes via en lille formular (`admin.html`) og gemmes i en **gratis Firebase
Firestore-database**; stillingen læser data live derfra og opdateres på få sekunder —
uden git, uden push.

## Hvad er her

```
index.html        sidens skelet
admin.html        formular til at indtaste kampe (kræver adgangskode)
styles.css        al styling (mobil-først, responsiv, lyst + mørkt tema)
app.js            læser data live fra Firestore (data.json som reserve), rangerer, viser
admin.js          formularens logik: log ind, beregn resultat, gem i Firestore
firebase-config.js  ← indsæt din firebaseConfig her (engangs)
data.json         startdata + offline-reserve (ikke længere den daglige fil)
assets/
  players/      spillerbilleder + placeholder.svg som reserve
  flags/        medfølgende SVG-flag (offline) opslået efter ISO-kode
.nojekyll       får GitHub Pages til at vise filerne, som de er
```

## Daglig opdatering (kamptabellen)

Hele gruppespillet for jeres 10 hold ligger allerede som rækker i tabellen — du skal kun
skrive resultaterne ind, efterhånden som kampene spilles.

1. Åbn **`admin.html`** (linket "Redigér kampe" nederst på siden).
2. Skriv adgangskoden ind første gang (huskes på enheden bagefter).
3. Find kampens række og skriv **mål** og evt. **kort**. Fluebenet i **Spillet** sættes
   automatisk — kun spillede kampe tæller i stillingen.
4. Tryk **Gem ændringer** — stillingen opdateres live på alle skærme med det samme.

Sejr/uafgjort/tab, point og målforskel beregnes automatisk ud fra målene. Hold udenfor
puljen står som fri tekst (fx "Australien") og får ingen statistik. Slutspilskampe (kendes
først når grupperne er spillet) tilføjer du med **＋ Tilføj kamp**.

> **Allerførste gang:** hvis tabellen er tom, tryk **Indlæs hele kampprogrammet** for at
> hente alle 28 gruppekampe ind i Firestore. Derefter er rækkerne der bare.

## Opsætning af Firebase (engangs, gratis)

1. Opret et gratis projekt på [console.firebase.google.com](https://console.firebase.google.com).
2. **Build → Firestore Database → Create database** (vælg en europæisk region,
   "production mode").
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
   Gå til fanen **Users → Add user**, og opret én bruger med e-mail
   `vm@vores-vm.local` og en valgfri **adgangskode** (det er den, din søn taster).
4. **Project settings (tandhjul) → Your apps → Web (`</>`)** → registrér en app, og
   kopiér `firebaseConfig`-objektet ind i **`firebase-config.js`** (erstat `PASTE_ME`).
5. **Firestore → Rules**, indsæt og publicér:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{doc=**} {
         allow read: if true;            // stillingen er offentlig
         allow write: if request.auth != null;  // kun med adgangskode (login)
       }
     }
   }
   ```
6. Åbn `admin.html`, log ind, og tryk **Importér data.json** én gang for at lægge de
   nuværende hold og spillere ind i Firestore. Derefter er I klar.

## Tilføj / ret spillere og hold

- **Hold** ligger under `"teams"`. Hver nøgle (fx `"can"`) er et id, du henviser til fra
  en spiller. `"code"` er flagets ISO-kode — filnavnet i `assets/flags/`
  (fx Canada → `ca`, England → `gb-eng`). Der følger 270+ flag med.
- **Spillere** ligger under `"players"`. Hver har et `id`, `name`, `photo` (et filnavn
  inde i `assets/players/`) og `teams` (en liste med to hold-id'er).

```jsonc
"teams": {
  "civ": { "name": "Elfenbenskysten", "code": "ci", "played": 0, "won": 0, "drawn": 0,
           "lost": 0, "goalsFor": 0, "goalsAgainst": 0, "yellow": 0, "red": 0 }
},
"players": [
  { "id": "kristan", "name": "Kristan", "photo": "kristan.jpg", "teams": ["civ", "tur"] }
]
```

## Spillerbilleder

Læg billedfiler i `assets/players/`, og lad spillerens `photo`-felt pege på filnavnet
(kvadratiske billeder ser bedst ud, fx 400×400). Manglende eller forkerte filnavne
falder automatisk tilbage til en silhuet — ingen ødelagte billeder.

## Pointgivning

- **Point** = sejre×3 + uafgjorte (lige stilling brydes af målforskel, derefter scorede mål).
- **Fantasy-point** bruger vægtene i `data.json` → `"fantasyWeights"`. Standard:
  sejr +3, uafgjort +1, scoret mål +1, indkasseret mål −1, gult kort −1, rødt kort −3.
  Ret frit.
- Stillingen kan sorteres efter enhver kolonne (tryk på en kolonneoverskrift på computer,
  eller brug "Sortér efter" på mobil). Tryk på en spiller for at åbne deres detaljeside.

## Forhåndsvisning lokalt

Siden bruger `fetch`, så åbn den via en lille webserver (ikke `file://`):

```
cd worldcup
python3 -m http.server 8000
# besøg http://localhost:8000
```

## Udgivelse — GitHub Pages (gratis)

1. Opret et **offentligt** GitHub-repo ved navn **`vores-vm`**, og push disse filer til `main`-grenen.
2. Repoets **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   vælg **`main`** / **`/ (root)`**, Save.
3. Siden går live på `https://<dit-brugernavn>.github.io/vores-vm/` inden for et minut.
   Da der ikke er noget build-trin, er hvert `git push` en udgivelse. Bemærk: kun
   *kode*-ændringer kræver push — *kampresultater* gemmes i Firestore og kræver intet
   push (de vises live).

### Vercel-alternativ

Importér repoet på vercel.com → **Framework Preset: Other**, lad Build Command og
Output være tomme, Deploy. Udgiver også automatisk ved hvert push.

## Kreditering

Flag fra [flag-icons](https://github.com/lipis/flag-icons) (MIT). Se
`assets/flags/LICENSE`.
