// Wszystkie funkcje AI — rozpoznawanie posiłków, analiza rzutu, trener
// Używamy Gemini 1.5 Flash — darmowy, szybki, świetny do zdjęć i wideo

// WAŻNE: Wklej swój klucz API z Google AI Studio
const GEMINI_API_KEY = 'WKLEJ_SWOJ_KLUCZ_API';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// =====================================================
// POMOCNICZA FUNKCJA — wysyłanie zapytania do Gemini
// =====================================================

// parts = tablica treści (tekst, zdjęcie)
// Zwraca odpowiedź tekstową od AI
async function callGemini(parts) {
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }]
    })
  });
  
  if (!response.ok) {
    throw new Error(`Błąd Gemini API: ${response.status}`);
  }
  
  const data = await response.json();
  // Wyciągnij tekst odpowiedzi z zagnieżdżonej struktury JSON
  return data.candidates[0].content.parts[0].text;
}

// =====================================================
// FUNKCJA 1: ROZPOZNAWANIE KALORII ZE ZDJĘCIA
// =====================================================

// imageFile = obiekt File (zdjęcie z aparatu lub galerii)
// Zwraca: { calories, protein, carbs, fat, items, warning }
export async function analyzeMealPhoto(imageFile) {
  // Zamień zdjęcie na format base64 (ciąg znaków reprezentujący obraz)
  const base64Image = await fileToBase64(imageFile);
  
  // Przygotuj zapytanie do AI z instrukcją co ma zwrócić
  const prompt = `Jesteś dietetykiem sportowym. Przeanalizuj to zdjęcie posiłku.

Zwróć odpowiedź TYLKO w formacie JSON (bez żadnego innego tekstu):
{
  "items": ["lista rozpoznanych produktów"],
  "calories": liczba_kalorii,
  "protein": gramy_białka,
  "carbs": gramy_węglowodanów,
  "fat": gramy_tłuszczu,
  "healthScore": ocena_1_do_10,
  "warning": "ostrzeżenie jeśli posiłek jest niezdrowy lub przekaloryczny, null jeśli ok",
  "advice": "krótka porada dla koszykarza"
}`;

  const response = await callGemini([
    { text: prompt },
    {
      inlineData: {
        mimeType: imageFile.type,  // np. "image/jpeg"
        data: base64Image          // samo zdjęcie jako base64
      }
    }
  ]);
  
  // Sparsuj JSON z odpowiedzi AI
  try {
    // Usuń ewentualne znaczniki markdown ```json które AI czasem dodaje
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Błąd parsowania odpowiedzi AI:', e);
    return { error: 'Nie udało się przeanalizować zdjęcia', raw: response };
  }
}

// =====================================================
// FUNKCJA 2: ANALIZA RZUTU WIDEO
// =====================================================

// videoFile = krótki filmik (max ~30 sekund, format mp4/webm)
export async function analyzeShotVideo(videoFile) {
  const base64Video = await fileToBase64(videoFile);
  
  const prompt = `Jesteś trenerem koszykówki na poziomie NBA. Przeanalizuj ten filmik z rzutem koszykarskim.

Oceń każdy element mechaniki rzutu w skali 1-10 i podaj konkretne wskazówki.

Odpowiedź TYLKO w formacie JSON:
{
  "overallScore": ocena_ogólna_1_do_100,
  "mechanics": {
    "elbowAngle": {"score": 1-10, "feedback": "opis"},
    "footPosition": {"score": 1-10, "feedback": "opis"},
    "releasePoint": {"score": 1-10, "feedback": "opis"},
    "followThrough": {"score": 1-10, "feedback": "opis"},
    "balance": {"score": 1-10, "feedback": "opis"},
    "arc": {"score": 1-10, "feedback": "opis"}
  },
  "topStrengths": ["2-3 mocne strony"],
  "topImprovements": ["2-3 najważniejsze poprawki"],
  "curryComparison": "porównanie z mechaniką rzutu Stepha Curry'ego",
  "drills": [
    {"name": "nazwa ćwiczenia", "description": "opis", "reps": "powtórzenia"}
  ]
}`;

  const response = await callGemini([
    { text: prompt },
    {
      inlineData: {
        mimeType: videoFile.type,
        data: base64Video
      }
    }
  ]);
  
  try {
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return { error: 'Analiza wideo nie powiodła się', raw: response };
  }
}

// =====================================================
// FUNKCJA 3: AI TRENER — dynamiczne porady
// =====================================================

// rtpData = wynik z calculateRTP()
// recentWorkouts = ostatnie 5 treningów z bazy danych
// healthData = dane z Health Connect (sen, HRV, kroki)
export async function getAICoachAdvice(rtpData, recentWorkouts, healthData) {
  const prompt = `Jesteś elitarnym trenerem koszykówki i siły & kondycji. 
Zawodnik ma 31 lat, 175cm, 84kg (cel: 73-75kg), gra w koszykówkę rekreacyjnie.
Wzorzec motywacyjny: Steph Curry.

DANE DZISIEJSZE:
- RTP (gotowość do treningu): ${rtpData.total}/100 (${rtpData.label})
- Sen: ${healthData.sleepHours}h, jakość: ${healthData.sleepQuality}%
- HRV: ${healthData.hrv} (7-dniowa średnia: ${healthData.avgHRV})
- Kroki dzisiaj: ${healthData.steps.toLocaleString()} / cel: 10,000

OSTATNIE TRENINGI:
${recentWorkouts.map(w => `- ${w.date}: Trening ${w.type}, objętość: ${w.totalVolume}kg`).join('\n')}

PYTANIE: Jaki trening zalecasz dzisiaj? 
Podaj konkretne modyfikacje do Treningu A lub B (zmniejsz/zwiększ ciężary, zamień ćwiczenia, skróć trening).
Jeśli RTP < 40, zaproponuj aktywną regenerację zamiast treningu.
Jeśli kroki < 8000, zaproponuj konkretny sposób na zwiększenie aktywności bazowej.

Odpowiedź po polsku, krótka, konkretna, motywująca.`;

  return await callGemini([{ text: prompt }]);
}

// =====================================================
// PORANNY RAPORT MOTYWACYJNY
// =====================================================

export async function generateMorningReport(rtpData, healthData, weeklyStats) {
  const prompt = `Napisz krótki, motywujący raport poranny dla koszykarza.
Styl: Bezpośredni, jak asystent Stepha Curry'ego. Max 4 zdania.

DANE:
- RTP: ${rtpData.total}/100
- Sen: ${healthData.sleepHours}h (Curry śpi 8.5h)
- HRV: ${healthData.hrv}
- Kroki wczoraj: ${healthData.yesterdaySteps.toLocaleString()}
- Tygodniowe kroki: ${weeklyStats.avgDailySteps.toLocaleString()} średnio/dzień

Zawrzyj konkretne liczby. Zakończ wezwaniem do działania na dziś.
Odpowiedź po polsku.`;

  return await callGemini([{ text: prompt }]);
}

// =====================================================
// POMOCNICZA FUNKCJA — zamień plik na base64
// =====================================================

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Gdy plik jest wczytany — wywołaj resolve z danymi
    reader.onload = () => {
      // Usuń nagłówek "data:image/jpeg;base64," — zostaw tylko dane
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);  // Wczytaj plik jako URL z base64
  });
}
