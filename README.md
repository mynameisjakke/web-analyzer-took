# Webbanalysverktyg

Detta script är utformat för att analysera domäner och deras undersidor och generera en JSON-fil som innehåller detaljerad information om:

- Antalet analyserade undersidor.
- Kakor (cookies) som används på varje undersida, inklusive deras kategorisering.
- Om en undersida innehåller ett formulär, samt URL:en till undersidor med formulär.
- Om en undersida innehåller en Google Maps-integration, samt URL:en till dessa undersidor.

Programmet är anpassat för att hantera många domäner och sidor och inkluderar optimeringar för att förbättra prestanda och säkerställa att irrelevanta eller oönskade sidor inte analyseras.

---

## **Installation**

### 1. Installera Node.js  
Se till att Node.js är installerat på din dator. Du kan ladda ner det från [Node.js officiella webbplats](https://nodejs.org/).

### 2. Klona eller ladda ner projektet  
Kopiera detta script till din lokala dator.

### 3. Installera nödvändiga beroenden  
Kör följande kommando i projektets katalog för att installera alla bibliotek:
```bash
npm install puppeteer csv-parser robots-parser
```

### 4. Förbered din CSV-fil
Skapa en fil med namnet domains.csv och placera den i samma katalog som scriptet. Filen ska innehålla en lista över domäner som ska analyseras. Exempel:
```bash
domain
https://example.com
https://anotherdomain.com
```

## **Användning**

### 1. Kör scriptet
Använd följande kommando för att starta analysen:
```bash
node script.js
```

### 2. Resultat
När scriptet körs färdigt genereras en JSON-fil i mappen analysis/ med ett namn baserat på datum och tid. Filen innehåller resultat från analysen.

### 3. Loggning
Alla sidor som hoppats över loggas i logs/skipped_pages.log, tillsammans med orsaken till varför de inte analyserades.

## **Funktioner**

### 1. Dynamisk upptäckt av undersidor
Scriptet upptäcker och analyserar undersidor för varje domän baserat på interna länkar.


### 2. Filter för att undvika oönskade sidor
Följande sidor undantas från analys:
- URL:er med “?” (query parameters).
- URL:er med ankare (#).
- Filer som PDF, DOCX, etc.
- WordPress-relaterade sidor (wp-content).
- Arkivsidor (nyheter, fallstudier, etc.).
- Inloggningssidor och portalsidor (/login, /portal, /admin).

### 3. Respekt för robots.txt
Scriptet kontrollerar och respekterar regler i varje domäns robots.txt för att säkerställa att förbjudna sidor inte analyseras.

### 4. Optimerad prestanda
- Max antal samtidiga analyser är begränsat till 5.
- Undersidor som tar för lång tid att ladda hoppas över automatiskt.
- Redirekts (301/302) och sidor som inte returnerar statuskod 200 hoppas över.

### 5. Unvik dubletter
Scriptet håller reda på redan analyserade undersidor och analyserar inte samma sida mer än en gång.

### 6. Språkigenkänning
Om en domän har undersidor på flera språk analyseras endast sidor på ett språk.

### 7. Resultat i JSON-format
Varje analys genererar en JSON-fil som innehåller:
- Antalet undersidor som analyserades.
- Det totala antalet kakor som hittades.
- Vilka undersidor som innehåller formulär.
- Vilka undersidor som innehåller Google Maps-integration.

### 8. Användaragent
Scriptet använder en realistisk användaragent för att undvika att blockeras av servrar.

### 9. Loggning av hoppade sidor
Sidor som inte analyseras loggas tillsammans med anledningen, exempelvis:
- Om sidan returnerar en annan status än 200.
- Om sidan har ett långsamt laddningstid.

## **JSON-struktur**

Exempel på resultatet i JSON-format:

```bash
{
  "https://example.com": {
    "totalSubpagesAnalyzed": 10,
    "totalCookiesFound": 5,
    "subpagesWithForms": [
      "https://example.com/contact",
      "https://example.com/signup"
    ],
    "subpagesWithGoogleMaps": [
      "https://example.com/location"
    ],
    "subpages": [
      {
        "url": "https://example.com",
        "cookies": [
          { "name": "session_id", "type": "session" },
          { "name": "analytics", "type": "analytics" }
        ],
        "hasForm": true,
        "hasGoogleMaps": false
      }
    ]
  }
}
```

## **Felsökning**
Scriptet avslutas inte korrekt

Om scriptet inte avslutas automatiskt efter att analysen är klar, kontrollera att process.exit(0) finns i slutet av scriptet.

Problem med Puppeteer

Om Puppeteer har problem att starta, installera nödvändiga beroenden:
```bash
apt-get install libnss3 libatk1.0-0 libx11-xcb1
```

## **Att tänka på**
- Scriptet är anpassat för att hantera många domäner, men om du arbetar med väldigt stora dataset (1000+ undersidor) kan det ta tid. Öka prestandan genom att justera MAX_CONCURRENT_PAGES i scriptet.
- Kontrollera att dina domäner inte är blockerade av brandväggar eller andra säkerhetsåtgärder.

## **Framtida förbättringar**
- Implementera stöd för parallellkörning över flera CPU-kärnor.
- Lägg till fler filter för att undvika irrelevanta sidor. 
- Förbättra identifieringen av specifika typer av innehåll som kräver ytterligare anpassning.



