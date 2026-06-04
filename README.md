# Barinstructies

Een simpele, snelle website voor het tonen van instructievideo's voor barmedewerkers. Mobile-first ontwerp met zoekfunctie, tag-filtering en view-toggle (grid/lijst).

## Snel Starten

### 1. Docker Setup

```bash
# Clone de repository
git clone https://github.com/WesRosss/Barinstructies.git
cd Barinstructies

# Bouw en start de container
docker-compose up -d
```

De website is nu beschikbaar op `http://localhost:3000`

### 2. Video's Toevoegen

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

## Docker Configuratie

### Omgevingsvariabelen

| Variabele | Default | Beschrijving |
|-----------|---------|--------------|
| `PORT` | 3000 | Poort waar de server op draait |
| `NODE_ENV` | production | Node.js omgeving |

### Docker Compose

```yaml
version: '3.8'

services:
  barinstructies:
    build: .
    container_name: barinstructies
    ports:
      - "3000:3000"
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
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
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

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/videos` | GET | Lijst van alle video's met metadata |
| `/api/tags` | GET | Lijst van alle unieke tags |
| `/videos/*` | GET | Statische video bestanden |

## Project Structuur

```
Barinstructies/
├── Dockerfile              # Docker configuratie
├── docker-compose.yml      # Docker Compose configuratie
├── package.json            # Node.js dependencies
├── server.js               # Express server
├── public/
│   ├── index.html          # Hoofd pagina
│   ├── style.css           # Mobile-first styling
│   └── script.js           # Client-side logic
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
  - "3001:3000"
```

## Licentie

MIT
