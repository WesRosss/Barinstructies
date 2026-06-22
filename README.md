# Barinstructies

Een simpele, snelle website voor het tonen van instructievideo's voor barmedewerkers. Mobile-first ontwerp met zoekfunctie, tag-filtering en view-toggle (grid/lijst). **Nieuw:** Beheeromgeving voor het uploaden en beheren van video's.

## Snel Starten

### 1. Docker Setup

```bash
# Clone de repository
git clone https://github.com/WesRosss/Barinstructies.git
cd Barinstructies

# Bouw en start de container
docker-compose up -d
```

De website is nu beschikbaar op `http://localhost:3210`
De beheeromgeving is beschikbaar op `http://localhost:3210/beheer`

### 2. Video's Toevoegen

Er zijn twee manieren om video's toe te voegen:

#### Methode 1: Via Beheeromgeving (Aanbevolen)
1. Ga naar `http://localhost:3210/beheer`
2. Meld je aan met de standaard admin credentials:
   - Gebruikersnaam: `admin`
   - Wachtwoord: `admin123`
3. Upload je video via de upload pagina
4. Voer titel, beschrijving en tags in
5. De video wordt automatisch gecomprimeerd, thumbnail gegenereerd en naar de CDN gestuurd

#### Methode 2: Handmatig (Legacy)
Plaats je MP4 video's in de `videos/` directory. Voor elke video kun je een JSON bestand met dezelfde naam toevoegen voor metadata:

```json
{
    "title": "Cocktail Maken",
    "description": "Instructie voor het maken van een klassieke cocktail",
    "tags": ["cocktail", "maken", "bar"]
}
```

**Voorbeeld:**
- `videos/bier-tappen.mp4`
- `videos/bier-tappen.json`

De server detecteert automatisch nieuwe video's bij herstart.

## Beheeromgeving

### Functionaliteiten
- **Aanmelden**: Veilige authenticatie met JWT tokens
- **Video Upload**: Upload video's tot 500MB, automatisch compressie en thumbnail generatie
- **CDN Integratie**: Automatische upload naar BunnyCDN (indien geconfigureerd)
- **Tag Beheer**: Voeg tags toe voor betere zoekresultaten
- **Gebruikersbeheer**: Beheer gebruikers en rollen (admin only)
- **Video Beheer**: Bekijk, bewerk en verwijder video's
- **Instellingen**: Bekijk systeeminstellingen

### Beveiliging
- **Rate Limiting**: Beperking van login pogingen en uploads
- **Security Headers**: XSS, Clickjacking, en andere beveiligingsheaders
- **Bot Blokkering**: robots.txt en user-agent filtering
- **No-Index**: Beheerpagina's zijn niet vindbaar voor zoekmachines
- **HTTPS Aanbevolen**: Gebruik altijd HTTPS in productie

## Docker Configuratie

### Omgevingsvariabelen

| Variabele | Default | Beschrijving |
|-----------|---------|--------------|
| `PORT` | 3210 | Poort waar de server op draait |
| `NODE_ENV` | production | Node.js omgeving |
| `CDN_BASE_URL` | https://cdn.barinstructies.nl | Base URL voor de CDN |
| `USE_CDN` | true | Gebruik CDN voor video's (true/false) |
| `GENERATE_THUMBNAILS` | true | Genereer automatisch thumbnails (true/false) |
| `THUMBNAIL_WIDTH` | 320 | Breedte van thumbnails in pixels |
| `THUMBNAIL_HEIGHT` | 180 | Hoogte van thumbnails in pixels |
| `JWT_SECRET` | random | JWT geheim voor authenticatie |
| `JWT_EXPIRES_IN` | 24h | Verloopstijd van JWT tokens |
| `BUNNYCDN_ACCESS_KEY` | - | BunnyCDN API sleutel |
| `BUNNYCDN_PASSWORD` | - | BunnyCDN wachtwoord |
| `BUNNYCDN_STORAGE_ZONE` | instructievideos | BunnyCDN storage zone |
| `AUTO_UPLOAD_TO_CDN` | false | Upload statische bestanden automatisch bij opstarten |

### Automatische CDN Upload

Om statische bestanden (CSS, JS, HTML, afbeeldingen, video's) automatisch naar BunnyCDN te uploaden bij opstarten:

1. **Configureer omgevingsvariabelen:**
   ```bash
   BUNNYCDN_ACCESS_KEY=your-access-key
   BUNNYCDN_PASSWORD=your-password
   BUNNYCDN_STORAGE_ZONE=your-storage-zone
   AUTO_UPLOAD_TO_CDN=true
   ```

2. **Start de server:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

De server uploadt dan automatisch alle statische bestanden naar BunnyCDN en vervangt de lokale referenties door CDN URLs.

**Handmatig uploaden:**
```bash
# Voer het CDN upload script handmatig uit
node cdn-upload.js
```

**Let op:** Na het uploaden moet je:
- De BunnyCDN cache leegmaken (Purge Cache in BunnyCDN dashboard)
- De server herstarten om de bijgewerkte HTML/CSS/JS bestanden te laden

### Docker Compose

```yaml
version: '3.8'

services:
  barinstructies:
    build: .
    container_name: barinstructies
    ports:
      - "3210:3210"
    volumes:
      - ./videos:/app/videos
    restart: unless-stopped
```

### Proxy Configuratie (Nginx voorbeeld)

```nginx
server {
    listen 443 ssl;
    server_name instructies.jouwdomein.nl;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3210;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### CDN Configuratie

Om Bunny.net CDN te gebruiken:

1. Zet je video's op Bunny.net (in de root of in een map)
2. Houd je JSON metadata bestanden **lokaal** in de `videos/` directory
3. Stel de omgevingsvariabelen in:
   ```bash
   CDN_BASE_URL=https://cdn.barinstructies.nl
   USE_CDN=true
   ```

4. Herstart de server

De website zal nu:
- Metadata lokaal lezen uit de `videos/` directory
- Video's laden vanaf de CDN
- **Automatisch thumbnails genereren** (als `GENERATE_THUMBNAILS=true`)

### Thumbnail Generatie

De server genereert automatisch JPG thumbnails van je video's:
- Thumbnails worden opgeslagen in de `videos/` directory naast de `.json` files
- Formaat: `{videonaam}.jpg` (bijv. `VID_20260617_164247.jpg`)
- Afmetingen: standaard 320x180px (aanpasbaar via `THUMBNAIL_WIDTH` en `THUMBNAIL_HEIGHT`)

**Vereisten:**
- `ffmpeg` moet geïnstalleerd zijn in de Docker container
- Voor Docker: voeg `ffmpeg` toe aan je Dockerfile

Om thumbnail generatie uit te schakelen:
```bash
GENERATE_THUMBNAILS=false
```

Om terug te schakelen naar lokale video's:
```bash
USE_CDN=false
```

## Functionaliteiten

### 📱 Mobile-First Design
- 2 thumbnails naast elkaar op mobiel
- 3 thumbnails op tablet
- 4 thumbnails op desktop
- Responsive layout

### 🔍 Zoeken & Filteren
- **Zoekbox**: Zoek op titel, bestandsnaam of tags
- **Tag filter**: Filter video's op specifieke tags
- **Real-time**: Resultaten worden direct getoond

### 👁️ View Toggle
- **Grid view**: Thumbnail overzicht
- **List view**: Lijst met video's
- Voorkeur wordt opgeslagen in localStorage

### 🎥 Video Afspelen
- Klik op een thumbnail om video in modal te openen
- Autoplay met controls
- Tags worden getoond onder de video

### ⚡ Snelheid
- Server-side directory scanning bij startup
- Client-side filtering voor directe reactie
- Lazy loading van video thumbnails
- Intersection Observer voor optimale prestaties

## API Endpoints

### Publieke API
| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/videos` | GET | Lijst van alle video's met metadata |
| `/api/tags` | GET | Lijst van alle unieke tags |
| `/videos/*` | GET | Statische video bestanden |

### Beheer API (Vereist authenticatie)
| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/beheer/api/login` | POST | Aanmelden en JWT token ontvangen |
| `/beheer/api/logout` | POST | Uitloggen |
| `/beheer/api/check-auth` | GET | Controleer authenticatie status |
| `/beheer/api/upload` | POST | Upload nieuwe video |
| `/beheer/api/videos` | GET | Lijst van alle video's (beheer) |
| `/beheer/api/videos/:filename` | DELETE | Verwijder video |
| `/beheer/api/users` | GET | Lijst van gebruikers (admin only) |
| `/beheer/api/users` | POST | Voeg nieuwe gebruiker toe (admin only) |
| `/beheer/api/users/:id` | PUT | Bewerk gebruiker (admin only) |
| `/beheer/api/users/:id` | DELETE | Verwijder gebruiker (admin only) |
| `/beheer/api/settings` | GET | Systeeminstellingen |

## Project Structuur

```
Barinstructies/
├── Dockerfile              # Docker configuratie
├── docker-compose.yml      # Docker Compose configuratie
├── package.json            # Node.js dependencies
├── server.js               # Express server
├── beheer-routes.js        # Beheer API routes
├── data/                   # Gebruikersdata
│   └── users.json          # Gebruikersdatabase
├── public/
│   ├── index.html          # Hoofd pagina
│   ├── style.css           # Mobile-first styling
│   ├── script.js           # Client-side logic
│   ├── beheer.html         # Beheer pagina
│   ├── beheer-style.css    # Beheer styling
│   ├── beheer-script.js    # Beheer client-side logic
│   └── robots.txt          # Bot blokkering
├── temp/                   # Tijdelijke uploads
├── uploads/                # Upload directory
└── videos/                 # Video bestanden en metadata
    ├── video1.mp4
    ├── video1.json
    └── ...
```

## Technische Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Container**: Docker + Docker Compose
- **Styling**: Mobile-first CSS met CSS Variables
- **Prestaties**: Intersection Observer, lazy loading
- **Authenticatie**: JWT (JSON Web Tokens)
- **Upload**: Multer voor file uploads
- **Beveiliging**: Helmet, Rate Limiting, Security Headers

## Tips

1. **Video optimalisatie**: Gebruik gecomprimeerde MP4 bestanden voor snellere laadtijden
2. **Tags**: Gebruik consistente tag naming voor betere filterresultaten
3. **Thumbnails**: De eerste frame van de video wordt als thumbnail gebruikt
4. **Caching**: De browser cachet video's voor betere prestaties

## Problemen Oplossen

### Video's worden niet getoond
- Controleer of de video's in de `videos/` directory staan
- Zorg dat de bestandsnamen geen speciale tekens bevatten
- Herstart de Docker container: `docker-compose restart`

### Docker build faalt
```bash
# Verwijder oude container en build opnieuw
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Poort in gebruik
Wijzig de poort in `docker-compose.yml`:
```yaml
ports:
  - "3211:3210"
```

## Licentie

MIT
