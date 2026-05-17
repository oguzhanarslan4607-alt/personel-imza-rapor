import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { AttendanceRecord, StaffMember } from "../types";

const STAFF_KEY = "personel-imza.staff.v1";
const ATTENDANCE_KEY = "personel-imza.attendance.v1";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);
export const firebaseProjectId = firebaseConfig.projectId || "";

let db: Firestore | null = null;
let authReady: Promise<void> | null = null;

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  const auth = getAuth(app);
  authReady = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubscribe();
        resolve();
      }
    });

    signInAnonymously(auth).catch(() => resolve());
  });
}

export function makeAttendanceId(date: string, staffId: string) {
  return `${date}_${staffId}`;
}

async function waitForAuth() {
  if (authReady) await authReady;
}

function readLocal<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function sortStaff(staff: StaffMember[]) {
  return [...staff].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "tr"));
}

export async function loadStaff(): Promise<StaffMember[]> {
  if (db) {
    try {
      await waitForAuth();
      const snapshot = await getDocs(query(collection(db, "staff"), orderBy("order", "asc")));
      return snapshot.docs.map((item) => item.data() as StaffMember);
    } catch (error) {
      console.warn("Firebase staff read failed, using local data.", error);
    }
  }

  return sortStaff(readLocal<StaffMember[]>(STAFF_KEY, []));
}

export async function saveStaffMember(member: StaffMember) {
  const staff = readLocal<StaffMember[]>(STAFF_KEY, []);
  const next = sortStaff([...staff.filter((item) => item.id !== member.id), member]);
  writeLocal(STAFF_KEY, next);

  if (db) {
    try {
      await waitForAuth();
      await setDoc(doc(db, "staff", member.id), {
        ...member,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn("Firebase staff write failed.", error);
    }
  }
}

export async function saveStaffMembers(members: StaffMember[]) {
  const staff = readLocal<StaffMember[]>(STAFF_KEY, []);
  const merged = new Map(staff.map((member) => [member.id, member]));
  members.forEach((member) => merged.set(member.id, member));
  writeLocal(STAFF_KEY, sortStaff(Array.from(merged.values())));

  if (db) {
    try {
      await waitForAuth();
      const batch = writeBatch(db);
      members.forEach((member) => {
        batch.set(doc(db, "staff", member.id), {
          ...member,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (error) {
      console.warn("Firebase staff batch write failed.", error);
    }
  }
}

export async function deleteStaffMember(id: string) {
  const staff = readLocal<StaffMember[]>(STAFF_KEY, []);
  writeLocal(
    STAFF_KEY,
    staff.filter((member) => member.id !== id),
  );

  if (db) {
    try {
      await waitForAuth();
      await deleteDoc(doc(db, "staff", id));
    } catch (error) {
      console.warn("Firebase staff delete failed.", error);
    }
  }
}

export async function loadAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  if (db) {
    try {
      await waitForAuth();
      const snapshot = await getDocs(query(collection(db, "attendance"), where("date", "==", date)));
      return snapshot.docs.map((item) => item.data() as AttendanceRecord);
    } catch (error) {
      console.warn("Firebase attendance read failed, using local data.", error);
    }
  }

  return readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []).filter((record) => record.date === date);
}

export async function loadAttendanceRange(startDate: string, endDate: string): Promise<AttendanceRecord[]> {
  if (db) {
    try {
      await waitForAuth();
      const snapshot = await getDocs(
        query(
          collection(db, "attendance"),
          where("date", ">=", startDate),
          where("date", "<=", endDate),
          orderBy("date", "asc"),
        ),
      );
      return snapshot.docs.map((item) => item.data() as AttendanceRecord);
    } catch (error) {
      console.warn("Firebase attendance range read failed, using local data.", error);
    }
  }

  return readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []).filter(
    (record) => record.date >= startDate && record.date <= endDate,
  );
}

export async function saveAttendanceRecord(record: AttendanceRecord) {
  const records = readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []);
  writeLocal(ATTENDANCE_KEY, [
    ...records.filter((item) => item.id !== record.id),
    { ...record, updatedAt: new Date().toISOString() },
  ]);

  if (db) {
    try {
      await waitForAuth();
      await setDoc(doc(db, "attendance", record.id), {
        ...record,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn("Firebase attendance write failed.", error);
    }
  }
}

export async function deleteAttendanceRecord(id: string) {
  const records = readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []);
  writeLocal(
    ATTENDANCE_KEY,
    records.filter((record) => record.id !== id),
  );

  if (db) {
    try {
      await waitForAuth();
      await deleteDoc(doc(db, "attendance", id));
    } catch (error) {
      console.warn("Firebase attendance delete failed.", error);
    }
  }
}
