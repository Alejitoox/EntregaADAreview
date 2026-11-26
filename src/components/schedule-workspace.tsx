"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HorarioVista, RespuestaGeneracion } from "../application/scheduling/ejecutar-archivo";
import type { ErrorValidacion } from "../domain/scheduling/modelo";
import { supabaseBrowser } from "../infrastructure/supabase/browser";
import { authEnabled } from "../infrastructure/supabase/config";
import {
  datosDeFuente,
  textoDeHorario,
  textoDeResultado,
  validezDeHorario,
} from "../application/scheduling/exportar-bajo-demanda.ts";
import { vistaDeCompacto, type HorarioCompacto } from "../application/scheduling/ejecutar-archivo.ts";
import type { Validez } from "../domain/scheduling/exportar.ts";
import { DIAS } from "../domain/scheduling/modelo.ts";
import { etiquetaDeCriterio, NIVEL_MAXIMO } from "../domain/scheduling/niveles.ts";
import {
  guardarCuenta,
  leerCuentas,
  quitarCuenta,
  type CuentaRecordada,
} from "../infrastructure/supabase/cuentas-recordadas";

type View = "auth" | "generated" | "saved" | "upload" | "calendar";
type User = { id: string; name: string; email: string };
function Icon({
  name,
  size = 19,
}: {
  name:
    | "user"
    | "calendar"
    | "bookmark"
    | "download"
    | "upload"
    | "file"
    | "play"
    | "check"
    | "arrow"
    | "trash";
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M3.5 10h17" />
      </>
    ),
    bookmark: <path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z" />,
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M5 19.5h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
        <path d="M5 19.5h14" />
      </>
    ),
    file: (
      <>
        <path d="M7 2.5h7l4 4v15H7z" />
        <path d="M14 2.5v4h4" />
      </>
    ),
    play: <path d="m9 7 8 5-8 5z" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="m15 18-6-6 6-6" />,
    trash: (
      <>
        <path d="M4 7h16M9.5 7V4.5h5V7" />
        <path d="M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Button({
  children,
  icon,
  primary = false,
  warning = false,
  active = false,
  disabled = false,
  autoFocus = false,
  onClick,
}: {
  children: ReactNode;
  icon?: Parameters<typeof Icon>[0]["name"];
  primary?: boolean;
  warning?: boolean;
  active?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`button ${primary ? "button-primary" : ""} ${warning ? "button-warning" : ""} ${active ? "button-saved" : ""}`}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

type AccountControls = {
  list: CuentaRecordada[];
  onSwitch: (id: string) => Promise<void> | void;
  onAdd: () => void;
};

function Header({
  view,
  setView,
  user,
  hasResult,
  accounts,
}: {
  view: View;
  setView: (view: View) => void;
  user: User;
  hasResult: boolean;
  accounts: AccountControls;
}) {
  return (
    <header className="header">
      <div className="header-inner">
        <button
          className="brand"
          onClick={() => setView("saved")}
          aria-label="Ir a mis horarios guardados"
        >
          <span className="brand-mark">H</span>
          <span>
            <strong>Mis horarios</strong>
            <small>Periodo 2026-30</small>
          </span>
        </button>
        <nav className="nav">
          <button className={view === "saved" ? "nav-active" : ""} onClick={() => setView("saved")}>
            Guardados
          </button>
          <button
            className={view === "upload" ? "nav-active" : ""}
            onClick={() => setView("upload")}
          >
            Subir JSON
          </button>
          {hasResult && (
            <button
              className={view === "generated" ? "nav-active" : ""}
              onClick={() => setView("generated")}
            >
              Horarios generados
            </button>
          )}
        </nav>
        <div className="account">
          <details className="account-switcher">
            <summary aria-label="Cambiar de usuario">
              <span className="avatar">
                <Icon name="user" />
              </span>
              <span className="account-copy">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
              <span className="switch-chevron" />
            </summary>
            <div className="account-menu">
              <div className="account-menu-heading">
                <strong>Cambiar de usuario</strong>
                <small>
                  {accounts?.list.length ?? 1}{" "}
                  {(accounts?.list.length ?? 1) === 1 ? "cuenta" : "cuentas"} en este navegador
                </small>
              </div>
              <div className="account-options">
                {(accounts?.list ?? []).map((account) => (
                  <button
                    className={account.id === user.id ? "selected" : ""}
                    type="button"
                    key={account.id}
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      if (account.id !== user.id) void accounts?.onSwitch(account.id);
                    }}
                  >
                    <span className="menu-avatar">
                      {account.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span>
                      <strong>{account.name}</strong>
                      <small>{account.email}</small>
                    </span>
                    {account.id === user.id && <Icon name="check" size={17} />}
                  </button>
                ))}
              </div>
              <div className="account-footer">
                <button
                  className="account-add"
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    accounts?.onAdd();
                  }}
                >
                  + Agregar otra cuenta
                </button>
              </div>
            </div>
          </details>
          <button className="logout" onClick={() => setView("auth")}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}

function Auth({
  status,
  onCredentials,
  onCancel,
}: {
  status: string;
  onCancel?: () => void;
  onCredentials: (
    mode: "login" | "register",
    data: { name: string; email: string; password: string },
  ) => Promise<string>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  async function submit() {
    if (submitting) return;
    if (mode === "register" && password !== confirm) {
      setFormMessage("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    setFormMessage("");
    try {
      setFormMessage(
        await onCredentials(mode, { name: name.trim(), email: email.trim(), password }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="auth-copy">
          <div className="brand auth-brand">
            <span className="brand-mark">H</span>
            <span>
              <strong>Mis horarios</strong>
              <small>Periodo 2026-30</small>
            </span>
          </div>
          <h1>
            Arma tu horario del
            <br />
            semestre
          </h1>
          <p>
            Sube tu archivo JSON, revisa los horarios válidos que genera el algoritmo y guarda el
            que más te sirva.
          </p>
        </div>
      </section>
      <section className="auth-form-side">
        <form
          className="auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Registrarse
            </button>
          </div>
          <div className="auth-heading">
            <h2>{mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h2>
            <p>
              {mode === "login"
                ? "Ingresa para ver tus horarios guardados."
                : "Regístrate para comenzar a organizar tu semestre."}
            </p>
          </div>
          <fieldset disabled={submitting} className="auth-fields">
            {mode === "register" && (
              <label className="field">
                <span>Nombre completo</span>
                <input
                  type="text"
                  placeholder="Tu nombre"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            <label className="field">
              <span>Correo electrónico</span>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {mode === "register" && (
              <label className="field">
                <span>Confirmar contraseña</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>
            )}
            <button className="auth-submit" type="submit">
              {submitting ? "Un momento…" : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          </fieldset>
          {onCancel && (
            <button className="auth-back" type="button" onClick={onCancel}>
              ← Volver a mi cuenta actual
            </button>
          )}
          {status && (
            <p role="status" className="footnote">
              {status}
            </p>
          )}
          {formMessage && (
            <p role="alert" className="form-error">
              {formMessage}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

/** Sin las variables de Supabase la aplicación no puede iniciar sesión ni guardar. */
function MissingConfig() {
  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-heading">
            <h2>Falta configurar Supabase</h2>
            <p>
              Define NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y DATABASE_URL
              (ver docs/supabase.md) y vuelve a iniciar la aplicación.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Lo que se guarda y se dibuja de un horario; `HorarioVista` lo cumple completo. */
type ScheduleData = Pick<HorarioVista, "name" | "courses"> &
  Partial<Pick<HorarioVista, "materias" | "creditosTotales" | "omitidas">>;

type SavedSchedule = {
  id: string;
  title: string;
  level: number;
  schedule: Partial<ScheduleData>;
  source_json: unknown;
  created_at: string;
};
/** `level` es el nivel hasta el que cumple el horario: 8 es válido, menos es NO válido. */
type ScheduleView = {
  title: string;
  level: number;
  schedule: ScheduleData;
  source: unknown;
};

function isValidLevel(level: number) {
  return level >= NIVEL_MAXIMO;
}

/** "Días libres (Inglés, grupo ING-02, el viernes 08:00 a 10:00)". */
function failureText(item: Validez["incumplimientos"][number]) {
  return `${etiquetaDeCriterio(item.criterio)}${item.detalle ? ` (${item.detalle})` : ""}`;
}

/** Etiqueta "NO VÁLIDO" con el color de advertencia. */
function InvalidBadge() {
  return <span className="badge-invalid">NO VÁLIDO</span>;
}

/** Líneas "No cumple: …", una por criterio incumplido. */
function FailureList({ validez }: { validez: Validez | null }) {
  if (!validez || validez.incumplimientos.length === 0) return null;
  return (
    <ul className="fails">
      {validez.incumplimientos.map((item) => (
        <li key={item.criterio}>
          <b>No cumple:</b> {failureText(item)}
        </li>
      ))}
    </ul>
  );
}
type ValidatedFile = { name: string; source: unknown };

/** Estado de la validación inmediata: lista completa de errores, agrupada por bloque. */
type ValidationResponse = { valid: boolean; errores: ErrorValidacion[] };

const BLOCK_TITLES: Record<string, string> = {
  catalogo: "Bloque catalogo",
  estudiante: "Bloque estudiante",
  archivo: "Archivo",
};

function blockOf(error: ErrorValidacion) {
  const root = error.ruta.split(/[.[]/)[0];
  return root === "catalogo" || root === "estudiante" ? root : "archivo";
}

function ValidationErrors({ errors }: { errors: ErrorValidacion[] }) {
  const groups = ["archivo", "catalogo", "estudiante"]
    .map((block) => ({ block, items: errors.filter((error) => blockOf(error) === block) }))
    .filter(({ items }) => items.length > 0);
  return (
    <section className="error-card" role="alert">
      <h2>
        {errors.length} {errors.length === 1 ? "error encontrado" : "errores encontrados"}
      </h2>
      <p>Corrige el archivo y vuelve a subirlo. No se puede ejecutar el algoritmo con errores.</p>
      {groups.map(({ block, items }) => (
        <div className="error-group" key={block}>
          <h3>
            {BLOCK_TITLES[block]} <span>({items.length})</span>
          </h3>
          <ul>
            {items.map((error, index) => (
              <li key={`${error.ruta}-${error.codigo}-${index}`}>
                <div className="error-head">
                  <code className="error-code">{error.codigo}</code>
                  <code className="error-path">{error.ruta || "(raíz)"}</code>
                </div>
                <p>{error.mensaje}</p>
                <dl>
                  <dt>Se esperaba</dt>
                  <dd>{error.esperado}</dd>
                  <dt>Se encontró</dt>
                  <dd>{error.encontrado ?? "—"}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Archivos de prueba servidos desde public/ejemplos (copias de datos/demostracion). */
const SAMPLE_FILES = [
  { file: "exitoso.json", label: "JSON exitoso" },
  { file: "falla-nivel-0-altas-se-cruzan.json", label: "Falla en nivel 0 (altas se cruzan)" },
  { file: "llega-hasta-nivel-5.json", label: "Llega hasta el nivel 5" },
];

function Upload({
  title,
  onTitleChange,
  file,
  onFileChange,
  onGenerate,
  onCancel,
  busy,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  file: ValidatedFile | null;
  onFileChange: (file: ValidatedFile | null) => void;
  onGenerate: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const validation = useRef(0);
  const [fileName, setFileName] = useState(file?.name ?? "");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [fileErrors, setFileErrors] = useState<ErrorValidacion[]>([]);

  async function chooseFile(name: string, read: () => Promise<unknown>) {
    const attempt = ++validation.current;
    setFileName(name);
    setValidating(true);
    setError("");
    setFileErrors([]);
    onFileChange(null);
    try {
      const source = await read();
      const report = await post<ValidationResponse>("/api/generate", {
        sourceJson: source,
        validateOnly: true,
      });
      if (attempt !== validation.current) return;
      if (report.valid) onFileChange({ name, source });
      else setFileErrors(report.errores);
    } catch (cause) {
      if (attempt === validation.current) setError(message(cause));
    } finally {
      if (attempt === validation.current) setValidating(false);
    }
  }

  useEffect(
    () => () => {
      validation.current += 1;
    },
    [],
  );

  return (
    <>
      <div className="page-heading">
        <h1>Subir JSON</h1>
        <p>
          Al elegir el archivo se valida de inmediato. Solo podrás ejecutar el algoritmo si es
          válido.
        </p>
      </div>
      <section className="file-card">
        <span className="file-icon">
          <Icon name="file" size={24} />
        </span>
        <div>
          <strong>{fileName || "Archivo JSON del estudiante"}</strong>
          <small>{fileName ? "Archivo seleccionado" : "Selecciona un archivo para comenzar"}</small>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!selected) return;
            void chooseFile(selected.name, async () => {
              const text = await selected.text();
              try {
                return JSON.parse(text);
              } catch {
                // El servidor informa la línea y la columna del error (JSON_MAL_FORMADO).
                return text;
              }
            });
          }}
        />
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {fileName ? "Elegir otro archivo" : "Elegir archivo"}
        </Button>
      </section>
      <div className="sample-upload">
        <span>Probar con un archivo de ejemplo:</span>
        <div className="actions">
          {SAMPLE_FILES.map((sample) => (
            <Button
              key={sample.file}
              disabled={busy || validating}
              onClick={() => void chooseFile(sample.file, () => api(`/ejemplos/${sample.file}`))}
            >
              {sample.label}
            </Button>
          ))}
        </div>
      </div>
      {validating && <p role="status">Validando archivo…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {fileErrors.length > 0 && <ValidationErrors errors={fileErrors} />}
      {file && (
        <>
          <section className="success-card" role="status">
            <Icon name="check" size={27} />
            <div>
              <strong>Archivo válido</strong>
              <p>No se encontraron errores. Ya puedes ejecutar el algoritmo.</p>
            </div>
          </section>
          <div className="validation-grid">
            <div>
              <Icon name="check" />
              <strong>Bloque catalogo</strong>
            </div>
            <div>
              <Icon name="check" />
              <strong>Bloque estudiante</strong>
            </div>
          </div>
        </>
      )}
      <label className="field">
        <span>Nombre para guardar (opcional)</span>
        <input
          type="text"
          value={title}
          maxLength={120}
          disabled={busy}
          placeholder="Se usará el nombre del horario"
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <div className="upload-actions">
        <Button disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        <Button primary icon="play" disabled={!file || busy} onClick={onGenerate}>
          {busy ? "Generando…" : "Ejecutar algoritmo"}
        </Button>
      </div>
    </>
  );
}

const PAGINA_DE_HORARIOS = 50;

function ScheduleCards({
  schedules,
  source,
  nivel,
  savedIndices,
  savingIndex,
  onSave,
  onCalendar,
  indexOffset = 0,
}: {
  schedules: HorarioCompacto[];
  source: unknown;
  nivel: number;
  savedIndices: Set<string>;
  savingIndex: string | null;
  onSave: (key: string, item: ScheduleView, schedule: HorarioVista) => void;
  onCalendar: (item: ScheduleView, key: string, schedule: HorarioVista) => void;
  indexOffset?: number;
}) {
  // Con muchos horarios no se dibujan todos de una vez: se muestran por tandas, y el
  // detalle de cada uno se arma aquí con el catálogo del archivo (el servidor solo manda ids).
  const [visibles, setVisibles] = useState(PAGINA_DE_HORARIOS);
  const indice = datosDeFuente(source)?.indice ?? null;
  const valid = isValidLevel(nivel);
  const detallados = indice
    ? schedules.slice(0, visibles).map((horario) => vistaDeCompacto(horario, indice))
    : [];
  return (
    <div className="schedule-list">
      {detallados.map((schedule) => {
        const key = `${indexOffset}-${schedule.id}`;
        const item: ScheduleView = { title: schedule.name, level: nivel, schedule, source };
        const saved = savedIndices.has(key);
        // Por qué no es válido (solo se calcula para los horarios que se ven).
        const validez = valid ? null : validezDeHorario(schedule, source, nivel);
        return (
          <article className={`schedule-card ${valid ? "" : "schedule-invalid"}`} key={key}>
            <div className="schedule-top">
              <h2>
                {schedule.name} {!valid && <InvalidBadge />}
              </h2>
              <span className="credit-pill">{scheduleSize(item)}</span>
            </div>
            <FailureList validez={validez} />
            <div className="omitted">
              <strong>Materias omitidas:</strong>
              {schedule.omitidas.length === 0 ? (
                <span className="plain">Ninguna</span>
              ) : (
                <ul>
                  {schedule.omitidas.map((omitida) => (
                    <li key={omitida.materiaId}>
                      <span className="plain">
                        {materiaName(source, omitida.materiaId)} — {omitida.razones.join("; ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="actions">
              <Button primary icon="calendar" onClick={() => onCalendar(item, key, schedule)}>
                Ver calendario
              </Button>
              <SaveButton
                saved={saved}
                saving={savingIndex === key}
                disabled={savingIndex !== null}
                onClick={() => onSave(key, item, schedule)}
              />
              <DownloadButtons item={item} />
            </div>
          </article>
        );
      })}
      {visibles < schedules.length && (
        <div className="actions">
          <Button onClick={() => setVisibles((actual) => actual + PAGINA_DE_HORARIOS)}>
            Mostrar más ({schedules.length - visibles} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

function SaveButton({
  saved,
  saving,
  disabled,
  onClick,
}: {
  saved: boolean;
  saving: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      icon={saved ? "check" : "bookmark"}
      active={saved}
      disabled={saved || disabled}
      onClick={onClick}
    >
      {saved ? "Guardado" : saving ? "Guardando…" : "Guardar"}
    </Button>
  );
}

/** Materias altas del perfil que no tienen ningún grupo en el catálogo del archivo. */
function missingHighCourses(source: unknown) {
  const instancia = datosDeFuente(source)?.instancia;
  if (!instancia) return [];
  return instancia.sinGrupos
    .filter((m) => m.prioridad === "alta")
    .map((m) => `${materiaName(source, m.materiaId)} (${m.materiaId})`);
}

function Generated({
  result,
  source,
  savedIndices,
  savingIndex,
  onSave,
  onCalendar,
  onUpload,
}: {
  result: RespuestaGeneracion | null;
  source: unknown;
  savedIndices: Set<string>;
  savingIndex: string | null;
  onSave: (key: string, item: ScheduleView, schedule: HorarioVista) => void;
  onCalendar: (item: ScheduleView, key: string, schedule: HorarioVista) => void;
  onUpload: () => void;
}) {
  if (!result) {
    return (
      <>
        <div className="page-heading">
          <h1>Horarios generados</h1>
        </div>
        <div className="schedule-list">
          <p>Sube el JSON de un estudiante para generar horarios.</p>
          <div>
            <Button primary icon="upload" onClick={onUpload}>
              Subir JSON
            </Button>
          </div>
        </div>
      </>
    );
  }

  const ok = result.estado === "OK";
  const level = result.nivelAlcanzado ?? -1;
  const partial = result.horariosNivelAlcanzado;
  const missing = ok ? [] : missingHighCourses(source);
  const plus = result.truncado ? "+" : "";
  return (
    <>
      <div className="page-heading">
        <h1>Horarios generados</h1>
        <p>Resultado del algoritmo para tu archivo.</p>
      </div>
      <section className="summary-card">
        <div className="metric">
          <span>Estado</span>
          <strong className={ok ? "" : "metric-warning metric-text"}>
            {ok ? "OK" : "Sin horario válido"}
          </strong>
        </div>
        <div className="metric">
          <span>Horarios válidos</span>
          <strong className={ok ? "" : "metric-zero"}>
            {result.horarios.length}
            {ok ? plus : ""}
          </strong>
        </div>
        {!ok && (
          <>
            <div className="metric">
              <span>Horarios que no cumplen todo</span>
              <strong className="metric-warning">
                {partial.length}
                {plus}
              </strong>
            </div>
            <div className="metric">
              <span>Cumple hasta el nivel</span>
              <strong className="metric-warning">
                {level < 0 ? (
                  "—"
                ) : (
                  <>
                    {level} <small>de {NIVEL_MAXIMO}</small>
                  </>
                )}
              </strong>
            </div>
          </>
        )}
        <div className="criteria">
          <span>Criterios activos</span>
          <div>
            {result.criteriosActivos.length === 0 && <em>Ninguno</em>}
            {result.criteriosActivos.map((name) => (
              <em key={name}>{etiquetaDeCriterio(name)}</em>
            ))}
          </div>
        </div>
      </section>
      {!ok && missing.length > 0 && (
        <section className="warning-card warning-strong" role="status">
          <strong>⚠ {result.motivo}</strong>
          {partial.length > 0 && (
            <p>
              Abajo están los horarios que se pueden armar con las demás materias. No son válidos
              porque les falta una materia alta.
            </p>
          )}
        </section>
      )}
      {!ok && missing.length === 0 && (
        <section className="warning-card" role="status">
          <strong>No hay horarios que cumplan todos tus criterios</strong>
          {result.motivo && <p>{result.motivo}</p>}
          {result.criteriosNoCumplidos.length > 0 && (
            <p>
              <b>Criterios no cumplidos:</b>{" "}
              {result.criteriosNoCumplidos.map(etiquetaDeCriterio).join(", ")}. El primero es el
              que impidió avanzar; los demás no los cumple ninguno de los horarios de abajo.
            </p>
          )}
        </section>
      )}
      {result.truncado && (
        <p className="footnote">
          Se pidió un límite de horarios y hay más que no se listan: solo aparecen los primeros
          encontrados.
        </p>
      )}
      <div className="actions result-downloads">
        <ResultDownloads result={result} source={source} />
      </div>
      {ok && (
        <ScheduleCards
          schedules={result.horarios}
          source={source}
          nivel={NIVEL_MAXIMO}
          savedIndices={savedIndices}
          savingIndex={savingIndex}
          onSave={onSave}
          onCalendar={onCalendar}
        />
      )}
      {!ok && partial.length > 0 && (
        <>
          <h2 className="subheading subheading-warning">
            ⚠ Horarios que NO cumplen todos tus criterios ({partial.length}
            {plus})
          </h2>
          <p className="subnote">
            {missing.length > 0
              ? `Les falta la materia alta ${missing.join(", ")}.`
              : `Cumplen hasta el nivel ${Math.max(level, 0)} de ${NIVEL_MAXIMO}.`}{" "}
            Puedes verlos o guardarlos, pero no son horarios válidos.
          </p>
          <ScheduleCards
            schedules={partial}
            source={source}
            nivel={Math.max(level, 0)}
            indexOffset={1}
            savedIndices={savedIndices}
            savingIndex={savingIndex}
            onSave={onSave}
            onCalendar={onCalendar}
          />
        </>
      )}
    </>
  );
}

function ResultDownloads({ result, source }: { result: RespuestaGeneracion; source: unknown }) {
  const name = `horarios-${result.estudianteId ?? "estudiante"}`;
  // El texto se arma al pulsar el botón, no al recibir el resultado (puede ser enorme).
  return (
    <>
      <Button
        icon="download"
        onClick={() => downloadText(`${name}.json`, textoDeResultado("json", result, source))}
      >
        Descargar todo (JSON)
      </Button>
      <Button
        icon="download"
        onClick={() => downloadText(`${name}.txt`, textoDeResultado("txt", result, source))}
      >
        Descargar todo (TXT)
      </Button>
    </>
  );
}

/** Diálogo para guardar un horario NO válido: dice qué no cumple y pide confirmación. */
function ConfirmInvalidSave({
  item,
  onCancel,
  onConfirm,
}: {
  item: ScheduleView;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const validez = validezDeHorario(item.schedule, item.source, item.level);
  const failures = validez?.incumplimientos.map(failureText) ?? [];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">⚠ ¿Guardar un horario no válido?</h2>
        <p>
          Este horario no cumple{" "}
          <b>{failures.length > 0 ? failures.join("; ") : "todos tus criterios"}</b>. Cumple hasta
          el nivel {item.level} de {NIVEL_MAXIMO}.
        </p>
        <p>¿Guardar de todos modos?</p>
        <div className="actions dialog-actions">
          <Button autoFocus onClick={onCancel}>
            Cancelar
          </Button>
          <Button warning onClick={onConfirm}>
            Guardar de todos modos
          </Button>
        </div>
      </div>
    </div>
  );
}

function Saved({
  userId,
  onUpload,
  onCalendar,
}: {
  userId: string;
  onUpload: () => void;
  onCalendar: (item: ScheduleView) => void;
}) {
  const [schedules, setSchedules] = useState<SavedSchedule[] | null>(null);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<SavedSchedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Borra el horario en la base de datos y lo quita de la lista. */
  async function remove(record: SavedSchedule) {
    setDeleting(true);
    setError("");
    try {
      await api(`/api/schedules?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
      setSchedules((current) => current?.filter((item) => item.id !== record.id) ?? null);
      setToDelete(null);
    } catch (cause) {
      setError(message(cause));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    api<{ schedules: SavedSchedule[] }>("/api/schedules", { signal: controller.signal })
      .then(({ schedules }) => setSchedules(schedules))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(message(cause));
      });
    return () => controller.abort();
  }, [userId]);

  return (
    <>
      <div className="title-row">
        <div className="page-heading">
          <h1>Mis horarios guardados</h1>
          <p>Los horarios que decidiste conservar.</p>
        </div>
        <Button primary icon="upload" onClick={onUpload}>
          Subir JSON
        </Button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {schedules === null && !error && <p role="status">Cargando horarios…</p>}
      {schedules?.length === 0 && <p className="footnote">Todavía no hay horarios guardados.</p>}
      <div className="saved-list">
        {schedules?.map((record) => {
          const item: ScheduleView = {
            title: record.title,
            level: record.level,
            schedule: {
              ...record.schedule,
              name: record.title,
              courses: record.schedule.courses ?? [],
            },
            source: record.source_json,
          };
          return (
            <article className="saved-card" key={record.id}>
              <button
                type="button"
                className="delete-saved"
                aria-label={`Eliminar ${record.title}`}
                title="Eliminar horario guardado"
                disabled={deleting}
                onClick={() => setToDelete(record)}
              >
                <Icon name="trash" size={18} />
              </button>
              <div>
                <h2>{record.title}</h2>
                {isValidLevel(record.level) ? (
                  <span className="badge-valid">✓ Válido</span>
                ) : (
                  <span className="badge-novalid">
                    ⚠ No válido · cumple hasta nivel {record.level}
                  </span>
                )}
                <p className="saved-details">
                  {new Date(record.created_at).toLocaleDateString("es-CO", {
                    dateStyle: "long",
                    timeZone: "America/Bogota",
                  })}
                </p>
              </div>
              <div className="actions">
                <Button primary icon="calendar" onClick={() => onCalendar(item)}>
                  Abrir calendario
                </Button>
                <DownloadButtons item={item} />
              </div>
            </article>
          );
        })}
      </div>
      {toDelete && (
        <ConfirmDelete
          title={toDelete.title}
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove(toDelete)}
        />
      )}
    </>
  );
}

/** Confirmación antes de borrar un horario guardado (no se puede deshacer). */
function ConfirmDelete({
  title,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return (
    <div className="dialog-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-title">¿Eliminar este horario guardado?</h2>
        <p>
          Se eliminará <b>{title}</b> de tus horarios guardados. Esta acción no se puede deshacer.
        </p>
        <div className="actions dialog-actions">
          <Button autoFocus disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button warning disabled={busy} onClick={onConfirm}>
            {busy ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const colors = ["blue", "green", "yellow", "purple"];

/** Etiquetas de los criterios que rompe una sesión del calendario (vacío si no rompe ninguno). */
function sessionFailures(
  validez: Validez | null,
  sectionId: string,
  meeting: { day: string; startMinute: number; endMinute: number },
) {
  if (!validez) return [];
  return validez.incumplimientos
    .filter((item) =>
      item.responsables.some((r) =>
        r.sesion
          ? r.grupoId === sectionId &&
            DIAS.indexOf(r.sesion.dia) + 1 === Number(meeting.day) &&
            r.sesion.inicio === meeting.startMinute &&
            r.sesion.fin === meeting.endMinute
          : r.grupoId === sectionId,
      ),
    )
    .map((item) => etiquetaDeCriterio(item.criterio));
}

function Calendar({
  item,
  onBack,
  save,
}: {
  item: ScheduleView;
  onBack: () => void;
  /** Solo cuando el calendario se abrió desde los horarios generados. */
  save?: { saved: boolean; saving: boolean; disabled: boolean; onClick: () => void };
}) {
  const catalog = catalogEntries(item.source);
  const valid = isValidLevel(item.level);
  const validez = valid ? null : validezDeHorario(item.schedule, item.source, item.level);
  const failures = validez?.incumplimientos.map(failureText) ?? [];
  const sessions = item.schedule.courses.flatMap((course, index) =>
    course.meetings.map((meeting) => ({
      ...meeting,
      course,
      color: colors[index % colors.length],
      failures: sessionFailures(validez, course.sectionId, meeting),
    })),
  );
  const startHour = Math.min(7, ...sessions.map(({ startMinute }) => Math.floor(startMinute / 60)));
  const endHour = Math.max(17, ...sessions.map(({ endMinute }) => Math.ceil(endMinute / 60)));
  const minutes = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

  return (
    <>
      <button className="back" type="button" onClick={onBack}>
        <Icon name="arrow" />
        Volver a la lista
      </button>
      <div className="calendar-title">
        <div>
          <h1>
            {item.title} {!valid && <InvalidBadge />}
          </h1>
          <p>
            {scheduleSize(item)} ·{" "}
            {valid
              ? `Válido · cumple los niveles 0 a ${NIVEL_MAXIMO}`
              : `Cumple hasta el nivel ${item.level} de ${NIVEL_MAXIMO}`}
          </p>
        </div>
        <div className="actions">
          {save && <SaveButton {...save} />}
          <DownloadButtons item={item} fullLabel />
        </div>
      </div>
      {!valid && (
        <div className="invalid-banner" role="alert">
          <span aria-hidden="true">⚠</span>
          <div>
            <strong>Horario NO válido:</strong> no cumple{" "}
            {failures.length > 0 ? failures.join("; ") : "todos tus criterios"}.
            {sessions.some((session) => session.failures.length > 0) &&
              " Los bloques marcados son los que incumplen."}
          </div>
        </div>
      )}
      {sessions.length === 0 ? (
        <p className="footnote">Este horario no tiene sesiones registradas.</p>
      ) : (
        <div className="calendar-wrap">
          <div className="calendar-grid timetable">
            <div className="calendar-head time-head">Hora</div>
            {days.map((day) => (
              <div className="calendar-head" key={day}>
                {day}
              </div>
            ))}
            <div className="time-column">
              {hours.map((hour) => (
                <span key={hour}>{formatTime(hour * 60)}</span>
              ))}
            </div>
            {days.map((day, index) => (
              <div className="day-column timetable-day" key={day} style={{ gridColumn: index + 2 }}>
                {sessions
                  .filter((session) => Number(session.day) === index + 1)
                  .map((session) => {
                    const name =
                      catalog.get(session.course.courseId)?.name ?? session.course.courseId;
                    const professor = item.schedule.materias?.find(
                      ({ courseId }) => courseId === session.course.courseId,
                    )?.profesor;
                    const interval = `${formatTime(session.startMinute)}–${formatTime(session.endMinute)}`;
                    const bad = session.failures.length > 0;
                    return (
                      <div
                        className={`class-block ${session.color} ${bad ? "class-block-bad" : ""}`}
                        key={`${session.course.courseId}-${session.startMinute}-${session.endMinute}`}
                        style={{
                          top: `${((session.startMinute - startHour * 60) / minutes) * 100}%`,
                          height: `${((session.endMinute - session.startMinute) / minutes) * 100}%`,
                        }}
                        title={`${name} · Grupo ${session.course.sectionId}${professor ? ` · ${professor}` : ""} · ${interval}${bad ? ` · Incumple: ${session.failures.join(", ")}` : ""}`}
                      >
                        <strong>{name}</strong>
                        <span>
                          Grupo {session.course.sectionId} · {interval}
                        </span>
                        {professor && <span>{professor}</span>}
                        {bad && (
                          <em className="block-flag">⚠ Incumple: {session.failures.join(", ")}</em>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function catalogEntries(source: unknown) {
  const catalog = source as { catalogo?: { materias?: unknown } } | null;
  const entries = new Map<string, { name?: string; credits?: number }>();
  if (!Array.isArray(catalog?.catalogo?.materias)) return entries;
  for (const entry of catalog.catalogo.materias) {
    if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) continue;
    entries.set(String(entry.id), {
      name: typeof entry.nombre === "string" ? entry.nombre : undefined,
      credits: typeof entry.creditos === "number" ? entry.creditos : undefined,
    });
  }
  return entries;
}

function scheduleSize(item: ScheduleView) {
  if (typeof item.schedule.creditosTotales === "number") {
    return `${item.schedule.creditosTotales} créditos totales`;
  }
  const catalog = catalogEntries(item.source);
  const credits = item.schedule.courses.map(({ courseId }) => catalog.get(courseId)?.credits);
  if (credits.length > 0 && credits.every((credit): credit is number => credit !== undefined)) {
    return `${credits.reduce((total, credit) => total + credit, 0)} créditos totales`;
  }
  const count = item.schedule.courses.length;
  return `${count} ${count === 1 ? "materia" : "materias"}`;
}

function materiaName(source: unknown, id: string) {
  return catalogEntries(source).get(id)?.name ?? id;
}

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  return `${hour.toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

function downloadText(fileName: string, content: string) {
  const type = fileName.endsWith(".json") ? "application/json" : "text/plain;charset=utf-8";
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function DownloadButtons({ item, fullLabel = false }: { item: ScheduleView; fullLabel?: boolean }) {
  function download(extension: "json" | "txt") {
    // Se arma al pulsar el botón, con el mismo exportador del dominio que usan las pruebas.
    let content = textoDeHorario(extension, item.schedule, item.source, item.level);
    if (content === null) {
      // Archivo de origen ilegible (horarios guardados muy antiguos): texto simple de respaldo.
      const catalog = catalogEntries(item.source);
      const lines = item.schedule.courses.flatMap((course) => [
        `${catalog.get(course.courseId)?.name ?? course.courseId} · Grupo ${course.sectionId}`,
        ...course.meetings.map(
          (session) =>
            `  ${days[Number(session.day) - 1]} ${formatTime(session.startMinute)}–${formatTime(session.endMinute)}`,
        ),
      ]);
      const mark = isValidLevel(item.level)
        ? []
        : [`NO VÁLIDO: cumple hasta el nivel ${item.level} de ${NIVEL_MAXIMO}`];
      content =
        extension === "json"
          ? JSON.stringify(
              isValidLevel(item.level)
                ? item.schedule
                : { validez: "NO VÁLIDO", cumpleHastaNivel: item.level, ...item.schedule },
              null,
              2,
            )
          : [item.title, ...mark, ...lines].join("\n");
    }
    downloadText(`${item.title}.${extension}`, content);
  }

  return (
    <>
      <Button icon="download" onClick={() => download("json")}>
        {fullLabel ? "Descargar JSON" : "JSON"}
      </Button>
      <Button icon="download" onClick={() => download("txt")}>
        {fullLabel ? "Descargar TXT" : "TXT"}
      </Button>
    </>
  );
}

/** Token de la sesión de Supabase; lo pone `ScheduleWorkspace` al iniciar o cerrar sesión. */
let accessToken: string | null = null;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la solicitud.");
  return body as T;
}

function post<T>(url: string, body: unknown) {
  return api<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

function SignedIn({
  user,
  setUser,
  accounts,
}: {
  user: User;
  setUser: (user: User | null) => void;
  accounts: AccountControls;
}) {
  // Tras iniciar sesión se llega a "Mis horarios guardados", que es el inicio.
  const [view, setView] = useState<Exclude<View, "auth">>("saved");
  const [file, setFile] = useState<ValidatedFile | null>(null);
  const [result, setResult] = useState<RespuestaGeneracion | null>(null);
  const [title, setTitle] = useState("");
  const [savedIndices, setSavedIndices] = useState(new Set<string>());
  const [savingIndex, setSavingIndex] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState<{
    key: string;
    item: ScheduleView;
    schedule: HorarioVista;
  } | null>(null);
  const [calendar, setCalendar] = useState<{
    item: ScheduleView;
    back: "generated" | "saved";
    /** Para poder guardar desde el calendario de un horario generado. */
    generated?: { key: string; schedule: HorarioVista };
  } | null>(null);

  function navigate(next: View) {
    if (next === "auth") {
      setUser(null);
      return;
    }
    setStatus("");
    setView(next);
  }

  function openCalendar(
    item: ScheduleView,
    back: "generated" | "saved",
    generated?: { key: string; schedule: HorarioVista },
  ) {
    setCalendar({ item, back, generated });
    navigate("calendar");
  }

  async function generate() {
    if (!file || generating) return;
    setStatus("");
    setGenerating(true);
    try {
      setResult(await post<RespuestaGeneracion>("/api/generate", { sourceJson: file.source }));
      setSavedIndices(new Set<string>());
      navigate("generated");
    } catch (error) {
      setStatus(message(error));
    } finally {
      setGenerating(false);
    }
  }

  /** Un horario válido se guarda directo; uno NO válido pide confirmación primero. */
  function requestSave(key: string, item: ScheduleView, schedule: HorarioVista) {
    if (savingIndex !== null || savedIndices.has(key)) return;
    if (isValidLevel(item.level)) void save(key, item, schedule);
    else setConfirming({ key, item, schedule });
  }

  async function save(key: string, item: ScheduleView, schedule: HorarioVista) {
    if (!file || !result || savingIndex !== null || savedIndices.has(key)) return;
    setStatus("");
    setSavingIndex(key);
    try {
      await post("/api/schedules", {
        title: title.trim() || schedule.name,
        level: Math.max(item.level, 0),
        sourceJson: file.source,
        schedule,
      });
      setSavedIndices((current) => new Set(current).add(key));
    } catch (error) {
      setStatus(message(error));
    } finally {
      setSavingIndex(null);
    }
  }

  return (
    <div className="app-shell">
      <Header
        view={view}
        setView={navigate}
        user={user}
        hasResult={result !== null}
        accounts={accounts}
      />
      <main className={`main ${view === "calendar" ? "calendar-page" : ""}`}>
        {status && (
          <p className="form-error" role="alert">
            {status}
          </p>
        )}
        {view === "upload" && (
          <Upload
            title={title}
            onTitleChange={setTitle}
            file={file}
            busy={generating || savingIndex !== null}
            onFileChange={(next) => {
              setFile(next);
              setResult(null);
              setSavedIndices(new Set<string>());
              setStatus("");
            }}
            onGenerate={() => void generate()}
            onCancel={() => navigate("saved")}
          />
        )}
        {view === "generated" && (
          <Generated
            result={result}
            source={file?.source}
            savingIndex={savingIndex}
            savedIndices={savedIndices}
            onSave={requestSave}
            onUpload={() => navigate("upload")}
            onCalendar={(item, key, schedule) =>
              openCalendar(item, "generated", { key, schedule })
            }
          />
        )}
        {view === "saved" && (
          <Saved
            userId={user.id}
            onUpload={() => navigate("upload")}
            onCalendar={(item) => openCalendar(item, "saved")}
          />
        )}
        {view === "calendar" && calendar && (
          <Calendar
            item={calendar.item}
            onBack={() => navigate(calendar.back)}
            save={
              calendar.generated && {
                saved: savedIndices.has(calendar.generated.key),
                saving: savingIndex === calendar.generated.key,
                disabled: savingIndex !== null,
                onClick: () =>
                  requestSave(
                    calendar.generated!.key,
                    calendar.item,
                    calendar.generated!.schedule,
                  ),
              }
            }
          />
        )}
      </main>
      {confirming && (
        <ConfirmInvalidSave
          item={confirming.item}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { key, item, schedule } = confirming;
            setConfirming(null);
            void save(key, item, schedule);
          }}
        />
      )}
    </div>
  );
}

function friendlyAuthError(error: { message: string }) {
  const text = error.message.toLowerCase();
  if (text.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (text.includes("already registered")) return "Ese correo ya tiene una cuenta. Inicia sesión.";
  if (text.includes("email not confirmed")) return "Confirma tu correo antes de iniciar sesión.";
  if (text.includes("password")) return "La contraseña debe tener al menos 6 caracteres.";
  return error.message;
}

export default function ScheduleWorkspace() {
  return authEnabled ? <Workspace /> : <MissingConfig />;
}

function Workspace() {
  const [status, setStatus] = useState("");
  const [user, setUserState] = useState<User | null>(null);
  const [cuentas, setCuentas] = useState<CuentaRecordada[]>([]);
  const [adding, setAdding] = useState(false);

  // Recupera la sesión guardada de Supabase y mantiene el token al día.
  useEffect(() => {
    const supabase = supabaseBrowser();
    let active = true;

    async function enter(token: string | null) {
      accessToken = token;
      if (!token) {
        setUserState(null);
        return;
      }
      try {
        const { user } = await api<{ user: User }>("/api/me");
        if (active) setUserState(user);
      } catch (error) {
        if (active) {
          setStatus(message(error));
          setUserState(null);
        }
      }
    }

    void supabase.auth.getSession().then(({ data }) => enter(data.session?.access_token ?? null));
    setCuentas(leerCuentas());
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      accessToken = session?.access_token ?? null;
      if (event === "SIGNED_OUT") setUserState(null);
      const authUser = session?.user;
      if (session && authUser?.email) {
        // Recuerda la cuenta (y sus tokens, que se renuevan solos) para poder cambiar de usuario.
        const metaName = authUser.user_metadata?.full_name;
        setCuentas(
          guardarCuenta({
            id: authUser.id,
            name:
              typeof metaName === "string" && metaName.trim()
                ? metaName.trim()
                : authUser.email.split("@")[0],
            email: authUser.email,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          }),
        );
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function setUser(next: User | null) {
    if (next === null) {
      // Cierra solo esta sesión (scope local) y deja las demás cuentas recordadas intactas.
      if (user) setCuentas(quitarCuenta(user.id));
      void supabaseBrowser().auth.signOut({ scope: "local" });
      accessToken = null;
    }
    setAdding(false);
    setUserState(next);
  }

  /** Cambia a otra cuenta recordada sin pedir la contraseña. */
  async function switchAccount(id: string) {
    const cuenta = leerCuentas().find((c) => c.id === id);
    if (!cuenta) return;
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.setSession({
      access_token: cuenta.accessToken,
      refresh_token: cuenta.refreshToken,
    });
    if (error || !data.session) {
      // La sesión de esa cuenta caducó o fue revocada: hay que iniciar sesión de nuevo.
      setCuentas(quitarCuenta(id));
      setStatus(`La sesión de ${cuenta.email} caducó. Inicia sesión de nuevo con esa cuenta.`);
      setAdding(true);
      return;
    }
    accessToken = data.session.access_token;
    try {
      const { user: next } = await api<{ user: User }>("/api/me");
      setAdding(false);
      setUserState(next);
    } catch (error) {
      setStatus(message(error));
      setAdding(true);
    }
  }

  /** Registro o inicio de sesión con correo. Devuelve el mensaje a mostrar ("" si todo salió bien). */
  async function credentials(
    mode: "login" | "register",
    data: { name: string; email: string; password: string },
  ) {
    const supabase = supabaseBrowser();
    const result =
      mode === "register"
        ? await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: { data: { full_name: data.name } },
          })
        : await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (result.error) return friendlyAuthError(result.error);

    const session = result.data.session;
    if (!session) {
      // Con "Confirm email" activado, Supabase no abre sesión hasta confirmar el correo.
      return "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.";
    }
    accessToken = session.access_token;
    try {
      const { user } = await api<{ user: User }>("/api/me");
      setAdding(false);
      setUserState(user);
      return "";
    } catch (error) {
      return message(error);
    }
  }

  return user && !adding ? (
    <SignedIn
      key={user.id}
      user={user}
      setUser={setUser}
      accounts={{
        list: cuentas.some((c) => c.id === user.id)
          ? cuentas
          : [
              ...cuentas,
              {
                id: user.id,
                name: user.name,
                email: user.email,
                accessToken: "",
                refreshToken: "",
              },
            ],
        onSwitch: switchAccount,
        onAdd: () => setAdding(true),
      }}
    />
  ) : (
    <Auth
      status={status}
      onCredentials={credentials}
      onCancel={user ? () => setAdding(false) : undefined}
    />
  );
}
