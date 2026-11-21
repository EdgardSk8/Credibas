import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { SeoManager } from '../lib/seo';
import { PublicLayout } from '../components/layout/PublicLayout';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingBlock } from '../components/ui/EmptyState';
import { LandingPage } from '../modules/public/LandingPage';
import { FeaturesPage } from '../modules/public/FeaturesPage';
import { PricingPage } from '../modules/public/PricingPage';
import { ContactPage } from '../modules/public/ContactPage';
import { LegalPage } from '../modules/public/LegalPage';
import { LoginPage } from '../modules/auth/LoginPage';
import { RegisterPage } from '../modules/auth/RegisterPage';
import { ForgotPasswordPage } from '../modules/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../modules/auth/ResetPasswordPage';
import { VerifyEmailPage } from '../modules/auth/VerifyEmailPage';
import { InvitationPage } from '../modules/auth/InvitationPage';
import { OnboardingPage } from '../modules/auth/OnboardingPage';
import { NotFoundPage } from '../modules/public/NotFoundPage';

// Las páginas privadas se cargan bajo demanda para mantener liviano el sitio público.
const DashboardPage = lazy(() => import('../modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ClientsPage = lazy(() => import('../modules/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() =>
  import('../modules/clients/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })),
);
const LoansPage = lazy(() => import('../modules/loans/LoansPage').then((m) => ({ default: m.LoansPage })));
const LoanDetailPage = lazy(() => import('../modules/loans/LoanDetailPage').then((m) => ({ default: m.LoanDetailPage })));
const NewLoanPage = lazy(() => import('../modules/loans/NewLoanPage').then((m) => ({ default: m.NewLoanPage })));
const SimulatorPage = lazy(() => import('../modules/loans/SimulatorPage').then((m) => ({ default: m.SimulatorPage })));
const InstallmentsPage = lazy(() =>
  import('../modules/installments/InstallmentsPage').then((m) => ({ default: m.InstallmentsPage })),
);
const PaymentsPage = lazy(() => import('../modules/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const CollectionsPage = lazy(() =>
  import('../modules/collections/CollectionsPage').then((m) => ({ default: m.CollectionsPage })),
);
const CashPage = lazy(() => import('../modules/cash/CashPage').then((m) => ({ default: m.CashPage })));
const ReportsPage = lazy(() => import('../modules/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('../modules/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SubscriptionPage = lazy(() =>
  import('../modules/subscriptions/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })),
);
const AdminLayout = lazy(() => import('../modules/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminOverviewPage = lazy(() =>
  import('../modules/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })),
);
const AdminOrganizationsPage = lazy(() =>
  import('../modules/admin/AdminOrganizationsPage').then((m) => ({ default: m.AdminOrganizationsPage })),
);
const AdminPlansPage = lazy(() => import('../modules/admin/AdminPlansPage').then((m) => ({ default: m.AdminPlansPage })));

function FullPageLoader() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <LoadingBlock label="Verificando tu sesión…" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!me) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!me.onboardingComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function RequireOrganization({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (!me?.activeOrgId) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (!me?.user.isPlatformAdmin) return <NotFoundPage />;
  return <>{children}</>;
}

export function App() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '60dvh', display: 'grid', placeItems: 'center' }}>
          <LoadingBlock label="Cargando módulo…" />
        </div>
      }
    >
      <SeoManager />
      <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="funcionalidades" element={<FeaturesPage />} />
        <Route path="precios" element={<PricingPage />} />
        <Route path="contacto" element={<ContactPage />} />
        <Route path="terminos" element={<LegalPage kind="terms" />} />
        <Route path="privacidad" element={<LegalPage kind="privacy" />} />
      </Route>

      <Route path="login" element={<LoginPage />} />
      <Route path="registro" element={<RegisterPage />} />
      <Route path="recuperar-contrasena" element={<ForgotPasswordPage />} />
      <Route path="restablecer-contrasena" element={<ResetPasswordPage />} />
      <Route path="verificar-correo" element={<VerifyEmailPage />} />
      <Route path="invitacion" element={<InvitationPage />} />
      <Route
        path="onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />

      <Route
        path="app"
        element={
          <RequireAuth>
            <RequireOrganization>
              <AppLayout />
            </RequireOrganization>
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/:clientId" element={<ClientDetailPage />} />
        <Route path="prestamos" element={<LoansPage />} />
        <Route path="prestamos/nuevo" element={<NewLoanPage />} />
        <Route path="prestamos/:loanId" element={<LoanDetailPage />} />
        <Route path="simulador" element={<SimulatorPage />} />
        <Route path="cuotas" element={<InstallmentsPage />} />
        <Route path="pagos" element={<PaymentsPage />} />
        <Route path="cobros" element={<CollectionsPage />} />
        <Route path="caja" element={<CashPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route path="suscripcion" element={<SubscriptionPage />} />
      </Route>

      <Route
        path="admin"
        element={
          <RequireAuth>
            <RequirePlatformAdmin>
              <AdminLayout />
            </RequirePlatformAdmin>
          </RequireAuth>
        }
      >
        <Route index element={<AdminOverviewPage />} />
        <Route path="organizaciones" element={<AdminOrganizationsPage />} />
        <Route path="planes" element={<AdminPlansPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
