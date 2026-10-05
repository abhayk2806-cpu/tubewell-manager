import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function NotFoundPage() {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Yeh page nahi mila</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
          Dashboard par wapas jao
        </Link>
      </CardContent>
    </Card>
  );
}
