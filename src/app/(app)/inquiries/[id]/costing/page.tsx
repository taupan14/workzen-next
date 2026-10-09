import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/documents/auth";
import {
  BLOCKER_MESSAGES,
  ISSUE_MESSAGES,
  WARNING_MESSAGES,
  describeCode,
} from "@/lib/documents/readiness-messages";
import {
  Card,
  Notice,
  REQUIREMENT_LABEL,
  Rp,
  StatusBadge,
  TREATMENT_LABEL,
  btnCls,
  btnLightCls,
  inputCls,
} from "@/components/documents/ui";
import {
  assignTaskScenario,
  compileDoc,
  confirmValidLines,
  createScenario,
  deleteLine,
  importFromTasks,
  recalcScenario,
  saveLine,
  saveScenarioHeader,
} from "../../../documents/actions";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Readiness {
  ready: boolean;
  blockers: Array<{
    code: string;
    line_id?: string;
    detail?: string;
    issues?: string[];
  }>;
  warnings: Array<{ code: string; line_id?: string; detail?: string }>;
}

function Select({
  name,
  value,
  options,
  className = inputCls,
}: {
  name: string;
  value?: string | null;
  options: Array<[string, string]>;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? options[0][0]}
      className={className}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function LineForm({
  line,
  scenario,
  inquiryId,
  sections,
  siblings,
}: {
  line?: Row;
  scenario: Row;
  inquiryId: string;
  sections: Array<[string, string]>;
  siblings: Row[];
}) {
  const v = (k: string) => (line?.[k] ?? "") as string | number;
  const issues: string[] = line?.calc_issues ?? [];
  return (
    <form
      action={saveLine}
      className={`mb-3 rounded border border-rule p-3 ${line ? "bg-paper" : "border-dashed border-rule bg-mist"}`}
    >
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <input type="hidden" name="scenario_id" value={scenario.id} />
      {line && <input type="hidden" name="id" value={line.id} />}
      <div className="grid grid-cols-12 gap-2">
        <Select
          name="section_code"
          value={line?.section_code ?? "UNSORTED"}
          options={[["UNSORTED", "(pilih bagian)"], ...sections]}
          className={`${inputCls} col-span-3`}
        />
        <input
          name="description"
          defaultValue={v("description")}
          placeholder="Deskripsi (tampil ke customer)"
          required
          className={`${inputCls} col-span-9`}
        />
        <input
          name="qty"
          defaultValue={v("qty")}
          placeholder="Qty"
          inputMode="decimal"
          className={`${inputCls} col-span-2`}
        />
        <input
          name="uom"
          defaultValue={v("uom")}
          placeholder="Unit"
          className={`${inputCls} col-span-2`}
        />
        <input
          name="qty2"
          defaultValue={v("qty2")}
          placeholder="Qty2 (1)"
          inputMode="decimal"
          className={`${inputCls} col-span-2`}
        />
        <input
          name="uom2"
          defaultValue={v("uom2")}
          placeholder="Unit2"
          className={`${inputCls} col-span-2`}
        />
        <input
          name="cost_rate"
          defaultValue={v("cost_rate")}
          placeholder="Rate (biaya)"
          inputMode="decimal"
          className={`${inputCls} col-span-2`}
        />
        <input
          name="currency"
          defaultValue={line?.currency ?? "IDR"}
          placeholder="IDR"
          className={`${inputCls} col-span-2 uppercase`}
        />
        <input
          name="margin_pct"
          defaultValue={v("margin_pct")}
          placeholder="Margin %"
          inputMode="decimal"
          className={`${inputCls} col-span-2`}
        />
        <input
          name="discount_pct"
          defaultValue={v("discount_pct")}
          placeholder="Diskon %"
          inputMode="decimal"
          className={`${inputCls} col-span-2`}
        />
        <input
          name="validity_until"
          type="date"
          defaultValue={line?.validity_until ?? ""}
          className={`${inputCls} col-span-3`}
        />
        <Select
          name="treatment"
          value={line?.treatment ?? "CONFIRMED"}
          options={Object.entries(TREATMENT_LABEL)}
          className={`${inputCls} col-span-4`}
        />
        <Select
          name="requirement_status"
          value={line?.requirement_status ?? "PENDING"}
          options={Object.entries(REQUIREMENT_LABEL)}
          className={`${inputCls} col-span-5`}
        />
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">
          Lanjutan (vendor, catatan, persen dari baris lain)
        </summary>
        <div className="mt-2 grid grid-cols-12 gap-2">
          <input
            name="vendor"
            defaultValue={v("vendor")}
            placeholder="Vendor (internal)"
            className={`${inputCls} col-span-4`}
          />
          <input
            name="sell_rate_override"
            defaultValue={v("sell_rate_override")}
            placeholder="Harga jual manual"
            inputMode="decimal"
            className={`${inputCls} col-span-3`}
          />
          <input
            name="sort_order"
            defaultValue={v("sort_order")}
            placeholder="Urutan"
            inputMode="numeric"
            className={`${inputCls} col-span-2`}
          />
          <Select
            name="formula"
            value={line?.formula ?? "QTY_RATE"}
            options={[
              ["QTY_RATE", "Qty × Qty2 × Rate"],
              ["PERCENT_OF_LINE", "Persen dari baris lain"],
            ]}
            className={`${inputCls} col-span-3`}
          />
          <input
            name="percent_value"
            defaultValue={v("percent_value")}
            placeholder="Persen (mis. 20)"
            inputMode="decimal"
            className={`${inputCls} col-span-3`}
          />
          <Select
            name="parent_line_id"
            value={line?.parent_line_id ?? ""}
            options={[
              ["", "(induk)"],
              ...siblings
                .filter((s) => s.id !== line?.id && s.formula === "QTY_RATE")
                .map(
                  (s) =>
                    [s.id as string, String(s.description).slice(0, 50)] as [
                      string,
                      string,
                    ],
                ),
            ]}
            className={`${inputCls} col-span-9`}
          />
          <input
            name="remark"
            defaultValue={v("remark")}
            placeholder="Catatan ke customer"
            className={`${inputCls} col-span-6`}
          />
          <input
            name="condition_text"
            defaultValue={v("condition_text")}
            placeholder="Kondisi (tampil ke customer)"
            className={`${inputCls} col-span-6`}
          />
          <input
            name="internal_note"
            defaultValue={v("internal_note")}
            placeholder="Catatan internal (tidak pernah ke customer)"
            className={`${inputCls} col-span-6`}
          />
          <input
            name="exception_note"
            defaultValue={v("exception_note")}
            placeholder="Catatan pengecualian (wajib bila Pengecualian)"
            className={`${inputCls} col-span-6`}
          />
        </div>
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className={btnCls}>{line ? "Simpan" : "Tambah baris"}</button>
        {line && (
          <>
            <button
              formAction={deleteLine}
              formNoValidate
              className={btnLightCls}
            >
              Hapus
            </button>
            <span className="ml-2 text-sm text-muted">
              Harga jual: <Rp v={line.sell_amount_idr} />
            </span>
            {issues.map((i) => (
              <span
                key={i}
                className="rounded border border-danger px-2 py-0.5 text-xs text-danger"
              >
                {describeCode(ISSUE_MESSAGES, i)}
              </span>
            ))}
            {line.source_cost_item_id && (
              <span className="rounded border border-rule px-2 py-0.5 text-xs text-muted">
                dari task
              </span>
            )}
          </>
        )}
      </div>
    </form>
  );
}

export default async function CostingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const { msg, err } = await searchParams;
  const { sb, canManage, role } = await requireStaff();

  const { data: inquiry } = await sb
    .from("inquiries")
    .select("id, inquiry_no, subject, customers(name, email)")
    .eq("id", id)
    .single();
  if (!inquiry) notFound();

  const [
    { data: scenarios },
    { data: lines },
    { data: tasks },
    { data: docs },
    { data: tpl },
  ] = await Promise.all([
    sb.from("cost_scenarios").select("*").eq("inquiry_id", id).order("code"),
    sb
      .from("cost_lines")
      .select("*")
      .eq("inquiry_id", id)
      .order("section_code")
      .order("sort_order"),
    sb
      .from("tasks")
      .select("id, task_no, status, scope, scenario_id")
      .eq("inquiry_id", id)
      .order("task_no"),
    sb
      .from("documents")
      .select(
        "id, scenario_id, doc_type, doc_no, version, revision, status, total_idr",
      )
      .eq("inquiry_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("document_templates")
      .select("config")
      .eq("doc_type", "EPDA")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const sections: Array<[string, string]> = (
    (tpl?.config?.sections ?? []) as Array<{ code: string; label: string }>
  ).map((s) => [s.code, `${s.code}. ${s.label}`]);
  const readiness = new Map<string, Readiness>();
  await Promise.all(
    (scenarios ?? []).map(async (s: Row) => {
      const { data } = await sb.rpc("scenario_readiness", { p_scenario: s.id });
      if (data) readiness.set(s.id, data as Readiness);
    }),
  );
  const cust = inquiry.customers as unknown as {
    name?: string;
    email?: string;
  } | null;
  const showInternal = role !== "dept_user";

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link
            href={`/inquiries/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            ← Inquiry {inquiry.inquiry_no}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            Costing &amp; Dokumen
          </h1>
          <p className="text-sm text-muted">
            {cust?.name ?? "-"} {cust?.email ? `(${cust.email})` : ""} —{" "}
            {inquiry.subject}
          </p>
        </div>
      </div>
      <Notice msg={msg} err={err} />

      {canManage && (
        <Card title="Skenario baru (satu per lokasi / alternatif; total antar-skenario tidak dijumlahkan)">
          <form
            action={createScenario}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="inquiry_id" value={id} />
            <input
              name="code"
              placeholder="Kode (S1)"
              required
              className={`${inputCls} w-24 uppercase`}
            />
            <input
              name="name"
              placeholder="Nama (mis. Batam - stevedoring)"
              required
              className={`${inputCls} w-72`}
            />
            <input
              name="location"
              placeholder="Lokasi"
              className={`${inputCls} w-40`}
            />
            <input
              name="usd_rate"
              placeholder="Kurs USD→IDR (opsional)"
              inputMode="decimal"
              className={`${inputCls} w-52`}
            />
            <input
              name="fx_source"
              placeholder="Sumber kurs"
              className={`${inputCls} w-36`}
            />
            <button className={btnCls}>Buat skenario</button>
          </form>
        </Card>
      )}

      {(scenarios ?? []).length === 0 && (
        <p className="text-sm text-muted">
          Belum ada skenario. Buat satu di atas, lalu impor biaya dari task.
        </p>
      )}

      {(scenarios ?? []).map((s: Row) => {
        const r = readiness.get(s.id);
        const sLines = (lines ?? []).filter((l: Row) => l.scenario_id === s.id);
        const sTasks = (tasks ?? []).filter((t: Row) => t.scenario_id === s.id);
        const sDocs = (docs ?? []).filter((d: Row) => d.scenario_id === s.id);
        const h = (s.header ?? {}) as Record<string, string>;
        const bySection = new Map<string, Row[]>();
        for (const l of sLines)
          bySection.set(l.section_code, [
            ...(bySection.get(l.section_code) ?? []),
            l,
          ]);
        const order = [...sections.map(([c]) => c), "UNSORTED"];
        return (
          <Card
            key={s.id}
            title={`${s.code} — ${s.name}${s.location ? ` (${s.location})` : ""}`}
            right={
              <span className="text-sm text-muted">
                Total{" "}
                <b>
                  <Rp v={s.total_idr} />
                </b>
              </span>
            }
          >
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
              <div>
                Confirmed
                <br />
                <Rp v={s.subtotal_confirmed_idr} />
              </div>
              <div>
                Estimate
                <br />
                <Rp v={s.subtotal_estimate_idr} />
              </div>
              <div>
                Bersyarat (di luar total)
                <br />
                <Rp v={s.conditional_idr} />
              </div>
              <div>
                As per actual
                <br />
                {s.as_per_actual_count ?? 0} baris
              </div>
              <div>
                Pending
                <br />
                {s.pending_count ?? 0} baris
              </div>
              {showInternal && (
                <div className="text-muted">
                  Margin (internal)
                  <br />
                  <Rp v={s.margin_total_idr} />
                </div>
              )}
            </div>

            {r && (
              <div
                className={`mb-4 rounded border p-3 text-sm ${r.ready ? "border-ok bg-paper" : "border-warn bg-paper"}`}
              >
                <div className="mb-1 font-medium">
                  {r.ready
                    ? "Siap dibuat dokumen"
                    : `Belum siap — ${r.blockers.length} hal harus diselesaikan`}
                </div>
                {r.blockers.length > 0 && (
                  <ul className="list-disc pl-5">
                    {r.blockers.map((b, i) => (
                      <li key={i}>
                        {b.detail ? <b>{b.detail}: </b> : null}
                        {describeCode(BLOCKER_MESSAGES, b.code)}
                        {b.issues?.length ? (
                          <>
                            {" "}
                            (
                            {b.issues
                              .map((x) => describeCode(ISSUE_MESSAGES, x))
                              .join(", ")}
                            )
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {r.warnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-muted">
                    {[...new Set(r.warnings.map((w) => w.code))].map((c) => (
                      <li key={c}>{describeCode(WARNING_MESSAGES, c)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {canManage && (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    [
                      "importFromTasks",
                      "Impor biaya dari task",
                      importFromTasks,
                    ],
                    [
                      "confirmValidLines",
                      "Sahkan semua baris Pending yang valid",
                      confirmValidLines,
                    ],
                    ["recalc", "Hitung ulang", recalcScenario],
                  ].map(([k, label, act]) => (
                    <form
                      key={k as string}
                      action={act as (fd: FormData) => Promise<void>}
                    >
                      <input type="hidden" name="inquiry_id" value={id} />
                      <input type="hidden" name="scenario_id" value={s.id} />
                      <button className={btnLightCls}>{label as string}</button>
                    </form>
                  ))}
                </div>
                <details className="mb-4 rounded border border-rule p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Data skenario &amp; kapal (muncul di dokumen)
                  </summary>
                  <form
                    action={saveScenarioHeader}
                    className="mt-3 grid grid-cols-12 gap-2"
                  >
                    <input type="hidden" name="inquiry_id" value={id} />
                    <input type="hidden" name="scenario_id" value={s.id} />
                    <input
                      name="name"
                      defaultValue={s.name}
                      required
                      className={`${inputCls} col-span-6`}
                    />
                    <input
                      name="location"
                      defaultValue={s.location ?? ""}
                      placeholder="Lokasi"
                      className={`${inputCls} col-span-6`}
                    />
                    {(
                      [
                        ["principal", "Principal / nama customer di dokumen"],
                        ["billing_address", "Billing address"],
                        ["vessel_name", "Vessel"],
                        ["dwt", "DWT"],
                        ["grt_nrt", "GRT / NRT"],
                        ["loa_breadth", "LOA / Breadth"],
                        ["port_of_call", "Port of call"],
                        ["purpose_of_call", "Purpose of call"],
                        ["activity", "Activity"],
                        ["cargo", "Cargo / volume"],
                        [
                          "eta",
                          "ETA (kosongkan bila belum ada — jangan dikarang)",
                        ],
                      ] as const
                    ).map(([k, ph]) => (
                      <input
                        key={k}
                        name={k}
                        defaultValue={h[k] ?? ""}
                        placeholder={ph}
                        className={`${inputCls} ${k === "billing_address" ? "col-span-12" : "col-span-6"}`}
                      />
                    ))}
                    <input
                      name="usd_rate"
                      defaultValue={s.fx_rates?.USD ?? ""}
                      placeholder="Kurs USD→IDR"
                      inputMode="decimal"
                      className={`${inputCls} col-span-3`}
                    />
                    <input
                      name="fx_source"
                      defaultValue={s.fx_source ?? ""}
                      placeholder="Sumber kurs"
                      className={`${inputCls} col-span-3`}
                    />
                    <button className={`${btnCls} col-span-2`}>Simpan</button>
                  </form>
                </details>
              </>
            )}

            {sTasks.length === 0 && canManage && (
              <p className="mb-3 text-sm text-muted">
                Belum ada task terkait skenario ini (hubungkan di bagian “Task
                inquiry” di bawah).
              </p>
            )}
            {sTasks.length > 0 && (
              <p className="mb-3 text-sm text-muted">
                Task:{" "}
                {sTasks
                  .map((t: Row) => `${t.task_no} (${t.status})`)
                  .join(", ")}
              </p>
            )}

            {order
              .filter((c) => bySection.has(c))
              .map((c) => (
                <div key={c} className="mb-2">
                  <h3 className="mb-1 mt-3 text-sm font-semibold text-muted">
                    {c === "UNSORTED"
                      ? "Belum diklasifikasi"
                      : (sections.find(([x]) => x === c)?.[1] ?? c)}
                  </h3>
                  {bySection.get(c)!.map((l) =>
                    canManage ? (
                      <LineForm
                        key={l.id}
                        line={l}
                        scenario={s}
                        inquiryId={id}
                        sections={sections}
                        siblings={sLines}
                      />
                    ) : (
                      <div
                        key={l.id}
                        className="mb-1 rounded border border-rule p-2 text-sm"
                      >
                        {l.description} — <Rp v={l.sell_amount_idr} />
                      </div>
                    ),
                  )}
                </div>
              ))}
            {canManage && (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold text-muted">
                  Tambah baris
                </h3>
                <LineForm
                  scenario={s}
                  inquiryId={id}
                  sections={sections}
                  siblings={sLines}
                />
                <p className="mb-3 text-xs text-muted">
                  Mengubah baris yang sudah dipakai dokumen akan membatalkan
                  dokumen versi itu yang belum terkirim; dokumen yang sudah
                  terkirim tidak diubah (dibuat permintaan revisi).
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["EPDA", "QUO"] as const).map((t) => (
                    <form key={t} action={compileDoc}>
                      <input type="hidden" name="inquiry_id" value={id} />
                      <input type="hidden" name="scenario_id" value={s.id} />
                      <input type="hidden" name="doc_type" value={t} />
                      <button className={btnCls} disabled={!r?.ready}>
                        {t === "EPDA" ? "Buat EPDA" : "Buat Quotation"}
                      </button>
                    </form>
                  ))}
                </div>
              </>
            )}

            {sDocs.length > 0 && (
              <div className="mt-4 border-t border-rule pt-3">
                <h3 className="mb-1 text-sm font-semibold">
                  Dokumen skenario ini
                </h3>
                <ul className="space-y-1 text-sm">
                  {sDocs.map((d: Row) => (
                    <li key={d.id} className="flex items-center gap-2">
                      <Link
                        href={`/documents/${d.id}`}
                        className="text-brand hover:underline"
                      >
                        {d.doc_no}
                      </Link>
                      <span className="text-muted">
                        v{d.version}
                        {d.revision > 0 ? ` · rev ${d.revision}` : ""}
                      </span>
                      <StatusBadge status={d.status} /> <Rp v={d.total_idr} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}

      {canManage &&
        (tasks ?? []).length > 0 &&
        (scenarios ?? []).length > 0 && (
          <Card title="Task inquiry — kaitkan ke skenario">
            <ul className="space-y-2 text-sm">
              {(tasks ?? []).map((t: Row) => (
                <li key={t.id}>
                  <form
                    action={assignTaskScenario}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="inquiry_id" value={id} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <span className="w-28 font-medium">{t.task_no}</span>
                    <span className="w-28 text-muted">{t.status}</span>
                    <span className="max-w-md flex-1 truncate text-muted">
                      {t.scope}
                    </span>
                    <Select
                      name="scenario_id"
                      value={t.scenario_id ?? ""}
                      options={[
                        ["", "(semua / tanpa skenario)"],
                        ...(scenarios ?? []).map(
                          (s: Row) =>
                            [s.id as string, `${s.code} — ${s.name}`] as [
                              string,
                              string,
                            ],
                        ),
                      ]}
                    />
                    <button className={btnLightCls}>Simpan</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
    </div>
  );
}
