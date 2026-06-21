import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { ButtonLink, Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";

export function PublicMissingLink({
  title,
  message,
  action = "Join the live room",
  href = `/join/${DEFAULT_EVENT_SLUG}`
}: {
  title: string;
  message: string;
  action?: string;
  href?: string;
}) {
  return (
    <Shell flush>
      <PublicTopBar eventCode="VOTA.WTF" />
      <Container className="grid min-h-[calc(100dvh-58px)] place-items-center px-3 py-4">
        <Card className="w-full max-w-lg border-ink p-5 text-center">
          <Kicker>Link unavailable</Kicker>
          <h1 className="font-expanded mt-3 text-3xl font-black">{title}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-5 text-muted">{message}</p>
          <ButtonLink href={href} className="mt-5 w-full sm:w-auto">
            {action}
          </ButtonLink>
        </Card>
      </Container>
    </Shell>
  );
}
