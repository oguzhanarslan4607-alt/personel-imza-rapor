import {
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Database,
  Edit3,
  FileSpreadsheet,
  FileDown,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSampleStaff } from "./data/sampleStaff";
import { addMinutesToTime, compareTimes, formatDateTr, monthStartIso, todayIso } from "./lib/date";
import {
  deleteAttendanceRecord,
  deleteStaffMember,
  firebaseConfigured,
  firebaseProjectId,
  hasAdminAccess,
  loadAttendanceByDate,
  loadAttendanceRange,
  loadPrintArchives,
  loadStaff,
  makeAttendanceId,
  observeAdminAuth,
  saveAttendanceRecord,
  savePrintArchive,
  saveStaffMember,
  saveStaffMembers,
  signInAdmin,
  signOutAdmin,
  type AdminUser,
} from "./lib/repository";
import { defaultSettings, loadSettings, saveSettings } from "./lib/settings";
import type { AppSettings, AttendanceRecord, AttendanceStatus, PrintArchiveRecord, StaffMember } from "./types";

type TabKey = "daily" | "print" | "reports" | "staff" | "settings";
type AccessState = "idle" | "checking" | "allowed" | "denied";
type DraftRecord = {
  checkInTime: string;
  status: AttendanceStatus | "";
  lateReason: string;
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof CalendarCheck }> = [
  { key: "daily", label: "Günlük Kayıt", icon: CalendarCheck },
  { key: "print", label: "İmza Föyü", icon: Printer },
  { key: "reports", label: "Raporlar", icon: BarChart3 },
  { key: "staff", label: "Personel", icon: Users },
  { key: "settings", label: "Ayarlar", icon: Settings },
];

const statusLabels: Record<AttendanceStatus, string> = {
  present: "Geldi",
  late: "Geç",
  absent: "Gelmedi",
  excused: "İzinli",
};

const emptyDraft: DraftRecord = {
  checkInTime: "",
  status: "",
  lateReason: "",
};
const EXTRA_SIGNATURE_ROWS = 3;

function sortStaff(staff: StaffMember[]) {
  return [...staff].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "tr", { sensitivity: "base" }) ||
      a.department.localeCompare(b.department, "tr", { sensitivity: "base" }) ||
      a.title.localeCompare(b.title, "tr", { sensitivity: "base" }) ||
      a.order - b.order,
  );
}

function computeStatusFromTime(checkInTime: string, settings: AppSettings): AttendanceStatus {
  const limit = addMinutesToTime(settings.shiftStart, settings.lateAfterMinutes);
  return compareTimes(checkInTime, limit) > 0 ? "late" : "present";
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour * 60 + minute;
}

function getLateMinutes(checkInTime: string, settings: AppSettings) {
  if (!checkInTime) return 0;
  return Math.max(0, timeToMinutes(checkInTime) - timeToMinutes(settings.shiftStart));
}

function getRecordLateMinutes(record: AttendanceRecord, settings: AppSettings) {
  if (record.status !== "late") return 0;
  return getLateMinutes(record.checkInTime, settings);
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFKD");
}

function matchesStaffSearch(member: StaffMember, search: string) {
  const needle = normalizeText(search.trim());
  if (!needle) return true;

  return normalizeText(`${member.name} ${member.department} ${member.title}`).includes(needle);
}

function getDepartments(staff: StaffMember[]) {
  return Array.from(new Set(staff.map((member) => member.department.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "tr", { sensitivity: "base" }),
  );
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages.length ? pages : [[]];
}

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function excelEscape(value: string | number) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadExcelFile(filename: string, sections: Array<{ title: string; rows: Array<Array<string | number>> }>) {
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; margin-bottom: 24px; }
          th, td { border: 1px solid #9aa8b6; padding: 6px 8px; font-family: Arial, sans-serif; font-size: 11pt; }
          th { background: #e9eef5; font-weight: bold; }
          h2 { font-family: Arial, sans-serif; }
        </style>
      </head>
      <body>
        ${sections
          .map(
            (section) => `
              <h2>${excelEscape(section.title)}</h2>
              <table>
                ${section.rows
                  .map(
                    (row, index) =>
                      `<tr>${row
                        .map((cell) => `<${index === 0 ? "th" : "td"}>${excelEscape(cell)}</${index === 0 ? "th" : "td"}>`)
                        .join("")}</tr>`,
                  )
                  .join("")}
              </table>
            `,
          )
          .join("")}
      </body>
    </html>
  `;

  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getLoginErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";

  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "E-posta veya şifre hatalı.";
  }

  if (code.includes("too-many-requests")) {
    return "Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.";
  }

  if (code.includes("network")) {
    return "İnternet bağlantısı kurulamadı.";
  }

  return "Giriş yapılamadı. Bilgileri kontrol edip tekrar deneyin.";
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("daily");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [authChecked, setAuthChecked] = useState(!firebaseConfigured);
  const [accessState, setAccessState] = useState<AccessState>(firebaseConfigured ? "idle" : "allowed");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  const [dailySearch, setDailySearch] = useState("");
  const [dailyDepartment, setDailyDepartment] = useState("all");
  const [reportStart, setReportStart] = useState(monthStartIso());
  const [reportEnd, setReportEnd] = useState(todayIso());
  const [reportRows, setReportRows] = useState<AttendanceRecord[]>([]);
  const [reportStaffId, setReportStaffId] = useState("all");
  const [reportDepartment, setReportDepartment] = useState("all");
  const [newStaff, setNewStaff] = useState({ name: "", department: "", title: "" });
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffDepartment, setStaffDepartment] = useState("all");
  const [importText, setImportText] = useState("");
  const [printArchives, setPrintArchives] = useState<PrintArchiveRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const activeStaff = useMemo(() => sortStaff(staff.filter((member) => member.active)), [staff]);
  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  const staffRankById = useMemo(
    () => new Map(sortStaff(staff).map((member, index) => [member.id, index])),
    [staff],
  );
  const departments = useMemo(() => getDepartments(staff), [staff]);
  const filteredDailyStaff = useMemo(
    () =>
      activeStaff.filter(
        (member) =>
          matchesStaffSearch(member, dailySearch) &&
          (dailyDepartment === "all" || member.department === dailyDepartment),
      ),
    [activeStaff, dailyDepartment, dailySearch],
  );
  const filteredStaff = useMemo(
    () =>
      sortStaff(staff).filter(
        (member) =>
          matchesStaffSearch(member, staffSearch) &&
          (staffDepartment === "all" || member.department === staffDepartment),
      ),
    [staff, staffDepartment, staffSearch],
  );
  const printPages = useMemo(
    () => chunk(activeStaff, Math.max(1, settings.rowsPerPrintSide)),
    [activeStaff, settings.rowsPerPrintSide],
  );
  const canUseApp = !firebaseConfigured || (Boolean(admin) && accessState === "allowed");

  const dailyStats = useMemo(() => {
    return activeStaff.reduce(
      (stats, member) => {
        const draft = drafts[member.id] ?? emptyDraft;
        const status = draft.status || (draft.checkInTime ? computeStatusFromTime(draft.checkInTime, settings) : "");
        if (status || draft.checkInTime || draft.lateReason.trim()) stats.processed += 1;
        if (status === "present") stats.present += 1;
        if (status === "late") stats.late += 1;
        if (status === "absent") stats.absent += 1;
        if (status === "excused") stats.excused += 1;
        return stats;
      },
      { processed: 0, present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [activeStaff, drafts, settings]);
  const dailyEmptyCount = Math.max(0, activeStaff.length - dailyStats.processed);

  const reportStats = useMemo(() => {
    const filteredRows = reportRows.filter((record) => {
      const member = staffById.get(record.staffId);
      return (
        (reportStaffId === "all" || record.staffId === reportStaffId) &&
        (reportDepartment === "all" || member?.department === reportDepartment)
      );
    });

    return filteredRows.reduce(
      (stats, record) => {
        stats.total += 1;
        stats[record.status] += 1;
        return stats;
      },
      { total: 0, present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [reportDepartment, reportRows, reportStaffId, staffById]);

  const filteredReportRows = useMemo(() => {
    return reportRows.filter((record) => {
      const member = staffById.get(record.staffId);
      return (
        (reportStaffId === "all" || record.staffId === reportStaffId) &&
        (reportDepartment === "all" || member?.department === reportDepartment)
      );
    });
  }, [reportDepartment, reportRows, reportStaffId, staffById]);

  const reportSummaryRows = useMemo(() => {
    const summary = new Map<
      string,
      {
        staff: StaffMember;
        total: number;
        present: number;
        late: number;
        absent: number;
        excused: number;
        lateMinutes: number;
      }
    >();

    filteredReportRows.forEach((record) => {
      const staffMember = staffById.get(record.staffId);
      if (!staffMember) return;

      const current =
        summary.get(record.staffId) ??
        {
          staff: staffMember,
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
          lateMinutes: 0,
        };

      current.total += 1;
      current[record.status] += 1;
      current.lateMinutes += getRecordLateMinutes(record, settings);
      summary.set(record.staffId, current);
    });

    return Array.from(summary.values()).sort(
      (a, b) => (staffRankById.get(a.staff.id) ?? 0) - (staffRankById.get(b.staff.id) ?? 0),
    );
  }, [filteredReportRows, settings, staffById, staffRankById]);

  const selectedPersonSummary = reportStaffId === "all" ? null : reportSummaryRows.find((row) => row.staff.id === reportStaffId) ?? null;

  async function refreshStaff() {
    setBusy(true);
    try {
      const nextStaff = await loadStaff();
      setStaff(nextStaff);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAttendance(date = selectedDate) {
    setBusy(true);
    try {
      const records = await loadAttendanceByDate(date);
      setDrafts(
        Object.fromEntries(
          records.map((record) => [
            record.staffId,
            {
              checkInTime: record.checkInTime,
              status: record.status,
              lateReason: record.lateReason,
            },
          ]),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrintArchives() {
    try {
      const records = await loadPrintArchives();
      setPrintArchives(records);
    } catch {
      setPrintArchives([]);
    }
  }

  useEffect(() => {
    if (!firebaseConfigured) return;

    return observeAdminAuth((user) => {
      setAdmin(user);
      setAuthChecked(true);
      setLoginError("");

      if (!user) {
        setAccessState("idle");
        setStaff([]);
        setDrafts({});
        setReportRows([]);
        return;
      }

      setAccessState("checking");
      void hasAdminAccess()
        .then((allowed) => {
          setAccessState(allowed ? "allowed" : "denied");
          if (!allowed) {
            setStaff([]);
            setDrafts({});
            setReportRows([]);
          }
        })
        .catch(() => {
          setAccessState("denied");
          setStaff([]);
          setDrafts({});
          setReportRows([]);
        });
    });
  }, []);

  useEffect(() => {
    if (!canUseApp) return;
    void refreshStaff();
  }, [canUseApp, admin?.uid]);

  useEffect(() => {
    if (!canUseApp) return;
    void refreshAttendance(selectedDate);
  }, [canUseApp, admin?.uid, selectedDate]);

  useEffect(() => {
    if (!canUseApp) return;
    void refreshPrintArchives();
  }, [canUseApp, admin?.uid]);

  function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    setBusy(true);
    try {
      await signInAdmin(loginEmail.trim(), loginPassword);
      setLoginPassword("");
    } catch (error) {
      setLoginError(getLoginErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutAdmin();
      setActiveTab("daily");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(staffId: string, patch: Partial<DraftRecord>) {
    setDrafts((previous) => {
      const current = previous[staffId] ?? emptyDraft;
      const next: DraftRecord = { ...current, ...patch };

      if (Object.prototype.hasOwnProperty.call(patch, "checkInTime")) {
        if (next.checkInTime) {
          next.status = computeStatusFromTime(next.checkInTime, settings);
        } else if (next.status === "present" || next.status === "late") {
          next.status = "";
        }
      }

      return { ...previous, [staffId]: next };
    });
  }

  async function handleMarkEmptyAbsent() {
    const emptyMembers = activeStaff.filter((member) => {
      const draft = drafts[member.id] ?? emptyDraft;
      return !draft.status && !draft.checkInTime && !draft.lateReason.trim();
    });

    if (!emptyMembers.length) {
      setMessage("Boş kayıt bulunamadı.");
      return;
    }

    setBusy(true);
    try {
      await Promise.all(
        emptyMembers.map((member) =>
          saveAttendanceRecord({
            id: makeAttendanceId(selectedDate, member.id),
            staffId: member.id,
            date: selectedDate,
            checkInTime: "",
            status: "absent",
            lateReason: "Gün sonu otomatik gelmedi",
          }),
        ),
      );
      setMessage(`${emptyMembers.length} boş kayıt Gelmedi olarak kaydedildi.`);
      await refreshAttendance(selectedDate);
    } catch {
      setMessage("Boş kayıtlar güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDay() {
    setBusy(true);
    try {
      const records = activeStaff
        .map((member) => {
          const draft = drafts[member.id] ?? emptyDraft;
          if (!draft.status && !draft.checkInTime && !draft.lateReason.trim()) return null;

          const status =
            draft.checkInTime && draft.status !== "absent" && draft.status !== "excused"
              ? computeStatusFromTime(draft.checkInTime, settings)
              : draft.status || (draft.lateReason.trim() ? "late" : "");

          if (!status) return null;

          return {
            id: makeAttendanceId(selectedDate, member.id),
            staffId: member.id,
            date: selectedDate,
            checkInTime: draft.checkInTime,
            status,
            lateReason: draft.lateReason.trim(),
          } satisfies AttendanceRecord;
        })
        .filter((record): record is AttendanceRecord => Boolean(record));

      await Promise.all(records.map((record) => saveAttendanceRecord(record)));
      setMessage(`${formatDateTr(selectedDate)} için ${records.length} kayıt kaydedildi.`);
      await refreshAttendance(selectedDate);
    } catch {
      setMessage("Kayıt kaydedilemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearRecord(staffId: string) {
    setBusy(true);
    try {
      await deleteAttendanceRecord(makeAttendanceId(selectedDate, staffId));
      setDrafts((previous) => ({ ...previous, [staffId]: emptyDraft }));
    } catch {
      setMessage("Kayıt temizlenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStaff(event: FormEvent) {
    event.preventDefault();
    if (!newStaff.name.trim()) return;

    const member: StaffMember = {
      id: crypto.randomUUID(),
      order: staff.length ? Math.max(...staff.map((item) => item.order)) + 1 : 1,
      name: newStaff.name.trim(),
      department: newStaff.department.trim(),
      title: newStaff.title.trim(),
      active: true,
    };

    setBusy(true);
    try {
      await saveStaffMember(member);
      setNewStaff({ name: "", department: "", title: "" });
      await refreshStaff();
    } catch {
      setMessage("Personel eklenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleStartEditStaff(member: StaffMember) {
    setEditingStaff({ ...member });
  }

  async function handleUpdateStaff(event: FormEvent) {
    event.preventDefault();
    if (!editingStaff || !editingStaff.name.trim()) return;

    setBusy(true);
    try {
      await saveStaffMember({
        ...editingStaff,
        name: editingStaff.name.trim(),
        department: editingStaff.department.trim(),
        title: editingStaff.title.trim(),
      });
      setEditingStaff(null);
      await refreshStaff();
      setMessage("Personel bilgileri güncellendi.");
    } catch {
      setMessage("Personel güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportStaff() {
    const lines = importText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return;

    const startOrder = staff.length ? Math.max(...staff.map((item) => item.order)) + 1 : 1;
    const members = lines.map((line, index) => {
      const [name, department = "", title = ""] = line.split(";").map((part) => part.trim());
      return {
        id: crypto.randomUUID(),
        order: startOrder + index,
        name,
        department,
        title,
        active: true,
      } satisfies StaffMember;
    });

    setBusy(true);
    try {
      await saveStaffMembers(members);
      setImportText("");
      await refreshStaff();
      setMessage(`${members.length} personel eklendi.`);
    } catch {
      setMessage("Toplu personel aktarılamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSeedStaff() {
    const members = createSampleStaff(85, staff.length);

    setBusy(true);
    try {
      await saveStaffMembers(members);
      await refreshStaff();
      setMessage("85 satırlık personel şablonu oluşturuldu.");
    } catch {
      setMessage("Personel şablonu oluşturulamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStaff(member: StaffMember) {
    setBusy(true);
    try {
      await saveStaffMember({ ...member, active: !member.active });
      await refreshStaff();
    } catch {
      setMessage("Personel durumu güncellenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStaff(member: StaffMember) {
    if (!window.confirm(`${member.name} silinsin mi?`)) return;

    setBusy(true);
    try {
      await deleteStaffMember(member.id);
      await refreshStaff();
    } catch {
      setMessage("Personel silinemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadReport() {
    setBusy(true);
    try {
      const records = await loadAttendanceRange(reportStart, reportEnd);
      setReportRows(
        [...records].sort((a, b) => {
          const dateSort = a.date.localeCompare(b.date);
          if (dateSort !== 0) return dateSort;
          return (staffRankById.get(a.staffId) ?? 0) - (staffRankById.get(b.staffId) ?? 0);
        }),
      );
    } catch {
      setMessage("Rapor alınamadı. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchivePrintSheet() {
    const archive: PrintArchiveRecord = {
      id: `${selectedDate}_${Date.now()}`,
      date: selectedDate,
      staffCount: activeStaff.length,
      pageCount: printPages.length,
      rowsPerPrintSide: settings.rowsPerPrintSide,
      shiftStart: settings.shiftStart,
      createdAt: new Date().toISOString(),
      createdBy: admin?.email ?? null,
    };

    setBusy(true);
    try {
      await savePrintArchive(archive);
      await refreshPrintArchives();
      setMessage(`${formatDateTr(selectedDate)} imza föyü arşive eklendi.`);
    } catch {
      setMessage("İmza föyü arşivlenemedi. Yönetici yetkisini ve internet bağlantısını kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    const rows = [
      ["Tarih", "Personel", "Departman", "Ünvan", "Giriş Saati", "Durum", "Gecikme Dk", "Açıklama"],
      ...filteredReportRows.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          record.date,
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.checkInTime,
          statusLabels[record.status],
          getRecordLateMinutes(record, settings),
          record.lateReason,
        ];
      }),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const personPart = reportStaffId === "all" ? "tum-personel" : staffById.get(reportStaffId)?.name ?? "personel";
    link.download = `personel-rapor-${personPart}-${reportStart}-${reportEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportExcel() {
    const detailRows: Array<Array<string | number>> = [
      ["Tarih", "Personel", "Departman", "Ünvan", "Giriş Saati", "Durum", "Gecikme Dk", "Açıklama"],
      ...filteredReportRows.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          record.date,
          member?.name ?? "",
          member?.department ?? "",
          member?.title ?? "",
          record.checkInTime,
          statusLabels[record.status],
          getRecordLateMinutes(record, settings),
          record.lateReason,
        ];
      }),
    ];
    const summaryRows: Array<Array<string | number>> = [
      ["Personel", "Departman", "Ünvan", "Kayıt", "Geldi", "Geç", "Gelmedi", "İzinli", "Toplam Gecikme Dk"],
      ...reportSummaryRows.map((row) => [
        row.staff.name,
        row.staff.department,
        row.staff.title,
        row.total,
        row.present,
        row.late,
        row.absent,
        row.excused,
        row.lateMinutes,
      ]),
    ];
    const personPart = reportStaffId === "all" ? "tum-personel" : staffById.get(reportStaffId)?.name ?? "personel";
    downloadExcelFile(`personel-rapor-${personPart}-${reportStart}-${reportEnd}.xls`, [
      { title: "Aylık Özet", rows: summaryRows },
      { title: "Detay Kayıtları", rows: detailRows },
    ]);
  }

  if (!authChecked) {
    return <AuthStatusScreen title="Oturum kontrol ediliyor" />;
  }

  if (firebaseConfigured && admin && accessState === "checking") {
    return <AuthStatusScreen title="Yetki kontrol ediliyor" email={admin.email} onSignOut={() => void handleSignOut()} />;
  }

  if (firebaseConfigured && admin && accessState === "denied") {
    return <AccessDeniedScreen email={admin.email} onSignOut={() => void handleSignOut()} busy={busy} />;
  }

  if (firebaseConfigured && !admin) {
    return (
      <LoginScreen
        email={loginEmail}
        password={loginPassword}
        error={loginError}
        busy={busy}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onSubmit={(event) => void handleLogin(event)}
      />
    );
  }

  return (
    <>
      <div className="app-shell screen-only">
        <header className="topbar">
          <div>
            <p className="eyebrow">Personel devam sistemi</p>
            <h1>{settings.companyName}</h1>
          </div>
          <div className="top-actions">
            <span className={`connection-badge ${firebaseConfigured ? "is-online" : "is-local"}`}>
              <Database size={16} aria-hidden="true" />
              {firebaseConfigured ? `Firebase ${firebaseProjectId}` : "Yerel taslak"}
            </span>
            {firebaseConfigured && admin && (
              <>
                <span className="user-badge">
                  <ShieldCheck size={16} aria-hidden="true" />
                  {admin.email}
                </span>
                <button className="secondary-action" onClick={() => void handleSignOut()} disabled={busy}>
                  <LogOut size={18} aria-hidden="true" />
                  Çıkış
                </button>
              </>
            )}
            <button className="icon-button" onClick={() => void refreshStaff()} title="Yenile" aria-label="Yenile">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        <nav className="tabbar" aria-label="Ana bölümler">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={activeTab === tab.key ? "is-active" : ""}
                onClick={() => setActiveTab(tab.key)}
                title={tab.label}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {message && <div className="notice">{message}</div>}

        {activeTab === "daily" && (
          <main className="workspace">
            <section className="toolbar-band">
              <label>
                Tarih
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <label>
                Mesai Başlangıcı
                <input
                  type="time"
                  value={settings.shiftStart}
                  onChange={(event) => updateSettings({ shiftStart: event.target.value })}
                />
              </label>
              <label>
                Tolerans
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={settings.lateAfterMinutes}
                  onChange={(event) => updateSettings({ lateAfterMinutes: Number(event.target.value) })}
                />
              </label>
              <label className="wide-filter">
                Arama
                <div className="input-with-icon compact-input">
                  <Search size={17} aria-hidden="true" />
                  <input value={dailySearch} onChange={(event) => setDailySearch(event.target.value)} placeholder="Personel ara" />
                </div>
              </label>
              <label>
                Departman
                <select value={dailyDepartment} onChange={(event) => setDailyDepartment(event.target.value)}>
                  <option value="all">Tümü</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-action" onClick={() => void handleSaveDay()} disabled={busy}>
                <Save size={18} aria-hidden="true" />
                Kaydet
              </button>
              <button className="secondary-action" onClick={() => void handleMarkEmptyAbsent()} disabled={busy || !dailyEmptyCount}>
                <CheckCircle2 size={18} aria-hidden="true" />
                Boşları Gelmedi Yap
              </button>
            </section>

            <section className="metric-row" aria-label="Günlük özet">
              <Metric label="Aktif Personel" value={activeStaff.length} />
              <Metric label="İşlenen" value={dailyStats.processed} tone="blue" />
              <Metric label="Eksik" value={dailyEmptyCount} tone="amber" />
              <Metric label="Geldi" value={dailyStats.present} tone="green" />
              <Metric label="Geç" value={dailyStats.late} tone="amber" />
              <Metric label="Gelmedi" value={dailyStats.absent} tone="red" />
              <Metric label="İzinli" value={dailyStats.excused} tone="blue" />
            </section>

            <section className="data-panel">
              <div className="table-scroll">
                <table className="data-table attendance-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Personel</th>
                      <th>Giriş</th>
                      <th>Gecikme</th>
                      <th>Durum</th>
                      <th>Açıklama</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyStaff.map((member, index) => {
                      const draft = drafts[member.id] ?? emptyDraft;
                      const lateMinutes = getLateMinutes(draft.checkInTime, settings);

                      return (
                        <tr key={member.id}>
                          <td className="number-cell">{index + 1}</td>
                          <td>
                            <strong>{member.name}</strong>
                            <span>{[member.department, member.title].filter(Boolean).join(" / ")}</span>
                          </td>
                          <td>
                            <input
                              type="time"
                              value={draft.checkInTime}
                              onChange={(event) => updateDraft(member.id, { checkInTime: event.target.value })}
                            />
                          </td>
                          <td className="number-cell">{lateMinutes > 0 ? `${lateMinutes} dk` : "-"}</td>
                          <td>
                            <select
                              value={draft.status}
                              onChange={(event) =>
                                updateDraft(member.id, { status: event.target.value as AttendanceStatus | "" })
                              }
                            >
                              <option value="">Seç</option>
                              <option value="present">Geldi</option>
                              <option value="late">Geç</option>
                              <option value="absent">Gelmedi</option>
                              <option value="excused">İzinli</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={draft.lateReason}
                              onChange={(event) => updateDraft(member.id, { lateReason: event.target.value })}
                              placeholder="Geç kalma / izin açıklaması"
                            />
                          </td>
                          <td>
                            <button
                              className="icon-button danger"
                              onClick={() => void handleClearRecord(member.id)}
                              title="Kaydı temizle"
                              aria-label={`${member.name} kaydını temizle`}
                            >
                              <Trash2 size={17} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {activeTab === "print" && (
          <main className="workspace">
            <section className="toolbar-band">
              <label>
                Tarih
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <label>
                Ön/Arka Satır
                <input
                  type="number"
                  min="35"
                  max="48"
                  value={settings.rowsPerPrintSide}
                  onChange={(event) => updateSettings({ rowsPerPrintSide: Number(event.target.value) })}
                />
              </label>
              <button className="primary-action" onClick={() => window.print()}>
                <Printer size={18} aria-hidden="true" />
                Yazdır
              </button>
              <button className="secondary-action" onClick={() => void handleArchivePrintSheet()} disabled={busy}>
                <Save size={18} aria-hidden="true" />
                Arşivle
              </button>
            </section>

            <section className="data-panel archive-panel">
              <div className="panel-heading">
                <div>
                  <h2>İmza Föyü Arşivi</h2>
                  <span>Son basım/arşiv kayıtları</span>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table archive-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Personel</th>
                      <th>Sayfa</th>
                      <th>Mesai</th>
                      <th>Arşiv Zamanı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printArchives.slice(0, 8).map((archive) => (
                      <tr key={archive.id}>
                        <td>{archive.date}</td>
                        <td>{archive.staffCount}</td>
                        <td>{archive.pageCount}</td>
                        <td>{archive.shiftStart}</td>
                        <td>{new Date(archive.createdAt).toLocaleString("tr-TR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="sheet-preview">
              {printPages.map((pageStaff, index) => (
                <SheetPage
                  key={`${index}-${pageStaff.length}`}
                  staff={pageStaff}
                  startNumber={index * settings.rowsPerPrintSide}
                  pageIndex={index}
                  pageCount={printPages.length}
                  selectedDate={selectedDate}
                  settings={settings}
                  preview
                />
              ))}
            </section>
          </main>
        )}

        {activeTab === "reports" && (
          <main className="workspace">
            <section className="toolbar-band">
              <label>
                Başlangıç
                <input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} />
              </label>
              <label>
                Bitiş
                <input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} />
              </label>
              <label className="wide-filter">
                Personel
                <select value={reportStaffId} onChange={(event) => setReportStaffId(event.target.value)}>
                  <option value="all">Tüm personel</option>
                  {activeStaff.map((member, index) => (
                    <option key={member.id} value={member.id}>
                      {index + 1}. {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Departman
                <select value={reportDepartment} onChange={(event) => setReportDepartment(event.target.value)}>
                  <option value="all">Tümü</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-action" onClick={() => void handleLoadReport()} disabled={busy}>
                <BarChart3 size={18} aria-hidden="true" />
                Getir
              </button>
              <button className="secondary-action" onClick={handleExportExcel} disabled={!filteredReportRows.length}>
                <FileSpreadsheet size={18} aria-hidden="true" />
                Excel
              </button>
              <button className="primary-action" onClick={handleExportCsv} disabled={!filteredReportRows.length}>
                <FileDown size={18} aria-hidden="true" />
                CSV
              </button>
            </section>

            <section className="metric-row" aria-label="Rapor özeti">
              <Metric label="Kayıt" value={reportStats.total} />
              <Metric label="Geldi" value={reportStats.present} tone="green" />
              <Metric label="Geç" value={reportStats.late} tone="amber" />
              <Metric label="Gelmedi" value={reportStats.absent} tone="red" />
              <Metric label="İzinli" value={reportStats.excused} tone="blue" />
            </section>

            {selectedPersonSummary && (
              <section className="person-card">
                <div>
                  <span>Kişi Karnesi</span>
                  <strong>{selectedPersonSummary.staff.name}</strong>
                  <small>{[selectedPersonSummary.staff.department, selectedPersonSummary.staff.title].filter(Boolean).join(" / ")}</small>
                </div>
                <Metric label="Toplam Gecikme" value={selectedPersonSummary.lateMinutes} tone="amber" />
                <Metric label="Geç Gün" value={selectedPersonSummary.late} tone="amber" />
                <Metric label="Gelmedi" value={selectedPersonSummary.absent} tone="red" />
              </section>
            )}

            <section className="data-panel report-summary-panel">
              <div className="panel-heading">
                <div>
                  <h2>Aylık Özet</h2>
                  <span>{reportStart} - {reportEnd}</span>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table summary-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>Kayıt</th>
                      <th>Geldi</th>
                      <th>Geç</th>
                      <th>Gelmedi</th>
                      <th>İzinli</th>
                      <th>Gecikme Dk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportSummaryRows.map((row) => (
                      <tr key={row.staff.id}>
                        <td className="number-cell">{(staffRankById.get(row.staff.id) ?? 0) + 1}</td>
                        <td>
                          <strong>{row.staff.name}</strong>
                          <span>{row.staff.title}</span>
                        </td>
                        <td>{row.staff.department}</td>
                        <td>{row.total}</td>
                        <td>{row.present}</td>
                        <td>{row.late}</td>
                        <td>{row.absent}</td>
                        <td>{row.excused}</td>
                        <td>{row.lateMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="data-panel">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>Giriş</th>
                      <th>Gecikme</th>
                      <th>Durum</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReportRows.map((record) => {
                      const member = staffById.get(record.staffId);
                      return (
                        <tr key={record.id}>
                          <td>{record.date}</td>
                          <td>{member?.name ?? ""}</td>
                          <td>{member?.department ?? ""}</td>
                          <td>{record.checkInTime}</td>
                          <td>{getRecordLateMinutes(record, settings) || "-"}</td>
                          <td>
                            <StatusPill status={record.status} />
                          </td>
                          <td>{record.lateReason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {activeTab === "staff" && (
          <main className="workspace two-column">
            <section className="data-panel form-panel">
              <form onSubmit={handleAddStaff} className="staff-form">
                <div className="panel-heading compact-heading">
                  <div>
                    <h2>Yeni Personel</h2>
                    <span>Liste alfabetik sıralanır</span>
                  </div>
                </div>
                <label>
                  Ad Soyad
                  <input
                    value={newStaff.name}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Departman
                  <input
                    value={newStaff.department}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, department: event.target.value }))}
                  />
                </label>
                <label>
                  Ünvan
                  <input
                    value={newStaff.title}
                    onChange={(event) => setNewStaff((previous) => ({ ...previous, title: event.target.value }))}
                  />
                </label>
                <button className="primary-action" type="submit" disabled={busy}>
                  <Plus size={18} aria-hidden="true" />
                  Ekle
                </button>
              </form>

              {editingStaff && (
                <form onSubmit={handleUpdateStaff} className="staff-form edit-form">
                  <div className="panel-heading compact-heading">
                    <div>
                      <h2>Personel Düzenle</h2>
                      <span>{editingStaff.name}</span>
                    </div>
                  </div>
                  <label>
                    Ad Soyad
                    <input
                      value={editingStaff.name}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, name: event.target.value } : previous)}
                      required
                    />
                  </label>
                  <label>
                    Departman
                    <input
                      value={editingStaff.department}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, department: event.target.value } : previous)}
                    />
                  </label>
                  <label>
                    Ünvan
                    <input
                      value={editingStaff.title}
                      onChange={(event) => setEditingStaff((previous) => previous ? { ...previous, title: event.target.value } : previous)}
                    />
                  </label>
                  <div className="button-row">
                    <button className="primary-action" type="submit" disabled={busy}>
                      <Save size={18} aria-hidden="true" />
                      Güncelle
                    </button>
                    <button className="secondary-action" type="button" onClick={() => setEditingStaff(null)}>
                      <X size={18} aria-hidden="true" />
                      Vazgeç
                    </button>
                  </div>
                </form>
              )}

              <div className="import-box">
                <label>
                  Toplu Personel
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    rows={9}
                    placeholder="Ad Soyad;Departman;Ünvan"
                  />
                </label>
                <div className="button-row">
                  <button className="secondary-action" onClick={() => void handleImportStaff()} disabled={busy}>
                    <Upload size={18} aria-hidden="true" />
                    Aktar
                  </button>
                  <button className="secondary-action" onClick={() => void handleSeedStaff()} disabled={busy}>
                    <Users size={18} aria-hidden="true" />
                    85 Şablon
                  </button>
                </div>
              </div>
            </section>

            <section className="data-panel">
              <div className="list-tools">
                <label className="wide-filter">
                  Arama
                  <div className="input-with-icon compact-input">
                    <Search size={17} aria-hidden="true" />
                    <input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Personel ara" />
                  </div>
                </label>
                <label>
                  Departman
                  <select value={staffDepartment} onChange={(event) => setStaffDepartment(event.target.value)}>
                    <option value="all">Tümü</option>
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>Durum</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((member, index) => (
                      <tr key={member.id} className={!member.active ? "is-muted" : ""}>
                        <td className="number-cell">{index + 1}</td>
                        <td>
                          <strong>{member.name}</strong>
                          <span>{member.title}</span>
                        </td>
                        <td>{member.department}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-button" onClick={() => handleStartEditStaff(member)} title="Düzenle" aria-label={`${member.name} düzenle`}>
                              <Edit3 size={17} />
                            </button>
                            <button className="status-toggle" onClick={() => void handleToggleStaff(member)}>
                              {member.active ? "Aktif" : "Pasif"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            className="icon-button danger"
                            onClick={() => void handleDeleteStaff(member)}
                            title="Personeli sil"
                            aria-label={`${member.name} personelini sil`}
                          >
                            <Trash2 size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {activeTab === "settings" && (
          <main className="workspace">
            <section className="settings-grid">
              <label>
                Firma Adı
                <input value={settings.companyName} onChange={(event) => updateSettings({ companyName: event.target.value })} />
              </label>
              <label>
                Föy Başlığı
                <input value={settings.formTitle} onChange={(event) => updateSettings({ formTitle: event.target.value })} />
              </label>
              <label>
                Mesai Başlangıcı
                <input
                  type="time"
                  value={settings.shiftStart}
                  onChange={(event) => updateSettings({ shiftStart: event.target.value })}
                />
              </label>
              <label>
                Geç Kalma Toleransı
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={settings.lateAfterMinutes}
                  onChange={(event) => updateSettings({ lateAfterMinutes: Number(event.target.value) })}
                />
              </label>
              <label>
                Sayfa Başına Satır
                <input
                  type="number"
                  min="35"
                  max="48"
                  value={settings.rowsPerPrintSide}
                  onChange={(event) => updateSettings({ rowsPerPrintSide: Number(event.target.value) })}
                />
              </label>
              <div className="firebase-card">
                <span>Firebase</span>
                <strong>{firebaseConfigured ? firebaseProjectId : "Config bekliyor"}</strong>
              </div>
            </section>
          </main>
        )}
      </div>

      <div className="print-area" aria-hidden="true">
        {printPages.map((pageStaff, index) => (
          <SheetPage
            key={`print-${index}-${pageStaff.length}`}
            staff={pageStaff}
            startNumber={index * settings.rowsPerPrintSide}
            pageIndex={index}
            pageCount={printPages.length}
            selectedDate={selectedDate}
            settings={settings}
          />
        ))}
      </div>
    </>
  );
}

function LoginScreen({
  email,
  password,
  error,
  busy,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className="auth-page screen-only">
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="login-brand">
          <span className="login-icon">
            <ShieldCheck size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Yönetici girişi</p>
            <h1>Personel Devam Sistemi</h1>
          </div>
        </div>

        <label>
          E-posta
          <div className="input-with-icon">
            <Mail size={17} aria-hidden="true" />
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              autoComplete="username"
              required
            />
          </div>
        </label>

        <label>
          Şifre
          <div className="input-with-icon">
            <Lock size={17} aria-hidden="true" />
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </label>

        {error && <div className="form-error">{error}</div>}

        <button className="primary-action login-action" type="submit" disabled={busy}>
          <KeyRound size={18} aria-hidden="true" />
          {busy ? "Giriş yapılıyor" : "Giriş Yap"}
        </button>

        <div className="login-meta">
          <Database size={16} aria-hidden="true" />
          Firebase {firebaseProjectId}
        </div>
      </form>
    </main>
  );
}

function AuthStatusScreen({
  title,
  email,
  onSignOut,
}: {
  title: string;
  email?: string | null;
  onSignOut?: () => void;
}) {
  return (
    <main className="auth-page screen-only">
      <section className="login-panel auth-status-panel">
        <span className="login-icon">
          <ShieldCheck size={24} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Personel devam sistemi</p>
          <h1>{title}</h1>
        </div>
        {email && <div className="login-meta">{email}</div>}
        {onSignOut && (
          <button className="secondary-action login-action" onClick={onSignOut}>
            <LogOut size={18} aria-hidden="true" />
            Çıkış
          </button>
        )}
      </section>
    </main>
  );
}

function AccessDeniedScreen({ email, onSignOut, busy }: { email: string | null; onSignOut: () => void; busy: boolean }) {
  return (
    <main className="auth-page screen-only">
      <section className="login-panel auth-status-panel">
        <span className="login-icon">
          <ShieldCheck size={24} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Yetki gerekli</p>
          <h1>Bu hesap yönetici değil</h1>
        </div>
        <p className="auth-copy">{email} hesabı için Firestore `admins` yetkisi bulunamadı.</p>
        <button className="secondary-action login-action" onClick={onSignOut} disabled={busy}>
          <LogOut size={18} aria-hidden="true" />
          Çıkış
        </button>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" | "blue" }) {
  return (
    <div className={`metric ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ status }: { status: AttendanceStatus }) {
  return <span className={`status-pill status-${status}`}>{statusLabels[status]}</span>;
}

function SheetPage({
  staff,
  startNumber,
  pageIndex,
  pageCount,
  selectedDate,
  settings,
  preview = false,
}: {
  staff: StaffMember[];
  startNumber: number;
  pageIndex: number;
  pageCount: number;
  selectedDate: string;
  settings: AppSettings;
  preview?: boolean;
}) {
  return (
    <article className={`sheet-page ${preview ? "is-preview" : ""}`}>
      <header className="sheet-header">
        <div>
          <strong>{settings.companyName}</strong>
          <span>{settings.formTitle}</span>
        </div>
        <div>
          <strong>{formatDateTr(selectedDate)}</strong>
          <span>
            Mesai {settings.shiftStart} / {pageIndex === 0 ? "Ön yüz" : pageIndex === 1 ? "Arka yüz" : `${pageIndex + 1}. sayfa`}
          </span>
        </div>
      </header>

      <table className="signature-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Ad Soyad</th>
            <th>Ünvan</th>
            <th>Departman</th>
            <th>Giriş Saati</th>
            <th>İmza</th>
            <th>Açıklama</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member, index) => (
            <tr key={member.id}>
              <td>{startNumber + index + 1}</td>
              <td className="signature-name-cell">
                <strong>{member.name}</strong>
              </td>
              <td>{member.title}</td>
              <td>{member.department}</td>
              <td>{settings.shiftStart}</td>
              <td />
              <td />
            </tr>
          ))}
          {pageIndex === pageCount - 1 &&
            Array.from({ length: EXTRA_SIGNATURE_ROWS }, (_, index) => (
              <tr key={`extra-${index}`} className="extra-signature-row">
                <td>Ek-{index + 1}</td>
                <td />
                <td />
                <td />
                <td>{settings.shiftStart}</td>
                <td />
                <td />
              </tr>
            ))}
        </tbody>
      </table>

      <footer className="sheet-footer">
        <span>Sayfa {pageIndex + 1} / {pageCount}</span>
        <span>Toplam satır: {staff.length}</span>
      </footer>
    </article>
  );
}

export default App;
