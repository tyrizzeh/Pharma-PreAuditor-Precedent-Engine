import "./globals.css";

export const metadata = {
  title: "The FDA Whisperer",
  description:
    "Your AI regulatory intelligence assistant — chat in real time, attach documents, and get critical analysis on FDA approval likelihood and clinical development.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
