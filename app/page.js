import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', margin: 0 }}>🐱 Muri Neko</h1>
      <p style={{ margin: 0, color: '#666' }}>Cat Cafe Ordering System</p>
      <nav style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/generate-qr">/generate-qr</Link>
        <Link href="/bar">/bar</Link>
      </nav>
    </main>
  );
}
