import { useState, type ReactNode } from "react";

type View = "auth" | "home" | "generated" | "saved" | "upload" | "calendar";

type User = {
  name: string;
  email: string;
  role: "Estudiante" | "Administrador";
};

const demoUsers: User[] = [
  { name: "Laura Gómez", email: "laura.gomez@javeriana.edu.co", role: "Estudiante" },
  { name: "Mateo Rodríguez", email: "mateo.rodriguez@javeriana.edu.co", role: "Estudiante" },
  { name: "Sofía Martínez", email: "sofia.martinez@javeriana.edu.co", role: "Estudiante" },
  { name: "Daniel Torres", email: "daniel.torres@javeriana.edu.co", role: "Estudiante" },
  { name: "Carlos Méndez", email: "admin.horarios@javeriana.edu.co", role: "Administrador" },
];

const schedules = [
  { name: "Horario 1", credits: 16, omitted: [], saved: false },
  { name: "Horario 2", credits: 15, omitted: ["Bases de datos"], saved: true },
  {
    name: "Horario 3",
    credits: 13,
    omitted: ["Bases de datos", "Constitución y derecho civil"],
    saved: false,
  },
];

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
    | "arrow";
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
  active = false,
  onClick,
}: {
  children: ReactNode;
  icon?: Parameters<typeof Icon>[0]["name"];
  primary?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`button ${primary ? "button-primary" : ""} ${active ? "button-saved" : ""}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

function Header({
  view,
  setView,
  user,
  setUser,
}: {
  view: View;
  setView: (view: View) => void;
  user: User;
  setUser: (user: User) => void;
}) {
  return (
    <header className="header">
      <div className="header-inner">
        <button className="brand" onClick={() => setView("home")} aria-label="Ir al inicio">
          <span className="brand-mark">H</span>
          <span>
            <strong>Mis horarios</strong>
            <small>Periodo 2026-30</small>
          </span>
        </button>
        <nav className="nav">
          <button className={view === "home" ? "nav-active" : ""} onClick={() => setView("home")}>
            Inicio
          </button>
          <button
            className={view === "generated" ? "nav-active" : ""}
            onClick={() => setView("generated")}
          >
            Horarios
          </button>
          <button className={view === "saved" ? "nav-active" : ""} onClick={() => setView("saved")}>
            Guardados
          </button>
          <button
            className={view === "upload" ? "nav-active" : ""}
            onClick={() => setView("upload")}
          >
            Subir JSON
          </button>
        </nav>
        <div className="account">
          <details className="account-switcher">
            <summary aria-label="Cambiar usuario">
              <span className="avatar">
                <Icon name="user" />
              </span>
              <span className="account-copy">
                <strong>{user.name}</strong>
                <small>{user.role}</small>
              </span>
              <span className="switch-chevron" />
            </summary>
            <div className="account-menu">
              <div className="account-menu-heading">
                <strong>Cambiar usuario</strong>
                <small>
                  {demoUsers.filter((profile) => profile.role === "Estudiante").length} estudiantes
                  disponibles
                </small>
              </div>
              <div className="account-options">
                {demoUsers.map((profile) => (
                  <button
                    className={profile.email === user.email ? "selected" : ""}
                    type="button"
                    key={profile.email}
                    onClick={(event) => {
                      setUser(profile);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <span
                      className={`menu-avatar ${profile.role === "Administrador" ? "admin" : ""}`}
                    >
                      {profile.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <span>
                      <strong>{profile.name}</strong>
                      <small>{profile.email}</small>
                    </span>
                    {profile.email === user.email && <Icon name="check" size={17} />}
                  </button>
                ))}
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

function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");

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
            onLogin(demoUsers[0]);
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
          {mode === "login" && (
            <>
              <div className="quick-label">
                <span>Acceso rápido</span>
                <small>Selecciona un perfil de demostración</small>
              </div>
              <div className="quick-users">
                {demoUsers.map((user) => (
                  <button
                    className="quick-user"
                    type="button"
                    key={user.email}
                    onClick={() => onLogin(user)}
                  >
                    <span
                      className={`quick-avatar ${user.role === "Administrador" ? "admin" : ""}`}
                    >
                      {user.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <span className="quick-user-copy">
                      <strong>{user.name}</strong>
                      <small>{user.role}</small>
                    </span>
                    <span className="quick-enter">Entrar</span>
                  </button>
                ))}
              </div>
              <div className="auth-divider">
                <span>o continúa con tu correo</span>
              </div>
            </>
          )}
          {mode === "register" && (
            <label className="field">
              <span>Nombre completo</span>
              <input type="text" placeholder="Tu nombre" required />
            </label>
          )}
          <label className="field">
            <span>Correo electrónico</span>
            <input type="email" placeholder="correo@ejemplo.com" required />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input type="password" placeholder="••••••••" required />
          </label>
          {mode === "register" && (
            <label className="field">
              <span>Confirmar contraseña</span>
              <input type="password" placeholder="••••••••" required />
            </label>
          )}
          <button className="auth-submit" type="submit">
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Home({ setView, user }: { setView: (view: View) => void; user: User }) {
  const options = [
    {
      title: "Subir archivo",
      description: "Carga un JSON para generar nuevas opciones de horario.",
      icon: "upload" as const,
      action: () => setView("upload"),
    },
    {
      title: "Horarios generados",
      description: "Revisa los horarios válidos encontrados por el algoritmo.",
      icon: "calendar" as const,
      action: () => setView("generated"),
    },
    {
      title: "Horarios guardados",
      description: "Consulta los horarios que decidiste conservar.",
      icon: "bookmark" as const,
      action: () => setView("saved"),
    },
  ];

  return (
    <section className="home">
      <div className="home-heading">
        <span>Panel principal</span>
        <h1>Hola, {user.name.split(" ")[0]}</h1>
        <p>¿Qué quieres hacer hoy?</p>
      </div>
      <div className="home-options">
        {options.map((option) => (
          <button className="home-card" onClick={option.action} key={option.title}>
            <span className="home-card-icon">
              <Icon name={option.icon} size={25} />
            </span>
            <span>
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </span>
            <span className="home-arrow">Ir</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Generated({ setView }: { setView: (view: View) => void }) {
  const [saved, setSaved] = useState(schedules.map((item) => item.saved));
  return (
    <>
      <div className="page-heading">
        <h1>Horarios generados</h1>
        <p>Todos los horarios válidos que encontró el algoritmo para tu archivo.</p>
      </div>
      <section className="summary-card">
        <div className="metric">
          <span>Nivel alcanzado</span>
          <strong>3</strong>
        </div>
        <div className="metric">
          <span>Horarios válidos</span>
          <strong>3</strong>
        </div>
        <div className="criteria">
          <span>Criterios no cumplidos</span>
          <div>
            <em>Preferencia de profesor</em>
            <em>Tiempos libres</em>
          </div>
        </div>
      </section>
      <div className="schedule-list">
        {schedules.map((schedule, index) => (
          <article className="schedule-card" key={schedule.name}>
            <div className="schedule-top">
              <h2>{schedule.name}</h2>
              <span className="credit-pill">{schedule.credits} créditos totales</span>
            </div>
            <div className="omitted">
              <strong>Materias omitidas:</strong>
              {schedule.omitted.length ? (
                schedule.omitted.map((item) => <span key={item}>{item}</span>)
              ) : (
                <span className="plain">Ninguna</span>
              )}
            </div>
            <div className="actions">
              <Button primary icon="calendar" onClick={() => setView("calendar")}>
                Ver calendario
              </Button>
              <Button
                icon={saved[index] ? "check" : "bookmark"}
                active={saved[index]}
                onClick={() =>
                  setSaved((current) => current.map((value, i) => (i === index ? !value : value)))
                }
              >
                {saved[index] ? "Guardado" : "Guardar"}
              </Button>
              <Button icon="download">JSON</Button>
              <Button icon="download">TXT</Button>
            </div>
          </article>
        ))}
      </div>
      <p className="footnote">Datos de ejemplo para el mockup.</p>
    </>
  );
}

function Saved({ setView }: { setView: (view: View) => void }) {
  const items = ["20 de octubre de 2026", "14 de octubre de 2026", "2 de octubre de 2026"];
  return (
    <>
      <div className="title-row">
        <div className="page-heading">
          <h1>Mis horarios guardados</h1>
          <p>Los horarios que decidiste guardar, con su fecha y el nivel alcanzado.</p>
        </div>
        <Button primary icon="upload" onClick={() => setView("upload")}>
          Subir JSON
        </Button>
      </div>
      <div className="saved-list">
        {items.map((date, index) => (
          <article className="saved-card" key={date}>
            <div>
              <h2>Guardado el {date}</h2>
              <span className="level-pill">Nivel alcanzado: {3 - index}</span>
            </div>
            <div className="actions">
              <Button primary icon="calendar" onClick={() => setView("calendar")}>
                Abrir calendario
              </Button>
              <Button icon="download">JSON</Button>
              <Button icon="download">TXT</Button>
            </div>
          </article>
        ))}
      </div>
      <p className="footnote">Datos de ejemplo para el mockup.</p>
    </>
  );
}

function Upload({ setView }: { setView: (view: View) => void }) {
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
          <strong>horario_estudiante.json</strong>
          <small>Archivo seleccionado</small>
        </div>
        <Button>Elegir otro archivo</Button>
      </section>
      <section className="success-card">
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
      <div className="upload-actions">
        <Button onClick={() => setView("generated")}>Cancelar</Button>
        <Button primary icon="play" onClick={() => setView("generated")}>
          Ejecutar algoritmo
        </Button>
      </div>
    </>
  );
}

const classes = [
  { day: 1, row: 1, color: "blue", title: "Análisis de algoritmos" },
  { day: 3, row: 1, color: "blue", title: "Análisis de algoritmos" },
  { day: 2, row: 3, color: "green", title: "Probabilidad y estadística" },
  { day: 4, row: 3, color: "green", title: "Probabilidad y estadística" },
  { day: 5, row: 7, color: "yellow", title: "Ingeniería de software" },
  { day: 6, row: 1, color: "purple", title: "Desarrollo móvil" },
];

function Calendar({ setView }: { setView: (view: View) => void }) {
  const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const times = [
    "7:00 am",
    "8:00 am",
    "9:00 am",
    "10:00 am",
    "11:00 am",
    "12:00 pm",
    "1:00 pm",
    "2:00 pm",
    "3:00 pm",
    "4:00 pm",
  ];
  return (
    <>
      <button className="back" onClick={() => setView("generated")}>
        <Icon name="arrow" />
        Volver a la lista
      </button>
      <div className="calendar-title">
        <div>
          <h1>Horario 1</h1>
          <p>16 créditos totales · Nivel alcanzado: 3</p>
        </div>
        <div className="actions">
          <Button icon="download">Descargar JSON</Button>
          <Button icon="download">Descargar TXT</Button>
        </div>
      </div>
      <div className="calendar-wrap">
        <div className="calendar-grid">
          <div className="calendar-head time-head">Hora</div>
          {days.map((day) => (
            <div className="calendar-head" key={day}>
              {day}
            </div>
          ))}
          <div className="time-column">
            {times.map((time) => (
              <span key={time}>{time}</span>
            ))}
          </div>
          {days.map((day, dayIndex) => (
            <div className="day-column" key={day + dayIndex} />
          ))}
          {classes.map((item, index) => (
            <div
              className={`class-block ${item.color}`}
              style={{ gridColumn: item.day + 1, gridRow: `${item.row + 2} / span 2` }}
              key={index}
            >
              <strong>{item.title}</strong>
              <span>Grupo 01</span>
              <span>Prof. Apellido</span>
            </div>
          ))}
        </div>
      </div>
      <p className="footnote">Datos de ejemplo para el mockup.</p>
    </>
  );
}

export default function App() {
  const [view, setView] = useState<View>("auth");
  const [user, setUser] = useState<User>(demoUsers[0]);

  if (view === "auth") {
    return (
      <Auth
        onLogin={(selectedUser) => {
          setUser(selectedUser);
          setView("home");
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header view={view} setView={setView} user={user} setUser={setUser} />
      <main className={`main ${view === "calendar" ? "calendar-page" : ""}`}>
        {view === "home" && <Home setView={setView} user={user} />}
        {view === "generated" && <Generated setView={setView} />}
        {view === "saved" && <Saved setView={setView} />}
        {view === "upload" && <Upload setView={setView} />}
        {view === "calendar" && <Calendar setView={setView} />}
      </main>
    </div>
  );
}
