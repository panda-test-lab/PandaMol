import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { AiDisambiguator } from '../src/chemistry/coreResolver.ts';
import { logServerEvent } from './logger.ts';

export const disambiguateWithGemini: AiDisambiguator = async (
  query,
  specifications,
  projections
) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const prompt = `Du bist ein streng wissenschaftlicher pharmazeutisch-chemischer Nomenklatur-Übersetzer.
Eingabe des Pharmaziestudenten:
- Bezeichnung: "${query}"
- Weitere Spezifikationen: "${specifications || 'keine'}"
- Gewählte Darstellungen: ${projections.join(', ')}

Aufgabe:
1. Prüfe zuerst, ob die Anfrage chemisch überhaupt existiert/sinnvoll ist (z. B. existiert "D-Glycin", "L-Benzol", "5-bindiger Kohlenstoff" oder eine erfundene Substanz NICHT -> setze possible=false und erkläre kurz auf Deutsch warum).
2. Falls die Substanz real existiert, gib 1 bis 3 exakte englische/IUPAC-Suchbegriffe für die PubChem-Datenbank zurück (z. B. "S-ibuprofen", "(2S)-2-aminopropanoic acid", "alpha-D-glucopyranose", "aldehydo-D-glucose").
3. WICHTIG: Erfinde NIEMALS SMILES, Formeln oder fiktive Namen. Gib nur echte chemische Suchnamen zurück. Wenn bei Sacchariden sowohl Fischer (offenkettig) als auch Haworth/Sessel (zyklisch) gewählt wurden, liefere getrennte Einträge für die offenkettige (aldehydo-/keto-) Form und die zyklischen Anomere.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            possible: { type: Type.BOOLEAN },
            rejectionReason: { type: Type.STRING },
            interpretedNote: { type: Type.STRING },
            queries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  searchName: { type: Type.STRING },
                  germanName: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  isOpenChainForFischer: { type: Type.BOOLEAN },
                },
                required: ['searchName', 'germanName', 'subtitle'],
              },
            },
          },
          required: ['possible', 'interpretedNote', 'queries'],
        },
      },
    });

    const raw = (response.text ?? '').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    await logServerEvent({
      event: 'gemini_disambiguation_failed',
      provider: 'Gemini',
      operation: 'name-disambiguation',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return null;
  }
};
