// Ten plik łączy aplikację z Firebase (baza danych Google)
// WAŻNE: Zamień te wartości na swoje dane z Firebase Console!

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js';

// =====================================================
// TUTAJ WKLEJ SWOJE DANE Z FIREBASE CONSOLE
// Jak to znaleźć: Firebase Console → Ustawienia projektu → 
// Twoje aplikacje → Dodaj aplikację webową → skopiuj config
// =====================================================
const firebaseConfig = {
  apiKey: "WKLEJ_SWOJE_API_KEY",
  authDomain: "TWOJ_PROJEKT.firebaseapp.com",
  projectId: "TWOJ_PROJEKT",
  storageBucket: "TWOJ_PROJEKT.appspot.com",
  messagingSenderId: "TWOJ_NUMER",
  appId: "TWOJ_APP_ID"
};

// Inicjalizacja Firebase — "uruchomienie" połączenia
const app = initializeApp(firebaseConfig);

// db = skrót od "database" — obiekt do pracy z bazą danych
export const db = getFirestore(app);

// storage = miejsce na zdjęcia i wideo
export const storage = getStorage(app);

// messaging = system powiadomień push
export const messaging = getMessaging(app);

// =====================================================
// FUNKCJE DO ZAPISU DANYCH
// =====================================================

// Zapisz dane treningowe po sesji
// workout = obiekt z danymi: { type: 'A', exercises: [...], date: ... }
export async function saveWorkout(workout) {
  // 'workouts' to nazwa "tabeli" w bazie danych (jak folder)
  // addDoc tworzy nowy dokument z automatycznym ID
  const docRef = await addDoc(collection(db, 'workouts'), {
    ...workout,                    // wszystkie dane treningu
    timestamp: new Date(),         // data i godzina zapisania
    userId: 'user_main'            // ID użytkownika (na razie stałe)
  });
  console.log('Trening zapisany, ID:', docRef.id);
  return docRef.id;
}

// Zapisz dane z wagi Renpho
// data = { weight: 84.5, bodyFat: 22.3, date: '2025-01-15' }
export async function saveWeightData(data) {
  await addDoc(collection(db, 'weight'), {
    ...data,
    timestamp: new Date()
  });
}

// Zapisz wynik RTP (gotowość do treningu)
// score = liczba 0-100
export async function saveRTP(score, details) {
  const today = new Date().toISOString().split('T')[0]; // format: "2025-01-15"
  // setDoc z konkretnym ID pozwala nadpisać — jeden RTP dziennie
  await setDoc(doc(db, 'rtp', today), {
    score,
    details,  // szczegóły: ile pkt za sen, HRV, kroki itp.
    timestamp: new Date()
  });
}

// Zapisz dane kroków i snu z Health Connect
export async function saveHealthData(data) {
  const today = new Date().toISOString().split('T')[0];
  await setDoc(doc(db, 'health', today), {
    ...data,  // steps, sleep, hrv, heartRate
    timestamp: new Date()
  });
}

// =====================================================
// FUNKCJE DO ODCZYTU DANYCH
// =====================================================

// Pobierz ostatnie N treningów
export async function getRecentWorkouts(limit = 10) {
  const q = query(
    collection(db, 'workouts'),
    orderBy('timestamp', 'desc')  // od najnowszego
  );
  const snapshot = await getDocs(q);
  // Zamień dokumenty Firebase na zwykłe obiekty JavaScript
  return snapshot.docs.slice(0, limit).map(doc => ({ id: doc.id, ...doc.data() }));
}

// Pobierz historię wagi (ostatnie 30 dni)
export async function getWeightHistory(days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);  // data N dni temu
  
  const q = query(
    collection(db, 'weight'),
    where('timestamp', '>=', cutoff),
    orderBy('timestamp', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Pobierz RTP z ostatnich 7 dni (do obliczenia średniej kroczącej HRV)
export async function getLast7DaysHealth() {
  const results = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const docSnap = await getDoc(doc(db, 'health', dateStr));
    if (docSnap.exists()) {
      results.push({ date: dateStr, ...docSnap.data() });
    }
  }
  return results;
}

// Wgraj zdjęcie posiłku i pobierz link
// file = obiekt File z input[type=file]
export async function uploadMealPhoto(file) {
  const fileName = `meals/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, fileName);
  
  // Wgraj plik
  await uploadBytes(storageRef, file);
  
  // Pobierz publiczny link do zdjęcia
  const url = await getDownloadURL(storageRef);
  return url;
}

// Wgraj wideo z rzutem
export async function uploadShotVideo(file) {
  const fileName = `shots/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

// Rejestracja powiadomień push
export async function registerPushNotifications() {
  try {
    // Poproś o zgodę na powiadomienia
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Pobierz token FCM (unikalny identyfikator tego urządzenia)
      const token = await getToken(messaging, {
        // WKLEJ SWÓJ VAPID KEY z Firebase Console → 
        // Project Settings → Cloud Messaging → Web Push certificates
        vapidKey: 'WKLEJ_SWOJ_VAPID_KEY'
      });
      // Zapisz token w bazie — potrzebny do wysyłania powiadomień
      await setDoc(doc(db, 'fcmTokens', 'main_device'), { token, updated: new Date() });
      console.log('Powiadomienia aktywne');
    }
  } catch (err) {
    console.error('Błąd rejestracji powiadomień:', err);
  }
}
