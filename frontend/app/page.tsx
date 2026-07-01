"use client";

import { useEffect, useState, useCallback } from "react";

type Deposit = { commitment: string; label: string };
type Identity = { leaf: string; label: string; status: "allowed" | "revoked" };
type StateResp = { poolDeposits: Deposit[]; aspIdentities: Identity[]; poolRoot: string; aspRoot: string };

const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function randomFieldClientSide(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return (v % FIELD_MODULUS).toString();
}

function short(hexlike: string, n = 10) {
  if (!hexlike) return "";
  return hexlike.length > n * 2 ? `${hexlike.slice(0, n)}...${hexlike.slice(-n)}` : hexlike;
}

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handleCopy}
      className="mono-num underline decoration-dotted text-left"
      style={{ color: "var(--ink-dim)" }}
      title="Click to copy full value"
    >
      {short(value)} <span style={{ color: copied ? "var(--ink)" : "var(--ink-dim)" }}>{copied ? "✓ copied" : "copy"}</span>
    </button>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4 ledger-row sm:border-r last:border-r-0" style={{ borderColor: "var(--rule)" }}>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="mono-num" title={value}>{short(value, 14)}</div>
    </div>
  );
}

export default function Page() {
  const [state, setState] = useState<StateResp | null>(null);
  const [note, setNote] = useState<{ nullifier: string; secret: string; commitment: string; nullifier_hash: string } | null>(null);
  const [depositLabel, setDepositLabel] = useState("");
  const [aspLabel, setAspLabel] = useState("");
  const [aspSecretPreview, setAspSecretPreview] = useState<string | null>(null);

  const [wPoolIndex, setWPoolIndex] = useState("");
  const [wNullifier, setWNullifier] = useState("");
  const [wSecret, setWSecret] = useState("");
  const [wAspIndex, setWAspIndex] = useState("");
  const [wIdentitySecret, setWIdentitySecret] = useState("");
  const [wResult, setWResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state");
    setState(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function generateNote() {
    setBusy("note");
    const res = await fetch("/api/generate-note", { method: "POST" });
    setNote(await res.json());
    setBusy(null);
  }

  async function depositNote() {
    if (!note) return;
    setBusy("deposit");
    await fetch("/api/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitment: note.commitment, label: depositLabel || "deposit" }),
    });
    setDepositLabel("");
    await refresh();
    setBusy(null);
  }

  function generateIdentitySecret() {
    setAspSecretPreview(randomFieldClientSide());
  }

  async function addIdentity() {
    if (!aspLabel || !aspSecretPreview) return;
    setBusy("asp-add");
    await fetch("/api/asp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", label: aspLabel, identitySecret: aspSecretPreview }),
    });
    setAspLabel("");
    setAspSecretPreview(null);
    await refresh();
    setBusy(null);
  }

  async function revokeIdentity(index: number) {
    setBusy(`revoke-${index}`);
    await fetch("/api/asp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", index }),
    });
    await refresh();
    setBusy(null);
  }

  async function buildWithdrawWitness() {
    setBusy("withdraw");
    setWResult(null);
    try {
      const res = await fetch("/api/withdraw-witness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolIndex: Number(wPoolIndex),
          nullifier: wNullifier,
          secret: wSecret,
          aspIndex: Number(wAspIndex),
          identitySecret: wIdentitySecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWResult({ ok: false, message: data.error || "Request failed." });
      } else {
        setWResult({
          ok: true,
          message: `Witness built. Public inputs: root=${short(data.publicInputs.root)}, nullifier_hash=${short(data.publicInputs.nullifier_hash)}, asp_root=${short(data.publicInputs.asp_root)}. Next: run nargo execute + bb prove locally, then call withdraw() on-chain.`,
        });
      }
    } catch {
      setWResult({ ok: false, message: "Network error." });
    }
    setBusy(null);
  }

  function fillFromNote() {
    if (!note || !state) return;
    const idx = state.poolDeposits.findIndex((d) => d.commitment === note.commitment);
    setWPoolIndex(idx >= 0 ? String(idx) : "");
    setWNullifier(note.nullifier);
    setWSecret(note.secret);
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-10 flex-1">
      <header className="mb-8">
        <div className="eyebrow mb-2">stellar testnet &middot; simulated registry &middot; real poseidon2 + noir circuit</div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: "var(--ink)" }}>
          Compliant Privacy Pool
        </h1>
        <p className="mt-2 text-sm max-w-2xl" style={{ color: "var(--ink-dim)" }}>
          Deposit and withdraw without linking sender to recipient on-chain, while every withdrawal still has to
          prove membership in the current ASP allow-list. Remove someone from the list, and their next
          withdrawal proof simply will not satisfy the circuit, however old or valid their deposit is.
        </p>
      </header>

      {state && (
        <div className="ledger-panel grid grid-cols-2 sm:grid-cols-4 mb-10">
          <StatCell label="pool root" value={state.poolRoot} />
          <StatCell label="asp root" value={state.aspRoot} />
          <StatCell label="deposits" value={String(state.poolDeposits.length)} />
          <StatCell label="allow-listed" value={String(state.aspIdentities.filter((i) => i.status === "allowed").length)} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6 mb-10">
        <section className="ledger-panel p-5">
          <h2 className="eyebrow mb-4">1. deposit</h2>
          <button onClick={generateNote} disabled={busy === "note"} className="btn-amber text-sm px-4 py-2 mb-4 w-full">
            {busy === "note" ? "generating..." : "generate note"}
          </button>
          {note && (
            <div className="mb-4 space-y-2 text-xs">
              <div><span className="mono-num" style={{ color: "var(--ink-dim)" }}>nullifier </span><CopyableValue value={note.nullifier} /></div>
              <div><span className="mono-num" style={{ color: "var(--ink-dim)" }}>secret    </span><CopyableValue value={note.secret} /></div>
              <div><span className="mono-num" style={{ color: "var(--ink-dim)" }}>commitment</span> <CopyableValue value={note.commitment} /></div>
              <p className="mt-2" style={{ color: "var(--ink-dim)" }}>
                Save nullifier + secret somewhere private now, they are not stored anywhere.
              </p>
            </div>
          )}
          <input
            value={depositLabel}
            onChange={(e) => setDepositLabel(e.target.value)}
            placeholder="label (e.g. payroll batch #4)"
            className="field-input w-full px-3 py-2 mb-3"
          />
          <button onClick={depositNote} disabled={!note || busy === "deposit"} className="btn-outline text-sm px-4 py-2 w-full">
            {busy === "deposit" ? "depositing..." : "deposit commitment to pool"}
          </button>
        </section>

        <section className="ledger-panel p-5">
          <h2 className="eyebrow mb-4">2. compliance authority - asp allow-list</h2>
          <input
            value={aspLabel}
            onChange={(e) => setAspLabel(e.target.value)}
            placeholder="identity label (e.g. KYC'd user A)"
            className="field-input w-full px-3 py-2 mb-3"
          />
          <button onClick={generateIdentitySecret} className="btn-outline text-sm px-4 py-2 w-full mb-3">
            issue identity secret
          </button>
          {aspSecretPreview && (
            <div className="mb-3 text-xs">
              <span className="mono-num" style={{ color: "var(--ink-dim)" }}>identity_secret </span>
              <CopyableValue value={aspSecretPreview} />
              <p className="mt-1" style={{ color: "var(--ink-dim)" }}>Hand this to the approved user out-of-band; it never touches the chain.</p>
            </div>
          )}
          <button onClick={addIdentity} disabled={!aspLabel || !aspSecretPreview || busy === "asp-add"} className="btn-amber text-sm px-4 py-2 w-full">
            {busy === "asp-add" ? "adding..." : "add to allow-list (publish new asp_root)"}
          </button>
        </section>
      </div>

      <section className="ledger-panel p-5 mb-10">
        <h2 className="eyebrow mb-4">3. withdraw</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="eyebrow mb-2">your deposit</div>
            <input value={wPoolIndex} onChange={(e) => setWPoolIndex(e.target.value)} placeholder="pool index" className="field-input w-full px-3 py-2 mb-2" />
            <input value={wNullifier} onChange={(e) => setWNullifier(e.target.value)} placeholder="nullifier" className="field-input w-full px-3 py-2 mb-2" />
            <input value={wSecret} onChange={(e) => setWSecret(e.target.value)} placeholder="secret" className="field-input w-full px-3 py-2" />
            {note && (
              <button onClick={fillFromNote} className="text-xs mt-2 underline" style={{ color: "var(--ink-dim)" }}>
                fill from last generated note
              </button>
            )}
          </div>
          <div>
            <div className="eyebrow mb-2">your asp identity</div>
            <input value={wAspIndex} onChange={(e) => setWAspIndex(e.target.value)} placeholder="asp index" className="field-input w-full px-3 py-2 mb-2" />
            <input value={wIdentitySecret} onChange={(e) => setWIdentitySecret(e.target.value)} placeholder="identity_secret" className="field-input w-full px-3 py-2" />
          </div>
        </div>
        <button onClick={buildWithdrawWitness} disabled={busy === "withdraw"} className="btn-amber text-sm px-4 py-2 w-full mb-3">
          {busy === "withdraw" ? "checking..." : "build withdrawal proof inputs"}
        </button>
        {wResult && (
          <div className={`text-xs p-3 ${wResult.ok ? "tag-allowed" : "tag-revoked"}`}>
            {wResult.message}
          </div>
        )}
      </section>

      {state && (
        <div className="grid sm:grid-cols-2 gap-6">
          <section>
            <h3 className="eyebrow mb-3">pool ledger</h3>
            <div className="ledger-panel">
              {state.poolDeposits.length === 0 && <div className="p-4 text-xs" style={{ color: "var(--ink-dim)" }}>no deposits yet</div>}
              {state.poolDeposits.map((d, i) => (
                <div key={i} className="ledger-row flex justify-between items-center px-4 py-2.5 text-xs">
                  <span style={{ color: "var(--ink-dim)" }}>[{i}] {d.label}</span>
                  <span className="mono-num">{short(d.commitment)}</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="eyebrow mb-3">asp allow-list</h3>
            <div className="ledger-panel">
              {state.aspIdentities.length === 0 && <div className="p-4 text-xs" style={{ color: "var(--ink-dim)" }}>no identities yet</div>}
              {state.aspIdentities.map((id, i) => (
                <div key={i} className="ledger-row flex justify-between items-center px-4 py-2.5 text-xs gap-2">
                  <span style={{ color: "var(--ink-dim)" }} className="truncate">[{i}] {id.label}</span>
                  <span className={`px-2 py-0.5 text-[11px] ${id.status === "allowed" ? "tag-allowed" : "tag-revoked"}`}>
                    {id.status}
                  </span>
                  {id.status === "allowed" && (
                    <button onClick={() => revokeIdentity(i)} disabled={busy === `revoke-${i}`} className="btn-outline px-2 py-0.5 text-[11px]">
                      revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <footer className="mt-12 text-xs" style={{ color: "var(--ink-dim)" }}>
        Demo state lives in this server process only. See README for what is real vs simplified.
      </footer>
    </div>
  );
}
