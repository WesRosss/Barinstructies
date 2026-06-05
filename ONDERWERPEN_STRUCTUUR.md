# Onderwerpen Structuur - Barinstructies

## Concept

De structuur is gebaseerd op **hiërarchische taxonomie** met ruimtelijke en voorwerpelijke indeling. Dit maakt het mogelijk om:
1. Video's logisch te groeperen
2. Gerelateerde video's te suggesteren
3. Flexibel te zoeken en filteren

## Structuur Niveaus

### 1. Hoofdcategorie (Ruimtelijk/Voorwerpelijk)
De hoogste laag die de context aangeeft:
- **Keuken** (ruimtelijk)
- **Bar** (ruimtelijk)
- **Magazijn** (ruimtelijk)
- **Apparatuur** (voorwerpelijk)
- **Producten** (voorwerpelijk)
- **Handelingen** (voorwerpelijk)

### 2. Hoofonderwerp
Het principale onderwerp binnen een categorie:
- Keuken → **Oven**
- Keuken → **Magnetron**
- Keuken → **Frituur**
- Bar → **Bier Tappen**
- Bar → **Cocktails Maken**
- Producten → **Broodje Kroket**
- Apparatuur → **Koffiezetapparaat**

### 3. Subonderwerp (Deelonderwerpen)
Specifieke aspecten van het hoofdonderwerp:
- Oven → **schoonmaken**
- Oven → **aanzetten**
- Oven → **bedienen**
- Oven → **gebruik**
- Broodje Kroket → **benodigdheden**
- Broodje Kroket → **handelingen**
- Broodje Kroket → **instructies**
- Bier Tappen → **voorbereiding**
- Bier Tappen → **tappen**
- Bier Tappen → **afronden**

### 4. Relaties (Cross-references)
Verwijzingen naar gerelateerde hoofdonderwerpen:
- Broodje Kroket → **ontdooien in magnetron** (relatie: Magnetron → ontdooien)
- Broodje Kroket → **kroket bakken in frituur** (relatie: Frituur → bakken)
- Broodje Kroket → **saus uit koelkast** (relatie: Koelkast → sauzen)

## JSON Metadata Structuur

### Basisstructuur (voor elke video)

```json
{
    "title": "Titel van de video",
    "description": "Beschrijving van de video",
    
    // Vlakke lijst voor filtering (achterwaarts compatibel)
    "onderwerpen": [
        "Keuken",
        "Oven",
        "schoonmaken"
    ],
    
    // Hiërarchische structuur voor suggesties
    "onderwerp_structuur": {
        "hoofdcategorie": "Keuken",
        "hoofonderwerp": "Oven",
        "subonderwerp": "schoonmaken",
        "gerelateerde_onderwerpen": [
            {
                "hoofdcategorie": "Keuken",
                "hoofonderwerp": "Oven",
                "subonderwerp": "aanzetten"
            },
            {
                "hoofdcategorie": "Apparatuur",
                "hoofonderwerp": "Schoonmaakmiddelen",
                "subonderwerp": "gebruik"
            }
        ]
    },
    
    // Ruimtelijke/voorwerpelijke context
    "context": {
        "type": "ruimtelijk", // of "voorwerpelijk"
        "locatie": "Keuken", // optioneel
        "apparaat": null // optioneel
    }
}
```

## Voorbeelden

### Voorbeeld 1: Oven Schoonmaken
```json
{
    "title": "Oven Schoonmaken",
    "description": "Stapsgewijze instructie voor het schoonmaken van de oven",
    "onderwerpen": ["Keuken", "Oven", "schoonmaken", "onderhoud"],
    "onderwerp_structuur": {
        "hoofdcategorie": "Keuken",
        "hoofonderwerp": "Oven",
        "subonderwerp": "schoonmaken",
        "gerelateerde_onderwerpen": [
            {"hoofdcategorie": "Keuken", "hoofonderwerp": "Oven", "subonderwerp": "aanzetten"},
            {"hoofdcategorie": "Apparatuur", "hoofonderwerp": "Schoonmaakmiddelen", "subonderwerp": "gebruik"}
        ]
    },
    "context": {
        "type": "ruimtelijk",
        "locatie": "Keuken"
    }
}
```

### Voorbeeld 2: Broodje Kroket Maken
```json
{
    "title": "Broodje Kroket Maken",
    "description": "Compleet proces voor het maken van een broodje kroket",
    "onderwerpen": ["Producten", "Broodje Kroket", "benodigdheden", "handelingen"],
    "onderwerp_structuur": {
        "hoofdcategorie": "Producten",
        "hoofonderwerp": "Broodje Kroket",
        "subonderwerp": "handelingen",
        "gerelateerde_onderwerpen": [
            {"hoofdcategorie": "Keuken", "hoofonderwerp": "Magnetron", "subonderwerp": "ontdooien"},
            {"hoofdcategorie": "Keuken", "hoofonderwerp": "Frituur", "subonderwerp": "bakken"},
            {"hoofdcategorie": "Keuken", "hoofonderwerp": "Koelkast", "subonderwerp": "sauzen"}
        ]
    },
    "context": {
        "type": "voorwerpelijk",
        "product": "Broodje Kroket"
    }
}
```

### Voorbeeld 3: Bier Tappen
```json
{
    "title": "Bier Tappen",
    "description": "Instructie voor het correct tappen van bier",
    "onderwerpen": ["Bar", "Bier Tappen", "tappen", "voorbereiding"],
    "onderwerp_structuur": {
        "hoofdcategorie": "Bar",
        "hoofonderwerp": "Bier Tappen",
        "subonderwerp": "tappen",
        "gerelateerde_onderwerpen": [
            {"hoofdcategorie": "Bar", "hoofonderwerp": "Bier Tappen", "subonderwerp": "voorbereiding"},
            {"hoofdcategorie": "Bar", "hoofonderwerp": "Bier Tappen", "subonderwerp": "afronden"},
            {"hoofdcategorie": "Apparatuur", "hoofonderwerp": "Biertap", "subonderwerp": "onderhoud"}
        ]
    },
    "context": {
        "type": "ruimtelijk",
        "locatie": "Bar"
    }
}
```

## Suggestie Algoritme

Wanneer een gebruiker een video bekijkt, kunnen de volgende suggesties worden getoond:

1. **Zelfde hoofdonderwerp, andere subonderwerpen**
   - Als gebruiker "Oven Schoonmaken" bekijkt → suggesteer "Oven Aanzetten", "Oven Bedienen"

2. **Gerelateerde onderwerpen uit metadata**
   - Als gebruiker "Broodje Kroket Maken" bekijkt → suggesteer "Magnetron Ontdooien", "Frituur Bakken"

3. **Zelfde hoofdcategorie**
   - Als gebruiker "Oven Schoonmaken" bekijkt → suggesteer andere Keuken-video's

4. **Zelfde context type**
   - Als gebruiker een ruimtelijke video bekijkt → suggesteer andere ruimtelijke video's

## Implementatie Stappen

### Fase 1: Basisstructuur
1. Voeg `onderwerpen` array toe aan alle bestaande video's (vlakke lijst)
2. Pas de server aan om `onderwerpen` te lezen
3. Vervang alle "tags" door "onderwerpen" in de UI

### Fase 2: Hiërarchische structuur (optioneel)
1. Voeg `onderwerp_structuur` toe aan nieuwe video's
2. Implementeer suggestie-algoritme
3. Voeg visuele hiërarchie toe in de UI (bv. broodkruimels)

### Fase 3: Geavanceerde functies
1. Filteren op hoofdcategorie
2. Filteren op hoofdonderwerp
3. Automatische suggesties na afspelen
4. "Misschien ook interessant" sectie

## Backward Compatibility

- Het `tags` veld blijft bestaan voor backward compatibility
- Als `onderwerpen` ontbreekt, wordt `tags` gebruikt
- De API `/api/tags` redirect naar `/api/onderwerpen`
