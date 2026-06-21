import { BrandMark, Card, Container, Field, Kicker, Shell, SubmitButton, TextInput } from "@/components/ui";
import { safeAdminNextPath } from "@/lib/safe-paths";
import { firstSearchParam } from "@/lib/search-params";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const params = await searchParams;
  const next = firstSearchParam(params.next);
  const error = firstSearchParam(params.error);
  return (
    <Shell className="grid place-items-center bg-admin">
      <Container className="max-w-md">
        <Card className="border-ink">
          <div className="flex items-center gap-3">
            <BrandMark />
            <Kicker>Organizer control room</Kicker>
          </div>
          <h1 className="font-expanded mt-4 text-3xl font-black">Admin login</h1>
          {error ? (
            <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
              {error}
            </p>
          ) : null}
          <form action="/api/admin/login" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={safeAdminNextPath(next)} />
            <Field label="Weekend password">
              <TextInput type="password" name="password" autoComplete="current-password" required />
            </Field>
            <SubmitButton>Open admin</SubmitButton>
          </form>
        </Card>
      </Container>
    </Shell>
  );
}
