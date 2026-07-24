import { EmptyState } from '@/components/ui/empty-state';
import { PageContainer } from '@/components/ui/page-container';

/**
 * Native stub. The full analytics dashboard is a web-only surface
 * (`analytics.web.tsx`); the mobile field tool stays lean, so on a phone this
 * route just points people to the web app. Metro serves the `.web.tsx` variant
 * on web.
 */
export default function AnalyticsScreen() {
  return (
    <PageContainer>
      <EmptyState
        iconName="chart.bar.xaxis"
        title="Analytics on the web"
        message="The full analytics dashboard — revenue trends, materials, throughput and top clients — lives in the web admin app."
      />
    </PageContainer>
  );
}
