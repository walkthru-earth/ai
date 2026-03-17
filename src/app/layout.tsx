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
  description:
    "Talk to the world's data. Explore cities, climate, terrain, and population with AI-powered maps, charts, and real-time queries.",
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH || "/ai"}/favicon.png`,
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
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
          // Polyfill crypto.randomUUID for older iOS/Android WebViews
          if(typeof crypto!=='undefined'&&!crypto.randomUUID){
            crypto.randomUUID=function(){
              var b=new Uint8Array(16);crypto.getRandomValues(b);
              b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
              var h=Array.prototype.map.call(b,function(v){return('0'+v.toString(16)).slice(-2)}).join('');
              return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
            };
          }
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
