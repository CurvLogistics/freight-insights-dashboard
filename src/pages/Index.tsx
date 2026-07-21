import { DataProvider, useData } from '@/context/DataContext';
import AppLayout from '@/components/AppLayout';
import DashboardView from '@/pages/DashboardView';
import ServiceView from '@/pages/ServiceView';
import LanesView from '@/pages/LanesView';
import ProductivityView from '@/pages/ProductivityView';
import ExceptionsView from '@/pages/ExceptionsView';
import CustomerScorecardView from '@/pages/CustomerScorecardView';
import CarrierScorecardView from '@/pages/CarrierScorecardView';
import InsightsView from '@/pages/InsightsView';
import SettingsView from '@/pages/SettingsView';

function ViewRouter() {
  const { currentView } = useData();
  switch (currentView) {
    case 'dashboard': return <DashboardView />;
    case 'service': return <ServiceView />;
    case 'lanes': return <LanesView />;
    case 'productivity': return <ProductivityView />;
    case 'exceptions': return <ExceptionsView />;
    case 'customer-scorecard': return <CustomerScorecardView />;
    case 'carrier-scorecard': return <CarrierScorecardView />;
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
