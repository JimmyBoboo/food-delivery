"use client";

import { useEffect, useRef, useState } from "react";

import { CheckboxField, Field, inputClass } from "@/components/admin/form-fields";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import type { listOpeningHours } from "@/server/services/admin";

type OpeningHoursData = Awaited<ReturnType<typeof listOpeningHours>>;
type DayDraft = OpeningHoursData["days"][number];
type SpecialDay = OpeningHoursData["specialDays"][number];

/** Mandag forst i skjemaet, selv om databasen bruker 0 = sondag. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const DAY_NAMES: Record<number, string> = {
  0: "Sondag",
  1: "Mandag",
  2: "Tirsdag",
  3: "Onsdag",
  4: "Torsdag",
  5: "Fredag",
  6: "Lordag",
};

const timeInputClass =
  "rounded-lg border border-fairway-200 bg-white px-2 py-1.5 text-sm text-fairway-900";

/** Trekk ut HH:MM fra «08:00», «08:00:00» eller «08:00:00.000». */
function normalizeTime(value: string): string {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)/);
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function validateDays(days: DayDraft[]): string | null {
  for (const day of days) {
    if (day.isClosed) continue;
    const name = DAY_NAMES[day.dayOfWeek];
    const orderingOpens = normalizeTime(day.orderingOpensAt);
    const orderingCloses = normalizeTime(day.orderingClosesAt);
    const deliveryOpens = normalizeTime(day.deliveryOpensAt);
    const deliveryCloses = normalizeTime(day.deliveryClosesAt);

    if (!/^\d{2}:\d{2}$/.test(orderingOpens) || !/^\d{2}:\d{2}$/.test(orderingCloses)) {
      return `${name}: fyll inn gyldige bestillingstider.`;
    }
    if (!/^\d{2}:\d{2}$/.test(deliveryOpens) || !/^\d{2}:\d{2}$/.test(deliveryCloses)) {
      return `${name}: fyll inn gyldige leveringstider.`;
    }
    if (orderingOpens >= orderingCloses) {
      return `${name}: bestilling ma apne for den stenger (du har ${orderingOpens}–${orderingCloses}). Apningstid ma vaere tidligere enn stengetid, for eksempel 08:00–23:59.`;
    }
    if (deliveryOpens >= deliveryCloses) {
      return `${name}: levering ma apne for den stenger (du har ${deliveryOpens}–${deliveryCloses}).`;
    }
  }
  return null;
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function OpeningHoursEditor({
  initial,
  canManage,
}: {
  initial: OpeningHoursData;
  canManage: boolean;
}) {
  const [days, setDays] = useState<DayDraft[]>(() =>
    DAY_ORDER.map((dayOfWeek) => {
      const day = initial.days.find((candidate) => candidate.dayOfWeek === dayOfWeek);
      if (!day) {
        throw new Error(`Mangler apningstid for ukedag ${dayOfWeek}.`);
      }
      return day;
    }),
  );
  const [specialDays, setSpecialDays] = useState(initial.specialDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  // Feilmeldingen star ved lagre-knappen nederst. Uten scroll ser man den ikke
  // etter a ha scrollet forbi sju ukedager.
  useEffect(() => {
    if ((error || saved) && feedbackRef.current) {
      feedbackRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error, saved]);

  function updateDay(dayOfWeek: number, patch: Partial<DayDraft>) {
    setDays((current) =>
      current.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)),
    );
    setSaved(false);
  }

  async function saveWeek() {
    const localError = validateDays(days);
    if (localError) {
      setError(localError);
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    const payload = {
      days: days.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        isClosed: day.isClosed,
        orderingOpensAt: normalizeTime(day.orderingOpensAt),
        orderingClosesAt: normalizeTime(day.orderingClosesAt),
        deliveryOpensAt: normalizeTime(day.deliveryOpensAt),
        deliveryClosesAt: normalizeTime(day.deliveryClosesAt),
      })),
    };

    try {
      const result = await apiPatch<OpeningHoursData>("/api/admin/opening-hours", payload);
      setDays(
        DAY_ORDER.map((dayOfWeek) => {
          const day = result.days.find((candidate) => candidate.dayOfWeek === dayOfWeek);
          if (!day) throw new Error(`Mangler apningstid for ukedag ${dayOfWeek}.`);
          return day;
        }),
      );
      setSpecialDays(result.specialDays);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre apningstidene.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-bold text-fairway-900">Apningstider</h2>
        <p className="mt-1 text-sm text-fairway-700">
          Bestilling og levering styres hver for seg. Kundene kan ikke bestille utenfor
          bestillingstidene, og levering pa banen stanser nar leveringen stenger.
        </p>
        <p className="mt-1 text-xs text-fairway-600">Tidssone: {initial.timezone}</p>
      </div>

      <div className="space-y-3">
        {days.map((day) => (
          <DayRow
            key={day.dayOfWeek}
            day={day}
            disabled={!canManage || saving}
            onChange={(patch) => updateDay(day.dayOfWeek, patch)}
          />
        ))}
      </div>

      <div ref={feedbackRef} className="space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">Apningstidene er lagret.</Alert> : null}

        {canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={saving} onClick={() => void saveWeek()}>
              {saving ? <Spinner /> : null}
              Lagre apningstider
            </Button>
            <p className="text-xs text-fairway-600">
              Endringene gjelder fra og med lagringen. Spesialdager under overstyrer uketabellen.
            </p>
          </div>
        ) : (
          <p className="text-sm text-fairway-600">
            Bare administrator og manager kan endre apningstidene.
          </p>
        )}
      </div>

      <SpecialDaysSection
        specialDays={specialDays}
        canManage={canManage}
        today={initial.today}
        onChanged={(next) => {
          setSpecialDays(next);
          setSaved(false);
        }}
        onError={setError}
      />
    </Card>
  );
}

function DayRow({
  day,
  disabled,
  onChange,
}: {
  day: DayDraft;
  disabled: boolean;
  onChange: (patch: Partial<DayDraft>) => void;
}) {
  return (
    <div
      className={
        day.isClosed
          ? "rounded-xl border border-fairway-100 bg-fairway-50/60 p-3"
          : "rounded-xl border border-fairway-100 bg-white p-3"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-fairway-900">{DAY_NAMES[day.dayOfWeek]}</p>
        <label className="flex items-center gap-2 text-sm text-fairway-700">
          <input
            type="checkbox"
            checked={day.isClosed}
            disabled={disabled}
            onChange={(event) => onChange({ isClosed: event.target.checked })}
            className="size-4 accent-fairway-600"
          />
          Stengt
        </label>
      </div>

      {day.isClosed ? (
        <p className="mt-2 text-sm text-fairway-600">Ingen bestilling denne dagen.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TimePair
            label="Bestilling"
            opens={day.orderingOpensAt}
            closes={day.orderingClosesAt}
            disabled={disabled}
            onOpens={(value) => onChange({ orderingOpensAt: value })}
            onCloses={(value) => onChange({ orderingClosesAt: value })}
          />
          <TimePair
            label="Levering pa banen"
            opens={day.deliveryOpensAt}
            closes={day.deliveryClosesAt}
            disabled={disabled}
            onOpens={(value) => onChange({ deliveryOpensAt: value })}
            onCloses={(value) => onChange({ deliveryClosesAt: value })}
          />
        </div>
      )}
    </div>
  );
}

function TimePair({
  label,
  opens,
  closes,
  disabled,
  onOpens,
  onCloses,
}: {
  label: string;
  opens: string;
  closes: string;
  disabled: boolean;
  onOpens: (value: string) => void;
  onCloses: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-fairway-600 uppercase">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="time"
          step={60}
          value={normalizeTime(opens)}
          disabled={disabled}
          onChange={(event) => onOpens(normalizeTime(event.target.value))}
          className={timeInputClass}
          aria-label={`${label} apner`}
        />
        <span className="text-sm text-fairway-600">–</span>
        <input
          type="time"
          step={60}
          value={normalizeTime(closes)}
          disabled={disabled}
          onChange={(event) => onCloses(normalizeTime(event.target.value))}
          className={timeInputClass}
          aria-label={`${label} stenger`}
        />
      </div>
    </div>
  );
}

function SpecialDaysSection({
  specialDays,
  canManage,
  today,
  onChanged,
  onError,
}: {
  specialDays: SpecialDay[];
  canManage: boolean;
  today: string;
  onChanged: (days: SpecialDay[]) => void;
  onError: (message: string | null) => void;
}) {
  const [date, setDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [opensAt, setOpensAt] = useState("08:00");
  const [closesAt, setClosesAt] = useState("20:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);

  async function addSpecialDay(event: React.FormEvent) {
    event.preventDefault();
    if (!date) {
      onError("Velg hvilken dato avviket gjelder.");
      return;
    }

    setBusy(true);
    onError(null);

    try {
      const result = await apiPost<OpeningHoursData>("/api/admin/opening-hours/special", {
        date,
        isClosed,
        orderingOpensAt: isClosed ? null : opensAt,
        orderingClosesAt: isClosed ? null : closesAt,
        reason: reason.trim() || null,
      });
      onChanged(result.specialDays);
      setDate("");
      setReason("");
      setIsClosed(true);
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre spesialdagen.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSpecialDay(isoDate: string) {
    setBusyDate(isoDate);
    onError(null);

    try {
      const result = await apiDelete<OpeningHoursData>(
        `/api/admin/opening-hours/special/${isoDate}`,
      );
      onChanged(result.specialDays);
    } catch (deleteError) {
      onError(
        deleteError instanceof Error ? deleteError.message : "Kunne ikke slette spesialdagen.",
      );
    } finally {
      setBusyDate(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-fairway-100 pt-4">
      <div>
        <h3 className="font-semibold text-fairway-900">Spesialdager</h3>
        <p className="mt-0.5 text-sm text-fairway-700">
          Bruk dette til helligdager, turneringer eller dager med andre tider enn vanlig.
        </p>
      </div>

      {specialDays.length === 0 ? (
        <p className="text-sm text-fairway-600">Ingen spesialdager framover.</p>
      ) : (
        <ul className="space-y-2">
          {specialDays.map((day) => (
            <li
              key={day.date}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-fairway-100 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fairway-900">
                  {formatDisplayDate(day.date)}
                </p>
                <p className="text-xs text-fairway-600">
                  {day.isClosed
                    ? "Stengt"
                    : day.orderingOpensAt && day.orderingClosesAt
                      ? `Bestilling ${day.orderingOpensAt}–${day.orderingClosesAt}`
                      : "Eget avvik"}
                  {day.reason ? ` · ${day.reason}` : ""}
                </p>
              </div>
              {day.isClosed ? <Badge tone="warning">Stengt</Badge> : <Badge tone="info">Avvik</Badge>}
              {canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyDate === day.date}
                  onClick={() => void removeSpecialDay(day.date)}
                >
                  {busyDate === day.date ? <Spinner /> : null}
                  Fjern
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={addSpecialDay} className="space-y-3 rounded-xl bg-fairway-50/70 p-3">
          <p className="text-sm font-semibold text-fairway-900">Legg til spesialdag</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Dato">
              <input
                type="date"
                min={today}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Arsak" hint="Vises for ansatte. Valgfritt.">
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={200}
                placeholder="For eksempel: 17. mai"
                className={inputClass}
              />
            </Field>
          </div>

          <CheckboxField
            label="Stengt hele dagen"
            checked={isClosed}
            onChange={setIsClosed}
          />

          {!isClosed ? (
            <TimePair
              label="Bestilling denne dagen"
              opens={opensAt}
              closes={closesAt}
              disabled={busy}
              onOpens={setOpensAt}
              onCloses={setClosesAt}
            />
          ) : null}

          <Button type="submit" size="sm" disabled={busy || !date}>
            {busy ? <Spinner /> : null}
            Legg til
          </Button>
        </form>
      ) : null}
    </div>
  );
}
