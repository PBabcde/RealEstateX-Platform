import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { KeyRound, ShieldCheck } from "lucide-react";

const ADMIN_SESSION_URL = "/api/admin-access/session";

function safeDestination(): "/sales" | "/control-room" {
  const next = new URLSearchParams(window.location.search).get("next");
  return next === "/sales" ? "/sales" : "/control-room";
}

export function AdminAccessPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(ADMIN_SESSION_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Toegang is niet gelukt. Probeer het opnieuw.");
        return;
      }
      const statusResponse = await fetch(ADMIN_SESSION_URL, { credentials: "same-origin" });
      const status = statusResponse.ok
        ? await statusResponse.json() as { authenticated?: boolean }
        : { authenticated: false };
      if (!status.authenticated) {
        setError("De sessie kon niet worden bevestigd. Probeer het opnieuw.");
        return;
      }
      queryClient.clear();
      queryClient.setQueryData(["admin-access", "session"], { authenticated: true });
      setKey("");
      setLocation(safeDestination());
    } catch {
      setError("De beheerverbinding is niet beschikbaar. Probeer het later opnieuw.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f4f6f5] px-4 py-10 text-[#182b40]">
      <section className="w-full max-w-md rounded-3xl border border-[#d9e2df] bg-white p-6 shadow-[0_16px_55px_rgba(24,43,64,0.08)] sm:p-8" aria-labelledby="admin-access-title">
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf2ef] text-[#287b6a]"><ShieldCheck size={22} /></div>
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#287b6a]">Beheerdersomgeving</p>
        <h1 id="admin-access-title" className="display mt-2 text-3xl font-bold tracking-[-0.05em]">Veilige admin-toegang</h1>
        <p className="mt-3 text-sm leading-6 text-[#60717e]">Gebruik de sleutel die voor deze Coolify-installatie is ingesteld. De sleutel wordt alleen via een beveiligde aanvraag gecontroleerd.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-xs font-semibold" htmlFor="admin-access-key">Toegangssleutel
            <span className="relative mt-1.5 block"><KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7d8e98]" /><input id="admin-access-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" required maxLength={1024} className="min-h-12 w-full rounded-xl border border-[#d5dfe1] bg-[#fbfcfc] pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#287b6a]" data-testid="input-admin-access-key" /></span>
          </label>
          {error && <p className="rounded-xl border border-[#e7c4bc] bg-[#fff1ed] px-3 py-2.5 text-xs font-semibold text-[#99473b]" role="alert" data-testid="text-admin-access-error">{error}</p>}
          <button disabled={pending || !key} className="min-h-12 w-full rounded-xl bg-[#243b53] px-4 text-sm font-bold text-white disabled:opacity-55" data-testid="button-admin-access-submit">{pending ? "Controleren…" : "Open beheeromgeving"}</button>
        </form>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8edeb] pt-4 text-xs">
          <Link href="/sign-in" className="font-semibold text-[#315b70] underline underline-offset-4">Aanmelden met Clerk</Link>
          <Link href="/" className="text-[#687985] hover:underline">Terug naar RealEstateX</Link>
        </div>
      </section>
    </main>
  );
}
