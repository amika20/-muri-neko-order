export const metadata = {
  title: 'Muri Neko',
  description: 'ระบบสั่งเครื่องดื่มและเบเกอรี่ของคาเฟ่แมว Muri Neko',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
