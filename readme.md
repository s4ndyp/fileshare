# Fileshare

Donker-themed webapp om bestanden en tekst (wachtwoorden, sleutels, snippets) eenvoudig tussen computers te wisselen.

## Functies

- Meerdere bestanden uploaden via drag & drop
- Optioneel: **verwijder na download** (per upload-batch)
- Overzicht met download- en verwijder-knoppen
- Aparte lijst voor tekstregels met **kopieer naar klembord** en verwijderen
- Automatisch verversen van de lijsten (elke 15 seconden)

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

### Alleen Docker op bestaande machine/LXC

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/s4ndyp/fileshare/main/scripts/install-docker.sh)"
```

## Beveiliging

De app heeft **geen ingebouwde login**. Gebruik hem alleen op een vertrouwd netwerk, achter een VPN, of plaats een reverse proxy met authenticatie (bijv. Authelia, NPM + Access List).

## Omgevingsvariabelen

| Variabele       | Default   | Beschrijving              |
|----------------|-----------|---------------------------|
| `PORT`         | `3000`    | Poort in de container     |
| `DATA_DIR`     | `/data`   | Uploads + SQLite database |
| `MAX_FILE_SIZE`| 512 MiB   | Max. bestandsgrootte      |
