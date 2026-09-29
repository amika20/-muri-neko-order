'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const c = {
  bg: '#FFF0E4',
  card: '#FFFFFF',
  ink: '#4A2C2A',
  soft: '#8A6A5E',
  honey: '#F0A030',
  honeyDark: '#9A5A00',
  blush: '#F7C9C0',
  line: '#EBCFC0',
  danger: '#C62828',
  dangerBg: '#FFECE8',
  dangerLine: '#E57373',
};

const css = `
  .mn-btn { cursor: pointer; transition: transform 0.08s ease; }
  .mn-btn:active:not(:disabled) { transform: scale(0.98); }
  .mn-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .mn-btn:focus-visible, .mn-input:focus-visible {
    outline: 3px solid #2F5BEA;
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .mn-btn { transition: none; }
  }
`;

function CatFace() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <path d="M12 30 L14 8 L30 18 Z" fill="#F0A030" />
      <path d="M60 30 L58 8 L42 18 Z" fill="#F0A030" />
      <path d="M16 24 L17 14 L25 19 Z" fill="#F7C9C0" />
      <path d="M56 24 L55 14 L47 19 Z" fill="#F7C9C0" />
      <ellipse cx="36" cy="40" rx="27" ry="24" fill="#F0A030" />
      <ellipse cx="26" cy="38" rx="3.2" ry="4.2" fill="#4A2C2A" />
      <ellipse cx="46" cy="38" rx="3.2" ry="4.2" fill="#4A2C2A" />
      <path d="M33 46 L39 46 L36 50 Z" fill="#E88A8A" />
      <path
        d="M36 50 Q33 55 29 53 M36 50 Q39 55 43 53"
        stroke="#4A2C2A"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M14 44 L24 46 M14 51 L24 50 M58 44 L48 46 M58 51 L48 50"
        stroke="#4A2C2A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function GenerateQrPage() {
  const [table, setTable] = useState('');
  const [guests, setGuests] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [openSession, setOpenSession] = useState(null); // session เดิมที่ยังเปิดอยู่
  const [confirmInfo, setConfirmInfo] = useState(null); // { total, minutes }
  const [result, setResult] = useState(null); // { table, guests, url }
  const [copied, setCopied] = useState(false);

  function readForm() {
    const t = Number(table);
    const g = Number(guests);
    if (!table.trim() || !Number.isInteger(t) || t < 1) {
      setError('กรอกเลขโต๊ะเป็นตัวเลขตั้งแต่ 1 ขึ้นไป');
      return null;
    }
    if (!guests.trim() || !Number.isInteger(g) || g < 1) {
      setError('จำนวนลูกค้าต้องเป็นตัวเลขอย่างน้อย 1 คน');
      return null;
    }
    return { t, g };
  }

  async function handleOpen(e) {
    e.preventDefault();
    setError('');
    const form = readForm();
    if (!form) return;

    setBusy(true);
    try {
      const { data: existing, error: findErr } = await supabase
        .from('sessions')
        .select('id, table_number, guest_count, created_at')
        .eq('table_number', form.t)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);
      if (findErr) throw findErr;

      if (existing && existing.length > 0) {
        setOpenSession(existing[0]);
        return;
      }

      const { error: insertErr } = await supabase
        .from('sessions')
        .insert({ table_number: form.t, guest_count: form.g, status: 'open' });
      if (insertErr) throw insertErr;

      setResult({
        table: form.t,
        guests: form.g,
        url: `${window.location.origin}/order/${form.t}`,
      });
    } catch (err) {
      setError(`เปิดโต๊ะไม่สำเร็จ: ${err.message || 'ลองใหม่อีกครั้ง'}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAskClose() {
    setError('');
    setBusy(true);
    try {
      const { data, error: ordersErr } = await supabase
        .from('orders')
        .select('items')
        .eq('session_id', openSession.id);
      if (ordersErr) throw ordersErr;

      let total = 0;
      for (const order of data || []) {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const item of items) {
          total += (Number(item.price) || 0) * (Number(item.quantity) || 0);
        }
      }

      const minutes = Math.max(
        0,
        Math.floor((Date.now() - new Date(openSession.created_at).getTime()) / 60000)
      );

      setDialogError('');
      setConfirmInfo({ total, minutes });
    } catch (err) {
      setError(`ดึงยอดออเดอร์ไม่สำเร็จ: ${err.message || 'ลองใหม่อีกครั้ง'}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmClose() {
    setDialogError('');
    setBusy(true);
    try {
      // เช็คซ้ำว่ายังเป็น 'open' อยู่ กันการกดซ้ำหรือมีคนปิดไปก่อนแล้ว
      const { error: closeErr } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', openSession.id)
        .eq('status', 'open');
      if (closeErr) throw closeErr;

      setConfirmInfo(null);
      setOpenSession(null);
    } catch (err) {
      setDialogError(`ปิดโต๊ะไม่สำเร็จ: ${err.message || 'ลองใหม่อีกครั้ง'}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      const el = document.createElement('textarea');
      el.value = result.url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleNew() {
    setTable('');
    setGuests('');
    setResult(null);
    setError('');
    setCopied(false);
  }

  const qrSrc = result
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.url)}`
    : '';

  return (
    <main style={s.page}>
      <style>{css}</style>
      <div style={s.wrap}>
        <header style={s.header}>
          <CatFace />
          <h1 style={s.title}>Muri Neko</h1>
          <p style={s.subtitle}>เปิดโต๊ะให้ลูกค้า</p>
        </header>

        {result ? (
          <section style={s.card}>
            <img
              src={qrSrc}
              alt={`QR Code สำหรับโต๊ะ ${result.table}`}
              width={300}
              height={300}
              style={s.qr}
            />
            <p style={s.summary}>
              โต๊ะ {result.table} · ลูกค้า {result.guests} คน
            </p>
            <div style={s.urlRow}>
              <span style={s.urlText}>{result.url}</span>
              <button type="button" className="mn-btn" style={s.smallBtn} onClick={handleCopy}>
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
              </button>
            </div>
            <button type="button" className="mn-btn" style={s.primaryBtn} onClick={handleNew}>
              เปิดโต๊ะใหม่
            </button>
          </section>
        ) : (
          <>
            {openSession && (
              <section style={s.warn} role="alert">
                <p style={s.warnTitle}>โต๊ะนี้ยังมีลูกค้าใช้งานอยู่ กรุณาปิดออเดอร์เดิมก่อน</p>
                <button
                  type="button"
                  className="mn-btn"
                  style={s.dangerBtn}
                  onClick={handleAskClose}
                  disabled={busy}
                >
                  {busy ? 'กำลังคำนวณยอด...' : 'ปิดออเดอร์เดิม'}
                </button>
                <button
                  type="button"
                  className="mn-btn"
                  style={s.linkBtn}
                  onClick={() => setOpenSession(null)}
                  disabled={busy}
                >
                  กลับไปแก้ฟอร์ม
                </button>
              </section>
            )}

            <form style={s.card} onSubmit={handleOpen} noValidate>
              <label style={s.label} htmlFor="table">
                เลขโต๊ะ
              </label>
              <input
                id="table"
                className="mn-input"
                style={s.input}
                type="number"
                inputMode="numeric"
                min="1"
                value={table}
                onChange={(e) => setTable(e.target.value)}
                disabled={!!openSession}
                placeholder="เช่น 7"
              />

              <label style={s.label} htmlFor="guests">
                จำนวนลูกค้า
              </label>
              <input
                id="guests"
                className="mn-input"
                style={s.input}
                type="number"
                inputMode="numeric"
                min="1"
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                disabled={!!openSession}
                placeholder="เช่น 2"
              />

              {error && (
                <p style={s.error} role="alert">
                  {error}
                </p>
              )}

              {!openSession && (
                <button type="submit" className="mn-btn" style={s.primaryBtn} disabled={busy}>
                  {busy ? 'กำลังเปิดโต๊ะ...' : 'เปิดโต๊ะ'}
                </button>
              )}
            </form>
          </>
        )}
      </div>

      {confirmInfo && openSession && (
        <div style={s.overlay}>
          <div style={s.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title" style={s.dialogHead}>
              ปิดโต๊ะเดิม
            </h2>
            <div style={s.dialogBody}>
              <p style={s.dialogTable}>โต๊ะ {openSession.table_number}</p>
              <p style={s.dialogLine}>ลูกค้า {openSession.guest_count} คน</p>
              <p style={s.dialogLine}>เปิดมาแล้ว {confirmInfo.minutes} นาที</p>
              <p style={s.dialogLine}>
                ยอดที่สั่งไปแล้ว{' '}
                <strong>
                  {confirmInfo.total.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท
                </strong>
              </p>
              <p style={s.dialogNote}>ตรวจสอบว่าลูกค้าชำระเงินเรียบร้อยแล้วก่อนปิดโต๊ะ</p>
              {dialogError && (
                <p style={s.error} role="alert">
                  {dialogError}
                </p>
              )}
              <div style={s.dialogActions}>
                <button
                  type="button"
                  className="mn-btn"
                  style={s.cancelBtn}
                  onClick={() => setConfirmInfo(null)}
                  disabled={busy}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="mn-btn"
                  style={s.dangerBtn}
                  onClick={handleConfirmClose}
                  disabled={busy}
                >
                  {busy ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: c.bg,
    color: c.ink,
    fontFamily: "'Noto Sans Thai', 'Sarabun', system-ui, sans-serif",
    padding: '24px 16px 48px',
    boxSizing: 'border-box',
  },
  wrap: { maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  header: { textAlign: 'center' },
  title: { fontSize: 36, margin: '4px 0 0', fontWeight: 800, letterSpacing: 0.5 },
  subtitle: { fontSize: 22, margin: '4px 0 0', color: c.soft },
  card: {
    background: c.card,
    border: `2px solid ${c.line}`,
    borderRadius: 24,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: { fontSize: 22, fontWeight: 700 },
  input: {
    fontSize: 32,
    fontWeight: 700,
    padding: '12px 16px',
    borderRadius: 16,
    border: `2px solid ${c.line}`,
    background: '#FFFAF6',
    color: c.ink,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: 800,
    minHeight: 64,
    borderRadius: 18,
    border: 'none',
    background: c.honey,
    color: c.ink,
    fontFamily: 'inherit',
  },
  smallBtn: {
    fontSize: 18,
    fontWeight: 700,
    minHeight: 44,
    padding: '0 16px',
    borderRadius: 12,
    border: `2px solid ${c.honey}`,
    background: '#FFF6E5',
    color: c.honeyDark,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  error: { fontSize: 20, color: c.danger, margin: 0, fontWeight: 600 },
  warn: {
    background: c.dangerBg,
    border: `3px solid ${c.dangerLine}`,
    borderRadius: 24,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  warnTitle: { fontSize: 24, fontWeight: 800, margin: 0, color: c.danger, lineHeight: 1.4 },
  dangerBtn: {
    fontSize: 24,
    fontWeight: 800,
    minHeight: 60,
    borderRadius: 16,
    border: 'none',
    background: c.danger,
    color: '#FFFFFF',
    fontFamily: 'inherit',
    flex: 1,
  },
  cancelBtn: {
    fontSize: 24,
    fontWeight: 700,
    minHeight: 60,
    borderRadius: 16,
    border: `2px solid ${c.line}`,
    background: '#FFFFFF',
    color: c.ink,
    fontFamily: 'inherit',
    flex: 1,
  },
  linkBtn: {
    fontSize: 18,
    minHeight: 44,
    background: 'transparent',
    border: 'none',
    color: c.soft,
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  qr: {
    alignSelf: 'center',
    width: 300,
    maxWidth: '100%',
    height: 'auto',
    border: `2px solid ${c.line}`,
    borderRadius: 16,
    padding: 8,
    background: '#FFFFFF',
    boxSizing: 'border-box',
  },
  summary: { fontSize: 26, fontWeight: 800, textAlign: 'center', margin: '4px 0 0' },
  urlRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  urlText: { fontSize: 18, color: c.soft, wordBreak: 'break-all', textAlign: 'center' },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(74, 44, 42, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 50,
  },
  dialog: {
    background: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 440,
    overflow: 'hidden',
    border: `3px solid ${c.danger}`,
  },
  dialogHead: {
    background: c.danger,
    color: '#FFFFFF',
    margin: 0,
    padding: '16px 24px',
    fontSize: 26,
    fontWeight: 800,
  },
  dialogBody: { padding: 24, display: 'flex', flexDirection: 'column', gap: 8 },
  dialogTable: { fontSize: 34, fontWeight: 800, margin: 0 },
  dialogLine: { fontSize: 22, margin: 0 },
  dialogNote: { fontSize: 15, color: c.soft, margin: '8px 0 0' },
  dialogActions: { display: 'flex', gap: 12, marginTop: 12 },
};
