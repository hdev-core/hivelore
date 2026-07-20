import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type PlaceholderPageProps = {
  children?: ReactNode;
  eyebrow: string;
  title: string;
};

export function PlaceholderPage({ children, eyebrow, title }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <section className="max-w-3xl">
        <Badge variant="proposal">Future feature area</Badge>
        <p className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-foreground">{title}</h1>
        <p className="prose-text mt-5">
          This route exists to verify navigation, responsive layout, and route-level states. It does
          not include production data or business behavior yet.
        </p>
      </section>
      {children ? (
        children
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Implementation pending</CardTitle>
            <CardDescription>
              Authentication, persistence, voting, canon workflows, and Hive integrations are out of
              scope for this foundation route.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Future screens can compose the shared shell, UI primitives, page states, and editor
              scaffold from here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
