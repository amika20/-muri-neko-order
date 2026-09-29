'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ACTIVE = ['received', 'preparing'];
const WAIT_ALERT_MINUTES = 10;

const c = {
  bg: '#FFF0E4',
  card: '#FFFFFF',
  ink: '#4A2C2A',
  soft: '#7A5A4E',
  honey: '#F0A030',
  line: '#C9A28F',
  prepBg: '#FFE7A6',
  prepLine: '#E8931A',
  danger: '#C62828',
  ok: '#2E7D4F',
};

const css = `
  .mn-btn { cursor: pointer; transition: transform 0.08s ease; }
  .mn-btn:active:not(:disabled) { transform: scale(0.97); }
  .mn-btn:focus-visible { outline: 4px solid #2F5BEA; outline-offset: 2px; }
  @keyframes mn-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(240, 160, 48, 0); }
    50% { box-shadow: 0 0 0 12px rgba(240, 160, 48, 0.5); }
  }
  .mn-fresh { animation: mn-pulse 1.2s ease-in-out 5; }
  @media (prefers-reduced-motion: reduce) {
    .mn-btn { transition: none; }
    .mn-fresh { animation: none; outline: 5px solid #F0A030; }
  }
`;

function sortOrders(list) {
  return [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function parseItems(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v : [];
}

function timeText(iso) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function CatFace({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
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

export default function BarPage() {
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [conn, setConn] = useState('connecting'); // connecting | online | offline
  const [now, setNow] = useState(null);
  const [fresh, setFresh] = useState(() => new Set());
  const [undo, setUndo] = useState(null); // { order }
  const [notice, setNotice] = useState('');
  const undoTimer = useRef(null);
  const noticeTimer = useRef(null);

  const showNotice = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 5000);
  }, []);

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('id, session_id, table_number, items, status, created_at')
      .in('status', ACTIVE)
      .order('created_at', { ascending: true });
    if (error) {
      showNotice(`โหลดออเดอร์ไม่สำเร็จ: ${error.message}`);
      return;
    }
    setOrders(data || []);
    setLoaded(true);
  }, [showNotice]);

  const upsertOrder = useCallback((row) => {
    setOrders((prev) => {
      const rest = prev.filter((o) => o.id !== row.id);
      return ACTIVE.includes(row.status) ? sortOrders([...rest, row]) : rest;
    });
  }, []);

  const markFresh = useCallback((id) => {
    setFresh((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 8000);
  }, []);

  // โหลดครั้งแรก + subscribe Realtime (INSERT / UPDATE ของตาราง orders)
  useEffect(() => {
    const channel = supabase
      .channel('bar-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        upsertOrder(payload.new);
        if (ACTIVE.includes(payload.new.status)) markFresh(payload.new.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        upsertOrder(payload.new);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConn('online');
          loadOrders(); // ดึงใหม่ทุกครั้งที่เชื่อมต่อได้ กันออเดอร์ที่พลาดไปตอนหลุด
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConn('offline');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders, upsertOrder, markFresh]);

  // ดึงซ้ำทุก 60 วินาทีเป็นตาข่ายสำรอง + นาฬิกา/เวลารอ อัปเดตทุก 30 วินาที
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const refetch = setInterval(loadOrders, 60000);
    return () => {
      clearInterval(tick);
      clearInterval(refetch);
    };
  }, [loadOrders]);

  // กันจอดับระหว่างเปิดทิ้งไว้ (ถ้าเบราว์เซอร์รองรับ)
  useEffect(() => {
    let lock = null;
    async function request() {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
      } catch {
        // ไม่รองรับหรือถูกปฏิเสธ ข้ามได้
      }
    }
    request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) lock.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(undoTimer.current);
      clearTimeout(noticeTimer.current);
    };
  }, []);

  async function handleStart(order) {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'preparing' } : o)));
    const { error } = await supabase
      .from('orders')
      .update({ status: 'preparing' })
      .eq('id', order.id)
      .eq('status', 'received');
    if (error) {
      showNotice(`เริ่มทำไม่สำเร็จ: ${error.message}`);
      loadOrders();
    }
  }

  async function handleServed(order) {
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    setUndo({ order });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);

    const { error } = await supabase.from('orders').update({ status: 'served' }).eq('id', order.id);
    if (error) {
      setUndo(null);
      upsertOrder(order);
      showNotice(`อัปเดตไม่สำเร็จ ออเดอร์โต๊ะ ${order.table_number} ถูกนำกลับมาแล้ว: ${error.message}`);
    }
  }

  async function handleUndo() {
    if (!undo) return;
    const order = undo.order;
    clearTimeout(undoTimer.current);
    setUndo(null);
    upsertOrder(order);
    const { error } = await supabase.from('orders').update({ status: order.status }).eq('id', order.id);
    if (error) {
      showNotice(`เลิกทำไม่สำเร็จ: ${error.message}`);
      loadOrders();
    }
  }

  const waitingCount = orders.filter((o) => o.status === 'received').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;

  const connLabel =
    conn === 'online' ? 'เชื่อมต่อแล้ว' : conn === 'offline' ? 'หลุดการเชื่อมต่อ กำลังเชื่อมใหม่...' : 'กำลังเชื่อมต่อ...';
  const connColor = conn === 'online' ? c.ok : conn === 'offline' ? c.danger : c.soft;

  return (
    <main style={s.page}>
      <style>{css}</style>

      <header style={s.header}>
        <div style={s.brand}>
          <CatFace size={56} />
          <div>
            <div style={s.brandName}>Muri Neko · บาร์</div>
            <div style={s.counts}>
              รอทำ <strong>{waitingCount}</strong> · กำลังทำ <strong>{preparingCount}</strong>
            </div>
          </div>
        </div>
        <div style={s.status}>
          {now !== null && (
            <div style={s.clock}>{new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
          )}
          <div style={{ ...s.conn, color: connColor }}>
            <span style={{ ...s.dot, background: connColor }} aria-hidden="true" />
            {connLabel}
          </div>
        </div>
      </header>

      {!loaded ? (
        <p style={s.empty}>กำลังโหลดออเดอร์...</p>
      ) : orders.length === 0 ? (
        <div style={s.emptyWrap}>
          <CatFace size={96} />
          <p style={s.empty}>ไม่มีออเดอร์ค้างอยู่ตอนนี้</p>
        </div>
      ) : (
        <section style={s.grid}>
          {orders.map((order) => {
            const preparing = order.status === 'preparing';
            const items = parseItems(order.items);
            const minutes =
              now === null ? 0 : Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60000));
            const late = minutes >= WAIT_ALERT_MINUTES;
            return (
              <article
                key={order.id}
                className={fresh.has(order.id) ? 'mn-fresh' : undefined}
                style={preparing ? s.cardPrep : s.card}
              >
                <div style={s.cardHead}>
                  <div style={s.tableNo}>โต๊ะ {order.table_number}</div>
                  {preparing && <span style={s.chip}>กำลังทำ</span>}
                </div>
                <div style={s.meta}>
                  สั่งเมื่อ {timeText(order.created_at)} ·{' '}
                  <span style={late ? s.late : undefined}>รอ {minutes} นาที</span>
                </div>

                <ul style={s.itemList}>
                  {items.map((it, i) => (
                    <li key={i} style={s.itemRow}>
                      {it.name} × {it.quantity}
                      {it.options ? ` — ${it.options}` : ''}
                    </li>
                  ))}
                </ul>

                <div style={s.actions}>
                  {!preparing && (
                    <button type="button" className="mn-btn" style={s.startBtn} onClick={() => handleStart(order)}>
                      เริ่มทำ
                    </button>
                  )}
                  <button type="button" className="mn-btn" style={s.servedBtn} onClick={() => handleServed(order)}>
                    เสิร์ฟแล้ว
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {notice && (
        <div role="alert" style={s.notice}>
          {notice}
        </div>
      )}

      {undo && (
        <div role="status" style={s.undoBar}>
          <span style={s.undoText}>เสิร์ฟโต๊ะ {undo.order.table_number} แล้ว</span>
          <button type="button" className="mn-btn" style={s.undoBtn} onClick={handleUndo}>
            เลิกทำ
          </button>
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
    padding: '16px 20px 120px',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 14 },
  brandName: { fontSize: 34, fontWeight: 800, lineHeight: 1.1 },
  counts: { fontSize: 24, color: c.soft },
  status: { textAlign: 'right' },
  clock: { fontSize: 44, fontWeight: 800, lineHeight: 1 },
  conn: { fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  dot: { width: 12, height: 12, borderRadius: '50%', display: 'inline-block' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 18,
    alignItems: 'start',
  },
  card: {
    background: c.card,
    border: `4px solid ${c.line}`,
    borderRadius: 24,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardPrep: {
    background: c.prepBg,
    border: `4px solid ${c.prepLine}`,
    borderRadius: 24,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tableNo: { fontSize: 60, fontWeight: 800, lineHeight: 1.05 },
  chip: {
    fontSize: 22,
    fontWeight: 800,
    background: c.prepLine,
    color: '#FFFFFF',
    padding: '4px 14px',
    borderRadius: 999,
  },
  meta: { fontSize: 22, color: c.soft },
  late: { color: c.danger, fontWeight: 800 },
  itemList: { listStyle: 'none', margin: '4px 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  itemRow: {
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.3,
    paddingBottom: 8,
    borderBottom: `2px dashed ${c.line}`,
  },
  actions: { display: 'flex', gap: 12, marginTop: 6 },
  startBtn: {
    flex: 1,
    fontSize: 28,
    fontWeight: 800,
    minHeight: 80,
    borderRadius: 18,
    border: 'none',
    background: c.honey,
    color: c.ink,
    fontFamily: 'inherit',
  },
  servedBtn: {
    flex: 1,
    fontSize: 28,
    fontWeight: 800,
    minHeight: 80,
    borderRadius: 18,
    border: 'none',
    background: c.ok,
    color: '#FFFFFF',
    fontFamily: 'inherit',
  },
  emptyWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 80 },
  empty: { fontSize: 32, fontWeight: 700, color: c.soft, textAlign: 'center' },
  notice: {
    position: 'fixed',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 60,
    background: c.danger,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 700,
    padding: '12px 24px',
    borderRadius: 16,
    maxWidth: 'calc(100% - 32px)',
    textAlign: 'center',
  },
  undoBar: {
    position: 'fixed',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 60,
    background: c.ink,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px 12px 24px',
    borderRadius: 20,
    boxShadow: '0 6px 20px rgba(74, 44, 42, 0.35)',
  },
  undoText: { fontSize: 24, fontWeight: 700 },
  undoBtn: {
    fontSize: 24,
    fontWeight: 800,
    minHeight: 56,
    padding: '0 24px',
    borderRadius: 14,
    border: 'none',
    background: c.honey,
    color: c.ink,
    fontFamily: 'inherit',
  },
};
