# Fileshare

Donker-themed webapp om bestanden en tekst (wachtwoorden, sleutels, snippets) eenvoudig tussen computers te wisselen.

## Functies

- Meerdere bestanden uploaden via drag & drop
- Optioneel: **verwijder na download** (per upload-batch) en **opslaan als zip**
- **Drie kolommen**: brede uploadkaart (dropzone + opties) over de eerste twee kolommen, snippet-invoer rechts; daaronder kalender | bestandenlijst | snippets
- **Kalender als filter**: de kalender opent op vandaag; klik op een dag om de bestandenlijst te filteren, met **Alles tonen** om het filter te wissen (de dagtitel staat in de kop van de lijst)
- **Thumbnail per bestand**; klik op de thumbnail van een afbeelding opent de volledige afbeelding in een voorvertoning (met downloadlink)
- **Snippets** als één regel per stuk, met een popup (kopiëren/verwijderen) als je erop klikt
- De bestandenlijst en snippetskolom vullen het scherm en scrollen **binnen hun eigen kader**; de pagina groeit niet mee
- **Alles wissen**: knop links naast de schijfruimte in de header om in één keer álle bestanden van alle datums op te ruimen, met een tweetraps-bevestiging
- Automatisch verversen van de lijsten (elke 15 seconden)

## Testen

```bash
npm install
npm test        # headless interactietest (jsdom) van layout, kalender, thumbnails en snippets
```

## Lokaal draaien

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Data staat in `./data`.

## Docker

```bash
cp .env.example .env   # optioneel poort aanpassen
docker compose up -d --build
```

## Deploy op Proxmox (LXC + Docker)

Uitrol gebeurt via **[s4ndyp/scripts](https://github.com/s4ndyp/scripts)** (Xdio / `community-scripts`-stijl), niet vanuit deze repo.

Op de **Proxmox host** als root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/s4ndyp/scripts/main/fileshare/fileshare.sh)"
```

Standaard: **2 CPU**, **2 GB RAM**, **10 GB disk**; de app is bereikbaar op **poort 80** in de LXC (`http://<IP>/`).

**Update** in de container: `update`, of handmatig:

```bash
cd /opt/fileshare && git pull --ff-only && docker compose build && docker compose up -d
```

Zie ook [fileshare/README-proxmox-section.md](https://github.com/s4ndyp/scripts/blob/main/fileshare/README-proxmox-section.md) in de scripts-repo.

## Beveiliging

De app heeft **geen ingebouwde login**. Gebruik hem alleen op een vertrouwd netwerk, achter een VPN, of plaats een reverse proxy met authenticatie (bijv. Authelia, NPM + Access List).

## Omgevingsvariabelen

| Variabele       | Default   | Beschrijving              |
|----------------|-----------|---------------------------|
| `PORT`         | `3000`    | Poort in de container     |
| `DATA_DIR`     | `/data`   | Uploads + SQLite database |
| `MAX_FILE_SIZE`| 512 MiB   | Max. bestandsgrootte      |

<!-- runner-benchmark: 2026-11-18 -->
