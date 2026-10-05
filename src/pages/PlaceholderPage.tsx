import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Temporary shared screen for every feature route until its phase builds it.
export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{title}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Yeh screen Phase {phase} mein banegi</p>
      </CardContent>
    </Card>
  );
}
