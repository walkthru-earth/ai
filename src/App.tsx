import React, { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Chat from "@/app/chat/page";
import ExplorePage from "@/app/explore/page";
import InteractablesPage from "@/app/interactables/page";
import Home from "@/app/page";
import { Analytics } from "@/components/analytics";
import { useThemeEffect } from "@/lib/use-theme-effect";

const StyleEditorPage = React.lazy(() => import("@/app/style-editor/page"));

export function App() {
  useThemeEffect();

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/interactables" element={<InteractablesPage />} />
        <Route
          path="/style-editor"
          element={
            <Suspense fallback={<div className="h-screen w-full bg-background" />}>
              <StyleEditorPage />
            </Suspense>
          }
        />
      </Routes>
      <Analytics />
    </>
  );
}
