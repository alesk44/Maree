import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui-bits";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/tracabilite")({
  head: () => ({
    meta: [
      { title: "Scanner QR & traçabilité — Marée Jersey" },
      { name: "description", content: "Lire les QR codes de traçabilité des poissons et fruits de mer à Jersey." },
    ],
  }),
  component: TraceabilityScanner,
});

type ScanResult = { raw: string; kind: "url" | "gs1" | "identifier" };
type Detector = { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> };
type DetectorWindow = typeof window & { BarcodeDetector?: new (options?: { formats?: string[] }) => Detector };

function classifyCode(raw: string): ScanResult {
  const value = raw.trim();
  if (/^https:\/\//i.test(value)) return { raw: value, kind: /\/(01)\d{14}/.test(value) || /\/(10|21)\//.test(value) ? "gs1" : "url" };
  if (/^https?:\/\//i.test(value) || /^(javascript|data|file|intent):/i.test(value)) throw new Error("URL refusée : seules les adresses HTTPS sont acceptées.");
  if (/^\d{8,14}$/.test(value)) return { raw: value, kind: "gs1" };
  if (value.length > 0 && value.length <= 240) return { raw: value, kind: "identifier" };
  throw new Error("Code invalide ou trop long.");
}

function safeExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".local") || !url.hostname.includes(".")) {
    throw new Error("Cette adresse externe n'est pas considérée comme sûre.");
  }
  return url.toString();
}

function TraceabilityScanner() {
  const { language } = useLanguage();
  const fr = language === "fr";
  const ro = language === "ro";
  const words = {
    title: fr ? "Scanner & traçabilité" : ro ? "Scanare și trasabilitate" : "Scanner & traceability",
    subtitle: fr ? "Lisez les QR codes des pêcheurs, mareyeurs et fournisseurs de produits de la mer." : ro ? "Scanați codurile QR ale pescarilor și furnizorilor de produse marine." : "Scan QR codes from fishers, merchants and seafood suppliers.",
    camera: fr ? "Démarrer la caméra" : ro ? "Pornește camera" : "Start camera",
    stop: fr ? "Arrêter" : ro ? "Oprește" : "Stop",
    paste: fr ? "Coller un code ou une URL" : ro ? "Lipiți un cod sau un URL" : "Paste a code or URL",
    placeholder: fr ? "https://… ou identifiant de lot" : ro ? "https://… sau codul lotului" : "https://… or batch identifier",
    analyse: fr ? "Analyser le code" : ro ? "Analizează codul" : "Analyse code",
    upload: fr ? "Lire une photo du QR code" : ro ? "Scanați o fotografie QR" : "Read QR from a photo",
    source: fr ? "Ouvrir la source d'origine" : ro ? "Deschide sursa originală" : "Open original source",
    external: fr ? "Source externe — non vérifiée par Marée" : ro ? "Sursă externă — neverificată de Marée" : "External source — not verified by Marée",
    url: fr ? "Lien HTTPS" : ro ? "Link HTTPS" : "HTTPS link",
    gs1: fr ? "Identifiant / format GS1 possible" : ro ? "Identificator / posibil format GS1" : "Identifier / possible GS1 format",
    id: fr ? "Identifiant de lot" : ro ? "Identificator lot" : "Batch identifier",
    privacy: fr ? "La caméra fonctionne sur votre appareil. Marée n'enregistre pas de vidéo. Aucun site tiers n'est ouvert automatiquement." : ro ? "Camera funcționează pe dispozitiv. Marée nu înregistrează video. Site-urile externe nu se deschid automat." : "Camera runs on your device. Marée does not record video. External websites are never opened automatically.",
    association: fr ? "Association au lot Marée : étape suivante" : ro ? "Asociere la lotul Marée: pasul următor" : "Link to a Marée batch: next step",
    unsupported: fr ? "Ce navigateur ne prend pas en charge la lecture QR par caméra. Utilisez une photo ou collez le contenu." : ro ? "Browserul nu acceptă scanarea QR cu camera. Folosiți o fotografie sau lipiți conținutul." : "This browser does not support camera QR scanning. Use a photo or paste the code.",
  };
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [accountRole, setAccountRole] = useState<"fisher" | "restaurant" | null>(null);
  const [targets, setTargets] = useState<Array<{ id: string; label: string }>>([]);
  const [records, setRecords] = useState<Array<{ id: string; supplier_name: string; species: string; quantity_kg: number | string; received_at: string }>>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [species, setSpecies] = useState("");
  const [quantityKg, setQuantityKg] = useState("0.5");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [traceError, setTraceError] = useState("");
  const [traceNotice, setTraceNotice] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    let active = true;
    const loadTraceability = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) return;
        const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (profileError) throw profileError;
        if (profile.role !== "fisher" && profile.role !== "restaurant") return;
        if (!active) return;
        setAccountRole(profile.role);
        if (profile.role === "fisher") {
          const { data, error: lotsError } = await supabase.from("catches").select("id,species,landed_at").eq("fisher_id", user.id).order("landed_at", { ascending: false }).limit(100);
          if (lotsError) throw lotsError;
          const options = (data ?? []).map((lot) => ({ id: lot.id, label: `${lot.species} · ${new Date(lot.landed_at).toLocaleDateString()}` }));
          if (active) { setTargets(options); setSelectedTarget(options[0]?.id ?? ""); }
        } else {
          const { data, error: ordersError } = await supabase.from("orders").select("id,catch_id,requested_slot,status").order("created_at", { ascending: false }).limit(100);
          if (ordersError) throw ordersError;
          const options = (data ?? []).map((order) => ({ id: order.id, label: `${order.status} · ${new Date(order.requested_slot).toLocaleDateString()} · ${order.id.slice(0, 8)}` }));
          if (active) { setTargets(options); setSelectedTarget(options[0]?.id ?? ""); }
        }
        const { data: saved, error: recordsError } = await supabase.from("traceability_records").select("id,supplier_name,species,quantity_kg,received_at").order("created_at", { ascending: false }).limit(30);
        if (recordsError) throw recordsError;
        if (active) setRecords(saved ?? []);
      } catch {
        if (active) setTraceError(fr ? "L'enregistrement de traçabilité n'est pas disponible sur cette version de la base. La lecture du QR reste possible." : ro ? "Salvarea trasabilității nu este disponibilă în această versiune a bazei. Scanarea QR rămâne posibilă." : "Traceability saving is not available on this database version. QR reading still works.");
      }
    };
    void loadTraceability();
    return () => { active = false; };
  }, [fr, ro]);

  const accept = (raw: string) => {
    try {
      const parsed = classifyCode(raw);
      setResult(parsed);
      setInput(raw);
      setError("");
      stopCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Code invalide.");
    }
  };
  const startCamera = async () => {
    setCameraError("");
    const DetectorCtor = (window as DetectorWindow).BarcodeDetector;
    if (!DetectorCtor) { setCameraError(words.unsupported); return; }
    try {
      const detector = new DetectorCtor({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      timerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) accept(codes[0].rawValue);
        } catch { /* Wait for the next camera frame. */ }
      }, 450);
    } catch {
      setCameraError(fr ? "Caméra inaccessible. Vérifiez l'autorisation du navigateur ou utilisez une photo." : ro ? "Camera nu este disponibilă. Verificați permisiunile sau folosiți o fotografie." : "Camera unavailable. Check browser permission or use a photo.");
      stopCamera();
    }
  };
  const readPhoto = async (file?: File) => {
    if (!file) return;
    const DetectorCtor = (window as DetectorWindow).BarcodeDetector;
    if (!DetectorCtor) { setCameraError(words.unsupported); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await new DetectorCtor({ formats: ["qr_code"] }).detect(bitmap);
      bitmap.close();
      if (codes[0]?.rawValue) accept(codes[0].rawValue);
      else setError(fr ? "Aucun QR code détecté dans cette image." : ro ? "Nu a fost detectat niciun cod QR." : "No QR code found in this image.");
    } catch {
      setError(fr ? "Impossible de lire cette image." : ro ? "Imaginea nu poate fi citită." : "Could not read this image.");
    }
  };
  const saveTraceability = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!result || !accountRole || !selectedTarget) return;
    const quantity = Number(quantityKg);
    if (!supplierName.trim() || !species.trim() || !Number.isFinite(quantity) || quantity <= 0 || !receivedAt) {
      setTraceError(fr ? "Complétez le fournisseur, l'espèce, la quantité et la date de réception." : ro ? "Completați furnizorul, specia, cantitatea și data primirii." : "Enter the supplier, species, quantity and receipt date.");
      return;
    }
    setSaving(true);
    setTraceError("");
    setTraceNotice("");
    try {
      const { error: saveError } = await supabase.rpc("attach_external_traceability", {
        p_catch_id: accountRole === "fisher" ? selectedTarget : null,
        p_order_id: accountRole === "restaurant" ? selectedTarget : null,
        p_source_kind: result.kind === "gs1" ? "gs1" : externalUrl ? "url" : "identifier",
        p_external_code: result.raw,
        p_source_url: externalUrl,
        p_supplier_name: supplierName.trim(),
        p_received_at: new Date(receivedAt).toISOString(),
        p_species: species.trim(),
        p_quantity_kg: quantity,
        p_note: note.trim() || null
      });
      if (saveError) throw saveError;
      setTraceNotice(fr ? "Référence enregistrée dans l'historique de traçabilité." : ro ? "Referința a fost salvată în istoricul trasabilității." : "Reference saved to the traceability history.");
      const { data: saved, error: recordsError } = await supabase.from("traceability_records").select("id,supplier_name,species,quantity_kg,received_at").order("created_at", { ascending: false }).limit(30);
      if (recordsError) throw recordsError;
      setRecords(saved ?? []);
      setNote("");
    } catch {
      setTraceError(fr ? "Impossible d'enregistrer cette référence. Vérifiez votre accès et les informations saisies." : ro ? "Referința nu a putut fi salvată. Verificați accesul și datele introduse." : "Could not save this reference. Check your access and the entered details.");
    } finally {
      setSaving(false);
    }
  };

  let externalUrl: string | null = null;
  if (result && /^https:\/\//i.test(result.raw)) {
    try { externalUrl = safeExternalUrl(result.raw); } catch { /* Display as untrusted text only. */ }
  }

  return <div className="mx-auto max-w-3xl px-4 py-10">
    <PageHeader title={words.title} sub={words.subtitle} />
    <section className="card space-y-4 p-5 sm:p-7">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-accent" onClick={() => void startCamera()} disabled={scanning}>{words.camera}</button>
        {scanning && <button type="button" className="btn" onClick={stopCamera}>{words.stop}</button>}
        <label className="btn cursor-pointer">{words.upload}<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => void readPhoto(e.target.files?.[0])} /></label>
      </div>
      <video ref={videoRef} className={scanning ? "w-full rounded-xl bg-black" : "hidden"} playsInline muted aria-label={words.camera} />
      {cameraError && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{cameraError}</p>}
      <div className="space-y-2">
        <label htmlFor="external-code" className="text-sm font-semibold">{words.paste}</label>
        <textarea id="external-code" className="input min-h-24 w-full resize-y" value={input} onChange={(e) => setInput(e.target.value)} placeholder={words.placeholder} />
        <button type="button" className="btn w-full sm:w-auto" onClick={() => accept(input)}>{words.analyse}</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{words.privacy}</p>
    </section>
    {result && <section className="card mt-5 space-y-4 p-5 sm:p-7" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{fr ? "Code détecté" : ro ? "Cod detectat" : "Code detected"}</h2>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{result.kind === "url" ? words.url : result.kind === "gs1" ? words.gs1 : words.id}</span>
      </div>
      <p className="break-all rounded-lg bg-secondary p-3 font-mono text-sm">{result.raw}</p>
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{words.external}</p>
      {externalUrl && <a className="btn btn-accent inline-flex" href={externalUrl} target="_blank" rel="noopener noreferrer">{words.source} ↗</a>}
      {result.kind === "url" && !externalUrl && <p className="text-sm text-muted-foreground">{fr ? "Lien non ouvert : adresse non sécurisée ou invalide." : ro ? "Linkul nu a fost deschis: adresă nesigură sau invalidă." : "Link not opened: unsafe or invalid address."}</p>}
      {accountRole && <form onSubmit={(event) => void saveTraceability(event)} className="grid gap-3 rounded-xl border border-border p-4">
        <h3 className="font-semibold">{fr ? "Enregistrer cette référence" : ro ? "Salvați această referință" : "Save this reference"}</h3>
        <p className="text-xs text-muted-foreground">{accountRole === "fisher" ? (fr ? "Associez le code à l'un de vos lots." : ro ? "Asociați codul cu unul dintre loturile dvs." : "Link this code to one of your catch lots.") : (fr ? "Associez le code à une commande de votre restaurant." : ro ? "Asociați codul cu o comandă a restaurantului." : "Link this code to one of your restaurant orders.")}</p>
        <label className="grid gap-1 text-sm"><span>{accountRole === "fisher" ? (fr ? "Lot Marée" : ro ? "Lot Marée" : "Marée catch lot") : (fr ? "Commande" : ro ? "Comandă" : "Order")}</span>
          <select className="input w-full" value={selectedTarget} onChange={(event) => setSelectedTarget(event.target.value)} required>
            <option value="">{fr ? "Sélectionner" : ro ? "Selectați" : "Select"}</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm"><span>{fr ? "Fournisseur" : ro ? "Furnizor" : "Supplier"}</span><input className="input w-full" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} maxLength={160} required /></label>
          <label className="grid gap-1 text-sm"><span>{fr ? "Espèce" : ro ? "Specie" : "Species"}</span><input className="input w-full" value={species} onChange={(event) => setSpecies(event.target.value)} maxLength={100} required /></label>
          <label className="grid gap-1 text-sm"><span>{fr ? "Quantité reçue (kg)" : ro ? "Cantitate primită (kg)" : "Quantity received (kg)"}</span><input className="input w-full" type="number" min="0.01" max="10000" step="0.01" value={quantityKg} onChange={(event) => setQuantityKg(event.target.value)} required /></label>
          <label className="grid gap-1 text-sm"><span>{fr ? "Date de réception" : ro ? "Data primirii" : "Received at"}</span><input className="input w-full" type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required /></label>
        </div>
        <label className="grid gap-1 text-sm"><span>{fr ? "Note (facultatif)" : ro ? "Notă (opțional)" : "Note (optional)"}</span><textarea className="input min-h-16 w-full" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label>
        <button type="submit" className="btn btn-accent w-full sm:w-auto" disabled={saving || !targets.length}>{saving ? (fr ? "Enregistrement…" : ro ? "Se salvează…" : "Saving…") : (fr ? "Enregistrer dans la traçabilité" : ro ? "Salvați în trasabilitate" : "Save traceability record")}</button>
      </form>}
      {traceError && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{traceError}</p>}
      {traceNotice && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{traceNotice}</p>}
      {records.length > 0 && <div className="rounded-xl border border-border p-4">
        <h3 className="font-semibold">{fr ? "Historique récent" : ro ? "Istoric recent" : "Recent history"}</h3>
        <ul className="mt-3 grid gap-2 text-sm">
          {records.map((record) => <li key={record.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0">
            <span>{record.species} · {record.supplier_name} · {Number(record.quantity_kg).toFixed(2)} kg</span>
            <span className="text-muted-foreground">{new Date(record.received_at).toLocaleString()}</span>
          </li>)}
        </ul>
      </div>}
      <div className="rounded-xl border border-dashed border-border p-4">
        <p className="font-semibold">{words.association}</p>
        <p className="mt-1 text-sm text-muted-foreground">{fr ? "Le QR est une référence externe, pas une certification de légalité, de fraîcheur ou de sécurité sanitaire. Les enregistrements sauvegardés sont append-only." : ro ? "Codul QR este o referință externă, nu o certificare a legalității, prospețimii sau siguranței sanitare. Înregistrările salvate nu pot fi modificate." : "A QR code is an external reference, not proof of legality, freshness or food safety. Saved records are append-only."}</p>
      </div>
    </section>}
  </div>;
}
