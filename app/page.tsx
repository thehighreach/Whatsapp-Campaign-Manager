"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Chatbot from "./Chatbot";

type Contact = {
  id: string;
  phone: string;
  name?: string | null;
  company?: string | null;
  city?: string | null;
  opt_in: boolean;
  opted_out_at?: string | null;
};

type MessageLog = {
  id: string;
  phone: string;
  template_name?: string | null;
  status: string;
  error?: string | null;
  created_at: string;
};

export default function Home() {
  const [health, setHealth] = useState<any>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mediaId, setMediaId] = useState("");
  const [headerType, setHeaderType] = useState<"image" | "video" | "document">("image");
  const [replies, setReplies] = useState<any[]>([]);

  async function refresh() {
    try {
      const [h, c, m, r] = await Promise.all([
        fetch("/api/health").then((r) => r.ok ? r.json() : {}),
        fetch("/api/contacts").then((r) => r.ok ? r.json() : { contacts: [] }),
        fetch("/api/messages").then((r) => r.ok ? r.json() : { messages: [] }),
        fetch("/api/inbound").then((r) => r.ok ? r.json() : { replies: [] }),
      ]);
      setHealth(h);
      setContacts(c?.contacts || []);
      setMessages(m?.messages || []);
      setReplies(r?.replies || []);
    } catch (err) {
      console.error("Refresh error:", err);
    }
  }

  useEffect(() => { refresh(); }, []);

  const eligible = useMemo(() => contacts.filter((c) => c.opt_in && !c.opted_out_at), [contacts]);
  const stats = useMemo(() => ({
    contacts: contacts.length,
    optedIn: eligible.length,
    sent: messages.filter((m) => ["sent", "delivered", "read"].includes(m.status)).length,
    read: messages.filter((m) => m.status === "read").length,
    failed: messages.filter((m) => m.status === "failed").length,
  }), [contacts, eligible, messages]);

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData(event.currentTarget);
      form.set("confirmedOptIn", "true");
      const res = await fetch("/api/contacts/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: `Server HTTP ${res.status}` }));
      if (res.ok) {
        setNotice(`Imported ${data.imported ?? 0}. Rejected ${data.rejected ?? 0}.`);
      } else {
        setNotice(data.error || "CSV Import failed.");
      }
    } catch (err: any) {
      console.error("Import CSV fetch error:", err);
      setNotice(`Network Error: ${err.message || "Failed to connect to backend server. Is dev server running?"}`);
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData(event.currentTarget);
      const file = form.get("file") as File;
      if (file?.type?.startsWith("video/")) setHeaderType("video");
      else if (file?.type === "application/pdf") setHeaderType("document");
      else setHeaderType("image");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: `Server HTTP ${res.status}` }));
      if (res.ok) {
        setMediaId(data.mediaId);
        setNotice(`Media uploaded. Meta media ID: ${data.mediaId}`);
      } else setNotice(data.error || "Media upload failed.");
    } catch (err: any) {
      setNotice(`Network Error: ${err.message || "Failed to upload media."}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) return setNotice("Select at least one opted-in contact.");
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData(event.currentTarget);
      const bodyVariableFields = String(form.get("bodyVariableFields") || "")
        .split(",").map((x) => x.trim()).filter(Boolean);
      const payload: any = {
        campaignName: String(form.get("campaignName") || "").trim(),
        templateName: String(form.get("templateName") || "").trim(),
        languageCode: String(form.get("languageCode") || "").trim(),
        contactIds: selected,
        bodyVariableFields,
      };
      if (mediaId) {
        payload.headerMediaId = mediaId;
        payload.headerType = headerType;
      }
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({ error: `Server HTTP ${res.status}` }));
      if (res.ok) {
        const firstErr = data.failures?.[0]?.error ? ` (${data.failures[0].error})` : "";
        setNotice(`Campaign finished: ${data.sent} sent, ${data.failed} failed.${firstErr}`);
      } else {
        const detail = data.details?.[0] ? ` (${data.details[0].path?.join(".")}: ${data.details[0].message})` : "";
        setNotice((data.error || "Campaign send failed.") + detail);
      }
    } catch (err: any) {
      setNotice(`Network Error: ${err.message || "Failed to send campaign."}`);
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  function toggleAll() {
    if (selected.length === eligible.length) setSelected([]);
    else setSelected(eligible.map((c) => c.id));
  }

  return (
    <main>
      <header className="topbar">
        <div className="brandmark"> <img src="/logo.svg" height={32} width={32} alt="HighReach Logo" /> </div>
        <div>
          <div className="eyebrow">HIGH REACH</div>
          <h1>WhatsApp Campaign Manager</h1>
        </div>
        <div className={`status ${health?.ok ? "ok" : "warn"}`}>{health?.ok ? "Connected" : "Setup required"}</div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">OPT-IN LEAD ENGAGEMENT</div>
          <h2 style={{ whiteSpace: "nowrap" }}>Promote smarter. <span>Reach Higher.</span></h2>

        </div>
        <div className="guardrail">No scraped lists. No WhatsApp Web automation. No ban-evasion tricks.</div>
      </section>

      <section className="stats">
        <Card label="Contacts" value={stats.contacts} />
        <Card label="Opted-in" value={stats.optedIn} />
        <Card label="Sent" value={stats.sent} />
        <Card label="Read" value={stats.read} />
        <Card label="Failed" value={stats.failed} />
      </section>

      {notice && <div className="notice">{notice}</div>}

      <section className="grid two">
        <div className="panel">
          <div className="panelTitle"><span>01</span><h3>Import consented contacts</h3></div>
          <p className="muted">CSV must contain <code>phone</code> and <code>opt_in=yes</code>. Recommended: name, company, city, opt_in_source.</p>
          <form onSubmit={importCsv} className="stack">
            <input name="file" type="file" accept=".csv,text/csv" required />
            <label className="check"><input type="checkbox" required /> I confirm every imported contact has given High Reach permission to receive WhatsApp messages.</label>
            <button disabled={busy}>Import CSV</button>
          </form>
        </div>

        <div className="panel">
          <div className="panelTitle"><span>02</span><h3>Upload campaign media</h3></div>
          <p className="muted">Use media that matches the approved template header. JPG/PNG, MP4/3GP or PDF. Meta media IDs expire after 30 days — re-upload for later campaigns.</p>
          <form onSubmit={uploadMedia} className="stack">
            <input name="file" type="file" accept="image/jpeg,image/png,video/mp4,video/3gpp,application/pdf" required />
            <button disabled={busy}>Upload to WhatsApp</button>
          </form>
          {mediaId && (
            <div className="mediaId">
              <b>Media ID</b><code>{mediaId}</code><span>{headerType}</span>
              <button type="button" className="secondary" onClick={() => setMediaId("")}>Clear</button>
            </div>
          )}
        </div>
      </section>

      <section className="grid campaignGrid">
        <div className="panel contactsPanel">
          <div className="panelTitle"><span>03</span><h3>Select opted-in audience</h3></div>
          <div className="audienceTools">
            <button className="secondary" onClick={toggleAll} type="button">{selected.length === eligible.length && eligible.length ? "Clear all" : "Select all eligible"}</button>
            <b>{selected.length} selected</b>
          </div>
          <div className="contactList">
            {eligible.map((c) => (
              <label className="contact" key={c.id}>
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => setSelected((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])} />
                <div><b>{c.name || "Unnamed contact"}</b><small>{c.company || ""} {c.city ? `• ${c.city}` : ""}</small></div>
                <code>+{c.phone}</code>
              </label>
            ))}
            {!eligible.length && <p className="muted">No opted-in contacts yet. Import the sample CSV format first.</p>}
          </div>
        </div>

        <div className="panel sendPanel">
          <div className="panelTitle"><span>04</span><h3>Send approved template</h3></div>
          <form onSubmit={sendCampaign} className="stack">
            <label>Campaign name<input name="campaignName" placeholder="e.g. High Reach Services Lead Campaign" required /></label>
            <label>Approved Meta template name<input name="templateName" placeholder="e.g. high_reach_services_intro or hello_world" required /></label>
            <label>Language code<input name="languageCode" placeholder="e.g. en or en_US" required /></label>
            <label>Body variable fields<input name="bodyVariableFields" placeholder="e.g. name,company (leave blank if none)" /><small>Comma-separated contact fields matching template {"{{1}}"}, {"{{2}}"} etc. Leave empty if your template has no variables.</small></label>
            <div className="sendSummary">
              <div><span>Recipients</span><b>{selected.length}</b></div>
              <div><span>Header media</span><b>{mediaId ? headerType : "None"}</b></div>
              <div><span>Compliance</span><b>Opt-in only</b></div>
            </div>
            <button className="send" disabled={busy || !selected.length}>{busy ? "Working…" : "Send campaign"}</button>
          </form>
        </div>
      </section>

      <section className="panel logPanel">
        <div className="panelTitle"><span>05</span><h3>Recent delivery activity</h3></div>
        <div className="tableWrap">
          <table><thead><tr><th>Phone</th><th>Template</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>{messages.slice(0, 30).map((m) => <tr key={m.id}><td>+{m.phone}</td><td>{m.template_name || "—"}</td><td><span className={`pill ${m.status}`}>{m.status}</span></td><td>{new Date(m.created_at).toLocaleString()}</td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="panel logPanel">
        <div className="panelTitle"><span>06</span><h3>Replies from leads</h3></div>
        <div className="tableWrap">
          <table><thead><tr><th>Phone</th><th>Name</th><th>Reply</th><th>Time</th></tr></thead>
            <tbody>
              {replies.slice(0, 30).map((r) => <tr key={r.id}><td>+{r.phone}</td><td>{r.profile_name || "—"}</td><td>{r.text || `[${r.type}]`}</td><td>{new Date(r.received_at).toLocaleString()}</td></tr>)}
              {!replies.length && <tr><td colSpan={4} className="muted">No replies yet. Replies such as INTERESTED appear here once the webhook is live.</td></tr>}
            </tbody></table>
        </div>
      </section>

      <footer>High Reach • Official WhatsApp Business Platform workflow • Reply STOP = automatic opt-out</footer>

      {/* ── HighReach Service Chatbot ── */}
      <Chatbot />
    </main>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="statCard"><span>{label}</span><strong>{value}</strong></div>;
}
