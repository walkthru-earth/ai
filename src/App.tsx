import { Route, Routes } from "react-router-dom";
import Chat from "@/app/chat/page";
import ExplorePage from "@/app/explore/page";
import InteractablesPage from "@/app/interactables/page";
import Home from "@/app/page";
import { Analytics } from "@/components/analytics";

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/interactables" element={<InteractablesPage />} />
      </Routes>
      <Analytics />
    </>
  );
}
