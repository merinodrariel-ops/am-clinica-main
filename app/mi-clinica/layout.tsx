// Layout limpio sin sidebar para el portal del paciente
// El root layout ya tiene Providers (Auth, Theme, Toaster)
// Sidebar no renderiza porque el usuario-paciente no tiene sesión de staff

export default function MiClinicaLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
