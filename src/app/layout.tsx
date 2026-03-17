import { DM_Mono } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { quicksand } from "./fonts";
import "./globals.css";

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata = {
  title: "walkthru.earth — AI Urban Intelligence",
  description: "Talk to the world's data. Explore cities, climate, terrain, and population with AI + DuckDB.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme');
              var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (t === 'light') document.documentElement.classList.remove('dark');
              else if (t === 'system' && !prefersDark) document.documentElement.classList.remove('dark');
              else if (!t && !prefersDark) document.documentElement.classList.remove('dark');
            } catch(e){}
          })();
        `,
          }}
        />
      </head>
      <body className={`${quicksand.variable} ${dmMono.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
