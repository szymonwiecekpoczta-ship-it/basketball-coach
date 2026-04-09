// =====================================================
// HEALTH CONNECT API
// Pobieranie danych z Amazfit (przez Health Connect na Androidzie)
// =====================================================

// Sprawdź czy Health Connect jest dostępny w tej przeglądarce
export function isHealthConnectAvailable() {
  // navigator.health to interfejs Health Connect w Chrome na Androidzie
  return 'health' in navigator;
}

// Poproś o dostęp do danych zdrowotnych
// Wywołaj raz przy pierwszym uruchomieniu apki
export async function requestHealthPermissions() {
  if (!isHealthConnectAvailable()) {
    console.warn('Health Connect niedostępny — używam danych testowych');
    return false;
  }
  
  try {
    // Poproś o dostęp do konkretnych typów danych
    const granted = await navigator.health.requestPermission([
      { dataType: 'steps' },             // kroki
      { dataType: 'sleep' },             // sen
      { dataType: 'heart_rate' },        // tętno
      { dataType: 'heart_rate_variability' }  // HRV
    ]);
    return granted;
  } catch (err) {
    console.error('Błąd uprawnień Health Connect:', err);
    return false;
  }
}

// Pobierz kroki z DZISIAJ
export async function getTodaySteps() {
  if (!isHealthConnectAvailable()) {
    // Dane testowe gdy Health Connect niedostępny (np. na komputerze)
    return Math.floor(Math.random() * 12000) + 3000;
  }
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);  // Początek dzisiejszego dnia (00:00:00)
    
    const records = await navigator.health.readRecords('steps', {
      timeRangeFilter: {
        startTime: today.toISOString(),
        endTime: new Date().toISOString()  // Teraz
      }
    });
    
    // Zsumuj wszystkie rekordy kroków z dzisiaj
    const totalSteps = records.reduce((sum, record) => sum + record.count, 0);
    return totalSteps;
  } catch (err) {
    console.error('Błąd pobierania kroków:', err);
    return 0;
  }
}

// Pobierz dane snu z ostatniej nocy
export async function getLastNightSleep() {
  if (!isHealthConnectAvailable()) {
    // Dane testowe
    return { hours: 7.2, quality: 72, deep: 1.8, rem: 1.5 };
  }
  
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(20, 0, 0, 0);  // Od 20:00 wczoraj
    
    const today = new Date();
    today.setHours(12, 0, 0, 0);  // Do 12:00 dzisiaj
    
    const records = await navigator.health.readRecords('sleep', {
      timeRangeFilter: {
        startTime: yesterday.toISOString(),
        endTime: today.toISOString()
      }
    });
    
    if (records.length === 0) return { hours: 0, quality: 0, deep: 0, rem: 0 };
    
    // Weź najdłuższą sesję snu (właściwy sen nocny)
    const mainSleep = records.reduce((longest, r) => 
      r.duration > longest.duration ? r : longest
    );
    
    const sleepHours = mainSleep.duration / 3600000;  // ms → godziny
    
    return {
      hours: Math.round(sleepHours * 10) / 10,  // np. 7.2
      quality: mainSleep.efficiency || 70,
      // Fazy snu (jeśli Amazfit je podaje)
      deep: mainSleep.stages?.deep ? mainSleep.stages.deep / 3600000 : 0,
      rem: mainSleep.stages?.rem ? mainSleep.stages.rem / 3600000 : 0
    };
  } catch (err) {
    console.error('Błąd pobierania snu:', err);
    return { hours: 0, quality: 0, deep: 0, rem: 0 };
  }
}

// Pobierz HRV z ostatnich 7 dni
export async function getHRVHistory(days = 7) {
  if (!isHealthConnectAvailable()) {
    // Dane testowe — tablica 7 wartości HRV
    return [42, 48, 45, 43, 50, 47, 44];
  }
  
  try {
    const result = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const records = await navigator.health.readRecords('heart_rate_variability', {
        timeRangeFilter: {
          startTime: date.toISOString(),
          endTime: endDate.toISOString()
        }
      });
      
      if (records.length > 0) {
        // Średnia HRV z dnia
        const avgHRV = records.reduce((s, r) => s + r.heartRateVariabilityMillis, 0) / records.length;
        result.push(Math.round(avgHRV));
      }
    }
    
    return result;
  } catch (err) {
    console.error('Błąd pobierania HRV:', err);
    return [];
  }
}

// KOMPLETNA synchronizacja wszystkich danych zdrowotnych
// Wywołaj rano — zapisuje wszystko do Firebase
export async function syncHealthData(saveToFirebase) {
  const [steps, sleep, hrvHistory] = await Promise.all([
    getTodaySteps(),
    getLastNightSleep(),
    getHRVHistory(7)
  ]);
  
  const healthData = {
    steps,
    sleepHours: sleep.hours,
    sleepQuality: sleep.quality,
    hrv: hrvHistory[0] || 0,  // Dzisiejsze HRV (pierwsze = najnowsze)
    hrvHistory,
    syncedAt: new Date().toISOString()
  };
  
  // Zapisz do Firebase
  await saveToFirebase(healthData);
  
  return healthData;
}
