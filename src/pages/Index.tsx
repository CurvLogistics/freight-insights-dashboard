import { useEffect } from 'react';
import { DataProvider, useData } from '@/context/DataContext';
import { useRole } from '@/auth/useRole';
import { PAGE_IDS } from '@/auth/permissions';
import AppLayout from '@/components/AppLayout';
import DashboardView from '@/pages/DashboardView';
import ServiceView from '@/pages/ServiceView';
import LanesView from '@/pages/LanesView';
import ProductivityView from '@/pages/ProductivityView';
import ExceptionsView from '@/pages/ExceptionsView';
import CustomerScorecardView from '@/pages/CustomerScorecardView';
import CarrierScorecardView from '@/pages/CarrierScorecardView';
import CashFlowView from '@/pages/CashFlowView';
import InsightsView from '@/pages/InsightsView';
import SettingsView from '@/pages/SettingsView';

function ViewRouter() {
  const { currentView, setCurrentView } = useData();
  const { can } = useRole();
  const allowed = can(`page.${currentView}`);
  const fallback = PAGE_IDS.find(id => can(`page.${id}`));

  // Landed on a page this role can't open: go to their first allowed page instead
  useEffect(() => {
    if (!allowed && fallback) setCurrentView(fallback);
  }, [allowed, fallback, setCurrentView]);

  if (!allowed) {
    return fallback ? null : (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Your role doesn't include any pages yet. Ask an admin to check your role.
      </div>
    );
  }

  switch (currentView) {
    case 'dashboard': return <DashboardView />;
    case 'service': return <ServiceView />;
    case 'lanes': return <LanesView />;
    case 'productivity': return <ProductivityView />;
    case 'exceptions': return <ExceptionsView />;
    case 'customer-scorecard': return <CustomerScorecardView />;
    case 'carrier-scorecard': return <CarrierScorecardView />;
    case 'cash-flow': return <CashFlowView />;
    case 'insights': return <InsightsView />;
    case 'settings': return <SettingsView />;
    default: return <DashboardView />;
  }
}

export default function Index() {
  return (
    <DataProvider>
      <AppLayout>
        <ViewRouter />
      </AppLayout>
    </DataProvider>
  );
}
