const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { URL } = require('url');
const robotsParser = require('robots-parser');

// Max concurrent pages to analyze at the same time
const MAX_CONCURRENT_PAGES = 5;

// Säkerställ att mappar för analys och loggning finns
function ensureFoldersExist() {
    const dirs = ['analysis', 'logs'];
    dirs.forEach((dir) => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath);
        }
    });
}

// Spara resultat som JSON-fil med tidsstämpel
function saveResultsToJSON(results) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-'); // Ersätt ':' och '.' med '-'
    const filePath = path.join(__dirname, 'analysis', `${timestamp}.json`);

    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    console.log(`Resultat sparat till ${filePath}`);
}

// Logga hoppsedda sidor och orsaker
function logSkippedPage(domain, url, reason) {
    const logPath = path.join(__dirname, 'logs', 'skipped_pages.log');
    const logMessage = `[${new Date().toISOString()}] Domain: ${domain}, URL: ${url}, Reason: ${reason}\n`;

    fs.appendFileSync(logPath, logMessage);
}

// Läs domäner från CSV-fil
function readDomainsFromCSV(filePath) {
    return new Promise((resolve, reject) => {
        const domains = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                const domain = row['domain'] || row['Domain']; // Anpassa efter CSV-kolumn
                if (domain) domains.push(domain);
            })
            .on('end', () => resolve(domains))
            .on('error', (err) => reject(err));
    });
}

// Validera URL:er enligt regler
function isValidUrl(url) {
    const forbiddenPatterns = [
        /\?/,               // Hoppa över URL:er med frågetecken
        /#/,                // Hoppa över URL:er med ankare
        /\.(pdf|docx?|xlsx)$/i, // Hoppa över filer (t.ex. PDF, DOCX)
        /wp-content/i,      // Hoppa över WordPress-relaterade sidor
        /archives|news|case/i, // Hoppa över arkivsidor eller enskilda artiklar/case
        /login|portal|admin/i // Hoppa över inloggningssidor eller portalsidor
    ];

    return !forbiddenPatterns.some((pattern) => pattern.test(url));
}

// Hämta och analysera robots.txt
async function fetchRobotsTxt(domain) {
    try {
        const response = await fetch(`${domain}/robots.txt`);
        if (response.ok) {
            const robotsTxt = await response.text();
            return robotsParser(`${domain}/robots.txt`, robotsTxt);
        }
    } catch (err) {
        console.warn(`Kunde inte hämta robots.txt för ${domain}: ${err.message}`);
    }
    return null;
}

// Hitta alla giltiga länkar på en sida och filtrera på språk
async function findSubpages(domain, robots, maxDepth = 2) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36'
    );

    const visited = new Set();
    const queue = [{ url: domain, depth: 0 }];
    const subpages = [];

    try {
        while (queue.length > 0) {
            const { url: currentUrl, depth } = queue.shift();
            if (depth > maxDepth || visited.has(currentUrl)) continue;

            // Kolla robots.txt regler
            if (robots && !robots.isAllowed(currentUrl)) {
                logSkippedPage(domain, currentUrl, 'Disallowed by robots.txt');
                continue;
            }

            console.log(`Besöker: ${currentUrl}`);
            visited.add(currentUrl);

            try {
                const response = await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                // Hoppa över om sidan är en redirect
                if (!response || response.status() !== 200 || response.status() >= 300) {
                    logSkippedPage(domain, currentUrl, 'Non-200 response or redirect');
                    continue;
                }

                const links = await page.$$eval('a[href]', (anchors) =>
                    anchors.map((a) => a.href).filter((href) => !href.startsWith('#') && !href.includes('mailto:') && !href.includes('tel:'))
                );

                links.forEach((link) => {
                    try {
                        const linkUrl = new URL(link, currentUrl).href;
                        if (isValidUrl(linkUrl) && linkUrl.startsWith(domain) && !visited.has(linkUrl)) {
                            // Filtrera URL:er för språk (t.ex. skippe URL med språkprefix)
                            if (!visited.has(linkUrl)) {
                                visited.add(linkUrl);
                                queue.push({ url: linkUrl, depth: depth + 1 });
                                subpages.push(linkUrl);
                            }
                        }
                    } catch (err) {
                        // Ignorera ogiltiga URL:er
                    }
                });
            } catch (err) {
                logSkippedPage(domain, currentUrl, `Error: ${err.message}`);
            }
        }
    } catch (error) {
        console.error(`Fel vid sökning av undersidor för ${domain}: ${error.message}`);
    } finally {
        await browser.close();
    }

    return Array.from(new Set(subpages)); // Ta bort dubbletter
}

// Funktion för att analysera varje undersida
async function analyzePage(url) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const result = {
        url,
        cookies: [],
        hasForm: false,
        hasGoogleMaps: false,
    };

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Kolla efter cookies
        const cookies = await page.cookies();
        result.cookies = cookies.map(cookie => ({ name: cookie.name, type: cookie.domain }));

        // Kolla efter formulär
        const formExists = await page.$('form');
        if (formExists) {
            result.hasForm = true;
        }

        // Kolla efter Google Maps iframe
        const googleMaps = await page.$$eval('iframe', (frames) =>
            frames.some((frame) => frame.src && frame.src.includes('google.com/maps'))
        );
        result.hasGoogleMaps = googleMaps;

    } catch (err) {
        console.error(`Fel vid analys av ${url}: ${err.message}`);
    } finally {
        await browser.close();
    }

    return result;
}

// Processa alla domäner parallellt med begränsad samtidig bearbetning
async function processDomains(domains) {
    const results = {};

    for (const domain of domains) {
        console.log(`Bearbetar domän: ${domain}`);
        const robots = await fetchRobotsTxt(domain);
        const subpages = await findSubpages(domain, robots);

        const domainResult = {
            totalSubpagesAnalyzed: subpages.length,
            totalCookiesFound: 0,
            subpagesWithForms: [],
            subpagesWithGoogleMaps: [],
            subpages: [],
        };

        // Analysera varje undersida parallellt men med begränsning
        const analysisPromises = subpages.map((subpage) => analyzePage(subpage));
        const chunkedAnalysisPromises = [];

        while (analysisPromises.length) {
            chunkedAnalysisPromises.push(Promise.all(analysisPromises.splice(0, MAX_CONCURRENT_PAGES)));
        }

        for (const chunk of chunkedAnalysisPromises) {
            const chunkResults = await chunk;
            chunkResults.forEach((analysis) => {
                if (!analysis) return;

                domainResult.totalCookiesFound += analysis.cookies.length;
                domainResult.subpages.push(analysis);

                if (analysis.hasForm) {
                    domainResult.subpagesWithForms.push(analysis.url);
                }
                if (analysis.hasGoogleMaps) {
                    domainResult.subpagesWithGoogleMaps.push(analysis.url);
                }
            });
        }

        results[domain] = domainResult;
    }

    return results;
}

// Huvudfunktion
(async () => {
    const domainsCSV = 'domains.csv'; // Ersätt med din CSV-filväg

    ensureFoldersExist();

    try {
        const domains = await readDomainsFromCSV(domainsCSV);
        const results = await processDomains(domains);
        saveResultsToJSON(results);
        process.exit(0); // Avsluta skriptet korrekt efter att alla sidor är analyserade
    } catch (error) {
        console.error(`Fel: ${error.message}`);
    }
})();