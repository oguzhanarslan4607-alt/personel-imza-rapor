import {
  BarChart3,
  CalendarCheck,
  Database,
  FileDown,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSampleStaff } from "./data/sampleStaff";
import { addMinutesToTime, compareTimes, formatDateTr, monthStartIso, todayIso } from "./lib/date";
import {
  deleteAttendanceRecord,
  deleteStaffMember,
  firebaseConfigured,
  firebaseProjectId,
  loadAttendanceByDate,
  loadAttendanceRange,
  loadStaff,
  makeAttendanceId,
  saveAttendanceRecord,
  saveStaffMember,
  saveStaffMembers,
} from "./lib/repository";
import { defaultSettings, loadSettings, saveSettings } from "./lib/settings";
import type { AppSettings, AttendanceRecord, AttendanceStatus, StaffMember } from "./types";

type TabKey = "daily" | "print" | "reports" | "staff" | "settings";
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

function sortStaff(staff: StaffMember[]) {
  return [...staff].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "tr"));
}

function computeStatusFromTime(checkInTime: string, settings: AppSettings): AttendanceStatus {
  const limit = addMinutesToTime(settings.shiftStart, settings.lateAfterMinutes);
  return compareTimes(checkInTime, limit) > 0 ? "late" : "present";
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

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("daily");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  const [reportStart, setReportStart] = useState(monthStartIso());
  const [reportEnd, setReportEnd] = useState(todayIso());
  const [reportRows, setReportRows] = useState<AttendanceRecord[]>([]);
  const [newStaff, setNewStaff] = useState({ name: "", department: "", title: "" });
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const activeStaff = useMemo(() => sortStaff(staff.filter((member) => member.active)), [staff]);
  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  const printPages = useMemo(
    () => chunk(activeStaff, Math.max(1, settings.rowsPerPrintSide)),
    [activeStaff, settings.rowsPerPrintSide],
  );

  const dailyStats = useMemo(() => {
    return activeStaff.reduce(
      (stats, member) => {
        const draft = drafts[member.id] ?? emptyDraft;
        const status = draft.status || (draft.checkInTime ? computeStatusFromTime(draft.checkInTime, settings) : "");
        if (status === "present") stats.present += 1;
        if (status === "late") stats.late += 1;
        if (status === "absent") stats.absent += 1;
        if (status === "excused") stats.excused += 1;
        return stats;
      },
      { present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [activeStaff, drafts, settings]);

  const reportStats = useMemo(() => {
    return reportRows.reduce(
      (stats, record) => {
        stats.total += 1;
        stats[record.status] += 1;
        return stats;
      },
      { total: 0, present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [reportRows]);

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

  useEffect(() => {
    void refreshStaff();
  }, []);

  useEffect(() => {
    void refreshAttendance(selectedDate);
  }, [selectedDate]);

  function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
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
    } finally {
      setBusy(false);
    }
  }

  async function handleClearRecord(staffId: string) {
    setBusy(true);
    try {
      await deleteAttendanceRecord(makeAttendanceId(selectedDate, staffId));
      setDrafts((previous) => ({ ...previous, [staffId]: emptyDraft }));
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
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStaff(member: StaffMember) {
    setBusy(true);
    try {
      await saveStaffMember({ ...member, active: !member.active });
      await refreshStaff();
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
          return (staffById.get(a.staffId)?.order ?? 0) - (staffById.get(b.staffId)?.order ?? 0);
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    const rows = [
      ["Tarih", "Personel", "Departman", "Giriş Saati", "Durum", "Açıklama"],
      ...reportRows.map((record) => {
        const member = staffById.get(record.staffId);
        return [
          record.date,
          member?.name ?? "",
          member?.department ?? "",
          record.checkInTime,
          statusLabels[record.status],
          record.lateReason,
        ];
      }),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `personel-rapor-${reportStart}-${reportEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
              <button className="primary-action" onClick={() => void handleSaveDay()} disabled={busy}>
                <Save size={18} aria-hidden="true" />
                Kaydet
              </button>
            </section>

            <section className="metric-row" aria-label="Günlük özet">
              <Metric label="Aktif Personel" value={activeStaff.length} />
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
                      <th>Durum</th>
                      <th>Açıklama</th>
                      <th aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeStaff.map((member) => {
                      const draft = drafts[member.id] ?? emptyDraft;

                      return (
                        <tr key={member.id}>
                          <td className="number-cell">{member.order}</td>
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
            </section>

            <section className="sheet-preview">
              {printPages.map((pageStaff, index) => (
                <SheetPage
                  key={`${index}-${pageStaff.length}`}
                  staff={pageStaff}
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
              <button className="secondary-action" onClick={() => void handleLoadReport()} disabled={busy}>
                <BarChart3 size={18} aria-hidden="true" />
                Getir
              </button>
              <button className="primary-action" onClick={handleExportCsv} disabled={!reportRows.length}>
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

            <section className="data-panel">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Personel</th>
                      <th>Departman</th>
                      <th>Giriş</th>
                      <th>Durum</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((record) => {
                      const member = staffById.get(record.staffId);
                      return (
                        <tr key={record.id}>
                          <td>{record.date}</td>
                          <td>{member?.name ?? ""}</td>
                          <td>{member?.department ?? ""}</td>
                          <td>{record.checkInTime}</td>
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
                    {sortStaff(staff).map((member) => (
                      <tr key={member.id} className={!member.active ? "is-muted" : ""}>
                        <td className="number-cell">{member.order}</td>
                        <td>
                          <strong>{member.name}</strong>
                          <span>{member.title}</span>
                        </td>
                        <td>{member.department}</td>
                        <td>
                          <button className="status-toggle" onClick={() => void handleToggleStaff(member)}>
                            {member.active ? "Aktif" : "Pasif"}
                          </button>
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
  pageIndex,
  pageCount,
  selectedDate,
  settings,
  preview = false,
}: {
  staff: StaffMember[];
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
            <th>Departman</th>
            <th>Giriş Saati</th>
            <th>İmza</th>
            <th>Geç Kalma Açıklaması</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id}>
              <td>{member.order}</td>
              <td>{member.name}</td>
              <td>{member.department}</td>
              <td />
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
