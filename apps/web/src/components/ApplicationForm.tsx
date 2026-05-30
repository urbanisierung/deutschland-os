import type { UserProfile } from "@deutschland-os/shared";
import type { JSX, TargetedInputEvent, TargetedSubmitEvent } from "preact";
import { type ManualListing, useAppStore } from "../store/appStore.js";

function Field(props: { label: string; children: JSX.Element }): JSX.Element {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the form control is provided by callers via children.
    <label class="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function ApplicationForm(): JSX.Element {
  const store = useAppStore();
  const { profile, manual, sourceMode, url, status, error, result, listingUsed } = store;

  const onText =
    <K extends keyof UserProfile>(key: K) =>
    (e: TargetedInputEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      store.setProfile(key, e.currentTarget.value as UserProfile[K]);

  const onNumber =
    (key: "householdSize" | "monthlyNetIncome") => (e: TargetedInputEvent<HTMLInputElement>) =>
      store.setProfile(key, Number(e.currentTarget.value));

  const onBool = (key: "hasChildren" | "hasPets") => (e: TargetedInputEvent<HTMLInputElement>) =>
    store.setProfile(key, e.currentTarget.checked);

  const onManual =
    (key: keyof ManualListing) => (e: TargetedInputEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      store.setManual(key, e.currentTarget.value);

  const submit = (e: TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    void store.submit();
  };

  const busy = status === "loading";

  return (
    <form class="card" onSubmit={submit}>
      <fieldset>
        <legend>Ihr Profil</legend>
        <Field label="Name">
          <input value={profile.fullName} onInput={onText("fullName")} required />
        </Field>
        <Field label="Beruf">
          <input value={profile.profession} onInput={onText("profession")} required />
        </Field>
        <Field label="Anstellung">
          <input value={profile.employmentStatus} onInput={onText("employmentStatus")} required />
        </Field>
        <Field label="Haushaltsgröße">
          <input
            type="number"
            min={1}
            value={profile.householdSize}
            onInput={onNumber("householdSize")}
          />
        </Field>
        <Field label="Netto-Haushaltseinkommen (EUR/Monat)">
          <input
            type="number"
            min={0}
            value={profile.monthlyNetIncome}
            onInput={onNumber("monthlyNetIncome")}
          />
        </Field>
        <Field label="Einzugsdatum">
          <input value={profile.moveInDate} onInput={onText("moveInDate")} required />
        </Field>
        <label class="checkbox">
          <input type="checkbox" checked={profile.hasChildren} onChange={onBool("hasChildren")} />{" "}
          Kinder
        </label>
        <label class="checkbox">
          <input type="checkbox" checked={profile.hasPets} onChange={onBool("hasPets")} /> Haustiere
        </label>
        <Field label="Notizen">
          <textarea rows={2} value={profile.additionalNotes} onInput={onText("additionalNotes")} />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Inserat</legend>
        <div class="toggle">
          <button
            type="button"
            class={sourceMode === "url" ? "active" : ""}
            onClick={() => store.setSourceMode("url")}
          >
            Aus URL laden
          </button>
          <button
            type="button"
            class={sourceMode === "manual" ? "active" : ""}
            onClick={() => store.setSourceMode("manual")}
          >
            Manuell eingeben
          </button>
        </div>

        {sourceMode === "url" ? (
          <Field label="Inserat-URL">
            <input
              type="url"
              placeholder="https://www.immobilienscout24.de/expose/..."
              value={url}
              onInput={(e) => store.setUrl(e.currentTarget.value)}
              required
            />
          </Field>
        ) : (
          <>
            <Field label="Titel">
              <input value={manual.title} onInput={onManual("title")} required />
            </Field>
            <Field label="Lage / Stadtteil">
              <input value={manual.district} onInput={onManual("district")} />
            </Field>
            <Field label="Kaltmiete (EUR)">
              <input value={manual.coldRent} onInput={onManual("coldRent")} />
            </Field>
            <Field label="Nebenkosten (EUR)">
              <input value={manual.additionalCosts} onInput={onManual("additionalCosts")} />
            </Field>
            <Field label="Fläche (m²)">
              <input value={manual.squareMeters} onInput={onManual("squareMeters")} />
            </Field>
            <Field label="Ausstattung (kommagetrennt)">
              <input value={manual.amenities} onInput={onManual("amenities")} />
            </Field>
            <Field label="Beschreibung">
              <textarea rows={4} value={manual.description} onInput={onManual("description")} />
            </Field>
          </>
        )}
      </fieldset>

      <button type="submit" class="primary" disabled={busy}>
        {busy ? "Generiere…" : "Bewerbung generieren"}
      </button>

      {status === "error" && <p class="error">⚠️ {error}</p>}

      {result && (
        <section class="result">
          <div class="meta">
            <span class={`badge ${result.shouldApply ? "go" : "stop"}`}>
              {result.shouldApply ? "✅ Bewerben" : "🚫 Nicht bewerben"}
            </span>
            <span class="badge">🎯 {result.confidenceScore}%</span>
          </div>
          {result.redFlagsDetected.length > 0 && (
            <p class="flags">⚠️ {result.redFlagsDetected.join(", ")}</p>
          )}
          {listingUsed && <p class="listing-title">{listingUsed.title}</p>}
          <h3>Betreff</h3>
          <p>{result.subjectLine}</p>
          <h3>Anschreiben</h3>
          <pre>{result.coverLetter}</pre>
        </section>
      )}
    </form>
  );
}
