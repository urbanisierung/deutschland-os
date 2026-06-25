import type { JSX, TargetedInputEvent, TargetedSubmitEvent } from "preact";
import { type ServiceForm, useServiceStore } from "../store/serviceStore.js";

function Field(props: { label: string; children: JSX.Element }): JSX.Element {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the form control is provided by callers via children.
    <label class="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function ServiceFinderForm(): JSX.Element {
  const store = useServiceStore();
  const { form, providersText, status, error, result } = store;

  const onSelect =
    <K extends keyof ServiceForm>(key: K) =>
    (e: TargetedInputEvent<HTMLSelectElement>) =>
      store.setForm(key, e.currentTarget.value as ServiceForm[K]);

  const onText =
    <K extends keyof ServiceForm>(key: K) =>
    (e: TargetedInputEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      store.setForm(key, e.currentTarget.value as ServiceForm[K]);

  const submit = (e: TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    void store.submit();
  };

  const busy = status === "loading";

  return (
    <form class="card" onSubmit={submit}>
      <fieldset>
        <legend>Auftrag</legend>
        <Field label="Gewerk">
          <select value={form.trade} onInput={onSelect("trade")}>
            <option value="waermepumpe">Wärmepumpe</option>
            <option value="pv">Photovoltaik</option>
            <option value="sanitaer">Sanitär</option>
          </select>
        </Field>
        <Field label="Postleitzahl">
          <input value={form.postalCode} onInput={onText("postalCode")} required />
        </Field>
        <Field label="Gebäude">
          <select value={form.buildingType} onInput={onSelect("buildingType")}>
            <option value="altbau">Altbau</option>
            <option value="neubau">Neubau</option>
          </select>
        </Field>
        <Field label="Beheizte Fläche (m²)">
          <input type="number" min={1} value={form.heatedAreaM2} onInput={onText("heatedAreaM2")} />
        </Field>
        <Field label="Aktuelle Heizung">
          <select value={form.currentHeating} onInput={onSelect("currentHeating")}>
            <option value="gas">Gas</option>
            <option value="oel">Öl</option>
            <option value="nachtspeicher">Nachtspeicher</option>
          </select>
        </Field>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={form.wantsKfW}
            onChange={(e) => store.setForm("wantsKfW", e.currentTarget.checked)}
          />{" "}
          KfW/BAFA-Förderung gewünscht
        </label>
        <Field label="Hinweise">
          <textarea rows={2} value={form.notes} onInput={onText("notes")} />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Betriebe</legend>
        <Field label="Ein Betrieb pro Zeile: Name; Entfernung km; förderfähig (ja/nein); Zertifikate">
          <textarea
            rows={4}
            value={providersText}
            onInput={(e) => store.setProvidersText(e.currentTarget.value)}
          />
        </Field>
      </fieldset>

      <button type="submit" class="primary" disabled={busy}>
        {busy ? "Suche…" : "Passende Betriebe finden"}
      </button>

      {status === "error" && <p class="error">⚠️ {error}</p>}

      {result && (
        <section class="result">
          <h3>Rangliste</h3>
          {result.ranked.map((entry) => (
            <div class="ranked" key={entry.provider.id}>
              <div class="meta">
                <span class="provider-name">{entry.provider.name}</span>
                <span class="badge">🎯 {entry.score.score}</span>
                <span class={`badge ${entry.provider.fundingEligible ? "go" : "stop"}`}>
                  {entry.provider.fundingEligible ? "✅ förderfähig" : "🚫 nicht förderfähig"}
                </span>
                <span class="badge">{entry.provider.distanceKm} km</span>
              </div>
              {entry.score.caveats.length > 0 && (
                <ul class="flags">
                  {entry.score.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {result.topInquiry ? (
            <>
              <h3>Anfrage an {result.topInquiry.providerName}</h3>
              <p>{result.topInquiry.inquiry.subjectLine}</p>
              <pre>{result.topInquiry.inquiry.inquiryMessage}</pre>
            </>
          ) : (
            <p class="flags">Kein Betrieb erfüllt die Kriterien für eine Kontaktaufnahme.</p>
          )}
        </section>
      )}
    </form>
  );
}
