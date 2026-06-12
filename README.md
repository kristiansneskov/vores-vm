# Vores VM — stilling

En selvstændig, skrivebeskyttet statisk side til et hyggeligt familie-VM. Hver spiller
har to lande; stillingen rangerer spillerne efter de samlede statistikker for deres to
hold. Ingen database, intet build-trin, ingen logins — du opdaterer én fil og udgiver igen.

## Hvad er her

```
index.html      sidens skelet
styles.css      al styling (mobil-først, responsiv, lyst + mørkt tema)
app.js          indlæser data.json, lægger holdene sammen, rangerer, viser
data.json       ← den eneste fil du redigerer fra dag til dag
assets/
  players/      spillerbilleder + placeholder.svg som reserve
  flags/        medfølgende SVG-flag (offline) opslået efter ISO-kode
.nojekyll       får GitHub Pages til at vise filerne, som de er
```

## Daglig opdatering (hele arbejdsgangen)

1. Åbn **`data.json`** og opdatér hvert holds rå tal efter dagens kampe:
   `played, won, drawn, lost, goalsFor, goalsAgainst, yellow, red`.
   De svarer 1:1 til den officielle gruppespilstabel plus antal kort.
2. Ret `"lastUpdated"`.
3. Commit og push:
   ```
   git add -A && git commit -m "Opdatering 2026-06-14" && git push
   ```
   GitHub Pages udgiver automatisk igen på ca. 1 minut.

Du indtaster aldrig point, målforskel, fantasy-point eller spillertotaler — appen
beregner det hele ud fra de rå tal, så intet kan komme ud af trit.

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
   Da der ikke er noget build-trin, er hvert `git push` en udgivelse.

### Vercel-alternativ

Importér repoet på vercel.com → **Framework Preset: Other**, lad Build Command og
Output være tomme, Deploy. Udgiver også automatisk ved hvert push.

## Kreditering

Flag fra [flag-icons](https://github.com/lipis/flag-icons) (MIT). Se
`assets/flags/LICENSE`.
