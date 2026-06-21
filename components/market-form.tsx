import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Field, Select, SubmitButton, TextArea, TextInput } from "@/components/ui";
import { BLIND_LAUNCH_PREDICTIONS, BLIND_LAUNCH_SECONDS, DEFAULT_EVENT_SLUG } from "@/lib/constants";
import type { Market, Outcome } from "@/lib/types";

export function MarketForm({ market, outcomes, eventSlug = DEFAULT_EVENT_SLUG }: { market?: Market; outcomes?: Outcome[]; eventSlug?: string }) {
  const rows = Array.from({ length: 8 }, (_, index) => outcomes?.[index]);
  const outcomesLocked = Boolean(market && market.status !== "draft");
  return (
    <form action={market ? `/api/admin/markets/${market.id}` : "/api/admin/markets"} method="post" encType="multipart/form-data" className="grid gap-4">
      <input type="hidden" name="eventSlug" value={eventSlug} />
      {market ? <input type="hidden" name="updatedAt" value={market.updatedAt} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title">
          <TextInput name="title" defaultValue={market?.title} required />
        </Field>
        <Field label="Category">
          <TextInput name="category" defaultValue={market?.category || "Finals"} required />
        </Field>
      </div>
      <Field label="Description">
        <TextArea name="description" defaultValue={market?.description} required />
      </Field>
      <Field label="Hero image URL">
        <TextInput name="imageUrl" defaultValue={market?.imageUrl} placeholder="/stage-gradient.svg" />
      </Field>
      <Field label="Upload hero image">
        <input className="focus-ring rounded-xl border-[1.5px] border-dashed border-line bg-paper p-3 text-sm font-semibold" name="imageFile" type="file" accept="image/webp,image/png,image/jpeg" />
      </Field>
      <Field label="Resolution rule">
        <TextArea name="resolutionRule" defaultValue={market?.resolutionRule} required />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Max action MegaBucks">
          <TextInput name="maxActionStake" type="number" min="100" defaultValue={market?.maxActionStake || 250} />
        </Field>
        <Field label="Fair launch people">
          <TextInput name="fairLaunchPeopleThreshold" type="number" min="1" defaultValue={market?.fairLaunchPeopleThreshold || 25} />
        </Field>
        <Field label="Fair launch signal MegaBucks">
          <TextInput
            name="fairLaunchSignalCreditsThreshold"
            type="number"
            min="100"
            defaultValue={market?.fairLaunchSignalCreditsThreshold || 5000}
          />
        </Field>
        <Field label="Blind unlock people">
          <TextInput
            name="blindLaunchPredictionThreshold"
            type="number"
            min="1"
            defaultValue={market?.blindLaunchPredictionThreshold || BLIND_LAUNCH_PREDICTIONS}
          />
        </Field>
        <Field label="Blind unlock seconds">
          <TextInput name="blindLaunchSeconds" type="number" min="10" defaultValue={market?.blindLaunchSeconds || BLIND_LAUNCH_SECONDS} />
        </Field>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm font-bold">
          <input name="allowSwitching" type="checkbox" defaultChecked={market?.allowSwitching ?? true} />
          Allow switching before lock
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm font-bold">
          <input name="blindLaunchEnabled" type="checkbox" defaultChecked={market?.blindLaunchEnabled ?? true} />
          Blind launch enabled
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm font-bold">
          <input name="showOnStage" type="checkbox" defaultChecked={market?.showOnStage ?? true} />
          Show on stage
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm font-bold">
          <input name="fairLaunchOverride" type="checkbox" defaultChecked={market?.fairLaunchOverride || false} />
          End fair launch manually
        </label>
        {market ? (
          <label className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm font-bold">
            <input name="endBlindLaunch" type="checkbox" defaultChecked={Boolean(market.blindLaunchEndedAt)} />
            End blind launch manually
          </label>
        ) : null}
      </div>
      <section className="grid gap-3">
        <h2 className="font-expanded text-xl font-black">Outcomes</h2>
        {outcomesLocked ? (
          <p className="rounded-xl bg-paper p-3 text-sm font-bold text-muted">
            Outcome labels and images are locked after a market opens. Create a new draft if the choices need to change.
          </p>
        ) : null}
        {rows.map((outcome, index) => (
          <div key={index} className="grid gap-3 rounded-xl border border-line bg-white p-3 md:grid-cols-[1fr_1fr_100px]">
            <input type="hidden" name={`outcome_${index + 1}_id`} defaultValue={outcome?.id} />
            <TextInput
              name={`outcome_${index + 1}_label`}
              placeholder={`Outcome ${index + 1}`}
              defaultValue={outcome?.label}
              disabled={outcomesLocked}
            />
            <TextInput
              name={`outcome_${index + 1}_imageUrl`}
              placeholder="Image URL"
              defaultValue={outcome?.imageUrl}
              disabled={outcomesLocked}
            />
            <TextInput name={`outcome_${index + 1}_icon`} placeholder="Icon" defaultValue={outcome?.icon} disabled={outcomesLocked} />
            <input
              className="focus-ring rounded-xl border-[1.5px] border-dashed border-line bg-paper p-2 text-xs font-semibold disabled:opacity-50 md:col-span-3"
              name={`outcome_${index + 1}_imageFile`}
              type="file"
              accept="image/webp,image/png,image/jpeg"
              disabled={outcomesLocked}
            />
          </div>
        ))}
      </section>
      <SubmitButton>{market ? "Save market" : "Save draft"}</SubmitButton>
    </form>
  );
}

export function ResolveForm({ market, outcomes }: { market: Market; outcomes: Outcome[] }) {
  return (
    <form action={`/api/admin/markets/${market.id}/resolve`} method="post" className="grid gap-3 rounded-xl bg-paper p-4">
      <Field label="Winning outcome">
        <Select name="outcomeId" defaultValue={market.resolvedOutcomeId || ""} required>
          <option value="">Choose the official winner...</option>
          {outcomes.map((outcome) => (
            <option key={outcome.id} value={outcome.id}>
              {outcome.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Type the winning outcome label">
        <TextInput name="confirmOutcomeLabel" placeholder="Exact outcome label" required />
      </Field>
      <Field label="Resolution note">
        <TextArea name="note" defaultValue={market.resolutionNote || "Resolved by organizer/admin."} />
      </Field>
      <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-sm font-bold">
        <input name="confirmResolution" type="checkbox" required />
        <span>
          I confirm this is the official result and this action will score all matching predictions.
        </span>
      </label>
      <ConfirmSubmitButton message="Resolve this market and score all matching predictions now?">Resolve and score</ConfirmSubmitButton>
    </form>
  );
}
