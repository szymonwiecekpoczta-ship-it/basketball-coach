// app.js — "mózg" całej aplikacji
// Łączy ze sobą wszystkie moduły

import { saveWorkout, saveWeightData, saveRTP, saveHealthData, 
         getRecentWorkouts, getWeightHistory, getLast7DaysHealth,
         uploadMealPhoto, uploadShotVideo, registerPushNotifications } from './firebase.js';
import { calculateRTP, detectOvertrainingRisk, getCurryComparison, STEP_GOALS } from './rtp.js';
import { analyzeMealPhoto, analyzeShotVideo, getAICoachAdvice, generateMorningReport } from './ai.js';
import { syncHealthData, requestHealthPermissions } from './health.js';

// =====================================================
// PLANY TRENINGOWE — zakodowane w aplikacji
// =====================================================

const WORKOUT_PLANS = {
  A: {
    name: 'Trening A — Nogi, Moc i Góra',
    exercises: [
      { name: 'Low Pogo Jumps', sets: 3, reps: '15-20', type: 'cardio', unit: 'kontaktów' },
      { name: 'Skok w dal z miejsca', sets: 3, reps: 4, type: 'cardio', unit: 'skoków' },
      { name: 'Half-Kneeling KB Snatch', sets: 3, reps: '6/rękę', type: 'strength', unit: 'reps', hasWeight: true },
      { name: 'Front Squat', sets: 4, reps: '4-6', type: 'strength', unit: 'reps', hasWeight: true },
      { name: 'Wyciskanie leżąc', sets: 4, reps: '5-7', type: 'strength', unit: 'reps', hasWeight: true },
      { name: 'Z-Press', sets: 3, reps: '8-10', type: 'strength', unit: 'reps', hasWeight: true }
    ]
  },
  B: {
    name: 'Trening B — Tylna Taśma',
    exercises: [
      { name: 'KB Swing', sets: 4, reps: '12-15', type: 'strength', unit: 'reps', hasWeight: true },
      { name: 'RDL', sets: 4, reps: '5-7', type: 'strength', unit: 'reps', hasWeight: true },
      { name: 'Lateral Lunges Goblet', sets: 3, reps: '8-10/nogę', type: 'strength', unit: 'reps', hasWeight: true },
      { name: 'Gorilla Row', sets: 4, reps: '8/stronę', type: 'strength', unit: 'reps', hasWeight: true },
      { name: 'Protokół Podciągania', sets: 4, reps: 'max', type: 'bodyweight', unit: 'reps' },
      { name: 'Plank anti-rotation', sets: 3, reps: '45 sek', type: 'timed', unit: 'sek' }
    ]
  }
};

// =====================================================
// STAN APLIKACJI — aktualne dane wyświetlane na ekranie
// =====================================================

let appState = {
  currentScreen: 'dashboard',
  currentWorkout: null,        // Aktywna sesja treningowa
  workoutStartTime: null,      // Kiedy zaczął trening
  workoutSets: {},             // { exerciseName: [ {reps, weight}, ... ] }
  dailyCalories: 0,
  dailyProtein: 0,
  dailyCarbs: 0,
  dailyFat: 0,
  shotsData: { made: 0, attempted: 0 },
  healthData: null,
  rtpData: null
};

// =====================================================
// INICJALIZACJA APLIKACJI
// — wywołane gdy strona się ładuje
// =====================================================

async function initApp() {
  console.log('Inicjalizacja Basketball Coach AI...');
  
  // 1. Poproś o uprawnienia Health Connect
  await requestHealthPermissions();
  
  // 2. Poproś o uprawnienia do powiadomień
  await registerPushNotifications();
  
  // 3. Synchronizuj dane zdrowotne
  const healthData = await syncHealthData(saveHealthData);
  appState.healthData = healthData;
  
  // 4. Oblicz RTP
  const last7Days = await getLast7DaysHealth();
  const rtpData = calculateRTP({
    sleepHours: healthData.sleepHours,
    sleepQuality: healthData.sleepQuality,
    hrv: healthData.hrv,
    hrvHistory: healthData.hrvHistory,
    steps: healthData.steps
  });
  appState.rtpData = rtpData;
  
  // Zapisz RTP w Firebase
  await saveRTP(rtpData.total, rtpData.components);
  
  // 5. Zaktualizuj UI dashboardu
  updateDashboard(rtpData, healthData);
  
  // 6. Wygeneruj poranny raport (async — nie blokuje ładowania)
  generateMorningReportAsync(rtpData, healthData);
  
  // 7. Załaduj historię treningów
  loadWorkoutHistory();
  
  // 8. Załaduj historię wagi
  loadWeightHistory();
  
  // 9. Ustaw nawigację
  setupNavigation();
  
  // 10. Sprawdź ostrzeżenia o przetrenowaniu
  const overtrained = detectOvertrainingRisk(last7Days);
  if (overtrained && overtrained.risk !== 'low') {
    showAlert(overtrained.message, overtrained.risk === 'high' ? 'danger' : 'warning');
  }
  
  // 11. Ustaw automatyczne odświeżanie kroków co 5 minut
  setInterval(updateStepsDisplay, 5 * 60 * 1000);
}

// =====================================================
// AKTUALIZACJA DASHBOARDU
// =====================================================

function updateDashboard(rtpData, healthData) {
  // RTP Score
  const scoreEl = document.getElementById('rtp-score');
  const badgeEl = document.getElementById('rtp-status-badge');
  const progressEl = document.getElementById('rtp-progress-bar');
  
  if (scoreEl) scoreEl.textContent = rtpData.total;
  if (progressEl) progressEl.style.width = rtpData.total + '%';
  
  // Kolor na podstawie statusu
  const colors = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' };
  if (badgeEl) {
    badgeEl.textContent = rtpData.label;
    badgeEl.style.backgroundColor = colors[rtpData.status];
  }
  
  // Składowe RTP
  const componentsEl = document.getElementById('rtp-components');
  if (componentsEl) {
    const components = [
      { label: 'Sen', value: rtpData.components.sleep, max: 30 },
      { label: 'HRV', value: rtpData.components.hrv, max: 25 },
      { label: 'Kroki', value: rtpData.components.steps, max: 20 },
      { label: 'Odżywianie', value: rtpData.components.nutrition, max: 15 },
      { label: 'Regeneracja', value: rtpData.components.soreness, max: 10 }
    ];
    
    componentsEl.innerHTML = components.map(c => `
      <div class="rtp-component">
        <span class="rtp-component-label">${c.label}</span>
        <div class="rtp-mini-bar-container">
          <div class="rtp-mini-bar" style="width: ${(c.value / c.max) * 100}%"></div>
        </div>
        <span class="rtp-component-value">${c.value}/${c.max}</span>
      </div>
    `).join('');
  }
  
  // Kroki
  updateStepsDisplay(healthData.steps);
  
  // Waga
  updateWeightDisplay();
}

// Aktualizuj wyświetlanie kroków
async function updateStepsDisplay(steps) {
  if (steps === undefined) {
    // Jeśli nie podano — pobierz na nowo
    const { getTodaySteps } = await import('./health.js');
    steps = await getTodaySteps();
  }
  
  const stepsEl = document.getElementById('steps-current');
  const progressEl = document.getElementById('steps-progress');
  const curryEl = document.getElementById('curry-steps-comparison');
  
  if (stepsEl) stepsEl.textContent = steps.toLocaleString('pl-PL');
  
  const percentage = Math.min(100, (steps / 10000) * 100);
  if (progressEl) {
    progressEl.style.width = percentage + '%';
    // Kolor paska kroków
    if (steps >= 10000) progressEl.style.backgroundColor = '#22c55e';       // Zielony — cel!
    else if (steps >= 8000) progressEl.style.backgroundColor = '#84cc16';    // Limonkowy
    else if (steps >= 5000) progressEl.style.backgroundColor = '#f59e0b';    // Żółty
    else progressEl.style.backgroundColor = '#ef4444';                        // Czerwony
  }
  
  // Porównanie z Currym
  if (curryEl) {
    const currySteps = 14000;
    const diff = currySteps - steps;
    if (steps >= 10000) {
      curryEl.textContent = `Cel dzienny osiągnięty! Curry robi ~${currySteps.toLocaleString()} — brakuje Ci ${diff.toLocaleString()} do jego poziomu.`;
      curryEl.style.color = '#22c55e';
    } else {
      curryEl.textContent = `Brakuje Ci ${(10000 - steps).toLocaleString()} kroków do celu. Curry jest o ${diff.toLocaleString()} kroków przed Tobą.`;
      curryEl.style.color = '#f59e0b';
    }
  }
  
  // Kamienie milowe — podświetl gdy osiągnięte
  document.querySelectorAll('.milestone').forEach(el => {
    const milestone = parseInt(el.dataset.steps);
    el.classList.toggle('achieved', steps >= milestone);
  });
}

// =====================================================
// DZIENNIK TRENINGOWY
// =====================================================

// Uruchamia sesję treningową
function startWorkout(type) {
  const plan = WORKOUT_PLANS[type];
  appState.currentWorkout = { type, exercises: plan.exercises, completedSets: {} };
  appState.workoutStartTime = new Date();
  
  // Inicjalizuj strukturę dla każdego ćwiczenia
  plan.exercises.forEach(ex => {
    appState.currentWorkout.completedSets[ex.name] = [];
  });
  
  // Pokaż sekcję aktywnego treningu
  document.getElementById('active-workout-section').classList.remove('hidden');
  document.getElementById('current-workout-title').textContent = plan.name;
  
  // Renderuj ćwiczenia
  renderExercises(plan.exercises);
  
  // Uruchom timer
  startWorkoutTimer();
  
  // Przewiń do sekcji treningu
  document.getElementById('active-workout-section').scrollIntoView({ behavior: 'smooth' });
}

// Renderuje listę ćwiczeń z polami do wpisywania
function renderExercises(exercises) {
  const container = document.getElementById('exercises-list');
  
  container.innerHTML = exercises.map((exercise, index) => `
    <div class="exercise-card" id="exercise-${index}">
      <div class="exercise-header">
        <h4 class="exercise-name">${exercise.name}</h4>
        <span class="exercise-plan">${exercise.sets} x ${exercise.reps}</span>
      </div>
      
      <!-- Serie -->
      <div class="sets-container" id="sets-${index}">
        ${Array.from({length: exercise.sets}, (_, s) => `
          <div class="set-row" id="set-${index}-${s}">
            <span class="set-number">Seria ${s + 1}</span>
            ${exercise.hasWeight ? `
              <input type="number" class="weight-input" placeholder="kg" 
                     id="weight-${index}-${s}" step="0.5">
            ` : ''}
            <input type="number" class="reps-input" placeholder="${exercise.unit}" 
                   id="reps-${index}-${s}">
            <button class="set-done-btn" onclick="completeSet(${index}, ${s})" 
                    id="done-${index}-${s}">✓</button>
          </div>
        `).join('')}
      </div>
      
      <!-- Poprzedni wynik (porównanie) -->
      <div class="previous-result" id="prev-${index}">
        Ładowanie poprzedniego wyniku...
      </div>
    </div>
  `).join('');
  
  // Załaduj poprzednie wyniki dla każdego ćwiczenia
  exercises.forEach((ex, i) => loadPreviousResult(ex.name, i));
}

// Oznacz serię jako ukończoną
function completeSet(exerciseIndex, setIndex) {
  const exercise = appState.currentWorkout.exercises[exerciseIndex];
  const weightEl = document.getElementById(`weight-${exerciseIndex}-${setIndex}`);
  const repsEl = document.getElementById(`reps-${exerciseIndex}-${setIndex}`);
  const doneBtn = document.getElementById(`done-${exerciseIndex}-${setIndex}`);
  
  const weight = weightEl ? parseFloat(weightEl.value) || 0 : 0;
  const reps = parseFloat(repsEl.value) || 0;
  
  if (reps === 0) {
    alert('Wpisz liczbę powtórzeń!');
    return;
  }
  
  // Zapisz dane serii
  appState.currentWorkout.completedSets[exercise.name].push({ weight, reps, volume: weight * reps });
  
  // Wizualne potwierdzenie
  doneBtn.textContent = '✓';
  doneBtn.style.backgroundColor = '#22c55e';
  doneBtn.disabled = true;
  document.getElementById(`set-${exerciseIndex}-${setIndex}`).classList.add('completed');
  
  // Sprawdź rekord osobisty
  checkPersonalRecord(exercise.name, weight, reps);
}

// Ładuje poprzedni wynik z Firebase do porównania
async function loadPreviousResult(exerciseName, index) {
  const el = document.getElementById(`prev-${index}`);
  try {
    const history = await getRecentWorkouts(5);
    const relevant = history.filter(w => w.completedSets && w.completedSets[exerciseName]);
    
    if (relevant.length > 0) {
      const last = relevant[0].completedSets[exerciseName];
      const totalVolume = last.reduce((s, set) => s + set.volume, 0);
      if (el) el.textContent = `Poprzednio: ${last.length} serii, objętość ${totalVolume}kg`;
    } else {
      if (el) el.textContent = 'Pierwszy raz w historii';
    }
  } catch (e) {
    if (el) el.textContent = '';
  }
}

// Sprawdź czy to rekord osobisty
function checkPersonalRecord(exerciseName, weight, reps) {
  // Uproszczona logika — w pełnej wersji pobierz max z Firebase
  const estimated1RM = weight * (1 + reps / 30);  // Wzór Epley'a
  console.log(`${exerciseName}: szacowane 1RM = ${estimated1RM.toFixed(1)}kg`);
  // TODO: porównaj z historycznym max i pokaż badge "REKORD!" jeśli lepiej
}

// Zakończ trening i zapisz w Firebase
async function finishWorkout() {
  if (!appState.currentWorkout) return;
  
  const duration = Math.round((new Date() - appState.workoutStartTime) / 60000);  // minuty
  
  // Oblicz łączny wolumen (kg × powtórzenia)
  let totalVolume = 0;
  Object.values(appState.currentWorkout.completedSets).forEach(sets => {
    sets.forEach(set => { totalVolume += set.volume; });
  });
  
  const workoutData = {
    type: appState.currentWorkout.type,
    date: new Date().toISOString().split('T')[0],
    duration,
    totalVolume: Math.round(totalVolume),
    completedSets: appState.currentWorkout.completedSets
  };
  
  // Zapisz w Firebase
  await saveWorkout(workoutData);
  
  // Pokaż podsumowanie
  showWorkoutSummary(workoutData);
  
  // Wyczyść stan
  appState.currentWorkout = null;
  document.getElementById('active-workout-section').classList.add('hidden');
}

// =====================================================
// KALORIE — ANALIZA ZDJĘCIA
// =====================================================

async function analyzeMeal(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const resultEl = document.getElementById('meal-analysis-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = '<div class="loading-spinner">Analizuję zdjęcie... 🤖</div>';
  
  try {
    const result = await analyzeMealPhoto(file);
    
    if (result.error) {
      resultEl.innerHTML = `<div class="error">Błąd: ${result.error}</div>`;
      return;
    }
    
    // Dodaj do dziennego licznika
    appState.dailyCalories += result.calories;
    appState.dailyProtein += result.protein;
    appState.dailyCarbs += result.carbs;
    appState.dailyFat += result.fat;
    
    // Aktualizuj wyświetlanie kalorii
    updateCalorieDisplay();
    
    // Pokaż wynik
    const isWarning = result.warning || result.healthScore < 5;
    resultEl.innerHTML = `
      <div class="meal-result ${isWarning ? 'warning' : 'success'}">
        <div class="meal-items">${result.items.join(', ')}</div>
        <div class="meal-calories">${result.calories} kcal</div>
        <div class="meal-macros">
          B: ${result.protein}g | W: ${result.carbs}g | T: ${result.fat}g
        </div>
        ${result.warning ? `
          <div class="curry-warning">
            🏀 Curry by nie jadł tego przed treningiem. ${result.warning}
          </div>
        ` : ''}
        ${result.advice ? `<div class="meal-advice">${result.advice}</div>` : ''}
        <button onclick="confirmAddMeal(${JSON.stringify(result).replace(/"/g, '&quot;')})" 
                class="btn-primary btn-sm">Dodaj do dziennika</button>
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<div class="error">Błąd połączenia z AI: ${err.message}</div>`;
  }
}

// Aktualizuj pasek kalorii
function updateCalorieDisplay() {
  const target = 2800;
  const consumed = appState.dailyCalories;
  const percentage = Math.min(100, (consumed / target) * 100);
  
  document.getElementById('calories-consumed').textContent = consumed;
  document.getElementById('protein-consumed').textContent = appState.dailyProtein + 'g';
  document.getElementById('carbs-consumed').textContent = appState.dailyCarbs + 'g';
  document.getElementById('fat-consumed').textContent = appState.dailyFat + 'g';
  
  const bar = document.getElementById('calorie-bar');
  if (bar) {
    bar.style.width = percentage + '%';
    // Kolor: zielony do 90%, żółty 90-110%, czerwony powyżej
    if (percentage > 110) bar.style.backgroundColor = '#ef4444';
    else if (percentage > 90) bar.style.backgroundColor = '#f59e0b';
    else bar.style.backgroundColor = '#22c55e';
  }
}

// =====================================================
// ANALIZA WIDEO RZUTU
// =====================================================

async function analyzeShotVideoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Sprawdź rozmiar (max 20MB dla darmowego Gemini)
  if (file.size > 20 * 1024 * 1024) {
    alert('Wideo za duże! Maksymalnie 20MB. Nagraj krótszy filmik (max 30 sekund).');
    return;
  }
  
  const resultEl = document.getElementById('video-analysis-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = '<div class="loading-spinner">Analizuję Twój rzut... 🎯 To może potrwać 30-60 sekund.</div>';
  
  try {
    const analysis = await analyzeShotVideo(file);
    
    if (analysis.error) {
      resultEl.innerHTML = `<div class="error">${analysis.error}</div>`;
      return;
    }
    
    // Renderuj szczegółowy raport
    resultEl.innerHTML = `
      <div class="shot-analysis">
        <div class="overall-score">
          <span class="score-number">${analysis.overallScore}</span>
          <span class="score-max">/100</span>
          <span class="score-label">Ocena ogólna</span>
        </div>
        
        <div class="mechanics-grid">
          ${Object.entries(analysis.mechanics).map(([key, m]) => `
            <div class="mechanic-item">
              <div class="mechanic-label">${mechanicLabel(key)}</div>
              <div class="mechanic-score" style="color: ${m.score >= 7 ? '#22c55e' : m.score >= 5 ? '#f59e0b' : '#ef4444'}">
                ${m.score}/10
              </div>
              <div class="mechanic-feedback">${m.feedback}</div>
            </div>
          `).join('')}
        </div>
        
        <div class="curry-comparison-shot">
          <h4>vs Steph Curry</h4>
          <p>${analysis.curryComparison}</p>
        </div>
        
        <div class="improvements">
          <h4>Najważniejsze poprawki</h4>
          <ul>${analysis.topImprovements.map(i => `<li>${i}</li>`).join('')}</ul>
        </div>
        
        <div class="drills">
          <h4>Ćwiczenia korekcyjne</h4>
          ${analysis.drills.map(d => `
            <div class="drill-item">
              <strong>${d.name}</strong> — ${d.reps}
              <p>${d.description}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<div class="error">Błąd analizy: ${err.message}</div>`;
  }
}

// Tłumaczenie nazw mechaniki rzutu
function mechanicLabel(key) {
  const labels = {
    elbowAngle: 'Kąt łokcia',
    footPosition: 'Pozycja stóp',
    releasePoint: 'Punkt zwolnienia',
    followThrough: 'Follow-through',
    balance: 'Równowaga',
    arc: 'Łuk piłki'
  };
  return labels[key] || key;
}

// =====================================================
// RZUTY — zapis i statystyki
// =====================================================

function adjustShots(type, delta) {
  if (type === 'made') {
    appState.shotsData.made = Math.max(0, appState.shotsData.made + delta);
    document.getElementById('shots-made').textContent = appState.shotsData.made;
  } else {
    appState.shotsData.attempted = Math.max(0, appState.shotsData.attempted + delta);
    document.getElementById('shots-attempted').textContent = appState.shotsData.attempted;
  }
  
  // Aktualizuj % skuteczności
  const pct = appState.shotsData.attempted > 0 
    ? Math.round((appState.shotsData.made / appState.shotsData.attempted) * 100) 
    : 0;
  document.getElementById('shot-percentage').textContent = pct + '%';
}

async function saveShots() {
  const { made, attempted } = appState.shotsData;
  if (attempted === 0) { alert('Wpisz liczbę oddanych rzutów!'); return; }
  
  const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
  const { db } = await import('./firebase.js');
  
  await addDoc(collection(db, 'shots'), {
    made, attempted,
    percentage: Math.round((made / attempted) * 100),
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date()
  });
  
  // Reset
  appState.shotsData = { made: 0, attempted: 0 };
  document.getElementById('shots-made').textContent = 0;
  document.getElementById('shots-attempted').textContent = 0;
  document.getElementById('shot-percentage').textContent = '--%';
  
  alert('Rzuty zapisane! ');
}

// =====================================================
// NAWIGACJA MIĘDZY EKRANAMI
// =====================================================

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const screenName = btn.dataset.screen;
      
      // Ukryj wszystkie ekrany
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      
      // Pokaż wybrany ekran
      document.getElementById(`screen-${screenName}`).classList.add('active');
      btn.classList.add('active');
      
      appState.currentScreen = screenName;
    });
  });
}

// =====================================================
// POZOSTAŁE FUNKCJE POMOCNICZE
// =====================================================

// Generuj poranny raport w tle
async function generateMorningReportAsync(rtpData, healthData) {
  const reportEl = document.getElementById('morning-report-text');
  if (!reportEl) return;
  
  try {
    const yesterday = await getLast7DaysHealth();
    const weeklyStats = {
      avgDailySteps: yesterday.length > 0 
        ? Math.round(yesterday.reduce((s, d) => s + (d.steps || 0), 0) / yesterday.length)
        : 0
    };
    
    const report = await generateMorningReport(rtpData, healthData, weeklyStats);
    reportEl.textContent = report;
  } catch (err) {
    reportEl.textContent = `RTP: ${rtpData.total}/100. ${rtpData.label}. Dziś jest dobry dzień żeby być lepszym.`;
  }
}

// Załaduj historię wagi i wyświetl wykres
async function loadWeightHistory() {
  const history = await getWeightHistory(30);
  if (history.length === 0) return;
  
  const latest = history[history.length - 1];
  document.getElementById('weight-value').textContent = latest.weight?.toFixed(1) || '--';
  document.getElementById('bodyfat-value').textContent = latest.bodyFat?.toFixed(1) || '--';
  
  // Mini wykres (wymagane Chart.js — dodane w HTML)
  // TODO: Zaimplementuj mini wykres wagowy
}

// Załaduj historię treningów
async function loadWorkoutHistory() {
  const history = await getRecentWorkouts(5);
  const el = document.getElementById('workout-history');
  if (!el || history.length === 0) return;
  
  el.innerHTML = history.map(w => `
    <div class="history-item">
      <span class="history-date">${w.date}</span>
      <span class="history-type">Trening ${w.type}</span>
      <span class="history-volume">${w.totalVolume}kg</span>
      <span class="history-duration">${w.duration} min</span>
    </div>
  `).join('');
}

// Timer treningowy
let timerInterval = null;
function startWorkoutTimer() {
  timerInterval = setInterval(() => {
    const elapsed = Math.round((new Date() - appState.workoutStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const el = document.getElementById('workout-timer');
    if (el) el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, 1000);
}

// Modal Renpho
function openRenphoSync() {
  document.getElementById('renpho-modal').classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

async function saveRenphoData() {
  const weight = parseFloat(document.getElementById('renpho-weight').value);
  const bodyFat = parseFloat(document.getElementById('renpho-bodyfat').value);
  
  if (!weight || !bodyFat) { alert('Wpisz obie wartości!'); return; }
  
  await saveWeightData({ weight, bodyFat, source: 'renpho_manual' });
  closeModal('renpho-modal');
  
  document.getElementById('weight-value').textContent = weight.toFixed(1);
  document.getElementById('bodyfat-value').textContent = bodyFat.toFixed(1);
  
  alert('Dane z wagi zapisane!');
}

// Pokazuj alerty/ostrzeżenia
function showAlert(message, type = 'info') {
  const colors = { info: '#3b82f6', warning: '#f59e0b', danger: '#ef4444' };
  const alert = document.createElement('div');
  alert.style.cssText = `
    position: fixed; top: 20px; left: 20px; right: 20px; z-index: 1000;
    background: ${colors[type]}; color: white; padding: 16px;
    border-radius: 12px; font-size: 14px; line-height: 1.5;
  `;
  alert.textContent = message;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 6000);  // Usuń po 6 sekundach
}

// Podsumowanie treningu
function showWorkoutSummary(workoutData) {
  const msg = `Trening ${workoutData.type} ukończony!\nCzas: ${workoutData.duration} minut\nŁączny wolumen: ${workoutData.totalVolume} kg\n\nSwietna robota!`;
  alert(msg);  // W pełnej wersji zastąp ładnym modalem
}

// =====================================================
// URUCHOM APLIKACJĘ
// =====================================================

// Poczekaj na załadowanie strony, potem uruchom apkę
document.addEventListener('DOMContentLoaded', initApp);

// Eksportuj funkcje używane w HTML (onclick)
window.startWorkout = startWorkout;
window.completeSet = completeSet;
window.finishWorkout = finishWorkout;
window.analyzeMeal = analyzeMeal;
window.analyzeShotVideoUpload = analyzeShotVideoUpload;
window.adjustShots = adjustShots;
window.saveShots = saveShots;
window.openRenphoSync = openRenphoSync;
window.closeModal = closeModal;
window.saveRenphoData = saveRenphoData;
