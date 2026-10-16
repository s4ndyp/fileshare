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

Op de **Proxmox host** als root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/s4ndyp/fileshare/main/scripts/proxmox-fileshare.sh)"
```

Opties (voorbeeld):

```bash
bash scripts/proxmox-fileshare.sh --ctid 120 --ram 1024 --disk 8 --port 3000
```

Het script:

1. Maakt een Debian 12 LXC aan (unprivileged, nesting voor Docker)
2. Installeert Docker en Docker Compose
3. Clonet deze repo naar `/opt/fileshare` en start `docker compose`

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
