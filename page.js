'use client';

import { use, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const MAX_LINES = 10;
const MAX_QTY = 5;

const c = {
  bg: '#FFF0E4',
  card: '#FFFFFF',
  ink: '#4A2C2A',
  soft: '#8A6A5E',
  honey: '#F0A030',
  honeyDark: '#9A5A00',
  honeySoft: '#FFF6E5',
  line: '#EBCFC0',
  danger: '#C62828',
  ok: '#2E7D4F',
};

const css = `
  .mn-btn { cursor: pointer; transition: transform 0.08s ease; }
  .mn-btn:active:not(:disabled) { transform: scale(0.97); }
  .mn-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .mn-btn:focus-visible {
    outline: 3px solid #2F5BEA;
    outline-offset: 2px;
  }
  .mn-tabs { scrollbar-width: none; }
  .mn-tabs::-webkit-scrollbar { display: none; }
  @media (prefers-reduced-motion: reduce) {
    .mn-btn { transition: none; }
  }
`;

const OPTIONS = [
  { key: 'price_hot', label: 'ร้อน' },
  { key: 'price_iced', label: 'เย็น' },
  { key: 'price_frappe', label: 'ปั่น' },
];

function hasPrice(v) {
  return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
}

// รูปแบบที่ขายได้ของเมนูนั้น: เครื่องดื่มได้เฉพาะช่องราคาที่ไม่เป็น NULL, เมนูราคาเดียวใช้ price_hot
function getChoices(item) {
  if (item.has_options) {
    return OPTIONS.filter((o) => hasPrice(item[o.key])).map((o) => ({
      label: o.label,
      price: Number(item[o.key]),
    }));
  }
  return hasPrice(item.price_hot) ? [{ label: '', price: Number(item.price_hot) }] : [];
}

function fmt(n) {
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

function CatFace({ size = 44 }) {
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

export default function OrderPage({ params }) {
  // params เป็น Promise ใน Next.js เวอร์ชันล่าสุด ต้อง unwrap ด้วย use() เสมอ
  const { tableNumber } = use(params);

  const [phase, setPhase] = useState('loading'); // loading | notOpen | error | ordering | thanks
  const [loadError, setLoadError] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [sel, setSel] = useState({}); // { [itemId]: { option, qty } }
  const [cart, setCart] = useState([]); // [{ key, name, options, price, quantity }]
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { text, tone }
  const noticeTimer = useRef(null);

  const [billOpen, setBillOpen] = useState(false);
  const [billLines, setBillLines] = useState([]);
  const [billTotal, setBillTotal] = useState(0);
  const [billError, setBillError] = useState('');
  const [paidTotal, setPaidTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const t = Number(tableNumber);
      if (!Number.isInteger(t) || t < 1) {
        setPhase('notOpen');
        return;
      }
      try {
        const { data: sess, error: sessErr } = await supabase
          .from('sessions')
          .select('id')
          .eq('table_number', t)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1);
        if (sessErr) throw sessErr;
        if (cancelled) return;
        if (!sess || sess.length === 0) {
          setPhase('notOpen');
          return;
        }

        const [catRes, itemRes] = await Promise.all([
          supabase.from('menu_categories').select('id, name, sort_order').order('sort_order', { ascending: true }),
          supabase
            .from('menu_items')
            .select('id, category_id, name, has_options, price_hot, price_iced, price_frappe')
            .order('id', { ascending: true }),
        ]);
        if (catRes.error) throw catRes.error;
        if (itemRes.error) throw itemRes.error;
        if (cancelled) return;

        setSessionId(sess[0].id);
        setCategories(catRes.data || []);
        setItems(itemRes.data || []);
        setActiveCat(catRes.data && catRes.data.length > 0 ? catRes.data[0].id : null);
        setPhase('ordering');
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
        setPhase('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tableNumber]);

  useEffect(() => {
    return () => clearTimeout(noticeTimer.current);
  }, []);

  function showNotice(text, tone) {
    setNotice({ text, tone });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }

  function getSel(itemId) {
    return sel[itemId] || { option: null, qty: 1 };
  }

  function setOption(itemId, option) {
    setSel((prev) => ({ ...prev, [itemId]: { ...getSel(itemId), option } }));
  }

  function changeQty(itemId, delta) {
    const cur = getSel(itemId);
    const qty = Math.min(MAX_QTY, Math.max(1, cur.qty + delta));
    setSel((prev) => ({ ...prev, [itemId]: { ...cur, qty } }));
  }

  function addToCart(item) {
    const choices = getChoices(item);
    const st = getSel(item.id);
    const choice = item.has_options ? choices.find((ch) => ch.label === st.option) : choices[0];
    if (!choice) return;

    const key = `${item.id}|${choice.label}`;
    const idx = cart.findIndex((l) => l.key === key);
    if (idx === -1 && cart.length >= MAX_LINES) {
      showNotice(`ตะกร้าเต็ม ${MAX_LINES} รายการ กรุณาส่งออเดอร์ก่อนเพิ่มเมนูใหม่`, 'warn');
      return;
    }

    const next =
      idx >= 0
        ? cart.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + st.qty } : l))
        : [...cart, { key, name: item.name, options: choice.label, price: choice.price, quantity: st.qty }];
    setCart(next);
    setSel((prev) => ({ ...prev, [item.id]: { ...st, qty: 1 } }));
  }

  function changeLine(key, delta) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);

  async function handleSend() {
    if (busy || cart.length === 0) return;
    setBusy(true);
    try {
      // กันสั่งเข้าโต๊ะที่พนักงานปิดไปแล้ว
      const { data: cur, error: curErr } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', sessionId)
        .maybeSingle();
      if (curErr) throw curErr;
      if (!cur || cur.status !== 'open') {
        setPhase('notOpen');
        return;
      }

      const { error: insErr } = await supabase.from('orders').insert({
        session_id: sessionId,
        table_number: Number(tableNumber),
        items: cart.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          price: l.price,
          options: l.options,
        })),
        status: 'received',
      });
      if (insErr) throw insErr;

      setCart([]);
      setCartOpen(false);
      showNotice('ส่งออเดอร์แล้ว', 'ok');
    } catch {
      showNotice('ส่งออเดอร์ไม่สำเร็จ ลองกดส่งอีกครั้ง', 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function handleAskBill() {
    if (busy) return;
    setBusy(true);
    setBillError('');
    try {
      const { data, error: ordersErr } = await supabase
        .from('orders')
        .select('items')
        .eq('session_id', sessionId);
      if (ordersErr) throw ordersErr;

      const map = new Map();
      let total = 0;
      for (const order of data || []) {
        const list = Array.isArray(order.items) ? order.items : [];
        for (const it of list) {
          const price = Number(it.price) || 0;
          const qty = Number(it.quantity) || 0;
          const options = it.options || '';
          const k = `${it.name}|${options}|${price}`;
          const prev = map.get(k) || { name: it.name, options, price, quantity: 0 };
          prev.quantity += qty;
          map.set(k, prev);
          total += price * qty;
        }
      }
      setBillLines(Array.from(map.values()));
      setBillTotal(total);
      setBillOpen(true);
    } catch (err) {
      showNotice(`ดึงรายการไม่สำเร็จ: ${err.message || 'ลองใหม่อีกครั้ง'}`, 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmBill() {
    if (busy) return;
    setBusy(true);
    setBillError('');
    try {
      const { error: closeErr } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', sessionId)
        .eq('status', 'open');
      if (closeErr) throw closeErr;

      setPaidTotal(billTotal);
      setBillOpen(false);
      setCart([]);
      setCartOpen(false);
      setPhase('thanks');
    } catch (err) {
      setBillError(`ปิดโต๊ะไม่สำเร็จ: ${err.message || 'ลองใหม่อีกครั้ง'}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- หน้าเต็มจอ ----------
  if (phase === 'loading') {
    return (
      <main style={s.full}>
        <style>{css}</style>
        <CatFace size={80} />
        <p style={s.fullText}>กำลังโหลดเมนู...</p>
      </main>
    );
  }

  if (phase === 'notOpen') {
    return (
      <main style={s.full}>
        <style>{css}</style>
        <CatFace size={80} />
        <p style={s.fullText}>โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน</p>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main style={s.full}>
        <style>{css}</style>
        <CatFace size={80} />
        <p style={s.fullText}>โหลดข้อมูลไม่สำเร็จ</p>
        <p style={s.fullSub}>{loadError}</p>
        <button type="button" className="mn-btn" style={s.addBtn} onClick={() => window.location.reload()}>
          ลองใหม่
        </button>
      </main>
    );
  }

  if (phase === 'thanks') {
    return (
      <main style={s.full}>
        <style>{css}</style>
        <CatFace size={96} />
        <p style={s.fullText}>ขอบคุณที่ใช้บริการ</p>
        <p style={s.fullSub}>โต๊ะ {tableNumber} · ยอดที่ต้องชำระ</p>
        <p style={s.bigTotal}>฿{fmt(paidTotal)}</p>
      </main>
    );
  }

  // ---------- หน้าสั่ง ----------
  const visibleItems = items.filter((i) => i.category_id === activeCat);

  return (
    <main style={{ ...s.page, paddingBottom: cart.length > 0 ? 170 : 40 }}>
      <style>{css}</style>

      {notice && (
        <div
          role="status"
          style={{ ...s.notice, background: notice.tone === 'ok' ? c.ok : c.danger }}
        >
          {notice.text}
        </div>
      )}

      <header style={s.header}>
        <div style={s.headRow}>
          <div style={s.brand}>
            <CatFace size={40} />
            <div>
              <div style={s.brandName}>Muri Neko</div>
              <div style={s.brandTable}>โต๊ะ {tableNumber}</div>
            </div>
          </div>
          <button type="button" className="mn-btn" style={s.billBtn} onClick={handleAskBill} disabled={busy}>
            เรียกเก็บเงิน
          </button>
        </div>
        <nav className="mn-tabs" style={s.tabs} aria-label="หมวดหมู่เมนู">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="mn-btn"
              style={cat.id === activeCat ? s.tabOn : s.tab}
              aria-pressed={cat.id === activeCat}
              onClick={() => setActiveCat(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </nav>
      </header>

      <section style={s.list}>
        {visibleItems.length === 0 && <p style={s.empty}>ยังไม่มีเมนูในหมวดนี้</p>}

        {visibleItems.map((item) => {
          const choices = getChoices(item);
          const st = getSel(item.id);
          const needOption = item.has_options && !st.option;
          return (
            <article key={item.id} style={s.item}>
              <h3 style={s.itemName}>{item.name}</h3>

              {choices.length === 0 ? (
                <p style={s.muted}>ยังไม่มีจำหน่าย</p>
              ) : (
                <>
                  {item.has_options ? (
                    <div style={s.optRow}>
                      {choices.map((ch) => (
                        <button
                          key={ch.label}
                          type="button"
                          className="mn-btn"
                          style={st.option === ch.label ? s.optOn : s.opt}
                          aria-pressed={st.option === ch.label}
                          onClick={() => setOption(item.id, ch.label)}
                        >
                          {ch.label} ฿{fmt(ch.price)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={s.price}>฿{fmt(choices[0].price)}</p>
                  )}

                  <div style={s.buyRow}>
                    <div style={s.stepper}>
                      <button
                        type="button"
                        className="mn-btn"
                        style={s.stepBtn}
                        onClick={() => changeQty(item.id, -1)}
                        disabled={st.qty <= 1}
                        aria-label="ลดจำนวน"
                      >
                        −
                      </button>
                      <span style={s.qty}>{st.qty}</span>
                      <button
                        type="button"
                        className="mn-btn"
                        style={s.stepBtn}
                        onClick={() => changeQty(item.id, 1)}
                        disabled={st.qty >= MAX_QTY}
                        aria-label="เพิ่มจำนวน"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="mn-btn"
                      style={s.addBtn}
                      onClick={() => addToCart(item)}
                      disabled={needOption}
                    >
                      {needOption ? 'เลือกรูปแบบก่อน' : '+ เพิ่มลงตะกร้า'}
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </section>

      {cart.length > 0 && (
        <div style={s.cartWrap}>
          {cartOpen && (
            <div style={s.cartPanel}>
              {cart.map((l) => (
                <div key={l.key} style={s.cartLine}>
                  <div style={s.cartLineInfo}>
                    <div style={s.cartLineName}>
                      {l.name}
                      {l.options ? ` (${l.options})` : ''}
                    </div>
                    <div style={s.cartLinePrice}>
                      ฿{fmt(l.price)} × {l.quantity} = ฿{fmt(l.price * l.quantity)}
                    </div>
                  </div>
                  <div style={s.miniStepper}>
                    <button
                      type="button"
                      className="mn-btn"
                      style={s.miniBtn}
                      onClick={() => changeLine(l.key, -1)}
                      aria-label={`ลด ${l.name}`}
                    >
                      −
                    </button>
                    <span style={s.miniQty}>{l.quantity}</span>
                    <button
                      type="button"
                      className="mn-btn"
                      style={s.miniBtn}
                      onClick={() => changeLine(l.key, 1)}
                      aria-label={`เพิ่ม ${l.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={s.cartBar}>
            <button
              type="button"
              className="mn-btn"
              style={s.cartInfo}
              onClick={() => setCartOpen((v) => !v)}
              aria-expanded={cartOpen}
            >
              <span style={s.cartCount}>
                {cart.length}/{MAX_LINES} รายการ
              </span>
              <span style={s.cartTotal}>฿{fmt(cartTotal)}</span>
              <span style={s.cartHint}>{cartOpen ? 'ซ่อนตะกร้า' : 'ดูตะกร้า'}</span>
            </button>
            <button type="button" className="mn-btn" style={s.sendBtn} onClick={handleSend} disabled={busy}>
              {busy ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
            </button>
          </div>
        </div>
      )}

      {billOpen && (
        <div style={s.overlay}>
          <div style={s.dialog} role="dialog" aria-modal="true" aria-labelledby="bill-title">
            <h2 id="bill-title" style={s.dialogHead}>
              เรียกเก็บเงิน · โต๊ะ {tableNumber}
            </h2>
            <div style={s.dialogBody}>
              {billLines.length === 0 ? (
                <p style={s.muted}>ยังไม่ได้สั่งอะไร</p>
              ) : (
                <div style={s.billList}>
                  {billLines.map((l, i) => (
                    <div key={i} style={s.billLine}>
                      <span style={s.billName}>
                        {l.name}
                        {l.options ? ` (${l.options})` : ''}
                      </span>
                      <span style={s.billAmt}>
                        × {l.quantity} = ฿{fmt(l.price * l.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={s.billTotalRow}>
                <span>ยอดที่ต้องจ่าย</span>
                <strong style={s.billTotalNum}>฿{fmt(billTotal)}</strong>
              </div>

              {cart.length > 0 && (
                <p style={s.dialogNote}>
                  ตะกร้ามี {cart.length} รายการที่ยังไม่ได้ส่ง จะไม่รวมในยอดนี้
                </p>
              )}
              <p style={s.dialogNote}>เมื่อยืนยันแล้วจะสั่งเพิ่มไม่ได้</p>
              {billError && <p style={s.errorText}>{billError}</p>}

              <div style={s.dialogActions}>
                <button
                  type="button"
                  className="mn-btn"
                  style={s.cancelBtn}
                  onClick={() => setBillOpen(false)}
                  disabled={busy}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="mn-btn"
                  style={s.confirmBtn}
                  onClick={handleConfirmBill}
                  disabled={busy}
                >
                  {busy ? 'กำลังปิด...' : 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const font = "'Noto Sans Thai', 'Sarabun', system-ui, sans-serif";

const s = {
  page: {
    minHeight: '100vh',
    background: c.bg,
    color: c.ink,
    fontFamily: font,
    maxWidth: 520,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  full: {
    minHeight: '100vh',
    background: c.bg,
    color: c.ink,
    fontFamily: font,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  fullText: { fontSize: 30, fontWeight: 800, margin: 0, lineHeight: 1.4 },
  fullSub: { fontSize: 20, color: c.soft, margin: 0 },
  bigTotal: { fontSize: 64, fontWeight: 800, margin: 0, color: c.honeyDark },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: c.bg,
    padding: '12px 16px 8px',
    borderBottom: `2px solid ${c.line}`,
  },
  headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandName: { fontSize: 24, fontWeight: 800, lineHeight: 1.1 },
  brandTable: { fontSize: 18, color: c.soft },
  billBtn: {
    fontSize: 18,
    fontWeight: 700,
    minHeight: 48,
    padding: '0 16px',
    borderRadius: 14,
    border: `2px solid ${c.honey}`,
    background: c.honeySoft,
    color: c.honeyDark,
    fontFamily: 'inherit',
  },
  tabs: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    padding: '12px 0 4px',
  },
  tab: {
    flex: '0 0 auto',
    fontSize: 20,
    fontWeight: 700,
    minHeight: 48,
    padding: '0 20px',
    borderRadius: 24,
    border: `2px solid ${c.line}`,
    background: c.card,
    color: c.ink,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  tabOn: {
    flex: '0 0 auto',
    fontSize: 20,
    fontWeight: 800,
    minHeight: 48,
    padding: '0 20px',
    borderRadius: 24,
    border: `2px solid ${c.honey}`,
    background: c.honey,
    color: c.ink,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' },
  empty: { fontSize: 20, color: c.soft, textAlign: 'center', margin: '24px 0' },
  item: {
    background: c.card,
    border: `2px solid ${c.line}`,
    borderRadius: 22,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  itemName: { fontSize: 24, fontWeight: 800, margin: 0, lineHeight: 1.3 },
  muted: { fontSize: 18, color: c.soft, margin: 0 },
  price: { fontSize: 26, fontWeight: 800, margin: 0, color: c.honeyDark },
  optRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  opt: {
    fontSize: 20,
    fontWeight: 700,
    minHeight: 52,
    padding: '0 18px',
    borderRadius: 16,
    border: `2px solid ${c.line}`,
    background: '#FFFAF6',
    color: c.ink,
    fontFamily: 'inherit',
  },
  optOn: {
    fontSize: 20,
    fontWeight: 800,
    minHeight: 52,
    padding: '0 18px',
    borderRadius: 16,
    border: `3px solid ${c.honey}`,
    background: c.honeySoft,
    color: c.honeyDark,
    fontFamily: 'inherit',
  },
  buyRow: { display: 'flex', alignItems: 'center', gap: 10 },
  stepper: {
    display: 'flex',
    alignItems: 'center',
    border: `2px solid ${c.line}`,
    borderRadius: 16,
    background: '#FFFAF6',
  },
  stepBtn: {
    width: 48,
    height: 52,
    fontSize: 28,
    fontWeight: 700,
    border: 'none',
    background: 'transparent',
    color: c.ink,
    fontFamily: 'inherit',
  },
  qty: { minWidth: 28, textAlign: 'center', fontSize: 24, fontWeight: 800 },
  addBtn: {
    flex: 1,
    fontSize: 20,
    fontWeight: 800,
    minHeight: 56,
    borderRadius: 16,
    border: 'none',
    background: c.honey,
    color: c.ink,
    fontFamily: 'inherit',
  },
  notice: {
    position: 'fixed',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 60,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 700,
    padding: '12px 20px',
    borderRadius: 16,
    maxWidth: 'calc(100% - 32px)',
    textAlign: 'center',
  },
  cartWrap: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    maxWidth: 520,
    margin: '0 auto',
    background: c.card,
    borderTop: `3px solid ${c.honey}`,
    borderRadius: '20px 20px 0 0',
    boxShadow: '0 -6px 20px rgba(74, 44, 42, 0.15)',
  },
  cartPanel: {
    maxHeight: '45vh',
    overflowY: 'auto',
    padding: '12px 16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cartLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 10,
    borderBottom: `1px solid ${c.line}`,
  },
  cartLineInfo: { minWidth: 0 },
  cartLineName: { fontSize: 20, fontWeight: 700 },
  cartLinePrice: { fontSize: 17, color: c.soft },
  miniStepper: { display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' },
  miniBtn: {
    width: 44,
    height: 44,
    fontSize: 24,
    fontWeight: 700,
    borderRadius: 12,
    border: `2px solid ${c.line}`,
    background: '#FFFAF6',
    color: c.ink,
    fontFamily: 'inherit',
  },
  miniQty: { minWidth: 26, textAlign: 'center', fontSize: 20, fontWeight: 800 },
  cartBar: { display: 'flex', alignItems: 'stretch', gap: 10, padding: '12px 16px 16px' },
  cartInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    padding: 0,
    color: c.ink,
    fontFamily: 'inherit',
    minHeight: 56,
  },
  cartCount: { fontSize: 17, color: c.soft },
  cartTotal: { fontSize: 28, fontWeight: 800, lineHeight: 1.1 },
  cartHint: { fontSize: 15, color: c.honeyDark, textDecoration: 'underline' },
  sendBtn: {
    fontSize: 22,
    fontWeight: 800,
    padding: '0 24px',
    minHeight: 60,
    borderRadius: 18,
    border: 'none',
    background: c.honey,
    color: c.ink,
    fontFamily: 'inherit',
  },
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
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    border: `3px solid ${c.honey}`,
  },
  dialogHead: {
    background: c.honey,
    color: c.ink,
    margin: 0,
    padding: '16px 24px',
    fontSize: 24,
    fontWeight: 800,
  },
  dialogBody: { padding: 20, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' },
  billList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '38vh', overflowY: 'auto' },
  billLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    fontSize: 19,
    paddingBottom: 8,
    borderBottom: `1px solid ${c.line}`,
  },
  billName: { fontWeight: 700 },
  billAmt: { whiteSpace: 'nowrap', color: c.soft },
  billTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontSize: 22,
    fontWeight: 700,
    marginTop: 4,
  },
  billTotalNum: { fontSize: 34, color: c.honeyDark },
  dialogNote: { fontSize: 15, color: c.soft, margin: 0 },
  errorText: { fontSize: 18, color: c.danger, fontWeight: 600, margin: 0 },
  dialogActions: { display: 'flex', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    fontSize: 22,
    fontWeight: 700,
    minHeight: 58,
    borderRadius: 16,
    border: `2px solid ${c.line}`,
    background: '#FFFFFF',
    color: c.ink,
    fontFamily: 'inherit',
  },
  confirmBtn: {
    flex: 1,
    fontSize: 22,
    fontWeight: 800,
    minHeight: 58,
    borderRadius: 16,
    border: 'none',
    background: c.honey,
    color: c.ink,
    fontFamily: 'inherit',
  },
};
