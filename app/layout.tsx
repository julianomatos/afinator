import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Afinador",
  description: "Afine seu violão em tempo real.",
  title: "Afinador de Violão",
};

export const viewport: Viewport = {
  themeColor: "#09090B",
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
