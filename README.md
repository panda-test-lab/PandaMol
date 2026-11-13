<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9765423d-581f-45eb-be54-fc1e1deade5f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Netzwerkzugriff und Protokolle

PubChem PUG REST und der NCI/CADD Resolver werden ausschließlich über HTTPS
abgefragt. Der lokale Express-Server bindet standardmäßig nur an `127.0.0.1`.
Für einen gezielten Netzwerkzugriff kann `HOST` gesetzt werden; öffentliche
Bereitstellungen sollten TLS über einen Reverse Proxy terminieren.

Serverereignisse werden ohne eingegebene Suchbegriffe in `logs/pandamol.log`
geschrieben. Mit `PANDAMOL_LOG_DIR` lässt sich ein anderes Logverzeichnis
festlegen. Tauri protokolliert Fehler im plattformspezifischen App-Logverzeichnis.
