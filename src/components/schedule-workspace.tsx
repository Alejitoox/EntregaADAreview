"use client";

import { useEffect, useRef, useState } from "react";

type User = { id: string; name: string; email: string };
type Meeting = { day: string; startMinute: number; endMinute: number };
type GeneratedSchedule = {
  name?: string;
  courses: { courseId: string; sectionId: string; meetings: Meeting[] }[];
};
type SavedSchedule = {
  id: number;
  title: string;
  level: number;
  schedule: GeneratedSchedule;
  created_at: string;
  owner_name: string;
  participants: (User & { role: string })[];
};

export default function ScheduleWorkspace() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedSchedule[]>([]);
  const [sourceJson, setSourceJson] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [generated, setGenerated] = useState<GeneratedSchedule[]>([]);
  const [activeSchedule, setActiveSchedule] = useState(0);
  const [title, setTitle] = useState("Horario nivel 0");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/users")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los usuarios.");
        setUsers(body.users);
        setCurrentUserId((current) => current || body.users[0]?.id || "");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Error de conexión"));
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    fetch(`/api/schedules?userId=${encodeURIComponent(currentUserId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar tus horarios.");
        setSaved(body.schedules);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Error de conexión"));
  }, [currentUserId]);

  const selectedUser = users.find((user) => user.id === currentUserId);

  async function chooseFile(file?: File) {
    setError("");
    setNotice("");
    setGenerated([]);
    setSourceJson(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setSourceJson(parsed);
      setFileName(file.name);
      setNotice("Archivo cargado. Ejecuta el nivel 0 para buscar horarios sin cruces.");
    } catch {
      setFileName("");
      setError("El archivo no contiene JSON válido.");
    }
  }

  async function generate() {
    if (!sourceJson) return setError("Primero selecciona un archivo JSON.");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceJson }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo generar el horario.");
      setGenerated(body.schedules);
      setActiveSchedule(0);
      setNotice(body.schedules.length
        ? `${body.schedules.length}${body.truncated ? "+" : ""} horarios válidos encontrados.`
        : "El nivel 0 no encontró una combinación que cumpla las restricciones duras.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar el horario.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const schedule = generated[activeSchedule];
    if (!schedule || !currentUserId || !sourceJson) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerUserId: currentUserId,
          participantIds,
          title,
          level: 0,
          sourceJson,
          schedule,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar el horario.");
      const refreshed = await fetch(`/api/schedules?userId=${encodeURIComponent(currentUserId)}`);
      const refreshedBody = await refreshed.json();
      setSaved(refreshedBody.schedules ?? []);
      setNotice("Horario guardado en PostgreSQL con sus participantes y JSON de origen.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el horario.");
    } finally {
      setBusy(false);
    }
  }

  function download(schedule: GeneratedSchedule, suffix: string) {
    downloadFile(JSON.stringify(schedule, null, 2), `${suffix}.json`, "application/json");
  }

  function downloadText(schedule: GeneratedSchedule, suffix: string) {
    const courses = Array.isArray(schedule?.courses) ? schedule.courses : [];
    const lines = [schedule?.name ?? "Horario", "", ...courses.flatMap((course) => [
      `${course.courseId} · Grupo ${course.sectionId}`,
      ...course.meetings.map((meeting) => `  ${formatMeeting(meeting)}`),
      "",
    ])];
    downloadFile(lines.join("\n"), `${suffix}.txt`, "text/plain;charset=utf-8");
  }

  function downloadFile(content: string, fileName: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <div className="brand" aria-label="Mis horarios">
            <span className="brand-mark">H</span>
            <span><strong>Mis horarios</strong><small>Nivel 0 · Restricciones duras</small></span>
          </div>
          <label className="local-user-select">
            <span>Usuario local de prueba</span>
            <select value={currentUserId} onChange={(event) => setCurrentUserId(event.target.value)}>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      <main className="main schedule-workspace">
        <div className="page-heading">
          <span>Panel de desarrollo con PostgreSQL en Docker</span>
          <h1>{selectedUser ? `Hola, ${selectedUser.name.split(" ")[0]}` : "Horarios universitarios"}</h1>
          <p>Sube el JSON de un estudiante, genera horarios sin cruces y guarda el resultado para el usuario seleccionado.</p>
        </div>

        {error && <div className="workspace-message error" role="alert">{error}</div>}
        {notice && <div className="workspace-message success" role="status">{notice}</div>}

        <div className="workspace-grid">
          <section className="workspace-panel">
            <div className="panel-heading"><span className="step-number">1</span><div><h2>Archivo de entrada</h2><p>Catálogo y materias solicitadas por el estudiante.</p></div></div>
            <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => chooseFile(event.target.files?.[0])} />
            <button className="file-drop" type="button" onClick={() => fileInput.current?.click()}>
              <span className="upload-symbol">↑</span>
              <strong>{fileName || "Elegir archivo JSON"}</strong>
              <small>Se valida al ejecutar el algoritmo.</small>
            </button>
            <button className="button button-primary wide-button" type="button" disabled={busy || !sourceJson} onClick={generate}>
              {busy ? "Procesando…" : "Generar horarios de nivel 0"}
            </button>
          </section>

          <section className="workspace-panel">
            <div className="panel-heading"><span className="step-number">2</span><div><h2>Participantes</h2><p>El horario se comparte con los usuarios seleccionados.</p></div></div>
            <div className="owner-card"><span className="participant-avatar">{initials(selectedUser?.name ?? "")}</span><span><strong>{selectedUser?.name ?? "Cargando usuario…"}</strong><small>Propietario del horario</small></span><span className="owner-tag">Dueño</span></div>
            <div className="participant-list">
              {users.filter((user) => user.id !== currentUserId).map((user) => (
                <label className="participant-option" key={user.id}>
                  <input type="checkbox" checked={participantIds.includes(user.id)} onChange={(event) => setParticipantIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />
                  <span className="participant-avatar muted">{initials(user.name)}</span>
                  <span><strong>{user.name}</strong><small>{user.email}</small></span>
                </label>
              ))}
              {users.length < 2 && <p className="empty-state">Agrega usuarios de prueba en la base para invitar participantes.</p>}
            </div>
            <label className="field schedule-title-field"><span>Nombre del horario</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
          </section>
        </div>

        {generated.length > 0 && (
          <section className="workspace-panel generated-panel">
            <div className="panel-heading"><span className="step-number">3</span><div><h2>Horarios válidos</h2><p>Selecciona una opción para verla y guardarla.</p></div></div>
            <div className="generated-layout">
              <div className="generated-options">
                {generated.map((schedule, index) => <button key={index} className={`generated-option ${activeSchedule === index ? "active" : ""}`} onClick={() => setActiveSchedule(index)} type="button"><span><strong>{schedule.name ?? `Horario ${index + 1}`}</strong><small>{schedule.courses.length} materias sin cruces</small></span><span className="option-check">{activeSchedule === index ? "✓" : ""}</span></button>)}
              </div>
              <div className="schedule-preview">
                <div className="schedule-preview-heading"><h3>{generated[activeSchedule]?.name ?? `Horario ${activeSchedule + 1}`}</h3><div className="saved-actions"><button className="text-button" type="button" onClick={() => download(generated[activeSchedule], "horario-nivel-0")}>Descargar JSON</button><button className="text-button" type="button" onClick={() => downloadText(generated[activeSchedule], "horario-nivel-0")}>Descargar TXT</button></div></div>
                {generated[activeSchedule]?.courses.map((course) => <div className="course-row" key={`${course.courseId}-${course.sectionId}`}><strong>{course.courseId}</strong><span>Grupo {course.sectionId}</span><small>{course.meetings.map(formatMeeting).join(" · ")}</small></div>)}
                <button className="button button-primary wide-button" type="button" disabled={busy || !title.trim()} onClick={save}>Guardar para {selectedUser?.name ?? "usuario"}</button>
              </div>
            </div>
          </section>
        )}

        <section className="saved-section">
          <div className="section-title"><div><h2>Horarios guardados</h2><p>Horarios propios y compartidos con {selectedUser?.name ?? "este usuario"}.</p></div><span className="count-pill">{saved.length}</span></div>
          {saved.length === 0 ? <div className="empty-saved">Todavía no hay horarios guardados para este usuario.</div> : <div className="saved-list">{saved.map((item) => <article className="saved-card saved-card-real" key={item.id}><div><h3>{item.title}</h3><p>Guardado por {item.owner_name} · {new Date(item.created_at).toLocaleString("es-CO")}</p><div className="saved-participants">{item.participants.map((participant) => <span key={participant.id}>{participant.name}{participant.role === "owner" ? " · dueño" : ""}</span>)}</div></div><div className="saved-actions"><span className="level-pill">Nivel {item.level}</span><button className="text-button" type="button" onClick={() => download(item.schedule, `horario-${item.id}`)}>Descargar JSON</button><button className="text-button" type="button" onClick={() => downloadText(item.schedule, `horario-${item.id}`)}>Descargar TXT</button></div></article>)}</div>}
        </section>
        <p className="local-auth-note">La selección de usuario es solo para desarrollo local. La autenticación real se conectará en una etapa posterior.</p>
      </main>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatMeeting(meeting: Meeting) {
  const dayNames: Record<string, string> = { "1": "Lun", "2": "Mar", "3": "Mié", "4": "Jue", "5": "Vie", "6": "Sáb" };
  return `${dayNames[meeting.day] ?? meeting.day} ${formatTime(meeting.startMinute)}–${formatTime(meeting.endMinute)}`;
}

function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
