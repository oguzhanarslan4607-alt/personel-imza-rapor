import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import type {
  AttendanceRecord,
  AuditLogRecord,
  DayLockRecord,
  DeletedAttendanceRecord,
  PrintArchiveRecord,
  StaffMember,
} from "../types";

const STAFF_KEY = "personel-imza.staff.v1";
const ATTENDANCE_KEY = "personel-imza.attendance.v1";
const PRINT_ARCHIVE_KEY = "personel-imza.printArchive.v1";
const DAY_LOCK_KEY = "personel-imza.dayLocks.v1";
const AUDIT_LOG_KEY = "personel-imza.auditLogs.v1";
const DELETED_ATTENDANCE_KEY = "personel-imza.deletedAttendance.v1";

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
let auth: Auth | null = null;
let currentUser: User | null = null;
let authReady: Promise<void> | null = null;

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  const appAuth = getAuth(app);
  auth = appAuth;
  let authReadyResolved = false;
  authReady = new Promise((resolve) => {
    onAuthStateChanged(appAuth, (user) => {
      currentUser = user;
      if (!authReadyResolved) {
        authReadyResolved = true;
        resolve();
      }
    });
  });
}

export type AdminUser = {
  uid: string;
  email: string | null;
};

export function makeAttendanceId(date: string, staffId: string) {
  return `${date}_${staffId}`;
}

async function waitForAuth() {
  if (authReady) await authReady;
}

async function waitForSignedIn() {
  await waitForAuth();
  if (db && !currentUser) {
    throw new Error("Yönetici oturumu gerekli.");
  }
}

function toAdminUser(user: User | null): AdminUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
  };
}

export function observeAdminAuth(callback: (user: AdminUser | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, (user) => {
    if (user?.isAnonymous) {
      currentUser = null;
      void signOut(auth);
      callback(null);
      return;
    }

    currentUser = user;
    callback(toAdminUser(user));
  });
}

export async function signInAdmin(email: string, password: string) {
  if (!auth) throw new Error("Firebase yapılandırması bulunamadı.");
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutAdmin() {
  if (!auth) return;
  await signOut(auth);
}

export async function hasAdminAccess() {
  if (!db) return true;
  await waitForSignedIn();
  if (!currentUser) return false;

  const snapshot = await getDoc(doc(db, "admins", currentUser.uid));
  return snapshot.exists();
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
  return [...staff].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "tr", { sensitivity: "base" }) ||
      a.department.localeCompare(b.department, "tr", { sensitivity: "base" }) ||
      a.title.localeCompare(b.title, "tr", { sensitivity: "base" }) ||
      a.order - b.order,
  );
}

export async function loadStaff(): Promise<StaffMember[]> {
  if (db) {
    try {
      await waitForSignedIn();
      const snapshot = await getDocs(query(collection(db, "staff")));
      return sortStaff(snapshot.docs.map((item) => item.data() as StaffMember));
    } catch (error) {
      console.warn("Firebase staff read failed.", error);
      return [];
    }
  }

  return sortStaff(readLocal<StaffMember[]>(STAFF_KEY, []));
}

export async function saveStaffMember(member: StaffMember) {
  if (db) {
    await waitForSignedIn();
    await setDoc(doc(db, "staff", member.id), {
      ...member,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const staff = readLocal<StaffMember[]>(STAFF_KEY, []);
  const next = sortStaff([...staff.filter((item) => item.id !== member.id), member]);
  writeLocal(STAFF_KEY, next);
}

export async function saveStaffMembers(members: StaffMember[]) {
  if (db) {
    await waitForSignedIn();
    const batch = writeBatch(db);
    members.forEach((member) => {
      batch.set(doc(db, "staff", member.id), {
        ...member,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return;
  }

  const staff = readLocal<StaffMember[]>(STAFF_KEY, []);
  const merged = new Map(staff.map((member) => [member.id, member]));
  members.forEach((member) => merged.set(member.id, member));
  writeLocal(STAFF_KEY, sortStaff(Array.from(merged.values())));
}

export async function deleteStaffMember(id: string) {
  if (db) {
    await waitForSignedIn();
    await deleteDoc(doc(db, "staff", id));
    return;
  }

  const staff = readLocal<StaffMember[]>(STAFF_KEY, []);
  writeLocal(
    STAFF_KEY,
    staff.filter((member) => member.id !== id),
  );
}

export async function loadAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  if (db) {
    try {
      await waitForSignedIn();
      const snapshot = await getDocs(query(collection(db, "attendance"), where("date", "==", date)));
      return snapshot.docs.map((item) => item.data() as AttendanceRecord);
    } catch (error) {
      console.warn("Firebase attendance read failed.", error);
      return [];
    }
  }

  return readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []).filter((record) => record.date === date);
}

export async function loadAttendanceRange(startDate: string, endDate: string): Promise<AttendanceRecord[]> {
  if (db) {
    try {
      await waitForSignedIn();
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
      console.warn("Firebase attendance range read failed.", error);
      return [];
    }
  }

  return readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []).filter(
    (record) => record.date >= startDate && record.date <= endDate,
  );
}

export async function saveAttendanceRecord(record: AttendanceRecord) {
  if (db) {
    await waitForSignedIn();
    await setDoc(doc(db, "attendance", record.id), {
      ...record,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const records = readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []);
  writeLocal(ATTENDANCE_KEY, [
    ...records.filter((item) => item.id !== record.id),
    { ...record, updatedAt: new Date().toISOString() },
  ]);
}

export async function deleteAttendanceRecord(id: string) {
  if (db) {
    await waitForSignedIn();
    await deleteDoc(doc(db, "attendance", id));
    return;
  }

  const records = readLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []);
  writeLocal(
    ATTENDANCE_KEY,
    records.filter((record) => record.id !== id),
  );
}

export async function loadDeletedAttendance(limit = 80): Promise<DeletedAttendanceRecord[]> {
  if (db) {
    try {
      await waitForSignedIn();
      const snapshot = await getDocs(query(collection(db, "deletedAttendance"), orderBy("deletedAt", "desc")));
      return snapshot.docs.slice(0, limit).map((item) => item.data() as DeletedAttendanceRecord);
    } catch (error) {
      console.warn("Firebase deleted attendance read failed.", error);
      return [];
    }
  }

  return readLocal<DeletedAttendanceRecord[]>(DELETED_ATTENDANCE_KEY, [])
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    .slice(0, limit);
}

export async function saveDeletedAttendance(record: DeletedAttendanceRecord) {
  if (db) {
    await waitForSignedIn();
    await setDoc(doc(db, "deletedAttendance", record.id), {
      ...record,
      deletedBy: currentUser?.email ?? record.deletedBy ?? null,
      serverDeletedAt: serverTimestamp(),
    });
    return;
  }

  const records = readLocal<DeletedAttendanceRecord[]>(DELETED_ATTENDANCE_KEY, []);
  writeLocal(DELETED_ATTENDANCE_KEY, [
    record,
    ...records.filter((item) => item.id !== record.id),
  ].slice(0, 250));
}

export async function deleteDeletedAttendance(id: string) {
  if (db) {
    await waitForSignedIn();
    await deleteDoc(doc(db, "deletedAttendance", id));
    return;
  }

  const records = readLocal<DeletedAttendanceRecord[]>(DELETED_ATTENDANCE_KEY, []);
  writeLocal(
    DELETED_ATTENDANCE_KEY,
    records.filter((record) => record.id !== id),
  );
}

export async function loadPrintArchives(): Promise<PrintArchiveRecord[]> {
  if (db) {
    try {
      await waitForSignedIn();
      const snapshot = await getDocs(query(collection(db, "printArchives"), orderBy("createdAt", "desc")));
      return snapshot.docs.map((item) => item.data() as PrintArchiveRecord);
    } catch (error) {
      console.warn("Firebase print archive read failed.", error);
      return [];
    }
  }

  return readLocal<PrintArchiveRecord[]>(PRINT_ARCHIVE_KEY, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePrintArchive(record: PrintArchiveRecord) {
  if (db) {
    await waitForSignedIn();
    await setDoc(doc(db, "printArchives", record.id), {
      ...record,
      createdBy: currentUser?.email ?? null,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const records = readLocal<PrintArchiveRecord[]>(PRINT_ARCHIVE_KEY, []);
  writeLocal(PRINT_ARCHIVE_KEY, [
    record,
    ...records.filter((item) => item.id !== record.id),
  ]);
}

export async function loadDayLock(date: string): Promise<DayLockRecord | null> {
  if (db) {
    try {
      await waitForSignedIn();
      const snapshot = await getDoc(doc(db, "dayLocks", date));
      return snapshot.exists() ? (snapshot.data() as DayLockRecord) : null;
    } catch (error) {
      console.warn("Firebase day lock read failed.", error);
      return null;
    }
  }

  return readLocal<DayLockRecord[]>(DAY_LOCK_KEY, []).find((record) => record.date === date) ?? null;
}

export async function saveDayLock(record: DayLockRecord) {
  if (db) {
    await waitForSignedIn();
    await setDoc(doc(db, "dayLocks", record.date), {
      ...record,
      updatedBy: currentUser?.email ?? null,
      serverUpdatedAt: serverTimestamp(),
    });
    return;
  }

  const records = readLocal<DayLockRecord[]>(DAY_LOCK_KEY, []);
  writeLocal(DAY_LOCK_KEY, [record, ...records.filter((item) => item.date !== record.date)]);
}

export async function loadAuditLogs(limit = 80): Promise<AuditLogRecord[]> {
  if (db) {
    try {
      await waitForSignedIn();
      const snapshot = await getDocs(query(collection(db, "auditLogs"), orderBy("createdAt", "desc")));
      return snapshot.docs.slice(0, limit).map((item) => item.data() as AuditLogRecord);
    } catch (error) {
      console.warn("Firebase audit log read failed.", error);
      return [];
    }
  }

  return readLocal<AuditLogRecord[]>(AUDIT_LOG_KEY, [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function saveAuditLog(action: string, detail: string) {
  const record: AuditLogRecord = {
    id: `${Date.now()}_${crypto.randomUUID()}`,
    action,
    detail,
    createdAt: new Date().toISOString(),
    createdBy: currentUser?.email ?? null,
  };

  if (db) {
    await waitForSignedIn();
    await setDoc(doc(db, "auditLogs", record.id), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
    return;
  }

  const records = readLocal<AuditLogRecord[]>(AUDIT_LOG_KEY, []);
  writeLocal(AUDIT_LOG_KEY, [record, ...records].slice(0, 200));
}
