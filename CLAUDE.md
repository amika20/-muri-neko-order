# Muri Neko — Cat Cafe Ordering System

ระบบสั่งเครื่องดื่มและเบเกอรี่ของคาเฟ่แมว "Muri Neko"
Stack: Next.js (App Router, **JavaScript ไม่ใช่ TypeScript**) + Supabase, deploy บน Vercel

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Supabase client: `lib/supabaseClient.js` (`import { supabase } from '@/lib/supabaseClient'` หรือ relative path)

## Next.js version note (สำคัญ)
โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง **`params` ของ Dynamic Route เป็น Promise**
ต้อง unwrap ด้วย `use()` จาก React เสมอ เช่น

```js
'use client';
import { use } from 'react';

export default function Page({ params }) {
  const { table } = use(params);
  // ...
}
```

## Pages
- `/` — หน้าแรก (ใช้ทดสอบว่า deploy สำเร็จ) ลิงก์ไป `/generate-qr` และ `/bar`
- `/generate-qr` — (ขั้นตอนถัดไป)
- `/bar` — (ขั้นตอนถัดไป)
- หน้าสั่งของลูกค้า — (ขั้นตอนถัดไป, ใช้ Dynamic Route)

## Database schema (มีอยู่แล้วใน Supabase — ห้ามสร้างซ้ำ ใช้อ้างอิงเท่านั้น)

### sessions
`id`, `table_number`, `guest_count`, `status`, `created_at`

### menu_categories
`id`, `name`, `sort_order`

### menu_items
`id`, `category_id`, `name`, `has_options`, `price_hot`, `price_iced`, `price_frappe`

- `has_options = true` → เครื่องดื่มที่ราคาต่างกันตามรูปแบบ (ร้อน/เย็น/ปั่น)
  ช่องราคาไหนเป็น `NULL` = ไม่มีขายแบบนั้น
- `has_options = false` → เมนูราคาเดียว (เช่น เบเกอรี่)
  ให้ใช้ค่าจาก `price_hot` เป็นราคาเดียวของเมนูนั้น

### orders
`id`, `session_id`, `table_number`, `items` (jsonb)

`items` เป็น jsonb ที่แต่ละรายการมี:
`name`, `quantity`, `price`, `options`, `status`, `created_at`


