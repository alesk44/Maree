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
    association: fr ? "Associer au lot Marée" : ro ? "Asociază la lotul Marée" : "Link to a Marée catch",
    unsupported: fr ? "Ce navigateur ne prend pas en charge la lecture QR par caméra. Utilisez une photo ou collez le contenu." : ro ? "Browserul nu acceptă scanarea QR cu camera. Folosiți o fotografie sau lipiți conținutul." : "This browser does not support camera QR scanning. Use a photo or paste the code.",
  };
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [catches, setCatches] = useState<Array<{ id: string; species?: string | null; zone?: string | null }>>([]);
  const [catchId, setCatchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  useEffect(() => {
    let alive = true;
    const loadAccess = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!alive || !auth.user) return;
      setUserId(auth.user.id);
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!alive || !profile?.role) return;
      setRole(profile.role);
      if (profile.role === "fisher") {
        const { data } = await supabase.from("catches").select("id,species,zone").eq("fisher_id", auth.user.id);
        if (alive) setCatches(data ?? []);
      } else if (profile.role === "restaurant") {
        const { data: orders } = await supabase.from("orders").select("catch_id").eq("restaurant_id", auth.user.id);
        const ids = [...new Set((orders ?? []).map((o: { catch_id: string | null }) => o.catch_id).filter((id): id is string => Boolean(id)))];
        if (ids.length) {
          const { data } = await supabase.from("catches").select("id,species,zone").in("id", ids);
          if (alive) setCatches(data ?? []);
        }
      }
    };
    void loadAccess();
    return () => { alive = false; };
  }, []);

  const saveScan = async () => {
    if (!result || !catchId || !userId || (role !== "fisher" && role !== "restaurant")) {
      setSaveMessage(fr ? "Connectez-vous et choisissez un lot autorisé." : "Sign in and choose an accessible catch.");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    const codeType = result.kind === "url" ? "https_url" : result.kind;
    const sourceUrl = result.kind === "url" ? safeExternalUrl(result.raw) : null;
    const { error: codeError } = await supabase.from("catch_traceability_codes").insert({
      catch_id: catchId, raw_code: result.raw, code_type: codeType, source_url: sourceUrl,
      source_label: "QR scan", verification_status: "unverified", scanned_by: userId,
    });
    if (codeError) {
      setSaveMessage(codeError.message);
      setSaving(false);
      return;
    }
    const { error: eventError } = await supabase.from("catch_traceability_events").insert({
      catch_id: catchId, event_type: "external_code_scanned", actor_id: userId,
      note: "External traceability code scanned", metadata: { code_type: codeType },
    });
    setSaveMessage(eventError
      ? (fr ? "Code enregistré, mais l'événement n'a pas été ajouté. Contactez l'administrateur." : "Code saved, but event logging failed. Contact an administrator.")
      : (fr ? "Code enregistré sur le lot. Il reste non vérifié jusqu'à validation." : "Code saved to catch. It remains unverified until reviewed."));
    setSaving(false);
  };

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
  let externalUrl: string | null = null;
  if (result?.kind === "url") {
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
      <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
        <p className="font-semibold">{words.association}</p>
        {!userId && <p className="text-sm text-muted-foreground">{fr ? "Connectez-vous pour associer un code à un lot." : "Sign in to link this code to a catch."}</p>}
        {userId && role !== "fisher" && role !== "restaurant" && <p className="text-sm text-muted-foreground">{fr ? "Seuls les pêcheurs et restaurants peuvent associer un code." : "Only fishers and restaurants can link a code."}</p>}
        {userId && (role === "fisher" || role === "restaurant") && <>
          <label className="block text-sm" htmlFor="catch-select">{fr ? "Lot de poisson" : "Catch"}</label>
          <select id="catch-select" className="input w-full" value={catchId} onChange={(e) => setCatchId(e.target.value)}>
            <option value="">{fr ? "Choisir un lot…" : "Choose a catch…"}</option>
            {catches.map((item) => <option key={item.id} value={item.id}>{[item.species, item.zone].filter(Boolean).join(" — ") || item.id.slice(0, 8)}</option>)}
          </select>
          <button type="button" className="btn btn-accent" disabled={!catchId || saving} onClick={() => void saveScan()}>{saving ? (fr ? "Enregistrement…" : "Saving…") : (fr ? "Enregistrer sur ce lot" : "Save to this catch")}</button>
        </>}
        {saveMessage && <p role="status" className="text-sm">{saveMessage}</p>}
      </div>
    </section>}
  </div>;
}
